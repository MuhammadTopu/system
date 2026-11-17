import express from "express";
import { verifyUser } from "../../common/middlewares/verifyUsers.js";
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "./notification.controller.js";

const router = express.Router();

// base: /api/notifications
router.get("/", verifyUser("USER"), getMyNotifications);
// before "/:id/read" so "read-all" is never taken for an id
router.patch("/read-all", verifyUser("USER"), markAllNotificationsRead);
router.patch("/:id/read", verifyUser("USER"), markNotificationRead);
router.delete("/:id", verifyUser("USER"), deleteNotification);

export default router;
