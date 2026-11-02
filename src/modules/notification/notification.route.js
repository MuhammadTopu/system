import express from "express";
import { verifyUser } from "../../common/middlewares/verifyUsers.js";
import {
  getMyNotifications,
  markNotificationRead,
  deleteNotification,
} from "./notification.controller.js";

const router = express.Router();

// base: /api/notifications
router.get("/", verifyUser("USER"), getMyNotifications);
router.patch("/:id/read", verifyUser("USER"), markNotificationRead);
router.delete("/:id", verifyUser("USER"), deleteNotification);

export default router;
