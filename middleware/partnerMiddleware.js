// ============================================================
// middleware/partnerMiddleware.js — Partner/Lender Listing Gate
// ============================================================
//
// WHAT IS THIS?
//   This middleware acts as a "gate" — it blocks item creation
//   unless the user has been approved as a partner/lender.
//
// WHERE IS IT USED?
//   - POST /api/items  (creating a new item listing)
//
//   This is the ONLY "trust-critical" listing action in ShareHood.
//   Browsing, borrowing, and other actions are NOT restricted
//   by partner status (only by verification status).
//
// TRUST-FIRST MARKETPLACE ARCHITECTURE:
//   ShareHood operates on a two-tier trust system:
//
//   TIER 1 — Identity Verification (verificationMiddleware.js):
//     "Are you who you say you are?"
//     Required for: borrowing items, applying as a partner
//     Checked by: requireVerified middleware
//
//   TIER 2 — Partner Approval (this middleware):
//     "Are you approved to list items?"
//     Required for: creating item listings
//     Checked by: requirePartner middleware
//
//   The middleware chain for item creation is:
//     protect → requireVerified → requirePartner → upload → createItem
//
//   Each layer adds another trust check:
//     1. protect:          "Are you logged in?"     (JWT valid?)
//     2. requireVerified:  "Is your identity confirmed?"
//     3. requirePartner:   "Are you approved to list?"
//     4. createItem:       "Create the listing"
//
// WHY NOT CHECK req.user.role === "lender"?
//   We use CAPABILITY-BASED permissions (canListItems), not roles.
//   See the detailed explanation in models/userModel.js.
//   Short version: a user can be a borrower AND a lender without
//   changing roles. Capabilities are additive; roles are exclusive.
//
// PARTNER STATUS RESPONSES:
//   none     → "Apply to become a partner at POST /api/partners/apply"
//   pending  → "Your partner application is under review"
//   rejected → "Your partner application was rejected. You may re-apply"
//   approved → allowed through (calls next())
//
//   We also check canListItems as the AUTHORITATIVE flag.
//   partnerStatus is only used for user-friendly error messages.
// ============================================================

const ErrorResponse = require("../utils/errorResponse");

// ============================================================
// requirePartner — Blocks non-partner users from listing items
// ============================================================
// This is a simple synchronous middleware (no async needed)
// because we already have req.user attached by the protect
// middleware, which includes canListItems and partnerStatus.
// ============================================================
const requirePartner = (req, res, next) => {
  // Guard: protect middleware must run first (req.user must exist)
  if (!req.user) {
    return next(new ErrorResponse("Not authorized - Please log in", 401));
  }

  // --- APPROVED PARTNER: Let them through ---
  // canListItems is the SINGLE SOURCE OF TRUTH for listing permission.
  // We check this flag, NOT the partnerStatus enum, because:
  //   - An admin could manually grant canListItems without the workflow
  //   - The flag is what actually controls access
  if (req.user.canListItems === true) {
    return next();
  }

  // --- NOT APPROVED: Return specific error based on status ---
  const status = req.user.partnerStatus;

  // PENDING: Application submitted, waiting for review
  if (status === "pending") {
    return next(
      new ErrorResponse(
        "Partner approval pending — your partner application is currently under admin review. You will be notified when a decision is made.",
        403
      )
    );
  }

  // REJECTED: Application was denied
  if (status === "rejected") {
    return next(
      new ErrorResponse(
        "Your partner application was not approved. You may submit a new application at POST /api/partners/apply after addressing the feedback.",
        403
      )
    );
  }

  // NONE (default): User hasn't applied yet
  // This catches "none" and any unexpected values
  return next(
    new ErrorResponse(
      "Partner approval required — only approved partners can list items. Apply at POST /api/partners/apply",
      403
    )
  );
};

module.exports = { requirePartner };
