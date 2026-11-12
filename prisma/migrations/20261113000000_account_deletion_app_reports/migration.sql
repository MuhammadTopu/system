-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('bug', 'crash', 'performance', 'ui_issue', 'ai_suggestions', 'notifications', 'payment', 'account', 'feature_request', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'in_review', 'resolved', 'rejected');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletion_reason" TEXT;

-- CreateTable
CREATE TABLE "app_reports" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "screenshots" TEXT[],
    "platform" TEXT,
    "app_version" TEXT,
    "device_model" TEXT,
    "os_version" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "admin_response" TEXT,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "app_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_reports_user_id_created_at_idx" ON "app_reports"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "app_reports_status_created_at_idx" ON "app_reports"("status", "created_at");

-- AddForeignKey
ALTER TABLE "app_reports" ADD CONSTRAINT "app_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

