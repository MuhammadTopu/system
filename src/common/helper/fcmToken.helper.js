import {
  getCachedFcmToken,
  setCachedFcmToken,
  deleteCachedFcmTokens,
} from "../../utils/redisClient.js";

// Saves a device's FCM token at login without writing to the database every time.
//
//   1. Redis has this exact token for the user -> nothing to do.
//   2. Otherwise let updateDb save it. It only writes this user's row when the
//      token differs from the stored one, and it removes the token from any other
//      account (a token belongs to one device). It returns the ids of those
//      accounts, and their cached copy is dropped.
//   3. Remember the token in Redis for next time.
//
// If Redis is down or not configured, step 1 simply never matches and updateDb
// still avoids needless writes.
export const syncFcmToken = async ({ userId, fcmToken, dbToken, updateDb }) => {
  if (!fcmToken) return { wroteDb: false, cacheHit: false };

  const cached = await getCachedFcmToken(userId);
  if (cached === fcmToken) return { wroteDb: false, cacheHit: true };

  const losers = await updateDb(userId, fcmToken);
  await deleteCachedFcmTokens(losers ?? []);
  await setCachedFcmToken(userId, fcmToken);

  return { wroteDb: fcmToken !== dbToken, cacheHit: false };
};
