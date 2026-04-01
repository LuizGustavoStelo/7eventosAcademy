CREATE TYPE "contract_template_status" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "contract_instance_status" AS ENUM ('sent', 'viewed', 'pin_verified', 'signed', 'expired', 'archived', 'canceled');

CREATE TABLE "contract_templates" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "contract_template_status" NOT NULL DEFAULT 'draft',
  "draft_title" TEXT NOT NULL,
  "draft_html_content" TEXT NOT NULL,
  "latest_version_number" INTEGER NOT NULL DEFAULT 0,
  "published_at" TIMESTAMPTZ,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_templates_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_templates_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contract_templates_updated_by_user_id_fkey"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "contract_templates_institution_idx"
ON "contract_templates"("institution_id");

CREATE INDEX "contract_templates_institution_status_idx"
ON "contract_templates"("institution_id", "status");

CREATE TABLE "contract_template_versions" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "html_content" TEXT NOT NULL,
  "placeholders_json" JSONB,
  "content_hash" TEXT NOT NULL,
  "published_by_user_id" UUID NOT NULL,
  "published_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "contract_template_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_template_versions_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_template_versions_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_template_versions_published_by_user_id_fkey"
    FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "contract_template_versions_template_version_key"
ON "contract_template_versions"("template_id", "version_number");

CREATE INDEX "contract_template_versions_institution_idx"
ON "contract_template_versions"("institution_id");

CREATE TABLE "contract_instances" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "template_version_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "enrollment_id" UUID,
  "course_id" UUID,
  "class_id" UUID,
  "status" "contract_instance_status" NOT NULL DEFAULT 'sent',
  "sent_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "viewed_at" TIMESTAMPTZ,
  "signed_at" TIMESTAMPTZ,
  "archived_at" TIMESTAMPTZ,
  "archived_reason" TEXT,
  "snapshot_template_title" TEXT NOT NULL,
  "snapshot_template_html" TEXT NOT NULL,
  "snapshot_student_data" JSONB,
  "unsigned_html_snapshot" TEXT NOT NULL,
  "signed_html_snapshot" TEXT,
  "unsigned_content_hash" TEXT NOT NULL,
  "signed_content_hash" TEXT,
  "signed_pdf_hash" TEXT,
  "signature_code" TEXT NOT NULL,
  "accepted_terms_text" TEXT,
  "accepted_terms_version" TEXT,
  "accepted_at" TIMESTAMPTZ,
  "signer_ip" TEXT,
  "signer_user_agent" TEXT,
  "signer_timezone" TEXT,
  "signer_otp_channel" TEXT,
  "signer_otp_destination_masked" TEXT,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "contract_instances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_instances_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_instances_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contract_instances_template_version_id_fkey"
    FOREIGN KEY ("template_version_id") REFERENCES "contract_template_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contract_instances_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_instances_enrollment_id_fkey"
    FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "contract_instances_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "contract_instances_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "contract_instances_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "contract_instances_signature_code_key"
ON "contract_instances"("signature_code");

CREATE INDEX "contract_instances_institution_idx"
ON "contract_instances"("institution_id");

CREATE INDEX "contract_instances_institution_student_idx"
ON "contract_instances"("institution_id", "student_id");

CREATE INDEX "contract_instances_institution_status_idx"
ON "contract_instances"("institution_id", "status");

CREATE INDEX "contract_instances_template_idx"
ON "contract_instances"("template_id");

CREATE TABLE "contract_signing_tokens" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "contract_instance_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at" TIMESTAMPTZ,
  "otp_channel" TEXT NOT NULL DEFAULT 'email',
  "otp_destination" TEXT,
  "pin_hash" TEXT,
  "pin_expires_at" TIMESTAMPTZ,
  "pin_attempts" INTEGER NOT NULL DEFAULT 0,
  "pin_last_attempt_at" TIMESTAMPTZ,
  "pin_blocked_until" TIMESTAMPTZ,
  "verified_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "contract_signing_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_signing_tokens_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_signing_tokens_instance_id_fkey"
    FOREIGN KEY ("contract_instance_id") REFERENCES "contract_instances"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "contract_signing_tokens_token_hash_key"
ON "contract_signing_tokens"("token_hash");

