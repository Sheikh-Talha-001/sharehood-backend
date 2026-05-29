// ============================================================
// controllers/adminController.js — Admin Dashboard & Moderation
// ============================================================
//
// WHAT IS PLATFORM GOVERNANCE?
//   Platform governance means keeping the community safe, fair,
//   and trustworthy. Admins are the "referees" who:
//     - Verify new users (identity check)
//     - Review reports from community members
//     - Suspend bad actors
//     - Remove inappropriate items
//     - Monitor platform health via dashboard stats
//
// WHY THIS CONTROLLER IS LARGE:
//   All admin moderation functions live here because they share:
//     1. The same security model (protect + authorize("admin"))
//     2. The same models (User, Item, Report, VerificationRequest)
//     3. The same response format
//   Keeping them in one file makes it easy for the admin to
//   understand the full scope of their available actions.
//
// ADMIN MODERATION WORKFLOW:
//   ┌─────────────────────────────────────────────────────────┐
//   │  DASHBOARD (getDashboardStats)                         │
//   │  See platform-wide metrics at a glance                 │
//   ├─────────────────────────────────────────────────────────┤
//   │  VERIFICATION: approve / reject user identity docs     │
//   │  USER MGMT:    suspend / activate user accounts        │
//   │  ITEM MGMT:    remove / restore item listings          │
//   │  REPORTS:      review / resolve / dismiss user reports  │
//   └─────────────────────────────────────────────────────────┘
//
// SECURITY:
//   ALL functions require protect + authorize("admin") middleware.
//   Regular users get a 403 at the route level, before any
//   controller code runs.
// ============================================================

const VerificationRequest = require("../models/verificationRequestModel");
const User = require("../models/userModel");
const Item = require("../models/itemModel");
const Report = require("../models/reportModel");
const BorrowRequest = require("../models/borrowRequestModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const { notify } = require("../utils/notify");


// ╔═══════════════════════════════════════════════════════════╗
// ║                     DASHBOARD STATS                       ║
// ╚═══════════════════════════════════════════════════════════╝

// ============================================================
// @route   GET /api/admin/dashboard
// @desc    Get platform-wide statistics for the admin dashboard
// @access  Admin only
// ============================================================
//
// WHY A DASHBOARD?
//   Admins need a quick "pulse check" of the platform:
//     - How many users have joined?
//     - How many items are listed?
//     - Are there pending reports or verifications to review?
//
// MongoDB .countDocuments() is more efficient than .find().length
// because it only counts — it doesn't load all documents into RAM.
// ============================================================
const getDashboardStats = asyncHandler(async (req, res, next) => {
  // Run all count queries in parallel for speed
  // Promise.all() runs them simultaneously instead of one-by-one
  const [
    totalUsers,
    verifiedUsers,
    suspendedUsers,
    totalItems,
    removedItems,
    activeBorrowRequests,
    pendingReports,
    pendingVerifications,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ verificationStatus: "verified" }),
    User.countDocuments({ isSuspended: true }),
    Item.countDocuments(),
    Item.countDocuments({ isRemovedByAdmin: true }),
    BorrowRequest.countDocuments({ status: "approved" }),
    Report.countDocuments({ status: "pending" }),
    VerificationRequest.countDocuments({ status: "pending" }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        suspended: suspendedUsers,
      },
      items: {
        total: totalItems,
        removedByAdmin: removedItems,
      },
      activeBorrowRequests,
      pendingReports,
      pendingVerifications,
    },
  });
});


// ╔═══════════════════════════════════════════════════════════╗
// ║                  USER MANAGEMENT                          ║
// ╚═══════════════════════════════════════════════════════════╝

// ============================================================
// @route   GET /api/admin/users
// @desc    Get all users (admin overview)
// @access  Admin only
// ============================================================
//
// QUERY PARAMS:
//   ?suspended=true → show only suspended users
//   ?verified=true  → show only verified users
//
// NOTE: Passwords are NEVER returned (select: false in schema).
// ============================================================
const getAllUsers = asyncHandler(async (req, res, next) => {
  const filter = {};

  if (req.query.suspended === "true") {
    filter.isSuspended = true;
  }
  if (req.query.verified === "true") {
    filter.verificationStatus = "verified";
  }

  const users = await User.find(filter)
    .select("-password")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: users.length,
    data: users,
  });
});

