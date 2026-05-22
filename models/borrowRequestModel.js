// ============================================================
// models/borrowRequestModel.js — Borrow Request Database Schema
// ============================================================
//
// WHAT IS A BORROW REQUEST?
//   When User A wants to borrow an item owned by User B, they
//   create a BorrowRequest. This document tracks the entire
//   lifecycle of that transaction:
//     pending → approved → returned   (happy path)
//     pending → rejected              (owner declines)
//     pending → cancelled             (borrower changes mind)
//
// RELATIONSHIPS (ObjectId References):
//   This model links THREE collections together:
//     borrowRequests.item     → items._id      (which item?)
//     borrowRequests.borrower → users._id      (who wants it?)
//     borrowRequests.owner    → users._id      (who owns it?)
//
//   Using .populate() on any of these fields replaces the raw
//   ObjectId with the actual document data when we query.
//
// WHY STORE BOTH borrower AND owner?
//   We could look up the owner via the item, but storing it
//   directly on the request lets us:
//     1. Query "all requests for items I own" with a single
//        indexed field (no join through the items collection)
//     2. Keep the request valid even if the item is later deleted
//     3. Simplify ownership checks in the controller
//
// STATUS TRANSITIONS (State Machine):
//   ┌─────────┐
//   │ pending │──→ approved ──→ returned
//   │         │──→ rejected
//   │         │──→ cancelled
//   └─────────┘
//
//   Only valid transitions are enforced by the controller:
//     - approved / rejected : only the OWNER can trigger
//     - cancelled           : only the BORROWER can trigger
//     - returned            : only the OWNER can trigger
//                             (and only from approved status)
// ============================================================

const mongoose = require("mongoose");

const borrowRequestSchema = new mongoose.Schema(
  {
    // --- Which item is being requested? ---
    // type: ObjectId → stores a MongoDB _id from the items collection
    // ref: "Item"   → tells Mongoose to populate from the Item model
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: [true, "Borrow request must reference an item"],
    },

    // --- Who wants to borrow it? ---
    // This is the user who CREATED the request
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Borrow request must have a borrower"],
    },

    // --- Who owns the item? ---
    // Stored directly for fast queries and ownership checks
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Borrow request must have an owner"],
    },

    // --- Optional message from borrower to owner ---
    // e.g. "Hey, I need this drill for the weekend!"
    message: {
      type: String,
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters"],
      default: "",
    },

    // --- When does the borrower need it? ---
    startDate: {
      type: Date,
      required: [true, "Please provide a start date"],
    },

    // --- When will it be returned? ---
    expectedReturnDate: {
      type: Date,
      required: [true, "Please provide an expected return date"],
    },

    // --- Current status of the request ---
    // enum: restricts the value to one of these exact strings
    // default: new requests always start as "pending"
    //
    // STATUS MEANINGS:
    //   pending   → waiting for the owner to respond
    //   approved  → owner said yes, item is now with the borrower
    //   rejected  → owner said no
    //   returned  → borrower gave the item back
    //   cancelled → borrower withdrew the request before approval
    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected", "returned", "cancelled"],
        message: "Status must be: pending, approved, rejected, returned, or cancelled",
      },
      default: "pending",
    },
  },
  {
    // timestamps: true → Mongoose auto-adds createdAt and updatedAt fields
    // createdAt = when the request was first made
    // updatedAt = when the status last changed
    timestamps: true,
  }
);

// ============================================================
// COMPOUND INDEX — Prevent duplicate pending requests
// ============================================================
// This index ensures that a borrower cannot have more than one
// PENDING request for the same item. The { unique: true } constraint
// is only enforced for documents where the partialFilterExpression
// matches (i.e., status === "pending").
//
// WITHOUT THIS: A user could spam 100 pending requests for the
// same item, flooding the owner's inbox.
//
// WHY partialFilterExpression?
//   We only want uniqueness on PENDING requests. After a request
//   is rejected or cancelled, the borrower should be able to
//   request the same item again.
// ============================================================
borrowRequestSchema.index(
  { item: 1, borrower: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

// ============================================================
// QUERY PERFORMANCE INDEXES
// ============================================================
// These indexes speed up the two most common queries:
//   1. "Show me all requests I've made"   → indexed by borrower
//   2. "Show me all requests for my items" → indexed by owner
// Without indexes, MongoDB would scan every document in the
// collection (slow when you have thousands of requests).
// ============================================================
borrowRequestSchema.index({ borrower: 1, createdAt: -1 });
borrowRequestSchema.index({ owner: 1, createdAt: -1 });

const BorrowRequest = mongoose.model("BorrowRequest", borrowRequestSchema);

module.exports = BorrowRequest;
