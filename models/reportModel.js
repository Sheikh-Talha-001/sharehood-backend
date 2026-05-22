// ============================================================
// models/reportModel.js — Community Reporting System Schema
// ============================================================
//
// WHAT IS A REPORT?
//   A report is a flag raised by a community member when they
//   see something inappropriate — a problematic user, a
//   misleading item listing, or a rule violation.
//
// WHY REPORTS MATTER FOR TRUST:
//   1. COMMUNITY POLICING: Users help admins spot problems
//      that automated systems might miss.
//   2. ACCOUNTABILITY: Bad actors can be identified and suspended.
//   3. TRANSPARENCY: The admin can review, investigate, and take
//      action — creating a fair moderation process.
//   4. SCALABILITY: As the platform grows, admins can't manually
//      review everything. Reports surface the highest-priority
//      issues for human review.
//
// REPORT TARGETS:
//   A report can target either a USER or an ITEM (or both).
//   - Report a user: e.g., "This person never returns items"
//   - Report an item: e.g., "This listing is fake/misleading"
//   Both fields are optional so a report can apply to either.
//
// REPORT LIFECYCLE:
//   pending  → Admin hasn't looked at it yet
//   reviewed → Admin has read it, investigation in progress
//   resolved → Admin took action (suspension, item removal, etc.)
//   dismissed → Admin determined the report was invalid/spam
//
// ADMIN NOTES:
//   Admins can add internal notes documenting what action they
//   took and why. These notes are only visible to admins.
// ============================================================

const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    // --- Who submitted this report? ---
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Report must have a reporter"],
    },

    // --- Which user is being reported? (optional) ---
    // If reporting a person: "This user is behaving badly"
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // --- Which item is being reported? (optional) ---
    // If reporting a listing: "This item is fake/misleading"
    reportedItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      default: null,
    },

    // --- Short reason category ---
    // e.g., "fraud", "inappropriate", "spam", "damaged-item"
    reason: {
      type: String,
      required: [true, "Please provide a reason for the report"],
      trim: true,
    },

    // --- Detailed description ---
    // The reporter's full explanation of what happened
    description: {
      type: String,
      required: [true, "Please provide a description"],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },

    // --- Current moderation status ---
    status: {
      type: String,
      enum: {
        values: ["pending", "reviewed", "resolved", "dismissed"],
        message: "Status must be: pending, reviewed, resolved, or dismissed",
      },
      default: "pending",
    },

    // --- Which admin reviewed this report? ---
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // --- When was it reviewed? ---
    reviewedAt: {
      type: Date,
      default: null,
    },

    // --- Admin's internal notes ---
    // e.g., "Suspended user for policy violation. Item removed."
    // These are NOT visible to the reporter — admin-only.
    adminNotes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================
// INDEXES — Speed up common queries
// ============================================================
reportSchema.index({ status: 1, createdAt: -1 });    // Admin review queue
reportSchema.index({ reportedBy: 1, createdAt: -1 }); // User's own reports
reportSchema.index({ reportedUser: 1 });              // Reports against a user
reportSchema.index({ reportedItem: 1 });              // Reports against an item

const Report = mongoose.model("Report", reportSchema);

module.exports = Report;
