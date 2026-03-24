import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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

if (!existsSync(modelosDir)) {
  console.log('[sync-templates] Pasta "modelos de telas" não encontrada. Mantendo templates atuais.');
  process.exit(0);
}

if (!existsSync(templatesRoot)) {
  mkdirSync(templatesRoot, { recursive: true });
}

const entries = readdirSync(modelosDir, { withFileTypes: true });
let syncedCount = 0;

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const folderName = entry.name;
  const sourceDir = path.join(modelosDir, folderName);
  const sourceCode = path.join(sourceDir, 'code.html');

  if (!existsSync(sourceCode)) continue;

  const targetDir = path.join(templatesRoot, folderName);
  mkdirSync(targetDir, { recursive: true });

  const targetIndex = path.join(targetDir, 'index.html');

  if (existsSync(targetIndex) && !force) {
    continue;
  }

  const html = readFileSync(sourceCode, 'utf8');
  writeFileSync(targetIndex, html, 'utf8');

  syncedCount += 1;
}

console.log(
  `[sync-templates] ${syncedCount} template(s) sincronizado(s)${force ? ' (forçado)' : ''}.`,
);
