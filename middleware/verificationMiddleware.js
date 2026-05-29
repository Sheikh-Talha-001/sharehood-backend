// ============================================================
// middleware/verificationMiddleware.js — Verification Gate
// ============================================================
//
// WHAT IS THIS?
//   This middleware acts as a "gate" — it blocks certain actions
//   unless the user has been verified by an admin.
//
// WHERE IS IT USED?
//   - POST /api/items        (creating a new item listing)
//   - POST /api/requests     (creating a borrow request)
//
//   These are the two "trust-critical" actions in Lendly.
//   You must be a verified community member to participate.
//
// MIDDLEWARE CHAIN ORDER (for protected, verified routes):
//   1. protect          → checks JWT, attaches req.user
//   2. requireVerified  → checks req.user.verificationStatus
//   3. controller       → runs business logic
//
//   If step 1 fails → 401 (not logged in)
//   If step 2 fails → 403 (logged in but not verified)
//   Step 3 only runs if both pass.
//
// WHY NOT PUT THIS CHECK IN THE CONTROLLER?
//   The verification check is a "cross-cutting concern" — it
//   applies to multiple unrelated routes (items AND requests).
//   Middleware keeps each controller clean and focused on its
//   own business logic without verification boilerplate.
//
// STATUS RESPONSES:
//   unverified → "Please submit your verification documents"
//   pending    → "Your documents are under review"
//   rejected   → "Your verification was rejected. Please re-submit"
//   verified   → allowed through (calls next())
// ============================================================

const ErrorResponse = require("../utils/errorResponse");

// ============================================================
// requireVerified — Blocks unverified users
// ============================================================
// This is a simple synchronous middleware (no async needed)
// because we already have req.user attached by the protect
// middleware, which includes the verificationStatus field.
// ============================================================
const requireVerified = (req, res, next) => {
  // Guard: protect middleware must run first (req.user must exist)
  if (!req.user) {
    return next(new ErrorResponse("Not authorized - Please log in", 401));
  }

  const status = req.user.verificationStatus;

  // --- VERIFIED: Let them through ---
  if (status === "verified") {
    return next();
  }

  // --- PENDING: Submitted, waiting for review ---
  if (status === "pending") {
    return next(
      new ErrorResponse(
        "Verification pending — your documents are under admin review. Please wait for approval before listing or borrowing items.",
        403
      )
    );
  }

  // --- REJECTED: Admin rejected the documents ---
  if (status === "rejected") {
    return next(
      new ErrorResponse(
        "Your verification was rejected. Please re-submit your documents at POST /api/verification/submit",
        403
      )
    );
  }

  // --- UNVERIFIED: Never submitted documents ---
  // Default case — catches "unverified" and any unexpected values
  return next(
    new ErrorResponse(
      "Verification required — please submit your identity documents at POST /api/verification/submit to start listing or borrowing items",
      403
    )
  );
};

module.exports = { requireVerified };
