# ShareHood — Project Context & Architecture Documentation

> **AI INSTRUCTION**: This file is the primary source of truth for the ShareHood backend architecture. When generating new features, modifying existing code, or integrating the frontend, refer to this document to ensure alignment with the established "Trust-First" design patterns, capability-based access control, and architectural standards.

---

## 1. Project Overview

**ShareHood** is a secure, trust-first community sharing platform. It enables neighbors to securely lend and borrow items (tools, electronics, camping gear, etc.) while holding all participants accountable. 

Unlike traditional open marketplaces (like Craigslist), ShareHood enforces a strict **Trust-First Architecture**:
1. **Verified Identities**: Users must submit real ID documents and be approved by an admin before they can borrow items.
2. **Vetted Partners/Lenders**: Not everyone can create item listings. Users must apply and be approved as "Partners" to ensure high-quality, safe listings.
3. **Accountability**: Every transaction is backed by digital agreements, in-app notifications, and a robust reporting/moderation system.

### Core Platform Workflows
- **Borrowing**: Verified users can request items, owners approve/reject, items are handed over, and eventually returned.
- **Moderation**: Admins review IDs, review partner applications, handle reports, and suspend bad actors.
- **Agreements**: Automatic PDF-style digital agreements are generated when a borrow request is approved.

---

## 2. Backend Folder Structure

The project follows a standard scalable MVC (Model-View-Controller) architecture tailored for Express.js.

```text
backend/
├── config/         # Database and third-party service connections (db.js, cloudinary.js)
├── controllers/    # Business logic for all routes (auth, items, admin, etc.)
├── middleware/     # Custom Express middleware (auth, error, upload, verification)
├── models/         # Mongoose schemas and database models
├── routes/         # Express route definitions linking URLs to controllers
├── services/       # External service integrations (e.g., PDF generation, future Email)
├── utils/          # Reusable helper functions (QueryHelper, notify, ErrorResponse)
└── server.js       # Application entry point and global middleware setup
```

---

## 3. Authentication Architecture

- **JWT Flow**: The application uses JSON Web Tokens (JWT) for stateless authentication.
- **Token Storage**: Tokens are stored in **HttpOnly, Secure, SameSite=Strict cookies**. This prevents XSS attacks from reading the token via JavaScript.
- **`protect` Middleware**: Every private route runs through `protect`, which decodes the JWT, fetches the user, and attaches `req.user`.
- **Global Suspension Check**: The `protect` middleware also checks `req.user.isSuspended`. If true, the user is blocked from *all* protected routes immediately, without needing checks in individual controllers.

---

## 4. User Roles & Permissions

ShareHood uses a combination of **Roles** (RBAC) and **Capabilities** (CBAC).

### Roles (`role` field)
- **`user`**: A standard community member.
- **`admin`**: A platform moderator. Has access to the `/api/admin` dashboard and all moderation endpoints. Handled by the `authorize("admin")` middleware.

### Capabilities (`canListItems` field)
We avoid creating a "lender" role. Instead, listing items is a capability.
- **Normal User** (`canListItems: false`): Can browse and borrow items.
- **Approved Partner** (`canListItems: true`): Has been vetted by an admin. Can browse, borrow, *and* create new item listings.

### Trust Status (`verificationStatus` field)
- `unverified` → `pending` → `verified` (or `rejected`).
- Users *must* be `verified` to borrow items or apply to become a partner.

---

## 5. Database Models Documentation

### User (`models/userModel.js`)
- **Purpose**: Core identity, auth, and capability tracking.
- **Key Fields**: `email`, `password`, `role`, `verificationStatus`, `canListItems`, `partnerStatus`, `isSuspended`.
- **Profile Fields**: `name`, `phoneNumber`, `bio`, `neighborhood`, `avatar`.

### Item (`models/itemModel.js`)
- **Purpose**: Represents physical items available for borrowing.
- **Key Fields**: `title`, `description`, `category` (Enum), `condition` (Enum), `availability` (Boolean), `owner` (Ref User), `borrowRequestCount`.
- **Security**: Contains `isRemovedByAdmin` to soft-hide flagged items.

