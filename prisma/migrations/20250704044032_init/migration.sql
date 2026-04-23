-- CreateEnum
CREATE TYPE "Status" AS ENUM ('active', 'inactive', 'expired');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('normal', 'premium', 'admin');

-- CreateTable
CREATE TABLE "Temp" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_verified" INTEGER DEFAULT 0,

    CONSTRAINT "Temp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
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

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Temp_email_key" ON "Temp"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Temp_otp_key" ON "Temp"("otp");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
