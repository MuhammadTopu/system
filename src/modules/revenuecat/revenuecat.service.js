import { PrismaClient } from "@prisma/client";
import {
  ENTITLED_STATUSES,
  syncUserPremiumFlags,
} from "../../common/helper/subscription.helper.js";

const prisma = new PrismaClient();

const ACTIVATING_EVENTS = [
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
];

// Events with nothing to store: no user, no subscription.
const SKIPPED_EVENTS = ["TEST"];

// Lifetime purchases have no expiration in RevenueCat; store a far-future date
// so the same "end_date > now" check works for every plan.
const LIFETIME_END = new Date("2099-12-31T00:00:00.000Z");

const toDate = (ms) => (ms ? new Date(Number(ms)) : null);

// RevenueCat uses $RCAnonymousID:... until the app calls Purchases.logIn(user.id).
const isRealUserId = (id) => !!id && !String(id).startsWith("$RCAnonymousID");

// Fallback when a product has no row in `services`: the product / base plan id
// (maintenance_genie_premium:mg-monthly, :mg-annual, ...lifetime) tells us the plan.
const planFromProductId = (productId) => {
  const id = String(productId ?? "").toLowerCase();
  if (id.includes("lifetime")) return "Lifetime";
  if (id.includes("annual") || id.includes("yearly")) return "Yearly";
  if (id.includes("monthly")) return "Monthly";
  return null;
};

export class RevenueCatService {
  // Sandbox purchases (Play license testers, RevenueCat Test Store) must not
  // grant premium in production unless explicitly allowed.
  acceptsEnvironment(environment) {
    if (environment !== "SANDBOX") return true;
    return (
      process.env.NODE_ENV !== "production" ||
      process.env.REVENUECAT_ACCEPT_SANDBOX === "true"
    );
  }

  async processEvent(payload) {
    const event = payload?.event;

    if (!event?.id || !event?.type) {
      return { status: "ignored", reason: "malformed event" };
    }

    if (SKIPPED_EVENTS.includes(event.type)) {
      return { status: "ignored", reason: event.type };
    }

    if (!this.acceptsEnvironment(event.environment)) {
      return { status: "ignored", reason: "sandbox event in production" };
    }

    try {
      // The event row and the state change share one transaction: if applying
      // the event fails, the row is rolled back too and RevenueCat's retry is
      // processed again instead of being mistaken for a duplicate.
      return await prisma.$transaction((tx) => this.handleEvent(tx, event), {
        timeout: 15000,
      });
    } catch (error) {
      if (
        error.code === "P2002" &&
        String(error.meta?.target).includes("rc_event_id")
      ) {
        return { status: "duplicate", eventId: event.id };
      }
      throw error;
    }
  }

