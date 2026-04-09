ALTER TABLE "finance_vouchers"
  ADD COLUMN "max_uses" INTEGER,
  ADD COLUMN "usage_count" INTEGER NOT NULL DEFAULT 0;