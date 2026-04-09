import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  ChangeEvent,
  ClipboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import './ContractWordEditor.css';

export type ContractPlaceholder = {
  id: string;
  label: string;
  token: string;
};

type Props = {
  value: string;
  onChange: (nextHtml: string) => void;
  placeholders: ContractPlaceholder[];
  disabled?: boolean;
};

type Padding = { top: number; right: number; bottom: number; left: number };
type Settings = {
  backgroundImageData: string;
  backgroundOpacity: number;
  backgroundSize: 'cover' | 'contain';
  pagePadding: Padding;
};

type Overlay = { top: number; left: number; width: number; height: number };
type ResizeHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type HoverGrid = { rows: number; cols: number };
type CommandState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  justifyLeft: boolean;
  justifyCenter: boolean;
  justifyRight: boolean;
  justifyFull: boolean;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
};

const PAGE_BREAK = '<div data-contract-page-break="true" style="page-break-after: always;"></div>';
const PAGE_BREAK_REGEX = /<div[^>]*(data-contract-page-break\s*=\s*["']true["'][^>]*|page-break-after\s*:\s*always[^>]*)><\/div>/gi;
const A4_W = 794;
const A4_H = 1123;
const MAX_EDITOR_PAGES = 120;
const MAX_APPEND_EVENTS_PER_WINDOW = 12;
const APPEND_WINDOW_MS = 1200;
const MM_TO_PX = 3.7795275591;
const PAD_MIN = 5;
const PAD_MAX = 40;
const PAD_DEFAULT: Padding = { top: 20, right: 15, bottom: 20, left: 15 };
const MAX_BG_BYTES = 1024 * 1024;
const BG_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_MIME_TYPE = 'application/pdf';
const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};
const EMPTY_COMMAND_STATE: CommandState = {
  bold: false,
  italic: false,
  underline: false,
  justifyLeft: false,
  justifyCenter: false,
  justifyRight: false,
  justifyFull: false,
  insertUnorderedList: false,
  insertOrderedList: false,
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const clampPad = (v: number) => clamp(Number.isFinite(v) ? v : PAD_MIN, PAD_MIN, PAD_MAX);
const clampOpacity = (v: number) => clamp(Number.isFinite(v) ? v : 0.22, 0, 1);
const normalizeMeaningfulText = (value: string) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .trim();

const hasMeaningfulHtml = (html: string) => {
  const raw = String(html || '').trim();
  if (!raw) return false;

  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<div id="content-root">${raw}</div>`, 'text/html');
  const root = doc.getElementById('content-root');
  if (!root) return false;

  const text = normalizeMeaningfulText(root.textContent || '');
  if (text) return true;

  return Boolean(
    root.querySelector(
      'img,table,svg,canvas,iframe,video,audio,object,embed,input,textarea,select',
    ),
  );
};

const isIgnorableNodeForPagination = (node: ChildNode) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeMeaningfulText(node.textContent || '') === '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return true;
  const element = node as HTMLElement;
  if (element.tagName === 'BR' && element.attributes.length === 0) return true;
  if (
    !hasMeaningfulHtml(element.innerHTML || '') &&
    element.querySelector(
      'img,table,svg,canvas,iframe,video,audio,object,embed,input,textarea,select',
    ) === null
  ) {
    return true;
  }
  return false;
};

const countMovableNodes = (container: HTMLElement) =>
  Array.from(container.childNodes).filter(
    (node) => !isIgnorableNodeForPagination(node),
  ).length;

const getLastMovableNode = (container: HTMLElement): ChildNode | null => {
  let current: ChildNode | null = container.lastChild;
  while (current) {
    if (isIgnorableNodeForPagination(current)) {
      const previous = current.previousSibling;
      container.removeChild(current);
      current = previous;
      continue;
    }
    return current;
  }
  return null;
};

type TailMovableCandidate = {
  node: ChildNode;
  parent: HTMLElement;
};

const getTailMovableCandidate = (
  container: HTMLElement,
): TailMovableCandidate | null => {
  let parent: HTMLElement = container;
  let node: ChildNode | null = getLastMovableNode(parent);

  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    if (countMovableNodes(parent) !== 1) break;
    const innerTail = getLastMovableNode(element);
    if (!innerTail) break;
    parent = element;
    node = innerTail;
  }

  if (!node) return null;
  return { node, parent };
};

const encodeMeta = (v: string) => encodeURIComponent(String(v || ''));
const decodeMeta = (v: string) => {
  if (!v) return '';
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

const defaultSettings = (): Settings => ({
  backgroundImageData: '',
  backgroundOpacity: 0.22,
  backgroundSize: 'contain',
  pagePadding: { ...PAD_DEFAULT },
});

const estimateDataUrlSize = (dataUrl: string) => {
  const payload = String(dataUrl || '').split(',')[1] || '';
  return payload ? Math.floor((payload.length * 3) / 4) : 0;
};

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });

const isPdfFile = (file: File) =>
  file.type === PDF_MIME_TYPE || /\.pdf$/i.test(String(file.name || ''));

const isDocxFile = (file: File) =>
  file.type === DOCX_MIME_TYPE || /\.docx$/i.test(String(file.name || ''));

const detectDocxImageMime = (path: string) => {
  const normalized = String(path || '').toLowerCase();
  for (const [ext, mime] of Object.entries(DOCX_IMAGE_MIME_BY_EXT)) {
    if (normalized.endsWith(ext)) return mime;
  }
  return null;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const chunk = bytes.subarray(start, start + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
};

async function renderDocxBackground(file: File) {
  const { unzipSync } = await import('fflate');
  let archive: Record<string, Uint8Array>;

  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('DOCX_INVALID');
  }

  let selectedBytes: Uint8Array | null = null;
  let selectedMime: string | null = null;

  for (const [path, bytes] of Object.entries(archive)) {
    const normalized = path.toLowerCase();
    if (!normalized.startsWith('word/media/')) continue;
    if (!bytes || bytes.length === 0) continue;
    const mime = detectDocxImageMime(normalized);
    if (!mime) continue;

    if (!selectedBytes || bytes.length > selectedBytes.length) {
      selectedBytes = bytes;
      selectedMime = mime;
    }
  }

  if (!selectedBytes || !selectedMime) {
    throw new Error('DOCX_BACKGROUND_NOT_FOUND');
  }

  return `data:${selectedMime};base64,${bytesToBase64(selectedBytes)}`;
}

const loadImage = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem.'));
    img.src = dataUrl;
  });

async function compressBackgroundDataUrl(dataUrl: string) {
  const img = await loadImage(dataUrl);
  let quality = 0.9;
  let scale = 1;

  for (let i = 0; i < 14; i += 1) {
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Falha ao processar imagem.');
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL('image/jpeg', quality);
    if (estimateDataUrlSize(out) <= MAX_BG_BYTES) return out;
    if (quality > 0.45) quality -= 0.08;
    else scale -= 0.08;
  }

  return null;
}

async function compressBackground(file: File) {
  const raw = await readAsDataUrl(file);
  return compressBackgroundDataUrl(raw);
}

async function renderPdfFirstPage(file: File) {
  const [{ getDocument, GlobalWorkerOptions }, workerSrcModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);

  GlobalWorkerOptions.workerSrc = workerSrcModule.default;

  const loadingTask = getDocument({ data: await file.arrayBuffer() });
  const pdfDocument = await loadingTask.promise;

  try {
    const page = await pdfDocument.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(1400, Math.max(A4_W, Math.round(baseViewport.width)));
    const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Falha ao processar PDF.');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    pdfDocument.cleanup();
    await pdfDocument.destroy();
  }
}

function sanitizeInlineStyle(styleText = '') {
  const allowed = new Set([
    'font-weight',
    'font-style',
    'text-decoration',
    'text-align',
    'color',
    'background-color',
    'font-size',
    'margin-left',
    'margin-right',
  ]);
  return String(styleText)
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((declaration) => {
      const [rawProp, ...rest] = declaration.split(':');
      const prop = String(rawProp || '').trim().toLowerCase();
      const value = rest.join(':').trim();
      if (!allowed.has(prop) || !value) return null;
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}
function sanitizePasteHtml(rawHtml = '') {
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(String(rawHtml || ''), 'text/html');
  const allowed = new Set([
    'A', 'B', 'BR', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'I', 'LI', 'OL', 'P', 'SPAN',
    'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL',
  ]);

  const sanitizeNode = (node: ParentNode) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.parentNode?.removeChild(child);
        return;
      }

      const el = child as HTMLElement;
      const tag = el.tagName?.toUpperCase() || '';
      if (!allowed.has(tag)) {
        const parent = el.parentNode;
        if (!parent) return;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        return;
      }

      Array.from(el.attributes).forEach((attr) => {
        const name = String(attr.name || '').toLowerCase();
        if (name === 'style') {
          const safe = sanitizeInlineStyle(attr.value || '');
          if (safe) el.setAttribute('style', safe);
          else el.removeAttribute('style');
          return;
        }
        if (tag === 'A' && name === 'href') {
          const href = String(attr.value || '').trim();
          if (/^(https?:|mailto:|#)/i.test(href)) {
            el.setAttribute('href', href);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          } else {
            el.removeAttribute('href');
          }
          return;
        }
        if ((tag === 'TD' || tag === 'TH') && (name === 'colspan' || name === 'rowspan')) return;
        el.removeAttribute(attr.name);
      });

      sanitizeNode(el);
    });
  };

  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}

function plainTextToHtml(text = '') {
  const escape = (v: string) =>
    String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [];
      }
      return;
    }
    current.push(trimmed);
  });
  if (current.length > 0) paragraphs.push(current.join(' '));
  if (paragraphs.length === 0) return '';
  return paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join('');
}

const isLegacyPageContainer = (element: HTMLElement) => {
  const normalizedStyle = String(element.getAttribute('style') || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  return (
    normalizedStyle.includes('max-width:794px') &&
    normalizedStyle.includes('min-height:1123px')
  );
};

function normalizeLegacyPageHtml(pageHtml: string) {
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(
    `<div id="legacy-page-root">${String(pageHtml || '')}</div>`,
    'text/html',
  );
  const root = doc.getElementById('legacy-page-root');
  if (!root) return String(pageHtml || '');

  const legacyContainers = Array.from(
    root.querySelectorAll<HTMLElement>('div[style]'),
  ).filter((element) => isLegacyPageContainer(element));

  legacyContainers.forEach((container) => {
    const parent = container.parentNode;
    if (!parent) return;
    while (container.firstChild) parent.insertBefore(container.firstChild, container);
    parent.removeChild(container);
  });

  return root.innerHTML;
}

function parseValue(value: string) {
  const settings = defaultSettings();
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<div id="root">${String(value || '')}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return { pages: [''], settings };

  const settingsNode = root.querySelector<HTMLElement>('[data-contract-editor-settings="true"]');
  if (settingsNode) {
    settings.backgroundImageData = decodeMeta(settingsNode.dataset.backgroundImageData || '');
    settings.backgroundOpacity = clampOpacity(Number(settingsNode.dataset.backgroundOpacity || 0.22));
    settings.backgroundSize = settingsNode.dataset.backgroundSize === 'contain' ? 'contain' : 'cover';
    settings.pagePadding = {
      top: clampPad(Number(settingsNode.dataset.paddingTopMm || PAD_DEFAULT.top)),
      right: clampPad(Number(settingsNode.dataset.paddingRightMm || PAD_DEFAULT.right)),
      bottom: clampPad(Number(settingsNode.dataset.paddingBottomMm || PAD_DEFAULT.bottom)),
      left: clampPad(Number(settingsNode.dataset.paddingLeftMm || PAD_DEFAULT.left)),
    };
    settingsNode.remove();
  }

  const wrapper = root.querySelector<HTMLElement>('[data-contract-document-wrapper="true"]');
  let source = wrapper ? String(wrapper.innerHTML || '') : String(root.innerHTML || '');
  if (!wrapper) {
    const legacySection = root.querySelector<HTMLElement>('section');
    if (legacySection?.querySelector('[data-contract-page-break="true"]')) {
      source = String(legacySection.innerHTML || '');
    }
  }
  const normalized = source.replace(PAGE_BREAK_REGEX, '<!--CONTRACT_PAGE_BREAK-->');
  const pages = normalized
    .split('<!--CONTRACT_PAGE_BREAK-->')
    .map((pageHtml) => normalizeLegacyPageHtml(pageHtml));
  while (pages.length > 1 && !hasMeaningfulHtml(pages[pages.length - 1])) pages.pop();
  return { pages: pages.length > 0 ? pages : [''], settings };
}

function buildWrapperStyle(settings: Settings) {
  const overlay = 1 - clampOpacity(settings.backgroundOpacity);
  const p = settings.pagePadding;
  const styles = [
    'position: relative',
    'box-sizing: border-box',
    `max-width: ${A4_W}px`,
    `min-height: ${A4_H}px`,
    'width: 100%',
    'margin: 0 auto',
    `padding-top: ${(p.top * MM_TO_PX).toFixed(2)}px`,
    `padding-right: ${(p.right * MM_TO_PX).toFixed(2)}px`,
    `padding-bottom: ${(p.bottom * MM_TO_PX).toFixed(2)}px`,
    `padding-left: ${(p.left * MM_TO_PX).toFixed(2)}px`,
    'background-color: #fff',
    'background-repeat: no-repeat',
    'background-position: center top',
    `background-size: ${settings.backgroundSize}`,
  ];
  if (settings.backgroundImageData) {
    styles.push(
      `background-image: linear-gradient(rgba(255,255,255,${overlay}), rgba(255,255,255,${overlay})), url(${settings.backgroundImageData})`,
    );
  }
  return styles.join('; ');
}

function serializeValue(pages: string[], settings: Settings) {
  const list = [...pages];
  while (list.length > 1 && !hasMeaningfulHtml(list[list.length - 1])) list.pop();
  const body = list.join(PAGE_BREAK);
  const meta =
    `<div data-contract-editor-settings="true" style="display:none"` +
    ` data-background-image-data="${encodeMeta(settings.backgroundImageData)}"` +
    ` data-background-opacity="${clampOpacity(settings.backgroundOpacity)}"` +
    ` data-background-size="${settings.backgroundSize}"` +
    ` data-padding-top-mm="${clampPad(settings.pagePadding.top)}"` +
    ` data-padding-right-mm="${clampPad(settings.pagePadding.right)}"` +
    ` data-padding-bottom-mm="${clampPad(settings.pagePadding.bottom)}"` +
    ` data-padding-left-mm="${clampPad(settings.pagePadding.left)}"></div>`;
  const wrapper = `<div data-contract-document-wrapper="true" style="${buildWrapperStyle(settings)}">${body}</div>`;
  return `${meta}${wrapper}`;
}

export function ContractWordEditor({ value, onChange, placeholders, disabled = false }: Props) {
  const [pageCount, setPageCount] = useState(1);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pagePreviewHtml, setPagePreviewHtml] = useState<string[]>(['']);
  const [isEditorEmpty, setIsEditorEmpty] = useState(true);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tablePickerHover, setTablePickerHover] = useState<HoverGrid>({ rows: 0, cols: 0 });
  const [commandState, setCommandState] = useState<CommandState>(EMPTY_COMMAND_STATE);

  const [backgroundImageData, setBackgroundImageData] = useState('');
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.22);
  const [backgroundSize, setBackgroundSize] = useState<'cover' | 'contain'>('contain');
  const [pagePadding, setPagePadding] = useState<Padding>({ ...PAD_DEFAULT });

  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [imageOverlay, setImageOverlay] = useState<Overlay | null>(null);
  const [isResizingImage, setIsResizingImage] = useState(false);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const tablePickerRef = useRef<HTMLDivElement | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement | null>(null);
  const pendingLoadedPagesRef = useRef<string[] | null>(null);
  const pendingPageAppendFromRef = useRef<number | null>(null);
  const pendingPaginationFromRef = useRef<number | null>(null);
  const paginationRafRef = useRef<number | null>(null);
  const appendPagePendingRef = useRef(false);
  const appendWindowRef = useRef<{ startedAt: number; count: number }>({
    startedAt: 0,
    count: 0,
  });
  const lastEmittedRef = useRef(String(value || ''));
  const resizeStateRef = useRef<{
    handle: ResizeHandle;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    aspectRatio: number;
  } | null>(null);

  const settings = useMemo<Settings>(() => ({
    backgroundImageData,
    backgroundOpacity,
    backgroundSize,
    pagePadding,
  }), [backgroundImageData, backgroundOpacity, backgroundSize, pagePadding]);

  const pageStyle = useMemo<CSSProperties>(() => {
    const p = pagePadding;
    const style: CSSProperties = {
      width: `${A4_W}px`,
      height: `${A4_H}px`,
      minHeight: `${A4_H}px`,
      maxHeight: `${A4_H}px`,
      boxSizing: 'border-box',
      paddingTop: `${(p.top * MM_TO_PX).toFixed(2)}px`,
      paddingRight: `${(p.right * MM_TO_PX).toFixed(2)}px`,
      paddingBottom: `${(p.bottom * MM_TO_PX).toFixed(2)}px`,
      paddingLeft: `${(p.left * MM_TO_PX).toFixed(2)}px`,
      backgroundColor: '#fff',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center top',
      backgroundSize,
    };
    if (backgroundImageData) {
      const overlay = 1 - clampOpacity(backgroundOpacity);
      style.backgroundImage = `linear-gradient(rgba(255,255,255,${overlay}), rgba(255,255,255,${overlay})), url(${backgroundImageData})`;
    }
    return style;
  }, [backgroundImageData, backgroundOpacity, backgroundSize, pagePadding]);

  const getActiveEditorNode = useCallback(() => {
    const idx = Math.max(0, Math.min(activePageIndex, pageCount - 1));
    return pageRefs.current[idx] || pageRefs.current[0] || null;
  }, [activePageIndex, pageCount]);

  const syncCommandState = useCallback(() => {
    const wrapper = editorWrapperRef.current;
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode ?? null;
    const isInsideEditor =
      Boolean(wrapper) &&
      Boolean(anchorNode) &&
      Boolean(wrapper?.contains(anchorNode));

    if (!isInsideEditor) {
      setCommandState((prev) => {
        if (Object.values(prev).every((value) => !value)) return prev;
        return EMPTY_COMMAND_STATE;
      });
      return;
    }

    const read = (command: keyof CommandState) => {
      try {
        return Boolean(document.queryCommandState(command));
      } catch {
        return false;
      }
    };

    const next: CommandState = {
      bold: read('bold'),
      italic: read('italic'),
      underline: read('underline'),
      justifyLeft: read('justifyLeft'),
      justifyCenter: read('justifyCenter'),
      justifyRight: read('justifyRight'),
      justifyFull: read('justifyFull'),
      insertUnorderedList: read('insertUnorderedList'),
      insertOrderedList: read('insertOrderedList'),
    };

    setCommandState((prev) => {
      const unchanged = (Object.keys(next) as Array<keyof CommandState>).every(
        (key) => prev[key] === next[key],
      );
      return unchanged ? prev : next;
    });
  }, []);

  const getBodyHtml = useCallback(() => {
    const nodes = pageRefs.current.slice(0, pageCount).filter(Boolean) as HTMLDivElement[];
    if (nodes.length === 0) return '';
    const parts = nodes.map((node) => String(node.innerHTML || '').trim());
    while (parts.length > 1 && !hasMeaningfulHtml(parts[parts.length - 1])) parts.pop();
    return parts.join(PAGE_BREAK);
  }, [pageCount]);

  const emitChange = useCallback(() => {
    const html = getBodyHtml();
    const pages = html ? html.replace(PAGE_BREAK_REGEX, '<!--BREAK-->').split('<!--BREAK-->') : [''];
    const nextValue = serializeValue(pages, settings);
    if (nextValue === lastEmittedRef.current) return;
    lastEmittedRef.current = nextValue;
    onChange(nextValue);
  }, [getBodyHtml, onChange, settings]);

  const updateEmpty = useCallback(() => {
    const nodes = pageRefs.current.slice(0, pageCount).filter(Boolean) as HTMLDivElement[];
    if (nodes.length === 0) {
      setIsEditorEmpty(true);
      return;
    }
    const hasContent = nodes.some((node) => {
      const text = String(node.textContent || '').trim();
      return Boolean(text) || hasMeaningfulHtml(node.innerHTML || '');
    });
    setIsEditorEmpty(!hasContent);
  }, [pageCount]);

  const refreshPreviews = useCallback(() => {
    const next = Array.from({ length: pageCount }, (_, index) => {
      const page = pageRefs.current[index];
      return page ? String(page.innerHTML || '') : '';
    });
    setPagePreviewHtml((prev) => {
      if (prev.length === next.length && prev.every((value, index) => value === next[index])) return prev;
      return next;
    });
  }, [pageCount]);

  const updateOverlay = useCallback(() => {
    if (!selectedImage || !editorWrapperRef.current) {
      setImageOverlay(null);
      return;
    }
    const wrapperRect = editorWrapperRef.current.getBoundingClientRect();
    const imageRect = selectedImage.getBoundingClientRect();
    setImageOverlay({
      top: imageRect.top - wrapperRect.top,
      left: imageRect.left - wrapperRect.left,
      width: imageRect.width,
      height: imageRect.height,
    });
  }, [selectedImage]);

  const clearSelectedImage = useCallback(() => {
    if (selectedImage) selectedImage.removeAttribute('data-selected');
    setSelectedImage(null);
    setImageOverlay(null);
  }, [selectedImage]);

  const selectImage = useCallback((img: HTMLImageElement | null) => {
    if (!img) {
      clearSelectedImage();
      return;
    }
    if (selectedImage && selectedImage !== img) selectedImage.removeAttribute('data-selected');
    img.setAttribute('data-selected', 'true');
    setSelectedImage(img);
  }, [clearSelectedImage, selectedImage]);

  const applyImageStyles = useCallback((styles: Record<string, string | null>) => {
    if (!selectedImage) return;
    Object.entries(styles).forEach(([key, value]) => {
      if (value === null) selectedImage.style.removeProperty(key);
      else selectedImage.style.setProperty(key, value);
    });
    updateOverlay();
    emitChange();
  }, [emitChange, selectedImage, updateOverlay]);

  const runPagination = useCallback((startIndex = 0) => {
    const mountedPages = pageRefs.current.slice(0, pageCount);
    const allPagesMounted =
      mountedPages.length === pageCount && mountedPages.every((node) => Boolean(node));
    if (!allPagesMounted) return;

    if (appendPagePendingRef.current) {
      appendPagePendingRef.current = false;
    }

    const pages = mountedPages as HTMLDivElement[];
    if (pages.length === 0) {
      updateEmpty();
      refreshPreviews();
      return;
    }

    const first = Math.max(0, Math.min(startIndex, pages.length - 1));
    let appendNew = false;
    let appendFrom: number | null = null;

    for (let i = first; i < pages.length; i += 1) {
      const current = pages[i];
      const next = pages[i + 1] || null;
      let guard = 0;
      while (current.scrollHeight > current.clientHeight + 1 && guard < 600) {
        guard += 1;
        const beforeOverflow = current.scrollHeight - current.clientHeight;
        const candidate = getTailMovableCandidate(current);
        if (!candidate) break;
        const { node: nodeToMove, parent: sourceParent } = candidate;
        if (!next) {
          const movableNodeCount = countMovableNodes(current);
          if (movableNodeCount <= 1) break;
          if (!hasMeaningfulHtml(current.innerHTML || '')) break;
          if (beforeOverflow <= 2.5) break;

          sourceParent.removeChild(nodeToMove);
          const probeOverflow = current.scrollHeight - current.clientHeight;
          sourceParent.appendChild(nodeToMove);
          if (probeOverflow >= beforeOverflow - 0.5) {
            console.warn(
              '[ContractWordEditor] Nova página bloqueada (sem redução real de overflow).',
              {
                index: i,
                beforeOverflow,
                probeOverflow,
                movableNodeCount,
                pageCount,
              },
            );
            break;
          }

          const now = Date.now();
          if (
            now - appendWindowRef.current.startedAt > APPEND_WINDOW_MS ||
            appendWindowRef.current.startedAt === 0
          ) {
            appendWindowRef.current.startedAt = now;
            appendWindowRef.current.count = 0;
          }
          appendWindowRef.current.count += 1;
          if (appendWindowRef.current.count > MAX_APPEND_EVENTS_PER_WINDOW) {
            console.warn(
              '[ContractWordEditor] Paginação automática desacelerada para evitar loop.',
              {
                index: i,
                pageCount,
                beforeOverflow,
                windowCount: appendWindowRef.current.count,
              },
            );
            break;
          }

          appendNew = true;
          appendFrom = i;
          break;
        }
        const nextWasEmpty = !hasMeaningfulHtml(next.innerHTML || '');
        sourceParent.removeChild(nodeToMove);
        next.insertBefore(nodeToMove, next.firstChild);

        // Evita loop infinito quando o último bloco é indivisível e maior que a página.
        if (
          nextWasEmpty &&
          !hasMeaningfulHtml(current.innerHTML || '') &&
          next.childNodes.length === 1 &&
          next.scrollHeight > next.clientHeight + 1
        ) {
          sourceParent.appendChild(nodeToMove);
          break;
        }

        const afterOverflow = current.scrollHeight - current.clientHeight;
        if (afterOverflow >= beforeOverflow - 0.5) {
          sourceParent.appendChild(nodeToMove);
          break;
        }
      }
      if (appendNew) break;
    }

    if (appendNew) {
      if (pageCount >= MAX_EDITOR_PAGES) {
        console.warn(
          '[ContractWordEditor] Limite de páginas atingido durante paginação automática.',
          { pageCount, startIndex, appendFrom },
        );
        updateEmpty();
        refreshPreviews();
        emitChange();
        return;
      }
      appendPagePendingRef.current = true;
      pendingPageAppendFromRef.current = appendFrom ?? Math.max(0, pageCount - 1);
      setPageCount((current) => current + 1);
      refreshPreviews();
      return;
    }

    let lastNonEmpty = -1;
    pages.forEach((page, index) => {
      const text = String(page.textContent || '').trim();
      if (text || hasMeaningfulHtml(page.innerHTML || '')) lastNonEmpty = index;
    });
    const desired = Math.max(1, lastNonEmpty + 1);
    if (desired < pageCount) setPageCount(desired);

    updateEmpty();
    refreshPreviews();
    emitChange();
  }, [emitChange, pageCount, refreshPreviews, updateEmpty]);

  const requestPagination = useCallback((startIndex = 0) => {
    const safeStart = Math.max(0, startIndex);
    if (pendingPaginationFromRef.current === null) pendingPaginationFromRef.current = safeStart;
    else pendingPaginationFromRef.current = Math.min(pendingPaginationFromRef.current, safeStart);

    if (paginationRafRef.current) return;
    paginationRafRef.current = window.requestAnimationFrame(() => {
      const from = pendingPaginationFromRef.current ?? 0;
      pendingPaginationFromRef.current = null;
      paginationRafRef.current = null;
      runPagination(from);
    });
  }, [runPagination]);

  const applyPendingPages = useCallback(() => {
    const pending = pendingLoadedPagesRef.current;
    if (!pending) return false;
    const expected = Math.max(1, pending.length);
    const nodes = pageRefs.current.slice(0, expected);
    if (nodes.length < expected || nodes.some((node) => !node)) return false;
    nodes.forEach((node, index) => {
      if (!node) return;
      node.innerHTML = pending[index] || '';
    });
    pendingLoadedPagesRef.current = null;
    updateEmpty();
    refreshPreviews();
    requestPagination(0);
    return true;
  }, [refreshPreviews, requestPagination, updateEmpty]);

  const loadFromValue = useCallback((rawValue: string) => {
    const parsed = parseValue(rawValue);
    pendingLoadedPagesRef.current = parsed.pages;
    setPageCount(Math.max(1, Math.min(MAX_EDITOR_PAGES, parsed.pages.length)));
    appendPagePendingRef.current = false;
    setActivePageIndex(0);
    setIsEditorEmpty(!hasMeaningfulHtml(parsed.pages.join('')));
    setBackgroundImageData(parsed.settings.backgroundImageData);
    setBackgroundOpacity(clampOpacity(parsed.settings.backgroundOpacity));
    setBackgroundSize(parsed.settings.backgroundSize);
    setPagePadding(parsed.settings.pagePadding);
    setTablePickerOpen(false);
    setTablePickerHover({ rows: 0, cols: 0 });
    clearSelectedImage();
    lastEmittedRef.current = String(rawValue || '');
  }, [clearSelectedImage]);

  useEffect(() => {
    loadFromValue(String(value || ''));
  }, [loadFromValue]);

  useEffect(() => {
    const next = String(value || '');
    if (next === lastEmittedRef.current) return;
    loadFromValue(next);
  }, [loadFromValue, value]);

  useEffect(() => {
    applyPendingPages();
  }, [applyPendingPages, pageCount]);

  useEffect(() => {
    if (activePageIndex <= pageCount - 1) return;
    setActivePageIndex(Math.max(0, pageCount - 1));
  }, [activePageIndex, pageCount]);

  useEffect(() => {
    pageRefs.current = pageRefs.current.slice(0, pageCount);
  }, [pageCount]);

  useEffect(() => {
    if (pendingPageAppendFromRef.current === null) return;
    const from = pendingPageAppendFromRef.current;
    pendingPageAppendFromRef.current = null;
    requestPagination(from);
  }, [pageCount, requestPagination]);

  useEffect(
    () => () => {
      if (paginationRafRef.current) {
        window.cancelAnimationFrame(paginationRafRef.current);
        paginationRafRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return undefined;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('.contract-word-editor-image-toolbar') ||
        target.closest('.contract-word-editor-image-resize-overlay')
      ) {
        return;
      }
      if (target.tagName === 'IMG') selectImage(target as HTMLImageElement);
      else clearSelectedImage();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        const execute = (cmd: string, value?: string) => {
          const active = getActiveEditorNode();
          if (active) active.focus();
          document.execCommand(cmd, false, value);
          window.setTimeout(() => {
            requestPagination(activePageIndex);
            syncCommandState();
          }, 0);
        };

        if (key === 'b') {
          event.preventDefault();
          execute('bold');
          return;
        }
        if (key === 'i') {
          event.preventDefault();
          execute('italic');
          return;
        }
        if (key === 'u') {
          event.preventDefault();
          execute('underline');
          return;
        }
        if (key === 'k') {
          event.preventDefault();
          const url = window.prompt('Insira o link:');
          if (url) execute('createLink', url);
          return;
        }
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedImage) {
        selectedImage.remove();
        clearSelectedImage();
        requestPagination(activePageIndex);
      }
    };

    wrapper.addEventListener('click', onClick);
    wrapper.addEventListener('keydown', onKeyDown);
    return () => {
      wrapper.removeEventListener('click', onClick);
      wrapper.removeEventListener('keydown', onKeyDown);
    };
  }, [
    activePageIndex,
    clearSelectedImage,
    getActiveEditorNode,
    requestPagination,
    selectImage,
    selectedImage,
    syncCommandState,
  ]);

  useEffect(() => {
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return undefined;

    const onSelection = () => syncCommandState();
    document.addEventListener('selectionchange', onSelection);
    wrapper.addEventListener('keyup', onSelection);
    wrapper.addEventListener('mouseup', onSelection);
    wrapper.addEventListener('focusin', onSelection);
    return () => {
      document.removeEventListener('selectionchange', onSelection);
      wrapper.removeEventListener('keyup', onSelection);
      wrapper.removeEventListener('mouseup', onSelection);
      wrapper.removeEventListener('focusin', onSelection);
    };
  }, [syncCommandState]);

  useEffect(() => {
    updateOverlay();
  }, [selectedImage, updateOverlay, activePageIndex, pageCount]);

  useEffect(() => {
    const sync = () => updateOverlay();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [updateOverlay]);

  useEffect(() => {
    if (!isResizingImage) return undefined;

    const onMove = (event: PointerEvent) => {
      const state = resizeStateRef.current;
      if (!state || !selectedImage) return;
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      const useHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);
      const directional = useHorizontal
        ? state.handle.includes('right')
          ? deltaX
          : -deltaX
        : state.handle.includes('bottom')
          ? deltaY
          : -deltaY;
      const nextW = Math.max(80, state.startWidth + directional);
      const nextH = Math.max(40, nextW / state.aspectRatio);
      selectedImage.style.width = `${nextW}px`;
      selectedImage.style.height = `${nextH}px`;
      updateOverlay();
    };

    const onUp = () => {
      resizeStateRef.current = null;
      setIsResizingImage(false);
      requestPagination(activePageIndex);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [activePageIndex, isResizingImage, requestPagination, selectedImage, updateOverlay]);

  const focusEditor = () => {
    const active = getActiveEditorNode();
    if (active) active.focus();
  };

  const applyCommand = (cmd: string, cmdValue?: string) => {
    focusEditor();
    document.execCommand(cmd, false, cmdValue);
    window.setTimeout(() => {
      requestPagination(activePageIndex);
      syncCommandState();
    }, 0);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const html = event.clipboardData?.getData('text/html') || '';
    const text = event.clipboardData?.getData('text/plain') || '';
    const content = html ? sanitizePasteHtml(html) : plainTextToHtml(text);
    if (!content) return;
    event.preventDefault();
    applyCommand('insertHTML', content);
  };

  const insertPlaceholder = (token: string) => {
    focusEditor();
    document.execCommand('insertText', false, token);
    window.setTimeout(() => {
      requestPagination(activePageIndex);
      syncCommandState();
    }, 0);
  };

  const copyPlaceholder = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // ignora
    }
  };

  const insertLink = () => {
    const url = window.prompt('Insira o link:');
    if (!url) return;
    applyCommand('createLink', url);
  };

  const insertTable = (rows: number, cols: number) => {
    const cells = Array.from({ length: rows })
      .map(() => `<tr>${Array.from({ length: cols }).map(() => '<td style="border: 1px solid #d1d5db; padding: 6px;">&nbsp;</td>').join('')}</tr>`)
      .join('');
    applyCommand('insertHTML', `<table style="border-collapse: collapse; width: 100%; margin: 8px 0;">${cells}</table><p></p>`);
    setTablePickerOpen(false);
    setTablePickerHover({ rows: 0, cols: 0 });
  };

  const insertImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Selecione uma imagem válida.');
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      const active = getActiveEditorNode();
      focusEditor();
      document.execCommand('insertImage', false, dataUrl);
      window.setTimeout(() => {
        if (active) {
          const images = active.querySelectorAll('img');
          const img = images[images.length - 1] as HTMLImageElement | undefined;
          if (img) {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            selectImage(img);
          }
        }
        requestPagination(activePageIndex);
      }, 0);
    } catch {
      window.alert('Não foi possível inserir a imagem selecionada.');
    }
  };

  const selectBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;

    try {
      let compressed: string | null = null;
      if (BG_IMAGE_TYPES.has(file.type)) {
        compressed = await compressBackground(file);
      } else if (isPdfFile(file)) {
        const firstPageDataUrl = await renderPdfFirstPage(file);
        compressed = await compressBackgroundDataUrl(firstPageDataUrl);
      } else if (isDocxFile(file)) {
        const docxImageDataUrl = await renderDocxBackground(file);
        compressed = await compressBackgroundDataUrl(docxImageDataUrl);
      } else {
        window.alert('Formato inválido. Use JPG, PNG, WEBP, PDF ou DOCX.');
        return;
      }

      if (!compressed) {
        window.alert('O arquivo é muito grande. Use uma versão menor para o papel timbrado.');
        return;
      }
      setBackgroundImageData(compressed);
      setBackgroundOpacity(1);
      setBackgroundSize('contain');
    } catch {
      window.alert(
        'Não foi possível processar o arquivo de fundo. No DOCX, use um timbrado com imagem incorporada.',
      );
    }
  };

  const removeBackground = () => {
    setBackgroundImageData('');
  };

  const updatePagePadding = (key: keyof Padding, value: string | number) => {
    const numeric = clampPad(Number(value));
    setPagePadding((current) => ({ ...current, [key]: numeric }));
  };

  const startImageResize = (
    event: ReactPointerEvent<HTMLSpanElement>,
    handle: ResizeHandle,
  ) => {
    if (!selectedImage || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = selectedImage.getBoundingClientRect();
    resizeStateRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      aspectRatio: rect.width / Math.max(1, rect.height),
    };
    setIsResizingImage(true);
  };

  const handleEditorInput = (pageIndex: number) => {
    if (activePageIndex !== pageIndex) setActivePageIndex(pageIndex);
    requestPagination(pageIndex);
    syncCommandState();
  };

  const selectPreviewPage = (pageIndex: number) => {
    if (pageIndex < 0 || pageIndex >= pageCount) return;
    setActivePageIndex(pageIndex);
    window.setTimeout(() => {
      pageRefs.current[pageIndex]?.focus();
      syncCommandState();
    }, 0);
  };

  useEffect(() => {
    if (disabled) {
      setTablePickerOpen(false);
      clearSelectedImage();
    }
  }, [clearSelectedImage, disabled]);

  useEffect(() => {
    if (!pendingLoadedPagesRef.current) requestPagination(0);
  }, [backgroundImageData, backgroundOpacity, backgroundSize, pagePadding, requestPagination]);

  useEffect(() => {
    if (!tablePickerOpen) return undefined;
    const onDocumentDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (tablePickerRef.current?.contains(target)) return;
      setTablePickerOpen(false);
      setTablePickerHover({ rows: 0, cols: 0 });
    };
    document.addEventListener('mousedown', onDocumentDown);
    return () => document.removeEventListener('mousedown', onDocumentDown);
  }, [tablePickerOpen]);

  return (
    <div className="contract-word-editor">
      <aside className="contract-word-editor-placeholders">
        <h4>Placeholders disponíveis</h4>
        <div className="contract-word-editor-placeholder-list">
          {placeholders.map((placeholder) => (
            <article key={placeholder.id}>
              <strong>{placeholder.label}</strong>
              <code>{placeholder.token}</code>
              <div>
                <button
                  type="button"
                  onClick={() => insertPlaceholder(placeholder.token)}
                  disabled={disabled}
                >
                  Inserir
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void copyPlaceholder(placeholder.token)}
                >
                  Copiar
                </button>
              </div>
            </article>
          ))}
        </div>
        <p className="contract-word-editor-note">
          Use os placeholders para preencher dados automaticamente na assinatura do aluno.
        </p>
      </aside>

      <div className="contract-word-editor-main">
        <section className="contract-word-editor-settings-panel">
          <article className="contract-word-editor-settings-block">
            <h5>Papel timbrado</h5>
            <div className="contract-word-editor-settings-actions">
              <button
                type="button"
                onClick={() => backgroundInputRef.current?.click()}
                disabled={disabled}
              >
                Imagem de fundo
              </button>
              {backgroundImageData ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={removeBackground}
                  disabled={disabled}
                >
                  Remover fundo
                </button>
              ) : null}
              <input
                ref={backgroundInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="contract-word-editor-hidden-input"
                onChange={selectBackground}
              />
            </div>
            <p>
              Formatos aceitos: JPG, PNG, WEBP, PDF (1ª página) e DOCX (imagem incorporada no
              arquivo). O editor reduz automaticamente para preservar desempenho.
            </p>
            <div className="contract-word-editor-settings-grid two-columns">
              <label>
                Opacidade do fundo: {Math.round(backgroundOpacity * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={backgroundOpacity}
                  disabled={disabled}
                  onChange={(event) =>
                    setBackgroundOpacity(clampOpacity(Number(event.target.value)))
                  }
                />
              </label>
              <label>
                Ajuste da imagem
                <select
                  value={backgroundSize}
                  disabled={disabled}
                  onChange={(event) =>
                    setBackgroundSize(
                      event.target.value === 'contain' ? 'contain' : 'cover',
                    )
                  }
                >
                  <option value="cover">Preencher página</option>
                  <option value="contain">Ajustar completo</option>
                </select>
              </label>
            </div>
          </article>

          <article className="contract-word-editor-settings-block">
            <h5>Régua de margens (mm)</h5>
            <div className="contract-word-editor-ruler">
              <div className="contract-word-editor-ruler-track" />
              <div
                className="contract-word-editor-ruler-margin left"
                style={{ width: `${(pagePadding.left / PAD_MAX) * 100}%` }}
              />
              <div
                className="contract-word-editor-ruler-margin right"
                style={{ width: `${(pagePadding.right / PAD_MAX) * 100}%` }}
              />
              <div className="contract-word-editor-ruler-label left">
                {pagePadding.left.toFixed(1)} mm
              </div>
              <div className="contract-word-editor-ruler-label right">
                {pagePadding.right.toFixed(1)} mm
              </div>
            </div>
            <div className="contract-word-editor-settings-grid">
              <label>
                Margem superior: {pagePadding.top.toFixed(1)} mm
                <input
                  type="range"
                  min={PAD_MIN}
                  max={PAD_MAX}
                  step="0.5"
                  value={pagePadding.top}
                  disabled={disabled}
                  onChange={(event) => updatePagePadding('top', event.target.value)}
                />
              </label>
              <label>
                Margem inferior: {pagePadding.bottom.toFixed(1)} mm
                <input
                  type="range"
                  min={PAD_MIN}
                  max={PAD_MAX}
                  step="0.5"
                  value={pagePadding.bottom}
                  disabled={disabled}
                  onChange={(event) => updatePagePadding('bottom', event.target.value)}
                />
              </label>
              <label>
                Margem esquerda: {pagePadding.left.toFixed(1)} mm
                <input
                  type="range"
                  min={PAD_MIN}
                  max={PAD_MAX}
                  step="0.5"
                  value={pagePadding.left}
                  disabled={disabled}
                  onChange={(event) => updatePagePadding('left', event.target.value)}
                />
              </label>
              <label>
                Margem direita: {pagePadding.right.toFixed(1)} mm
                <input
                  type="range"
                  min={PAD_MIN}
                  max={PAD_MAX}
                  step="0.5"
                  value={pagePadding.right}
                  disabled={disabled}
                  onChange={(event) => updatePagePadding('right', event.target.value)}
                />
              </label>
            </div>
          </article>
        </section>

        <div className="contract-word-editor-toolbar">
          <div className="contract-word-editor-toolbar-group">
            <button
              type="button"
              className={`toolbar-btn ${commandState.bold ? 'is-active' : ''}`}
              onClick={() => applyCommand('bold')}
              disabled={disabled}
              title="Negrito (Ctrl/Cmd + B)"
            >
              <span className="toolbar-icon">B</span>
              <span>Negrito</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${commandState.italic ? 'is-active' : ''}`}
              onClick={() => applyCommand('italic')}
              disabled={disabled}
              title="Itálico (Ctrl/Cmd + I)"
            >
              <span className="toolbar-icon"><i>I</i></span>
              <span>Itálico</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${commandState.underline ? 'is-active' : ''}`}
              onClick={() => applyCommand('underline')}
              disabled={disabled}
              title="Sublinhado (Ctrl/Cmd + U)"
            >
              <span className="toolbar-icon">U</span>
              <span>Sublinhado</span>
            </button>
          </div>

          <div className="contract-word-editor-toolbar-separator" />

          <div className="contract-word-editor-toolbar-group">
            <select
              className="toolbar-select"
              defaultValue="Arial"
              disabled={disabled}
              onChange={(event) => applyCommand('fontName', event.target.value)}
              title="Fonte"
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
              <option value="Courier New">Courier New</option>
            </select>
            <select
              className="toolbar-select"
              defaultValue="3"
              disabled={disabled}
              onChange={(event) => applyCommand('fontSize', event.target.value)}
              title="Tamanho da fonte"
            >
              <option value="1">10</option>
              <option value="2">12</option>
              <option value="3">14</option>
              <option value="4">16</option>
              <option value="5">18</option>
              <option value="6">24</option>
              <option value="7">32</option>
            </select>
          </div>

          <div className="contract-word-editor-toolbar-separator" />

          <div className="contract-word-editor-toolbar-group">
            <button
              type="button"
              className={`toolbar-btn ${commandState.justifyLeft ? 'is-active' : ''}`}
              onClick={() => applyCommand('justifyLeft')}
              disabled={disabled}
              title="Alinhar à esquerda"
            >
              <span className="toolbar-icon">L</span>
              <span>Esquerda</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${commandState.justifyCenter ? 'is-active' : ''}`}
              onClick={() => applyCommand('justifyCenter')}
              disabled={disabled}
              title="Centralizar"
            >
              <span className="toolbar-icon">C</span>
              <span>Centro</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${commandState.justifyRight ? 'is-active' : ''}`}
              onClick={() => applyCommand('justifyRight')}
              disabled={disabled}
              title="Alinhar à direita"
            >
              <span className="toolbar-icon">R</span>
              <span>Direita</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${commandState.justifyFull ? 'is-active' : ''}`}
              onClick={() => applyCommand('justifyFull')}
              disabled={disabled}
              title="Justificar"
            >
              <span className="toolbar-icon">J</span>
              <span>Justificado</span>
            </button>
          </div>

          <div className="contract-word-editor-toolbar-separator" />

          <div className="contract-word-editor-toolbar-group">
            <button
              type="button"
              className={`toolbar-btn ${commandState.insertUnorderedList ? 'is-active' : ''}`}
              onClick={() => applyCommand('insertUnorderedList')}
              disabled={disabled}
              title="Lista com marcadores"
            >
              <span className="toolbar-icon">UL</span>
              <span>Lista</span>
            </button>
            <button
              type="button"
              className={`toolbar-btn ${commandState.insertOrderedList ? 'is-active' : ''}`}
              onClick={() => applyCommand('insertOrderedList')}
              disabled={disabled}
              title="Lista numerada"
            >
              <span className="toolbar-icon">OL</span>
              <span>Numerada</span>
            </button>
          </div>

          <div className="contract-word-editor-toolbar-separator" />

          <div className="contract-word-editor-toolbar-group">
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => applyCommand('undo')}
              disabled={disabled}
              title="Desfazer (Ctrl/Cmd + Z)"
            >
              <span className="toolbar-icon">UN</span>
              <span>Desfazer</span>
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => applyCommand('redo')}
              disabled={disabled}
              title="Refazer (Ctrl/Cmd + Y)"
            >
              <span className="toolbar-icon">RE</span>
              <span>Refazer</span>
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => applyCommand('removeFormat')}
              disabled={disabled}
              title="Limpar formatação"
            >
              <span className="toolbar-icon">Tx</span>
              <span>Limpar</span>
            </button>
          </div>

          <div className="contract-word-editor-toolbar-separator" />

          <div className="contract-word-editor-toolbar-group">
            <button
              type="button"
              className="toolbar-btn"
              onClick={insertLink}
              disabled={disabled}
              title="Inserir link (Ctrl/Cmd + K)"
            >
              <span className="toolbar-icon">LK</span>
              <span>Link</span>
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => imageInputRef.current?.click()}
              disabled={disabled}
              title="Inserir imagem"
            >
              <span className="toolbar-icon">IM</span>
              <span>Imagem</span>
            </button>
            <div className="contract-word-editor-table-picker" ref={tablePickerRef}>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setTablePickerOpen((current) => !current)}
                disabled={disabled}
                title="Inserir tabela"
              >
                <span className="toolbar-icon">TB</span>
                <span>Tabela</span>
              </button>
              {tablePickerOpen ? (
                <div className="contract-word-editor-table-picker-popover">
                  <div className="contract-word-editor-table-picker-grid">
                    {Array.from({ length: 25 }).map((_, index) => {
                      const rows = Math.floor(index / 5) + 1;
                      const cols = (index % 5) + 1;
                      const active =
                        rows <= tablePickerHover.rows && cols <= tablePickerHover.cols;
                      return (
                        <button
                          key={`${rows}-${cols}`}
                          type="button"
                          className={active ? 'is-active' : undefined}
                          onMouseEnter={() => setTablePickerHover({ rows, cols })}
                          onClick={() => insertTable(rows, cols)}
                        />
                      );
                    })}
                  </div>
                  <p>
                    {tablePickerHover.rows > 0
                      ? `${tablePickerHover.rows} x ${tablePickerHover.cols}`
                      : 'Selecione o tamanho'}
                  </p>
                </div>
              ) : null}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="contract-word-editor-hidden-input"
              onChange={insertImage}
            />
          </div>
        </div>
        <p className="contract-word-editor-toolbar-hint">
          Atalhos: `Ctrl/Cmd + B` (negrito), `I` (itálico), `U` (sublinhado) e `K` (link).
        </p>

        {selectedImage ? (
          <p className="contract-word-editor-image-help">
            Imagem selecionada: use a barra flutuante para alinhamento e os pontos para
            redimensionar.
          </p>
        ) : null}

        <div className={`contract-word-editor-layout ${pageCount > 1 ? 'with-previews' : ''}`}>
          {pageCount > 1 ? (
            <aside className="contract-word-editor-previews">
              <p>Páginas</p>
              {Array.from({ length: pageCount }).map((_, pageIndex) => (
                <button
                  key={`preview-${pageIndex}`}
                  type="button"
                  className={activePageIndex === pageIndex ? 'active' : undefined}
                  onClick={() => selectPreviewPage(pageIndex)}
                  onFocus={() => setActivePageIndex(pageIndex)}
                >
                  <span>{pageIndex + 1}</span>
                  <div>
                    <div
                      className="contract-word-editor-preview-sheet contract-word-editor-page-body"
                      style={pageStyle}
                      dangerouslySetInnerHTML={{ __html: pagePreviewHtml[pageIndex] || '' }}
                    />
                  </div>
                </button>
              ))}
            </aside>
          ) : null}

          <div className="contract-word-editor-stage" ref={editorWrapperRef}>
            {selectedImage && imageOverlay ? (
              <>
                <div
                  className="contract-word-editor-image-toolbar"
                  style={{
                    top: Math.max(0, imageOverlay.top - 44),
                    left: imageOverlay.left,
                  }}
                >
                  <span>Imagem</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      applyImageStyles({ float: null, display: 'inline', margin: '0' })
                    }
                  >
                    Em linha
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      applyImageStyles({
                        float: null,
                        display: 'block',
                        margin: '0 auto 12px',
                      })
                    }
                  >
                    Centralizar
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      applyImageStyles({
                        float: 'left',
                        display: 'block',
                        margin: '0 12px 12px 0',
                      })
                    }
                  >
                    Texto à direita
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      applyImageStyles({
                        float: 'right',
                        display: 'block',
                        margin: '0 0 12px 12px',
                      })
                    }
                  >
                    Texto à esquerda
                  </button>
                </div>
                <div
                  className="contract-word-editor-image-resize-overlay"
                  style={{
                    top: imageOverlay.top,
                    left: imageOverlay.left,
                    width: imageOverlay.width,
                    height: imageOverlay.height,
                  }}
                >
                  {(
                    ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as ResizeHandle[]
                  ).map((handle) => (
                    <span
                      key={handle}
                      className={`resize-handle ${handle}`}
                      onPointerDown={(event) => startImageResize(event, handle)}
                    />
                  ))}
                </div>
              </>
            ) : null}

            <div className="contract-word-editor-pages">
              {Array.from({ length: pageCount }).map((_, pageIndex) => (
                <div
                  key={`page-${pageIndex}`}
                  className={`contract-word-editor-page-shell ${
                    activePageIndex === pageIndex ? 'active' : ''
                  }`}
                >
                  {isEditorEmpty && pageIndex === activePageIndex ? (
                    <div className="contract-word-editor-placeholder">
                      {disabled
                        ? 'Modelo publicado: visualização apenas.'
                        : 'Digite aqui o documento do contrato. Você pode inserir placeholders ao lado.'}
                    </div>
                  ) : null}
                  <div
                    ref={(node) => {
                      pageRefs.current[pageIndex] = node;
                    }}
                    contentEditable={!disabled}
                    suppressContentEditableWarning
                    className="contract-word-editor-page-body"
                    style={pageStyle}
                    onFocus={() => setActivePageIndex(pageIndex)}
                    onMouseUp={() => setActivePageIndex(pageIndex)}
                    onInput={() => handleEditorInput(pageIndex)}
                    onPaste={(event) => {
                      if (disabled) return;
                      setActivePageIndex(pageIndex);
                      onPaste(event);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
