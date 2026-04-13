CREATE TABLE "institution_integration_dispatch_logs" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "integration_id" UUID,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "student_id" UUID,
    "student_name" TEXT NOT NULL,
    "enrollment_id" UUID,
    "contract_instance_id" UUID,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "response_status_code" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_integration_dispatch_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inst_int_dispatch_inst_prov_created_idx"
    ON "institution_integration_dispatch_logs"("institution_id", "provider", "created_at");

CREATE INDEX "inst_int_dispatch_integration_created_idx"
    ON "institution_integration_dispatch_logs"("integration_id", "created_at");

CREATE INDEX "inst_int_dispatch_contract_instance_idx"
    ON "institution_integration_dispatch_logs"("contract_instance_id");

ALTER TABLE "institution_integration_dispatch_logs"
    ADD CONSTRAINT "institution_integration_dispatch_logs_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "institution_integration_dispatch_logs"
    ADD CONSTRAINT "institution_integration_dispatch_logs_integration_id_fkey"
    FOREIGN KEY ("integration_id") REFERENCES "institution_integrations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
