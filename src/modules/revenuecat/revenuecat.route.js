import express from "express";
import { handleWebhook } from "./revenuecat.controller.js";

const router = express.Router();

// RevenueCat dashboard -> Integrations -> Webhooks -> /api/revenuecat/webhook
router.post("/webhook", handleWebhook);

export default router;
