import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// Keys are prefixed because the VPS Redis can be shared with other apps.
const KEY_PREFIX = "maintenance-genie:fcm:user:";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, so stale entries heal themselves

let client = null;
let lastErrorLog = 0;

// Returns null when Redis is not configured. The cache is an optimisation only:
// every caller must work without it.
const getClient = () => {
  if (!process.env.REDIS_HOST) return null;

  if (!client) {
    client = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 2000,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
      // Fail fast while disconnected instead of queueing commands (and login) behind Redis
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 10000),
    });

    client.on("error", (error) => {
      // Log at most once a minute so a Redis outage does not flood the log
      if (Date.now() - lastErrorLog > 60000) {
        lastErrorLog = Date.now();
        // "localhost" can fail on IPv6 and IPv4 at once; that error has no message of its own
        const reason =
          error.message ||
          error.code ||
          error.errors?.map((e) => e.message || e.code).join("; ") ||
          "unknown error";
        console.error(
          `Redis error at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379} (falling back to the database): ${reason}`,
        );
      }
    });
  }

  return client;
};

// Start connecting as soon as the app loads. Commands fail fast while the
// connection is down (no offline queue), so the connection must already be up
// by the time the first login asks for a token.
getClient();

export const getCachedFcmToken = async (userId) => {
  const redis = getClient();
  if (!redis) return null;

  try {
    return await redis.get(KEY_PREFIX + userId);
  } catch {
    return null;
  }
};

export const setCachedFcmToken = async (userId, token) => {
  const redis = getClient();
  if (!redis) return;

  try {
    await redis.set(KEY_PREFIX + userId, token, "EX", TOKEN_TTL_SECONDS);
  } catch {
    // cache write failures are harmless
  }
};

export const deleteCachedFcmTokens = async (userIds) => {
  const redis = getClient();
  if (!redis || !userIds.length) return;

  try {
    await redis.del(userIds.map((id) => KEY_PREFIX + id));
  } catch {
    // a missed delete only means one extra database check later
  }
};

export const closeRedis = async () => {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
};
