CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'live_status') THEN
    CREATE TYPE "live_status" AS ENUM ('scheduled', 'live', 'ended');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "study_materials" (
  "id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "file_url" TEXT,
  "external_url" TEXT,
  "mime_type" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'file',
  "published_by" TEXT,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "study_materials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "study_materials_class_idx"
ON "study_materials"("class_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'study_materials_class_id_fkey'
  ) THEN
    ALTER TABLE "study_materials"
    ADD CONSTRAINT "study_materials_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "class_notices" (
  "id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "published_by" TEXT,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "class_notices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "class_notices_class_idx"
ON "class_notices"("class_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_notices_class_id_fkey'
  ) THEN
    ALTER TABLE "class_notices"
    ADD CONSTRAINT "class_notices_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "lives" (
  "id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "instructor" TEXT,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "duration_minutes" INTEGER,
  "status" "live_status" NOT NULL DEFAULT 'scheduled',
  "stream_url" TEXT,
  "recording_url" TEXT,
  "provider" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lives_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lives_class_idx" ON "lives"("class_id");
CREATE INDEX IF NOT EXISTS "lives_status_idx" ON "lives"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lives_class_id_fkey'
  ) THEN
    ALTER TABLE "lives"
    ADD CONSTRAINT "lives_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
