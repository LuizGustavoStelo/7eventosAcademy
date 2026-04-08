ALTER TABLE "contract_templates"
  ADD COLUMN "auto_send_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "auto_send_all_courses" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "auto_send_course_ids" JSONB;
