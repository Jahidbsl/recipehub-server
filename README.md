# RecipeHub Backend API

The core backend application for RecipeHub. Built on Node.js using Express.js and the native MongoDB Driver, this server manages API routing, session-based authentication middleware, complex database transactions, platform safety pipelines, and synchronized payment logging.

---

## 🚀 Key Features

*   **Unified Financial Operations**: Integrates disparate transactional workflows into a unified ledger stream, combining single-recipe purchases ($4.99) and active multi-tier Stripe subscriptions into a unified Admin tracking panel.
*   **Granular Access Control**: Multi-tier authentication pipeline using robust custom middlewares (`verifyToken` and `verifyAdmin`) to secure endpoints against unauthorized access.
*   **Cascading Active Session Terminations**: Dynamically monitors account statuses. When an administrator blocks a user, the application automatically drops all concurrent active authentication sessions from the database, forcing an immediate logout across devices.
*   **Robust Content Moderation Engine**: Supports granular report dismissals or multi-document cascade operations (simultaneously wiping a reported recipe along with all its matching reported instances).
*   **Atomicity in Analytics**: Implements precise counter operations utilizing MongoDB atomic updates (`$inc`, `$set`) to prevent race conditions during heavy client traffic.

---

## 🛠️ Tech Stack

*   **Runtime Environment**: Node.js
*   **Backend Framework**: Express.js
*   **Database Engine**: MongoDB (Native Client Driver v1 API configuration)
*   **Security & Policy Management**: CORS Policies, HTTP Response Headers Control, Dotenv Environment Isolations

---

## ⚙️ Installation & Local Setup

### 1. Clone & Dependency Resolution
Navigate to your repository root directory and install the necessary package tree:
```bash
npm install