// ============================================================
// @route   PUT /api/admin/users/:id/suspend
// @desc    Suspend a user account
// @access  Admin only
// ============================================================
//
// WHAT HAPPENS WHEN A USER IS SUSPENDED?
//   1. isSuspended → true
//   2. suspensionReason → saved (from req.body)
//   3. suspendedAt → now
//
// EFFECT:
//   The protect middleware in authMiddleware.js checks isSuspended
//   on EVERY authenticated request. The suspended user will get a
//   403 "account suspended" error on every API call that requires
//   authentication. They effectively can't do anything.
//
// WHAT THE SUSPENDED USER CANNOT DO:
//   - Create items
//   - Create borrow requests
//   - Approve/reject requests
//   - View agreements
//   - Submit reports
//   - Basically ANY protected action
//
// WHY NOT JUST DELETE THE USER?
//   Deleting would break referential integrity:
//     - Their items would become orphaned
//     - Their borrow requests would reference a non-existent user
//     - Their agreements would lose a party
//   Suspension preserves all data while blocking the bad actor.
// ============================================================
const suspendUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('+password');

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  // --- Prevent suspending admin accounts ---
  if (user.role === "admin") {
    return next(new ErrorResponse("Cannot suspend an admin account", 400));
  }

  // --- Prevent duplicate suspension ---
  if (user.isSuspended) {
    return next(new ErrorResponse("User is already suspended", 400));
  }

  user.isSuspended = true;
  user.suspensionReason = req.body.suspensionReason || "No reason provided";
  user.suspendedAt = new Date();
  await user.save();

  // 🔔 NOTIFICATION: Tell the suspended user why their account was locked.
  // We still save the notification even though they can't access protected
  // routes — they'll see it when/if their account is re-activated.
  await notify({
    recipient: user._id,
    sender: null,
    type: "user_suspended",
    title: "Account Suspended",
    message: `Your account has been suspended. Reason: ${user.suspensionReason}. Contact support to appeal.`,
  });

  res.status(200).json({
    success: true,
    message: `User "${user.name}" has been suspended`,
    data: {
      userId: user._id,
      name: user.name,
      email: user.email,
      isSuspended: user.isSuspended,
      suspensionReason: user.suspensionReason,
      suspendedAt: user.suspendedAt,
    },
  });
});

// ============================================================
// @route   PUT /api/admin/users/:id/activate
// @desc    Re-activate a suspended user
// @access  Admin only
// ============================================================
//
// WHY ALLOW RE-ACTIVATION?
//   Mistakes happen. An admin might suspend the wrong user,
//   or the situation might get resolved. Activation reverses
//   the suspension — the user can use the platform again.
// ============================================================
const activateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('+password');

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  if (!user.isSuspended) {
    return next(new ErrorResponse("User is not suspended", 400));
  }

  user.isSuspended = false;
  user.suspensionReason = "";
  user.suspendedAt = null;
  await user.save();

  // 🔔 NOTIFICATION TRIGGER (future integration)
  // TODO: Notify user their account has been reactivated
  // Example: notificationService.notify(user._id, "account_reactivated");

  res.status(200).json({
    success: true,
    message: `User "${user.name}" has been reactivated`,
    data: {
      userId: user._id,
      name: user.name,
      email: user.email,
      isSuspended: user.isSuspended,
    },
  });
});


// ╔═══════════════════════════════════════════════════════════╗
// ║                  REPORT MODERATION                        ║
// ╚═══════════════════════════════════════════════════════════╝

// ============================================================
// @route   GET /api/admin/reports
// @desc    Get all reports (filterable by status)
// @access  Admin only
// ============================================================
//
// QUERY PARAMS:
//   ?status=pending → admin review queue (most common)
//   No param → returns ALL reports
// ============================================================
const getAllReports = asyncHandler(async (req, res, next) => {
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const reports = await Report.find(filter)
    .populate("reportedBy", "name email")
    .populate("reportedUser", "name email isSuspended")
    .populate("reportedItem", "title image isRemovedByAdmin")
    .populate("reviewedBy", "name email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: reports.length,
    data: reports,
  });
});

// ============================================================
// @route   PUT /api/admin/reports/:id/resolve
// @desc    Mark a report as resolved (admin took action)
// @access  Admin only
// ============================================================
//
// WHEN TO RESOLVE:
//   The admin has investigated and taken action. For example:
//     - Suspended the reported user
//     - Removed the reported item
//     - Warned the parties involved
//
// BODY:
//   { "adminNotes": "Suspended user for policy violation." }
// ============================================================
const resolveReport = asyncHandler(async (req, res, next) => {
  const report = await Report.findById(req.params.id);

  if (!report) {
    return next(new ErrorResponse("Report not found", 404));
  }

  if (report.status === "resolved") {
    return next(new ErrorResponse("Report is already resolved", 400));
  }

  if (report.status === "dismissed") {
    return next(new ErrorResponse("Cannot resolve a dismissed report", 400));
  }

  report.status = "resolved";
  report.adminNotes = req.body.adminNotes || "";
  report.reviewedBy = req.user._id;
  report.reviewedAt = new Date();
  await report.save();

  // 🔔 NOTIFICATION: Tell the reporter that their report was acted upon.
  await notify({
    recipient: report.reportedBy,
    sender: null,
    type: "report_resolved",
    title: "Your Report Was Resolved",
    message: "An admin has reviewed and resolved your report. Thank you for keeping the community safe.",
    relatedReport: report._id,
  });

  res.status(200).json({
    success: true,
    message: "Report resolved",
    data: {
      reportId: report._id,
      status: report.status,
      adminNotes: report.adminNotes,
      reviewedAt: report.reviewedAt,
    },
  });
});

