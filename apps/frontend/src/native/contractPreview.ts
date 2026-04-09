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
  const wrapperStyle = String(wrapper?.getAttribute('style') || '').trim();

  let source = String(root.innerHTML || '');
  if (wrapper) {
    const flatRoot = doc.createElement('div');
    const children = Array.from(root.childNodes);
    for (const child of children) {
      if (child === wrapper) {
        const wrapperContent = doc.createElement('div');
        wrapperContent.innerHTML = wrapper.innerHTML;
        const wrapperChildren = Array.from(wrapperContent.childNodes);
        for (const wrapperChild of wrapperChildren) {
          flatRoot.appendChild(wrapperChild.cloneNode(true));
        }
        continue;
      }
      flatRoot.appendChild(child.cloneNode(true));
    }
    source = String(flatRoot.innerHTML || '');
  }

  const pages = source
    .replace(CONTRACT_PREVIEW_PAGE_BREAK_REGEX, '<!--CONTRACT_PREVIEW_BREAK-->')
    .split('<!--CONTRACT_PREVIEW_BREAK-->');

  while (pages.length > 1 && !hasPreviewMeaningfulHtml(pages[pages.length - 1])) {
    pages.pop();
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
    }
    body {
      padding: 14px;
      min-height: 100vh;
      overflow-y: auto;
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
      height: 1123px;
      min-height: 1123px;
      max-height: 1123px;
      margin: 0;
      overflow: hidden;
    }
    .contract-preview-separator {
      height: 14px;
    }
    @media (max-width: 860px) {
      body { padding: 8px; }
      .contract-preview-sheet {
        width: 100%;
      }
      .contract-preview-page {
        width: 100%;
        min-height: auto;
        height: auto;
        max-height: none;
      }
    }
  </style>
</head>
<body>${bodyHtml || `<article class="contract-preview-sheet"><section class="contract-preview-page"><p>${escapeHtmlForIframe('Sem conteúdo para pré-visualizar.')}</p></section></article>`}</body>
</html>`;
}
