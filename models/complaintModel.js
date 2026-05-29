const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Complaint must be submitted by an owner"],
    },
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Complaint must reference a borrower"],
    },
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: [true, "Complaint must reference an item"],
    },
    agreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agreement",
      required: [true, "Complaint must reference an agreement"],
    },
    proofImage: {
      type: String,
      default: "",
    },
    proofImagePublicId: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      required: [true, "Please provide a detailed complaint message"],
      trim: true,
      maxlength: [2000, "Message cannot exceed 2000 characters"],
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "under_review", "resolved", "rejected"],
        message: "Status must be: pending, under_review, resolved, or rejected",
      },
      default: "pending",
    },
    adminResolution: {
      type: String,
      trim: true,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
complaintSchema.index({ owner: 1, createdAt: -1 });
complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ createdAt: -1 });

const Complaint = mongoose.model("Complaint", complaintSchema);

module.exports = Complaint;
