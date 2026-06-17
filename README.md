# 🍽️ Shaastra Wallet — Food Coupon Backend

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socket.io&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

Backend powering a digital food-coupon wallet system built for **Shaastra**, IIT Madras's annual technical festival — handling virtual-money transactions for 50,000+ attendees across a 4-day event.

## ✨ Features

- 🔐 **Secure registration & login** — email-OTP verification, bcrypt-hashed passwords
- 💳 **Two-factor money movement** — every transaction requires a separate 4-digit S-Pin on top of login auth
- ⚡ **Real-time balance updates** — Socket.io pushes instant transaction alerts to both sender and receiver
- 👥 **Role-based access** — Core, Finance Core, WebOps Core, Coordinator, Volunteer, Vendor tiers with distinct permissions
- 📥 **Bulk team onboarding** — validated CSV import for 1000+ team members in minutes, not hours
- 📊 **Vendor reporting** — transaction history, statements, and CSV export for vendor reconciliation
- 🛡️ **Rate-limited everywhere** — separate limits for auth, OTP requests, and transactions to prevent abuse
- 🧾 **Auditable admin tools** — bulk balance resets with a full transaction trail (`ADMIN_RESET` type + metadata)

## 🏗️ Architecture

```mermaid
graph LR
    Client[Client App] -->|REST API| Express[Express Server]
    Client <-->|WebSocket| Socket[Socket.io]
    Express --> Auth[JWT Auth Middleware]
    Auth --> Role[Role Middleware]
    Role --> Routes[Route Handlers]
    Routes --> DB[(PostgreSQL via Sequelize)]
    Routes --> Mail[Nodemailer — OTP Emails]
    Routes --> Socket
```

## 🔌 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js, Express 5 |
| Database | PostgreSQL, Sequelize ORM |
| Real-time | Socket.io |
| Auth | JWT, bcrypt |
| Email | Nodemailer |
| Rate limiting | express-rate-limit |

## 📡 API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/request-otp` | Send registration OTP |
| POST | `/api/auth/complete-registration` | Verify OTP, set password & S-Pin |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/forgot-password` / `/reset-password` | OTP-based password recovery |
| POST | `/api/wallet/send` | Transfer money (requires S-Pin) |
| POST | `/api/wallet/send-group` | Send to multiple recipients at once |
| POST | `/api/wallet/topup` | Finance Core tops up a user's balance |
| GET | `/api/wallet/history` | Paginated transaction history with filters |
| POST | `/api/wallet/admin-reset-balances` | Bulk balance reset (Finance Core only) |
| GET | `/api/vendor-management/vendors` | List vendors (Finance Core only) |

## 🚀 Getting Started

```bash
git clone https://github.com/<your-username>/shaastra-wallet-backend.git
cd shaastra-wallet-backend
npm install
```

Create a `.env` file:

DATABASE_URL=postgres://user:password@host:port/dbname
JWT_SECRET=your_jwt_secret
EMAIL_USER=your_smtp_user
EMAIL_PASS=your_smtp_password
PORT=5000

Run it:
```bash
npm run dev
```

## 📁 Project Structure

├── config/           # Database connection
├── middleware/        # Auth, role checks, rate limiting
├── models/           # User, Transaction, Group (Sequelize)
├── routes/           # auth, user, groups, wallet, vendor-management
├── services/         # Email/OTP service
├── bulkImportTeam.js  # CSV-based team onboarding
└── index.js           # App entry point

