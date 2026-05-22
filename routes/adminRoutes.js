// ============================================================
// routes/adminRoutes.js — Admin Dashboard & Moderation Routes
// ============================================================
//
// ROUTE MAP:
//   ┌──────────────────────────────────────────────────────────┐
//   │ DASHBOARD                                                │
//   │   GET  /api/admin/dashboard                → Stats       │
//   ├──────────────────────────────────────────────────────────┤
//   │ USER MANAGEMENT                                          │
//   │   GET  /api/admin/users                    → List all    │
//   │   PUT  /api/admin/users/:id/suspend        → Suspend     │
//   │   PUT  /api/admin/users/:id/activate       → Reactivate  │
//   ├──────────────────────────────────────────────────────────┤
//   │ REPORT MODERATION                                        │
//   │   GET  /api/admin/reports                  → List all    │
//   │   PUT  /api/admin/reports/:id/resolve      → Resolve     │
//   │   PUT  /api/admin/reports/:id/dismiss      → Dismiss     │
//   ├──────────────────────────────────────────────────────────┤
//   │ ITEM MODERATION                                          │
//   │   PUT  /api/admin/items/:id/remove         → Remove      │
//   │   PUT  /api/admin/items/:id/restore        → Restore     │
//   ├──────────────────────────────────────────────────────────┤
//   │ VERIFICATION MANAGEMENT                                  │
//   │   GET  /api/admin/verifications            → List all    │
//   │   GET  /api/admin/verifications/:id        → View one    │
//   │   PUT  /api/admin/verifications/:id/approve → Approve    │
//   │   PUT  /api/admin/verifications/:id/reject  → Reject     │
//   ├──────────────────────────────────────────────────────────┤
//   │ SUSPENSION APPEALS                                       │
//   │   GET  /api/admin/suspension-appeals       → List all    │
//   │   GET  /api/admin/suspension-appeals/:id   → View one    │
//   │   PUT  /api/admin/suspension-appeals/:id/approve → Approve│
//   │   PUT  /api/admin/suspension-appeals/:id/reject  → Reject │
//   ├──────────────────────────────────────────────────────────┤
//   │ PARTNER APPLICATION MODERATION                            │
//   │   GET  /api/admin/partner-applications       → List all  │
//   │   GET  /api/admin/partner-applications/:id   → View one  │
//   │   PUT  /api/admin/partner-applications/:id/approve → Yes │
//   │   PUT  /api/admin/partner-applications/:id/reject  → No  │
//   └──────────────────────────────────────────────────────────┘
//
// MIDDLEWARE CHAIN (every route):
//   1. protect         → checks JWT, attaches req.user
//   2. authorize("admin") → checks req.user.role === "admin"
//   3. controller      → runs admin business logic
//
// HOW TO CREATE AN ADMIN USER:
//   In MongoDB Compass or mongosh, set a user's role to "admin":
//   db.users.updateOne({ email: "admin@example.com" }, { $set: { role: "admin" } })
// ============================================================

const express = require("express");
const router = express.Router();

const {
  // Dashboard
  getDashboardStats,
  // User management
  getAllUsers,
  suspendUser,
  activateUser,
  // Report moderation
  getAllReports,
  resolveReport,
  dismissReport,
  // Item moderation
  getAllItems,
  removeItemByAdmin,
  restoreRemovedItem,
  // Verification management
  getAllVerifications,
  getVerificationById,
  approveVerification,
  rejectVerification,
} = require("../controllers/adminController");

const {
  getAllSuspensionAppeals,
  getSuspensionAppealById,
  approveAppeal,
  rejectAppeal,
} = require("../controllers/suspensionAppealController");

const {
  getAllPartnerApplications,
  getPartnerApplicationById,
  approvePartnerApplication,
  rejectPartnerApplication,
} = require("../controllers/adminPartnerController");

const { protect, authorize } = require("../middleware/authMiddleware");

// ============================================================
// All routes require: valid JWT + admin role
// ============================================================

// --- DASHBOARD ---
router.get("/dashboard", protect, authorize("admin"), getDashboardStats);

// --- USER MANAGEMENT ---
router.get("/users", protect, authorize("admin"), getAllUsers);
router.put("/users/:id/suspend", protect, authorize("admin"), suspendUser);
router.put("/users/:id/activate", protect, authorize("admin"), activateUser);

// --- REPORT MODERATION ---
router.get("/reports", protect, authorize("admin"), getAllReports);
router.put("/reports/:id/resolve", protect, authorize("admin"), resolveReport);
router.put("/reports/:id/dismiss", protect, authorize("admin"), dismissReport);

// --- ITEM MODERATION ---
router.get("/items", protect, authorize("admin"), getAllItems);
router.put("/items/:id/remove", protect, authorize("admin"), removeItemByAdmin);
router.put("/items/:id/restore", protect, authorize("admin"), restoreRemovedItem);

// --- VERIFICATION MANAGEMENT (preserved from verification system) ---
router.get("/verifications", protect, authorize("admin"), getAllVerifications);
router.get("/verifications/:id", protect, authorize("admin"), getVerificationById);
router.put("/verifications/:id/approve", protect, authorize("admin"), approveVerification);
router.put("/verifications/:id/reject", protect, authorize("admin"), rejectVerification);

// --- SUSPENSION APPEALS ---
router.get("/suspension-appeals", protect, authorize("admin"), getAllSuspensionAppeals);
router.get("/suspension-appeals/:id", protect, authorize("admin"), getSuspensionAppealById);
router.put("/suspension-appeals/:id/approve", protect, authorize("admin"), approveAppeal);
router.put("/suspension-appeals/:id/reject", protect, authorize("admin"), rejectAppeal);

// --- PARTNER APPLICATION MODERATION ---
router.get("/partner-applications", protect, authorize("admin"), getAllPartnerApplications);
router.get("/partner-applications/:id", protect, authorize("admin"), getPartnerApplicationById);
router.put("/partner-applications/:id/approve", protect, authorize("admin"), approvePartnerApplication);
router.put("/partner-applications/:id/reject", protect, authorize("admin"), rejectPartnerApplication);

module.exports = router;
