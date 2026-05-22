// middleware/authMiddleware.js — JWT Protection + Cookie Support
const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const User = require("../models/userModel");

// protect — Verifies JWT and attaches user to req.user
// SUSPENSION ENFORCEMENT:
//   After finding the user, we check if they are suspended.
//   This is the SINGLE ENFORCEMENT POINT — every protected
//   route automatically blocks suspended users because they
//   all run through this middleware first.
//   We don't need suspension checks in individual controllers.
const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check cookie first, then Authorization header
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ErrorResponse("Not authorized - Please log in", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // --- SUSPENSION CHECK ---
    // Blocked before ANY controller logic runs.
    // The user's token is still "valid" (not expired), but
    // the account has been suspended by an admin.
    if (req.user.isSuspended) {
      return next(
        new ErrorResponse(
          "Your account has been suspended. Please contact support for assistance.",
          403
        )
      );
    }

    next();
  } catch (err) {
    // Forward JWT errors to the central error handler
    return next(err);
  }
});

// authorize — Role-based access control
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `Role "${req.user.role}" is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};

module.exports = { protect, authorize };
