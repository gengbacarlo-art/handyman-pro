# Handyman Marketplace

Connects clients with local handymen. Platform takes **18% commission** on every job.

**You get two frontends:**
- **Web app** (at `http://localhost:4000`) — works immediately, no Android tooling needed
- **Android app** (Kotlin + Jetpack Compose) — in the `android/` folder

## Tech Stack
- **Backend:** Node.js + Express + SQLite
- **Web app:** Single-page app served by the backend (`backend/public/`)
- **Android:** Kotlin + Jetpack Compose
- **Payments:** Stripe Connect (with demo mode fallback)
- **Auth:** JWT

## Project Structure
```
handyman-marketplace/
├── backend/              # Node.js API + Web app
│   ├── server.js
│   ├── db.js             # SQLite connection
│   ├── schema.sql        # Database schema + seed
│   ├── public/
│   │   └── index.html    # Web app (client + handyman + admin)
│   └── routes/
│       ├── auth.js       # Register/login (creates Stripe Connect accounts)
│       ├── users.js
│       ├── jobs.js
│       ├── payments.js   # Stripe, 18% commission, demo mode
│       ├── reviews.js    # Ratings & reviews
│       └── admin.js
└── android/              # Kotlin Android app (optional)
```

## Quick Start

### Option A — No Node.js needed (Windows, already running)

This machine didn't have Node.js installed, so the backend also ships as a
**zero-dependency PowerShell server** that implements the same API:

```powershell
cd handyman-marketplace\backend
powershell -ExecutionPolicy Bypass -NoProfile -File server.ps1
```

- Web app + API: **http://localhost:4000**
- Data is stored in `backend/psdata.json` (pure demo mode, no Stripe).

### Option B — Node.js backend (full version)

```bash
cd handyman-marketplace/backend
npm install
npm start
```

### 2. Open the web app
Go to **http://localhost:4000** in your browser.

### 3. Try it
1. **Register a client** (e.g. alice@example.com) — or use the seeded admin below
2. **Register a handyman** in a second browser/incognito window (e.g. bob@example.com)
3. As the client: browse handymen → **Book** → **Pay** (simulated in demo mode)
4. As the handyman: **Accept → Start → Complete**, watch earnings at 82%
5. As the client: leave a **review**
6. Admin login: **admin@handyman.app** / **admin123**
7. Seeded handyman login: **bob@builder.com** / **password123**

## Demo Mode vs Real Payments

The `.env` has `DEMO_MODE=true`, so payments are **simulated** — perfect for testing the full flow without Stripe.

To enable **real payments**:
1. Get test keys from https://dashboard.stripe.com/test/apikeys
2. Edit `backend/.env`:
   ```
   DEMO_MODE=false
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLIC_KEY=pk_test_...
   ```
3. Restart the backend. Handymen registering now get **Stripe Connect Express** accounts, and each payment automatically splits: **18% to your platform, 82% to the handyman**.

## Commission Flow (18%)
Every job stores:
- `platform_fee` = `total_amount * 0.18` → your revenue
- `handyman_earning` = `total_amount * 0.82` → handyman's payout

With real Stripe keys, `application_fee_amount` routes the 18% to the platform account and the rest to the handyman's connected account automatically.

## API Overivew
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register (client or handyman) |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |
| GET | /api/users/handymen | List handymen (optional `?category=`) |
| POST | /api/jobs | Create/booking a job |
| GET | /api/jobs | List my jobs (role-aware) |
| PATCH | /api/jobs/:id/status | Update status (accept/start/complete/cancel) |
| POST | /api/payments/create-intent | Create payment (or demo payment) |
| POST | /api/payments/confirm | Confirm payment |
| GET | /api/payments/earnings | Handyman earnings (82%) |
| POST | /api/payments/connect-onboard | Stripe Connect onboarding link |
| POST | /api/reviews | Submit a review (1–5 stars) |
| GET | /api/reviews/handyman/:id | Reviews for a handyman |
| GET | /api/admin/stats | Admin dashboard stats |
| GET | /api/admin/users | All users |
| GET | /api/admin/jobs | All jobs |

## Android App (Optional)
Open the `android/` folder in Android Studio. Set the API URL in `MainActivity.kt` to `http://10.0.2.2:4000/api/` (emulator) or your LAN IP (device).

## Production Checklist
1. Replace `JWT_SECRET` with a long random string
2. Switch to real Stripe keys and complete Connect onboarding for handymen
3. Move from SQLite to PostgreSQL for scale
4. Add push notifications (FCM) for job requests
5. Add in-app chat between client and handyman
6. Add background checks / license verification
7. Deploy backend (Railway, Render, Fly.io)
