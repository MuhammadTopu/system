/*
  Warnings:

  - Made the column `userAnswer` on table `questions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "average_mileage_per_year" DOUBLE PRECISION,
ADD COLUMN     "current_date" TIMESTAMP(3),
ADD COLUMN     "current_mileage" DOUBLE PRECISION,
ADD COLUMN     "drivetrain" TEXT,
ADD COLUMN     "engine" TEXT,
ADD COLUMN     "transmission" TEXT,
ADD COLUMN     "user_notes" TEXT;

-- AlterTable
ALTER TABLE "questions" ALTER COLUMN "userAnswer" SET NOT NULL;