### BorrowRequest (`models/borrowRequestModel.js`)
- **Purpose**: Tracks the lifecycle of borrowing an item.
- **States**: `pending` → `approved` (or `rejected` / `canceled`) → `returned`.
- **Key Fields**: `item`, `borrower`, `itemOwner`, `startDate`, `endDate`, `status`.

### Agreement (`models/agreementModel.js`)
- **Purpose**: Digital contract generated automatically when a request is approved.
- **Key Fields**: `borrowRequest`, `item`, `owner`, `borrower`, `terms`, `status` (`active`, `completed`).

### VerificationRequest (`models/verificationRequestModel.js`)
- **Purpose**: Holds ID document URLs pending admin review.
- **Key Fields**: `user`, `idDocumentUrl`, `status`, `rejectionReason`.

### PartnerApplication (`models/partnerApplicationModel.js`)
- **Purpose**: Tracks requests to become a lender.
- **Key Fields**: `user`, `experienceDescription`, `categoriesInterestedIn`, `status`, `reviewedBy` (Admin audit).

### Report (`models/reportModel.js`)
- **Purpose**: Allows users to flag bad behavior or broken items.
- **Key Fields**: `reporter`, `reportedUser`, `reportedItem`, `reason`, `status` (`pending`, `resolved`, `dismissed`).

### SuspensionAppeal (`models/suspensionAppealModel.js`)
- **Purpose**: Allows suspended users to plead their case.
- **Key Fields**: `user`, `appealText`, `status`, `adminResponse`.

### Notification (`models/notificationModel.js`)
- **Purpose**: Event-driven in-app inbox.
- **Types**: `borrow_request`, `request_approved`, `item_returned`, `partner_approved`, etc.

---

## 6. Middleware Documentation

- **`authMiddleware.js` (`protect`, `authorize`)**: Validates JWTs, attaches `req.user`, blocks suspended users, restricts admin routes.
- **`verificationMiddleware.js` (`requireVerified`)**: Gates trust-critical actions (borrowing, applying as partner) behind admin ID approval.
- **`partnerMiddleware.js` (`requirePartner`)**: Gates item creation behind the `canListItems` capability.
- **`errorMiddleware.js` (`errorHandler`, `notFound`)**: Standardizes all errors into a `{ success: false, error: "..." }` JSON format. Prevents app crashes.
- **`uploadMiddleware.js` (`upload`)**: Configures Multer to accept image files into memory (Buffer) for Cloudinary upload, rejecting invalid MIME types.

---

## 7. API Architecture

### Route Grouping
- `/api/auth` — Registration, login, logout, me.
- `/api/users` — Profile management, avatars, passwords, public profiles.
- `/api/items` — Item CRUD, search/filter/sort, categories.
- `/api/requests` — Borrowing lifecycle.
- `/api/agreements` — Contract viewing/downloading.
- `/api/verification` — Identity submission.
- `/api/partners` — Lender application.
- `/api/reports` — Submitting reports.
- `/api/notifications` — Inbox management.
- `/api/dashboard` — Aggregated metrics for frontend widgets.
- `/api/admin` — Master moderation endpoints.

### Query Builder (`utils/queryHelper.js`)
A standardized class used in `GET /api/items` to automatically handle Regex searches, complex filters, dynamic sorting, and metadata-rich pagination.

---

## 8. Complete Workflow Systems

1. **Verification**: User POSTs docs → Admin PUTs approve → User `verificationStatus` becomes `verified`.
2. **Partner Onboarding**: Verified User POSTs application → Admin PUTs approve → User `canListItems` becomes `true`.
3. **Borrowing**: User POSTs request → Owner PUTs approve → Agreement Auto-Generated → Notification sent to borrower → Item returned.
4. **Moderation**: User POSTs report → Admin suspends offender → Offender POSTs appeal → Admin resolves appeal.

---

## 9. Security Architecture

- **No Mass Assignment**: Controllers strictly whitelist `req.body` fields (e.g., `updateProfile` ignores `role` injections).
- **Ownership Checks**: Users can only update/delete items they own. Owners can only approve requests for their own items.
- **Cloud Cleanup**: When items or avatars are deleted/updated, the old file is actively destroyed on Cloudinary to prevent cloud storage bloat.
- **Idempotency**: Workflows prevent double-approving requests or submitting duplicate partner applications via strict DB indexing and controller checks.

