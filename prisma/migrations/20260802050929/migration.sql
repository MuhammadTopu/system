/*
  Warnings:

  - A unique constraint covering the columns `[itemId,itemKey]` on the table `questions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category` to the `questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `itemKey` to the `questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maintenanceItem` to the `questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `priority` to the `questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reason` to the `questions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OptionType" AS ENUM ('Yes', 'No', 'Planned');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('High', 'Medium', 'Low');

-- DropIndex
DROP INDEX "questions_itemId_key";

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "itemKey" TEXT NOT NULL,
ADD COLUMN     "maintenanceItem" TEXT NOT NULL,
ADD COLUMN     "priority" "PriorityLevel" NOT NULL,
ADD COLUMN     "reason" TEXT NOT NULL,
ADD COLUMN     "userAnswer" "OptionType",
ALTER COLUMN "question" SET NOT NULL,
ALTER COLUMN "question" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "option" "OptionType" NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_questionId_option_key" ON "recommendations"("questionId", "option");

-- CreateIndex
CREATE UNIQUE INDEX "questions_itemId_itemKey_key" ON "questions"("itemId", "itemKey");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
