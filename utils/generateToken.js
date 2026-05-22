// ============================================================
// utils/generateToken.js — JWT Token Generator + HttpOnly Cookie
// ============================================================
// WHY HttpOnly COOKIES?
//   localStorage: JavaScript can read it → XSS attack can steal token
//   HttpOnly cookie: Browser stores it but JS CANNOT read it → safe
//
// COOKIE OPTIONS:
//   httpOnly: true     → JS can't access (prevents XSS theft)
//   secure: true       → Only sent over HTTPS (production)
//   sameSite: "strict" → Not sent on cross-site requests (prevents CSRF)
//   maxAge: 7 days     → Auto-expires (matches JWT expiry)
// ============================================================

const jwt = require("jsonwebtoken");

// Generate JWT token string
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

// Send token in HttpOnly cookie + JSON response
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user._id);

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  };

  res.cookie("token", token, cookieOptions);

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    },
  });
};

module.exports = { generateToken, sendTokenResponse };
