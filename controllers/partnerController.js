// ============================================================
// controllers/partnerController.js — Partner/Lender Application Logic
// ============================================================
//
// TRUST-FIRST MARKETPLACE — PARTNER ONBOARDING SYSTEM:
//   ShareHood restricts item listing to vetted partners/lenders.
//   This controller handles the USER-FACING side of that process:
//
//   1. APPLY:     POST /api/partners/apply
//                 A verified user submits their partner application.
//
//   2. STATUS:    GET /api/partners/my-application
//                 The user checks the status of their application.
//
// WHO CAN APPLY?
//   Only users who have completed identity verification
//   (verificationStatus === "verified"). This is a prerequisite
//   because we need to trust the applicant's identity before
//   granting them the ability to list items for others to borrow.
//
// WHAT HAPPENS AFTER APPLYING?
//   The application goes to the admin review queue. An admin
//   can approve or reject it via the admin moderation APIs:
//     PUT /api/admin/partner-applications/:id/approve
//     PUT /api/admin/partner-applications/:id/reject
//
// DUPLICATE PREVENTION:
//   A user can only have ONE pending application at a time.
//   We check for this in the controller (for friendly errors)
//   AND in the database (with a partial unique index as a safety net).
//
// ADMIN-SIDE MODERATION:
//   The admin moderation logic lives in adminPartnerController.js,
//   NOT here. This controller is ONLY for user-facing actions.
//   Separation of concerns keeps each file focused and testable.
// ============================================================

const PartnerApplication = require("../models/partnerApplicationModel");
const User = require("../models/userModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");

// ============================================================
// @route   POST /api/partners/apply
// @desc    Submit a partner/lender application
// @access  Private (authenticated + verified users only)
// ============================================================
//
// BUSINESS RULES ENFORCED:
//   1. User must be identity-verified (verificationStatus === "verified")
//   2. User must not already be an approved partner
//   3. User must not have a pending application
//   4. All required fields must be provided
//
// MIDDLEWARE CHAIN:
//   protect → requireVerified → applyAsPartner
//
// WHY CHECK verificationStatus HERE TOO?
//   The requireVerified middleware already blocks unverified users
//   at the route level. But we double-check here as a safety net
//   in case the middleware chain is accidentally changed later.
//   Defense in depth — never rely on a single layer of protection.
//
// SIDE EFFECTS:
//   When the application is created:
//     → user.partnerStatus changes from "none" to "pending"
//   This lets the frontend show "Application under review" immediately.
// ============================================================
const applyAsPartner = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  // --- RULE 1: Must be identity-verified ---
  // Defense in depth — requireVerified middleware should catch this first
  if (req.user.verificationStatus !== "verified") {
    return next(
      new ErrorResponse(
        "Identity verification required before applying as a partner. Please complete verification first.",
        403
      )
    );
  }

  // --- RULE 2: Must not already be an approved partner ---
  // If they're already approved, there's nothing to apply for
  if (req.user.canListItems === true) {
    return next(
      new ErrorResponse(
        "You are already an approved partner and can list items.",
        400
      )
    );
  }

  // --- RULE 3: Must not have a pending application ---
  // Check the database for an existing pending application.
  // The partial unique index is a safety net, but checking here
  // lets us return a user-friendly error message instead of a
  // raw MongoDB duplicate key error.
  const existingPending = await PartnerApplication.findOne({
    user: userId,
    status: "pending",
  });

  if (existingPending) {
    return next(
      new ErrorResponse(
        "You already have a pending partner application. Please wait for admin review.",
        400
      )
    );
  }

  // --- Extract and validate required fields ---
  const {
    fullName,
    phoneNumber,
    categoriesInterestedIn,
    reasonForJoining,
    businessName,
    city,
    experienceDescription,
  } = req.body;

  // Validate required fields explicitly for clear error messages
  // (Mongoose validation would also catch these, but the messages
  // would be less user-friendly for missing fields)
  if (!fullName || !phoneNumber || !reasonForJoining || !experienceDescription || !city) {
    return next(
      new ErrorResponse(
        "Please provide all required fields: fullName, phoneNumber, reasonForJoining, experienceDescription, city",
        400
      )
    );
  }

  // Validate categoriesInterestedIn is a non-empty array
  if (
    !categoriesInterestedIn ||
    !Array.isArray(categoriesInterestedIn) ||
    categoriesInterestedIn.length === 0
  ) {
    return next(
      new ErrorResponse(
        "Please select at least one category you are interested in listing",
        400
      )
    );
  }

  // --- Create the partner application ---
  const application = await PartnerApplication.create({
    user: userId,
    fullName,
    phoneNumber,
    categoriesInterestedIn,
    reasonForJoining,
    businessName: businessName || "",
    city,
    experienceDescription,
    // status defaults to "pending" in the schema
  });

  // --- Update user's partnerStatus to "pending" ---
  // This immediately reflects in the frontend UI so the user
  // sees "Your application is under review" instead of "Apply now"
  await User.findByIdAndUpdate(userId, { partnerStatus: "pending" });

  res.status(201).json({
    success: true,
    message:
      "Partner application submitted successfully. An admin will review your application shortly.",
    data: application,
  });
});

// ============================================================
// @route   GET /api/partners/my-application
// @desc    Get the current user's partner application status
// @access  Private (authenticated users)
// ============================================================
//
// USE CASE:
//   "What's the status of my partner application?"
//   The frontend calls this to decide which UI to show:
//     - No application → "Apply to become a partner" button
//     - Pending → "Your application is under review"
//     - Approved → "You are an approved partner" + listing access
//     - Rejected → "Your application was rejected" + reason + re-apply option
//
// SORT ORDER:
//   Returns the MOST RECENT application first. If a user was
//   rejected and re-applied, we show the latest application.
// ============================================================
const getMyApplication = asyncHandler(async (req, res, next) => {
  const application = await PartnerApplication.findOne({
    user: req.user._id,
  })
    .sort({ createdAt: -1 }) // Most recent first
    .select("-__v");

  // It's valid for a user to have no application yet
  if (!application) {
    return res.status(200).json({
      success: true,
      message: "No partner application found. You can apply at POST /api/partners/apply",
      data: null,
    });
  }

  res.status(200).json({
    success: true,
    data: application,
  });
});

module.exports = {
  applyAsPartner,
  getMyApplication,
};
