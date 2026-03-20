CREATE TYPE "course_status" AS ENUM ('active', 'draft', 'inactive');
CREATE TYPE "course_modality" AS ENUM ('presencial', 'hibrido', 'ead');
CREATE TYPE "upload_owner_type" AS ENUM ('course', 'user', 'student', 'class', 'enrollment');

ALTER TABLE "courses"
    ADD COLUMN "category" TEXT,
    ADD COLUMN "coordinator" TEXT,
    ADD COLUMN "price" DECIMAL(12,2),
    ADD COLUMN "modality" "course_modality" NOT NULL DEFAULT 'presencial',
    ADD COLUMN "status" "course_status" NOT NULL DEFAULT 'active';

CREATE TABLE "upload_assets" (
    "id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "upload_bindings" (
    "id" UUID NOT NULL,
    "owner_type" "upload_owner_type" NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "asset_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_bindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "upload_assets_storage_path_key" ON "upload_assets"("storage_path");
CREATE UNIQUE INDEX "upload_bindings_owner_kind_key" ON "upload_bindings"("owner_type", "owner_id", "kind");
CREATE INDEX "upload_bindings_owner_idx" ON "upload_bindings"("owner_type", "owner_id");

ALTER TABLE "upload_bindings"
    ADD CONSTRAINT "upload_bindings_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "upload_assets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