  async handleEvent(tx, event) {
    const userId = isRealUserId(event.app_user_id) ? event.app_user_id : null;
    const user = userId
      ? await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        })
      : null;

    const eventRow = await tx.subscriptionEvent.create({
      data: {
        rc_event_id: event.id,
        type: event.type,
        user_id: user?.id ?? null,
        product_id: event.new_product_id ?? event.product_id ?? null,
        store: event.store ?? null,
        environment: event.environment ?? null,
        price: event.price ?? null,
        currency: event.currency ?? null,
        event_timestamp: toDate(event.event_timestamp_ms),
        payload: event,
      },
    });

    if (event.type === "TRANSFER") {
      await this.handleTransfer(tx, event);
      return { status: "processed", type: event.type };
    }

    if (!user) {
      console.warn(
        `RevenueCat ${event.type} ${event.id}: unknown or anonymous user "${event.app_user_id}" - logged only`,
      );
      return { status: "skipped", reason: "unknown user" };
    }

    let subscription = null;

    if (ACTIVATING_EVENTS.includes(event.type)) {
      subscription = await this.applyState(tx, user, event, "Active", {
        will_renew: event.type !== "NON_RENEWING_PURCHASE",
        cancelled_at: null,
        grace_period_end: null,
      });
    } else if (event.type === "CANCELLATION") {
      subscription = await this.applyState(tx, user, event, "Cancelled", {
        will_renew: false,
        cancelled_at: new Date(),
      });
    } else if (event.type === "BILLING_ISSUE") {
      subscription = await this.applyState(tx, user, event, "BillingIssue", {
        grace_period_end: toDate(event.grace_period_expiration_at_ms),
      });
    } else if (event.type === "SUBSCRIPTION_PAUSED") {
      subscription = await this.applyState(tx, user, event, "Paused", {
        will_renew: false,
      });
    } else if (event.type === "EXPIRATION") {
      subscription = await this.applyState(tx, user, event, "Ended", {
        will_renew: false,
        grace_period_end: null,
      });
    } else {
      console.log(`RevenueCat event ${event.type} ${event.id}: logged only`);
    }

    if (subscription) {
      await tx.subscriptionEvent.update({
        where: { id: eventRow.id },
        data: { subscription_id: subscription.id },
      });
    }

    await syncUserPremiumFlags(user.id, tx);

    return { status: "processed", type: event.type };
  }

  // Creates or updates the subscription an event refers to. Returns null when
  // the event is stale or cannot be mapped to a plan.
  async applyState(tx, user, event, initialStatus, extra = {}) {
    let status = initialStatus;
    const productId = event.new_product_id ?? event.product_id;
    const service = productId
      ? await tx.services.findUnique({ where: { rc_product_id: productId } })
      : null;
    const plan = service?.plan ?? planFromProductId(productId);

    // original_transaction_id stays the same across renewals.
    const key = event.original_transaction_id ?? `${user.id}:${productId}`;
    const existing = await tx.subscription.findUnique({
      where: { rc_original_transaction_id: key },
    });

    const eventAt = toDate(event.event_timestamp_ms) ?? new Date();

    // Webhooks can arrive out of order; never let an older one overwrite a
    // newer state.
    if (existing?.last_event_at && eventAt < existing.last_event_at) {
      console.warn(
        `RevenueCat ${event.type} ${event.id}: older than last applied event - skipped`,
      );
      return null;
    }

    let endDate = toDate(event.expiration_at_ms);

    if (plan === "Lifetime") {
      endDate = LIFETIME_END;

      // A lifetime purchase only ends when it is refunded or revoked, and
      // then access stops immediately.
      if (["CANCELLATION", "EXPIRATION"].includes(event.type)) {
        status = "Ended";
        endDate = new Date();
      }
    }

    const isPurchase = ACTIVATING_EVENTS.includes(event.type);
    const price = isPurchase ? (event.price ?? service?.price ?? null) : null;

    const data = {
      status,
      store: event.store ?? existing?.store ?? null,
      environment: event.environment ?? existing?.environment ?? null,
      last_event_at: eventAt,
      ...(productId && { product_id: productId }),
      ...(plan && { plan }),
      ...(service && { service_id: service.id }),
      ...(endDate && { end_date: endDate }),
      ...(price !== null && { price }),
      ...extra,
    };

    if (existing) {
      return tx.subscription.update({ where: { id: existing.id }, data });
    }

    if (!plan || !endDate) {
      console.warn(
        `RevenueCat ${event.type} ${event.id}: cannot create subscription (product "${productId}", expiration ${event.expiration_at_ms}) - logged only`,
      );
      return null;
    }

    return tx.subscription.create({
      data: {
        ...data,
        plan,
        user_id: user.id,
        username: user.name,
        rc_original_transaction_id: key,
        start_date: toDate(event.purchased_at_ms) ?? new Date(),
      },
    });
  }

  // The user logged in on a new account: move the entitlement along with them.
  async handleTransfer(tx, event) {
    const fromIds = (event.transferred_from ?? []).filter(isRealUserId);
    const toIds = (event.transferred_to ?? []).filter(isRealUserId);

    const target = await tx.user.findFirst({
      where: { id: { in: toIds } },
      select: { id: true, name: true },
    });
    const sources = await tx.user.findMany({
      where: { id: { in: fromIds } },
      select: { id: true },
    });

    if (!target || !sources.length) {
      console.warn(
        `RevenueCat TRANSFER ${event.id}: no matching users (from ${fromIds}, to ${toIds})`,
      );
      return;
    }

    await tx.subscription.updateMany({
      where: {
        user_id: { in: sources.map((u) => u.id) },
        status: { in: [...ENTITLED_STATUSES, "Paused"] },
      },
      data: { user_id: target.id, username: target.name },
    });

    for (const id of [target.id, ...sources.map((u) => u.id)]) {
      await syncUserPremiumFlags(id, tx);
    }
  }
}
