// ============================================================
// controllers/notificationController.js — Notification Logic
// ============================================================
//
// WHAT IS ACTIVITY TRACKING?
//   Every important action on Lendly generates a notification:
//   "Someone wants your item", "Your request was approved", etc.
//   This controller lets users:
//     - Fetch their own notification feed
//     - Mark notifications as read (one or all)
//     - Delete notifications they don't need
//     - Check their unread badge count
//
// WHY USERS LOVE NOTIFICATION SYSTEMS:
//   Without notifications, users must manually check every
//   request, agreement, and verification status by navigating
//   to different pages. Notifications bring the update to them.
//   This is the difference between a passive app and an engaged
//   community platform.
//
// SECURITY MODEL:
//   A user can ONLY interact with their OWN notifications.
//   We always filter by { recipient: req.user._id }.
//   There is NO admin-only endpoint here — admins are users too
//   and they see their own notifications like everyone else.
// ============================================================

const Notification = require("../models/notificationModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");

// ============================================================
// @route   GET /api/notifications
// @desc    Get all notifications for the logged-in user
// @access  Private
// ============================================================
//
// SORT: Newest first (most relevant at the top).
// POPULATE:
//   sender    → name (so user sees "Ali Khan wants to borrow...")
//   relatedItem → title, image (for display in notification card)
//   relatedAgreement → agreementNumber (for "View Agreement" link)
//
// QUERY PARAMS:
//   ?unread=true → return only unread notifications
// ============================================================
const getMyNotifications = asyncHandler(async (req, res, next) => {
  // Build a filter — always scoped to the logged-in user
  const filter = { recipient: req.user._id };

  // Optional: Only show unread notifications
  if (req.query.unread === "true") {
    filter.isRead = false;
  }

  const notifications = await Notification.find(filter)
    .populate("sender", "name")
    .populate("relatedItem", "title image")
    .populate("relatedAgreement", "agreementNumber")
    .sort({ createdAt: -1 }); // Newest first

  res.status(200).json({
    success: true,
    count: notifications.length,
    data: notifications,
  });
});

// ============================================================
// @route   GET /api/notifications/unread-count
// @desc    Get the count of unread notifications (for badge)
// @access  Private
// ============================================================
//
// WHY A SEPARATE COUNT ENDPOINT?
//   The frontend needs the badge count (the red circle number
//   on the bell icon) frequently — on every page load and
//   sometimes on a timer. Fetching ALL notifications just to
//   get a count wastes bandwidth.
//   This endpoint returns ONLY the number — super lightweight.
//
// Example response: { "success": true, "unreadCount": 5 }
// ============================================================
const getUnreadNotificationCount = asyncHandler(async (req, res, next) => {
  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });

  res.status(200).json({
    success: true,
    unreadCount,
  });
});

// ============================================================
// @route   PUT /api/notifications/:id/read
// @desc    Mark a single notification as read
// @access  Private
// ============================================================
//
// SECURITY: We find by BOTH _id AND recipient.
//   If the notification belongs to a different user, the
//   findOne() returns null and we return 404.
//   This prevents User A from marking User B's notifications as read.
// ============================================================
const markNotificationRead = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    recipient: req.user._id, // Ownership check
  });

  if (!notification) {
    return next(
      new ErrorResponse("Notification not found or not authorized", 404)
    );
  }

  // Idempotent — marking an already-read notification as read is fine
  if (notification.isRead) {
    return res.status(200).json({
      success: true,
      message: "Notification was already marked as read",
      data: notification,
    });
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
});

// ============================================================
// @route   PUT /api/notifications/read-all
// @desc    Mark ALL notifications as read for the logged-in user
// @access  Private
// ============================================================
//
// USE CASE: "Mark all as read" button — clears the badge count.
//
// WHY updateMany INSTEAD OF looping?
//   updateMany() is a single atomic DB operation that updates
//   all matching documents at once. Looping over each document
//   and calling save() would make N separate DB calls, which
//   is slow and wasteful for users with many notifications.
// ============================================================
const markAllNotificationsRead = asyncHandler(async (req, res, next) => {
  const result = await Notification.updateMany(
    { recipient: req.user._id, isRead: false }, // Only update unread ones
    { $set: { isRead: true } }
  );

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} notifications marked as read`,
    data: {
      markedRead: result.modifiedCount,
    },
  });
});

// ============================================================
// @route   DELETE /api/notifications/:id
// @desc    Delete a single notification
// @access  Private
// ============================================================
//
// USE CASE: User dismisses a notification they don't need.
//
// SECURITY: Same ownership check as markNotificationRead —
//   we find by both _id AND recipient to prevent cross-user deletion.
// ============================================================
const deleteNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    recipient: req.user._id, // Ownership check
  });

  if (!notification) {
    return next(
      new ErrorResponse("Notification not found or not authorized", 404)
    );
  }

  res.status(200).json({
    success: true,
    message: "Notification deleted",
    data: {},
  });
});

module.exports = {
  getMyNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
};
