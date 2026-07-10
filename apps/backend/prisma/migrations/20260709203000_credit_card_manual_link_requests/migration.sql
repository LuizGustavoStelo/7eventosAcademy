CREATE TYPE "credit_card_payment_request_status" AS ENUM (
  'requested',
  'link_sent',
  'viewed',
  'copied',
  'approved',
  'canceled'
);

CREATE TABLE "credit_card_payment_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "monthly_charge_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "owner_admin_id" UUID,
  "institution_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "installment_count" INTEGER,
  "installment_amount" DECIMAL(12,2),
  "status" "credit_card_payment_request_status" NOT NULL DEFAULT 'requested',
  "payment_link_url" TEXT,
  "admin_note" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "link_sent_at" TIMESTAMP(3),
  "viewed_at" TIMESTAMP(3),
  "copied_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "approved_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "credit_card_payment_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_card_payment_requests_charge_key"
  ON "credit_card_payment_requests"("monthly_charge_id");

CREATE INDEX "credit_card_payment_requests_owner_status_idx"
  ON "credit_card_payment_requests"("owner_admin_id", "status");

CREATE INDEX "credit_card_payment_requests_student_status_idx"
  ON "credit_card_payment_requests"("student_id", "status");

CREATE INDEX "credit_card_payment_requests_institution_requested_idx"
  ON "credit_card_payment_requests"("institution_id", "requested_at");

ALTER TABLE "credit_card_payment_requests"
  ADD CONSTRAINT "credit_card_payment_requests_monthly_charge_id_fkey"
  FOREIGN KEY ("monthly_charge_id") REFERENCES "monthly_charges"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credit_card_payment_requests"
  ADD CONSTRAINT "credit_card_payment_requests_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credit_card_payment_requests"
  ADD CONSTRAINT "credit_card_payment_requests_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credit_card_payment_requests"
  ADD CONSTRAINT "credit_card_payment_requests_owner_admin_id_fkey"
  FOREIGN KEY ("owner_admin_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_card_payment_requests"
  ADD CONSTRAINT "credit_card_payment_requests_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credit_card_payment_requests"
  ADD CONSTRAINT "credit_card_payment_requests_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
