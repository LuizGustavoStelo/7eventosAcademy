import {
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

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..', '..');
const modelosDir = path.resolve(
  repoRoot,
  'resources',
  'templates',
  'student-portal',
);
const misRoot = path.resolve(backendRoot, 'public', 'mis');
const force = process.argv.includes('--force');

console.log('[sync-mis] Iniciando sincronização do Portal do Aluno...');
console.log(`[sync-mis] Origem: ${modelosDir}`);
console.log(`[sync-mis] Destino: ${misRoot}`);

if (!existsSync(modelosDir)) {
  console.log('[sync-mis] ERRO: Pasta de modelos do aluno não encontrada.');
  process.exit(0);
}

if (!existsSync(misRoot)) {
  mkdirSync(misRoot, { recursive: true });
}

const entries = readdirSync(modelosDir, { withFileTypes: true });
let syncedCount = 0;

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const folderName = entry.name;
  const sourceDir = path.join(modelosDir, folderName);
  const sourceCode = path.join(sourceDir, 'code.html');
  if (!existsSync(sourceCode)) continue;

  // Mantém a tela principal do portal sincronizada automaticamente.
  if (folderName !== 'dashboard') continue;

  const targetFile = path.join(misRoot, 'area-do-aluno.html');
  if (existsSync(targetFile) && !force) continue;

  const html = readFileSync(sourceCode, 'utf8');
  writeFileSync(targetFile, html, 'utf8');
  syncedCount += 1;
}

console.log(
  `[sync-mis] Sucesso: ${syncedCount} tela(s) sincronizada(s)${force ? ' (forçado)' : ''}.`,
);
