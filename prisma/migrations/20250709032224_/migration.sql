/*
  Warnings:

  - You are about to drop the column `raw_status` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `reference_number` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `withdraw_via` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the `_PaymentTransactionToSubscription` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_PaymentTransactionToSubscription" DROP CONSTRAINT "_PaymentTransactionToSubscription_A_fkey";

-- DropForeignKey
ALTER TABLE "_PaymentTransactionToSubscription" DROP CONSTRAINT "_PaymentTransactionToSubscription_B_fkey";

-- AlterTable
ALTER TABLE "payment_transactions" DROP COLUMN "raw_status",
DROP COLUMN "reference_number",
DROP COLUMN "type",
DROP COLUMN "withdraw_via";

-- DropTable
DROP TABLE "_PaymentTransactionToSubscription";

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
