// ============================================================
// config/cloudinary.js — Cloudinary Configuration
// ============================================================
// WHY CLOUDINARY INSTEAD OF STORING FILES ON OUR SERVER?
//
//   1. Scalability: Our server has limited disk space. Cloudinary
//      has unlimited cloud storage.
//   2. Performance: Cloudinary serves images via a global CDN
//      (Content Delivery Network), so users get images fast.
//   3. Transformations: Cloudinary can resize, crop, and optimize
//      images automatically via URL parameters.
//   4. Safety: If our server crashes, uploaded files are safe
//      on Cloudinary's cloud.
//
// HOW IT WORKS:
//   1. User uploads an image file to our Express server
//   2. Multer temporarily stores the file in memory (buffer)
//   3. We upload the buffer to Cloudinary's cloud
//   4. Cloudinary returns a URL (like https://res.cloudinary.com/...)
//   5. We save that URL string in MongoDB (NOT the actual file)
//   6. We delete the temp file from memory
//
// This way, MongoDB only stores a small URL string, not megabytes
// of image data.
// ============================================================

const cloudinary = require("cloudinary").v2;

// Configure Cloudinary with your account credentials
// These values come from your Cloudinary dashboard
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
