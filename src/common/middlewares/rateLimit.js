// A small in-memory limiter for the sign-in / OTP routes, so a code or a password
// cannot be guessed by trying them all. It counts requests per key (the email in
// the body by default) inside a time window and answers 429 when the count is
// over the limit.
//
// The counters live in this process: they reset when the server restarts and are
// not shared between several server instances. That is enough for one container;
// move them to Redis if the app is ever scaled out.

const store = new Map(); // "name:key" -> { count, resetAt }

// forget expired counters now and then, so the map cannot grow forever
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
}, 5 * 60 * 1000).unref();

const emailKey = (req) => String(req.body?.email ?? "").trim().toLowerCase();

export const limitBy = ({
  name,
  max,
  windowMs = 15 * 60 * 1000,
  key = emailKey,
}) => (req, res, next) => {
  const k = key(req);
  // no key (for example the email is missing): validation will answer, not us
  if (!k) return next();

  const id = `${name}:${k}`;
  const now = Date.now();
  let entry = store.get(id);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(id, entry);
  }

  entry.count += 1;
  if (entry.count > max) {
    const seconds = Math.ceil((entry.resetAt - now) / 1000);
    res.set("Retry-After", String(seconds));
    return res.status(429).json({
      message: `Too many attempts. Please try again in ${Math.ceil(seconds / 60)} minute(s).`,
    });
  }
  next();
};
