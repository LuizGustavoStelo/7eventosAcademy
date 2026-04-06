ALTER TABLE "enrollments"
    ADD COLUMN "selected_payment_option_id" TEXT,
    ADD COLUMN "selected_payment_option" JSONB;

CREATE INDEX "enrollments_selected_payment_option_idx"
    ON "enrollments" ("selected_payment_option_id");
