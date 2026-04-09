ALTER TABLE "contract_templates"
  ADD COLUMN "institution_signed_at" TIMESTAMP(3),
  ADD COLUMN "institution_signed_by_user_id" UUID,
  ADD COLUMN "institution_signed_by_name" TEXT;