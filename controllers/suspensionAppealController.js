// ============================================================
// controllers/suspensionAppealController.js
// ============================================================
//
// MODERATION WORKFLOW ARCHITECTURE:
//   This controller handles the complete suspension appeal
//   lifecycle — from user submission to admin decision.
//
//   APPEAL LIFECYCLE:
//     1. User is suspended by admin
//     2. User submits appeal (POST /api/auth/appeal-suspension)
//        → SuspensionAppeal created (status: pending)
//     3. Admin reviews the queue (GET /api/admin/suspension-appeals)
//     4. Admin approves → user account restored → notification sent
//        OR
//        Admin rejects → user stays suspended → notification sent
//     5. If rejected, user can submit a NEW appeal later
//        (previous rejected appeal is preserved in history)
//
// WHY NOT INSIDE authController OR adminController?
//   Separation of concerns. The appeal workflow is a distinct
//   feature with its own model, business rules, and admin UI.
//   Keeping it in a focused controller makes:
//     - Code easier to find and understand
//     - Testing easier (test this file in isolation)
//     - Future changes safer (no side effects on unrelated features)
//
// AUDIT HISTORY IMPORTANCE:
//   Every appeal — approved OR rejected — is permanently stored.
//   This lets admins answer:
//     - "Has this user appealed before?"
//     - "Who approved/rejected the previous appeal?"
//     - "What did the user say in their last appeal?"
//   Without audit history, patterns of abuse are invisible.
// ============================================================

const SuspensionAppeal = require("../models/suspensionAppealModel");
const User = require("../models/userModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const { notify } = require("../utils/notify");

// ============================================================
// @route   POST /api/auth/appeal-suspension
// @desc    Suspended user submits an appeal to restore account
// @access  Public (suspended users cannot pass protect middleware)
// ============================================================
//
// WHY PUBLIC ROUTE?
//   The protect middleware blocks ALL suspended users with 403.
//   If we put protect here, the suspended user could never reach
//   this endpoint at all — defeating the entire purpose.
//   Instead, we manually verify their identity using email.
//
// SECURITY TRADE-OFFS:
//   - We accept email from req.body (not from a JWT)
//   - We verify the user exists AND is actually suspended
//   - Rate limiting (5/hour) prevents email enumeration spam
//   - Duplicate check prevents appeal flooding
//
// VALIDATION:
//   - Email must be a real registered account
//   - Account must be suspended (unsuspended users get 400)
//   - No existing pending appeal (prevents duplicate spam)
//   - Message minimum 20 characters (prevents "pls unsuspend" spam)
// ============================================================
const submitSuspensionAppeal = asyncHandler(async (req, res, next) => {
  const { email, appealMessage } = req.body;

  // --- Basic field validation ---
  if (!email || !appealMessage) {
    return next(
      new ErrorResponse("Please provide your email and appeal message", 400)
    );
  }

  // --- Email format validation ---
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(email)) {
    return next(new ErrorResponse("Please provide a valid email address", 400));
  }

  // --- Message length validation ---
  if (appealMessage.trim().length < 20) {
    return next(
      new ErrorResponse(
        "Appeal message must be at least 20 characters — please explain your situation",
        400
      )
    );
  }

  if (appealMessage.trim().length > 2000) {
    return next(
      new ErrorResponse("Appeal message cannot exceed 2000 characters", 400)
    );
  }

  // --- Find user by email ---
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    // Generic message — don't reveal whether the email is registered
    // (prevents user enumeration attacks)
    return next(
      new ErrorResponse(
        "If an account with that email exists and is suspended, your appeal has been submitted",
        400
      )
    );
  }

  // --- Verify account is actually suspended ---
  if (!user.isSuspended) {
    return next(
      new ErrorResponse(
        "Your account is not suspended — no appeal is necessary",
        400
      )
    );
  }

  // --- Check for existing pending appeal ---
  // A user should not be able to flood the admin queue.
  // They can only have ONE active pending appeal at a time.
  // After rejection, they may submit a new one.
  const existingPendingAppeal = await SuspensionAppeal.findOne({
    user: user._id,
    status: "pending",
  });

  if (existingPendingAppeal) {
    return next(
      new ErrorResponse(
        "You already have a pending appeal — please wait for admin review before submitting another",
        400
      )
    );
  }

  // --- Create the appeal document ---
  const appeal = await SuspensionAppeal.create({
    user: user._id,
    email: user.email,
    appealMessage: appealMessage.trim(),
    status: "pending",
  });

  res.status(201).json({
    success: true,
    message:
      "Your appeal has been submitted successfully — an admin will review it and respond shortly",
    data: {
      appealId: appeal._id,
      status: appeal.status,
      submittedAt: appeal.createdAt,
    },
  });
});


// ╔═══════════════════════════════════════════════════════════╗
// ║              ADMIN APPEAL MANAGEMENT                      ║
// ╚═══════════════════════════════════════════════════════════╝

// ============================================================
// @route   GET /api/admin/suspension-appeals
// @desc    Get all suspension appeals (admin moderation queue)
// @access  Admin only
// ============================================================
//
// QUERY PARAMS:
//   ?status=pending  → admin review queue (most useful view)
//   ?status=approved → history of approvals
//   ?status=rejected → history of rejections
//   (no param)       → all appeals
// ============================================================
const getAllSuspensionAppeals = asyncHandler(async (req, res, next) => {
  const filter = {};

  if (req.query.status) {
    const validStatuses = ["pending", "approved", "rejected"];
    if (!validStatuses.includes(req.query.status)) {
      return next(
        new ErrorResponse(
          "Invalid status filter. Use: pending, approved, or rejected",
          400
        )
      );
    }
    filter.status = req.query.status;
  }

  const appeals = await SuspensionAppeal.find(filter)
    .populate("user", "name email isSuspended suspensionReason role")
    .populate("reviewedBy", "name email")
    .sort({ createdAt: -1 }); // Newest first — most recent appeals at top

  res.status(200).json({
    success: true,
    count: appeals.length,
    data: appeals,
  });
});

