ALTER TABLE "courses"
ADD COLUMN "owner_admin_id" UUID;

UPDATE "courses" AS c
SET "owner_admin_id" = candidate."id"
FROM (
  SELECT "id"
  FROM "users"
  WHERE "role" IN ('admin'::"user_role", 'superadmin'::"user_role")
  ORDER BY
    CASE
      WHEN "role" = 'admin'::"user_role" THEN 0
      ELSE 1
    END,
    "created_at" ASC
  LIMIT 1
) AS candidate
WHERE c."owner_admin_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "courses"
    WHERE "owner_admin_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Não foi possível definir owner_admin_id para todos os cursos existentes.';
  END IF;
END
$$;

ALTER TABLE "courses"
ALTER COLUMN "owner_admin_id" SET NOT NULL;

CREATE INDEX "courses_owner_admin_idx"
ON "courses"("owner_admin_id");

ALTER TABLE "courses"
ADD CONSTRAINT "courses_owner_admin_id_fkey"
FOREIGN KEY ("owner_admin_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
