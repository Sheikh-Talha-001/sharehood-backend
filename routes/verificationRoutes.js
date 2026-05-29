// ============================================================
// routes/verificationRoutes.js — User Verification Routes
// ============================================================
//
// ROUTE MAP:
//   POST /api/verification/submit  → Submit ID documents
//   GET  /api/verification/status  → Check own verification status
//
// MULTER upload.fields() is used for 3 file fields simultaneously:
//   - idFrontImage  (required)
//   - idBackImage   (optional)
//   - selfieWithId  (required)
//
//   req.files.idFrontImage[0]  → front image
//   req.files.selfieWithId[0]  → selfie
// ============================================================

const express = require("express");
const router = express.Router();

const {
  submitVerification,
  getMyVerificationStatus,
} = require("../controllers/verificationController");

const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { partnerRateLimiter } = require("../middleware/rateLimitMiddleware");

// POST /api/verification/submit
// multipart/form-data: nationalIdNumber (text) + image files
router.post(
  "/submit",
  protect,
  partnerRateLimiter,
  upload.fields([
    { name: "idFrontImage", maxCount: 1 },
    { name: "idBackImage", maxCount: 1 },
    { name: "selfieWithId", maxCount: 1 },
  ]),
  submitVerification
);

// GET /api/verification/status
router.get("/status", protect, getMyVerificationStatus);

module.exports = router;
