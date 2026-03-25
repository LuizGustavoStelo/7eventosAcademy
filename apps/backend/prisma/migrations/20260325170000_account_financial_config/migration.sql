-- CreateTable
CREATE TABLE "account_financial_configs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "encrypted_settings" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_financial_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_financial_configs_user_id_key" ON "account_financial_configs"("user_id");

-- CreateIndex
CREATE INDEX "account_financial_configs_provider_idx" ON "account_financial_configs"("provider");

-- AddForeignKey
ALTER TABLE "account_financial_configs" ADD CONSTRAINT "account_financial_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
