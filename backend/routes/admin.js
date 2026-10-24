const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Dashboard stats
router.get('/stats', authenticateToken, requireRole('admin'), (req, res) => {
  const users = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  const handymen = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'handyman'").get().c;
  const clients = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'client'").get().c;
  const jobs = db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
  const completed = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'completed'").get().c;
  const pending = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'pending'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(platform_fee), 0) as total FROM jobs WHERE status = 'completed'").get().total;

  res.json({ users, handymen, clients, jobs, completed, pending, platform_revenue: revenue });
});

// All users
router.get('/users', authenticateToken, requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT id, email, role, full_name, phone, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users: rows });
});

// All jobs
router.get('/jobs', authenticateToken, requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT j.*, u1.full_name AS client_name, u2.full_name AS handyman_name
    FROM jobs j
    LEFT JOIN users u1 ON u1.id = j.client_id
    LEFT JOIN users u2 ON u2.id = j.handyman_id
    ORDER BY j.created_at DESC
  `).all();
  res.json({ jobs: rows });
});

// Make user admin
router.patch('/users/:id/role', authenticateToken, requireRole('admin'), (req, res) => {
  const { role } = req.body;
  if (!['client', 'handyman', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ message: 'Role updated' });
});

module.exports = router;
