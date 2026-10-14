import crypto from "crypto";
import { RevenueCatService } from "./revenuecat.service.js";

const revenueCatService = new RevenueCatService();

const sha256 = (value) => crypto.createHash("sha256").update(value).digest();

// Compares digests so the check takes the same time whatever the input is.
const isAuthorized = (authHeader) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret || !authHeader) return false;

  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : authHeader;

  return crypto.timingSafeEqual(sha256(provided), sha256(secret));
};

export const handleWebhook = async (req, res) => {
  if (!process.env.REVENUECAT_WEBHOOK_SECRET) {
    console.error("REVENUECAT_WEBHOOK_SECRET is not set - rejecting webhook");
    return res.status(500).json({ message: "Webhook is not configured" });
  }

  if (!isAuthorized(req.headers["authorization"])) {
    return res.status(401).json({ message: "Invalid webhook authorization" });
  }

  try {
    const result = await revenueCatService.processEvent(req.body);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    // A non-2xx response makes RevenueCat retry the delivery.
    console.error("RevenueCat webhook processing failed:", error);
    return res.status(500).json({ message: "Failed to process event" });
  }
};
