// ============================================================
// routes/authRoutes.js — Auth URL Definitions
// ============================================================
//
// ROUTE MAP:
//   POST /api/auth/register          → Register new account (public)
//   POST /api/auth/login             → Login (public, rate limited)
//   GET  /api/auth/me                → My profile (private)
//   POST /api/auth/logout            → Logout (private)
//   POST /api/auth/appeal-suspension → Submit suspension appeal (public, rate limited)
//
// WHY IS appeal-suspension PUBLIC?
//   The protect middleware returns 403 for suspended users.
//   If we protected this route, suspended users could never
//   reach the appeal endpoint — defeating its entire purpose.
//   Instead, the controller manually validates the email
//   and verifies the user is actually suspended.
//
// RATE LIMITING:
//   - login: 10 attempts/15min — prevents brute-force attacks
//   - appeal-suspension: 5 submissions/hour — prevents spam
// ============================================================

const express = require("express");
const router = express.Router();

const { registerUser, loginUser, getMe, logoutUser } = require("../controllers/authController");
const { submitSuspensionAppeal } = require("../controllers/suspensionAppealController");
const { protect } = require("../middleware/authMiddleware");
const { appealRateLimiter, loginRateLimiter } = require("../middleware/rateLimitMiddleware");

// --- Public Routes ---
router.post("/register", registerUser);
router.post("/login", loginRateLimiter, loginUser);

// --- Public — suspension appeal (rate limited to prevent spam) ---
router.post("/appeal-suspension", appealRateLimiter, submitSuspensionAppeal);

// --- Private Routes ---
router.get("/me", protect, getMe);
router.post("/logout", protect, logoutUser);

module.exports = router;
