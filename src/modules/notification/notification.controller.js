import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const toResponse = (n) => ({
  id: n.id,
  type: n.notification_event_id,
  title: n.title,
  body: n.body,
  entity_id: n.entity_id,
  data: n.data,
  is_read: n.read_at !== null,
  read_at: n.read_at,
  created_at: n.created_at,
});

const positiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

// The logged-in user's own, not deleted, notification by id.
const findOwn = (id, userId) =>
  prisma.notification.findFirst({
    where: { id, receiver_id: userId, deleted_at: null },
  });

// GET /api/notifications?page=1&limit=20&unread=true
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const page = positiveInt(req.query.page, 1);
    const limit = Math.min(positiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const unreadOnly = String(req.query.unread).toLowerCase() === "true";

    const where = {
      receiver_id: userId,
      deleted_at: null,
      ...(unreadOnly ? { read_at: null } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { receiver_id: userId, deleted_at: null, read_at: null },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully",
      notifications: notifications.map(toResponse),
      unreadCount,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error retrieving notifications:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH /api/notifications/:id/read
// Only sets read_at (the first time). Calling it again changes nothing.
export const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const notification = await findOwn(req.params.id, userId);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const updated = notification.read_at
      ? notification
      : await prisma.notification.update({
          where: { id: notification.id },
          data: { read_at: new Date(), updated_at: new Date() },
        });

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification: toResponse(updated),
    });
  } catch (error) {
    console.error("Error marking notification as read:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// DELETE /api/notifications/:id
// Soft delete: the row stays in the database with deleted_at set.
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const notification = await findOwn(req.params.id, userId);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    await prisma.notification.update({
      where: { id: notification.id },
      data: { deleted_at: new Date(), updated_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("Error deleting notification:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
