import { PrismaClient } from "@prisma/client";
import {
  ENTITLED_STATUSES,
  syncUserPremiumFlags,
} from "../../common/helper/subscription.helper.js";

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

// Safety net for a lost EXPIRATION webhook: marks subscriptions whose paid
// period and grace period are both over as Ended and refreshes the users'
// cached premium flags. RevenueCat webhooks remain the primary signal.
export const expireOverdueSubscriptions = async () => {
  const now = new Date();
  let total = 0;

  for (;;) {
    const overdue = await prisma.subscription.findMany({
      where: {
        status: { in: ENTITLED_STATUSES },
        end_date: { lte: now },
        OR: [{ grace_period_end: null }, { grace_period_end: { lte: now } }],
      },
      select: { id: true, user_id: true },
      take: BATCH_SIZE,
    });

    if (!overdue.length) break;

    await prisma.subscription.updateMany({
      where: { id: { in: overdue.map((sub) => sub.id) } },
      data: { status: "Ended", will_renew: false },
    });

    for (const userId of new Set(overdue.map((sub) => sub.user_id))) {
      await syncUserPremiumFlags(userId);
    }

    total += overdue.length;
  }

  return total;
};
