import express from "express";
import adminRoutes from "../admin-home-auth/admin.route.js";
import userManagementRoutes from "../user-management/user-management.route.js";
import settingsRoutes from "../settings/settings.route.js";
import subscriptionsRoutes from "../subsciption/subcription.route.js";
import feedbackRoutes from "../feedback-support/feedback.route.js";
import plansRoutes from "../plans/plans.route.js";
import notificationRoutes from "../notifications/notification.route.js";
import reportRoutes from "../reports/report.route.js";

const router = express.Router();

// base: /api/admin
router.use("/", adminRoutes);
router.use("/user-management", userManagementRoutes);
router.use("/settings", settingsRoutes);
router.use("/subscriptions", subscriptionsRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/plans", plansRoutes);
router.use("/notifications", notificationRoutes);
router.use("/reports", reportRoutes);

export default router;