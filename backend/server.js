require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Seed default admin account for the demo
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!adminExists) {
  db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
    .run('admin@handyman.app', bcrypt.hashSync('admin123', 10), 'admin', 'Platform Admin');
  console.log('Seeded admin account: admin@handyman.app / admin123');
}

// Seed demo handymen for quick testing
const demoHandymen = [
  { email: 'bob@builder.com', name: 'Bob Builder', category: 'Plumbing', rate: 75, years: 10, phone: '+1 555 0102' },
  { email: 'mary@mason.com', name: 'Mary Mason', category: 'Electrical', rate: 85, years: 8, phone: '+1 555 0103' },
  { email: 'carl@tiler.com', name: 'Carl Tiler', category: 'Carpentry', rate: 60, years: 12, phone: '+1 555 0104' },
];
for (const h of demoHandymen) {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(h.email);
  if (!exists) {
    const r = db.prepare('INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)')
      .run(h.email, bcrypt.hashSync('password123', 10), 'handyman', h.name, h.phone);
    db.prepare('INSERT INTO handymen_profiles (user_id, category, hourly_rate, bio, experience_years, rating, total_jobs, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
      .run(r.lastInsertRowid, h.category, h.rate, null, h.years, 4.7, 12);
    console.log('Seeded handyman:', h.email, '/ password123');
  }
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Public config
app.get('/api/config', (req, res) => {
  res.json({
    demoMode: !process.env.STRIPE_SECRET_KEY || process.env.DEMO_MODE === 'true',
    commission: 0.18,
    appName: 'Handyman Pro'
  });
});

// Serve the web app
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/admin', require('./routes/admin'));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Handyman backend running on http://localhost:${PORT}`);
  console.log(`Web app available at http://localhost:${PORT}`);
});
