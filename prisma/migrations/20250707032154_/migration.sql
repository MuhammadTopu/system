-- CreateEnum
CREATE TYPE "Mail_Status" AS ENUM ('Solved', 'Pending');

-- CreateTable
CREATE TABLE "mails" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT,
    "user_email" TEXT,
    "user_name" TEXT,
    "subject" TEXT,
    "message" TEXT,
    "token" TEXT,
    "status" "Mail_Status" NOT NULL DEFAULT 'Pending',

    CONSTRAINT "mails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mails_token_key" ON "mails"("token");

-- AddForeignKey
ALTER TABLE "mails" ADD CONSTRAINT "mails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
