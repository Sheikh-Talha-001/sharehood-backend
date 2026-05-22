// ============================================================
// models/itemModel.js — Item Database Schema
// ============================================================
//
// RELATIONSHIP (ObjectId Reference):
//   The "owner" field stores a User's _id. This creates a link
//   between the items and users collections:
//     items.owner → users._id
//
//   Using .populate("owner", "name email") replaces the raw _id
//   with the actual user data when we query items.
//
// STANDARDIZED CATEGORIES:
//   To keep the marketplace consistent and filterable, we enforce
//   a fixed set of category values. This prevents variations like
//   "tool", "Tool", "TOOLS", "hand tools" from fragmenting search
//   results. The frontend dropdown and backend validation both
//   reference the same ITEM_CATEGORIES array.
//
// SEARCH & FILTER INDEXES:
//   MongoDB indexes are like a book's index — they let the database
//   find matching documents without scanning every single row.
//   Without indexes, a search on 100,000 items would check all
//   100,000 documents. With an index, it jumps directly to matches.
//
//   We create indexes on fields that users will search/filter by:
//     - category  : for ?category=Tools filtering
//     - condition  : for ?condition=good filtering
//     - availability: for ?available=true filtering
//     - title (text): for keyword search across titles
//     - isRemovedByAdmin + availability: compound index for the
//       most common query pattern (active, visible items)
// ============================================================

const mongoose = require("mongoose");

// ============================================================
// STANDARDIZED CATEGORIES LIST
// ============================================================
// WHY EXPORT THIS SEPARATELY?
//   Both the model (for validation) and the controller (for the
//   GET /api/items/categories endpoint) need this same list.
//   Exporting it prevents duplication and ensures consistency.
//
// HOW TO ADD A NEW CATEGORY:
//   1. Add it to this array
//   2. That's it — the model validation, the categories endpoint,
//      and the filter logic all reference this single source of truth.
// ============================================================
const ITEM_CATEGORIES = [
  "Tools",
  "Electronics",
  "Kitchen",
  "Sports",
  "Outdoor",
  "Books",
  "Furniture",
  "Other",
];

const itemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide an item title"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      default: "",
    },

    category: {
      type: String,
      required: [true, "Please provide a category"],
      trim: true,
      // Validate against the standardized list
      // If someone sends category: "Weapons", Mongoose will reject it
      enum: {
        values: ITEM_CATEGORIES,
        message: `Category must be one of: ${ITEM_CATEGORIES.join(", ")}`,
      },
    },

    condition: {
      type: String,
      enum: {
        values: ["new", "like-new", "good", "fair", "poor"],
        message: "Condition must be: new, like-new, good, fair, or poor",
      },
      default: "good",
    },

    // -------------------------------------------------------
    // Image Fields — We store the Cloudinary URL, not the file
    // -------------------------------------------------------
    // image: The public URL where the image can be viewed
    //   e.g. "https://res.cloudinary.com/your-cloud/image/upload/v123/sharehood/abc.jpg"
    //
    // imagePublicId: Cloudinary's unique identifier for the image
    //   e.g. "sharehood/abc"
    //   We need this to DELETE the image from Cloudinary later.
    //   Without it, deleted items would leave orphan files in the cloud.
    image: {
      type: String,
      default: "",
    },

    imagePublicId: {
      type: String,
      default: "",
    },

    availability: {
      type: Boolean,
      default: true,
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    // RELATIONSHIP: Who owns this item?
    // type: ObjectId → stores a MongoDB _id
    // ref: "User" → tells Mongoose which collection to populate from
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Item must have an owner"],
    },

    // -------------------------------------------------------
    // Borrow Request Counter — Denormalized for Performance
    // -------------------------------------------------------
    // WHY STORE A COUNT INSTEAD OF COUNTING EVERY TIME?
    //   Counting borrow requests with an aggregation pipeline
    //   on every single search query would be extremely expensive.
    //   Instead, we increment this counter whenever a borrow
    //   request is created, giving us O(1) sort performance.
    //
    // WHEN IS THIS UPDATED?
    //   The borrowRequestController increments this field when
    //   a new borrow request is created for this item.
    //
    // WHAT IS IT USED FOR?
    //   The "mostRequested" sort option (GET /api/items?sort=mostRequested)
    //   uses this field to show the most popular items first.
    // -------------------------------------------------------
    borrowRequestCount: {
      type: Number,
      default: 0,
    },

    // --- Admin Moderation Fields ---
    // WHY "SOFT REMOVE" INSTEAD OF DELETE?
    //   Deleting an item would break existing borrow requests
    //   and agreements that reference it. Instead, we "soft remove"
    //   it — the item stays in the DB but is hidden from public
    //   listings. The admin can restore it later if needed.
    //
    // ENFORCEMENT:
    //   The getAllItems controller filters out items where
    //   isRemovedByAdmin === true. They won't appear in searches
    //   or the marketplace, but the data is preserved.
    isRemovedByAdmin: {
      type: Boolean,
      default: false,
    },

    adminRemovalReason: {
      type: String,
      trim: true,
      default: "",
    },

    removedByAdminAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================
// DATABASE INDEXES — Speed Up Search, Filter, and Sort Queries
// ============================================================
//
// WHAT ARE INDEXES?
//   Think of indexes like a book's table of contents. Without one,
//   finding a topic means reading every page (full collection scan).
//   With one, you jump directly to the right page (index lookup).
//
// WHEN DO INDEXES HELP?
//   Any field you use in .find(), .sort(), or .countDocuments()
//   benefits from an index. Without indexes, queries slow down
//   linearly as the collection grows (10x data = 10x slower).
//
// COMPOUND INDEX (multiple fields):
//   { isRemovedByAdmin: 1, availability: 1, category: 1 }
//   This single index covers the most common query pattern:
//   "Show me available, non-removed items in the Tools category"
//   MongoDB can use one compound index for all three conditions.
//
// TRADE-OFF:
//   Indexes speed up reads but slightly slow down writes (inserts/
//   updates). For a marketplace where reads vastly outnumber writes
//   (users browse 100x more than they list), this is worth it.
// ============================================================

// Primary query index — covers the default "browse marketplace" query
// Fields ordered by selectivity: isRemovedByAdmin filters most,
// then availability, then category for fine-grained filtering
itemSchema.index({ isRemovedByAdmin: 1, availability: 1, category: 1 });

// Sort indexes — speed up the three sort options
// "-1" means descending order (newest/highest first)
itemSchema.index({ createdAt: -1 });           // ?sort=newest (default)
itemSchema.index({ borrowRequestCount: -1 });  // ?sort=mostRequested

// Owner lookup — speeds up "GET /api/items/my-items"
itemSchema.index({ owner: 1 });

// Text index — enables MongoDB text search on title and description
// This is used as a fallback; our primary search uses $regex for
// partial matching (text indexes only match whole words).
itemSchema.index({ title: "text", description: "text" });

const Item = mongoose.model("Item", itemSchema);

module.exports = Item;
module.exports.ITEM_CATEGORIES = ITEM_CATEGORIES;
