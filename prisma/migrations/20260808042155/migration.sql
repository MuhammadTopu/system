/*
  Warnings:

  - The `forum_suggestions` column on the `Item` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Item" DROP COLUMN "forum_suggestions",
ADD COLUMN     "forum_suggestions" JSONB;
