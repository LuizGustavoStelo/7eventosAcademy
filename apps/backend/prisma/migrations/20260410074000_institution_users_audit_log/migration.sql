CREATE TABLE "institution_audit_logs" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "institution_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_audit_logs_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "institution_audit_logs_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "institution_audit_logs_institution_created_idx"
ON "institution_audit_logs"("institution_id", "created_at");

CREATE INDEX "institution_audit_logs_actor_created_idx"
ON "institution_audit_logs"("actor_user_id", "created_at");

CREATE INDEX "institution_audit_logs_resource_type_created_idx"
ON "institution_audit_logs"("resource_type", "created_at");

