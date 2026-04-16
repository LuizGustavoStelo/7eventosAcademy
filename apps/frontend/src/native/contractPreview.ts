const CONTRACT_PREVIEW_PAGE_BREAK_REGEX =
  /<div[^>]*(data-contract-page-break\s*=\s*["']true["'][^>]*|page-break-after\s*:\s*always[^>]*)><\/div>/gi;

const hasPreviewMeaningfulHtml = (html: string) => {
  const normalized = String(html || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, '')
    .trim();
  return Boolean(normalized);
};

const isPreviewPageBreakElement = (node: Node) => {
  if (!(node instanceof HTMLElement)) return false;
  if (String(node.dataset.contractPageBreak || '').toLowerCase() === 'true') return true;
  const style = String(node.getAttribute('style') || '').toLowerCase().replace(/\s+/g, '');
  return style.includes('page-break-after:always');
};

const collectPreviewPagesFromContainer = (container: HTMLElement) => {
  const pages: string[] = [];
  let current = '';

  Array.from(container.childNodes).forEach((node) => {
    if (isPreviewPageBreakElement(node)) {
      pages.push(current);
      current = '';
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent || '';
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      current += (node as HTMLElement).outerHTML;
    }
  });
  pages.push(current);

  while (pages.length > 1 && !hasPreviewMeaningfulHtml(pages[pages.length - 1])) pages.pop();
  return pages;
};

const escapeHtmlForIframe = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeAttributeForIframe = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');

const LEGACY_MOJIBAKE_MAP: Record<string, string> = {
  '\u00A1': '\u00E1',
  '\u00A2': '\u00E2',
  '\u00A3': '\u00E3',
  '\u00A7': '\u00E7',
  '\u00A9': '\u00E9',
  '\u00AD': '\u00ED',
  '\u00B3': '\u00F3',
  '\u00B4': '\u00F4',
  '\u00B5': '\u00F5',
  '\u00BA': '\u00FA',
  '\u00C0': '\u00E0',
};

const LEGACY_MOJIBAKE_REGEX =
  /\u00D2([\u00A1\u00A2\u00A3\u00A7\u00A9\u00AD\u00B3\u00B4\u00B5\u00BA\u00C0])/g;

const normalizeLegacyMojibake = (value: string) =>
  String(value || '')
    .replace(/\u00D2\u2B30/g, '\u00C9')
    .replace(LEGACY_MOJIBAKE_REGEX, (_, char: string) => LEGACY_MOJIBAKE_MAP[char] || _);

export function buildContractPreviewSrcDoc(rawHtml: string) {
  const normalizedRawHtml = normalizeLegacyMojibake(rawHtml);
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(
    `<div id="preview-root">${normalizedRawHtml}</div>`,
    'text/html',
  );
  const root = doc.getElementById('preview-root');
  if (!root) {
    return '<!doctype html><html><body></body></html>';
  }

  const settingsNode = root.querySelector('[data-contract-editor-settings="true"]');
  if (settingsNode) settingsNode.remove();

  const wrapper = root.querySelector<HTMLElement>('[data-contract-document-wrapper="true"]');
  let wrapperStyle = String(wrapper?.getAttribute('style') || '').trim();
  let pages: string[] = [];

  if (wrapper) {
    pages = collectPreviewPagesFromContainer(wrapper);
    const siblingsBefore = Array.from(root.childNodes)
      .slice(0, Array.from(root.childNodes).indexOf(wrapper))
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node.nodeType === Node.ELEMENT_NODE) return (node as HTMLElement).outerHTML;
        return '';
      })
      .join('');
    const siblingsAfter = Array.from(root.childNodes)
      .slice(Array.from(root.childNodes).indexOf(wrapper) + 1)
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node.nodeType === Node.ELEMENT_NODE) return (node as HTMLElement).outerHTML;
        return '';
      })
      .join('');

    if (hasPreviewMeaningfulHtml(siblingsBefore)) {
      const beforeContainer = doc.createElement('div');
      beforeContainer.innerHTML = siblingsBefore;
      pages = [...collectPreviewPagesFromContainer(beforeContainer), ...pages];
    }
    if (hasPreviewMeaningfulHtml(siblingsAfter)) {
      const afterContainer = doc.createElement('div');
      afterContainer.innerHTML = siblingsAfter;
      pages = [...pages, ...collectPreviewPagesFromContainer(afterContainer)];
    }
  } else {
    const firstElement = root.firstElementChild as HTMLElement | null;
    if (
      firstElement &&
      firstElement.tagName === 'SECTION' &&
      firstElement.querySelector('[data-contract-page-break="true"]')
    ) {
      wrapperStyle = String(firstElement.getAttribute('style') || '').trim();
      pages = collectPreviewPagesFromContainer(firstElement);
    } else {
      const source = String(root.innerHTML || '');
      pages = source
        .replace(CONTRACT_PREVIEW_PAGE_BREAK_REGEX, '<!--CONTRACT_PREVIEW_BREAK-->')
        .split('<!--CONTRACT_PREVIEW_BREAK-->');
      while (pages.length > 1 && !hasPreviewMeaningfulHtml(pages[pages.length - 1])) {
        pages.pop();
      }
    }
  }

  const bodyHtml = pages
    .map((page) => {
      const styleAttr = wrapperStyle
        ? ` style="${escapeAttributeForIframe(wrapperStyle)}"`
        : '';
      return `<article class="contract-preview-sheet"><section class="contract-preview-page"${styleAttr}>${page || '<p>&nbsp;</p>'}</section></article>`;
    })
    .join('<div class="contract-preview-separator" aria-hidden="true"></div>');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #eef2f7;
      color: #0f172a;
      font-family: Arial, sans-serif;
      overflow-x: hidden;
    }
    body {
      padding: 14px;
      min-height: 100vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .scale-wrapper {
      width: 794px;
    }
    @media (max-width: 822px) {
      body { padding: 8px; }
      .scale-wrapper {
        zoom: calc((100vw - 48px) / 794);
      }
    }
    .contract-preview-sheet {
      width: 794px;
      margin: 0 auto;
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
      background: #fff;
    }
    .contract-preview-page {
      width: 794px;
      min-height: 1123px;
      height: auto;
      margin: 0;
      overflow: visible;
    }
    .contract-preview-separator {
      height: 14px;
    }
  </style>
</head>
<body><div class="scale-wrapper">${bodyHtml || `<article class="contract-preview-sheet"><section class="contract-preview-page"><p>${escapeHtmlForIframe('Sem conteúdo para pré-visualizar.')}</p></section></article>`}</div></body>
</html>`;
}
