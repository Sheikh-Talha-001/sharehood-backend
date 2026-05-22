// ============================================================
// server.js — Main Entry Point for ShareHood Backend API
// ============================================================

// --- 1. Load Environment Variables ---
require("dotenv").config();

// --- 2. Core Imports ---
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const path = require("path");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const rateLimit = require("express-rate-limit");

// --- 3. Internal Imports ---
const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const authRoutes = require("./routes/authRoutes");
const itemRoutes = require("./routes/itemRoutes");
const borrowRequestRoutes = require("./routes/borrowRequestRoutes");
const agreementRoutes = require("./routes/agreementRoutes");
const verificationRoutes = require("./routes/verificationRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reportRoutes = require("./routes/reportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const partnerRoutes = require("./routes/partnerRoutes");
const userRoutes = require("./routes/userRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

// --- 4. Connect to MongoDB ---
connectDB();

// --- 5. Initialize Express App ---
const app = express();
app.set("trust proxy", 1);

// --- 6. Core Middleware ---
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());
app.use(xss());

// Rate Limiting (100 requests per 15 minutes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(cookieParser());

// --- 7. API Routes ---

// Silence browser auto-requests
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => res.status(204).end());

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ShareHood API Running 🚀",
  });
});

// Auth:  POST /api/auth/register, /login, /logout | GET /api/auth/me
app.use("/api/auth", authRoutes);

// Items: POST/GET /api/items | GET /api/items/categories | GET /api/items/my-items | GET/PUT/DELETE /api/items/:id
// Search: ?search=drill | Filter: ?category=Tools&condition=good&available=true&verifiedOnly=true | Sort: ?sort=newest | Page: ?page=2&limit=12
app.use("/api/items", itemRoutes);

// Requests: POST /api/requests | GET /my-requests, /received | PUT /:id/approve, /reject, /cancel, /return
app.use("/api/requests", borrowRequestRoutes);

// Agreements: GET /api/agreements | GET /:id | GET /:id/download
app.use("/api/agreements", agreementRoutes);

// Verification: POST /api/verification/submit | GET /api/verification/status
app.use("/api/verification", verificationRoutes);

// Admin: GET /api/admin/dashboard, /users, /reports, /verifications | PUT suspend, activate, resolve, dismiss, remove, restore, approve, reject
app.use("/api/admin", adminRoutes);

// Reports: POST /api/reports | GET /api/reports/my-reports
app.use("/api/reports", reportRoutes);

// Notifications: GET /api/notifications | PUT /read-all | PUT /:id/read | DELETE /:id
app.use("/api/notifications", notificationRoutes);

// Partners: POST /api/partners/apply | GET /api/partners/my-application
app.use("/api/partners", partnerRoutes);

// Users: GET/PUT /api/users/profile | PUT /change-password, /avatar | GET /:id/public
app.use("/api/users", userRoutes);

// Dashboard: GET /api/dashboard/user-summary | GET /admin-summary
app.use("/api/dashboard", dashboardRoutes);

// --- 8. Serve Frontend ---
app.use(express.static(path.join(__dirname, "../frontend/dist")));

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend", "dist", "index.html"));
});

// --- 9. Error Handling (MUST be after all routes) ---
app.use(notFound);
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
