// ============================================================
// controllers/itemController.js — Item CRUD + Search/Filter/Sort/Paginate
// ============================================================
//
// CLOUDINARY UPLOAD FLOW:
//   1. Multer receives the image and stores it in memory (req.file.buffer)
//   2. We convert the buffer to a base64 "data URI" string
//   3. We call cloudinary.uploader.upload() with that string
//   4. Cloudinary stores the image and returns { secure_url, public_id }
//   5. We save the URL and public_id in MongoDB
//
// CLOUD CLEANUP:
//   When an item is updated with a new image, we DELETE the old
//   image from Cloudinary first. When an item is deleted entirely,
//   we also delete its Cloudinary image. This prevents "orphan"
//   files sitting on the cloud forever, wasting storage.
//
// SEARCH / FILTER / SORT / PAGINATION ARCHITECTURE:
//   The getAllItems() function is the heart of the marketplace.
//   It supports a rich set of query parameters that let the
//   frontend build a fully interactive browse experience:
//
//   SEARCH:      ?search=drill         → regex match on title + description
//   CATEGORY:    ?category=Tools       → exact match on category enum
//   CONDITION:   ?condition=good       → exact match on condition enum
//   AVAILABLE:   ?available=true       → boolean filter on availability
//   VERIFIED:    ?verifiedOnly=true    → only items from verified owners
//   SORT:        ?sort=newest          → newest | oldest | mostRequested
//   PAGINATION:  ?page=2&limit=12      → paginated results with metadata
//
//   All parameters are optional and composable:
//   GET /api/items?search=drill&category=Tools&sort=newest&page=1&limit=10
//
//   The heavy lifting is handled by QueryHelper (utils/queryHelper.js),
//   keeping this controller focused on business logic and validation.
// ============================================================

const Item = require("../models/itemModel");
const { ITEM_CATEGORIES } = require("../models/itemModel");
const User = require("../models/userModel");
const ErrorResponse = require("../utils/errorResponse");
const QueryHelper = require("../utils/queryHelper");
const cloudinary = require("../config/cloudinary");
const { validateObjectId, validateString } = require("../utils/validator");

// ============================================================
// ALLOWED SORT VALUES — Whitelist for security
// ============================================================
// WHY A WHITELIST?
//   If we let users sort by ANY field, they could sort by
//   internal fields like "owner.password" or "adminRemovalReason".
//   A whitelist ensures only safe, intended sort options work.
// ============================================================
const ALLOWED_SORTS = ["newest", "oldest", "mostRequested"];

// ============================================================
// ALLOWED CONDITIONS — For input validation
// ============================================================
const ALLOWED_CONDITIONS = ["new", "like-new", "good", "fair", "poor"];

