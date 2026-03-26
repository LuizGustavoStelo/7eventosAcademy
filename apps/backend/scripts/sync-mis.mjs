import {
  existsSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendRoot = path.resolve(__dirname, '..');
const misRoot = path.resolve(backendRoot, 'public', 'mis');

console.log('[sync-mis] Verificando compatibilidade do portal do aluno...');
console.log(`[sync-mis] Diretório garantido: ${misRoot}`);

if (!existsSync(misRoot)) {
  mkdirSync(misRoot, { recursive: true });
}

console.log('[sync-mis] Estrutura mínima mantida. Sincronização legada desativada.');
