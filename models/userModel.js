// ============================================================
// models/userModel.js — User Database Schema
// ============================================================
//
// VERIFICATION STATUS LIFECYCLE:
//   unverified → pending → verified
//                        ↘ rejected
//
//   unverified : new account, has not submitted documents yet
//   pending    : documents submitted, waiting for admin review
//   verified   : admin approved — user can list and borrow items
//   rejected   : admin rejected — user must re-submit
//
// PARTNER/LENDER LIFECYCLE:
//   none → pending → approved
//                  ↘ rejected
//
//   none     : has not applied to become a partner/lender
//   pending  : application submitted, waiting for admin review
//   approved : admin approved — user can now list items (canListItems = true)
//   rejected : admin rejected — user may re-apply later
//
// PROFILE MANAGEMENT ARCHITECTURE:
//   User profile data is split into two categories:
//
//   SELF-EDITABLE (the user can change these via PUT /api/users/profile):
//     - name, phoneNumber, bio, neighborhood, avatar
//     These are personal/display fields with no security implications.
//
//   SYSTEM-MANAGED (ONLY the backend/admin can change these):
//     - role, verificationStatus, partnerStatus, canListItems,
//       isSuspended, suspensionReason, suspendedAt
//     These control access, trust, and moderation. Letting users
//     edit them directly would be a critical security vulnerability.
//
//   The userController enforces this split by whitelisting only
//   safe fields in the update handler. Even if a malicious user
//   sends { role: "admin" } in the request body, it's ignored.
//
// PUBLIC vs PRIVATE PROFILE:
//   GET /api/users/profile       → returns EVERYTHING (private, owner only)
//   GET /api/users/:id/public    → returns only PUBLIC-SAFE fields
//
//   Public profile exposes: name, bio, neighborhood, avatar,
//   verification badge, partner status, listing count, join date.
//   It NEVER exposes: email, phone, suspension data, or internal IDs.
//
// WHY CAPABILITY-BASED PERMISSIONS (canListItems) INSTEAD OF ROLES?
//   Lendly uses a TRUST-FIRST marketplace model:
//     - ANYONE can browse and borrow items (after verification)
//     - ONLY approved partners/lenders can CREATE listings
//
//   We DO NOT create a "lender" role because:
//     1. Roles control "what you ARE" (user vs admin)
//     2. Capabilities control "what you CAN DO" (list items)
//     3. A user can be BOTH a borrower AND a lender — they don't
//        change roles, they gain a capability.
//     4. An admin can grant/revoke listing permission independently
//        from the user/admin role system.
//
//   This is called "Capability-Based Access Control" (CBAC).
//   It's more flexible than role-based access because capabilities
//   can be combined independently:
//     - user + canListItems = partner/lender
//     - user + !canListItems = regular borrower
//     - admin + canListItems = admin who also lists items
//     - admin + !canListItems = admin who only moderates
//
// WHY verificationStatus AND NOT JUST isVerified?
//   The boolean isVerified only has two states (true/false).
//   An enum supports the full workflow: unverified → pending →
//   verified/rejected, which lets the UI show proper messages
//   like "Your documents are under review" (pending state).
//
// isVerified is kept for backward compatibility with the
// existing JWT token response in generateToken.js.
// ============================================================
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a name"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },

    // --- Verification Status (drives the trust workflow) ---
    // This is the primary field used by the verification system.
    // The middleware/verificationMiddleware.js reads this field
    // to decide if a user is allowed to list or borrow items.
    verificationStatus: {
      type: String,
      enum: {
        values: ["unverified", "pending", "verified", "rejected"],
        message: "Status must be: unverified, pending, verified, or rejected",
      },
      default: "unverified",
    },

    // =========================================================
    // PARTNER / LENDER CAPABILITY FIELDS
    // =========================================================
    canListItems: {
      type: Boolean,
      default: false,
    },

    partnerStatus: {
      type: String,
      enum: {
        values: ["none", "pending", "approved", "rejected"],
        message: "Partner status must be: none, pending, approved, or rejected",
      },
      default: "none",
    },

    // =========================================================
    // PROFILE FIELDS — User-Editable Personal Information
    // =========================================================
    //
    // These fields are editable by the user via PUT /api/users/profile.
    // They are used for display purposes and community interaction.
    //
    // phoneNumber:
    //   Contact number for coordination during item handovers.
    //   NOT exposed in the public profile (privacy protection).
    //
    // bio:
    //   A short self-description. Shown on the public profile.
    //   Helps build trust between community members.
    //   e.g., "Engineering student at UoS. Love sharing tools!"
    //
    // neighborhood:
    //   The user's locality/area. Used for proximity-based
    //   item discovery and community building.
    //   e.g., "Satellite Town, Block A, Sargodha"
    //
    // avatar / avatarPublicId:
    //   Profile picture stored on Cloudinary. The pattern is
    //   identical to item images: we store the URL + Cloudinary
    //   public_id (for deletion when the avatar is replaced).
    //   Stored in the "lendly/avatars/" folder on Cloudinary
    //   to separate them from item images.
    // =========================================================
    phoneNumber: {
      type: String,
      trim: true,
      maxlength: [20, "Phone number cannot exceed 20 characters"],
      default: "",
    },

    bio: {
      type: String,
      trim: true,
      maxlength: [500, "Bio cannot exceed 500 characters"],
      default: "",
    },

    neighborhood: {
      type: String,
      trim: true,
      maxlength: [200, "Neighborhood cannot exceed 200 characters"],
      default: "",
    },

    avatar: {
      type: String,
      default: "",
    },

    avatarPublicId: {
      type: String,
      default: "",
    },

    // --- Suspension Fields (admin moderation) ---
    // WHY SUSPEND INSTEAD OF DELETE?
    //   Deleting a user would break all their existing borrow
    //   requests, agreements, and item references (orphan data).
    //   Suspension is reversible — the admin can re-activate later
    //   if the situation is resolved.
    //
    // ENFORCEMENT:
    //   The protect middleware in authMiddleware.js checks isSuspended
    //   on every authenticated request. Suspended users are blocked
    //   from ALL protected actions immediately.
    isSuspended: {
      type: Boolean,
      default: false,
    },

    suspensionReason: {
      type: String,
      trim: true,
      default: "",
    },

    suspendedAt: {
      type: Date,
      default: null,
    },
    // Appeals are tracked in the dedicated SuspensionAppeal collection.
    // See: models/suspensionAppealModel.js
  },
  {
    timestamps: true,
  }
);

// =========================================================
// INDEXES
// =========================================================
userSchema.index({ email: 1 });
userSchema.index({ isSuspended: 1, createdAt: -1 });
userSchema.index({ verificationStatus: 1, createdAt: -1 });
userSchema.index({ partnerStatus: 1, createdAt: -1 });

// ------------------------------------------------------------
// FIXED: Removed 'next' from async function arguments
// ------------------------------------------------------------
userSchema.pre("save", async function () {
  // If password is not modified, just finish
  if (!this.isModified("password")) {
    return;
  }

  // Generate salt and hash
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  
  // NOTE: In async pre-hooks, you don't call next(). 
  // Returning from the function is enough for Mongoose.
});

userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
