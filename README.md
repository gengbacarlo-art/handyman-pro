# Handyman Pro — Upwork-style home services marketplace

A complete marketplace workflow for local home services. Clients post jobs, handymen submit proposals, clients hire, work runs through milestone escrow, and both sides leave reviews. The platform fee is a flat **18%** — handymen keep **82%**.

**Surfaces**
- **Landing page** — `http://localhost:4000/`
- **Pricing page** — `http://localhost:4000/pricing`
- **Web app** — `http://localhost:4000/app`
- **REST API** — `http://localhost:4000/api/*`

## Marketplace workflow

1. **Client posts a job** — title, description, trade, skills, fixed or hourly budget, duration, experience level.
2. **Handymen browse and submit proposals** — cover letter, bid amount, delivery days.
3. **Client compares proposals** — ratings, completed jobs, bid, timeline — then shortlists, rejects or hires.
4. **Hiring creates a contract** — the job moves to *in progress*, the chosen proposal is marked *hired*, other proposals are rejected, and a default milestone is created.
5. **Client funds the milestone** — money is held in demo escrow.
6. **Handyman submits the work** — the client is notified in the contract thread.
7. **Client approves** — payment is released **82% to the handyman / 18% platform fee**, or the client requests changes and the milestone stays funded.
8. **Contract completes** when every milestone is approved.
9. **Two-way reviews** — client and handyman rate each other; ratings appear on profiles and talent search.

## Tech stack

- **Backend:** Node.js + Express + SQLite (`better-sqlite3`)
- **Web app:** vanilla SPA (`backend/public/app.js` + `styles.css`), hash routing
- **Auth:** JWT + bcrypt; Google Identity Services (optional)
- **Payments:** demo escrow (simulated) — Stripe Connect ready
- **Android:** legacy client in `android/` (targets the previous booking API; not yet updated)

## Project structure

```
handyman-marketplace/
├── backend/
│   ├── server.js              # Express app, demo seed, page routes
│   ├── db.js                  # SQLite connection (handyman.sqlite)
│   ├── schema.sql             # users, jobs, proposals, contracts, milestones, messages, reviews, transactions
│   ├── public/
│   │   ├── landing.html       # Marketing landing page (/)
│   │   ├── pricing.html       # Pricing + FAQ (/pricing)
│   │   ├── index.html         # App shell (/app)
│   │   ├── styles.css         # Upwork-style light design system
│   │   └── app.js             # SPA: auth, dashboards, jobs, proposals, contracts, chat, admin
│   └── routes/
│       ├── auth.js            # register / login / Google / me
│       ├── users.js           # talent search, public profiles, profile editing
│       ├── jobs.js            # job CRUD and feeds
│       ├── proposals.js       # submit / shortlist / reject / hire
│       ├── contracts.js       # contracts, milestones, messages
│       ├── payments.js        # fund / submit / approve / request changes, summaries
│       ├── reviews.js         # two-way reviews
│       └── admin.js           # platform stats, users, jobs, contracts
└── android/                   # legacy Kotlin/Compose client
```

## Quick start

```bash
cd handyman-marketplace/backend
npm install
npm start
```

Or with the portable Node used in this workspace:

```powershell
cd handyman-marketplace\backend
..\.tools\node-v20.11.0-win-x64\node.exe server.js
```

Open **http://localhost:4000/** for the landing page and **http://localhost:4000/app** for the app.