// ============================================================
// @route   PUT /api/admin/reports/:id/dismiss
// @desc    Dismiss a report (invalid, spam, or unfounded)
// @access  Admin only
// ============================================================
//
// WHEN TO DISMISS:
//   The admin reviewed the report and determined it's not valid:
//     - False accusation
//     - Spam report
//     - Duplicate of an existing report
//     - No evidence of wrongdoing
// ============================================================
const dismissReport = asyncHandler(async (req, res, next) => {
  const report = await Report.findById(req.params.id);

  if (!report) {
    return next(new ErrorResponse("Report not found", 404));
  }

  if (report.status === "dismissed") {
    return next(new ErrorResponse("Report is already dismissed", 400));
  }

  if (report.status === "resolved") {
    return next(new ErrorResponse("Cannot dismiss a resolved report", 400));
  }

  report.status = "dismissed";
  report.adminNotes = req.body.adminNotes || "";
  report.reviewedBy = req.user._id;
  report.reviewedAt = new Date();
  await report.save();

  res.status(200).json({
    success: true,
    message: "Report dismissed",
    data: {
      reportId: report._id,
      status: report.status,
      adminNotes: report.adminNotes,
      reviewedAt: report.reviewedAt,
    },
  });
});


// ╔═══════════════════════════════════════════════════════════╗
// ║                  ITEM MODERATION                          ║
// ╚═══════════════════════════════════════════════════════════╝

// ============================================================
// @route   GET /api/admin/items
// @desc    Get all items including removed ones
// @access  Admin only
// ============================================================
const getAllItems = asyncHandler(async (req, res, next) => {
  const items = await Item.find()
    .populate("owner", "name email isSuspended")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: items.length,
    data: items,
  });
});

// ============================================================
// @route   PUT /api/admin/items/:id/remove
// @desc    Admin removes an item from the marketplace
// @access  Admin only
// ============================================================
//
// WHAT "REMOVE" MEANS:
//   The item is NOT deleted from the database. Instead:
//     - isRemovedByAdmin → true
//     - adminRemovalReason → saved
//     - removedByAdminAt → now
//
//   The item disappears from public listings (getAllItems filters
//   it out) but stays in the DB so existing agreements and borrow
//   requests still have valid references.
//
// WHY NOT DELETE?
//   Same reason as user suspension — referential integrity.
//   If item #123 is referenced in 5 agreements, deleting it
//   would make those agreements point to nothing.
// ============================================================
const removeItemByAdmin = asyncHandler(async (req, res, next) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    return next(new ErrorResponse("Item not found", 404));
  }

  if (item.isRemovedByAdmin) {
    return next(new ErrorResponse("Item is already removed", 400));
  }

  item.isRemovedByAdmin = true;
  item.adminRemovalReason = req.body.adminRemovalReason || "No reason provided";
  item.removedByAdminAt = new Date();
  await item.save();

  // 🔔 NOTIFICATION: Tell the item OWNER their listing was removed.
  await notify({
    recipient: item.owner,
    sender: null,
    type: "item_removed",
    title: "Your Item Was Removed",
    message: `Your listing "${item.title}" has been removed by an admin. Reason: ${item.adminRemovalReason}`,
    relatedItem: item._id,
  });

  res.status(200).json({
    success: true,
    message: `Item "${item.title}" has been removed from the marketplace`,
    data: {
      itemId: item._id,
      title: item.title,
      isRemovedByAdmin: item.isRemovedByAdmin,
      adminRemovalReason: item.adminRemovalReason,
      removedByAdminAt: item.removedByAdminAt,
    },
  });
});

// ============================================================
// @route   PUT /api/admin/items/:id/restore
// @desc    Admin restores a previously removed item
// @access  Admin only
// ============================================================
//
// WHY ALLOW RESTORE?
//   Same principle as user activation — mistakes happen, or the
//   situation might be resolved. The item reappears in public
//   listings once restored.
// ============================================================
const restoreRemovedItem = asyncHandler(async (req, res, next) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    return next(new ErrorResponse("Item not found", 404));
  }

  if (!item.isRemovedByAdmin) {
    return next(new ErrorResponse("Item is not removed — nothing to restore", 400));
  }

  item.isRemovedByAdmin = false;
  item.adminRemovalReason = "";
  item.removedByAdminAt = null;
  await item.save();

  res.status(200).json({
    success: true,
    message: `Item "${item.title}" has been restored to the marketplace`,
    data: {
      itemId: item._id,
      title: item.title,
      isRemovedByAdmin: item.isRemovedByAdmin,
    },
  });
});


