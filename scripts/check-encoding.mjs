import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
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
const normalizePath = (value) => value.split(path.sep).join('/');
const ignoredFiles = new Set(['scripts/check-encoding.mjs']);
const mojibakePattern = /(?:Ãƒ[\u0080-\u00BF]|Ã‚[^\s]|ï¿½)/u;
const stagedOnly = process.argv.includes('--staged');

const bomFindings = [];
const mojibakeFindings = [];

const hasBom = (buffer) =>
  buffer.length >= 3 &&
  buffer[0] === 0xef &&
  buffer[1] === 0xbb &&
  buffer[2] === 0xbf;

const shouldCheckFile = (relativePath) => {
  if (!relativePath) return false;
  const normalizedRelativePath = normalizePath(relativePath);
  if (ignoredFiles.has(normalizedRelativePath)) return false;
  return allowedExtensions.has(path.extname(normalizedRelativePath));
};

const collectRepoFiles = (currentDir, output) => {
  const entries = readdirSync(currentDir);

  for (const name of entries) {
    const absolutePath = path.join(currentDir, name);
    const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (ignoredDirs.has(name)) continue;
      collectRepoFiles(absolutePath, output);
      continue;
    }

    if (shouldCheckFile(relativePath)) {
      output.push(relativePath);
    }
  }
};

const collectStagedFiles = () => {
  try {
    const raw = execSync(
      'git diff --cached --name-only --diff-filter=ACMRTUXB',
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    )
      .toString('utf8')
      .trim();

    if (!raw) return [];

    return raw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => normalizePath(item))
      .filter((relativePath) => shouldCheckFile(relativePath));
  } catch {
    return [];
  }
};

const fileList = [];
if (stagedOnly) {
  fileList.push(...collectStagedFiles());
} else {
  collectRepoFiles(repoRoot, fileList);
}

for (const relativePath of fileList) {
  const absolutePath = path.join(repoRoot, relativePath);
  const buffer = readFileSync(absolutePath);

  if (hasBom(buffer)) {
    bomFindings.push(relativePath);
  }

  const lines = buffer.toString('utf8').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!mojibakePattern.test(lines[index])) continue;
    mojibakeFindings.push(`${relativePath}:${index + 1}`);
    break;
  }
}

if (bomFindings.length > 0) {
  console.error('[check-encoding] BOM UTF-8 detectado nos arquivos:');
  bomFindings.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

if (mojibakeFindings.length > 0) {
  console.error('[check-encoding] Possível mojibake detectado nos arquivos:');
  mojibakeFindings.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

if (stagedOnly) {
  console.log('[check-encoding] OK (staged): sem BOM e sem mojibake.');
} else {
  console.log('[check-encoding] OK: sem BOM e sem mojibake.');
}
