# Handyman Marketplace

Connects clients with local handymen. Platform takes **18% commission** on every job.

**You get three surfaces:**
- **Landing page** at `http://localhost:4000/` — marketing site with features, how it works and pricing links
- **Pricing page** at `http://localhost:4000/pricing` — client/handyman plans and the 18% split explained
- **Web app** at `http://localhost:4000/app` — works immediately, no Android tooling needed
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
│   │   ├── landing.html  # Marketing landing page (/)
│   │   ├── pricing.html  # Pricing page (/pricing)
│   │   └── index.html    # Web app (client + handyman + admin) (/app)
│   └── routes/
│       ├── auth.js       # Register/login/Google (creates Stripe Connect accounts)
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

- Landing page: **http://localhost:4000/**
- Pricing: **http://localhost:4000/pricing**
- Web app + API: **http://localhost:4000/app**
- Data is stored in `backend/psdata.json` (pure demo mode, no Stripe).

### Option B — Node.js backend (full version)

```bash
cd handyman-marketplace/backend
npm install
npm start
```

### 2. Open the web app
Go to **http://localhost:4000/app** in your browser (landing page: **http://localhost:4000/**).

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

## Google Sign-In (optional)

The sign-in screen has a **Continue with Google** button.

- **Without configuration** (default) it runs in demo mode and signs you in as a demo Google client account — useful for testing.
- **With a real OAuth client ID**, it uses Google Identity Services and verifies the ID token on the backend:

1. Open https://console.cloud.google.com/apis/credentials
2. Create an **OAuth 2.0 Client ID → Web application**
3. Add `http://localhost:4000` to **Authorized JavaScript origins**
4. Put the client ID in `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```
5. Restart the backend. The demo button is replaced by the official Google button.

Google sign-in creates a **client** account on first use (handymen still register through the normal form so their trade profile and Stripe Connect account are set up).

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
| POST | /api/auth/google | Google sign-in (ID token or demo) |
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
