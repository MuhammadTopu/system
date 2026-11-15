import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// How far ahead of the due time each status starts. Change these two numbers to
// change the rules everywhere.
export const DUE_NOW_WINDOW_HOURS = 24; // due within the next 24 hours  -> DueNow
export const UPCOMING_WINDOW_DAYS = 30; // due within the next 30 days   -> Upcoming

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// The status one task should have right now, from its due time. Same rules as
// refreshTaskStatuses below. A task with no due_at gets "DueNow" (the column default).
export const statusFromDueAt = (dueAt, now = new Date()) => {
  if (!dueAt) return "DueNow";
  const due = new Date(dueAt).getTime();
  const nowMs = now.getTime();
  if (due < nowMs) return "Overdue";
  if (due <= nowMs + DUE_NOW_WINDOW_HOURS * HOUR_MS) return "DueNow";
  if (due <= nowMs + UPCOMING_WINDOW_DAYS * DAY_MS) return "Upcoming";
  return "Future";
};

// Internal helper (not an endpoint). Compares now() with each task's due time
// (`due_at`) and moves the task to the status that fits:
//
//   due_at < now                         -> Overdue
//   now <= due_at <= now + 24 hours      -> DueNow
//   now + 24 hours < due_at <= now + 30d -> Upcoming
//   due_at > now + 30 days               -> Future
//
// Never touched: Complete tasks, and tasks with no due_at (for example a mileage
// based task or an AI date like "Unknown"). Only rows whose status is actually
// wrong are written, so a run that has nothing to change writes nothing.
//
// userId: limit it to one user's tasks; leave it out to update everyone's.
// Returns how many tasks were moved to each status.
export const refreshTaskStatuses = async ({ userId, now = new Date() } = {}, client = prisma) => {
  const nowMs = now.getTime();
  const dueNowEnd = new Date(nowMs + DUE_NOW_WINDOW_HOURS * HOUR_MS);
  const upcomingEnd = new Date(nowMs + UPCOMING_WINDOW_DAYS * DAY_MS);

  const scope = userId ? { user_id: userId } : {};
  // a task already in the right status is skipped; Complete is never changed
  const notYet = (status) => ({ status: { notIn: [status, "Complete"] } });

  const [overdue, dueNow, upcoming, future] = await client.$transaction([
    client.tasks.updateMany({
      where: { ...scope, ...notYet("Overdue"), due_at: { lt: now } },
      data: { status: "Overdue" },
    }),
    client.tasks.updateMany({
      where: { ...scope, ...notYet("DueNow"), due_at: { gte: now, lte: dueNowEnd } },
      data: { status: "DueNow" },
    }),
    client.tasks.updateMany({
      where: { ...scope, ...notYet("Upcoming"), due_at: { gt: dueNowEnd, lte: upcomingEnd } },
      data: { status: "Upcoming" },
    }),
    client.tasks.updateMany({
      where: { ...scope, ...notYet("Future"), due_at: { gt: upcomingEnd } },
      data: { status: "Future" },
    }),
  ]);

  return {
    overdue: overdue.count,
    dueNow: dueNow.count,
    upcoming: upcoming.count,
    future: future.count,
    total: overdue.count + dueNow.count + upcoming.count + future.count,
  };
};
