const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  getAllComplaints,
  getComplaintById,
  resolveComplaint,
  rejectComplaint,
} = require("../controllers/adminComplaintController");

const router = express.Router();

// All routes require admin
router.use(protect);
router.use(authorize("admin"));

router.route("/")
  .get(getAllComplaints);

router.route("/:id")
  .get(getComplaintById);

router.route("/:id/resolve")
  .put(resolveComplaint);

router.route("/:id/reject")
  .put(rejectComplaint);

module.exports = router;
