PRAGMA journal_mode = WAL;

-- Users: clients, handymen (freelancers) and admin
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('client', 'handyman', 'admin')),
  full_name TEXT NOT NULL,
  title TEXT,                       -- professional headline (handymen)
  overview TEXT,                    -- bio / overview
  category TEXT,                    -- primary trade
  skills TEXT,                      -- comma-separated skills
  hourly_rate REAL,
  experience_years INTEGER DEFAULT 0,
  location TEXT,
  availability TEXT DEFAULT 'available',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Job posts created by clients
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  skills TEXT,
  budget_type TEXT NOT NULL DEFAULT 'fixed' CHECK (budget_type IN ('fixed', 'hourly')),
  budget_min REAL NOT NULL,
  budget_max REAL,
  duration TEXT,
  experience_level TEXT DEFAULT 'intermediate',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id)
);

-- Proposals / bids submitted by handymen
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  handyman_id INTEGER NOT NULL,
  cover_letter TEXT NOT NULL,
  bid_amount REAL NOT NULL,          -- fixed price, or hourly rate for hourly jobs
  bid_days INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'shortlisted', 'hired', 'rejected')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, handyman_id),
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (handyman_id) REFERENCES users(id)
);

-- One contract per hired job
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL UNIQUE,
  client_id INTEGER NOT NULL,
  handyman_id INTEGER NOT NULL,
  proposal_id INTEGER,
  total_amount REAL NOT NULL,
  platform_fee REAL NOT NULL,        -- 18% commission
  handyman_amount REAL NOT NULL,     -- 82% to handyman
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (client_id) REFERENCES users(id),
  FOREIGN KEY (handyman_id) REFERENCES users(id)
);

-- Fixed-price milestones / escrow
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'funded', 'submitted', 'approved')),
  funded_at TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

-- Contract messages
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

-- Two-way reviews after a completed contract
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  reviewer_id INTEGER NOT NULL,
  reviewee_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(contract_id, reviewer_id),
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id),
  FOREIGN KEY (reviewee_id) REFERENCES users(id)
);

-- Money movements: fund (client -> escrow) and release (escrow -> handyman + platform)
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  milestone_id INTEGER,
  client_id INTEGER NOT NULL,
  handyman_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  platform_fee REAL NOT NULL DEFAULT 0,
  handyman_amount REAL NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('fund', 'release')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (client_id) REFERENCES users(id),
  FOREIGN KEY (handyman_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_job ON proposals(job_id);
CREATE INDEX IF NOT EXISTS idx_proposals_handyman ON proposals(handyman_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_handyman ON contracts(handyman_id);
CREATE INDEX IF NOT EXISTS idx_milestones_contract ON milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_messages_contract ON messages(contract_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);
