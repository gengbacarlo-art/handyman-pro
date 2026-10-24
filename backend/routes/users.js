const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const PROFILE_FIELDS = `u.id, u.email, u.role, u.full_name, u.title, u.overview, u.category,
  u.skills, u.hourly_rate, u.experience_years, u.location, u.availability, u.created_at`;

const STATS = `
  (SELECT COALESCE(ROUND(AVG(r.rating), 2), 0) FROM reviews r WHERE r.reviewee_id = u.id) AS rating,
  (SELECT COUNT(*) FROM reviews r WHERE r.reviewee_id = u.id) AS reviews_count,
  (SELECT COUNT(*) FROM contracts c WHERE c.handyman_id = u.id AND c.status = 'completed') AS total_jobs,
  (SELECT COALESCE(ROUND(SUM(t.handyman_amount), 2), 0) FROM transactions t
     WHERE t.handyman_id = u.id AND t.type = 'release') AS total_earned
`;

// List / search handymen
router.get('/handymen', (req, res) => {
  const { q, category, max_rate, sort } = req.query;
  let sql = `SELECT ${PROFILE_FIELDS}, ${STATS} FROM users u WHERE u.role = 'handyman'`;
  const params = [];

  if (q) {
    sql += ' AND (u.full_name LIKE ? OR u.title LIKE ? OR u.skills LIKE ? OR u.overview LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (category) { sql += ' AND u.category = ?'; params.push(category); }
  if (max_rate) { sql += ' AND u.hourly_rate <= ?'; params.push(Number(max_rate)); }

  if (sort === 'rate') sql += ' ORDER BY u.hourly_rate ASC';
  else if (sort === 'earnings') sql += ' ORDER BY total_earned DESC';
  else sql += ' ORDER BY rating DESC, reviews_count DESC, u.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json({ handymen: rows });
});

// Public profile + reviews
router.get('/handymen/:id', (req, res) => {
  const row = db.prepare(`SELECT ${PROFILE_FIELDS}, ${STATS} FROM users u WHERE u.id = ? AND u.role = 'handyman'`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Handyman not found' });

  const reviews = db.prepare(`
    SELECT r.*, u.full_name AS reviewer_name, j.title AS job_title
    FROM reviews r
    JOIN users u ON u.id = r.reviewer_id
    LEFT JOIN contracts c ON c.id = r.contract_id
    LEFT JOIN jobs j ON j.id = c.job_id
    WHERE r.reviewee_id = ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all(req.params.id);

  res.json({ handyman: row, reviews });
});

// My full profile
router.get('/me/profile', authenticateToken, (req, res) => {
  const row = db.prepare(`SELECT ${PROFILE_FIELDS}, ${STATS} FROM users u WHERE u.id = ?`).get(req.user.id);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ user: row });
});

// Update my profile
router.put('/me/profile', authenticateToken, (req, res) => {
  const {
    full_name, title, overview, category, skills, hourly_rate,
    experience_years, location, availability
  } = req.body;

  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'User not found' });

  db.prepare(`
    UPDATE users SET
      full_name = COALESCE(?, full_name),
      title = COALESCE(?, title),
      overview = COALESCE(?, overview),
      category = COALESCE(?, category),
      skills = COALESCE(?, skills),
      hourly_rate = COALESCE(?, hourly_rate),
      experience_years = COALESCE(?, experience_years),
      location = COALESCE(?, location),
      availability = COALESCE(?, availability)
    WHERE id = ?
  `).run(
    full_name || null,
    title || null,
    overview || null,
    category || null,
    skills || null,
    hourly_rate !== undefined && hourly_rate !== '' ? Number(hourly_rate) : null,
    experience_years !== undefined && experience_years !== '' ? Number(experience_years) : null,
    location || null,
    availability || null,
    req.user.id
  );

  const row = db.prepare(`SELECT ${PROFILE_FIELDS}, ${STATS} FROM users u WHERE u.id = ?`).get(req.user.id);
  res.json({ user: row, message: 'Profile updated' });
});

// Reviews received by a user
router.get('/:id/reviews', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.full_name AS reviewer_name, j.title AS job_title
    FROM reviews r
    JOIN users u ON u.id = r.reviewer_id
    LEFT JOIN contracts c ON c.id = r.contract_id
    LEFT JOIN jobs j ON j.id = c.job_id
    WHERE r.reviewee_id = ?
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all(req.params.id);
  res.json({ reviews: rows });
});

module.exports = router;
