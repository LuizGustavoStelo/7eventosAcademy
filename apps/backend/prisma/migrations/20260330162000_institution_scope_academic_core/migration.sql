ALTER TABLE "users"
ADD COLUMN "institution_id" UUID;

ALTER TABLE "courses"
ADD COLUMN "institution_id" UUID;

ALTER TABLE "student_courses"
ADD COLUMN "institution_id" UUID;

ALTER TABLE "classes"
ADD COLUMN "institution_id" UUID;

ALTER TABLE "enrollments"
ADD COLUMN "institution_id" UUID;

UPDATE "users" u
SET "institution_id" = membership."institution_id"
FROM LATERAL (
  SELECT im."institution_id"
  FROM "institution_members" im
  WHERE im."user_id" = u."owner_admin_id"
    AND im."status" = 'active'::"institution_member_status"
  ORDER BY im."created_at" ASC
  LIMIT 1
) AS membership
WHERE u."role" = 'user'::"user_role"
  AND u."institution_id" IS NULL
  AND u."owner_admin_id" IS NOT NULL;

UPDATE "courses" c
SET "institution_id" = membership."institution_id"
FROM LATERAL (
  SELECT im."institution_id"
  FROM "institution_members" im
  WHERE im."user_id" = c."owner_admin_id"
    AND im."status" = 'active'::"institution_member_status"
  ORDER BY im."created_at" ASC
  LIMIT 1
) AS membership
WHERE c."institution_id" IS NULL;

UPDATE "classes" sc
SET "institution_id" = c."institution_id"
FROM "courses" c
WHERE sc."course_id" = c."id"
  AND sc."institution_id" IS NULL;

UPDATE "student_courses" sc
SET "institution_id" = c."institution_id"
FROM "courses" c
WHERE sc."course_id" = c."id"
  AND sc."institution_id" IS NULL;

UPDATE "enrollments" e
SET "institution_id" = sc."institution_id"
FROM "classes" sc
WHERE e."class_id" = sc."id"
  AND e."institution_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "courses" WHERE "institution_id" IS NULL) THEN
    RAISE EXCEPTION 'Não foi possível definir institution_id para todos os cursos.';
  END IF;
  IF EXISTS (SELECT 1 FROM "classes" WHERE "institution_id" IS NULL) THEN
    RAISE EXCEPTION 'Não foi possível definir institution_id para todas as turmas.';
  END IF;
  IF EXISTS (SELECT 1 FROM "student_courses" WHERE "institution_id" IS NULL) THEN
    RAISE EXCEPTION 'Não foi possível definir institution_id para todos os vínculos aluno-curso.';
  END IF;
  IF EXISTS (SELECT 1 FROM "enrollments" WHERE "institution_id" IS NULL) THEN
    RAISE EXCEPTION 'Não foi possível definir institution_id para todas as matrículas.';
  END IF;
END
$$;

ALTER TABLE "courses"
ALTER COLUMN "institution_id" SET NOT NULL;

ALTER TABLE "classes"
ALTER COLUMN "institution_id" SET NOT NULL;

ALTER TABLE "student_courses"
ALTER COLUMN "institution_id" SET NOT NULL;

ALTER TABLE "enrollments"
ALTER COLUMN "institution_id" SET NOT NULL;

CREATE INDEX "users_institution_idx"
ON "users"("institution_id");

CREATE INDEX "courses_institution_idx"
ON "courses"("institution_id");

CREATE INDEX "student_courses_institution_idx"
ON "student_courses"("institution_id");

CREATE INDEX "classes_institution_idx"
ON "classes"("institution_id");

CREATE INDEX "enrollments_institution_idx"
ON "enrollments"("institution_id");

ALTER TABLE "users"
ADD CONSTRAINT "users_institution_id_fkey"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "courses"
ADD CONSTRAINT "courses_institution_id_fkey"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "student_courses"
ADD CONSTRAINT "student_courses_institution_id_fkey"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "classes"
ADD CONSTRAINT "classes_institution_id_fkey"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "enrollments"
ADD CONSTRAINT "enrollments_institution_id_fkey"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
