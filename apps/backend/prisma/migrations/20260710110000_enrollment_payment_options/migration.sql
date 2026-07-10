CREATE TYPE "monthly_charge_kind" AS ENUM (
  'course_payment',
  'enrollment_fee'
);

ALTER TABLE "courses"
  ADD COLUMN "enrollment_payment_options" JSONB;

ALTER TABLE "enrollments"
  ADD COLUMN "selected_enrollment_payment_option_id" TEXT,
  ADD COLUMN "selected_enrollment_payment_option" JSONB;

ALTER TABLE "monthly_charges"
  ADD COLUMN "kind" "monthly_charge_kind" NOT NULL DEFAULT 'course_payment';

CREATE INDEX "enrollments_selected_enrollment_payment_option_idx"
  ON "enrollments"("selected_enrollment_payment_option_id");
