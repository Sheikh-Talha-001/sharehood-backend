const Complaint = require("../models/complaintModel");
const Agreement = require("../models/agreementModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const cloudinary = require("../config/cloudinary");
const { notifyAdmins } = require("../utils/notify");
const { validateString, validateObjectId } = require("../utils/validator");

// Helper to upload image
const uploadProofImage = (fileBuffer, mimetype) => {
  return new Promise((resolve, reject) => {
    const base64 = fileBuffer.toString("base64");
    const dataUri = `data:${mimetype};base64,${base64}`;

    cloudinary.uploader.upload(
      dataUri,
      {
        folder: "lendly/complaints",
        resource_type: "auto", // accept image or pdf (if configured)
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
  });
};

// @route   POST /api/complaints
// @desc    Submit a complaint against a borrow request / agreement
// @access  Private
const submitComplaint = asyncHandler(async (req, res, next) => {
  const { agreementId, message } = req.body;

  try {
    validateObjectId(agreementId, "Agreement ID");
    validateString(message, "Complaint Message", { required: true, maxLength: 2000 });
  } catch (err) {
    return next(err);
  }

  // Find agreement
  const agreement = await Agreement.findById(agreementId);
  if (!agreement) {
    return next(new ErrorResponse("Agreement not found", 404));
  }

  // Ensure user is the owner
  if (agreement.owner.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse("Only the item owner can file a complaint for this agreement", 403));
  }

  // Check if a complaint already exists
  const existingComplaint = await Complaint.findOne({
    agreement: agreementId,
    status: { $in: ["pending", "under_review"] },
  });

  if (existingComplaint) {
    return next(new ErrorResponse("A pending complaint already exists for this agreement", 400));
  }

  // Handle proof upload
  let proofImage = "";
  let proofImagePublicId = "";

  if (req.file) {
    const uploadResult = await uploadProofImage(req.file.buffer, req.file.mimetype);
    proofImage = uploadResult.secure_url;
    proofImagePublicId = uploadResult.public_id;
  }

  const complaint = await Complaint.create({
    owner: req.user._id,
    borrower: agreement.borrower,
    item: agreement.item,
    agreement: agreementId,
    message: message.trim(),
    proofImage,
    proofImagePublicId,
  });

  // Notify Admins
  await notifyAdmins({
    sender: req.user._id,
    type: "new_complaint",
    title: "New Owner Complaint",
    message: `${req.user.name} filed a complaint regarding agreement ${agreement.agreementNumber || agreementId}`,
  });

  res.status(201).json({
    success: true,
    data: complaint,
  });
});

// @route   GET /api/complaints/my-complaints
// @desc    Get logged in user's complaints
// @access  Private
const getMyComplaints = asyncHandler(async (req, res, next) => {
  const complaints = await Complaint.find({ owner: req.user._id })
    .populate("borrower", "name email isVerified")
    .populate("item", "title image images")
    .populate("agreement", "agreementNumber expectedReturnDate borrowDate")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: complaints,
  });
});

module.exports = {
  submitComplaint,
  getMyComplaints,
};
