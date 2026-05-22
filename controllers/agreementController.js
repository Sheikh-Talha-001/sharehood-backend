// ============================================================
// controllers/agreementController.js — Agreement Business Logic
// ============================================================
//
// WHAT THIS CONTROLLER DOES:
//   Handles all agreement-related operations that users can
//   trigger directly through API endpoints:
//     - View a specific agreement
//     - List all agreements (as borrower or owner)
//     - Download the PDF copy of an agreement
//
// WHAT THIS CONTROLLER DOES NOT DO:
//   - Create agreements (done automatically in borrowRequestController)
//   - Complete agreements (done automatically when marking returned)
//   These are triggered by the borrow request workflow, not by
//   direct user API calls. This is "workflow automation."
//
// SECURITY MODEL:
//   Only agreement PARTICIPANTS (borrower or owner) can view or
//   download an agreement. Random users cannot access other
//   people's agreements — that would be a privacy violation.
//
// WHY SEPARATE FROM BORROW REQUEST CONTROLLER?
//   Separation of concerns:
//     - borrowRequestController manages the request lifecycle
//     - agreementController manages agreement viewing/downloading
//   Each controller has a clear, focused responsibility.
// ============================================================

const Agreement = require("../models/agreementModel");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const path = require("path");
const fs = require("fs");

// ============================================================
// POPULATE OPTIONS — Reusable configuration for .populate()
// ============================================================
// Agreements have 4 references to populate:
//   - request  → the borrow request details
//   - item     → item title, image, condition
//   - borrower → name, email
//   - owner    → name, email
// ============================================================
const POPULATE_OPTIONS = [
  { path: "request", select: "message status startDate expectedReturnDate" },
  { path: "item", select: "title image condition" },
  { path: "borrower", select: "name email" },
  { path: "owner", select: "name email" },
];

// ============================================================
// @route   GET /api/agreements/:id
// @desc    Get a specific agreement by its ID
// @access  Private (only borrower or owner can view)
// ============================================================
//
// SECURITY CHECK:
//   We compare the logged-in user's ID against both the borrower
//   AND the owner on the agreement. If the user is neither, they
//   get a 403 Forbidden response.
//
// WHY NOT JUST CHECK ONE?
//   Both parties need access to the agreement:
//     - Borrower wants to see what they agreed to
//     - Owner wants to verify the terms and track status
// ============================================================
const getAgreementById = asyncHandler(async (req, res, next) => {
  const agreement = await Agreement.findById(req.params.id)
    .populate(POPULATE_OPTIONS);

  if (!agreement) {
    return next(new ErrorResponse("Agreement not found", 404));
  }

  // --- PARTICIPANT CHECK: Only borrower or owner can view ---
  const userId = req.user._id.toString();
  const isParticipant =
    agreement.borrower._id.toString() === userId ||
    agreement.owner._id.toString() === userId;

  if (!isParticipant) {
    return next(
      new ErrorResponse("You are not authorized to view this agreement", 403)
    );
  }

  res.status(200).json({
    success: true,
    data: agreement,
  });
});

// ============================================================
// @route   GET /api/agreements
// @desc    Get all agreements where the user is borrower OR owner
// @access  Private
// ============================================================
//
// USE CASE: "Show me all my agreements"
//   This returns agreements where the logged-in user is either
//   the borrower or the owner. Both roles see their agreements
//   in one convenient list.
//
// WHY USE $or?
//   MongoDB's $or operator lets us match documents where EITHER
//   condition is true:
//     { borrower: userId } OR { owner: userId }
//   This is more efficient than making two separate queries
//   and merging the results in JavaScript.
//
// SORT: Most recent agreements first (newest at the top)
// ============================================================
const getMyAgreements = asyncHandler(async (req, res, next) => {
  const agreements = await Agreement.find({
    $or: [
      { borrower: req.user._id },
      { owner: req.user._id },
    ],
  })
    .populate(POPULATE_OPTIONS)
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: agreements.length,
    data: agreements,
  });
});

// ============================================================
// @route   GET /api/agreements/:id/download
// @desc    Download the PDF file for a specific agreement
// @access  Private (only borrower or owner can download)
// ============================================================
//
// HOW FILE DOWNLOAD WORKS:
//   1. Find the agreement in the database
//   2. Check if the user is a participant (security)
//   3. Check if the PDF file exists on disk
//   4. Use res.download() to send the file to the client
//
// res.download() DOES THREE THINGS:
//   1. Sets the Content-Disposition header to "attachment"
//      → This tells the browser to download, not display
//   2. Sets the Content-Type header based on the file extension
//      → For PDFs: "application/pdf"
//   3. Streams the file to the client
//      → Efficient for large files (doesn't load entire file into RAM)
//
// WHY CHECK FILE EXISTS?
//   The database might have a pdfPath, but the actual file could
//   be missing (deleted manually, disk error, etc.). We check
//   before attempting to send to avoid a cryptic error.
// ============================================================
const downloadAgreementPDF = asyncHandler(async (req, res, next) => {
  const agreement = await Agreement.findById(req.params.id);

  if (!agreement) {
    return next(new ErrorResponse("Agreement not found", 404));
  }

  // --- PARTICIPANT CHECK ---
  const userId = req.user._id.toString();
  const isParticipant =
    agreement.borrower.toString() === userId ||
    agreement.owner.toString() === userId;

  if (!isParticipant) {
    return next(
      new ErrorResponse("You are not authorized to download this agreement", 403)
    );
  }

  // --- Check if PDF path exists in the database ---
  if (!agreement.pdfPath) {
    return next(new ErrorResponse("PDF has not been generated for this agreement", 404));
  }

  // --- Build the absolute path to the PDF file ---
  const absolutePath = path.join(__dirname, "..", agreement.pdfPath);

  // --- Check if the actual file exists on disk ---
  if (!fs.existsSync(absolutePath)) {
    return next(new ErrorResponse("PDF file not found on server", 404));
  }

  // --- Send the file as a download ---
  // The second argument is the filename the browser will use when saving
  res.download(absolutePath, `${agreement.agreementNumber}.pdf`, (err) => {
    if (err) {
      // If something goes wrong during file transfer
      return next(new ErrorResponse("Error downloading PDF file", 500));
    }
  });
});

module.exports = {
  getAgreementById,
  getMyAgreements,
  downloadAgreementPDF,
};
