CREATE TYPE "institution_status" AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE "institution_member_status" AS ENUM ('active', 'invited', 'suspended');

CREATE TABLE "institutions" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "institution_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "institutions_slug_key" ON "institutions"("slug");
CREATE INDEX "institutions_status_idx" ON "institutions"("status");

CREATE TABLE "permissions" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

CREATE TABLE "institution_roles" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "institution_roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_roles_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "institution_roles_institution_code_key"
ON "institution_roles"("institution_id", "code");
CREATE INDEX "institution_roles_institution_idx"
ON "institution_roles"("institution_id");

CREATE TABLE "role_permissions" (
  "role_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id"),
  CONSTRAINT "role_permissions_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "institution_roles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_permission_id_fkey"
    FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "role_permissions_permission_idx"
ON "role_permissions"("permission_id");

CREATE TABLE "institution_members" (
  "id" UUID NOT NULL,
  "institution_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "institution_member_status" NOT NULL DEFAULT 'active',
  "joined_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "institution_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_members_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "institution_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "institution_members_institution_user_key"
ON "institution_members"("institution_id", "user_id");
CREATE INDEX "institution_members_user_idx"
ON "institution_members"("user_id");
CREATE INDEX "institution_members_institution_status_idx"
ON "institution_members"("institution_id", "status");

CREATE TABLE "member_roles" (
  "member_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "member_roles_pkey" PRIMARY KEY ("member_id", "role_id"),
  CONSTRAINT "member_roles_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "institution_members"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "member_roles_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "institution_roles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "member_roles_role_idx"
ON "member_roles"("role_id");

INSERT INTO "permissions" ("id", "code", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'institution.members.read', 'Visualizar membros da instituição', NOW(), NOW()),
  (gen_random_uuid(), 'institution.members.invite', 'Convidar membros para instituição', NOW(), NOW()),
  (gen_random_uuid(), 'institution.members.manage_roles', 'Gerenciar papéis dos membros', NOW(), NOW()),
  (gen_random_uuid(), 'courses.read', 'Visualizar cursos', NOW(), NOW()),
  (gen_random_uuid(), 'courses.create', 'Criar cursos', NOW(), NOW()),
  (gen_random_uuid(), 'courses.update', 'Editar cursos', NOW(), NOW()),
  (gen_random_uuid(), 'courses.delete', 'Excluir cursos', NOW(), NOW()),
  (gen_random_uuid(), 'classes.read', 'Visualizar turmas', NOW(), NOW()),
  (gen_random_uuid(), 'classes.create', 'Criar turmas', NOW(), NOW()),
  (gen_random_uuid(), 'classes.update', 'Editar turmas', NOW(), NOW()),
  (gen_random_uuid(), 'classes.delete', 'Excluir turmas', NOW(), NOW()),
  (gen_random_uuid(), 'students.read', 'Visualizar alunos', NOW(), NOW()),
  (gen_random_uuid(), 'students.create', 'Criar alunos', NOW(), NOW()),
  (gen_random_uuid(), 'students.update', 'Editar alunos', NOW(), NOW()),
  (gen_random_uuid(), 'students.delete', 'Excluir alunos', NOW(), NOW()),
  (gen_random_uuid(), 'enrollments.read', 'Visualizar matrículas', NOW(), NOW()),
  (gen_random_uuid(), 'enrollments.create', 'Criar matrículas', NOW(), NOW()),
  (gen_random_uuid(), 'enrollments.delete', 'Excluir matrículas', NOW(), NOW()),
  (gen_random_uuid(), 'attendance.read', 'Visualizar presença', NOW(), NOW()),
  (gen_random_uuid(), 'attendance.write', 'Lançar presença', NOW(), NOW()),
  (gen_random_uuid(), 'materials.read', 'Visualizar materiais', NOW(), NOW()),
  (gen_random_uuid(), 'materials.write', 'Gerenciar materiais', NOW(), NOW()),
  (gen_random_uuid(), 'notices.write', 'Gerenciar avisos', NOW(), NOW()),
  (gen_random_uuid(), 'finance.read', 'Visualizar financeiro', NOW(), NOW()),
  (gen_random_uuid(), 'finance.write', 'Gerenciar financeiro', NOW(), NOW()),
  (gen_random_uuid(), 'finance.reconcile', 'Conciliar financeiro', NOW(), NOW()),
  (gen_random_uuid(), 'reports.read', 'Visualizar relatórios', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "institutions" ("id", "name", "slug", "status", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  CONCAT('Instituição de ', COALESCE(NULLIF(TRIM(u."name"), ''), SUBSTRING(REPLACE(u."id"::text, '-', '') FROM 1 FOR 8))),
  CONCAT('inst-', REPLACE(u."id"::text, '-', '')),
  'active'::"institution_status",
  NOW(),
  NOW()
FROM "users" u
WHERE u."role" = 'admin'::"user_role"
  AND NOT EXISTS (
    SELECT 1
    FROM "institutions" i
    WHERE i."slug" = CONCAT('inst-', REPLACE(u."id"::text, '-', ''))
  );

INSERT INTO "institution_members" (
  "id",
  "institution_id",
  "user_id",
  "status",
  "joined_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  i."id",
  u."id",
  'active'::"institution_member_status",
  NOW(),
  NOW(),
  NOW()
FROM "users" u
JOIN "institutions" i
  ON i."slug" = CONCAT('inst-', REPLACE(u."id"::text, '-', ''))
WHERE u."role" = 'admin'::"user_role"
  AND NOT EXISTS (
    SELECT 1
    FROM "institution_members" im
    WHERE im."institution_id" = i."id"
      AND im."user_id" = u."id"
  );

INSERT INTO "institution_roles" (
  "id",
  "institution_id",
  "code",
  "name",
  "is_system",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  i."id",
  role_template."code",
  role_template."name",
  true,
  NOW(),
  NOW()
FROM "institutions" i
CROSS JOIN (
  VALUES
    ('institution_owner', 'Dono da instituição'),
    ('institution_admin', 'Administrador da instituição'),
    ('coordinator', 'Coordenador'),
    ('professor', 'Professor'),
    ('tutor', 'Tutor'),
    ('secretaria', 'Secretaria'),
    ('financeiro', 'Financeiro'),
    ('viewer', 'Visualizador')
) AS role_template("code", "name")
ON CONFLICT ("institution_id", "code")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "is_system" = true,
  "updated_at" = NOW();

WITH role_permission_map AS (
  SELECT *
  FROM (
    VALUES
      ('institution_owner', 'institution.members.read'),
      ('institution_owner', 'institution.members.invite'),
      ('institution_owner', 'institution.members.manage_roles'),
      ('institution_owner', 'courses.read'),
      ('institution_owner', 'courses.create'),
      ('institution_owner', 'courses.update'),
      ('institution_owner', 'courses.delete'),
      ('institution_owner', 'classes.read'),
      ('institution_owner', 'classes.create'),
      ('institution_owner', 'classes.update'),
      ('institution_owner', 'classes.delete'),
      ('institution_owner', 'students.read'),
      ('institution_owner', 'students.create'),
      ('institution_owner', 'students.update'),
      ('institution_owner', 'students.delete'),
      ('institution_owner', 'enrollments.read'),
      ('institution_owner', 'enrollments.create'),
      ('institution_owner', 'enrollments.delete'),
      ('institution_owner', 'attendance.read'),
      ('institution_owner', 'attendance.write'),
      ('institution_owner', 'materials.read'),
      ('institution_owner', 'materials.write'),
      ('institution_owner', 'notices.write'),
      ('institution_owner', 'finance.read'),
      ('institution_owner', 'finance.write'),
      ('institution_owner', 'finance.reconcile'),
      ('institution_owner', 'reports.read'),

      ('institution_admin', 'institution.members.read'),
      ('institution_admin', 'institution.members.invite'),
      ('institution_admin', 'courses.read'),
      ('institution_admin', 'courses.create'),
      ('institution_admin', 'courses.update'),
      ('institution_admin', 'courses.delete'),
      ('institution_admin', 'classes.read'),
      ('institution_admin', 'classes.create'),
      ('institution_admin', 'classes.update'),
      ('institution_admin', 'classes.delete'),
      ('institution_admin', 'students.read'),
      ('institution_admin', 'students.create'),
      ('institution_admin', 'students.update'),
      ('institution_admin', 'students.delete'),
      ('institution_admin', 'enrollments.read'),
      ('institution_admin', 'enrollments.create'),
      ('institution_admin', 'enrollments.delete'),
      ('institution_admin', 'attendance.read'),
      ('institution_admin', 'attendance.write'),
      ('institution_admin', 'materials.read'),
      ('institution_admin', 'materials.write'),
      ('institution_admin', 'notices.write'),
      ('institution_admin', 'finance.read'),
      ('institution_admin', 'finance.write'),
      ('institution_admin', 'reports.read'),

      ('coordinator', 'courses.read'),
      ('coordinator', 'courses.create'),
      ('coordinator', 'courses.update'),
      ('coordinator', 'classes.read'),
      ('coordinator', 'classes.create'),
      ('coordinator', 'classes.update'),
      ('coordinator', 'students.read'),
      ('coordinator', 'students.create'),
      ('coordinator', 'students.update'),
      ('coordinator', 'enrollments.read'),
      ('coordinator', 'enrollments.create'),
      ('coordinator', 'attendance.read'),
      ('coordinator', 'materials.read'),
      ('coordinator', 'materials.write'),
      ('coordinator', 'notices.write'),
      ('coordinator', 'reports.read'),

      ('professor', 'courses.read'),
      ('professor', 'classes.read'),
      ('professor', 'students.read'),
      ('professor', 'enrollments.read'),
      ('professor', 'attendance.read'),
      ('professor', 'attendance.write'),
      ('professor', 'materials.read'),
      ('professor', 'materials.write'),
      ('professor', 'notices.write'),

      ('tutor', 'courses.read'),
      ('tutor', 'classes.read'),
      ('tutor', 'students.read'),
      ('tutor', 'enrollments.read'),
      ('tutor', 'attendance.read'),
      ('tutor', 'materials.read'),

      ('secretaria', 'students.read'),
      ('secretaria', 'students.create'),
      ('secretaria', 'students.update'),
      ('secretaria', 'enrollments.read'),
      ('secretaria', 'enrollments.create'),
      ('secretaria', 'enrollments.delete'),
      ('secretaria', 'reports.read'),

      ('financeiro', 'students.read'),
      ('financeiro', 'enrollments.read'),
      ('financeiro', 'finance.read'),
      ('financeiro', 'finance.write'),
      ('financeiro', 'finance.reconcile'),
      ('financeiro', 'reports.read'),

      ('viewer', 'courses.read'),
      ('viewer', 'classes.read'),
      ('viewer', 'students.read'),
      ('viewer', 'enrollments.read'),
      ('viewer', 'attendance.read'),
      ('viewer', 'materials.read'),
      ('viewer', 'finance.read'),
      ('viewer', 'reports.read')
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

INSERT INTO "member_roles" ("member_id", "role_id", "created_at")
SELECT
  im."id",
  r."id",
  NOW()
FROM "institution_members" im
JOIN "users" u
  ON u."id" = im."user_id"
JOIN "institution_roles" r
  ON r."institution_id" = im."institution_id"
 AND r."code" = 'institution_owner'
WHERE u."role" = 'admin'::"user_role"
ON CONFLICT ("member_id", "role_id") DO NOTHING;
