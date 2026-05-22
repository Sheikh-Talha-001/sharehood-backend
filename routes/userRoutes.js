// ============================================================
// routes/userRoutes.js — User Profile & Management Routes
// ============================================================
//
// ROUTE MAP:
//   ┌──────────────────────────────────────────────────────────┐
//   │ PRIVATE ROUTES (Requires JWT)                            │
//   │   GET /api/users/profile         → Fetch full profile    │
//   │   PUT /api/users/profile         → Update safe fields    │
//   │   PUT /api/users/change-password → Securely change pwd   │
//   │   PUT /api/users/avatar          → Upload image file     │
//   ├──────────────────────────────────────────────────────────┤
//   │ PUBLIC ROUTES (No JWT required)                          │
//   │   GET /api/users/:id/public      → Fetch public-safe info│
//   └──────────────────────────────────────────────────────────┘
//
// CLOUDINARY FILE UPLOAD:
//   The /avatar route uses the upload.single("image") middleware.
//   This intercepts the "multipart/form-data" request, extracts
//   the image, validates it, and provides it to the controller
//   as req.file.buffer for Cloudinary upload.
// ============================================================

const express = require("express");
const router = express.Router();

const {
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar,
  getPublicProfile,
} = require("../controllers/userController");

const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

// ============================================================
// Public Routes
// ============================================================
// Important: Place dynamic /:id routes LAST, otherwise a request 
// to /profile would try to find a user with the ID "profile"
router.get("/:id/public", getPublicProfile);

// ============================================================
// Private Routes (Logged-in users only)
// ============================================================
// We apply the protect middleware to all routes below this line
router.use(protect);

router
  .route("/profile")
  .get(getProfile)
  .put(updateProfile);

router.put("/change-password", changePassword);

// Apply Multer middleware specifically to the avatar route
router.put("/avatar", upload.single("image"), uploadAvatar);

module.exports = router;
