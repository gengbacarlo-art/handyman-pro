const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const db = require('../db');

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, phone, role, address, category, hourly_rate, bio, experience_years } = req.body;

    if (!email || !password || !full_name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['client', 'handyman'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = bcrypt.hashSync(password, 10);

    const insertUser = db.prepare(
      'INSERT INTO users (email, password_hash, role, full_name, phone, address) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const userResult = insertUser.run(email, password_hash, role, full_name, phone || null, address || null);
    const userId = userResult.lastInsertRowid;

    let stripeAccountId = null;

    // If handyman, create Stripe Connect Express account + profile
    if (role === 'handyman') {
      if (stripe) {
        try {
          const account = await stripe.accounts.create({
            type: 'express',
            email,
            capabilities: {
              card_payments: { requested: true },
              transfers: { requested: true },
            },
            business_type: 'individual',
            individual: {
              email,
              first_name: full_name.split(' ')[0] || null,
              last_name: full_name.split(' ').slice(1).join(' ') || null,
            },
            settings: {
              payouts: { schedule: { interval: 'manual' } },
            },
          });
          stripeAccountId = account.id;
        } catch (e) {
          console.warn('Stripe Connect account creation skipped:', e.message);
        }
      } else {
        console.warn('Stripe not configured (demo mode) - skipping Connect account for', email);
      }

      const insertProfile = db.prepare(
        'INSERT INTO handymen_profiles (user_id, category, hourly_rate, bio, experience_years, stripe_account_id) VALUES (?, ?, ?, ?, ?, ?)'
      );
      insertProfile.run(
        userId,
        category || 'General Handyman',
        hourly_rate || 50,
        bio || null,
        experience_years || 0,
        stripeAccountId
      );
    }

    const token = jwt.sign(
      { id: userId, email, role, full_name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: userId, email, role, full_name, phone, address },
      stripeAccountId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// LOGIN
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name, phone: user.phone, address: user.address }
    });
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
      if (!r.ok || data.aud !== clientId) {
        return res.status(401).json({ error: 'Invalid Google token' });
      }
      if (String(data.email_verified) !== 'true') {
        return res.status(401).json({ error: 'Google email not verified' });
      }
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
      const randomPassword = require('crypto').randomBytes(24).toString('hex');
      const hash = bcrypt.hashSync(randomPassword, 10);
      const info = db.prepare(
        'INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)'
      ).run(email, hash, 'client', full_name);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name, phone: user.phone, address: user.address }
    });
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

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    const u = db.prepare('SELECT id, email, role, full_name, phone, address, created_at FROM users WHERE id = ?').get(user.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ user: u });
  });
});

module.exports = router;
