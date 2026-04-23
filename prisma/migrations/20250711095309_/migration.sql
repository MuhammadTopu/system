/*
  Warnings:

  - The `status` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `is_subscribed` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SubStat" AS ENUM ('Active', 'Ended');

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "status",
ADD COLUMN     "status" "SubStat" NOT NULL DEFAULT 'Active';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "is_subscribed",
ADD COLUMN     "is_subscribed" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "General_Settings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "timezone" TEXT,

    CONSTRAINT "General_Settings_pkey" PRIMARY KEY ("id")
);
