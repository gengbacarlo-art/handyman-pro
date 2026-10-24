PRAGMA journal_mode = WAL;

-- Categories of handyman services
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  icon TEXT
);

-- Users: clients and handymen
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('client', 'handyman', 'admin')),
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Handyman profiles (linked to users)
CREATE TABLE IF NOT EXISTS handymen_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  category TEXT NOT NULL,
  hourly_rate REAL NOT NULL,
  bio TEXT,
  experience_years INTEGER DEFAULT 0,
  is_available INTEGER DEFAULT 1,
  rating REAL DEFAULT 0,
  total_jobs INTEGER DEFAULT 0,
  stripe_account_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Jobs / bookings
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  handyman_id INTEGER,
  category_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_amount REAL NOT NULL,
  platform_fee REAL NOT NULL,        -- 18% commission
  handyman_earning REAL NOT NULL,    -- 82% to handyman
  stripe_payment_intent_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id),
  FOREIGN KEY (handyman_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL UNIQUE,
  client_id INTEGER NOT NULL,
  handyman_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (client_id) REFERENCES users(id),
  FOREIGN KEY (handyman_id) REFERENCES users(id)
);

-- Seed categories
INSERT OR IGNORE INTO categories (name, icon) VALUES
  ('Plumbing', '🚰'),
  ('Electrical', '⚡'),
  ('Carpentry', '🔨'),
  ('Painting', '🎨'),
  ('Cleaning', '🧹'),
  ('HVAC', '❄️'),
  ('Appliance Repair', '🔧'),
  ('General Handyman', '🛠️');
