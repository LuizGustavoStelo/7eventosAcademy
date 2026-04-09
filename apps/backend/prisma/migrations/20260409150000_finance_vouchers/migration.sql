CREATE TYPE "finance_voucher_discount_type" AS ENUM ('percent', 'fixed');
CREATE TYPE "finance_voucher_applies_to" AS ENUM ('total', 'installment');

CREATE TABLE "finance_vouchers" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "owner_admin_id" UUID,
  "course_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT,
  "discount_type" "finance_voucher_discount_type" NOT NULL,
  "discount_value" DECIMAL(12, 2) NOT NULL,
  "applies_to" "finance_voucher_applies_to" NOT NULL,
  "allowed_payment_option_ids" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "finance_vouchers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_vouchers_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "finance_vouchers_owner_admin_id_fkey"
    FOREIGN KEY ("owner_admin_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "finance_vouchers_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "finance_vouchers_institution_code_key"
ON "finance_vouchers"("institution_id", "code");

CREATE INDEX "finance_vouchers_institution_idx"
ON "finance_vouchers"("institution_id");

CREATE INDEX "finance_vouchers_owner_admin_idx"
ON "finance_vouchers"("owner_admin_id");

CREATE INDEX "finance_vouchers_course_active_idx"
ON "finance_vouchers"("course_id", "active");
