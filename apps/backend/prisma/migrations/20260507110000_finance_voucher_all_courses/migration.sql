-- Permite voucher global (todos os cursos)
ALTER TABLE "finance_vouchers"
  ALTER COLUMN "course_id" DROP NOT NULL;

ALTER TABLE "finance_vouchers"
  DROP CONSTRAINT IF EXISTS "finance_vouchers_course_id_fkey";

ALTER TABLE "finance_vouchers"
  ADD CONSTRAINT "finance_vouchers_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
