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
const helmet = require("helmet");
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

// Railway runs behind a reverse proxy — required for:
//   - express-rate-limit to see real client IPs
//   - secure cookies to be set correctly behind HTTPS proxy
app.set("trust proxy", 1);

// --- 6. CORS Configuration (MUST be the very first middleware) ---
// Browsers send the Origin header WITHOUT a trailing slash.
// Every origin in this list must match exactly — no trailing slashes.
const allowedOrigins = [
  "https://sharhood-frontend.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Explicitly handle OPTIONS preflight for all routes
app.options("*", cors(corsOptions));

// --- 7. Core Middleware ---
// Helmet sets security headers but can conflict with CORS.
// crossOriginResourcePolicy: false prevents helmet from blocking
// cross-origin responses to credentialed requests.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// CUSTOM INPUT SANITIZATION (Express 5 compatible)
// ============================================================
// express-mongo-sanitize v2 and xss-clean v0.1.4 crash on Express 5
// because they try to MUTATE req.query, which is a read-only getter
// in Express 5. This custom middleware provides the same NoSQL injection
// protection without mutating req.query directly.
// ============================================================
const sanitizeObject = (obj) => {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (key.startsWith("$") || key.includes(".")) {
        delete obj[key];
      } else if (typeof obj[key] === "object") {
        sanitizeObject(obj[key]);
      }
    }
  }
};

app.use((req, res, next) => {
  if (req.body) sanitizeObject(req.body);
  if (req.params) sanitizeObject(req.params);
  next();
});

// Logging
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Rate Limiting (100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

// --- 8. API Routes ---

// Silence browser auto-requests
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => res.status(204).end());

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ShareHood API Running 🚀",
    environment: process.env.NODE_ENV || "development",
  });
});

// Auth:  POST /api/auth/register, /login, /logout | GET /api/auth/me
app.use("/api/auth", authRoutes);

// Items: POST/GET /api/items | GET /api/items/categories | GET /api/items/my-items | GET/PUT/DELETE /api/items/:id
app.use("/api/items", itemRoutes);

// Requests: POST /api/requests | GET /my-requests, /received | PUT /:id/approve, /reject, /cancel, /return
app.use("/api/requests", borrowRequestRoutes);

// Agreements: GET /api/agreements | GET /:id | GET /:id/download
app.use("/api/agreements", agreementRoutes);

// Verification: POST /api/verification/submit | GET /api/verification/status
app.use("/api/verification", verificationRoutes);

// Admin: GET /api/admin/dashboard, /users, /reports, /verifications
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

// --- 9. Error Handling (MUST be after all routes) ---
app.use(notFound);
app.use(errorHandler);

// --- 10. Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🌐 Allowed CORS origins: ${allowedOrigins.join(", ")}`);
  console.log(`🔐 Secure cookies: ${process.env.NODE_ENV === "production"}`);
});
