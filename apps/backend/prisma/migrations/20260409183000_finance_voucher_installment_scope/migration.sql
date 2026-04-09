CREATE TYPE "finance_voucher_installment_scope" AS ENUM ('all', 'single');

ALTER TABLE "finance_vouchers"
  ADD COLUMN "installment_scope" "finance_voucher_installment_scope" NOT NULL DEFAULT 'all';