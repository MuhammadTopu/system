-- AlterEnum
ALTER TYPE "Plan" ADD VALUE 'Free';

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "features" TEXT[],
    "plan" "Plan" NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);