The server creates `backend/handyman.sqlite` on first run and seeds demo data automatically.

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@handyman.app` | `admin123` |
| Client | `alice@client.com` | `password123` |
| Client | `dave@client.com` | `password123` |
| Handyman (Plumbing) | `bob@builder.com` | `password123` |
| Handyman (Electrical) | `mary@mason.com` | `password123` |
| Handyman (Carpentry) | `carl@tiler.com` | `password123` |
| Handyman (Painting) | `ana@painter.com` | `password123` |
| Handyman (Plumbing) | `pete@plumb.com` | `password123` |

## 5-minute walkthrough

1. Sign in as **alice@client.com** → **Post a job** (or open her seeded plumbing job).
2. Sign in as **bob@builder.com** in an incognito window → **Find work** → open the job → **Submit a proposal**.
3. Back as Alice → open the job → compare proposals → **Hire** Bob.
4. Open the new contract → **Fund** the milestone.
5. As Bob → **Submit work**.
6. As Alice → **Approve & release** — the summary shows the 82/18 split.
7. Both sides can leave a **review**; Bob's rating updates on **Talent**.
8. Sign in as **admin@handyman.app** → **Admin** for platform revenue, escrow, users, jobs and contracts.

The seed already includes:
- an **active contract** (Dave + Carl) with a funded, submitted milestone waiting for approval;
- a **completed contract** (Alice + Bob) with released payment and two 5-star reviews;
- open jobs with pending proposals.

## Commission (18% / 82%)

Every contract stores:

- `total_amount` — the agreed contract value
- `platform_fee` — `total_amount × 0.18`
- `handyman_amount` — `total_amount × 0.82`

On milestone release:

```
Client funds:        $500.00
Platform fee (18%):   $90.00
Handyman (82%):      $410.00
```

Milestones can be split; each release is calculated independently and stored in the `transactions` table. Clients can edit or delete **pending** milestones to re-split the budget before funding them.

Hourly jobs are estimated as a **40-hour work block**: the contract total is the proposed hourly rate × 40, and the default milestone covers that block.

## Data model

| Table | Purpose |
|-------|---------|
| `users` | Clients, handymen and admins; handyman profile fields (title, category, skills, rate, experience, location, availability) |
| `jobs` | Job posts with fixed/hourly budgets and status (`open`, `in_progress`, `completed`, `cancelled`) |
| `proposals` | Bids with cover letter, amount, days and status (`pending`, `shortlisted`, `hired`, `rejected`) |
| `contracts` | One per hired job; total, 18% fee, 82% payout, status |
| `milestones` | Escrow units (`pending` → `funded` → `submitted` → `approved`) |
| `messages` | Contract-scoped chat |
| `reviews` | Two-way reviews, one per party per contract |
| `transactions` | `fund` and `release` money movements with fee/payout split |

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register as client or handyman |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/google` | Google ID token (or demo mode) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/users/handymen` | Talent search (`?q=&category=&max_rate=&sort=`) |
| GET | `/api/users/handymen/:id` | Public profile + reviews |
| GET/PUT | `/api/users/me/profile` | Read/update own profile |
| POST | `/api/jobs` | Create a job (client) |
| GET | `/api/jobs` | Role-aware feed (`?scope=open\|mine&q=&category=`) |
| GET | `/api/jobs/:id` | Job detail + proposals (owner) + own proposal |
| PATCH | `/api/jobs/:id` | Cancel an open job |
| POST | `/api/jobs/:id/proposals` | Submit a proposal (handyman) |
| GET | `/api/jobs/:id/proposals` | Proposals for a job (client owner) |
| GET | `/api/proposals/mine` | Handyman's proposals |
| PATCH | `/api/proposals/:id` | `shortlist` / `reject` / `hire` |
| GET | `/api/contracts` | My contracts (role-aware) |
| GET | `/api/contracts/:id` | Contract + milestones + messages + reviews |
| POST | `/api/contracts/:id/milestones` | Add a milestone (client) |
| PATCH | `/api/contracts/:id/milestones/:mid` | Edit a pending milestone (client) |
| DELETE | `/api/contracts/:id/milestones/:mid` | Delete a pending milestone (client) |
| POST | `/api/contracts/:id/messages` | Send a contract message |
| POST | `/api/payments/milestones/:id/fund` | Fund a milestone (client) |
| POST | `/api/payments/milestones/:id/submit` | Submit work (handyman) |
| POST | `/api/payments/milestones/:id/approve` | Approve and release (client) |
| POST | `/api/payments/milestones/:id/request-changes` | Send work back (client) |
| GET | `/api/payments/summary` | Earnings / spend / platform summary |
| GET | `/api/payments/transactions` | Transaction history |
| POST | `/api/contracts/:id/reviews` | Leave a review after completion |
| GET | `/api/users/:id/reviews` | Reviews received |
| GET | `/api/admin/stats` | Platform metrics |
| GET | `/api/admin/users` | All users |
| GET | `/api/admin/jobs` | All jobs |
| GET | `/api/admin/contracts` | All contracts |

## Google Sign-In (optional)

The sign-in screen has a **Continue with Google** button.

- **Without configuration** it signs you in as `google.demo@handyman.app` (client role) and is clearly labeled as a demo.
- **With a real OAuth Web client ID** it uses Google Identity Services and verifies the ID token on the backend:

1. Open <https://console.cloud.google.com/apis/credentials>
2. Create **OAuth 2.0 Client ID → Web application**
3. Add `http://localhost:4000` to **Authorized JavaScript origins**
4. Set `GOOGLE_CLIENT_ID` in `backend/.env`
5. Restart the backend — the official Google button replaces the demo button.

Google sign-in creates a client account on first use. Handymen register through the form so their trade profile is set up.

## Payments

This build runs with **demo payments**: funding, releases and payouts are simulated and shown in the UI. No card is charged.

The data model is Stripe Connect ready. To go live:

1. Create a Stripe platform account and Connect Express accounts for handymen.
2. On milestone funding, create a PaymentIntent for the client.
3. On approval, transfer `handyman_amount` to the connected account and retain `platform_fee` (18%) as the application fee.
4. Store the Stripe IDs on the transaction rows.
5. Set `DEMO_MODE=false` and `STRIPE_SECRET_KEY` in `backend/.env`.

## Legacy components

- `backend/server.ps1` — the previous zero-dependency PowerShell server for the old booking flow. It is **not compatible** with the Upwork-style schema; use the Node backend.
- `android/` — the previous Kotlin/Compose client. It still targets the old job-booking API and has not been migrated to proposals/contracts/milestones.

## Production checklist

1. Replace `JWT_SECRET` with a long random value.
2. Add Stripe Connect and real escrow handling.
3. Move from SQLite to PostgreSQL for scale.
4. Add email/push notifications for proposals, submissions and approvals.
5. Add license/background verification for handymen.
6. Add dispute resolution and admin moderation tools.
7. Deploy the backend (Railway, Render, Fly.io) behind HTTPS.
