// ============================================================
// controllers/reportController.js — User Report Submission
// ============================================================
//
// WHAT THIS CONTROLLER DOES:
//   Handles the USER-facing side of the reporting system:
//     1. Submit a report against a user or item
//     2. View their own submitted reports
//
// WHAT THIS CONTROLLER DOES NOT DO:
//   - Review/resolve/dismiss reports (admin's job)
//   - Suspend users or remove items (admin's job)
//
// SECURITY:
//   - Users can only see their OWN submitted reports
//   - Users cannot see admin notes or other users' reports
//   - Reports require at least one target (user or item)
// ============================================================

const Report = require("../models/reportModel");
const User = require("../models/userModel");
const Item = require("../models/itemModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const { notifyAdmins } = require("../utils/notify");
const { validateString, validateObjectId } = require("../utils/validator");

// ============================================================
// @route   POST /api/reports
// @desc    Submit a new report against a user or item
// @access  Private (authenticated users only)
// ============================================================
//
// BODY:
//   {
//     "reportedUser": "userId"  (optional — omit if reporting item)
//     "reportedItem": "itemId"  (optional — omit if reporting user)
//     "reason": "fraud",
//     "description": "This listing is fake..."
//   }
//
// RULES:
//   1. Must provide at least one target (user OR item)
//   2. Cannot report yourself
//   3. Must provide reason and description
//   4. Target user/item must exist
// ============================================================
const createReport = asyncHandler(async (req, res, next) => {
  const { reportedUser, reportedItem, reason, description } = req.body;

  try {
    if (reportedUser) validateObjectId(reportedUser, "Reported User ID");
    if (reportedItem) validateObjectId(reportedItem, "Reported Item ID");
    validateString(reason, "Reason", { required: true, maxLength: 100 });
    validateString(description, "Description", { required: true, maxLength: 2000 });
  } catch (err) {
    return next(err);
  }

  // --- RULE 1: At least one target ---
  if (!reportedUser && !reportedItem) {
    return next(
      new ErrorResponse(
        "Please specify who or what you are reporting (reportedUser or reportedItem)",
        400
      )
    );
  }

  // --- RULE 2: Cannot report yourself ---
  if (reportedUser && reportedUser === req.user._id.toString()) {
    return next(new ErrorResponse("You cannot report yourself", 400));
  }

  // --- RULE 3: Validate target exists ---
  if (reportedUser) {
    const userExists = await User.findById(reportedUser);
    if (!userExists) {
      return next(new ErrorResponse("Reported user not found", 404));
    }
  }

  if (reportedItem) {
    const itemExists = await Item.findById(reportedItem);
    if (!itemExists) {
      return next(new ErrorResponse("Reported item not found", 404));
    }
  }

  // --- Create the report ---
  const report = await Report.create({
    reportedBy: req.user._id,
    reportedUser: reportedUser || null,
    reportedItem: reportedItem || null,
    reason,
    description,
  });

  // 🔔 NOTIFICATION: Notify all admins about the new report
  await notifyAdmins({
    sender: req.user._id,
    type: "new_report",
    title: "New Report Submitted",
    message: `${req.user.name} submitted a report: "${reason}"`,
    relatedReport: report._id,
  });

  res.status(201).json({
    success: true,
    message: "Report submitted successfully — an admin will review it",
    data: {
      reportId: report._id,
      status: report.status,
      createdAt: report.createdAt,
    },
  });
});

// ============================================================
// @route   GET /api/reports/my-reports
// @desc    Get all reports submitted by the logged-in user
// @access  Private
// ============================================================
const getMyReports = asyncHandler(async (req, res, next) => {
  const reports = await Report.find({ reportedBy: req.user._id })
    .populate("reportedUser", "name email")
    .populate("reportedItem", "title image")
    .select("-adminNotes") // Hide admin-only notes from users
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: reports.length,
    data: reports,
  });
});

module.exports = {
  createReport,
  getMyReports,
};
