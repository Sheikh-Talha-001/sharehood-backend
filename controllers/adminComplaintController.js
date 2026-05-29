const Complaint = require("../models/complaintModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const { notify } = require("../utils/notify");
const { validateObjectId, validateString } = require("../utils/validator");

// @route   GET /api/admin/complaints
// @desc    Get all complaints
// @access  Private/Admin
const getAllComplaints = asyncHandler(async (req, res, next) => {
  const complaints = await Complaint.find()
    .populate("owner", "name email")
    .populate("borrower", "name email")
    .populate("item", "title image images")
    .populate("agreement", "agreementNumber")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: complaints,
  });
});

// @route   GET /api/admin/complaints/:id
// @desc    Get single complaint
// @access  Private/Admin
const getComplaintById = asyncHandler(async (req, res, next) => {
  try {
    validateObjectId(req.params.id, "Complaint ID");
  } catch (err) {
    return next(err);
  }

  const complaint = await Complaint.findById(req.params.id)
    .populate("owner", "name email phoneNumber")
    .populate("borrower", "name email phoneNumber")
    .populate("item", "title image images condition price category")
    .populate("agreement", "agreementNumber expectedReturnDate borrowDate actualReturnDate itemConditionBefore itemConditionAfter");

  if (!complaint) {
    return next(new ErrorResponse("Complaint not found", 404));
  }

  // Update status to under_review if it was pending
  if (complaint.status === "pending") {
    complaint.status = "under_review";
    complaint.reviewedBy = req.user._id;
    await complaint.save();
  }

  res.status(200).json({
    success: true,
    data: complaint,
  });
});

// @route   PUT /api/admin/complaints/:id/resolve
// @desc    Resolve a complaint
// @access  Private/Admin
const resolveComplaint = asyncHandler(async (req, res, next) => {
  const { resolution } = req.body;

  try {
    validateObjectId(req.params.id, "Complaint ID");
    validateString(resolution, "Resolution message", { required: true, maxLength: 2000 });
  } catch (err) {
    return next(err);
  }

  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) {
    return next(new ErrorResponse("Complaint not found", 404));
  }

  complaint.status = "resolved";
  complaint.adminResolution = resolution;
  complaint.reviewedBy = req.user._id;
  await complaint.save();

  // Notify the owner
  await notify({
    recipient: complaint.owner,
    type: "complaint_resolved",
    title: "Complaint Resolved",
    message: `Your complaint regarding item has been resolved. Resolution: ${resolution}`,
    link: "/dashboard/complaints",
  });

  res.status(200).json({
    success: true,
    data: complaint,
  });
});

// @route   PUT /api/admin/complaints/:id/reject
// @desc    Reject a complaint
// @access  Private/Admin
const rejectComplaint = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  try {
    validateObjectId(req.params.id, "Complaint ID");
    validateString(reason, "Rejection reason", { required: true, maxLength: 2000 });
  } catch (err) {
    return next(err);
  }

  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) {
    return next(new ErrorResponse("Complaint not found", 404));
  }

  complaint.status = "rejected";
  complaint.adminResolution = reason;
  complaint.reviewedBy = req.user._id;
  await complaint.save();

  // Notify the owner
  await notify({
    recipient: complaint.owner,
    type: "complaint_rejected",
    title: "Complaint Rejected",
    message: `Your complaint has been reviewed and rejected. Reason: ${reason}`,
    link: "/dashboard/complaints",
  });

  res.status(200).json({
    success: true,
    data: complaint,
  });
});

module.exports = {
  getAllComplaints,
  getComplaintById,
  resolveComplaint,
  rejectComplaint,
};
