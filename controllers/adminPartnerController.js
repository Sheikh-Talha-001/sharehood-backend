// ============================================================
// controllers/adminPartnerController.js — Admin Partner Moderation
// ============================================================
//
// ADMIN-SIDE PARTNER MODERATION SYSTEM:
//   This controller handles the ADMIN-FACING side of the partner
//   application workflow. It provides four key actions:
//
//   1. LIST:    GET  /api/admin/partner-applications
//              View all partner applications (filterable by status)
//
//   2. VIEW:    GET  /api/admin/partner-applications/:id
//              View a single application with full details
//
//   3. APPROVE: PUT  /api/admin/partner-applications/:id/approve
//              Grant listing permission to the applicant
//
//   4. REJECT:  PUT  /api/admin/partner-applications/:id/reject
//              Deny the application with a reason
//
// WHAT HAPPENS WHEN AN APPLICATION IS APPROVED?
//   Three things change in the database:
//     1. application.status       = "approved"
//     2. user.canListItems        = true     (capability flag)
//     3. user.partnerStatus       = "approved" (workflow state)
//   The user can now access POST /api/items to create listings.
//
// WHAT HAPPENS WHEN AN APPLICATION IS REJECTED?
//   Two things change:
//     1. application.status       = "rejected"
//     2. user.partnerStatus       = "rejected"
//   canListItems stays FALSE — the user cannot list items.
//   The rejection reason is stored for transparency.
//
// AUDIT TRAIL:
//   Both approve and reject record:
//     - reviewedBy: which admin made the decision
//     - reviewedAt: when the decision was made
//   This creates accountability — management can trace decisions.
//
// NOTIFICATION INTEGRATION:
//   After approve/reject, the system sends an in-app notification
//   to the applicant via the notify() utility. This ensures users
//   know about the decision without having to manually check.
//
// SECURITY:
//   Every route in this controller requires:
//     1. Valid JWT token (protect middleware)
//     2. Admin role (authorize("admin") middleware)
//   These are enforced at the route level in adminRoutes.js.
// ============================================================

