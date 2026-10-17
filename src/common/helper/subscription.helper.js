import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Statuses that can still grant access. Whether they actually do depends on the
// dates: Cancelled just means auto-renew is off, BillingIssue means the store
// is retrying the payment during the grace period.
export const ENTITLED_STATUSES = ["Active", "Cancelled", "BillingIssue"];

// A subscription grants access until the later of its paid period end and the
// grace period end (only set while the payment is being retried).
export const getAccessEnd = (sub) => {
  const ends = [sub.end_date, sub.grace_period_end]
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  return new Date(Math.max(...ends));
};

const hasAccess = (sub, now) =>
  ENTITLED_STATUSES.includes(sub.status) && getAccessEnd(sub) > now;

// Finds the subscription that currently grants access (the one that lasts
// longest if the user somehow has several). Returns null when there is none.
export const findPremiumSubscription = async (userId, client = prisma) => {
  const now = new Date();

  const candidates = await client.subscription.findMany({
    where: {
      user_id: userId,
      status: { in: ENTITLED_STATUSES },
      OR: [{ end_date: { gt: now } }, { grace_period_end: { gt: now } }],
    },
  });

  const active = candidates.filter((sub) => hasAccess(sub, now));
  if (!active.length) return null;

  return active.sort((a, b) => getAccessEnd(b) - getAccessEnd(a))[0];
};

export const isUserPremium = async (userId, client = prisma) => {
  return (await findPremiumSubscription(userId, client)) !== null;
};

// Shape returned to the app next to `isPremium`.
export const buildSubscriptionSummary = (sub) => {
  if (!sub) return null;

  return {
    plan: sub.plan,
    status: sub.status,
    isLifetime: sub.plan === "Lifetime",
    expiresAt: sub.plan === "Lifetime" ? null : getAccessEnd(sub),
    willRenew: sub.will_renew,
    inGracePeriod: sub.status === "BillingIssue",
    store: sub.store,
  };
};

// Keeps the cached columns on the users table in line with the subscriptions:
// is_subscribed, role, subscription_status (active | expired | null = never
// subscribed), subscription_valid_until and subscribed_at (first subscription).
// Admin queries read these columns. Admins keep their role: only regular users
// are switched between normal and premium.
export const syncUserPremiumFlags = async (userId, client = prisma) => {
  const premiumSub = await findPremiumSubscription(userId, client);
  const premium = premiumSub !== null;

  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      type: true,
      role: true,
      is_subscribed: true,
      subscribed_at: true,
      subscription_valid_until: true,
      subscription_status: true,
    },
  });
  if (!user) return premium;

  const span = await client.subscription.aggregate({
    where: { user_id: userId },
    _min: { start_date: true },
    _max: { end_date: true, grace_period_end: true },
  });
  const hasSubscriptions = span._min.start_date !== null;

  let validUntil = null;
  if (premiumSub) {
    validUntil = getAccessEnd(premiumSub);
  } else if (hasSubscriptions) {
    validUntil = getAccessEnd({
      end_date: span._max.end_date,
      grace_period_end: span._max.grace_period_end,
    });
  }

  const status = premium ? "active" : hasSubscriptions ? "expired" : null;
  const sameDate = (a, b) => (a ? a.getTime() : null) === (b ? b.getTime() : null);

  const data = {};
  if (user.is_subscribed !== premium) data.is_subscribed = premium;
  if (user.type === "USER") {
    const role = premium ? "premium" : "normal";
    if (user.role !== role) data.role = role;
  }
  if (user.subscription_status !== status) data.subscription_status = status;
  if (!sameDate(user.subscription_valid_until, validUntil)) {
    data.subscription_valid_until = validUntil;
  }
  if (!user.subscribed_at && span._min.start_date) {
    data.subscribed_at = span._min.start_date;
  }

  if (Object.keys(data).length) {
    await client.user.update({ where: { id: userId }, data });
  }

  return premium;
};
