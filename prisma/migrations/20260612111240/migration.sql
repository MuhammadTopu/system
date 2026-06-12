/*
  Warnings:

  - The values [Overdue] on the enum `Task_Status` will be removed. If these variants are still used in the database, this will fail.
  - The `shop_suggestions` column on the `tasks` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `items` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[provider_payment_intent_id]` on the table `payment_transactions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[item_id,upcoming_task]` on the table `tasks` will be added. If there are existing duplicate values, this will fail.
  - Made the column `status` on table `payment_transactions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Task_Status_new" AS ENUM ('Due', 'Completed');
ALTER TABLE "public"."tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "Task_Status_new" USING ("status"::text::"Task_Status_new");
ALTER TYPE "Task_Status" RENAME TO "Task_Status_old";
ALTER TYPE "Task_Status_new" RENAME TO "Task_Status";
DROP TYPE "public"."Task_Status_old";
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'Due';
COMMIT;

-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_item_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_user_id_fkey";

-- DropIndex
DROP INDEX "tasks_item_id_key";

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "provider_charge_id" TEXT,
ADD COLUMN     "provider_customer_id" TEXT,
ADD COLUMN     "provider_payment_intent_id" TEXT,
ADD COLUMN     "provider_payment_method_id" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "shop_suggestions",
ADD COLUMN     "shop_suggestions" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "items";

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "purchase_date" TIMESTAMP(3),
    "total_mileage" DOUBLE PRECISION,
    "year_of_the_model" TEXT,
    "image_url" TEXT,
    "category" "Category" DEFAULT 'Custom',
    "service_intervals" TEXT[],
    "forum_suggestions" TEXT[],

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question" TEXT[],
    "itemId" TEXT NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questions_itemId_key" ON "questions"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_payment_intent_id_key" ON "payment_transactions"("provider_payment_intent_id");

-- CreateIndex
CREATE INDEX "tasks_item_id_idx" ON "tasks"("item_id");

-- CreateIndex
CREATE INDEX "tasks_user_id_idx" ON "tasks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_item_id_upcoming_task_key" ON "tasks"("item_id", "upcoming_task");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
