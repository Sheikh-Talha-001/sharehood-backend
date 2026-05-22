// ============================================================
// middleware/uploadMiddleware.js — Multer File Upload Config
// ============================================================
// WHAT IS MULTER?
//   When a user submits a form with a file (like an image),
//   the browser sends it as "multipart/form-data" — a special
//   encoding that mixes text fields and binary file data.
//
//   Express's built-in json() and urlencoded() parsers CANNOT
//   handle file uploads. Multer is a middleware that can.
//
// HOW MULTER WORKS:
//   1. Client sends a POST request with Content-Type: multipart/form-data
//   2. Multer intercepts the request
//   3. Multer extracts the file and puts it in req.file
//   4. Multer extracts text fields and puts them in req.body
//   5. Your route handler can now access both
//
// STORAGE STRATEGY:
//   We use memoryStorage() — the file is kept in RAM as a Buffer
//   (req.file.buffer). We then upload this buffer directly to
//   Cloudinary, so no temp files are written to our server's disk.
// ============================================================

const multer = require("multer");
const ErrorResponse = require("../utils/errorResponse");

// --- Storage: Keep files in memory (RAM) as a Buffer ---
const storage = multer.memoryStorage();

// --- File Filter: Only allow image types ---
// This function runs for every file. If it returns false, the
// file is rejected and never reaches your route handler.
const fileFilter = (req, file, cb) => {
  // List of allowed MIME types
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

  if (allowedTypes.includes(file.mimetype)) {
    // Accept the file
    cb(null, true);
  } else {
    // Reject the file with a clear error message
    cb(new ErrorResponse("Only JPG, JPEG, PNG, and WEBP images are allowed", 400), false);
  }
};

// --- Create the Multer instance ---
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size (5 × 1024KB × 1024B)
  },
});

module.exports = upload;
