/*
  Warnings:

  - You are about to drop the column `amount` on the `payment_transactions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payment_transactions" DROP COLUMN "amount",
ADD COLUMN     "price" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "price" DOUBLE PRECISION,
ADD COLUMN     "service_id" TEXT;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
