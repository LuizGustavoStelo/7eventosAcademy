#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const schemaPath = process.env.PRISMA_SCHEMA_PATH || 'prisma/schema.prisma';

const autoResolveEnabled =
  String(process.env.PRISMA_AUTO_RESOLVE_FAILED_MIGRATIONS ?? 'true').toLowerCase() !==
  'false';

const defaultAllowedMigrations = [
  '20260329110000_email_verification',
  '20260403120000_student_profile_enrollment_fields',
  '20260406153000_course_payment_options',
  '20260406170000_enrollment_payment_option_snapshot',
  '20260408223000_password_reset_code_flow',
];

const allowedMigrations = (
  process.env.PRISMA_AUTO_RESOLVE_ALLOWLIST || defaultAllowedMigrations.join(',')
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

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
    console.error('[prisma-safe] P3009 detectado, mas não foi possível identificar a migração falha.');
    process.exit(firstDeploy.status || 1);
  }

  if (!allowedMigrations.includes(failedMigration)) {
    console.error(
      `[prisma-safe] Migração falha "${failedMigration}" não está na allowlist (${allowedMigrations.join(', ')}).`,
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
