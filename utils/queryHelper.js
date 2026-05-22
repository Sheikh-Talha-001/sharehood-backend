// ============================================================
// utils/queryHelper.js — Reusable Query Builder for Mongoose
// ============================================================
//
// WHAT IS THIS?
//   A helper class that takes raw Express query parameters
//   (req.query) and builds a Mongoose query with:
//     1. Keyword search   (regex across multiple fields)
//     2. Field filtering   (exact match on enums/booleans)
//     3. Sorting           (newest, oldest, mostRequested)
//     4. Pagination        (page + limit with metadata)
//
// WHY A SEPARATE CLASS?
//   Putting all this logic inside the controller would make
//   getAllItems() 200+ lines long and impossible to maintain.
//   By extracting it into a reusable builder, we can:
//     - Reuse it for other collections (users, reports, etc.)
//     - Unit test the query logic independently
//     - Keep controllers clean and focused on business logic
//
// HOW DOES IT WORK?
//   1. The controller creates: new QueryHelper(Model.find(), req.query)
//   2. Chains methods:  .search().filter().sort().paginate()
//   3. Awaits the final query:  const results = await helper.query
//
// ARCHITECTURE PATTERN:
//   This follows the "Builder Pattern" — each method modifies
//   the internal query and returns `this`, allowing method chaining.
//   It's the same pattern Mongoose itself uses (.find().sort().limit()).
// ============================================================

class QueryHelper {
  /**
   * @param {mongoose.Query} query    - A Mongoose query object (e.g., Item.find())
   * @param {Object}         queryStr - The raw query string from Express (req.query)
   */
  constructor(query, queryStr) {
    this.query = query;       // The Mongoose query we'll keep modifying
    this.queryStr = queryStr; // The raw URL parameters from the request
    this.totalCount = 0;      // Will hold the total matching documents (before pagination)
    this.paginationData = {}; // Will hold the pagination metadata for the response
  }

  // ============================================================
  // STEP 1: KEYWORD SEARCH
  // ============================================================
  //
  // HOW SEARCH WORKS:
  //   When a user sends ?search=drill, we want to find items
  //   where "drill" appears in the title OR description.
  //
  // MONGODB REGEX SEARCH:
  //   We use { $regex: "drill", $options: "i" } which is
  //   MongoDB's way of doing case-insensitive pattern matching.
  //   The "i" flag means "insensitive" — so "Drill", "DRILL",
  //   and "drill" all match.
  //
  // $or OPERATOR:
  //   $or: [condition1, condition2] means "match if EITHER
  //   condition is true". So we search title OR description.
  //
  // SECURITY NOTE:
  //   We escape special regex characters from user input to
  //   prevent ReDoS (Regular Expression Denial of Service)
  //   attacks. Without escaping, a user could send a crafted
  //   pattern like ".*.*.*.*.*" that freezes the server.
  // ============================================================
  search() {
    if (this.queryStr.search) {
      // Escape special regex characters to prevent ReDoS attacks
      // Characters like . * + ? ^ $ { } ( ) | [ ] \ have special
      // meaning in regex and must be escaped with a backslash
      const escapedSearch = this.queryStr.search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      // Build the search condition: match title OR description
      const searchCondition = {
        $or: [
          { title: { $regex: escapedSearch, $options: "i" } },
          { description: { $regex: escapedSearch, $options: "i" } },
        ],
      };

      // Merge into the existing query using .find()
      // This ADDS conditions — it doesn't replace existing ones
      this.query = this.query.find(searchCondition);
    }

    return this; // Return `this` for method chaining
  }

  // ============================================================
  // STEP 2: FIELD FILTERING
  // ============================================================
  //
  // HOW FILTERING WORKS:
  //   Filtering narrows results by exact field values:
  //     ?category=Tools       → only items in "Tools" category
  //     ?condition=good       → only items in "good" condition
  //     ?available=true       → only available items
  //
  // FILTER vs SEARCH:
  //   Search = fuzzy text matching ("drill" finds "Cordless Drill")
  //   Filter = exact value matching (category must equal "Tools")
  //
  // WHY WHITELIST FIELDS?
  //   We only allow filtering on known, safe fields. If we
  //   passed req.query directly to .find(), a malicious user
  //   could filter on internal fields like { password: "..." }
  //   or { isRemovedByAdmin: false } to bypass security.
  //
  // @param {Object} additionalFilters - Extra conditions added
  //   by the controller (e.g., { isRemovedByAdmin: false })
  //   that the user cannot override via URL parameters.
  // ============================================================
  filter(additionalFilters = {}) {
    const filterConditions = { ...additionalFilters };

    // --- Category Filter ---
    // ?category=Tools → { category: "Tools" }
    // We validate the category value in the controller, not here,
    // to keep the helper generic and reusable.
    if (this.queryStr.category) {
      filterConditions.category = this.queryStr.category;
    }

    // --- Condition Filter ---
    // ?condition=good → { condition: "good" }
    if (this.queryStr.condition) {
      filterConditions.condition = this.queryStr.condition.toLowerCase();
    }

    // --- Availability Filter ---
    // ?available=true  → { availability: true }
    // ?available=false → { availability: false }
    // We convert the string "true"/"false" to an actual boolean
    if (this.queryStr.available !== undefined) {
      filterConditions.availability = this.queryStr.available === "true";
    }

    // Apply all filter conditions to the query
    this.query = this.query.find(filterConditions);

    return this; // Method chaining
  }

