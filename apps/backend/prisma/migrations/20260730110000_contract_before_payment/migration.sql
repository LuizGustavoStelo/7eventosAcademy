ALTER TYPE "credit_card_payment_request_status"
  ADD VALUE IF NOT EXISTS 'waiting_contract_signature';

ALTER TABLE "contract_instances"
  ADD COLUMN IF NOT EXISTS "automatic_dispatch_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "contract_instances_automatic_dispatch_key_key"
  ON "contract_instances"("automatic_dispatch_key");

ALTER TABLE "monthly_charges"
  ADD COLUMN IF NOT EXISTS "awaiting_contract_signature" BOOLEAN NOT NULL DEFAULT false;

-- Registros existentes continuam com o fluxo financeiro atual. Apenas novas
-- matrículas passam a aguardar a assinatura antes de liberar as cobranças.
