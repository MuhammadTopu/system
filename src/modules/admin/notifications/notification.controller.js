import { admin_send_notification } from "../../validations/joi.validations.js";
import {
  broadcast,
  NOTIFICATION_TYPES,
} from "../../notification/notification.service.js";
import { runTaskReminders } from "../../notification/task.reminders.js";

// POST /api/admin/notifications/send
// Sends a custom system message (push + history) to everyone, premium users,
// free users or one user.
export const sendNotification = async (req, res, next) => {
  try {
    const { value, error } = admin_send_notification.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await broadcast(
      value.audience,
      value.user_id,
      {
        title: value.title,
        body: value.body,
        type: NOTIFICATION_TYPES.SYSTEM,
      },
      req.user.userId,
    );

    if (result.matched === 0) {
      return res.status(404).json({ message: "No matching users found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification sent",
      audience: value.audience,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/notifications/run-task-reminders
// Runs the task reminder job right now (the same job the cron runs every minute).
export const triggerTaskReminders = async (req, res, next) => {
  try {
    const result = await runTaskReminders();
    return res.status(200).json({
      success: true,
      message: "Task reminders processed",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
