// ============================================================
// models/agreementModel.js — Digital Agreement Database Schema
// ============================================================
//
// WHAT IS A DIGITAL AGREEMENT?
//   When an owner APPROVES a borrow request, the system auto-
//   generates a formal agreement document. This agreement acts
//   as a digital contract between borrower and owner, recording:
//     - Who is borrowing what
//     - When the item should be returned
//     - The condition of the item before and after
//
// WHY AGREEMENTS IMPROVE TRUST:
//   1. Accountability: Both parties have a record of the deal
//   2. Dispute Resolution: If something goes wrong, there's proof
//   3. Condition Tracking: Know the item's state before/after
//   4. Professional: Makes the platform feel trustworthy
//   5. PDF Download: Users can keep a copy for their records
//
// LIFECYCLE:
//   1. Borrow request approved → Agreement auto-created (active)
//   2. Owner marks returned    → Agreement completed
//      - actualReturnDate recorded
//      - itemConditionAfter recorded
//   3. Agreement cancelled     → If borrow request is cancelled
//
// RELATIONSHIPS (ObjectId References):
//   agreement.request  → borrowRequests._id  (which request?)
//   agreement.item     → items._id           (which item?)
//   agreement.borrower → users._id           (who borrows?)
//   agreement.owner    → users._id           (who owns?)
//
// AGREEMENT NUMBER:
//   A unique human-readable ID like "SH-AGR-1747062600000-A3F2"
//   This is easier to reference than a MongoDB ObjectId.
//   Format: SH-AGR-{timestamp}-{random4chars}
// ============================================================

const mongoose = require("mongoose");

const agreementSchema = new mongoose.Schema(
  {
    // --- Which borrow request triggered this agreement? ---
    // Every agreement is tied to exactly one borrow request.
    // This creates a 1-to-1 relationship.
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BorrowRequest",
      required: [true, "Agreement must reference a borrow request"],
    },

    // --- Which item is being borrowed? ---
    // Stored directly for fast lookups (denormalized from request)
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: [true, "Agreement must reference an item"],
    },

    // --- Who is borrowing? ---
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Agreement must have a borrower"],
    },

    // --- Who owns the item? ---
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Agreement must have an owner"],
    },

    // --- When does the borrow period start? ---
    borrowDate: {
      type: Date,
      required: [true, "Agreement must have a borrow date"],
    },

    // --- When should the item be returned? ---
    expectedReturnDate: {
      type: Date,
      required: [true, "Agreement must have an expected return date"],
    },

    // --- When was the item ACTUALLY returned? ---
    // This is null until the owner marks it as returned.
    // Comparing this to expectedReturnDate shows if it was late.
    actualReturnDate: {
      type: Date,
      default: null,
    },

    // --- What condition was the item BEFORE lending? ---
    // Recorded when the agreement is created (from the item model).
    // e.g., "good", "like-new", "fair"
    itemConditionBefore: {
      type: String,
      trim: true,
      default: "",
    },

    // --- What condition was the item AFTER return? ---
    // Recorded by the owner when they mark the item as returned.
    // Comparing before/after helps resolve damage disputes.
    itemConditionAfter: {
      type: String,
      trim: true,
      default: "",
    },

    // --- Current status of the agreement ---
    // active    → item is currently being borrowed
    // completed → item has been returned
    // cancelled → agreement was cancelled (e.g., borrow request cancelled)
    agreementStatus: {
      type: String,
      enum: {
        values: ["active", "completed", "cancelled"],
        message: "Status must be: active, completed, or cancelled",
      },
      default: "active",
    },

    // --- File path to the generated PDF ---
    // e.g., "uploads/agreements/SH-AGR-1747062600000-A3F2.pdf"
    // This path is used to serve the PDF for download.
    pdfPath: {
      type: String,
      default: "",
    },

    // --- Human-readable agreement number ---
    // e.g., "SH-AGR-1747062600000-A3F2"
    // Easier to reference than a MongoDB ObjectId in conversations,
    // emails, or dispute resolutions.
    agreementNumber: {
      type: String,
      unique: true,
      required: [true, "Agreement must have a unique agreement number"],
    },
  },
  {
    // timestamps: true → auto-adds createdAt and updatedAt
    timestamps: true,
  }
);

// ============================================================
// INDEXES — Speed up common queries
// ============================================================
// Most common queries:
//   1. "Show me all my agreements as a borrower"
//   2. "Show me all agreements for items I own"
//   3. "Find the agreement for this specific request"
// ============================================================
agreementSchema.index({ borrower: 1, createdAt: -1 });
agreementSchema.index({ owner: 1, createdAt: -1 });
agreementSchema.index({ request: 1 }, { unique: true }); // One agreement per request

const Agreement = mongoose.model("Agreement", agreementSchema);

module.exports = Agreement;