// ╔═══════════════════════════════════════════════════════════╗
// ║              VERIFICATION MANAGEMENT                      ║
// ║    (preserved from the original verification system)      ║
// ╚═══════════════════════════════════════════════════════════╝

// ============================================================
// @route   GET /api/admin/verifications
// @desc    Get all verification requests (admin sees all)
// @access  Admin only
// ============================================================
const getAllVerifications = asyncHandler(async (req, res, next) => {
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const verifications = await VerificationRequest.find(filter)
    .populate("user", "name email verificationStatus createdAt")
    .populate("reviewedBy", "name email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: verifications.length,
    data: verifications,
  });
});

// ============================================================
// @route   GET /api/admin/verifications/:id
// @desc    Get a single verification request (full details)
// @access  Admin only
// ============================================================
const getVerificationById = asyncHandler(async (req, res, next) => {
  const verification = await VerificationRequest.findById(req.params.id)
    .populate("user", "name email verificationStatus createdAt")
    .populate("reviewedBy", "name email");

  if (!verification) {
    return next(new ErrorResponse("Verification request not found", 404));
  }

  res.status(200).json({
    success: true,
    data: verification,
  });
});

// ============================================================
// @route   PUT /api/admin/verifications/:id/approve
// @desc    Admin approves a verification request
// @access  Admin only
// ============================================================
const approveVerification = asyncHandler(async (req, res, next) => {
  const verification = await VerificationRequest.findById(req.params.id);

  if (!verification) {
    return next(new ErrorResponse("Verification request not found", 404));
  }

  if (verification.status !== "pending") {
    return next(
      new ErrorResponse(
        `Cannot approve a request that is already "${verification.status}"`,
        400
      )
    );
  }

  verification.status = "approved";
  verification.reviewedBy = req.user._id;
  verification.reviewedAt = new Date();
  await verification.save();

  await User.findByIdAndUpdate(verification.user, {
    verificationStatus: "verified",
    isVerified: true,
  });

  // 🔔 NOTIFICATION: Tell the user they are now verified and can list/borrow.
  await notify({
    recipient: verification.user,
    sender: null,
    type: "verification_approved",
    title: "Identity Verified ✅",
    message: "Congratulations! Your identity has been verified. You can now list items and make borrow requests.",
  });

  res.status(200).json({
    success: true,
    message: "Verification approved — user is now verified and can list/borrow items",
    data: {
      requestId: verification._id,
      status: verification.status,
      reviewedAt: verification.reviewedAt,
    },
  });
});

// ============================================================
// @route   PUT /api/admin/verifications/:id/reject
// @desc    Admin rejects a verification request
// @access  Admin only
// ============================================================
const rejectVerification = asyncHandler(async (req, res, next) => {
  const verification = await VerificationRequest.findById(req.params.id);

  if (!verification) {
    return next(new ErrorResponse("Verification request not found", 404));
  }

  if (verification.status !== "pending") {
    return next(
      new ErrorResponse(
        `Cannot reject a request that is already "${verification.status}"`,
        400
      )
    );
  }

  const rejectionReason = req.body.rejectionReason || "No reason provided";

  verification.status = "rejected";
  verification.rejectionReason = rejectionReason;
  verification.reviewedBy = req.user._id;
  verification.reviewedAt = new Date();
  await verification.save();

  await User.findByIdAndUpdate(verification.user, {
    verificationStatus: "rejected",
    isVerified: false,
  });

  // 🔔 NOTIFICATION: Tell the user their ID was rejected and what to do next.
  await notify({
    recipient: verification.user,
    sender: null,
    type: "verification_rejected",
    title: "Verification Rejected",
    message: `Your identity documents were not accepted. Reason: ${rejectionReason}. Please re-submit with clearer images.`,
  });

  res.status(200).json({
    success: true,
    message: "Verification rejected — user has been notified to re-submit",
    data: {
      requestId: verification._id,
      status: verification.status,
      rejectionReason: verification.rejectionReason,
      reviewedAt: verification.reviewedAt,
    },
  });
});


module.exports = {
  // Dashboard
  getDashboardStats,
  // User management
  getAllUsers,
  suspendUser,
  activateUser,
  // Report moderation
  getAllReports,
  resolveReport,
  dismissReport,
  // Item moderation
  getAllItems,
  removeItemByAdmin,
  restoreRemovedItem,
  // Verification management (preserved)
  getAllVerifications,
  getVerificationById,
  approveVerification,
  rejectVerification,
};
