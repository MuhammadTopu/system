-- CreateEnum
CREATE TYPE "Type" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "type" "Type" NOT NULL DEFAULT 'USER';
