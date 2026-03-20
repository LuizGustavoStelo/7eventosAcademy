import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

const workspaceRoot = process.cwd();
const sourceClientDir = resolve(workspaceRoot, 'node_modules/.prisma/client');
const targetBaseDir = resolve(workspaceRoot, 'node_modules/@prisma/client/.prisma');
const targetClientDir = resolve(targetBaseDir, 'client');

if (!existsSync(sourceClientDir)) {
  throw new Error(`Diretório do Prisma Client não encontrado: ${sourceClientDir}`);
}

mkdirSync(targetBaseDir, { recursive: true });
rmSync(targetClientDir, { recursive: true, force: true });
cpSync(sourceClientDir, targetClientDir, { recursive: true });

console.log('Prisma Client sincronizado em @prisma/client/.prisma/client');
