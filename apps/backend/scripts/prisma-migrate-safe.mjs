#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const schemaPath = process.env.PRISMA_SCHEMA_PATH || 'prisma/schema.prisma';
const schemaDir = path.dirname(schemaPath);
const migrationsDir = path.resolve(schemaDir, 'migrations');

const autoResolveEnabled =
  String(process.env.PRISMA_AUTO_RESOLVE_FAILED_MIGRATIONS ?? 'true').toLowerCase() !==
  'false';

function discoverLocalMigrations() {
  try {
    const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^\d{14}_.+/.test(name));
  } catch {
    return [];
  }
}

const localMigrations = discoverLocalMigrations();
const envAllowlist = String(process.env.PRISMA_AUTO_RESOLVE_ALLOWLIST ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const allowedMigrations = envAllowlist.length > 0 ? envAllowlist : localMigrations;

function runPrisma(args, options = {}) {
  const result = spawnSync('npx', ['prisma', ...args, '--schema', schemaPath], {
    stdio: options.stdio || 'pipe',
    encoding: 'utf8',
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = `${stdout}\n${stderr}`;

  return {
    status: result.status ?? 1,
    output,
  };
}

function extractFailedMigrationName(output) {
  const migrationMatch = output.match(/The `([^`]+)` migration .* failed/i);
  if (migrationMatch?.[1]) {
    return migrationMatch[1].trim();
  }

  return null;
}

function isP3009(output) {
  return /Error:\s*P3009/i.test(output);
}

function logBlock(title, content) {
  if (!content?.trim()) return;
  console.log(`\n[prisma-safe] ${title}:\n${content.trim()}\n`);
}

function main() {
  console.log('[prisma-safe] Iniciando prisma migrate deploy...');
  console.log(
    `[prisma-safe] Auto-resolve para migrações conhecidas: ${allowedMigrations.length} item(ns).`,
  );

  const firstDeploy = runPrisma(['migrate', 'deploy']);
  if (firstDeploy.status === 0) {
    console.log('[prisma-safe] Migrações aplicadas com sucesso.');
    return;
  }

  logBlock('Saída do primeiro deploy', firstDeploy.output);

  if (!autoResolveEnabled || !isP3009(firstDeploy.output)) {
    console.error('[prisma-safe] Falha no deploy de migração (sem auto-resolve).');
    process.exit(firstDeploy.status || 1);
  }

  const failedMigration = extractFailedMigrationName(firstDeploy.output);

  if (!failedMigration) {
    console.error(
      '[prisma-safe] P3009 detectado, mas não foi possível identificar a migração falha.',
    );
    process.exit(firstDeploy.status || 1);
  }

  if (!allowedMigrations.includes(failedMigration)) {
    console.error(
      `[prisma-safe] Migração falha "${failedMigration}" fora da lista permitida (${allowedMigrations.join(', ')}).`,
    );
    process.exit(firstDeploy.status || 1);
  }

  console.warn(
    `[prisma-safe] P3009 detectado para "${failedMigration}". Tentando resolve --rolled-back automático...`,
  );

  const resolveResult = runPrisma(['migrate', 'resolve', '--rolled-back', failedMigration]);
  if (resolveResult.status !== 0) {
    logBlock('Saída do resolve', resolveResult.output);
    console.error('[prisma-safe] Falha ao executar prisma migrate resolve.');
    process.exit(resolveResult.status || 1);
  }

  console.log('[prisma-safe] Resolve concluído. Executando deploy novamente...');

  const secondDeploy = runPrisma(['migrate', 'deploy'], { stdio: 'inherit' });
  if (secondDeploy.status !== 0) {
    console.error('[prisma-safe] Falha no segundo deploy de migração.');
    process.exit(secondDeploy.status || 1);
  }

  console.log('[prisma-safe] Migrações aplicadas com sucesso após auto-resolve.');
}

main();
