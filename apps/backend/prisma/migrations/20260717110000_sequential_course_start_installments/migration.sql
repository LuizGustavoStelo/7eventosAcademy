BEGIN;

ALTER TABLE "monthly_charges"
  ADD COLUMN "installment_number" INTEGER,
  ADD COLUMN "installment_total" INTEGER,
  ADD COLUMN "awaiting_course_start" BOOLEAN NOT NULL DEFAULT false;

-- Converte somente planos parcelados que deveriam aguardar o inicio do curso,
-- ainda nao comecaram a cobrar e nao possuem titulos/transacoes no gateway.
CREATE TEMP TABLE "_course_start_enrollments" ON COMMIT DROP AS
SELECT
  enrollment."id" AS "enrollment_id",
  CASE
    WHEN enrollment."selected_payment_option"->>'installmentCount' ~ '^[0-9]+$'
      THEN (enrollment."selected_payment_option"->>'installmentCount')::INTEGER
    ELSE 1
  END AS "installment_total"
FROM "enrollments" enrollment
INNER JOIN "school_classes" school_class
  ON school_class."id" = enrollment."class_id"
WHERE enrollment."selected_payment_option"->>'installmentStartMode' = 'COURSE_START'
  AND enrollment."selected_payment_option"->>'type' = 'INSTALLMENTS'
  AND COALESCE(enrollment."selected_payment_option"->>'collectionMode', 'INSTALLMENT_CHARGES') <> 'MANUAL_LINK'
  AND enrollment."status" = 'active'
  AND school_class."status" IN ('planning', 'enrollments_open')
  AND NOT EXISTS (
    SELECT 1
    FROM "monthly_charges" existing_charge
    WHERE existing_charge."enrollment_id" = enrollment."id"
      AND existing_charge."kind" = 'course_payment'
      AND (
        existing_charge."status" = 'paid'
        OR existing_charge."external_charge_id" IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM "payment_transactions" payment_tx
          WHERE payment_tx."monthly_charge_id" = existing_charge."id"
        )
        OR EXISTS (
          SELECT 1
          FROM "credit_card_payment_requests" card_request
          WHERE card_request."monthly_charge_id" = existing_charge."id"
        )
      )
  );

CREATE TEMP TABLE "_course_start_ranked_charges" ON COMMIT DROP AS
SELECT
  charge."id",
  charge."enrollment_id",
  target."installment_total",
  ROW_NUMBER() OVER (
    PARTITION BY charge."enrollment_id"
    ORDER BY charge."due_date", charge."created_at", charge."id"
  ) AS "position"
FROM "monthly_charges" charge
INNER JOIN "_course_start_enrollments" target
  ON target."enrollment_id" = charge."enrollment_id"
WHERE charge."kind" = 'course_payment'
  AND charge."status" IN ('pending', 'overdue');

DELETE FROM "monthly_charges" charge
USING "_course_start_ranked_charges" ranked
WHERE charge."id" = ranked."id"
  AND ranked."position" > 1;

UPDATE "monthly_charges" charge
SET
  "installment_number" = 1,
  "installment_total" = ranked."installment_total",
  "awaiting_course_start" = true,
  "status" = 'pending',
  "due_date" = charge."created_at"
FROM "_course_start_ranked_charges" ranked
WHERE charge."id" = ranked."id"
  AND ranked."position" = 1;

CREATE UNIQUE INDEX "monthly_charges_enrollment_kind_installment_key"
  ON "monthly_charges"("enrollment_id", "kind", "installment_number");

COMMIT;
