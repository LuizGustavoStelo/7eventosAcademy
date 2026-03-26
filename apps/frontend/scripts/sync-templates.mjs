import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..', '..');
const modelosDir = path.join(repoRoot, 'resources', 'templates', 'manager');
const templatesRoot = path.join(frontendRoot, 'public', 'templates');
const force = process.argv.includes('--force');

const templateBundleHref = '/templates/assets/templates.bundle.css';
const deprecatedTemplateFolders = new Set([
  'admin_professor_dashboard_da_conta',
  'admin_professor_cursos',
  'admin_professor_gestao_de_turmas',
  'admin_professor_alunos_e_matriculas',
  'admin_professor_agenda_de_aulas_e_lives',
  'admin_professor_avisos_e_comunicacao',
  'admin_professor_conteudo_e_materiais',
  'admin_professor_configuracoes',
  'admin_professor_financeiro',
  'admin_professor_relatorios_e_analises',
  'superadmin_dashboard_global',
  'superadmin_gestao_de_contas',
  'superadmin_tela_de_impersonacao',
  'superadmin_wordpress_plugin',
]);
const shellFrameStyleId = 'academy-shell-frame-prerender-style';
const shellFrameStyle = `<style id="${shellFrameStyleId}">
body > header {
  display: none !important;
}
body > main > header:first-child {
  display: none !important;
}
header.sticky.top-0 {
  display: none !important;
}
</style>`;
const canonicalMaterialSymbolsHref =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';

if (!existsSync(modelosDir)) {
  console.log(
    '[sync-templates] Pasta "modelos de telas" não encontrada. Mantendo templates atuais.',
  );
  process.exit(0);
}

if (!existsSync(templatesRoot)) {
  mkdirSync(templatesRoot, { recursive: true });
}

const removeTailwindRuntime = (html) => {
  let output = html.replace(
    /<script[^>]*src=["']https:\/\/cdn\.tailwindcss\.com[^"']*["'][^>]*>\s*<\/script>\s*/gi,
    '',
  );

  output = output.replace(
    /<script[^>]*id=["']tailwind-config["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    '',
  );

  output = output.replace(
    /<script\b[^>]*>([\s\S]*?)<\/script>\s*/gi,
    (match, scriptBody) => (scriptBody.includes('tailwind.config') ? '' : match),
  );

  return output;
};

const normalizeStylesheetHref = (href) => {
  const decodedHref = href.replaceAll('&amp;', '&').trim();
  if (decodedHref.includes('family=Material+Symbols+Outlined')) {
    return canonicalMaterialSymbolsHref;
  }

  return decodedHref;
};

const dedupeStylesheets = (html) => {
  const seenHrefs = new Set();

  return html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) {
      return tag;
    }

    const normalizedHref = normalizeStylesheetHref(hrefMatch[1]);
    if (seenHrefs.has(normalizedHref)) {
      return '';
    }

    seenHrefs.add(normalizedHref);
    return `<link href="${normalizedHref}" rel="stylesheet" />`;
  });
};

const ensureTemplateBundleLink = (html) => {
  if (html.includes(templateBundleHref)) {
    return html;
  }

  return html.replace(
    /<\/head>/i,
    `  <link href="${templateBundleHref}" rel="stylesheet" />\n</head>`,
  );
};

const ensureFramePrerenderStyle = (html) => {
  if (html.includes(shellFrameStyleId)) {
    return html;
  }

  return html.replace(/<\/head>/i, `  ${shellFrameStyle}\n</head>`);
};

const normalizeTemplateHtml = (html) => {
  let output = html.replace(/\r\n/g, '\n');
  output = removeTailwindRuntime(output);
  output = dedupeStylesheets(output);
  output = ensureTemplateBundleLink(output);
  output = ensureFramePrerenderStyle(output);
  output = output.replace(/\n{3,}/g, '\n\n');
  return output;
};

const entries = readdirSync(modelosDir, { withFileTypes: true });
let copiedCount = 0;
let normalizedCount = 0;
let removedLegacyCount = 0;

for (const folderName of deprecatedTemplateFolders) {
  const legacyPath = path.join(templatesRoot, folderName);
  if (!existsSync(legacyPath)) continue;
  rmSync(legacyPath, { recursive: true, force: true });
  removedLegacyCount += 1;
}

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const folderName = entry.name;
  if (deprecatedTemplateFolders.has(folderName)) continue;

  const sourceDir = path.join(modelosDir, folderName);
  const sourceCode = path.join(sourceDir, 'code.html');

  if (!existsSync(sourceCode)) continue;

  const targetDir = path.join(templatesRoot, folderName);
  mkdirSync(targetDir, { recursive: true });

  const targetIndex = path.join(targetDir, 'index.html');
  const shouldCopySource = force || !existsSync(targetIndex);
  const sourceHtml = readFileSync(sourceCode, 'utf8');
  const baseHtml = shouldCopySource
    ? sourceHtml
    : readFileSync(targetIndex, 'utf8');
  const normalizedHtml = normalizeTemplateHtml(baseHtml);

  if (shouldCopySource) {
    copiedCount += 1;
  }

  if (shouldCopySource || normalizedHtml !== baseHtml) {
    writeFileSync(targetIndex, normalizedHtml, 'utf8');
    normalizedCount += 1;
  }
}

const existingTemplateEntries = readdirSync(templatesRoot, {
  withFileTypes: true,
});
for (const entry of existingTemplateEntries) {
  if (!entry.isDirectory()) continue;
  if (deprecatedTemplateFolders.has(entry.name)) continue;

  const targetIndex = path.join(templatesRoot, entry.name, 'index.html');
  if (!existsSync(targetIndex)) continue;

  const currentHtml = readFileSync(targetIndex, 'utf8');
  const normalizedHtml = normalizeTemplateHtml(currentHtml);
  if (normalizedHtml === currentHtml) continue;

  writeFileSync(targetIndex, normalizedHtml, 'utf8');
  normalizedCount += 1;
}

const forceSuffix = force ? ' (forçado)' : '';
console.log(
  `[sync-templates] ${copiedCount} template(s) copiado(s), ${normalizedCount} normalizado(s), ${removedLegacyCount} legado(s) removido(s)${forceSuffix}.`,
);
