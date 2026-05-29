// ============================================================
// middleware/rateLimitMiddleware.js — API Rate Limiting
// ============================================================
//
// WHAT IS RATE LIMITING?
//   Rate limiting restricts how many requests a single IP address
//   can make to a specific endpoint within a time window.
//   Without it, bad actors can:
//     - Spam the appeal endpoint with fake appeals
//     - Try to enumerate suspended users by email
//     - Overload the server with repeated requests (DoS)
//
// HOW express-rate-limit WORKS:
//   It tracks requests per IP address in memory (or a store
//   like Redis for multi-server setups). If the limit is hit,
//   it returns a 429 Too Many Requests response automatically.
//
// WHY DIFFERENT LIMITS FOR DIFFERENT ROUTES?
//   Login needs strict limiting (brute-force password attacks).
//   Appeals need moderate limiting (prevent spam submissions).
//   General API routes need loose limiting (normal usage).
//
// PRODUCTION NOTE:
//   In production with multiple server instances (load balancer),
//   switch from the default in-memory store to Redis:
//   const RedisStore = require("rate-limit-redis");
//   This ensures limits are shared across all instances.
// ============================================================

const rateLimit = require("express-rate-limit");

// ============================================================
// Appeal Rate Limiter
// ============================================================
// Rule: Max 5 appeal submissions per IP per hour.
//
// WHY 5 PER HOUR?
//   A legitimate suspended user needs at most 1-2 attempts.
//   5 gives a buffer for form retries while blocking spam bots
//   that might submit hundreds of appeals per minute.
//
// windowMs: 60 minutes × 60 seconds × 1000 ms = 3,600,000 ms
// ============================================================
const appealRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5,                   // max 5 requests per IP per window
  message: {
    success: false,
    message:
      "Too many appeal submissions from this IP. Please wait 1 hour before trying again.",
  },
  standardHeaders: true,  // Return RateLimit headers in response
  legacyHeaders: false,   // Disable X-RateLimit-* headers (deprecated)

  // Custom handler — gives a consistent JSON error format
  // matching the rest of the API's error responses
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message:
        "Too many appeal submissions from this IP. Please wait 1 hour before trying again.",
    });
  },
});

// ============================================================
// Login Rate Limiter
// ============================================================
// Rule: Max 10 login attempts per IP per 15 minutes.
// Prevents brute-force password attacks.
// ============================================================
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,  // Raised from 10 — allows normal usage while still blocking brute-force
  message: {
    success: false,
    message:
      "Too many login attempts from this IP. Please wait 15 minutes before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message:
        "Too many login attempts from this IP. Please wait 15 minutes before trying again.",
    });
  },
});

// ============================================================
// Report Rate Limiter
// ============================================================
// Rule: Max 5 reports per IP per hour.
const reportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many reports from this IP. Please wait 1 hour before submitting another.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many reports from this IP. Please wait 1 hour before submitting another.",
    });
  },
});

// ============================================================
// Partner Application Rate Limiter
// ============================================================
// Rule: Max 3 applications per IP per 24 hours.
const partnerRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Too many partner applications from this IP. Please wait 24 hours.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many partner applications from this IP. Please wait 24 hours.",
    });
  },
});

module.exports = { appealRateLimiter, loginRateLimiter, reportRateLimiter, partnerRateLimiter };
