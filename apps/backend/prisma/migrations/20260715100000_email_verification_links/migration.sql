DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verification_code_hash'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verification_token_hash'
  ) THEN
    ALTER TABLE "users"
      RENAME COLUMN "email_verification_code_hash" TO "email_verification_token_hash";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verification_code_expires_at'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verification_token_expires_at'
  ) THEN
    ALTER TABLE "users"
      RENAME COLUMN "email_verification_code_expires_at" TO "email_verification_token_expires_at";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verification_code_sent_at'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verification_email_sent_at'
  ) THEN
    ALTER TABLE "users"
      RENAME COLUMN "email_verification_code_sent_at" TO "email_verification_email_sent_at";
  END IF;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verification_token_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "email_verification_token_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "email_verification_email_sent_at" TIMESTAMP(3);
