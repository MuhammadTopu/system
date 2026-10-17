-- CreateEnum
CREATE TYPE "UserSubscriptionStatus" AS ENUM ('active', 'expired');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "apple_id" TEXT,
ADD COLUMN     "firebase_id" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "subscribed_at" TIMESTAMP(3),
ADD COLUMN     "subscription_status" "UserSubscriptionStatus",
ADD COLUMN     "subscription_valid_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "subscription_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'revenuecat',
    "store" TEXT,
    "environment" TEXT,
    "order_id" TEXT,
    "reference_number" TEXT,
    "transaction_id" TEXT,
    "product_id" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "raw_status" TEXT,
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "paid_amount" DECIMAL(12,2),
    "paid_currency" TEXT,
    "purchased_at" TIMESTAMP(3),

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_order_id_key" ON "payment_transactions"("order_id");

-- CreateIndex
CREATE INDEX "payment_transactions_user_id_idx" ON "payment_transactions"("user_id");

-- CreateIndex
CREATE INDEX "payment_transactions_subscription_id_idx" ON "payment_transactions"("subscription_id");

-- CreateIndex
CREATE INDEX "payment_transactions_status_created_at_idx" ON "payment_transactions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_id_key" ON "users"("firebase_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_apple_id_key" ON "users"("apple_id");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Backfill: user subscription summary from existing subscriptions
UPDATE "users" u SET
  "subscribed_at" = s.first_start,
  "subscription_valid_until" = s.last_end,
  "subscription_status" = CASE WHEN EXISTS (
      SELECT 1 FROM "subscriptions" a
      WHERE a."user_id" = u."id"
        AND a."status" IN ('Active', 'Cancelled', 'BillingIssue')
        AND (a."end_date" > now() OR a."grace_period_end" > now())
    ) THEN 'active'::"UserSubscriptionStatus" ELSE 'expired'::"UserSubscriptionStatus" END
FROM (
  SELECT "user_id", min("start_date") AS first_start,
         max(GREATEST("end_date", COALESCE("grace_period_end", "end_date"))) AS last_end
  FROM "subscriptions" GROUP BY "user_id"
) s
WHERE s."user_id" = u."id";

-- Backfill: payment transactions from the RevenueCat purchase events already logged
INSERT INTO "payment_transactions" (
  "id", "created_at", "updated_at", "user_id", "subscription_id", "provider", "store", "environment",
  "order_id", "reference_number", "transaction_id", "product_id", "type", "status", "raw_status",
  "amount", "currency", "paid_amount", "paid_currency", "purchased_at"
)
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text || e."id"), 1, 24),
  e."created_at", e."created_at", e."user_id", e."subscription_id", 'revenuecat', e."store", e."environment",
  e."rc_event_id", e."payload"->>'original_transaction_id', e."payload"->>'transaction_id', e."product_id",
  CASE WHEN e."type" = 'RENEWAL' THEN 'renewal' ELSE 'order' END,
  'completed', e."type",
  e."price", 'USD',
  COALESCE(NULLIF(e."payload"->>'price_in_purchased_currency', '')::numeric, e."price"),
  COALESCE(e."currency", 'USD'),
  to_timestamp(NULLIF(e."payload"->>'purchased_at_ms', '')::double precision / 1000)
FROM "subscription_events" e
WHERE e."type" IN ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE')
ON CONFLICT ("order_id") DO NOTHING;
