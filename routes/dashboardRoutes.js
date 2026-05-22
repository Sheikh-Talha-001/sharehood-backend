// ============================================================
// routes/dashboardRoutes.js — Aggregation Dashboard Routes
// ============================================================
//
// ROUTE MAP:
//   ┌──────────────────────────────────────────────────────────┐
//   │ USER DASHBOARD (Requires JWT)                            │
//   │   GET /api/dashboard/user-summary   → My activity metrics│
//   ├──────────────────────────────────────────────────────────┤
//   │ ADMIN DASHBOARD (Requires JWT + Admin Role)              │
//   │   GET /api/dashboard/admin-summary  → Platform metrics   │
//   └──────────────────────────────────────────────────────────┘
// ============================================================

const express = require("express");
const router = express.Router();

const {
  getUserSummary,
  getAdminSummary,
} = require("../controllers/dashboardController");

const { protect, authorize } = require("../middleware/authMiddleware");

// ============================================================
// User Dashboard Route
// ============================================================
// Returns activity specific to the logged-in user
router.get("/user-summary", protect, getUserSummary);

// ============================================================
// Admin Dashboard Route
// ============================================================
// Returns platform-wide activity and moderation queue depths
// Protected by BOTH the JWT check AND the admin role check
router.get("/admin-summary", protect, authorize("admin"), getAdminSummary);

module.exports = router;
