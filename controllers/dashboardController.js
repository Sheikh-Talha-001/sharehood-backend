// ============================================================
// controllers/dashboardController.js — Aggregation and Analytics
// ============================================================
//
// WHAT IS THIS?
//   A unified dashboard controller that aggregates data from 
//   multiple collections to provide high-level summaries.
//   Instead of the frontend making 6 different API calls to 
//   build a dashboard, it makes 1 call here.
//
// SEPARATION OF CONCERNS:
//   - User Dashboard: "What is my current activity?"
//     Shows listings, requests, agreements, and notifications.
//   - Admin Dashboard: "What is the health of the platform?"
//     Shows global user counts, pending moderation queues, etc.
//
// PERFORMANCE OPTIMIZATION:
//   We use Promise.all() to run all database count queries in
//   parallel. If we awaited them sequentially, the endpoint
//   would be 5x slower.
// ============================================================

const User = require("../models/userModel");
const Item = require("../models/itemModel");
const BorrowRequest = require("../models/borrowRequestModel");
const Agreement = require("../models/agreementModel");
const Notification = require("../models/notificationModel");
const Report = require("../models/reportModel");
const PartnerApplication = require("../models/partnerApplicationModel");
const asyncHandler = require("../utils/asyncHandler");

// ============================================================
// @route   GET /api/dashboard/user-summary
// @desc    Get dashboard summary for logged-in user
// @access  Private
// ============================================================
// Aggregates the user's personal platform activity.
// Executed in parallel for performance.
// ============================================================
const getUserSummary = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  // Run all counts in parallel using Promise.all
  const [
    totalListings,
    totalBorrowRequests, // Requests the user has made to borrow items
    receivedRequests,    // Requests the user has received for their items
    activeAgreements,    // Agreements that are currently active
    unreadNotifications,
  ] = await Promise.all([
    Item.countDocuments({ owner: userId }),
    BorrowRequest.countDocuments({ borrower: userId }),
    BorrowRequest.countDocuments({ itemOwner: userId }),
    Agreement.countDocuments({ 
      $or: [{ owner: userId }, { borrower: userId }],
      status: "active" 
    }),
    Notification.countDocuments({ recipient: userId, isRead: false }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      profileStatus: {
        verificationStatus: req.user.verificationStatus,
        partnerStatus: req.user.partnerStatus,
        canListItems: req.user.canListItems,
      },
      stats: {
        totalListings,
        borrowRequestsMade: totalBorrowRequests,
        borrowRequestsReceived: receivedRequests,
        activeAgreements,
        unreadNotifications,
      },
    },
  });
});

// ============================================================
// @route   GET /api/dashboard/admin-summary
// @desc    Get global platform metrics for admin
// @access  Private (Admin only)
// ============================================================
// Aggregates platform-wide metrics to power the admin panel.
// Highlights pending moderation tasks (verifications, partners, reports).
// ============================================================
const getAdminSummary = asyncHandler(async (req, res, next) => {
  // Run all platform counts in parallel
  const [
    totalUsers,
    verifiedUsers,
    suspendedUsers,
    pendingVerifications,
    pendingPartnerApps,
    activeListings,
    pendingReports,
    activeAgreements,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ verificationStatus: "verified" }),
    User.countDocuments({ isSuspended: true }),
    User.countDocuments({ verificationStatus: "pending" }),
    PartnerApplication.countDocuments({ status: "pending" }),
    Item.countDocuments({ isRemovedByAdmin: false }),
    Report.countDocuments({ status: "pending" }),
    Agreement.countDocuments({ status: "active" }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        suspended: suspendedUsers,
      },
      moderationQueue: {
        pendingVerifications,
        pendingPartnerApplications: pendingPartnerApps,
        pendingReports,
      },
      platformActivity: {
        activeListings,
        activeAgreements,
      },
    },
  });
});

module.exports = {
  getUserSummary,
  getAdminSummary,
};
