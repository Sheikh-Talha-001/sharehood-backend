// ============================================================
// controllers/verificationController.js — User Verification Logic
// ============================================================
//
// WHAT THIS CONTROLLER DOES:
//   Handles the USER-facing side of verification:
//     1. Submit verification documents
//     2. Check their own verification status
//
// WHAT THIS CONTROLLER DOES NOT DO:
//   - Approve or reject documents (that's admin's job)
//   - Access other users' documents (privacy)
//
// CLOUDINARY UPLOAD FLOW (same pattern as itemController):
//   1. Multer captures the file into memory (req.files)
//   2. We convert buffer → base64 data URI
//   3. We call cloudinary.uploader.upload() with the folder
//      "sharehood/verifications/" (separate from item images)
//   4. Cloudinary returns { secure_url, public_id }
//   5. We store both in MongoDB
//
// SECURITY:
//   - Users can only see their own verification status/request
//   - National ID numbers are NEVER returned to users
//   - Document URLs are NEVER returned to users (admin-only)
//   - A pending request blocks re-submission (prevent spam)
// ============================================================

const VerificationRequest = require("../models/verificationRequestModel");
const User = require("../models/userModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const cloudinary = require("../config/cloudinary");
const { notify, notifyAdmins } = require("../utils/notify");
const { validateString } = require("../utils/validator");

// ============================================================
// Helper: Upload a single image buffer to Cloudinary
// ============================================================
// Same pattern as itemController.js uploadToCloudinary, but
// uses the "sharehood/verifications" folder to keep ID docs
// separate from item photos for easier management.
//
// WHY A SEPARATE FOLDER?
//   1. Organization: Easy to find all verification documents
//   2. Access Control: Could apply Cloudinary folder-level
//      access restrictions in the future
//   3. Cleanup: When deleting old docs, scope is clear
// ============================================================
const uploadVerificationImage = (fileBuffer, mimetype) => {
  return new Promise((resolve, reject) => {
    const base64 = fileBuffer.toString("base64");
    const dataUri = `data:${mimetype};base64,${base64}`;

    cloudinary.uploader.upload(
      dataUri,
      {
        folder: "sharehood/verifications", // Separate folder from item images
        resource_type: "image",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
  });
};

// ============================================================
// @route   POST /api/verification/submit
// @desc    Submit identity documents for verification
// @access  Private (authenticated users only)
// ============================================================
//
// EXPECTED multipart/form-data FIELDS:
//   nationalIdNumber  (text)   — CNIC / passport number
//   idFrontImage      (file)   — front of ID card
//   idBackImage       (file)   — back of ID card (optional)
//   selfieWithId      (file)   — selfie holding the ID
//
// BUSINESS RULES:
//   1. User cannot have an ACTIVE pending request
//      (prevents flooding the admin queue)
//   2. Already verified users don't need to re-submit
//   3. All required files must be present
//   4. After submission: user.verificationStatus → "pending"
// ============================================================
const submitVerification = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  // --- RULE 1: Already verified — no need to re-submit ---
  if (req.user.verificationStatus === "verified") {
    return next(
      new ErrorResponse("You are already verified — no action needed", 400)
    );
  }

  // --- RULE 2: Already has a pending request ---
  // Prevent users from spamming submissions while under review
  const existingPending = await VerificationRequest.findOne({
    user: userId,
    status: "pending",
  });

  if (existingPending) {
    return next(
      new ErrorResponse(
        "You already have a pending verification request. Please wait for admin review.",
        400
      )
    );
  }

  // --- RULE 3: Required fields ---
  // Accepts both nationalIdNumber and nationalidNumber to tolerate casing typos
  const nationalIdNumber = req.body.nationalIdNumber || req.body.nationalidNumber;

  try {
    validateString(nationalIdNumber, "National ID Number", { required: true, maxLength: 50 });
  } catch (err) {
    return next(err);
  }

  // Check required file uploads
  // req.files is an object because we use upload.fields() in the route
  // Structure: { idFrontImage: [fileObj], selfieWithId: [fileObj], idBackImage: [fileObj] }
  if (!req.files || !req.files.idFrontImage) {
    return next(new ErrorResponse("Please upload the front of your ID card", 400));
  }

  if (!req.files.selfieWithId) {
    return next(
      new ErrorResponse("Please upload a selfie holding your ID card", 400)
    );
  }

  // --- Upload required images to Cloudinary ---
  const idFrontFile = req.files.idFrontImage[0];
  const selfieFile = req.files.selfieWithId[0];

  // Upload ID front image
  const idFrontResult = await uploadVerificationImage(
    idFrontFile.buffer,
    idFrontFile.mimetype
  );

  // Upload selfie with ID
  const selfieResult = await uploadVerificationImage(
    selfieFile.buffer,
    selfieFile.mimetype
  );

  // --- Upload optional ID back image ---
  let idBackImage = "";
  let idBackImagePublicId = "";

  if (req.files.idBackImage) {
    const idBackFile = req.files.idBackImage[0];
    const idBackResult = await uploadVerificationImage(
      idBackFile.buffer,
      idBackFile.mimetype
    );
    idBackImage = idBackResult.secure_url;
    idBackImagePublicId = idBackResult.public_id;
  }

  // --- Create the verification request in the database ---
  const verificationRequest = await VerificationRequest.create({
    user: userId,
    nationalIdNumber,
    idFrontImage: idFrontResult.secure_url,
    idFrontImagePublicId: idFrontResult.public_id,
    idBackImage,
    idBackImagePublicId,
    selfieWithId: selfieResult.secure_url,
    selfieWithIdPublicId: selfieResult.public_id,
    status: "pending",
  });

  // --- Update user's verificationStatus to "pending" ---
  // This is what the verificationMiddleware reads.
  // The user's token still works — they just can't list/borrow yet.
  await User.findByIdAndUpdate(userId, { verificationStatus: "pending" });

  // 🔔 NOTIFICATION: Notify all admins that new documents need review
  await notifyAdmins({
    sender: userId,
    type: "new_verification",
    title: "New Verification Submission",
    message: `${req.user.name} submitted identity verification documents for review.`,
  });

  // --- Return SAFE response (no document URLs, no national ID) ---
  // We never return the actual document URLs or national ID number
  // to the user. They only need to know the submission succeeded.
  res.status(201).json({
    success: true,
    message:
      "Verification submitted successfully — an admin will review your documents shortly",
    data: {
      requestId: verificationRequest._id,
      status: verificationRequest.status,
      submittedAt: verificationRequest.createdAt,
    },
  });
});

// ============================================================
// @route   GET /api/verification/status
// @desc    Get the logged-in user's verification status
// @access  Private
// ============================================================
//
// WHAT IT RETURNS:
//   - verificationStatus from the User model
//   - The most recent VerificationRequest (status + rejection reason)
//
// WHAT IT DOES NOT RETURN:
//   - National ID number
//   - Document image URLs (security)
//   - Other users' data
// ============================================================
const getMyVerificationStatus = asyncHandler(async (req, res, next) => {
  // Find the most recent verification request for this user
  const latestRequest = await VerificationRequest.findOne({
    user: req.user._id,
  })
    .sort({ createdAt: -1 })
    .select("status rejectionReason createdAt updatedAt"); // Only safe fields

  res.status(200).json({
    success: true,
    data: {
      verificationStatus: req.user.verificationStatus,
      latestRequest: latestRequest || null,
    },
  });
});

module.exports = {
  submitVerification,
  getMyVerificationStatus,
};
