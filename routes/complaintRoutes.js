const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const {
  submitComplaint,
  getMyComplaints,
} = require("../controllers/complaintController");

const router = express.Router();

router.post("/", protect, upload.single("proofImage"), submitComplaint);
router.get("/my-complaints", protect, getMyComplaints);

module.exports = router;
