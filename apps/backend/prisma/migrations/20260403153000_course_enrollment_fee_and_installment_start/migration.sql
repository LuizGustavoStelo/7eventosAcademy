ALTER TABLE "courses"
    ADD COLUMN "enrollment_fee" DECIMAL(12,2),
    ADD COLUMN "installment_start_date" TIMESTAMP(3);