// ============================================================
// Helper: Upload image buffer to Cloudinary
// ============================================================
// Cloudinary's upload() function expects a file path OR a base64
// data URI. Since we use multer memoryStorage (no file on disk),
// we convert the buffer to a data URI string.
const uploadToCloudinary = (fileBuffer, mimetype) => {
  return new Promise((resolve, reject) => {
    const base64 = fileBuffer.toString("base64");
    const dataUri = `data:${mimetype};base64,${base64}`;

    cloudinary.uploader.upload(
      dataUri,
      {
        folder: "sharehood",       // All images go into a "sharehood" folder
        resource_type: "image",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
  });
};

// ============================================================
// @route   POST /api/items
// @desc    Create a new item listing (with optional image)
// @access  Private (logged-in + verified users only)
// ============================================================
const createItem = asyncHandler(async (req, res, next) => {
  // Set the owner to the currently logged-in user
  req.body.owner = req.user._id;

  try {
    validateString(req.body.title, "Title", { required: true, maxLength: 100 });
    validateString(req.body.description, "Description", { required: true, maxLength: 2000 });
  } catch (err) {
    return next(err);
  }

  // If user uploaded an image file, upload it to Cloudinary
  if (req.file) {
    const result = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    req.body.image = result.secure_url;       // The public URL
    req.body.imagePublicId = result.public_id; // ID for future deletion
  }

  const item = await Item.create(req.body);

  res.status(201).json({
    success: true,
    message: "Item created successfully",
    data: item,
  });
});

// ============================================================
// @route   GET /api/items
// @desc    Browse all items with search, filters, sort & pagination
// @access  Public
// ============================================================
//
// QUERY PARAMETER REFERENCE:
//   ┌────────────────┬──────────────────────┬──────────────────────────┐
//   │ Parameter      │ Example              │ What it does             │
//   ├────────────────┼──────────────────────┼──────────────────────────┤
//   │ search         │ ?search=drill        │ Keyword search           │
//   │ category       │ ?category=Tools      │ Filter by category       │
//   │ condition      │ ?condition=good      │ Filter by condition      │
//   │ available      │ ?available=true      │ Filter by availability   │
//   │ verifiedOnly   │ ?verifiedOnly=true   │ Verified owners only     │
//   │ sort           │ ?sort=newest         │ Sort order               │
//   │ page           │ ?page=2              │ Page number (default: 1) │
//   │ limit          │ ?limit=12            │ Per page (default: 12)   │
//   └────────────────┴──────────────────────┴──────────────────────────┘
//
// EXECUTION ORDER:
//   1. Validate inputs (reject bad category, sort, condition values)
//   2. Build base filters (hide removed items, hide suspended users)
//   3. Handle "verifiedOnly" filter (requires a pre-query on Users)
//   4. Run QueryHelper pipeline: search → filter → sort → paginate
//   5. Populate owner data (name, verification — NO sensitive fields)
//   6. Return standardized response with pagination metadata
//
// WHY IS verifiedOnly HANDLED SEPARATELY?
//   The "verifiedOnly" filter needs to find verified User IDs first,
//   then filter items whose owner is in that list. This is a two-step
//   process that can't be done in a single Mongoose .find() call
//   (items don't store the owner's verification status directly).
//   We use an $in operator: { owner: { $in: [verifiedUserIds] } }
// ============================================================
const getAllItems = asyncHandler(async (req, res, next) => {
  // -------------------------------------------------------
  // STEP 1: INPUT VALIDATION
  // -------------------------------------------------------
  // Reject invalid filter values early, before hitting the database.
  // This gives the user a clear error message instead of empty results.

  // Validate category value against the standardized list
  if (req.query.category && !ITEM_CATEGORIES.includes(req.query.category)) {
    return next(
      new ErrorResponse(
        `Invalid category "${req.query.category}". Allowed categories: ${ITEM_CATEGORIES.join(", ")}`,
        400
      )
    );
  }

  // Validate condition value against allowed conditions
  if (req.query.condition && !ALLOWED_CONDITIONS.includes(req.query.condition.toLowerCase())) {
    return next(
      new ErrorResponse(
        `Invalid condition "${req.query.condition}". Allowed conditions: ${ALLOWED_CONDITIONS.join(", ")}`,
        400
      )
    );
  }

  // Validate sort value against the whitelist
  if (req.query.sort && !ALLOWED_SORTS.includes(req.query.sort)) {
    return next(
      new ErrorResponse(
        `Invalid sort "${req.query.sort}". Allowed sort options: ${ALLOWED_SORTS.join(", ")}`,
        400
      )
    );
  }

  // Validate pagination values are positive numbers
  if (req.query.page && (isNaN(req.query.page) || parseInt(req.query.page) < 1)) {
    return next(new ErrorResponse("Page must be a positive number", 400));
  }

  if (req.query.limit && (isNaN(req.query.limit) || parseInt(req.query.limit) < 1)) {
    return next(new ErrorResponse("Limit must be a positive number", 400));
  }

  // -------------------------------------------------------
  // STEP 2: BUILD BASE FILTERS (security & moderation rules)
  // -------------------------------------------------------
  // These filters are ALWAYS applied, regardless of what the
  // user sends. They enforce platform rules:
  //   - Admin-removed items must never appear in search results
  //   - Suspended users' items must be hidden from the marketplace
  //
  // WHY FILTER SUSPENDED USERS HERE?
  //   If a user gets suspended for fraud, we don't want their
  //   items appearing in the marketplace. But we also don't want
  //   to delete the items (they might be part of active agreements).
  //   Instead, we filter them out at query time.

  const baseFilters = {
    isRemovedByAdmin: false, // Hide admin-removed items
  };

  // -------------------------------------------------------
  // STEP 2b: EXCLUDE SUSPENDED USERS' ITEMS
  // -------------------------------------------------------
  // Find all suspended user IDs, then exclude their items.
  // We use $nin (not in) to filter them out.
  //
  // PERFORMANCE NOTE:
  //   This query runs on the indexed "isSuspended" field and
  //   only returns _id values (very lightweight). In production,
  //   you could cache this list for a few minutes with Redis.
  const suspendedUsers = await User.find(
    { isSuspended: true },
    { _id: 1 }     // Only fetch the _id field (minimal data)
  ).lean();        // .lean() returns plain JS objects (faster, less memory)

  // If there are suspended users, exclude their items
  if (suspendedUsers.length > 0) {
    const suspendedIds = suspendedUsers.map((u) => u._id);
    baseFilters.owner = { $nin: suspendedIds }; // $nin = "not in" this array
  }

  // -------------------------------------------------------
  // STEP 3: VERIFIED OWNERS FILTER (optional)
  // -------------------------------------------------------
  // When ?verifiedOnly=true, only return items from owners
  // whose verificationStatus is "verified".
  //
  // HOW IT WORKS:
  //   1. Query the User collection for verified user IDs
  //   2. Add { owner: { $in: verifiedIds } } to the filter
  //   3. MongoDB only returns items whose owner is in the list
  //
  // $in vs $nin:
  //   $in  = "owner must be IN this list"     (whitelist)
  //   $nin = "owner must NOT be IN this list"  (blacklist)
  //
  // EDGE CASE: What if verifiedOnly AND suspended user filters collide?
  //   If the owner field already has a $nin from suspended users,
  //   we need to combine both conditions. We use $and to merge them.
  if (req.query.verifiedOnly === "true") {
    const verifiedUsers = await User.find(
      { verificationStatus: "verified" },
      { _id: 1 }
    ).lean();

    const verifiedIds = verifiedUsers.map((u) => u._id);

    // If we already have an owner filter (from suspended users),
    // combine both conditions with $and
    if (baseFilters.owner) {
      baseFilters.$and = [
        { owner: baseFilters.owner },     // Exclude suspended
        { owner: { $in: verifiedIds } },  // Include only verified
      ];
      delete baseFilters.owner; // Remove the standalone owner filter
    } else {
      baseFilters.owner = { $in: verifiedIds };
    }
  }

  // -------------------------------------------------------
  // STEP 4: BUILD & EXECUTE THE QUERY PIPELINE
  // -------------------------------------------------------
  // The QueryHelper chains together:
  //   .search()    → adds $regex conditions for ?search=
  //   .filter()    → adds exact-match conditions for ?category=, etc.
  //   .sort()      → adds .sort() for ?sort=
  //   .paginate()  → adds .skip() and .limit() for ?page= & ?limit=
  //
  // The baseFilters are passed to .filter() as "additionalFilters"
  // — these are conditions the user cannot override via URL params.

  const queryHelper = new QueryHelper(Item.find(), req.query)
    .search()
    .filter(baseFilters)
    .sort();

  // paginate() is async because it needs to count total documents
  await queryHelper.paginate();

  // -------------------------------------------------------
  // STEP 5: POPULATE OWNER DATA
  // -------------------------------------------------------
  // Replace the owner ObjectId with actual user data.
  //
  // SECURITY: We use .select() to specify EXACTLY which fields
  // to include. This prevents leaking sensitive data like:
  //   - password (even though it has select: false in schema)
  //   - email (privacy concern)
  //   - suspensionReason (internal moderation data)
  //
  // We only expose:
  //   - name: for display ("Listed by John")
  //   - verificationStatus: for trust badges ("✓ Verified")
  queryHelper.query = queryHelper.query
    .populate("owner", "name verificationStatus")
    .select("-imagePublicId -adminRemovalReason -removedByAdminAt -isRemovedByAdmin -__v");
  //  ↑ We also hide internal fields from the response using select("-field")
  //    The "-" prefix means "exclude this field"

  // Execute the final query
  const items = await queryHelper.query;

  // -------------------------------------------------------
  // STEP 6: RETURN STANDARDIZED RESPONSE
  // -------------------------------------------------------
  // Every list endpoint in ShareHood returns the same shape:
  // {
  //   success: true,
  //   count: 12,           ← items in THIS page
  //   pagination: { ... }, ← metadata for page controls
  //   data: [ ... ]        ← the actual items
  // }
  //
  // WHY count AND pagination.totalItems?
  //   count = items returned in this page (e.g., 12)
  //   totalItems = total matching items across all pages (e.g., 58)
  //   The frontend needs both to show "Showing 12 of 58 items"
  res.status(200).json({
    success: true,
    count: items.length,
    pagination: queryHelper.paginationData,
    data: items,
  });
});

// ============================================================
// @route   GET /api/items/categories
// @desc    Get the standardized list of item categories
// @access  Public
// ============================================================
//
// WHY A DEDICATED ENDPOINT?
//   The frontend needs to display a category dropdown/filter bar.
//   Instead of hardcoding categories in the frontend (which would
//   go out of sync when we add new ones), the frontend fetches
//   them from this endpoint. Single source of truth.
//
// RESPONSE:
//   {
//     success: true,
//     count: 8,
//     data: ["Tools", "Electronics", "Kitchen", ...]
//   }
// ============================================================
const getCategories = asyncHandler(async (req, res, next) => {
  res.status(200).json({
    success: true,
    count: ITEM_CATEGORIES.length,
    data: ITEM_CATEGORIES,
  });
});

// ============================================================
// @route   GET /api/items/:id
// @desc    Get a single item by its ID
// @access  Public
// ============================================================
const getSingleItem = asyncHandler(async (req, res, next) => {
  try {
    validateObjectId(req.params.id, "Item ID");
  } catch (err) {
    return next(err);
  }

  const item = await Item.findById(req.params.id)
    .populate("owner", "name verificationStatus")
    .select("-imagePublicId -adminRemovalReason -removedByAdminAt -__v");

  if (!item) {
    return next(new ErrorResponse("Item not found", 404));
  }

  // Don't expose admin-removed items via direct ID access either
  if (item.isRemovedByAdmin) {
    return next(new ErrorResponse("This item has been removed", 404));
  }

  res.status(200).json({
    success: true,
    data: item,
  });
});

// ============================================================
// @route   PUT /api/items/:id
// @desc    Update an item (with optional new image)
// @access  Private (only the owner can update)
// ============================================================
const updateItem = asyncHandler(async (req, res, next) => {
  try {
    validateObjectId(req.params.id, "Item ID");
    if (req.body.title) validateString(req.body.title, "Title", { required: false, maxLength: 100 });
    if (req.body.description) validateString(req.body.description, "Description", { required: false, maxLength: 2000 });
  } catch (err) {
    return next(err);
  }

  let item = await Item.findById(req.params.id);

  if (!item) {
    return next(new ErrorResponse("Item not found", 404));
  }

  // --- OWNERSHIP CHECK ---
  if (item.owner.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse("You are not authorized to update this item", 403));
  }

  // --- If user uploaded a NEW image, replace the old one ---
  if (req.file) {
    // Step 1: Delete the OLD image from Cloudinary (cleanup)
    if (item.imagePublicId) {
      await cloudinary.uploader.destroy(item.imagePublicId);
    }

    // Step 2: Upload the NEW image
    const result = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    req.body.image = result.secure_url;
    req.body.imagePublicId = result.public_id;
  }

  // Update the item in MongoDB
  item = await Item.findByIdAndUpdate(req.params.id, req.body, {
    new: true,           // Return the updated document
    runValidators: true, // Re-run schema validations
  });

  res.status(200).json({
    success: true,
    message: "Item updated successfully",
    data: item,
  });
});

// ============================================================
// @route   DELETE /api/items/:id
// @desc    Delete an item (and its Cloudinary image)
// @access  Private (only the owner can delete)
// ============================================================
const deleteItem = asyncHandler(async (req, res, next) => {
  try {
    validateObjectId(req.params.id, "Item ID");
  } catch (err) {
    return next(err);
  }

  const item = await Item.findById(req.params.id);

  if (!item) {
    return next(new ErrorResponse("Item not found", 404));
  }

  // --- OWNERSHIP CHECK ---
  if (item.owner.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse("You are not authorized to delete this item", 403));
  }

  // --- Delete the image from Cloudinary (prevent orphan files) ---
  if (item.imagePublicId) {
    await cloudinary.uploader.destroy(item.imagePublicId);
  }

  // Delete the item document from MongoDB
  await Item.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: "Item deleted successfully",
    data: {},
  });
});

// ============================================================
// @route   GET /api/items/my-items
// @desc    Get only the logged-in user's items
// @access  Private
// ============================================================
const getMyItems = asyncHandler(async (req, res, next) => {
  const items = await Item.find({ owner: req.user._id })
    .populate("owner", "name verificationStatus")
    .select("-__v")
    .sort("-createdAt");

  res.status(200).json({
    success: true,
    count: items.length,
    data: items,
  });
});

module.exports = {
  createItem,
  getAllItems,
  getCategories,
  getSingleItem,
  updateItem,
  deleteItem,
  getMyItems,
};
