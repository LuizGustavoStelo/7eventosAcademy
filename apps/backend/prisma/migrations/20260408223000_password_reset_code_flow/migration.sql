ALTER TABLE "users"
ADD COLUMN "password_reset_code_hash" TEXT,
ADD COLUMN "password_reset_code_expires_at" TIMESTAMP(3),
ADD COLUMN "password_reset_code_sent_at" TIMESTAMP(3);
