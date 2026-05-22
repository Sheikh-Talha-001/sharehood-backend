// ============================================================
// routes/borrowRequestRoutes.js — Borrow Request URL Definitions
// ============================================================
//
// ROUTE DESIGN OVERVIEW:
//   All routes are under the /api/requests prefix (set in server.js).
//   Every route is PRIVATE — the protect middleware verifies the JWT
//   token before any controller logic runs.
//
// ROUTE ORDER MATTERS:
//   Named routes like /my-requests and /received MUST come BEFORE
//   the /:id routes. Otherwise, Express would treat "my-requests"
//   as an ID parameter and try to look it up in the database.
//
// AUTHORIZATION FLOW:
//   1. protect middleware → verifies JWT, attaches req.user
//   2. Controller function → checks ownership/borrower permissions
//
//   We do NOT use a separate authorization middleware here because
//   the ownership checks depend on the specific request document
//   (is this user the owner? the borrower?). This logic lives in
//   the controller where we already have the request loaded.
//
// ROUTE MAP:
//   POST   /api/requests              → Create a new borrow request
//   GET    /api/requests/my-requests  → Get requests I've made
//   GET    /api/requests/received     → Get requests for my items
//   PUT    /api/requests/:id/approve  → Owner approves a request
//   PUT    /api/requests/:id/reject   → Owner rejects a request
//   PUT    /api/requests/:id/cancel   → Borrower cancels a request
//   PUT    /api/requests/:id/return   → Owner marks item as returned
// ============================================================

const express = require("express");
const router = express.Router();

// Import controller functions
const {
  createBorrowRequest,
  getMyBorrowRequests,
  getRequestsForMyItems,
  approveRequest,
  rejectRequest,
  cancelRequest,
  markReturned,
} = require("../controllers/borrowRequestController");

// Import protect middleware (JWT verification)
const { protect } = require("../middleware/authMiddleware");

// Import verification middleware (blocks unverified users)
// WHY HERE? Borrowing someone's item is a trust-critical action.
// Unverified users cannot initiate borrow requests.
const { requireVerified } = require("../middleware/verificationMiddleware");

// ============================================================
// All routes below require authentication (valid JWT)
// ============================================================

// --- Create a new borrow request ---
// POST /api/requests
// Chain: protect (JWT) → requireVerified (trust check) → createBorrowRequest
// Body: { item, message?, startDate, expectedReturnDate }
router.post("/", protect, requireVerified, createBorrowRequest);

// --- Get all requests the logged-in user has MADE ---
// GET /api/requests/my-requests
// ⚠️ Must be ABOVE /:id routes (same reason as /my-items in itemRoutes)
router.get("/my-requests", protect, getMyBorrowRequests);

// --- Get all requests RECEIVED for items the user owns ---
// GET /api/requests/received
router.get("/received", protect, getRequestsForMyItems);

// ============================================================
// Status transition routes (all require :id parameter)
// ============================================================

// --- Owner approves a pending request ---
// PUT /api/requests/:id/approve
// Transition: pending → approved (item becomes unavailable)
router.put("/:id/approve", protect, approveRequest);

// --- Owner rejects a pending request ---
// PUT /api/requests/:id/reject
// Transition: pending → rejected
router.put("/:id/reject", protect, rejectRequest);

// --- Borrower cancels their own pending request ---
// PUT /api/requests/:id/cancel
// Transition: pending → cancelled
router.put("/:id/cancel", protect, cancelRequest);

// --- Owner marks an approved request as returned ---
// PUT /api/requests/:id/return
// Transition: approved → returned (item becomes available again)
router.put("/:id/return", protect, markReturned);

module.exports = router;
