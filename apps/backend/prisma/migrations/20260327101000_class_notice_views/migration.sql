-- CreateTable
CREATE TABLE "class_notice_views" (
  "id" UUID NOT NULL,
  "notice_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "class_notice_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_notice_views_notice_user_key"
ON "class_notice_views"("notice_id", "user_id");

-- CreateIndex
CREATE INDEX "class_notice_views_notice_idx"
ON "class_notice_views"("notice_id");

-- CreateIndex
CREATE INDEX "class_notice_views_user_idx"
ON "class_notice_views"("user_id");

-- AddForeignKey
ALTER TABLE "class_notice_views"
ADD CONSTRAINT "class_notice_views_notice_id_fkey"
FOREIGN KEY ("notice_id") REFERENCES "class_notices"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_notice_views"
ADD CONSTRAINT "class_notice_views_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
