CREATE TYPE "course_payment_model" AS ENUM ('cash', 'installments');

ALTER TABLE "courses"
    ADD COLUMN "payment_model" "course_payment_model" NOT NULL DEFAULT 'cash',
    ADD COLUMN "installment_months" INTEGER,
    ADD COLUMN "installment_value" DECIMAL(12,2);
