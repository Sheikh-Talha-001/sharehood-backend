// ============================================================
// controllers/userController.js — Profile Management & Public Profiles
// ============================================================
//
// SEPARATION OF CONCERNS:
//   - authController.js: Handles login, registration, and JWTs.
//   - userController.js: Handles profile updates, avatars, and 
//     public-facing user pages.
//
// PROFILE MANAGEMENT ARCHITECTURE:
//   Security is paramount when updating profiles. We MUST enforce
//   a strict boundary between self-editable fields and system-managed fields.
//   
//   If a user sends: 
//     { name: "Ali", role: "admin", canListItems: true }
//   We must ONLY update "name". We achieve this by whitelisting 
//   allowed fields and explicitly ignoring the rest.
//
// PUBLIC PROFILES:
//   Lendly needs public profiles so users can see who they are
//   borrowing from or lending to. However, we cannot expose sensitive
//   data like emails or phone numbers. The getPublicProfile endpoint
//   strips all sensitive data and only returns safe, community-building
//   fields (name, avatar, bio, verification status, listing count).
//
// CLOUDINARY AVATARS:
//   Avatar uploads use the same pattern as item images:
//     1. Multer receives file in memory
//     2. Convert buffer to data URI
//     3. Upload to Cloudinary (in "lendly/avatars" folder)
//     4. Save URL and public_id to MongoDB
//     5. Delete old avatar from Cloudinary (if replacing) to save space.
// ============================================================

const User = require("../models/userModel");
const Item = require("../models/itemModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const cloudinary = require("../config/cloudinary");
const bcrypt = require("bcryptjs");

// ============================================================
// Helper: Upload avatar buffer to Cloudinary
// ============================================================
const uploadAvatarToCloudinary = (fileBuffer, mimetype) => {
  return new Promise((resolve, reject) => {
    const base64 = fileBuffer.toString("base64");
    const dataUri = `data:${mimetype};base64,${base64}`;

    cloudinary.uploader.upload(
      dataUri,
      {
        folder: "lendly/avatars", // Dedicated folder for avatars
        resource_type: "image",
        // Optional: Crop and compress avatars automatically
        transformation: [
          { width: 400, height: 400, crop: "fill", gravity: "face" },
          { quality: "auto", fetch_format: "auto" }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
  });
};

// ============================================================
// @route   GET /api/users/profile
// @desc    Get logged-in user's complete profile
// @access  Private
// ============================================================
// This returns the FULL profile (including email, phone, etc.)
// because it is the user requesting their own data.
// ============================================================
const getProfile = asyncHandler(async (req, res, next) => {
  // req.user is set by the protect middleware
  const user = await User.findById(req.user._id).select("-password -__v");

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// ============================================================
// @route   PUT /api/users/profile
// @desc    Update user profile information
// @access  Private
// ============================================================
// STRICT WHITELISTING:
// We explicitly extract ONLY the safe fields. This prevents
// "Mass Assignment" vulnerabilities where a user injects
// { role: "admin" } into the request body.
// ============================================================
const updateProfile = asyncHandler(async (req, res, next) => {
  // 1. Extract ONLY safe, self-editable fields
  const { name, phoneNumber, bio, neighborhood } = req.body;

  // 2. Build update object (only include provided fields)
  const updateData = {};
  if (name) updateData.name = name;
  if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
  if (bio !== undefined) updateData.bio = bio;
  if (neighborhood !== undefined) updateData.neighborhood = neighborhood;

  // 3. Update the user
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    {
      new: true, // Return the updated document
      runValidators: true, // Run Mongoose validations (e.g., max length)
    }
  ).select("-password -__v");

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: updatedUser,
  });
});

// ============================================================
// @route   PUT /api/users/change-password
// @desc    Change user password
// @access  Private
// ============================================================
// SECURITY REQUIREMENTS:
//   1. Must provide CURRENT password to prove identity (prevents 
//      account takeover if user left their laptop open).
//   2. Must provide a valid new password.
//   3. User model's pre("save") hook handles the bcrypt hashing.
// ============================================================
const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(
      new ErrorResponse("Please provide both current and new passwords", 400)
    );
  }

  // 1. Fetch user explicitly with password field included
  const user = await User.findById(req.user._id).select("+password");

  // 2. Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return next(new ErrorResponse("Incorrect current password", 401));
  }

  // 3. Update to new password
  // (The schema's pre-save hook will hash it automatically)
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Password changed successfully",
  });
});

// ============================================================
// @route   PUT /api/users/avatar
// @desc    Upload or update profile avatar
// @access  Private
// ============================================================
// CLOUD CLEANUP:
// If the user already has an avatar, we DELETE the old one from
// Cloudinary before saving the new one. This prevents orphan files
// from consuming our Cloudinary storage quota.
// ============================================================
const uploadAvatar = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse("Please upload an image file", 400));
  }

  const user = await User.findById(req.user._id);

  // 1. If user already has an avatar, delete it from Cloudinary
  if (user.avatarPublicId) {
    try {
      await cloudinary.uploader.destroy(user.avatarPublicId);
    } catch (error) {
      console.error("[Cloudinary] Failed to delete old avatar:", error.message);
      // We don't block the request if delete fails, just log it.
    }
  }

  // 2. Upload new avatar
  const result = await uploadAvatarToCloudinary(req.file.buffer, req.file.mimetype);

  // 3. Save new URLs to user
  user.avatar = result.secure_url;
  user.avatarPublicId = result.public_id;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Avatar updated successfully",
    data: {
      avatar: user.avatar,
    },
  });
});

// ============================================================
// @route   GET /api/users/:id/public
// @desc    Get public profile of a user
// @access  Public
// ============================================================
// WHAT MAKES IT PUBLIC?
//   We strictly select ONLY non-sensitive fields.
//   We EXCLUDE: email, password, phoneNumber, isSuspended,
//   suspensionReason, role, __v.
//
// ADDED VALUE:
//   We also count how many active listings the user has, which
//   helps build trust (e.g., "This user is an active lender with
//   15 items").
// ============================================================
const getPublicProfile = asyncHandler(async (req, res, next) => {
  // 1. Fetch user with strictly limited fields
  const user = await User.findById(req.params.id)
    .select("name bio neighborhood avatar verificationStatus partnerStatus createdAt");

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  // 2. Count active listings (not removed by admin)
  const listingCount = await Item.countDocuments({
    owner: user._id,
    isRemovedByAdmin: false,
  });

  // Fetch actual active listings for the profile
  const listedItems = await Item.find({
    owner: user._id,
    isRemovedByAdmin: false,
  });

  // 3. Construct clean public response
  res.status(200).json({
    success: true,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        avatar: user.avatar,
        bio: user.bio,
        neighborhood: user.neighborhood,
        verificationStatus: user.verificationStatus,
        partnerStatus: user.partnerStatus,
        createdAt: user.createdAt,
      },
      stats: {
        activeListings: listingCount,
      },
      listedItems: listedItems,
    },
  });
});

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar,
  getPublicProfile,
};
