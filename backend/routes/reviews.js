const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Leave a review for a handyman after a completed job
router.post('/', authenticateToken, requireRole('client'), (req, res) => {
  try {
    const { job_id, rating, comment } = req.body;

    if (!job_id || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Job ID and rating (1-5) are required' });
    }

    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND client_id = ? AND status = ?').get(job_id, req.user.id, 'completed');
    if (!job) {
      return res.status(403).json({ error: 'Job not found, not yours, or not completed' });
    }

    // Check if review already exists
    const existing = db.prepare('SELECT id FROM reviews WHERE job_id = ?').get(job_id);
    if (existing) {
      return res.status(409).json({ error: 'Review already exists for this job' });
    }

    db.prepare(
      'INSERT INTO reviews (job_id, client_id, handyman_id, rating, comment) VALUES (?, ?, ?, ?, ?)'
    ).run(job_id, req.user.id, job.handyman_id, rating, comment || null);

    // Recalculate handyman average rating
    const stats = db.prepare(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews
      FROM reviews
      WHERE handyman_id = ?
    `).get(job.handyman_id);

    const newRating = parseFloat(stats.avg_rating.toFixed(2));
    db.prepare('UPDATE handymen_profiles SET rating = ? WHERE user_id = ?').run(newRating, job.handyman_id);

    res.status(201).json({ message: 'Review submitted', rating: newRating });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reviews for a handyman
router.get('/handyman/:handymanId', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.full_name AS client_name
    FROM reviews r
    LEFT JOIN users u ON u.id = r.client_id
    WHERE r.handyman_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.handymanId);
  res.json({ reviews: rows });
});

// Get reviews by current client (their own reviews)
router.get('/me', authenticateToken, requireRole('client'), (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, j.title as job_title, u.full_name as handyman_name
    FROM reviews r
    LEFT JOIN jobs j ON j.id = r.job_id
    LEFT JOIN users u ON u.id = r.handyman_id
    WHERE r.client_id = ?
    ORDER BY r.created_at DESC
  `).all(req.user.id);
  res.json({ reviews: rows });
});

module.exports = router;
