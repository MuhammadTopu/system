/*
  Warnings:

  - The values [Due,Completed] on the enum `Task_Status` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "Task_Priority" AS ENUM ('High', 'Medium', 'Low');

-- AlterEnum
BEGIN;
CREATE TYPE "Task_Status_new" AS ENUM ('DueNow', 'Upcoming', 'Future', 'Overdue', 'Complete');
ALTER TABLE "public"."tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "Task_Status_new" USING ("status"::text::"Task_Status_new");
ALTER TYPE "Task_Status" RENAME TO "Task_Status_old";
ALTER TYPE "Task_Status_new" RENAME TO "Task_Status";
DROP TYPE "public"."Task_Status_old";
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'DueNow';
COMMIT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "category" TEXT,
ADD COLUMN     "last_service_assumption" TEXT,
ADD COLUMN     "manufacturer_interval_uncertain" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "next_due_date" TEXT,
ADD COLUMN     "next_due_mileage" TEXT,
ADD COLUMN     "priority" "Task_Priority",
ADD COLUMN     "recommended_interval" TEXT,
ALTER COLUMN "status" SET DEFAULT 'DueNow';
