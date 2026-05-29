// ============================================================
// routes/reportRoutes.js — User Report Submission Routes
// ============================================================
//
// ROUTE MAP:
//   POST /api/reports           → Submit a new report
//   GET  /api/reports/my-reports → View own submitted reports
//
// All routes require authentication (protect middleware).
// No admin role required — these are regular user endpoints.
// ============================================================

const express = require("express");
const router = express.Router();

const {
  createReport,
  getMyReports,
} = require("../controllers/reportController");

const { protect } = require("../middleware/authMiddleware");
const { reportRateLimiter } = require("../middleware/rateLimitMiddleware");

// POST /api/reports — Submit a report
router.post("/", protect, reportRateLimiter, createReport);

// GET /api/reports/my-reports — View own reports
router.get("/my-reports", protect, getMyReports);

module.exports = router;
