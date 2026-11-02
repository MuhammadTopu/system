-- Notification history: what was sent
ALTER TABLE "notifications"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "body" TEXT,
  ADD COLUMN "data" JSONB;

-- Task reminders: a real due timestamp plus an "already reminded" marker
ALTER TABLE "tasks"
  ADD COLUMN "due_at" TIMESTAMP(3),
  ADD COLUMN "reminded_at" TIMESTAMP(3);

CREATE INDEX "tasks_due_at_idx" ON "tasks"("due_at");
