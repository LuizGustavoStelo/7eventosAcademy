import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const allowedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.html',
  '.css',
  '.scss',
  '.yml',
  '.yaml',
]);
const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.next',
  'build',
]);
const mojibakePattern = /(?:Ã[\u0080-\u00BF]|Â[^\s]|�)/u;

const findings = [];
const ignoredFiles = new Set([path.join('scripts', 'check-encoding.mjs')]);

const walk = (currentDir) => {
  const entries = readdirSync(currentDir);

  for (const name of entries) {
    const absolutePath = path.join(currentDir, name);
    const relativePath = path.relative(repoRoot, absolutePath);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (ignoredDirs.has(name)) continue;
      walk(absolutePath);
      continue;
    }

    if (!allowedExtensions.has(path.extname(name))) {
      continue;
    }

    if (ignoredFiles.has(relativePath)) {
      continue;
    }

    const content = readFileSync(absolutePath, 'utf8');
    const lines = content.split('\n');

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!mojibakePattern.test(line)) continue;
      findings.push(`${relativePath}:${index + 1}`);
      break;
    }
  }
};

walk(repoRoot);

if (findings.length > 0) {
  console.error('[check-encoding] Possível mojibake detectado nos arquivos:');
  findings.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('[check-encoding] OK: nenhum padrão de mojibake detectado.');
