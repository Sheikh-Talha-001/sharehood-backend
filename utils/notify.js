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
    // 🔌 FUTURE INTEGRATION HOOKS — Plug in here
    // ═══════════════════════════════════════════════════════
    //
    // REAL-TIME (Socket.io):
    //   const { getIO } = require("../socket");
    //   getIO().to(recipient.toString()).emit("new_notification", notification);
    //
    // EMAIL (Nodemailer / SendGrid):
    //   const emailService = require("./emailService");
    //   await emailService.sendNotificationEmail(recipient, title, message);
    //
    // PUSH (Firebase FCM):
    //   const pushService = require("./pushService");
    //   await pushService.send(recipient, title, message);
    //
    // All three can be enabled independently without changing
    // any controller code — just uncomment the lines above.
    // ═══════════════════════════════════════════════════════

    return notification;
  } catch (error) {
    // Log the error but DO NOT throw it.
    // A failed notification must never break the main action.
    console.error(`[notify] Failed to create notification (type: ${type}):`, error.message);
    return null;
  }
};

module.exports = { notify };
