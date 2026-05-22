// ============================================================
// utils/errorResponse.js — Custom Error Class
// ============================================================
// JavaScript's built-in Error class only has a "message" field.
// We extend it to also carry an HTTP "statusCode" (like 400, 401, 404).
//
// WHY? So we can throw a single object that carries both:
//   - What went wrong (message)
//   - What HTTP status to send back (statusCode)
//
// Usage in controllers:
//   throw new ErrorResponse("Email already exists", 400);
//
// The global errorMiddleware will catch it and send:
//   { success: false, error: "Email already exists" }  [HTTP 400]
// ============================================================

class ErrorResponse extends Error {
  constructor(message, statusCode) {
    super(message); // Calls the parent Error constructor with the message
    this.statusCode = statusCode;
  }
}

module.exports = ErrorResponse;
