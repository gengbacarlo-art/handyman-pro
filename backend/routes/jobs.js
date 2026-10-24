const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const COMMISSION = 0.18;

// Create job (client books a handyman)
router.post('/', authenticateToken, requireRole('client'), (req, res) => {
  try {
    const { handyman_id, category_id, title, description, address, scheduled_at, total_amount } = req.body;
    const client_id = req.user.id;

    if (!handyman_id || !title || !address || !scheduled_at || !total_amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const platform_fee = parseFloat((total_amount * COMMISSION).toFixed(2));
    const handyman_earning = parseFloat((total_amount * (1 - COMMISSION)).toFixed(2));

    const insert = db.prepare(
      `INSERT INTO jobs (client_id, handyman_id, category_id, title, description, address, scheduled_at, status, total_amount, platform_fee, handyman_earning)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    );
    const result = insert.run(client_id, handyman_id, category_id || null, title, description || null, address, scheduled_at, total_amount, platform_fee, handyman_earning);

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ job });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get job by id
router.get('/:id', authenticateToken, (req, res) => {
  const job = db.prepare(`
    SELECT j.*, u1.full_name AS client_name, u2.full_name AS handyman_name, c.name AS category_name
    FROM jobs j
    LEFT JOIN users u1 ON u1.id = j.client_id
    LEFT JOIN users u2 ON u2.id = j.handyman_id
    LEFT JOIN categories c ON c.id = j.category_id
    WHERE j.id = ?
  `).get(req.params.id);

  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Only client, handyman, or admin can view
  if (req.user.role !== 'admin' && req.user.id !== job.client_id && req.user.id !== job.handyman_id) {
    return res.status(403).json({ error: 'Not authorized to view this job' });
  }

  res.json({ job });
});

// List jobs for current user
router.get('/', authenticateToken, (req, res) => {
  let sql, params;
  if (req.user.role === 'client') {
    sql = `SELECT j.*, u.full_name AS handyman_name, c.name AS category_name
           FROM jobs j
           LEFT JOIN users u ON u.id = j.handyman_id
           LEFT JOIN categories c ON c.id = j.category_id
           WHERE j.client_id = ?
           ORDER BY j.created_at DESC`;
    params = [req.user.id];
  } else if (req.user.role === 'handyman') {
    sql = `SELECT j.*, u.full_name AS client_name, c.name AS category_name
           FROM jobs j
           LEFT JOIN users u ON u.id = j.client_id
           LEFT JOIN categories c ON c.id = j.category_id
           WHERE j.handyman_id = ?
           ORDER BY j.created_at DESC`;
    params = [req.user.id];
  } else {
    sql = `SELECT j.*, u1.full_name AS client_name, u2.full_name AS handyman_name, c.name AS category_name
           FROM jobs j
           LEFT JOIN users u1 ON u1.id = j.client_id
           LEFT JOIN users u2 ON u2.id = j.handyman_id
           LEFT JOIN categories c ON c.id = j.category_id
           ORDER BY j.created_at DESC`;
    params = [];
  }

  const rows = db.prepare(sql).all(...params);
  res.json({ jobs: rows });
});

// Update job status (accept, start, complete, cancel)
router.patch('/:id/status', authenticateToken, (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'];
  if (!status || !valid.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Handymen can accept/start/complete their own jobs; clients can cancel pending
  if (req.user.role === 'handyman' && req.user.id !== job.handyman_id) {
    return res.status(403).json({ error: 'Not your job' });
  }
  if (req.user.role === 'client' && req.user.id !== job.client_id) {
    return res.status(403).json({ error: 'Not your job' });
  }
  if (req.user.role === 'client' && status !== 'cancelled') {
    return res.status(403).json({ error: 'Clients can only cancel jobs' });
  }

  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: `Job status updated to ${status}` });
});

module.exports = router;
