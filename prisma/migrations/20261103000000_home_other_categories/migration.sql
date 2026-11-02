-- Category: drop Appliance and Electronics (any leftover rows become Custom/Other)
UPDATE "Item" SET "category" = 'Custom' WHERE "category" IN ('Appliance', 'Electronics');

ALTER TYPE "Category" RENAME TO "Category_old";
CREATE TYPE "Category" AS ENUM ('Home', 'Vehicle', 'Custom');
ALTER TABLE "Item" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Item" ALTER COLUMN "category" TYPE "Category" USING ("category"::text::"Category");
ALTER TABLE "Item" ALTER COLUMN "category" SET DEFAULT 'Custom';
DROP TYPE "Category_old";

-- Item: Home and Other fields
ALTER TABLE "Item"
  ADD COLUMN "property_type" TEXT,
  ADD COLUMN "zip_code" TEXT,
  ADD COLUMN "own_or_rent" TEXT,
  ADD COLUMN "systems" TEXT[],
  ADD COLUMN "group" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "due_date" TIMESTAMP(3),
  ADD COLUMN "repeat" TEXT,
  ADD COLUMN "reminder" TEXT;

-- Questions: generic Home/Other questions (vehicle columns become optional)
ALTER TABLE "questions"
  ALTER COLUMN "maintenanceItem" DROP NOT NULL,
  ALTER COLUMN "category" DROP NOT NULL,
  ALTER COLUMN "priority" DROP NOT NULL,
  ALTER COLUMN "reason" DROP NOT NULL,
  ADD COLUMN "input_type" TEXT,
  ADD COLUMN "options" JSONB,
  ADD COLUMN "optional" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maintenance_impact" TEXT,
  ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "answer" JSONB,
  ADD COLUMN "skipped" BOOLEAN NOT NULL DEFAULT false;
