import { PrismaClient, Prisma } from "@prisma/client";
import { notifyEach, NOTIFICATION_TYPES } from "./notification.service.js";

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;

// A task needs a reminder when it is overdue or due within this window.
export const REMINDER_WINDOW_MS = 24 * HOUR;

const BATCH = 500;
const MAX_BATCHES = 200; // safety stop (100,000 tasks in one run)

// Runs three times a day by default (08:00, 13:00 and 18:00). Override with
// TASK_REMINDER_CRON; TASK_REMINDER_TZ sets the time zone (default UTC).
const DEFAULT_SCHEDULE = "0 8,13,18 * * *";

// Claims up to BATCH tasks that need a reminder in ONE statement and returns
// them. The claim is atomic, and rows another instance (or an admin trigger) is
// already claiming are skipped, so a task is never reminded twice. A task is
// reminded once in its life: the first run that finds it overdue or due soon.
const claimBatch = (to, now) =>
  prisma.$queryRaw(Prisma.sql`
    UPDATE "tasks" AS t
    SET "reminded_at" = ${now}
    WHERE t."id" IN (
      SELECT tk."id"
      FROM "tasks" tk
      JOIN "users" u ON u."id" = tk."user_id"
      WHERE tk."due_at" IS NOT NULL
        AND tk."due_at" <= ${to}
        AND tk."reminded_at" IS NULL
        AND tk."status"::text <> 'Complete'
        AND u."status"::text = 'active'
        AND u."deleted_at" IS NULL
      ORDER BY tk."due_at"
      LIMIT ${BATCH}
      FOR UPDATE OF tk SKIP LOCKED
    )
    RETURNING t."id", t."user_id", t."item_id", t."upcoming_task", t."item_name", t."due_at"
  `);

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// One notification for all of a user's tasks (tasks are ordered by due date).
const buildDigest = (tasks, now) => {
  const overdue = tasks.filter((t) => t.due_at <= now).length;
  const soon = tasks.length - overdue;

  if (tasks.length === 1) {
    const [t] = tasks;
    return {
      title: overdue ? "Task overdue" : "Task due soon",
      body: `"${t.upcoming_task}" for ${t.item_name} is ${overdue ? "overdue" : "due within 24 hours"}.`,
      type: NOTIFICATION_TYPES.TASK_REMINDER,
      entityId: t.id,
      data: { taskId: t.id, itemId: t.item_id, count: 1 },
    };
  }

  const parts = [];
  if (overdue) parts.push(`${overdue} overdue`);
  if (soon) parts.push(`${soon} due within 24 hours`);
  const next = tasks.slice(0, 2).map((t) => t.upcoming_task).join(", ");

  return {
    title: "Maintenance reminder",
    body: `You have ${plural(tasks.length, "task")} that need attention (${parts.join(", ")}). Next up: ${next}.`,
    type: NOTIFICATION_TYPES.TASK_REMINDER,
    data: { count: tasks.length },
  };
};

// Finds the tasks that need a reminder and sends each user ONE notification.
// Safe to run as often as you like: a task is only ever reminded once.
export const runTaskReminders = async (now = new Date()) => {
  const to = new Date(now.getTime() + REMINDER_WINDOW_MS);

  // claim everything first, so a user whose tasks span two batches still gets
  // a single notification
  const claimed = [];
  for (let i = 0; i < MAX_BATCHES; i++) {
    const batch = await claimBatch(to, now);
    claimed.push(...batch);
    if (batch.length < BATCH) break;
  }

  const byUser = new Map();
  for (const t of claimed) {
    if (!byUser.has(t.user_id)) byUser.set(t.user_id, []);
    byUser.get(t.user_id).push(t);
  }

  const entries = [...byUser].map(([userId, tasks]) => {
    tasks.sort((a, b) => a.due_at - b.due_at);
    return { userId, payload: buildDigest(tasks, now) };
  });

  if (entries.length) await notifyEach(entries);

  return { users: entries.length, tasks: claimed.length };
};

// TASK_REMINDERS=off turns the schedule off (the admin trigger still works).
export const startTaskReminderCron = (nodeCron) => {
  if (String(process.env.TASK_REMINDERS).toLowerCase() === "off") {
    console.log("Task reminder cron is disabled (TASK_REMINDERS=off)");
    return;
  }

  const schedule = process.env.TASK_REMINDER_CRON || DEFAULT_SCHEDULE;
  const timezone = process.env.TASK_REMINDER_TZ || "UTC";

  if (!nodeCron.validate(schedule)) {
    console.error(`Invalid TASK_REMINDER_CRON "${schedule}"; task reminders not scheduled`);
    return;
  }

  let running = false;
  nodeCron.schedule(
    schedule,
    async () => {
      if (running) return; // the previous run is still going
      running = true;
      try {
        const { users, tasks } = await runTaskReminders();
        console.log(`Task reminders: ${users} user(s) notified about ${tasks} task(s)`);
      } catch (error) {
        console.error("Error in task reminder cron:", error.message);
      } finally {
        running = false;
      }
    },
    { timezone },
  );

  console.log(`Task reminders scheduled "${schedule}" (${timezone})`);
};