---

## 10. Notification System

Powered by `utils/notify.js`. Instead of controllers importing the Model, they call the `notify()` utility. 
- **Current**: Saves to MongoDB for in-app badge/inbox reading.
- **Future-Proof**: The `notify.js` file is the sole injection point for future Socket.io, Email (SendGrid), or Push (FCM) integrations.

---

## 11. Admin System & Dashboard

The admin ecosystem is entirely isolated under `/api/admin` and `authorize("admin")`.
The **Admin Dashboard** (`/api/dashboard/admin-summary`) aggregates data using `Promise.all()` to show platform health and pending queue depths (reports waiting, verifications waiting) in a single fast query.

---

## 12. Current Completed Features

- [x] JWT Authentication & HttpOnly Cookies
- [x] Cloudinary Image Uploading
- [x] Identity Verification Workflow
- [x] Partner/Lender Onboarding Workflow
- [x] Item CRUD + Advanced Search/Filter/Sort/Paginate
- [x] Borrowing Request Lifecycle
- [x] Automatic Agreement Generation
- [x] Real-time In-App Notifications
- [x] Reporting & Suspension Moderation
- [x] Suspension Appeals
- [x] Profile Management & Avatars
- [x] User & Admin Dashboard Aggregation

---

## 13. Planned Frontend Architecture

- **Tech Stack**: React.js (Vite), TailwindCSS, React Router.
- **Authentication**: Context API wrapping Axios interceptors to handle 401s globally.
- **Structure**:
  - `/browse` — Public marketplace (Item feed).
  - `/dashboard` — User hub (Agreements, Requests, Inbox).
  - `/admin` — Protected layout for moderation queues.
- **Design Aesthetic**: Premium, trust-inspiring, modern UI with micro-animations.

---

## 14. Coding Standards

1. **Async Handling**: Never use `try/catch` in controllers. Wrap every controller in `asyncHandler` to pass errors to Express middleware.
2. **Error Responses**: Always throw `ErrorResponse(message, statusCode)`.
3. **Standardized Responses**: Every successful response must follow:
   ```json
   { "success": true, "message": "Optional", "data": { ... } }
   ```
4. **Fat Models, Skinny Controllers**: Keep complex Mongoose queries and hooks inside models or utility classes where possible.

---

## 15. Important Development Rules for AI

1. **PRESERVE TRUST ARCHITECTURE**: Do not bypass `requireVerified` or `requirePartner` when adding new features.
2. **MAINTAIN CAPABILITIES**: Do not create a "Lender" role. Stick to `canListItems` boolean capability.
3. **NO CASCADING DELETES**: ShareHood uses Soft Deletes or Suspensions. Do not physically delete Users, as it destroys historical audit trails and breaks active agreements.
4. **DON'T BREAK MULTIPART**: When handling file uploads, remember `req.body` is empty until Multer (`upload.single`) processes the request.
5. **CONSISTENT NAMING**: Use camelCase for variables/fields, PascalCase for Models, kebab-case for URLs (`/change-password`, not `/changePassword`).

---

## 16. Environment Variables

| Variable | Purpose |
|:---|:---|
| `PORT` | Express server port (default: 5000) |
| `MONGO_URI` | Connection string for MongoDB |
| `JWT_SECRET` | Cryptographic key for signing tokens |
| `JWT_EXPIRES_IN` | Token lifespan (e.g., `7d`) |
| `CLIENT_URL` | Frontend URL for CORS configuration |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary storage bucket |
| `CLOUDINARY_API_KEY` | Cloudinary auth key |
| `CLOUDINARY_API_SECRET`| Cloudinary auth secret |

---

## 17. Future Roadmap

1. **Frontend Integration**: Building the React client to consume this API.
2. **Socket.io Integration**: Upgrading `utils/notify.js` to emit real-time events to the frontend via WebSockets.
3. **Third-Party Verification**: Replacing manual admin ID checks with a service like Persona or Stripe Identity.
4. **Email Integration**: Adding SendGrid to `notify.js` for offline alerts.
