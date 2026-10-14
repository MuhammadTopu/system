-- AlterEnum: plans are now Monthly, Yearly and Lifetime (HalfYearly and Free are gone).
-- Legacy rows are converted first so the type swap cannot fail:
--   * services rows for the removed plans are deleted (subscriptions keep their row, service_id becomes NULL)
--   * HalfYearly subscriptions become Yearly and Free subscriptions become Monthly; end_date is untouched,
--     so the access period stays exactly as it was
BEGIN;
UPDATE "subscriptions" SET "service_id" = NULL
  WHERE "service_id" IN (SELECT "id" FROM "services" WHERE "plan"::text IN ('HalfYearly', 'Free'));
DELETE FROM "services" WHERE "plan"::text IN ('HalfYearly', 'Free');
CREATE TYPE "Plan_new" AS ENUM ('Monthly', 'Yearly', 'Lifetime');
ALTER TABLE "subscriptions" ALTER COLUMN "plan" TYPE "Plan_new" USING (
  CASE "plan"::text WHEN 'HalfYearly' THEN 'Yearly' WHEN 'Free' THEN 'Monthly' ELSE "plan"::text END::"Plan_new"
);
ALTER TABLE "services" ALTER COLUMN "plan" TYPE "Plan_new" USING ("plan"::text::"Plan_new");
ALTER TYPE "Plan" RENAME TO "Plan_old";
ALTER TYPE "Plan_new" RENAME TO "Plan";
DROP TYPE "Plan_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubStat" ADD VALUE 'Cancelled';
ALTER TYPE "SubStat" ADD VALUE 'BillingIssue';
ALTER TYPE "SubStat" ADD VALUE 'Paused';

-- DropForeignKey
ALTER TABLE "user_payment_methods" DROP CONSTRAINT "user_payment_methods_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_subscription_id_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "billing_id",
DROP COLUMN "customer_id";

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "environment" TEXT,
ADD COLUMN     "grace_period_end" TIMESTAMP(3),
ADD COLUMN     "last_event_at" TIMESTAMP(3),
ADD COLUMN     "product_id" TEXT,
ADD COLUMN     "rc_original_transaction_id" TEXT,
ADD COLUMN     "store" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "will_renew" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "rc_product_id" TEXT;

-- DropTable
DROP TABLE "user_payment_methods";

-- DropTable
DROP TABLE "payment_transactions";

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rc_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "user_id" TEXT,
    "subscription_id" TEXT,
    "product_id" TEXT,
    "store" TEXT,
    "environment" TEXT,
    "price" DOUBLE PRECISION,
    "currency" TEXT,
    "event_timestamp" TIMESTAMP(3),
    "payload" JSONB NOT NULL,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_events_rc_event_id_key" ON "subscription_events"("rc_event_id");

-- CreateIndex
CREATE INDEX "subscription_events_user_id_idx" ON "subscription_events"("user_id");

-- CreateIndex
CREATE INDEX "subscription_events_type_event_timestamp_idx" ON "subscription_events"("type", "event_timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_rc_original_transaction_id_key" ON "subscriptions"("rc_original_transaction_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_end_date_idx" ON "subscriptions"("status", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "services_rc_product_id_key" ON "services"("rc_product_id");

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

