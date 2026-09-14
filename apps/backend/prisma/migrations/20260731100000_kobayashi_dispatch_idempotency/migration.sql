ALTER TABLE "institution_integration_dispatch_logs"
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "institution_integration_dispatch_logs_idempotency_key_key"
  ON "institution_integration_dispatch_logs"("idempotency_key");
