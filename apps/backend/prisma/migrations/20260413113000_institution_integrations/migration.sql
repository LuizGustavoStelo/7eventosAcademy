CREATE TABLE "institution_integrations" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "encrypted_settings" TEXT,
    "last_success_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "institution_integrations_institution_provider_key"
    ON "institution_integrations"("institution_id", "provider");

CREATE INDEX "institution_integrations_provider_idx"
    ON "institution_integrations"("provider");

CREATE INDEX "institution_integrations_institution_idx"
    ON "institution_integrations"("institution_id");

ALTER TABLE "institution_integrations"
    ADD CONSTRAINT "institution_integrations_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;