// ============================================================
// routes/notificationRoutes.js — Notification URL Definitions
// ============================================================
//
// IMPORTANT ROUTE ORDER:
//   GET  /unread-count  ← MUST come BEFORE /:id
//   PUT  /read-all      ← MUST come BEFORE /:id/read
//
//   If /:id comes first, Express treats "unread-count" and
//   "read-all" as ID parameters, causing wrong function calls.
//
// ROUTE MAP:
//   GET    /api/notifications              → All my notifications
//   GET    /api/notifications/unread-count → Unread badge count
//   PUT    /api/notifications/read-all     → Mark all as read
//   PUT    /api/notifications/:id/read     → Mark one as read
//   DELETE /api/notifications/:id          → Delete one
//
// All routes require a valid JWT (protect middleware).
// ============================================================

const express = require("express");
const router = express.Router();

const {
  getMyNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} = require("../controllers/notificationController");

const { protect } = require("../middleware/authMiddleware");

// ⚠️ Named routes MUST come before parameterized routes (:id)
router.get("/", protect, getMyNotifications);
router.get("/unread-count", protect, getUnreadNotificationCount);
router.put("/read-all", protect, markAllNotificationsRead);
router.put("/:id/read", protect, markNotificationRead);
router.delete("/:id", protect, deleteNotification);

module.exports = router;
