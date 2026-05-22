// ============================================================
// models/notificationModel.js — In-App Notification Schema
// ============================================================
//
// WHAT IS AN EVENT-DRIVEN NOTIFICATION SYSTEM?
//   Instead of users manually checking every status, the system
//   automatically creates a notification whenever something
//   important happens (borrow request received, item approved, etc.)
//   The user sees a badge/count in the UI and can read the details.
//
// WHY IN-APP NOTIFICATIONS IMPROVE UX:
//   1. AWARENESS: Users know instantly when something happens
//      without refreshing the page or polling the API.
//   2. CONTEXT: Notifications link directly to the related item,
//      request, or agreement — no hunting for what happened.
//   3. HISTORY: Users can scroll back through past notifications
//      like an activity log.
//
// ARCHITECTURE — WHY THIS DESIGN IS FUTURE-PROOF:
//   This model stores notifications in MongoDB. Later, when you
//   want to add:
//     - Real-time: Read from this collection via Socket.io
//     - Email: Trigger email when creating a notification
//     - Push:  Trigger FCM/APNs when creating a notification
//   You only change the notification SERVICE (utils/notify.js),
//   not the model or controller. The architecture is already
//   prepared for all three channels.
//
// NOTIFICATION TYPES AND THEIR TRIGGERS:
//   borrow_request      → Owner receives when someone requests their item
//   request_approved    → Borrower receives when owner approves
//   request_rejected    → Borrower receives when owner rejects
//   item_returned       → Borrower receives when owner marks returned
//   agreement_generated → Both parties receive when agreement is created
//   verification_approved → User receives when admin approves their ID
//   verification_rejected → User receives when admin rejects their ID
//   item_removed        → Owner receives when admin removes their item
//   user_suspended      → User receives when admin suspends account
//   report_resolved     → Reporter receives when their report is resolved
//
// RECIPIENT vs SENDER:
//   recipient → who receives the notification (always set)
//   sender    → who triggered the event (optional — admins have no "sender")
// ============================================================

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // --- Who should see this notification? ---
    // Always required — every notification has a target user.
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Notification must have a recipient"],
    },

    // --- Who triggered this notification? (optional) ---
    // For borrow requests: the borrower is the sender.
    // For admin actions: no sender (null) — admin is system.
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // --- What kind of event is this? ---
    // Used by the frontend to show the right icon and color.
    type: {
      type: String,
      enum: {
        values: [
          "borrow_request",       // Owner: someone wants your item
          "request_approved",     // Borrower: your request was approved
          "request_rejected",     // Borrower: your request was rejected
          "item_returned",        // Borrower: owner marked item returned
          "agreement_generated",  // Both: agreement PDF is ready
          "verification_approved",// User: identity verified, can now list/borrow
          "verification_rejected",// User: ID docs rejected, re-submit needed
          "item_removed",         // Owner: admin removed your listing
          "user_suspended",       // User: account suspended by admin
          "report_resolved",      // Reporter: your report has been resolved
          "partner_approved",     // User: partner application approved, can list items
          "partner_rejected",     // User: partner application rejected, with reason
        ],
        message: "Invalid notification type",
      },
      required: [true, "Notification must have a type"],
    },

    // --- Short heading displayed in the notification bell ---
    // e.g., "Borrow Request Received", "Request Approved"
    title: {
      type: String,
      required: [true, "Notification must have a title"],
      trim: true,
    },

    // --- Full message explaining what happened ---
    // e.g., "Ali Khan wants to borrow your 'Ladder' from May 20–22."
    message: {
      type: String,
      required: [true, "Notification must have a message"],
      trim: true,
    },

    // --- Optional links to related documents ---
    // These allow the frontend to navigate directly to the
    // relevant item, request, or agreement from the notification.
    relatedItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      default: null,
    },

    relatedRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BorrowRequest",
      default: null,
    },

    relatedAgreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agreement",
      default: null,
    },

    relatedReport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Report",
      default: null,
    },

    // --- Has the user seen this notification? ---
    // false = unread (show badge/highlight in UI)
    // true  = user clicked/marked it as read
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // createdAt used for "2 minutes ago" display
  }
);

// ============================================================
// INDEXES — Performance for common queries
// ============================================================
// Most common query: "Give me all notifications for user X"
// This index makes that query fast even with millions of docs.
notificationSchema.index({ recipient: 1, createdAt: -1 });

// For unread count badge: "How many unread for user X?"
notificationSchema.index({ recipient: 1, isRead: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
