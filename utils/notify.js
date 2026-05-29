// ============================================================
// utils/notify.js — Centralized Notification Creation Utility
// ============================================================
//
// WHY A SEPARATE UTILITY INSTEAD OF CALLING THE MODEL DIRECTLY?
//   Every controller that needs to send a notification would
//   have to: import Notification, construct the object, handle
//   errors, and in the future add socket/email/push logic.
//   That's a LOT of repeated code spread across 4 controllers.
//
//   Instead, ALL notification logic lives here in one place:
//     - Database insert → always happens here
//     - Socket.io       → plug in here (when you're ready)
//     - Email           → plug in here (Nodemailer/SendGrid)
//     - Push            → plug in here (Firebase FCM)
//
// HOW IT WORKS:
//   Every event calls:
//     await notify({ recipient, sender, type, title, message, ...refs })
//   That's the entire API surface — one clean function call.
//
// ERROR HANDLING PHILOSOPHY:
//   Notification failures should NEVER crash the main action.
//   If creating a borrow request succeeds but the notification
//   fails, the user still gets their request created. The
//   notification is a "nice to have" — it should not be a
//   blocking dependency.
//   We wrap all notification creation in try/catch and only
//   log errors (never throw them to the caller).
//
// FUTURE SCALABILITY:
//   When you're ready for real-time notifications:
//   Step 1: Import your io instance here:
//     const { getIO } = require("../socket");
//   Step 2: After Notification.create(), emit:
//     getIO().to(recipient.toString()).emit("new_notification", saved);
//   That's all — the rest of the architecture stays the same.
// ============================================================

const Notification = require("../models/notificationModel");

// ============================================================
// notify() — Create a notification in the database
// ============================================================
//
// PARAMS (all passed as a single object for readability):
//   recipient         (ObjectId, required) — who receives it
//   sender            (ObjectId, optional) — who triggered it
//   type              (string, required)   — see notificationModel enum
//   title             (string, required)   — short heading
//   message           (string, required)   — full description
//   relatedItem       (ObjectId, optional) — link to item
//   relatedRequest    (ObjectId, optional) — link to borrow request
//   relatedAgreement  (ObjectId, optional) — link to agreement
//   relatedReport     (ObjectId, optional) — link to report
//
// RETURNS:
//   The saved Notification document (or null if an error occurred)
// ============================================================
const notify = async ({
  recipient,
  sender = null,
  type,
  title,
  message,
  relatedItem = null,
  relatedRequest = null,
  relatedAgreement = null,
  relatedReport = null,
}) => {
  try {
    // --- Save to database ---
    const notification = await Notification.create({
      recipient,
      sender,
      type,
      title,
      message,
      relatedItem,
      relatedRequest,
      relatedAgreement,
      relatedReport,
    });

    // ═══════════════════════════════════════════════════════
    // 🔌 REAL-TIME (Socket.io) — Push to connected clients
    // ═══════════════════════════════════════════════════════
    try {
      const { getIO } = require("../socket");
      const io = getIO();
      if (io) {
        // Emit the full notification object for the dropdown
        io.to(recipient.toString()).emit("new_notification", notification);
        
        // Emit an updated unread count so the badge refreshes instantly
        // without requiring a separate API call
        const unreadCount = await Notification.countDocuments({
          recipient,
          isRead: false,
        });
        io.to(recipient.toString()).emit("unread_count_update", { unreadCount });
      }
    } catch (socketErr) {
      console.error("[notify] Socket emit failed:", socketErr.message);
    }

    return notification;
  } catch (error) {
    // Log the error but DO NOT throw it.
    // A failed notification must never break the main action.
    console.error(`[notify] Failed to create notification (type: ${type}):`, error.message);
    return null;
  }
};

// ============================================================
// notifyAdmins() — Send a notification to ALL admin users
// ============================================================
// Used when a user submits something that requires admin review:
//   - Verification documents
//   - Partner applications
//   - Reports
//   - Suspension appeals
//
// This finds all admin users and creates one notification per admin.
// Errors are logged but never thrown (same philosophy as notify).
// ============================================================
const notifyAdmins = async ({ sender = null, type, title, message, relatedItem = null, relatedRequest = null, relatedAgreement = null, relatedReport = null }) => {
  try {
    const User = require("../models/userModel");
    const admins = await User.find({ role: "admin" }).select("_id");

    if (admins.length === 0) {
      console.warn("[notifyAdmins] No admin users found in the database");
      return [];
    }

    const results = await Promise.all(
      admins.map((admin) =>
        notify({
          recipient: admin._id,
          sender,
          type,
          title,
          message,
          relatedItem,
          relatedRequest,
          relatedAgreement,
          relatedReport,
        })
      )
    );

    return results.filter(Boolean);
  } catch (error) {
    console.error(`[notifyAdmins] Failed to notify admins (type: ${type}):`, error.message);
    return [];
  }
};

module.exports = { notify, notifyAdmins };