CREATE INDEX "contract_signing_tokens_institution_idx"
ON "contract_signing_tokens"("institution_id");

CREATE INDEX "contract_signing_tokens_instance_idx"
ON "contract_signing_tokens"("contract_instance_id");

CREATE INDEX "contract_signing_tokens_expires_at_idx"
ON "contract_signing_tokens"("expires_at");

CREATE TABLE "contract_audit_logs" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "contract_instance_id" UUID NOT NULL,
  "contract_signing_token_id" UUID,
  "actor_type" TEXT NOT NULL,
  "actor_user_id" UUID,
  "action" TEXT NOT NULL,
  "payload" JSONB,
  "previous_hash" TEXT,
  "entry_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "contract_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_audit_logs_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_audit_logs_instance_id_fkey"
    FOREIGN KEY ("contract_instance_id") REFERENCES "contract_instances"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_audit_logs_token_id_fkey"
    FOREIGN KEY ("contract_signing_token_id") REFERENCES "contract_signing_tokens"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "contract_audit_logs_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "contract_audit_logs_institution_idx"
ON "contract_audit_logs"("institution_id");

CREATE INDEX "contract_audit_logs_instance_idx"
ON "contract_audit_logs"("contract_instance_id");

CREATE INDEX "contract_audit_logs_token_idx"
ON "contract_audit_logs"("contract_signing_token_id");

CREATE INDEX "contract_audit_logs_created_at_idx"
ON "contract_audit_logs"("created_at");

CREATE TABLE "contract_artifacts" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "contract_instance_id" UUID NOT NULL,
  "artifact_type" TEXT NOT NULL,
  "storage_provider" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "contract_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_artifacts_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_artifacts_instance_id_fkey"
    FOREIGN KEY ("contract_instance_id") REFERENCES "contract_instances"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "contract_artifacts_storage_key_key"
ON "contract_artifacts"("storage_key");

CREATE INDEX "contract_artifacts_institution_idx"
ON "contract_artifacts"("institution_id");

CREATE INDEX "contract_artifacts_instance_idx"
ON "contract_artifacts"("contract_instance_id");

INSERT INTO "permissions" ("id", "code", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'contracts.read', 'Visualizar contratos e modelos', NOW(), NOW()),
  (gen_random_uuid(), 'contracts.templates.write', 'Criar e editar modelos de contrato', NOW(), NOW()),
  (gen_random_uuid(), 'contracts.send', 'Enviar contratos para assinatura', NOW(), NOW()),
  (gen_random_uuid(), 'contracts.audit.read', 'Visualizar trilha de auditoria de contratos', NOW(), NOW()),
  (gen_random_uuid(), 'contracts.download', 'Baixar documentos de contrato', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

WITH role_permission_map AS (
  SELECT *
  FROM (
    VALUES
      ('institution_owner', 'contracts.read'),
      ('institution_owner', 'contracts.templates.write'),
      ('institution_owner', 'contracts.send'),
      ('institution_owner', 'contracts.audit.read'),
      ('institution_owner', 'contracts.download'),

      ('institution_admin', 'contracts.read'),
      ('institution_admin', 'contracts.templates.write'),
      ('institution_admin', 'contracts.send'),
      ('institution_admin', 'contracts.audit.read'),
      ('institution_admin', 'contracts.download'),

      ('coordinator', 'contracts.read'),
      ('coordinator', 'contracts.templates.write'),
      ('coordinator', 'contracts.send'),
      ('coordinator', 'contracts.download'),

      ('professor', 'contracts.read'),
      ('professor', 'contracts.templates.write'),
      ('professor', 'contracts.send'),
      ('professor', 'contracts.download'),

      ('tutor', 'contracts.read'),
      ('tutor', 'contracts.download'),

      ('secretaria', 'contracts.read'),
      ('secretaria', 'contracts.send'),
      ('secretaria', 'contracts.download'),

      ('financeiro', 'contracts.read'),
      ('financeiro', 'contracts.download'),

      ('viewer', 'contracts.read')
  ) AS map("role_code", "permission_code")
)
INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT
  r."id",
  p."id",
  NOW()
FROM "institution_roles" r
JOIN role_permission_map rpm
  ON rpm."role_code" = r."code"
JOIN "permissions" p
  ON p."code" = rpm."permission_code"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