// ============================================================
// @route   GET /api/admin/suspension-appeals/:id
// @desc    Get a single suspension appeal (full details)
// @access  Admin only
// ============================================================
const getSuspensionAppealById = asyncHandler(async (req, res, next) => {
  const appeal = await SuspensionAppeal.findById(req.params.id)
    .populate("user", "name email isSuspended suspensionReason suspendedAt role createdAt")
    .populate("reviewedBy", "name email");

  if (!appeal) {
    return next(new ErrorResponse("Suspension appeal not found", 404));
  }

  res.status(200).json({
    success: true,
    data: appeal,
  });
});

// ============================================================
// @route   PUT /api/admin/suspension-appeals/:id/approve
// @desc    Admin approves the appeal — restores user account
// @access  Admin only
// ============================================================
//
// WHAT HAPPENS ON APPROVE:
//   1. Appeal status → "approved"
//   2. Admin response (optional) is saved
//   3. reviewedBy and reviewedAt are set (audit trail)
//   4. User account is FULLY RESTORED:
//      - isSuspended → false
//      - suspensionReason → cleared
//      - suspendedAt → cleared
//   5. Notification sent to the user: "Your account is restored"
//
// GUARD: Cannot approve an already-reviewed appeal
// ============================================================
const approveAppeal = asyncHandler(async (req, res, next) => {
  const appeal = await SuspensionAppeal.findById(req.params.id);

  if (!appeal) {
    return next(new ErrorResponse("Suspension appeal not found", 404));
  }

  // Prevent double-action on already reviewed appeals
  if (appeal.status !== "pending") {
    return next(
      new ErrorResponse(
        `This appeal has already been ${appeal.status} — no further action can be taken`,
        400
      )
    );
  }

  // --- Update the appeal document ---
  appeal.status = "approved";
  appeal.adminResponse = req.body.adminResponse || "Your appeal has been reviewed and approved.";
  appeal.reviewedBy = req.user._id;
  appeal.reviewedAt = new Date();
  await appeal.save();

  // --- Restore the user's account ---
  // Reset ALL suspension fields so the user can log in normally
  await User.findByIdAndUpdate(appeal.user, {
    isSuspended: false,
    suspensionReason: "",
    suspendedAt: null,
  });

  // --- Notify the user their account is restored ---
  await notify({
    recipient: appeal.user,
    sender: null,
    type: "user_suspended", // Re-using closest type; frontend can key on message
    title: "Account Restored ✅",
    message: `Your suspension appeal has been approved. Your account is fully restored. ${appeal.adminResponse}`,
  });

  res.status(200).json({
    success: true,
    message: "Appeal approved — user account has been restored",
    data: {
      appealId: appeal._id,
      status: appeal.status,
      adminResponse: appeal.adminResponse,
      reviewedAt: appeal.reviewedAt,
      userRestored: true,
    },
  });
});

// ============================================================
// @route   PUT /api/admin/suspension-appeals/:id/reject
// @desc    Admin rejects the appeal — user stays suspended
// @access  Admin only
// ============================================================
//
// WHAT HAPPENS ON REJECT:
//   1. Appeal status → "rejected"
//   2. adminResponse is saved (STRONGLY recommended — tells user why)
//   3. reviewedBy and reviewedAt set (audit trail)
//   4. User account REMAINS suspended (no User update)
//   5. Notification sent: "Your appeal was rejected"
//   6. User CAN submit a new appeal later (fresh pending appeal)
//
// WHY ALLOW ANOTHER APPEAL AFTER REJECTION?
//   The user might genuinely learn from the rejection reason
//   and submit a stronger appeal next time. Permanently blocking
//   appeals would be too harsh for minor violations.
// ============================================================
const rejectAppeal = asyncHandler(async (req, res, next) => {
  const appeal = await SuspensionAppeal.findById(req.params.id);

  if (!appeal) {
    return next(new ErrorResponse("Suspension appeal not found", 404));
  }

  // Prevent double-action
  if (appeal.status !== "pending") {
    return next(
      new ErrorResponse(
        `This appeal has already been ${appeal.status} — no further action can be taken`,
        400
      )
    );
  }

  const adminResponse = req.body.adminResponse || "";

  // --- Update the appeal document ---
  appeal.status = "rejected";
  appeal.adminResponse = adminResponse;
  appeal.reviewedBy = req.user._id;
  appeal.reviewedAt = new Date();
  await appeal.save();

  // --- Notify the user their appeal was rejected ---
  await notify({
    recipient: appeal.user,
    sender: null,
    type: "user_suspended",
    title: "Appeal Rejected",
    message: adminResponse
      ? `Your suspension appeal was rejected. Reason: ${adminResponse}`
      : "Your suspension appeal has been reviewed and rejected. You may submit a new appeal if your situation has changed.",
  });

  res.status(200).json({
    success: true,
    message: "Appeal rejected — user account remains suspended",
    data: {
      appealId: appeal._id,
      status: appeal.status,
      adminResponse: appeal.adminResponse,
      reviewedAt: appeal.reviewedAt,
      userRestored: false,
    },
  });
});

module.exports = {
  // User-facing
  submitSuspensionAppeal,
  // Admin-facing
  getAllSuspensionAppeals,
  getSuspensionAppealById,
  approveAppeal,
  rejectAppeal,
};
