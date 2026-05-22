// ============================================================
// models/verificationRequestModel.js — ID Verification Schema
// ============================================================
//
// WHAT IS A VERIFICATION REQUEST?
//   Before a user can list items or borrow items on ShareHood,
//   they must verify their identity. A VerificationRequest stores
//   the submitted documents until an admin reviews and approves them.
//
// WHY REQUIRE VERIFICATION?
//   1. TRUST: Knowing real people are behind each account builds
//      community trust. You wouldn't lend your drill to a stranger
//      with no identity — but you would to a verified neighbor.
//   2. ACCOUNTABILITY: If something is lost or damaged, the platform
//      has enough information to mediate the dispute.
//   3. FRAUD PREVENTION: Stops fake accounts from abusing the system.
//
// DOCUMENT STORAGE STRATEGY:
//   We store Cloudinary URLs (not the actual files) in MongoDB.
//   Each image also has a "public_id" which lets us DELETE it later.
//
//   WHY CLOUDINARY FOR IDs?
//     - Documents stay off our server disk (no sensitive files on disk)
//     - Cloudinary supports access control if needed
//     - We can delete the originals after verification for privacy
//
// PRIVACY CONSIDERATIONS:
//   - National ID numbers are stored in the DB but NEVER returned
//     to non-admin users (enforced in the controller)
//   - Only admins can view submitted documents
//   - Users can only see their own submission STATUS (not the images)
//
// LIFECYCLE:
//   1. User submits: status = pending, user.verificationStatus = pending
//   2. Admin approves: status = approved, user.verificationStatus = verified
//   3. Admin rejects: status = rejected, user.verificationStatus = rejected
//                     rejectionReason recorded so user knows why
//
// RELATIONSHIP:
//   verificationRequest.user → users._id  (one request per user at a time)
// ============================================================

const mongoose = require("mongoose");

const verificationRequestSchema = new mongoose.Schema(
  {
    // --- Which user submitted this request? ---
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Verification request must be linked to a user"],
    },

    // --- National ID / CNIC number ---
    // Stored for admin review only. NEVER returned in public APIs.
    // e.g., "12345-6789012-3" (Pakistan CNIC format)
    nationalIdNumber: {
      type: String,
      required: [true, "Please provide your national ID number"],
      trim: true,
    },

    // --- Front image of the national ID card ---
    idFrontImage: {
      type: String, // Cloudinary URL
      required: [true, "Please upload the front of your ID"],
    },

    idFrontImagePublicId: {
      type: String, // Cloudinary public_id (needed for deletion)
      required: [true, "ID front image public ID is required"],
    },

    // --- Back image of the national ID card (optional) ---
    // Some IDs only have one side. We make this optional.
    idBackImage: {
      type: String,
      default: "",
    },

    idBackImagePublicId: {
      type: String,
      default: "",
    },

    // --- Selfie with the ID (liveness proof) ---
    // The user holds their ID next to their face. This proves the
    // submitted ID belongs to the actual account holder, not someone
    // who found a photo of an ID online.
    selfieWithId: {
      type: String,
      required: [true, "Please upload a selfie holding your ID"],
    },

    selfieWithIdPublicId: {
      type: String,
      required: [true, "Selfie public ID is required"],
    },

    // --- Current review status ---
    // pending  → admin hasn't reviewed yet
    // approved → admin verified the documents
    // rejected → admin found an issue with the documents
    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected"],
        message: "Status must be: pending, approved, or rejected",
      },
      default: "pending",
    },

    // --- Why was it rejected? ---
    // Set by admin when rejecting. Helps the user understand what
    // to fix before re-submitting.
    // e.g., "Selfie was blurry", "ID is expired"
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    // --- Which admin reviewed this request? ---
    // Stored for audit trail purposes.
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
  },
  {
    timestamps: true, // createdAt = submission time, updatedAt = review time
  }
);

// ============================================================
// INDEX — Fast lookups by user
// ============================================================
// Most common query: "Find the latest verification request for this user"
// Without an index, MongoDB would scan all documents (slow).
verificationRequestSchema.index({ user: 1, createdAt: -1 });

// Index for admin to quickly find all pending requests
verificationRequestSchema.index({ status: 1, createdAt: -1 });

const VerificationRequest = mongoose.model(
  "VerificationRequest",
  verificationRequestSchema
);

module.exports = VerificationRequest;
