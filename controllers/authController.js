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
const { validateString } = require("../utils/validator");

// ============================================================
// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
// ============================================================
const registerUser = asyncHandler(async (req, res, next) => {
  const { name, email, password } = req.body;

  // Validate required fields and lengths
  try {
    validateString(name, "Name", { required: true, maxLength: 50 });
    validateString(email, "Email", { required: true, maxLength: 100 });
    validateString(password, "Password", { required: true, maxLength: 128 });
  } catch (err) {
    return next(err);
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

  try {
    validateString(email, "Email", { required: true, maxLength: 100 });
    validateString(password, "Password", { required: true, maxLength: 128 });
  } catch (err) {
    return next(err);
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
  let token = req.cookies?.token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ErrorResponse("Not authorized - Please log in", 401));
  }

  try {
    const decoded = require("jsonwebtoken").verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    return next(new ErrorResponse("Not authorized", 401));
  }
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
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

module.exports = { registerUser, loginUser, getMe, logoutUser };

