const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

const PUBLIC_FIELDS = `id, email, role, full_name, title, overview, category, skills,
  hourly_rate, experience_years, location, availability, created_at`;

function sign(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function getPublicUser(id) {
  return db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id);
}

// REGISTER
router.post('/register', (req, res) => {
  try {
    const {
      email, password, full_name, role,
      title, overview, category, skills, hourly_rate, experience_years, location
    } = req.body;

    if (!email || !password || !full_name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['client', 'handyman'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, role, full_name, title, overview, category, skills, hourly_rate, experience_years, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(email).toLowerCase(),
      password_hash,
      role,
      full_name,
      role === 'handyman' ? (title || `${category || 'General'} Professional`) : null,
      role === 'handyman' ? (overview || null) : null,
      role === 'handyman' ? (category || 'General Handyman') : null,
      role === 'handyman' ? (skills || null) : null,
      role === 'handyman' ? (Number(hourly_rate) || 50) : null,
      role === 'handyman' ? (Number(experience_years) || 0) : null,
      location || null
    );

    const user = getPublicUser(info.lastInsertRowid);
    res.status(201).json({ token: sign(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// LOGIN
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = getPublicUser(row.id);
    res.json({ token: sign(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GOOGLE SIGN-IN
router.post('/google', async (req, res) => {
  try {
    const { credential, demo } = req.body || {};
    const clientId = process.env.GOOGLE_CLIENT_ID;
    let email, full_name;

    if (credential && clientId) {
      const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.aud !== clientId) return res.status(401).json({ error: 'Invalid Google token' });
      if (!data.email) return res.status(401).json({ error: 'Google token has no email' });
      if (String(data.email_verified) !== 'true') return res.status(401).json({ error: 'Google email not verified' });
      email = String(data.email).toLowerCase();
      full_name = data.name || email.split('@')[0];
    } else if (demo && (!clientId || process.env.DEMO_MODE === 'true')) {
      email = 'google.demo@handyman.app';
      full_name = 'Google Demo User';
    } else {
      return res.status(400).json({ error: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID in backend/.env.' });
    }

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      const randomPassword = crypto.randomBytes(24).toString('hex');
      const info = db.prepare(`
        INSERT INTO users (email, password_hash, role, full_name, location)
        VALUES (?, ?, 'client', ?, ?)
      `).run(email, bcrypt.hashSync(randomPassword, 10), full_name, null);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }

    const pub = getPublicUser(user.id);
    res.json({ token: sign(pub), user: pub });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ME
router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    const user = getPublicUser(payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  });
});

module.exports = router;
