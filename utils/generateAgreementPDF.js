// ============================================================
// utils/generateAgreementPDF.js — PDF Agreement Generator
// ============================================================
//
// WHAT THIS DOES:
//   Generates a professional-looking PDF document that serves as
//   a digital agreement between the borrower and the item owner.
//   The PDF is saved to the server's file system and its path is
//   stored in the database.
//
// HOW PDFKit WORKS:
//   PDFKit is a Node.js library that creates PDF files in memory.
//   Think of it like a virtual printer:
//     1. Create a new "document" (blank page)
//     2. Add text, lines, shapes at specific X,Y positions
//     3. "Pipe" (stream) the document to a file on disk
//     4. Call doc.end() to finish writing
//
//   The coordinate system starts at top-left (0,0):
//     X increases going RIGHT →
//     Y increases going DOWN  ↓
//
// WHY GENERATE PDFs?
//   1. Professional: A PDF looks official and trustworthy
//   2. Portable: Users can download and keep a copy
//   3. Legal: Acts as a record if disputes arise
//   4. Offline: Available even without internet access
//
// FILE STORAGE:
//   PDFs are saved to: uploads/agreements/{agreementNumber}.pdf
//   The directory is auto-created if it doesn't exist.
// ============================================================

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// ============================================================
// generateAgreementPDF — Creates and saves a PDF agreement
// ============================================================
// PARAMETERS:
//   agreementData — An object containing all the info to put in
//   the PDF. Expected shape:
//     {
//       agreementNumber, borrowerName, borrowerEmail,
//       ownerName, ownerEmail, itemTitle, itemCondition,
//       borrowDate, expectedReturnDate, agreementStatus
//     }
//
// RETURNS:
//   The relative file path where the PDF was saved
//   e.g., "uploads/agreements/SH-AGR-1747062600000-A3F2.pdf"
//
// ERROR HANDLING:
//   If the PDF generation fails (disk full, permissions, etc.),
//   the Promise rejects and the error bubbles up to the controller,
//   which passes it to the centralized error handler.
// ============================================================
const generateAgreementPDF = (agreementData) => {
  return new Promise((resolve, reject) => {
    try {
      // --- 1. Ensure the output directory exists ---
      // path.join() creates OS-appropriate paths (/ on Mac, \ on Windows)
      // { recursive: true } means "create parent directories too if needed"
      const outputDir = path.join(__dirname, "..", "uploads", "agreements");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // --- 2. Define the output file path ---
      const fileName = `${agreementData.agreementNumber}.pdf`;
      const filePath = path.join(outputDir, fileName);

      // The relative path stored in the database (for serving later)
      const relativePath = `uploads/agreements/${fileName}`;

      // --- 3. Create a new PDF document ---
      // PDFKit defaults: Letter size (612 x 792 points), 72pt margins
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
      });

      // --- 4. Pipe the PDF to a file on disk ---
      // A "write stream" is like opening a file for writing.
      // Everything we add to `doc` gets streamed into this file.
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // ============================================================
      // PDF CONTENT — Building the agreement document
      // ============================================================

      // --- HEADER: ShareHood branding ---
      doc
        .fontSize(28)
        .font("Helvetica-Bold")
        .fillColor("#2563EB") // Blue brand color
        .text("ShareHood", { align: "center" });

      doc
        .fontSize(14)
        .font("Helvetica")
        .fillColor("#64748B") // Subtle gray
        .text("Digital Borrowing Agreement", { align: "center" });

      // --- Decorative line under the header ---
      doc.moveDown(0.5);
      doc
        .moveTo(60, doc.y)
        .lineTo(535, doc.y)
        .strokeColor("#2563EB")
        .lineWidth(2)
        .stroke();

      doc.moveDown(1);

      // --- AGREEMENT NUMBER ---
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor("#1E293B")
        .text("Agreement Number: ", { continued: true })
        .font("Helvetica")
        .fillColor("#2563EB")
        .text(agreementData.agreementNumber);

      // --- GENERATED DATE ---
      doc
        .font("Helvetica-Bold")
        .fillColor("#1E293B")
        .text("Date Generated: ", { continued: true })
        .font("Helvetica")
        .fillColor("#374151")
        .text(new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }));

      // --- STATUS ---
      doc
        .font("Helvetica-Bold")
        .fillColor("#1E293B")
        .text("Status: ", { continued: true })
        .font("Helvetica")
        .fillColor(agreementData.agreementStatus === "active" ? "#16A34A" : "#374151")
        .text(agreementData.agreementStatus.toUpperCase());

      doc.moveDown(1);

      // ============================================================
      // SECTION: Item Details
      // ============================================================
      doc
        .moveTo(60, doc.y)
        .lineTo(535, doc.y)
        .strokeColor("#E2E8F0")
        .lineWidth(1)
        .stroke();

      doc.moveDown(0.5);
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#1E293B")
        .text("Item Details");

      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica").fillColor("#374151");

      doc
        .font("Helvetica-Bold")
        .text("Item: ", { continued: true })
        .font("Helvetica")
        .text(agreementData.itemTitle);

      doc
        .font("Helvetica-Bold")
        .text("Condition at Handover: ", { continued: true })
        .font("Helvetica")
        .text(agreementData.itemCondition || "Not specified");

      doc.moveDown(1);

      // ============================================================
      // SECTION: Owner Information
      // ============================================================
      doc
        .moveTo(60, doc.y)
        .lineTo(535, doc.y)
        .strokeColor("#E2E8F0")
        .lineWidth(1)
        .stroke();

      doc.moveDown(0.5);
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#1E293B")
        .text("Owner (Lender)");

      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica").fillColor("#374151");

      doc
        .font("Helvetica-Bold")
        .text("Name: ", { continued: true })
        .font("Helvetica")
        .text(agreementData.ownerName);

      doc
        .font("Helvetica-Bold")
        .text("Email: ", { continued: true })
        .font("Helvetica")
        .text(agreementData.ownerEmail);

      doc.moveDown(1);

      // ============================================================
      // SECTION: Borrower Information
      // ============================================================
      doc
        .moveTo(60, doc.y)
        .lineTo(535, doc.y)
        .strokeColor("#E2E8F0")
        .lineWidth(1)
        .stroke();

      doc.moveDown(0.5);
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#1E293B")
        .text("Borrower");

      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica").fillColor("#374151");

      doc
        .font("Helvetica-Bold")
        .text("Name: ", { continued: true })
        .font("Helvetica")
        .text(agreementData.borrowerName);

      doc
        .font("Helvetica-Bold")
        .text("Email: ", { continued: true })
        .font("Helvetica")
        .text(agreementData.borrowerEmail);

      doc.moveDown(1);

      // ============================================================
      // SECTION: Borrowing Period
      // ============================================================
      doc
        .moveTo(60, doc.y)
        .lineTo(535, doc.y)
        .strokeColor("#E2E8F0")
        .lineWidth(1)
        .stroke();

      doc.moveDown(0.5);
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#1E293B")
        .text("Borrowing Period");

      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica").fillColor("#374151");

      // Format dates to be human-readable
      const formatDate = (date) => {
        if (!date) return "N/A";
        return new Date(date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      };

      doc
        .font("Helvetica-Bold")
        .text("Borrow Date: ", { continued: true })
        .font("Helvetica")
        .text(formatDate(agreementData.borrowDate));

      doc
        .font("Helvetica-Bold")
        .text("Expected Return Date: ", { continued: true })
        .font("Helvetica")
        .text(formatDate(agreementData.expectedReturnDate));

      doc.moveDown(1.5);

      // ============================================================
      // SECTION: Terms & Conditions
      // ============================================================
      doc
        .moveTo(60, doc.y)
        .lineTo(535, doc.y)
        .strokeColor("#E2E8F0")
        .lineWidth(1)
        .stroke();

      doc.moveDown(0.5);
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#1E293B")
        .text("Terms & Conditions");

      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica").fillColor("#64748B");

      const terms = [
        "1. The borrower agrees to return the item in the same condition as received.",
        "2. The borrower is responsible for any damage that occurs during the borrowing period.",
        "3. The item must be returned by the expected return date unless an extension is agreed upon.",
        "4. The owner reserves the right to request early return of the item.",
        "5. Both parties agree to communicate any issues promptly through the ShareHood platform.",
        "6. This agreement is generated automatically and serves as a record of the transaction.",
      ];

      terms.forEach((term) => {
        doc.text(term, { lineGap: 4 });
      });

      doc.moveDown(1.5);

      // ============================================================
      // FOOTER
      // ============================================================
      doc
        .moveTo(60, doc.y)
        .lineTo(535, doc.y)
        .strokeColor("#2563EB")
        .lineWidth(2)
        .stroke();

      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#94A3B8")
        .text(
          "This is an automatically generated digital agreement by ShareHood. " +
          "It serves as a record of the borrowing transaction between the parties listed above.",
          { align: "center" }
        );

      doc
        .fontSize(9)
        .text(
          `Generated on ${new Date().toLocaleString()}`,
          { align: "center" }
        );

      // --- 5. Finalize the PDF ---
      doc.end();

      // --- 6. Wait for the file to finish writing ---
      // The "finish" event fires when all data has been flushed to disk.
      // Only then do we resolve the Promise with the file path.
      writeStream.on("finish", () => {
        resolve(relativePath);
      });

      // If something goes wrong while writing to disk
      writeStream.on("error", (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = generateAgreementPDF;
