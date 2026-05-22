// ============================================================
// models/partnerApplicationModel.js — Partner/Lender Application Schema
// ============================================================
//
// WHAT IS A PARTNER APPLICATION?
//   ShareHood is a TRUST-FIRST marketplace. Not everyone can list
//   items for lending. Users must apply to become a "partner" (lender),
//   and an admin must approve them before they can create listings.
//
//   This model stores each application and its review lifecycle:
//     pending → approved   (admin grants listing permission)
//     pending → rejected   (admin denies, with reason)
//
// WHY REQUIRE AN APPLICATION?
//   Without a vetting process, anyone could list items — including
//   fake listings, stolen goods, or spam. The application process:
//     1. Collects business/personal info for admin review
//     2. Creates an auditable record of who was approved and why
//     3. Lets admins reject bad actors before they enter the marketplace
//     4. Builds trust with borrowers ("every lender is vetted")
//
// RELATIONSHIP TO USER MODEL:
//   This model links to the User via the "user" ObjectId reference.
//   When an application is APPROVED:
//     → user.canListItems = true    (capability flag)
//     → user.partnerStatus = "approved"  (workflow state)
//   When REJECTED:
//     → user.partnerStatus = "rejected"  (allows re-application later)
//
// DUPLICATE PREVENTION:
//   A compound partial index ensures ONE pending application per user.
//   If a user already has a pending application, they cannot submit
//   another one until the first is reviewed. After review (approved
//   or rejected), they can submit a new application.
//
// ADMIN REVIEW FIELDS:
//   reviewedBy → which admin reviewed this application
//   reviewedAt → when the review happened
//   rejectionReason → why it was rejected (only for rejected apps)
//   These create a complete audit trail for accountability.
// ============================================================

const mongoose = require("mongoose");

const partnerApplicationSchema = new mongoose.Schema(
  {
    // --- Who submitted this application? ---
    // Links to the User collection via ObjectId reference.
    // .populate("user", "name email") replaces the ID with user data.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Application must be linked to a user"],
    },

    // --- Applicant Details ---
    // These fields capture the information admins need to decide
    // whether to approve or reject the application.

    fullName: {
      type: String,
      required: [true, "Please provide your full name"],
      trim: true,
      maxlength: [100, "Full name cannot exceed 100 characters"],
    },

    phoneNumber: {
      type: String,
      required: [true, "Please provide a phone number"],
      trim: true,
      maxlength: [20, "Phone number cannot exceed 20 characters"],
    },

    // --- What categories of items do they want to list? ---
    // Stored as an array of strings (e.g., ["Tools", "Electronics"]).
    // This helps admins understand the applicant's focus area.
    // Must have at least one category selected.
    categoriesInterestedIn: {
      type: [String],
      required: [true, "Please select at least one category"],
      validate: {
        validator: function (arr) {
          return arr.length > 0;
        },
        message: "Please select at least one category of interest",
      },
    },

    // --- Why does the user want to become a partner? ---
    // A free-text field where the applicant explains their motivation.
    // This gives admins qualitative data to make informed decisions.
    reasonForJoining: {
      type: String,
      required: [true, "Please explain why you want to become a partner"],
      trim: true,
      maxlength: [1000, "Reason cannot exceed 1000 characters"],
    },

    // --- Optional business name ---
    // Some applicants may represent a small business or organization
    // (e.g., a campus equipment rental service). This is optional
    // because individual lenders may not have a business name.
    businessName: {
      type: String,
      trim: true,
      maxlength: [100, "Business name cannot exceed 100 characters"],
      default: "",
    },

    // --- City / Location ---
    city: {
      type: String,
      required: [true, "Please provide your city"],
      trim: true,
      maxlength: [100, "City cannot exceed 100 characters"],
    },

    // --- Relevant experience description ---
    // What experience does the applicant have with lending, sharing,
    // or managing physical goods? This helps admins gauge reliability.
    experienceDescription: {
      type: String,
      required: [true, "Please describe your relevant experience"],
      trim: true,
      maxlength: [1000, "Experience description cannot exceed 1000 characters"],
    },

    // --- Application Status (workflow state) ---
    // pending  → submitted, waiting for admin review
    // approved → admin granted listing permission
    // rejected → admin denied, with a reason
    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected"],
        message: "Status must be: pending, approved, or rejected",
      },
      default: "pending",
    },

    // =========================================================
    // ADMIN REVIEW FIELDS — Audit Trail
    // =========================================================
    // These fields are set by the admin when they review the
    // application. They create a complete audit trail:
    //   - WHO reviewed it (reviewedBy → admin user ID)
    //   - WHEN it was reviewed (reviewedAt → timestamp)
    //   - WHY it was rejected (rejectionReason → explanation)
    //
    // WHY TRACK THE REVIEWING ADMIN?
    //   Accountability. If a partner causes problems later,
    //   management can see which admin approved them and when.
    // =========================================================

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    // timestamps adds createdAt (when applied) and updatedAt (last change)
    timestamps: true,
  }
);

// ============================================================
// COMPOUND PARTIAL INDEX — Prevent Duplicate Pending Applications
// ============================================================
// This index ensures that a user can only have ONE pending
// application at a time. The partialFilterExpression limits
// the uniqueness constraint to only documents where
// status === "pending".
//
// WITHOUT THIS:
//   A user could spam 50 pending applications, flooding
//   the admin review queue with duplicates.
//
// WHY partialFilterExpression?
//   After an application is reviewed (approved/rejected), the
//   user should be able to submit a new one (e.g., after fixing
//   issues that caused rejection). The partial filter only
//   enforces uniqueness on PENDING applications.
//
// WHAT HAPPENS IF THEY TRY?
//   MongoDB throws a duplicate key error (code 11000).
//   The controller checks for this BEFORE hitting the DB
//   to give a user-friendly error message.
// ============================================================
partnerApplicationSchema.index(
  { user: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

// Query performance: "List all pending applications" (admin dashboard)
partnerApplicationSchema.index({ status: 1, createdAt: -1 });

const PartnerApplication = mongoose.model(
  "PartnerApplication",
  partnerApplicationSchema
);

module.exports = PartnerApplication;
