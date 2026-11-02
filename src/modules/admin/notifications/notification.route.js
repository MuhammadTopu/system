import express from "express";
import { verifyUser } from "../../../common/middlewares/verifyUsers.js";
import {
  sendNotification,
  triggerTaskReminders,
} from "./notification.controller.js";

const router = express.Router();

// custom system message to all / premium / free / one user
router.post("/send", verifyUser("ADMIN"), sendNotification);

// run the task reminder job now
router.post("/run-task-reminders", verifyUser("ADMIN"), triggerTaskReminders);

export default router;
