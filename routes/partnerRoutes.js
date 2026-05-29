// ============================================================
// routes/partnerRoutes.js — Partner/Lender Application Routes
// ============================================================
//
// ROUTE MAP:
//   ┌──────────────────────────────────────────────────────────┐
//   │ PARTNER APPLICATION (User-Facing)                        │
//   │   POST /api/partners/apply          → Submit application │
//   │   GET  /api/partners/my-application → Check status       │
//   └──────────────────────────────────────────────────────────┘
//
// TRUST-FIRST MARKETPLACE — PARTNER ONBOARDING FLOW:
//   1. User registers and completes identity verification
//   2. User submits a partner application (POST /api/partners/apply)
//   3. Admin reviews and approves/rejects via admin routes
//   4. If approved: user can now create item listings
//
// MIDDLEWARE CHAIN:
//   POST /apply:
//     protect → requireVerified → applyAsPartner
//     WHY requireVerified? Only identity-verified users can apply.
//     Unverified users must complete verification first.
//
//   GET /my-application:
//     protect → getMyApplication
//     WHY no requireVerified? Users should be able to check their
//     application status even before being verified (edge case:
//     admin could reject verification after partner apply).
//     Actually, this is just a status check — no harm in allowing it.
//
// ADMIN-SIDE MODERATION:
//   The admin routes for managing partner applications are in
//   routes/adminRoutes.js, NOT here. This file is ONLY for
//   user-facing partner actions.
// ============================================================

const express = require("express");
const router = express.Router();

// Import controller functions
const {
  applyAsPartner,
  getMyApplication,
} = require("../controllers/partnerController");

// Import middleware
const { protect } = require("../middleware/authMiddleware");
const { requireVerified } = require("../middleware/verificationMiddleware");
const { partnerRateLimiter } = require("../middleware/rateLimitMiddleware");

// ============================================================
// All routes below require authentication (valid JWT)
// ============================================================

// --- Submit a partner application ---
// POST /api/partners/apply
// Chain: protect (JWT) → requireVerified (identity check) → applyAsPartner
// Body: { fullName, phoneNumber, categoriesInterestedIn, reasonForJoining, businessName?, experienceDescription }
router.post("/apply", protect, requireVerified, partnerRateLimiter, applyAsPartner);

// --- Check my application status ---
// GET /api/partners/my-application
// Chain: protect (JWT) → getMyApplication
router.get("/my-application", protect, getMyApplication);

module.exports = router;
