const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken, requireRole('admin'));

// Platform stats
router.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE role = 'client') AS clients,
      (SELECT COUNT(*) FROM users WHERE role = 'handyman') AS handymen,
      (SELECT COUNT(*) FROM jobs) AS jobs,
      (SELECT COUNT(*) FROM jobs WHERE status = 'open') AS open_jobs,
      (SELECT COUNT(*) FROM jobs WHERE status = 'in_progress') AS jobs_in_progress,
      (SELECT COUNT(*) FROM jobs WHERE status = 'completed') AS jobs_completed,
      (SELECT COUNT(*) FROM proposals) AS proposals,
      (SELECT COUNT(*) FROM contracts) AS contracts,
      (SELECT COUNT(*) FROM contracts WHERE status = 'active') AS active_contracts,
      (SELECT COUNT(*) FROM contracts WHERE status = 'completed') AS completed_contracts,
      (SELECT COALESCE(SUM(platform_fee), 0) FROM transactions WHERE type = 'release') AS platform_revenue,
      (SELECT COALESCE(SUM(handyman_amount), 0) FROM transactions WHERE type = 'release') AS handyman_payouts,
      (SELECT COALESCE(SUM(amount), 0) FROM milestones WHERE status IN ('funded', 'submitted')) AS escrow
  `).get();

  const round = n => Math.round(n * 100) / 100;
  stats.platform_revenue = round(stats.platform_revenue);
  stats.handyman_payouts = round(stats.handyman_payouts);
  stats.escrow = round(stats.escrow);
  res.json(stats);
});

// Users
router.get('/users', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.email, u.role, u.full_name, u.title, u.category, u.hourly_rate,
      u.location, u.created_at,
      (SELECT COUNT(*) FROM jobs j WHERE j.client_id = u.id) AS jobs_posted,
      (SELECT COUNT(*) FROM proposals p WHERE p.handyman_id = u.id) AS proposals_sent,
      (SELECT COUNT(*) FROM contracts c WHERE c.handyman_id = u.id AND c.status = 'completed') AS completed_contracts
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  res.json({ users: rows });
});

// Jobs
router.get('/jobs', (req, res) => {
  const rows = db.prepare(`
    SELECT j.*, u.full_name AS client_name,
      (SELECT COUNT(*) FROM proposals p WHERE p.job_id = j.id) AS proposals_count
    FROM jobs j JOIN users u ON u.id = j.client_id
    ORDER BY j.created_at DESC
  `).all();
  res.json({ jobs: rows });
});

// Contracts
router.get('/contracts', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, j.title AS job_title,
      cl.full_name AS client_name, h.full_name AS handyman_name,
      (SELECT COALESCE(SUM(m.amount), 0) FROM milestones m WHERE m.contract_id = c.id AND m.status = 'approved') AS released
    FROM contracts c
    JOIN jobs j ON j.id = c.job_id
    JOIN users cl ON cl.id = c.client_id
    JOIN users h ON h.id = c.handyman_id
    ORDER BY c.started_at DESC
  `).all();
  res.json({ contracts: rows });
});

// Change a user's role
router.patch('/users/:id/role', (req, res) => {
  const { role } = req.body;
  if (!['client', 'handyman', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ message: 'Role updated' });
});

module.exports = router;
