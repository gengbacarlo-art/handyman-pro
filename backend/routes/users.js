const express = require('express');
const router = express.Router();
const db = require('../db');

// Get handyman profile by id
router.get('/handymen/:id', (req, res) => {
  const row = db.prepare(`
    SELECT u.id, u.full_name, u.phone, u.address, u.created_at,
           h.category, h.hourly_rate, h.bio, h.experience_years, h.is_available, h.rating, h.total_jobs
    FROM users u
    JOIN handymen_profiles h ON h.user_id = u.id
    WHERE u.id = ? AND u.role = 'handyman'
  `).get(req.params.id);

  if (!row) return res.status(404).json({ error: 'Handyman not found' });
  res.json({ handyman: row });
});

// List all handymen (with optional category filter)
router.get('/handymen', (req, res) => {
  const { category } = req.query;
  let sql = `
    SELECT u.id, u.full_name, u.phone, u.address,
           h.category, h.hourly_rate, h.bio, h.experience_years, h.is_available, h.rating, h.total_jobs
    FROM users u
    JOIN handymen_profiles h ON h.user_id = u.id
    WHERE u.role = 'handyman'
  `;
  const params = [];
  if (category) {
    sql += ' AND h.category = ?';
    params.push(category);
  }
  sql += ' ORDER BY h.rating DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ handymen: rows });
});

// Update own profile
router.patch('/profile', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });

  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });

    const { full_name, phone, address } = req.body;
    db.prepare('UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), address = COALESCE(?, address) WHERE id = ?')
      .run(full_name, phone, address, user.id);

    res.json({ message: 'Profile updated' });
  });
});

module.exports = router;
