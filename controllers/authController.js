// ============================================================
// controllers/authController.js — Auth Business Logic
// ============================================================
// REGISTER → hash password → save to DB → send JWT cookie
// LOGIN    → find user → compare password → send JWT cookie
// GET ME   → read req.user (set by protect middleware)
// LOGOUT   → clear the JWT cookie from the browser
// ============================================================

const User = require("../models/userModel");
const { sendTokenResponse } = require("../utils/generateToken");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");

// ============================================================
// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
// ============================================================
const registerUser = asyncHandler(async (req, res, next) => {
  const { name, email, password } = req.body;

  // Validate required fields
  if (!name || !email || !password) {
    return next(new ErrorResponse("Please provide name, email and password", 400));
  }

  // Check if email is already taken
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse("An account with this email already exists", 400));
  }

  // Create user (password is auto-hashed by pre-save hook)
  const user = await User.create({ name, email, password });

  // Send JWT in HttpOnly cookie + JSON response
  sendTokenResponse(user, 201, res);
});

// ============================================================
// @route   POST /api/auth/login
// @desc    Login with email and password
// @access  Public
// ============================================================
const loginUser = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorResponse("Please provide email and password", 400));
  }

  // Include password field (hidden by default via select: false)
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    return next(new ErrorResponse("Invalid email or password", 401));
  }

  // Compare entered password with stored bcrypt hash
  const isPasswordMatch = await user.comparePassword(password);

  if (!isPasswordMatch) {
    return next(new ErrorResponse("Invalid email or password", 401));
  }

  // Send JWT in HttpOnly cookie + JSON response
  sendTokenResponse(user, 200, res);
});

// ============================================================
// @route   GET /api/auth/me
// @desc    Get the currently logged-in user's profile
// @access  Private
// ============================================================
const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    success: true,
    user,
  });
});

// ============================================================
// @route   POST /api/auth/logout
// @desc    Logout — clear the JWT cookie
// @access  Private
// ============================================================
const logoutUser = asyncHandler(async (req, res, next) => {
  // Overwrite the cookie with an empty value and expire it immediately
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

module.exports = { registerUser, loginUser, getMe, logoutUser };

