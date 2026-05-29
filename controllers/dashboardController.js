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
  // Date calculations for timeseries
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(today.getMonth() - 6);

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
    userActivityRaw,
    itemActivityRaw,
    reportTrendsRaw
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ verificationStatus: "verified" }),
    User.countDocuments({ isSuspended: true }),
    User.countDocuments({ verificationStatus: "pending" }),
    PartnerApplication.countDocuments({ status: "pending" }),
    Item.countDocuments({ isRemovedByAdmin: false }),
    Report.countDocuments({ status: "pending" }),
    Agreement.countDocuments({ status: "active" }),
    // Timeseries: Users created in last 7 days
    User.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      }
    ]),
    // Timeseries: Items created in last 7 days
    Item.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      }
    ]),
    // Timeseries: Reports in last 6 months
    Report.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
          _id: { 
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" },
            status: "$status" 
          },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  // Format activityData (last 7 days)
  const activityData = [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    
    const userCount = userActivityRaw.find(u => u._id === dateStr)?.count || 0;
    const itemCount = itemActivityRaw.find(u => u._id === dateStr)?.count || 0;
    
    activityData.push({
      name: days[d.getDay()],
      users: userCount,
      signups: userCount, // for weeklyTraffic mapping
      items: itemCount,
      listings: itemCount // for weeklyTraffic mapping
    });
  }

  // Format reportsData (last 6 months)
  const reportsData = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(today.getMonth() - i);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    
    const pending = reportTrendsRaw.find(r => r._id.month === m && r._id.year === y && r._id.status === 'pending')?.count || 0;
    const resolved = reportTrendsRaw.find(r => r._id.month === m && r._id.year === y && r._id.status === 'resolved')?.count || 0;
    const dismissed = reportTrendsRaw.find(r => r._id.month === m && r._id.year === y && r._id.status === 'dismissed')?.count || 0;
    
    reportsData.push({
      name: monthNames[m - 1],
      pending,
      resolved,
      dismissed,
      reports: pending + resolved + dismissed // for moderationTrends
    });
  }

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
      timeseries: {
        activityData,
        reportsData
      }
    },
  });
});

module.exports = {
  getUserSummary,
  getAdminSummary,
};
