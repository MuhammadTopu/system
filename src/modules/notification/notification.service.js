import { PrismaClient } from "@prisma/client";
import firebaseService from "../firebase/firebase.service.js";

const prisma = new PrismaClient();

const USER_PAGE = 500;
const PUSH_CHUNK = 50;

// Every notification has one of these types. The app can use it to decide where a
// tap should lead; it is also stored on the notification history row.
export const NOTIFICATION_TYPES = {
  LOGIN: "login",
  WELCOME: "welcome",
  ITEM_ADDED: "item_added",
  TASKS_CREATED: "tasks_created",
  TASK_REMINDER: "task_reminder",
  PREMIUM_ACTIVATED: "premium_activated",
  PREMIUM_RENEWED: "premium_renewed",
  PREMIUM_CANCELLED: "premium_cancelled",
  PREMIUM_PAYMENT_ISSUE: "premium_payment_issue",
  PREMIUM_EXPIRED: "premium_expired",
  PREMIUM_REFUNDED: "premium_refunded",
  SYSTEM: "system",
};

const ensuredEvents = new Set();

// notification_events holds one row per type (id = type).
const ensureEvent = async (type, text) => {
  if (ensuredEvents.has(type)) return;
  try {
    await prisma.notificationEvent.upsert({
      where: { id: type },
      update: {},
      create: { id: type, type, text },
    });
  } catch (err) {
    // two requests creating the same type at once: the row exists either way
    if (err.code !== "P2002") throw err;
  }
  ensuredEvents.add(type);
};

const pushPayload = ({ title, body, type, entityId, data }) => ({
  title,
  body,
  type,
  ...(entityId ? { entityId } : {}),
  ...(data ? { data } : {}),
});

// Saves a history row and sends the push. Never throws: a notification problem
// must not break the request that caused it.
export const notifyUser = async (userId, payload) => {
  const { title, body, type, entityId = null, data = null, senderId = null } = payload;

  try {
    await ensureEvent(type, title);
    await prisma.notification.create({
      data: {
        receiver_id: userId,
        sender_id: senderId,
        notification_event_id: type,
        entity_id: entityId,
        title,
        body,
        data: data ?? undefined,
      },
    });
  } catch (err) {
    console.warn(`Saving notification failed (${type}): ${err.message}`);
  }

  try {
    return await firebaseService.send(userId, pushPayload(payload));
  } catch (err) {
    console.error(`Sending notification failed (${type}): ${err.message}`);
    return { success: false, error: err.message };
  }
};

// Same message to many users ({ id, fcm_token } each). Returns counts.
export const notifyUsers = async (users, payload, { senderId = null } = {}) => {
  const result = { matched: users.length, pushed: 0, failed: 0, noToken: 0 };
  if (!users.length) return result;

  await ensureEvent(payload.type, payload.title);
  await prisma.notification.createMany({
    data: users.map((u) => ({
      receiver_id: u.id,
      sender_id: senderId,
      notification_event_id: payload.type,
      entity_id: payload.entityId ?? null,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? undefined,
    })),
  });

  const withToken = users.filter((u) => u.fcm_token);
  result.noToken = users.length - withToken.length;

  for (let i = 0; i < withToken.length; i += PUSH_CHUNK) {
    const sent = await Promise.all(
      withToken
        .slice(i, i + PUSH_CHUNK)
        .map((u) =>
          firebaseService
            .sendToken(u.fcm_token, pushPayload(payload))
            .catch(() => ({ success: false })),
        ),
    );
    result.pushed += sent.filter((r) => r.success).length;
    result.failed += sent.filter((r) => !r.success).length;
  }

  return result;
};

// A different message per user ([{ userId, payload }]), in bulk: one insert for
// the history rows, one query for the device tokens, then the pushes in chunks.
export const notifyEach = async (entries, { senderId = null } = {}) => {
  const result = { matched: entries.length, pushed: 0, failed: 0, noToken: 0 };
  if (!entries.length) return result;

  for (const e of entries) await ensureEvent(e.payload.type, e.payload.title);

  await prisma.notification.createMany({
    data: entries.map(({ userId, payload }) => ({
      receiver_id: userId,
      sender_id: senderId,
      notification_event_id: payload.type,
      entity_id: payload.entityId ?? null,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? undefined,
    })),
  });

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(entries.map((e) => e.userId))] } },
    select: { id: true, fcm_token: true },
  });
  const tokenOf = new Map(users.map((u) => [u.id, u.fcm_token]));

  const withToken = entries.filter((e) => tokenOf.get(e.userId));
  result.noToken = entries.length - withToken.length;

  for (let i = 0; i < withToken.length; i += PUSH_CHUNK) {
    const sent = await Promise.all(
      withToken
        .slice(i, i + PUSH_CHUNK)
        .map((e) =>
          firebaseService
            .sendToken(tokenOf.get(e.userId), pushPayload(e.payload))
            .catch(() => ({ success: false })),
        ),
    );
    result.pushed += sent.filter((r) => r.success).length;
    result.failed += sent.filter((r) => !r.success).length;
  }

  return result;
};

// Admin broadcast. audience: all | premium | free | user (needs userId).
export const broadcast = async (audience, userId, payload, senderId) => {
  const where = {
    type: "USER",
    status: "active",
    deleted_at: null,
    ...(audience === "premium" ? { role: "premium" } : {}),
    ...(audience === "free" ? { role: "normal" } : {}),
    ...(audience === "user" ? { id: userId } : {}),
  };

  const totals = { matched: 0, pushed: 0, failed: 0, noToken: 0 };
  let cursor;

  for (;;) {
    const users = await prisma.user.findMany({
      where,
      select: { id: true, fcm_token: true },
      orderBy: { id: "asc" },
      take: USER_PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!users.length) break;

    const r = await notifyUsers(users, payload, { senderId });
    for (const key of Object.keys(totals)) totals[key] += r[key];

    cursor = users[users.length - 1].id;
    if (users.length < USER_PAGE) break;
  }

  return totals;
};
