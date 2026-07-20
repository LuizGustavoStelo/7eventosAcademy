CREATE TYPE "finance_voucher_value_base" AS ENUM ('regular', 'promotional');

ALTER TABLE "finance_vouchers"
  ADD COLUMN "value_base" "finance_voucher_value_base" NOT NULL DEFAULT 'regular';
