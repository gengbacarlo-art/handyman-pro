const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Leave a review after a completed contract
router.post('/contracts/:id/reviews', authenticateToken, (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if (req.user.id !== contract.client_id && req.user.id !== contract.handyman_id) {
      return res.status(403).json({ error: 'Not your contract' });
    }
    if (contract.status !== 'completed') {
      return res.status(400).json({ error: 'You can review after the contract is completed' });
    }

    const existing = db.prepare('SELECT id FROM reviews WHERE contract_id = ? AND reviewer_id = ?')
      .get(contract.id, req.user.id);
    if (existing) return res.status(409).json({ error: 'You already reviewed this contract' });

    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1–5' });
    }

    const reviewee = req.user.id === contract.client_id ? contract.handyman_id : contract.client_id;
    const comment = (req.body.comment || '').trim() || null;

    const info = db.prepare(`
      INSERT INTO reviews (contract_id, reviewer_id, reviewee_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(contract.id, req.user.id, reviewee, rating, comment);

    const review = db.prepare(`
      SELECT r.*, u.full_name AS reviewer_name
      FROM reviews r JOIN users u ON u.id = r.reviewer_id
      WHERE r.id = ?
    `).get(info.lastInsertRowid);

    res.status(201).json({ review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
