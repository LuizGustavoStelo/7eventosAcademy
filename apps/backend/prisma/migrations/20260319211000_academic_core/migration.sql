CREATE TYPE "class_status" AS ENUM ('planning', 'enrollments_open', 'in_progress', 'closed');
CREATE TYPE "enrollment_status" AS ENUM ('active', 'canceled', 'completed');
CREATE TYPE "charge_status" AS ENUM ('pending', 'paid', 'overdue', 'canceled');
CREATE TYPE "transaction_status" AS ENUM ('pending', 'success', 'failed', 'refunded');

CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workload_hours" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "total_seats" INTEGER NOT NULL,
    "occupied_seats" INTEGER NOT NULL DEFAULT 0,
    "status" "class_status" NOT NULL DEFAULT 'enrollments_open',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "enrollment_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monthly_charges" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "charge_status" NOT NULL DEFAULT 'pending',
    "external_charge_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_charges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "monthly_charge_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'pending',
    "external_transaction_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "enrollments_class_id_student_id_key" ON "enrollments"("class_id", "student_id");
CREATE UNIQUE INDEX "monthly_charges_external_charge_id_key" ON "monthly_charges"("external_charge_id");
CREATE UNIQUE INDEX "payment_transactions_external_transaction_id_key" ON "payment_transactions"("external_transaction_id");

ALTER TABLE "classes"
    ADD CONSTRAINT "classes_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrollments"
    ADD CONSTRAINT "enrollments_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrollments"
    ADD CONSTRAINT "enrollments_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "monthly_charges"
    ADD CONSTRAINT "monthly_charges_enrollment_id_fkey"
    FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_transactions"
    ADD CONSTRAINT "payment_transactions_monthly_charge_id_fkey"
    FOREIGN KEY ("monthly_charge_id") REFERENCES "monthly_charges"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