  // ============================================================
  // STEP 3: SORTING
  // ============================================================
  //
  // HOW SORTING WORKS:
  //   ?sort=newest        → Most recently created first (default)
  //   ?sort=oldest        → Oldest items first
  //   ?sort=mostRequested → Most borrowed items first
  //
  // MONGOOSE .sort() SYNTAX:
  //   .sort("-createdAt") → descending (newest first)
  //   .sort("createdAt")  → ascending (oldest first)
  //   The "-" prefix means descending order.
  //
  // WHAT IS borrowRequestCount?
  //   It's a virtual field we add to the Item model that counts
  //   how many borrow requests each item has received. For the
  //   "mostRequested" sort, we need to sort by this count.
  //   Since virtuals can't be sorted in MongoDB, we handle
  //   this in the controller with an aggregation pipeline.
  //
  // ALLOWED SORT VALUES:
  //   We only accept known sort values. This prevents users
  //   from sorting by internal fields like "owner.password".
  // ============================================================
  sort() {
    const ALLOWED_SORTS = {
      newest: "-createdAt",       // Descending: most recent first
      oldest: "createdAt",        // Ascending: oldest first
      mostRequested: "-borrowRequestCount", // Descending: most popular first
    };

    // Use the requested sort, or default to "newest"
    const sortKey = this.queryStr.sort || "newest";
    const sortValue = ALLOWED_SORTS[sortKey];

    if (sortValue) {
      this.query = this.query.sort(sortValue);
    } else {
      // If an invalid sort value is provided, default to newest
      // The controller can choose to throw an error instead
      this.query = this.query.sort("-createdAt");
    }

    return this; // Method chaining
  }

  // ============================================================
  // STEP 4: PAGINATION
  // ============================================================
  //
  // HOW PAGINATION WORKS:
  //   Instead of returning ALL items at once (which could be
  //   thousands), we return them in "pages" of fixed size.
  //
  //   ?page=1&limit=12 → Items 1–12
  //   ?page=2&limit=12 → Items 13–24
  //   ?page=3&limit=12 → Items 25–36
  //
  // THE MATH:
  //   skip = (page - 1) * limit
  //   Page 1: skip 0, take 12  → items[0..11]
  //   Page 2: skip 12, take 12 → items[12..23]
  //
  // WHY LIMIT TO 50 MAX?
  //   Without a cap, a client could send ?limit=999999 and
  //   force the server to load the entire collection into
  //   memory, causing an Out of Memory (OOM) crash.
  //
  // PAGINATION METADATA:
  //   The response includes metadata so the frontend can
  //   render page controls (Previous / Next / Page 2 of 5):
  //   {
  //     currentPage: 2,
  //     totalPages: 5,
  //     totalItems: 58,
  //     itemsPerPage: 12
  //   }
  //
  // WHY countDocuments() BEFORE limit()?
  //   .countDocuments() counts ALL matching documents (before
  //   pagination). We need this to calculate totalPages.
  //   .limit() only restricts how many documents are returned,
  //   not how many exist.
  //
  // IMPORTANT — countDocuments() CLONES THE QUERY:
  //   We use this.query.model.countDocuments() with the same
  //   filter conditions, NOT this.query.countDocuments().
  //   Why? Because calling .countDocuments() on the query
  //   would consume it, and we couldn't call .exec() later.
  //   Instead, we count on the Model with the same filters.
  // ============================================================
  async paginate() {
    // Parse page and limit from query string, with safe defaults
    const page = Math.max(1, parseInt(this.queryStr.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(this.queryStr.limit, 10) || 12));

    // Calculate how many documents to skip
    const skip = (page - 1) * limit;

    // Count total matching documents BEFORE applying skip/limit
    // We need to extract the filter from the current query
    this.totalCount = await this.query.model.countDocuments(
      this.query.getFilter()
    );

    // Calculate total pages (round up so partial pages are included)
    const totalPages = Math.ceil(this.totalCount / limit);

    // Apply skip and limit to the query
    this.query = this.query.skip(skip).limit(limit);

    // Store pagination metadata for the response
    this.paginationData = {
      currentPage: page,
      totalPages,
      totalItems: this.totalCount,
      itemsPerPage: limit,
    };

    return this; // Method chaining
  }
}

module.exports = QueryHelper;
