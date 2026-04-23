/*
  Warnings:

  - You are about to drop the `Temp` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Temp";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "temp" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_verified" INTEGER DEFAULT 0,

    CONSTRAINT "temp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "customer_id" TEXT,
    "country" TEXT,
    "gender" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "role" "Role" NOT NULL DEFAULT 'normal',
    "date_of_birth" DATE,
    "city" TEXT,
    "phone_number" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "bio" TEXT,
    "is_two_factor_enabled" INTEGER DEFAULT 0,
    "two_factor_secret" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "temp_email_key" ON "temp"("email");

-- CreateIndex
CREATE UNIQUE INDEX "temp_otp_key" ON "temp"("otp");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
