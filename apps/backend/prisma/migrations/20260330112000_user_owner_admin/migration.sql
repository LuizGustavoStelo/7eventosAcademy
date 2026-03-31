ALTER TABLE "users"
ADD COLUMN "owner_admin_id" UUID;

UPDATE "users" AS u
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
WHERE u."role" = 'user'::"user_role"
  AND u."owner_admin_id" IS NULL;

CREATE INDEX "users_owner_admin_idx"
ON "users"("owner_admin_id");

ALTER TABLE "users"
ADD CONSTRAINT "users_owner_admin_id_fkey"
FOREIGN KEY ("owner_admin_id") REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
