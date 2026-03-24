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

// Ajuste dos caminhos resolvidos para encontrar a raiz do repo corretamente
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const modelosDir = path.resolve(repoRoot, 'resources', 'templates', 'student-portal');
const misRoot = path.resolve(backendRoot, 'public', 'mis');

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

  /**
   * Mapeamento de nomes de arquivos para compatibilidade ou padrão profissional.
   * A tela 'dashboard' será o ponto de entrada principal 'area-do-aluno.html'.
   */
  let targetName = folderName;
  if (folderName === 'dashboard') {
    targetName = 'area-do-aluno';
  }

  const targetFile = path.join(misRoot, `${targetName}.html`);
  const html = readFileSync(sourceCode, 'utf8');
  
  // Otimização simples: garantir que caminhos relativos de CSS/Assets funcionem se necessário
  writeFileSync(targetFile, html, 'utf8');

  syncedCount += 1;
}

console.log(`[sync-mis] Sucesso: ${syncedCount} tela(s) sincronizada(s).`);
