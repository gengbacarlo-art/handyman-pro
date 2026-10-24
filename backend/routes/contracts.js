const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const round2 = n => Math.round(n * 100) / 100;

function contractForUser(id, user) {
  const c = db.prepare(`
    SELECT c.*, j.title AS job_title, j.description AS job_description, j.category, j.budget_type,
      cl.full_name AS client_name, cl.location AS client_location, cl.created_at AS client_since,
      h.full_name AS handyman_name, h.title AS handyman_title,
      h.location AS handyman_location, h.category AS handyman_category
    FROM contracts c
    JOIN jobs j ON j.id = c.job_id
    JOIN users cl ON cl.id = c.client_id
    JOIN users h ON h.id = c.handyman_id
    WHERE c.id = ?
  `).get(id);

  if (!c) return { error: 'Contract not found', status: 404 };
  if (user.role !== 'admin' && user.id !== c.client_id && user.id !== c.handyman_id) {
    return { error: 'Not authorized', status: 403 };
  }
  return { contract: c };
}

// List my contracts
router.get('/contracts', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, j.title AS job_title, j.category,
      cl.full_name AS client_name, h.full_name AS handyman_name,
      (SELECT COALESCE(ROUND(SUM(m.amount), 2), 0) FROM milestones m WHERE m.contract_id = c.id AND m.status = 'approved') AS released,
      (SELECT COALESCE(ROUND(SUM(m.amount), 2), 0) FROM milestones m WHERE m.contract_id = c.id AND m.status IN ('funded', 'submitted')) AS in_escrow,
      (SELECT COUNT(*) FROM milestones m WHERE m.contract_id = c.id) AS milestones_count,
      (SELECT COUNT(*) FROM milestones m WHERE m.contract_id = c.id AND m.status = 'approved') AS milestones_approved
    FROM contracts c
    JOIN jobs j ON j.id = c.job_id
    JOIN users cl ON cl.id = c.client_id
    JOIN users h ON h.id = c.handyman_id
    WHERE c.client_id = ? OR c.handyman_id = ?
    ORDER BY c.started_at DESC
  `).all(req.user.id, req.user.id);

  res.json({ contracts: rows });
});

// Contract detail with milestones, messages and reviews
router.get('/contracts/:id', authenticateToken, (req, res) => {
  const result = contractForUser(req.params.id, req.user);
  if (result.error) return res.status(result.status).json({ error: result.error });
  const c = result.contract;

  const milestones = db.prepare('SELECT * FROM milestones WHERE contract_id = ? ORDER BY id ASC').all(c.id);
  const messages = db.prepare(`
    SELECT m.*, u.full_name AS sender_name, u.role AS sender_role
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.contract_id = ?
    ORDER BY m.created_at ASC, m.id ASC
  `).all(c.id);
  const reviews = db.prepare(`
    SELECT r.*, u.full_name AS reviewer_name
    FROM reviews r
    JOIN users u ON u.id = r.reviewer_id
    WHERE r.contract_id = ?
  `).all(c.id);

  const released = round2(milestones.filter(m => m.status === 'approved').reduce((s, m) => s + m.amount, 0));
  const in_escrow = round2(milestones.filter(m => ['funded', 'submitted'].includes(m.status)).reduce((s, m) => s + m.amount, 0));
  const myReview = reviews.find(r => r.reviewer_id === req.user.id) || null;
  const theirReview = reviews.find(r => r.reviewer_id !== req.user.id) || null;

  res.json({
    contract: c,
    milestones,
    messages,
    reviews,
    my_review: myReview,
    their_review: theirReview,
    can_review: c.status === 'completed' && !myReview,
    released,
    in_escrow,
    role: req.user.id === c.client_id ? 'client' : (req.user.id === c.handyman_id ? 'handyman' : 'admin')
  });
});

// Add a milestone (client, active contract)
router.post('/contracts/:id/milestones', authenticateToken, (req, res) => {
  const result = contractForUser(req.params.id, req.user);
  if (result.error) return res.status(result.status).json({ error: result.error });
  const c = result.contract;

  if (c.client_id !== req.user.id) return res.status(403).json({ error: 'Only the client can add milestones' });
  if (c.status !== 'active') return res.status(400).json({ error: 'Contract is not active' });

  const { title, amount, due_date } = req.body;
  const value = Number(amount);
  if (!title || !Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: 'Milestone title and a positive amount are required' });
  }

  const existing = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM milestones WHERE contract_id = ?').get(c.id).total;
  if (round2(existing + value) > round2(c.total_amount) + 0.001) {
    return res.status(400).json({ error: `Milestones cannot exceed the contract total ($${c.total_amount.toFixed(2)})` });
  }

  const info = db.prepare('INSERT INTO milestones (contract_id, title, amount, due_date) VALUES (?, ?, ?, ?)')
    .run(c.id, title, round2(value), due_date || null);
  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ milestone });
});

// Update a pending milestone (client)
router.patch('/contracts/:id/milestones/:mid', authenticateToken, (req, res) => {
  const result = contractForUser(req.params.id, req.user);
  if (result.error) return res.status(result.status).json({ error: result.error });
  const c = result.contract;

  if (c.client_id !== req.user.id) return res.status(403).json({ error: 'Only the client can edit milestones' });
  if (c.status !== 'active') return res.status(400).json({ error: 'Contract is not active' });

  const m = db.prepare('SELECT * FROM milestones WHERE id = ? AND contract_id = ?').get(req.params.mid, c.id);
  if (!m) return res.status(404).json({ error: 'Milestone not found' });
  if (m.status !== 'pending') return res.status(400).json({ error: 'Only pending milestones can be edited' });

  const title = String(req.body.title || m.title).trim();
  const amount = req.body.amount !== undefined ? Number(req.body.amount) : m.amount;
  if (!title || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Title and a positive amount are required' });
  }

  const others = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM milestones WHERE contract_id = ? AND id != ?')
    .get(c.id, m.id).total;
  if (round2(others + amount) > round2(c.total_amount) + 0.001) {
    return res.status(400).json({ error: `Milestones cannot exceed the contract total ($${c.total_amount.toFixed(2)})` });
  }

  const due = req.body.due_date !== undefined ? (req.body.due_date || null) : m.due_date;
  db.prepare('UPDATE milestones SET title = ?, amount = ?, due_date = ? WHERE id = ?')
    .run(title, round2(amount), due, m.id);

  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(m.id);
  res.json({ milestone });
});

// Delete a pending milestone (client)
router.delete('/contracts/:id/milestones/:mid', authenticateToken, (req, res) => {
  const result = contractForUser(req.params.id, req.user);
  if (result.error) return res.status(result.status).json({ error: result.error });
  const c = result.contract;

  if (c.client_id !== req.user.id) return res.status(403).json({ error: 'Only the client can delete milestones' });
  if (c.status !== 'active') return res.status(400).json({ error: 'Contract is not active' });

  const m = db.prepare('SELECT * FROM milestones WHERE id = ? AND contract_id = ?').get(req.params.mid, c.id);
  if (!m) return res.status(404).json({ error: 'Milestone not found' });
  if (m.status !== 'pending') return res.status(400).json({ error: 'Only pending milestones can be deleted' });

  db.prepare('DELETE FROM milestones WHERE id = ?').run(m.id);
  res.json({ message: 'Milestone deleted' });
});

// Send a message (contract participant)
router.post('/contracts/:id/messages', authenticateToken, (req, res) => {
  const result = contractForUser(req.params.id, req.user);
  if (result.error) return res.status(result.status).json({ error: result.error });
  const c = result.contract;

  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
  if (body.length > 4000) return res.status(400).json({ error: 'Message is too long' });

  const info = db.prepare('INSERT INTO messages (contract_id, sender_id, body) VALUES (?, ?, ?)')
    .run(c.id, req.user.id, body);
  const message = db.prepare(`
    SELECT m.*, u.full_name AS sender_name, u.role AS sender_role
    FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json({ message });
});

module.exports = router;