const PartnerApplication = require("../models/partnerApplicationModel");
const User = require("../models/userModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const { notify } = require("../utils/notify");

// ============================================================
// @route   GET /api/admin/partner-applications
// @desc    List all partner applications (filterable by status)
// @access  Private (Admin only)
// ============================================================
//
// QUERY PARAMETERS:
//   ?status=pending   → only show pending applications
//   ?status=approved  → only show approved applications
//   ?status=rejected  → only show rejected applications
//   (no status)       → show all applications
//
// POPULATE:
//   We populate the "user" field to show the applicant's name,
//   email, and verification status. This lets the admin see
//   WHO applied without needing a separate API call.
//
// SORT:
//   Most recent applications first (newest at the top).
//   Admins typically review the newest applications first.
// ============================================================
const getAllPartnerApplications = asyncHandler(async (req, res, next) => {
  // Build filter — optionally filter by status query param
  const filter = {};
  if (req.query.status) {
    // Validate the status value
    const validStatuses = ["pending", "approved", "rejected"];
    if (!validStatuses.includes(req.query.status)) {
      return next(
        new ErrorResponse(
          `Invalid status "${req.query.status}". Allowed: ${validStatuses.join(", ")}`,
          400
        )
      );
    }
    filter.status = req.query.status;
  }

  const applications = await PartnerApplication.find(filter)
    .populate("user", "name email verificationStatus partnerStatus canListItems")
    .populate("reviewedBy", "name email")
    .sort({ createdAt: -1 })
    .select("-__v");

  res.status(200).json({
    success: true,
    count: applications.length,
    data: applications,
  });
});

// ============================================================
// @route   GET /api/admin/partner-applications/:id
// @desc    View a single partner application with full details
// @access  Private (Admin only)
// ============================================================
//
// WHY A SEPARATE "VIEW ONE" ENDPOINT?
//   The list endpoint shows summary data for all applications.
//   This endpoint provides the FULL details of a single application,
//   including the complete user profile, making it perfect for
//   an admin detail/review modal.
// ============================================================
const getPartnerApplicationById = asyncHandler(async (req, res, next) => {
  const application = await PartnerApplication.findById(req.params.id)
    .populate("user", "name email verificationStatus partnerStatus canListItems createdAt")
    .populate("reviewedBy", "name email")
    .select("-__v");

  if (!application) {
    return next(new ErrorResponse("Partner application not found", 404));
  }

  res.status(200).json({
    success: true,
    data: application,
  });
});

// ============================================================
// @route   PUT /api/admin/partner-applications/:id/approve
// @desc    Approve a partner application → grant listing permission
// @access  Private (Admin only)
// ============================================================
//
// STATE TRANSITION: pending → approved
//
// THREE DATABASE UPDATES:
//   1. Application: status = "approved", reviewedBy, reviewedAt
//   2. User: canListItems = true (THE CAPABILITY FLAG)
//   3. User: partnerStatus = "approved" (workflow state)
//
// WHY UPDATE BOTH canListItems AND partnerStatus?
//   canListItems is the PERMISSION — checked by the listing middleware.
//   partnerStatus is the WORKFLOW STATE — used by the frontend UI.
//   They serve different purposes and must stay in sync.
//
// NOTIFICATION:
//   An in-app notification is sent to the applicant:
//   "Congratulations! Your partner application has been approved."
//
// IDEMPOTENCY GUARD:
//   We check that the application is still "pending" before approving.
//   This prevents double-approving (which would send duplicate notifications).
// ============================================================
const approvePartnerApplication = asyncHandler(async (req, res, next) => {
  const application = await PartnerApplication.findById(req.params.id);

  if (!application) {
    return next(new ErrorResponse("Partner application not found", 404));
  }

  // --- STATUS CHECK: Can only approve pending applications ---
  if (application.status !== "pending") {
    return next(
      new ErrorResponse(
        `Cannot approve — application is already "${application.status}"`,
        400
      )
    );
  }

  // --- Update the application ---
  application.status = "approved";
  application.reviewedBy = req.user._id;  // The admin who approved
  application.reviewedAt = new Date();
  await application.save();

  // --- Grant listing capability to the user ---
  // This is the KEY action — it enables the user to create items.
  // The requirePartner middleware checks canListItems on every
  // POST /api/items request.
  await User.findByIdAndUpdate(application.user, {
    canListItems: true,
    partnerStatus: "approved",
  });

  // --- Notify the applicant ---
  // 🔔 The user receives an in-app notification about the approval.
  await notify({
    recipient: application.user,
    sender: req.user._id,
    type: "partner_approved",
    title: "Partner Application Approved 🎉",
    message:
      "Congratulations! Your partner application has been approved. You can now list items for lending on Lendly.",
  });

  // Populate for the response
  const populatedApplication = await PartnerApplication.findById(application._id)
    .populate("user", "name email partnerStatus canListItems")
    .populate("reviewedBy", "name email")
    .select("-__v");

  res.status(200).json({
    success: true,
    message: "Partner application approved — user can now list items",
    data: populatedApplication,
  });
});

// ============================================================
// @route   PUT /api/admin/partner-applications/:id/reject
// @desc    Reject a partner application
// @access  Private (Admin only)
// ============================================================
//
// STATE TRANSITION: pending → rejected
//
// REQUIRED FIELD: rejectionReason
//   Admins MUST provide a reason when rejecting. This:
//     1. Gives the user actionable feedback
//     2. Creates an audit trail
//     3. Prevents arbitrary/unexplained rejections
//
// WHAT CAN THE USER DO AFTER REJECTION?
//   The user's partnerStatus becomes "rejected", but they can
//   submit a NEW application later. The partial unique index
//   only prevents duplicate PENDING applications — after rejection,
//   the constraint is released.
//
// canListItems STAYS FALSE:
//   We don't set canListItems = false here because it was already
//   false (they never had listing permission). But we do update
//   partnerStatus so the frontend can show the rejection reason
//   and a "Re-apply" button.
// ============================================================
const rejectPartnerApplication = asyncHandler(async (req, res, next) => {
  const application = await PartnerApplication.findById(req.params.id);

  if (!application) {
    return next(new ErrorResponse("Partner application not found", 404));
  }

  // --- STATUS CHECK: Can only reject pending applications ---
  if (application.status !== "pending") {
    return next(
      new ErrorResponse(
        `Cannot reject — application is already "${application.status}"`,
        400
      )
    );
  }

  // --- REQUIRE rejection reason ---
  const { rejectionReason } = req.body || {};
  if (!rejectionReason || rejectionReason.trim() === "") {
    return next(
      new ErrorResponse(
        "Please provide a rejection reason to help the applicant understand the decision",
        400
      )
    );
  }

  // --- Update the application ---
  application.status = "rejected";
  application.rejectionReason = rejectionReason.trim();
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();
  await application.save();

  // --- Update user's partner status ---
  // canListItems stays false (was never true)
  await User.findByIdAndUpdate(application.user, {
    partnerStatus: "rejected",
  });

  // --- Notify the applicant ---
  // 🔔 The user receives an in-app notification about the rejection.
  await notify({
    recipient: application.user,
    sender: req.user._id,
    type: "partner_rejected",
    title: "Partner Application Update",
    message: `Your partner application was not approved. Reason: ${rejectionReason.trim()}. You may re-apply after addressing the feedback.`,
  });

  // Populate for the response
  const populatedApplication = await PartnerApplication.findById(application._id)
    .populate("user", "name email partnerStatus canListItems")
    .populate("reviewedBy", "name email")
    .select("-__v");

  res.status(200).json({
    success: true,
    message: "Partner application rejected",
    data: populatedApplication,
  });
});

module.exports = {
  getAllPartnerApplications,
  getPartnerApplicationById,
  approvePartnerApplication,
  rejectPartnerApplication,
};
