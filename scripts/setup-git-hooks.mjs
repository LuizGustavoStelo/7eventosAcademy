import { execSync } from 'node:child_process';

try {
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
  console.log('[setup-git-hooks] OK: core.hooksPath=.githooks');
} catch {
  console.log('[setup-git-hooks] Ignorado: diretório sem repositório git ativo.');
}
