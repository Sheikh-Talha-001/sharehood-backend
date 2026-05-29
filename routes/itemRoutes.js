// ============================================================
// routes/itemRoutes.js — Item URL Definitions
// ============================================================
//
// SEARCH / FILTER / SORT / PAGINATION:
//   The GET /api/items route now accepts query parameters for
//   building rich marketplace search experiences:
//
//   SEARCH:      GET /api/items?search=drill
//   CATEGORY:    GET /api/items?category=Tools
//   CONDITION:   GET /api/items?condition=good
//   AVAILABLE:   GET /api/items?available=true
//   VERIFIED:    GET /api/items?verifiedOnly=true
//   SORT:        GET /api/items?sort=newest
//   PAGINATION:  GET /api/items?page=2&limit=12
//   COMBINED:    GET /api/items?search=drill&category=Tools&sort=newest&page=1&limit=10
//
// CATEGORIES ENDPOINT:
//   GET /api/items/categories returns the standardized list of
//   item categories. The frontend uses this to build dropdown
//   filters and category navigation without hardcoding values.
//
// MULTER IN ROUTES:
//   upload.single("image") is a middleware that:
//     1. Looks for a file field named "image" in the request
//     2. Extracts the file and puts it in req.file
//     3. Extracts text fields and puts them in req.body
//
//   It only runs on routes that accept file uploads (POST, PUT).
//   GET and DELETE don't need it.
//
// IMPORTANT: ROUTE ORDER MATTERS
//   Named routes like /my-items and /categories MUST come BEFORE
//   the /:id routes. Otherwise Express treats "my-items" or
//   "categories" as an ID parameter and tries to look it up
//   in the database, which would fail with a CastError.
//
//   Correct order:
//     /categories  ← named route (before :id)
//     /my-items    ← named route (before :id)
//     /:id         ← dynamic route (last)
// ============================================================

const express = require("express");
const router = express.Router();

// Import controller functions
const {
  createItem,
  getAllItems,
  getCategories,
  getSingleItem,
  updateItem,
  deleteItem,
  getMyItems,
} = require("../controllers/itemController");

// Import protect middleware (JWT verification)
const { protect } = require("../middleware/authMiddleware");

// Import verification middleware (blocks unverified users)
// WHY HERE? Creating an item listing is a trust-critical action.
// Unverified users should not be able to list items for lending.
const { requireVerified } = require("../middleware/verificationMiddleware");

// Import partner middleware (blocks non-partner users from listing)
// WHY HERE? Lendly is a trust-first marketplace. Only admin-approved
// partners/lenders can create item listings. Regular verified users
// can only browse and borrow — not list items.
const { requirePartner } = require("../middleware/partnerMiddleware");

// Import multer upload middleware (file handling)
const upload = require("../middleware/uploadMiddleware");

// ------------------------------------------------------------
// Public Routes — No token required
// ------------------------------------------------------------

// GET /api/items — browse all available items (with search, filter, sort, pagination)
// Query params: ?search= &category= &condition= &available= &verifiedOnly= &sort= &page= &limit=
router.get("/", getAllItems);

// GET /api/items/categories — get standardized categories list
// ⚠️ Must be ABOVE the /:id route (Express would treat "categories" as an ID)
router.get("/categories", getCategories);

// ------------------------------------------------------------
// Private Routes — Valid JWT required
// ------------------------------------------------------------

// POST /api/items — create a new item with optional image
// Chain: protect (JWT) → requireVerified (identity check) → requirePartner (listing permission) → upload → createItem
//
// THREE-LAYER TRUST CHAIN:
//   1. protect:          "Are you logged in?"           → 401 if not
//   2. requireVerified:  "Is your identity confirmed?"  → 403 if not
//   3. requirePartner:   "Are you approved to list?"    → 403 if not
//   4. upload:           Handle the image file
//   5. createItem:       Create the listing in the database
router.post("/", protect, requireVerified, requirePartner, upload.single("image"), createItem);

// GET /api/items/my-items — get items owned by logged-in user
// ⚠️ Must be ABOVE the /:id route
router.get("/my-items", protect, getMyItems);

// ------------------------------------------------------------
// Routes with :id parameter
// ------------------------------------------------------------

// GET /api/items/:id — get single item (public)
router.get("/:id", getSingleItem);

// PUT /api/items/:id — update item with optional new image (owner only)
router.put("/:id", protect, upload.single("image"), updateItem);

// DELETE /api/items/:id — delete item and its cloud image (owner only)
router.delete("/:id", protect, deleteItem);

module.exports = router;
