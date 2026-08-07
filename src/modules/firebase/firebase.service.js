import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import pkgPrisma from "@prisma/client";
import { getFirebaseCredentials } from "./firebase.config.js";

const { PrismaClient } = pkgPrisma;
const prisma = new PrismaClient();

// ── Init (call once on startup — see app.js) ─────────────────────────────────

export function initFirebase() {
  if (getApps().length) return true;

  const creds = getFirebaseCredentials();
  if (!creds) {
    console.warn(
      "Firebase credentials missing — set FIREBASE_SERVICE_ACCOUNT, or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY",
    );
    return false;
  }

  try {
    initializeApp({ credential: cert(creds) });
    console.log("Firebase initialized");
    return true;
  } catch (err) {
    console.error("Firebase init failed:", err);
    return false;
  }
}

// ── Core push ─────────────────────────────────────────────────────────────

const INVALID_TOKENS = [
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
];

async function clearToken(token) {
  await prisma.user.updateMany({
    where: { fcm_token: token },
    data: { fcm_token: null },
  });
}

async function pushToDevice(token, data) {
  if (!getApps().length) {
    return { success: false, error: "Push not configured" };
  }

  const fcmData = {};
  for (const [key, value] of Object.entries(data)) {
    fcmData[key] =
      key === "data" && typeof value !== "string"
        ? JSON.stringify(value || {})
        : String(value || "");
  }
  if (!fcmData.type) fcmData.type = "notification";

  try {
    const messageId = await getMessaging().send({
      token,
      notification: {
        title: data.title || "New Message",
        body: data.body || "You have a new message!",
      },
      data: fcmData,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "high_importance_channel",
          tag: `msg_${data.conversationId || "general"}`,
        },
      },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
    });
    return { success: true, messageId };
  } catch (err) {
    const code = err?.code || err?.errorInfo?.code;
    const msg = err?.message || err?.errorInfo?.message || "Unknown error";

    if (
      msg.includes("Permission") ||
      msg.includes("denied") ||
      code === "messaging/mismatched-credential"
    ) {
      return {
        success: false,
        error: "FCM permission denied — check service account role",
        code,
      };
    }

    if (INVALID_TOKENS.includes(code)) {
      await clearToken(token);
      return {
        success: false,
        error: "Invalid or expired token",
        code,
        shouldRemoveToken: true,
      };
    }

    if (
      code === "app/invalid-credential" ||
      msg.includes("Invalid JWT Signature") ||
      msg.includes("invalid_grant")
    ) {
      return {
        success: false,
        error: "Invalid Firebase credentials",
        code,
      };
    }

    return { success: false, error: msg, code };
  }
}

// ── Service ──────────────────────────────────────────────────────────────────

export class FirebaseService {
  /** Send push to a user by ID (looks up their stored fcm_token). */
  async send(userId, data) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcm_token: true },
    });
    if (!user?.fcm_token) {
      return { success: false, error: "No FCM token for user" };
    }
    return pushToDevice(user.fcm_token, data);
  }

  /** Send when you already have the token (no DB lookup). */
  sendToken(token, data) {
    return pushToDevice(token, data);
  }

  /** Rich push (title/body/data) + persists a Notification row. */
  async sendToOne(token, payload, options) {
    try {
      const messageId = await getMessaging().send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        android: {
          priority: "high",
          notification: { sound: "default", channelId: "default" },
        },
        apns: {
          headers: { "apns-priority": "10" },
          payload: {
            aps: { sound: "default", "mutable-content": 1 },
          },
        },
        data: payload.data
          ? JSON.parse(JSON.stringify(payload.data))
          : undefined,
      });

      if (options) {
        try {
          const event = await prisma.notificationEvent.upsert({
            where: { id: options.type },
            update: {},
            create: {
              id: options.type,
              type: options.type,
              text: payload.title,
            },
          });
          await prisma.notification.create({
            data: {
              sender_id: options.senderId ?? null,
              receiver_id: options.receiverId,
              notification_event_id: event.id,
              entity_id: options.entityId ?? null,
            },
          });
        } catch (e) {
          console.warn(`saveNotification failed: ${e.message}`);
        }
      }

      return { success: true, messageId };
    } catch (err) {
      if (INVALID_TOKENS.includes(err.code)) {
        await clearToken(token);
        return { success: false, error: "Invalid token — cleared" };
      }
      console.error(`sendToOne failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async sendToMany(tokens, payload, options) {
    if (!tokens.length) {
      return { success: false, totalSent: 0, totalFailed: 0, results: [] };
    }

    const results = await Promise.all(
      tokens.map((token, i) =>
        this.sendToOne(
          token,
          payload,
          options
            ? { ...options, receiverId: options.receiverIds[i] }
            : undefined,
        ),
      ),
    );

    const totalSent = results.filter((r) => r.success).length;
    return {
      success: totalSent > 0,
      totalSent,
      totalFailed: results.length - totalSent,
      results,
    };
  }
}

// Export a default instance for simple imports
const firebaseService = new FirebaseService();
export default firebaseService;
