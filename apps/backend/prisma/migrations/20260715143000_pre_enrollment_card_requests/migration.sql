ALTER TYPE "credit_card_payment_request_status"
  ADD VALUE IF NOT EXISTS 'waiting_course_start';

ALTER TABLE "student_courses"
  ADD COLUMN "selected_payment_option_id" TEXT,
  ADD COLUMN "selected_payment_option" JSONB,
  ADD COLUMN "selected_enrollment_payment_option_id" TEXT,
  ADD COLUMN "selected_enrollment_payment_option" JSONB,
  ADD COLUMN "enrollment_fee_paid_at" TIMESTAMP(3),
  ADD COLUMN "course_payment_paid_at" TIMESTAMP(3);

CREATE INDEX "student_courses_selected_payment_option_idx"
  ON "student_courses"("selected_payment_option_id");

CREATE INDEX "student_courses_selected_enrollment_payment_option_idx"
  ON "student_courses"("selected_enrollment_payment_option_id");

ALTER TABLE "credit_card_payment_requests"
  DROP CONSTRAINT "credit_card_payment_requests_monthly_charge_id_fkey",
  DROP CONSTRAINT "credit_card_payment_requests_enrollment_id_fkey";

ALTER TABLE "credit_card_payment_requests"
  ALTER COLUMN "monthly_charge_id" DROP NOT NULL,
  ALTER COLUMN "enrollment_id" DROP NOT NULL,
  ADD COLUMN "student_course_id" UUID,
  ADD COLUMN "kind" "monthly_charge_kind" NOT NULL DEFAULT 'course_payment';

UPDATE "credit_card_payment_requests" request
SET "kind" = charge."kind"
FROM "monthly_charges" charge
WHERE charge."id" = request."monthly_charge_id";

ALTER TABLE "credit_card_payment_requests"
  ADD CONSTRAINT "credit_card_payment_requests_monthly_charge_id_fkey"
    FOREIGN KEY ("monthly_charge_id") REFERENCES "monthly_charges"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "credit_card_payment_requests_enrollment_id_fkey"
    FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "credit_card_payment_requests_student_course_id_fkey"
    FOREIGN KEY ("student_course_id") REFERENCES "student_courses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "credit_card_payment_requests_student_course_kind_key"
  ON "credit_card_payment_requests"("student_course_id", "kind");
