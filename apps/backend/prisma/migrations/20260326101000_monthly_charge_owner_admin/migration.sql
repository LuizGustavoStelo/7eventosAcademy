-- AlterTable
ALTER TABLE "monthly_charges"
ADD COLUMN "owner_admin_id" UUID;

-- CreateIndex
CREATE INDEX "monthly_charges_owner_admin_idx"
ON "monthly_charges"("owner_admin_id");

-- AddForeignKey
ALTER TABLE "monthly_charges"
ADD CONSTRAINT "monthly_charges_owner_admin_id_fkey"
FOREIGN KEY ("owner_admin_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
