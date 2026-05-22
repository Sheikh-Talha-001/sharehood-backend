// ============================================================
// models/suspensionAppealModel.js — Suspension Appeal Schema
// ============================================================
//
// WHY A SEPARATE COLLECTION (NOT INSIDE User model)?
//   Storing appeal data inside the User document is an
//   anti-pattern for several important reasons:
//
//   1. AUDIT HISTORY:
//      A user might appeal multiple times over their lifetime.
//      Embedding one appeal in the user document means old
//      appeals are overwritten and lost forever.
//      A separate collection keeps the FULL history of every
//      appeal ever submitted — who submitted it, what they said,
//      when it was reviewed, and what the admin decided.
//
//   2. SINGLE RESPONSIBILITY:
//      The User model should describe WHO the user is.
//      Moderation workflow state (appeals, decisions, responses)
//      is WHAT happened to them — a separate concern.
//      Mixing operational data into identity models creates bloat.
//
//   3. ADMIN WORKFLOW:
//      Admins need a dedicated queue to see all pending appeals
//      without scanning through every user document. A dedicated
//      collection makes this a simple indexed query.
//
//   4. SCALABILITY:
//      In the future you may want to paginate appeals, add
//      filters (by date, status, user), or archive old ones.
//      A separate collection supports all of this without
//      restructuring the User model.
//
// SUSPENSION LIFECYCLE (full picture):
//   SUSPEND:   Admin sets user.isSuspended = true
//   APPEAL:    User submits SuspensionAppeal (status: pending)
//   REVIEW:    Admin approves/rejects the appeal
//   APPROVE:   user.isSuspended = false → user can log in again
//   REJECT:    User stays suspended — can submit a new appeal later
//
// STATUS ENUM:
//   pending  → User submitted, admin queue
//   approved → Admin accepted — user account restored
//   rejected → Admin declined — user stays suspended
// ============================================================

const mongoose = require("mongoose");

const suspensionAppealSchema = new mongoose.Schema(
  {
    // --- Who is appealing? ---
    // Reference to User for easy population (name, email, etc.)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Appeal must be linked to a user"],
    },

    // --- Email stored separately for quick admin display ---
    // Even if the user document changes, we have a record of
    // what email was used at time of appeal.
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },

    // --- The user's explanation for why suspension should be lifted ---
    // Min 20 chars prevents meaningless one-word appeals.
    // Max 2000 chars keeps it focused and readable for admins.
    appealMessage: {
      type: String,
      required: [true, "Please provide an appeal message"],
      trim: true,
      minlength: [20, "Appeal message must be at least 20 characters"],
      maxlength: [2000, "Appeal message cannot exceed 2000 characters"],
    },

    // --- Current state of this appeal ---
    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected"],
        message: "Status must be: pending, approved, or rejected",
      },
      default: "pending",
    },

    // --- Admin's written response to the user ---
    // Optional for approvals, recommended for rejections
    // (so the user understands what they need to do differently).
    adminResponse: {
      type: String,
      trim: true,
      default: "",
    },

    // --- Which admin reviewed this appeal? ---
    // Accountability — we know exactly who made the decision.
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // --- When was the decision made? ---
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = when appeal was submitted
  }
);

// ============================================================
// INDEXES — Performance for common admin queries
// ============================================================
// Admin queue: "Show me all pending appeals" — most common query
suspensionAppealSchema.index({ status: 1, createdAt: -1 });

// Check for duplicate: "Does this user have a pending appeal?"
suspensionAppealSchema.index({ user: 1, status: 1 });

const SuspensionAppeal = mongoose.model("SuspensionAppeal", suspensionAppealSchema);

module.exports = SuspensionAppeal;
