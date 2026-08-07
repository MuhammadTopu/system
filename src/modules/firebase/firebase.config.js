/**
 * Builds Firebase Admin credentials from environment variables.
 *
 * Supports two env layouts so a single malformed value doesn't take
 * push notifications down in production:
 *   1. FIREBASE_SERVICE_ACCOUNT — the full service-account JSON as one string.
 *   2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY — split out,
 *      which avoids having to escape an entire JSON blob inside .env.
 */

function stripWrappingQuotes(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizePrivateKey(key) {
  return stripWrappingQuotes(key.trim()).replace(/\\n/g, "\n");
}

export function getFirebaseCredentials() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (rawJson) {
    try {
      const creds = JSON.parse(stripWrappingQuotes(rawJson));
      if (!creds.project_id || !creds.client_email || !creds.private_key) {
        console.error(
          "FIREBASE_SERVICE_ACCOUNT is missing project_id/client_email/private_key",
        );
      } else {
        creds.private_key = normalizePrivateKey(creds.private_key);
        return creds;
      }
    } catch (err) {
      console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON:", err);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: normalizePrivateKey(privateKey),
    };
  }

  return null;
}
