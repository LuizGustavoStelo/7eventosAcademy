ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "email_confirmed_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "email_verification_code_hash" TEXT,
ADD COLUMN IF NOT EXISTS "email_verification_code_expires_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "email_verification_code_sent_at" TIMESTAMP(3);

UPDATE "users"
SET "email_confirmed_at" = COALESCE("email_confirmed_at", "created_at")
WHERE "email_confirmed_at" IS NULL;
