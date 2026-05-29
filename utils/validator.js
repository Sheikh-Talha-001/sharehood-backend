// utils/validator.js — API Validation Utility
const mongoose = require("mongoose");
const ErrorResponse = require("./errorResponse");

/**
 * Validates a MongoDB ObjectId.
 * Throws a 400 ErrorResponse if invalid.
 */
const validateObjectId = (id, fieldName = "ID") => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ErrorResponse(`Invalid ${fieldName} format`, 400);
  }
};

/**
 * Validates required text fields, prevents empty strings and oversized inputs.
 * Throws a 400 ErrorResponse if invalid.
 */
const validateString = (value, fieldName, options = {}) => {
  const { required = true, maxLength = 1000 } = options;

  if (required && (!value || typeof value !== "string" || value.trim() === "")) {
    throw new ErrorResponse(`${fieldName} is required and cannot be empty`, 400);
  }

  if (value && typeof value === "string" && value.length > maxLength) {
    throw new ErrorResponse(`${fieldName} cannot exceed ${maxLength} characters`, 400);
  }
};

/**
 * Validates an array of ObjectIds.
 */
const validateObjectIdArray = (ids, fieldName = "IDs") => {
  if (!Array.isArray(ids)) {
    throw new ErrorResponse(`${fieldName} must be an array`, 400);
  }
  for (const id of ids) {
    validateObjectId(id, fieldName);
  }
};

module.exports = { validateObjectId, validateString, validateObjectIdArray };
