const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Create a job post (client)
router.post('/', authenticateToken, requireRole('client', 'admin'), (req, res) => {
  try {
    const {
      title, description, category, skills, budget_type,
      budget_min, budget_max, duration, experience_level
    } = req.body;

    if (!title || !description || !category || budget_min === undefined) {
      return res.status(400).json({ error: 'Title, description, category and budget are required' });
    }

    const type = budget_type === 'hourly' ? 'hourly' : 'fixed';
    const min = Number(budget_min);
    const max = budget_max !== undefined && budget_max !== '' ? Number(budget_max) : min;
    if (!Number.isFinite(min) || min <= 0) return res.status(400).json({ error: 'Invalid budget' });

    const info = db.prepare(`
      INSERT INTO jobs (client_id, title, description, category, skills, budget_type, budget_min, budget_max, duration, experience_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, title, description, category,
      skills || null, type, min, max,
      duration || null, experience_level || 'intermediate'
    );

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ job });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List jobs
router.get('/', authenticateToken, (req, res) => {
  const { scope, q, category } = req.query;
  const where = [];
  const params = [];

  if (scope === 'mine') {
    where.push('j.client_id = ?');
    params.push(req.user.id);
  } else if (scope === 'open') {
    where.push("j.status = 'open'");
  } else {
    // Default: role-aware feed
    if (req.user.role === 'client') {
      where.push('j.client_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'handyman') {
      where.push("j.status = 'open'");
    }
  }

  if (q) {
    where.push('(j.title LIKE ? OR j.description LIKE ? OR j.skills LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (category) { where.push('j.category = ?'); params.push(category); }

  const sql = `
    SELECT j.*, u.full_name AS client_name, u.location AS client_location,
      (SELECT COUNT(*) FROM proposals p WHERE p.job_id = j.id) AS proposals_count,
      (SELECT p.status FROM proposals p WHERE p.job_id = j.id AND p.handyman_id = ?) AS my_proposal_status
    FROM jobs j
    JOIN users u ON u.id = j.client_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY j.created_at DESC
    LIMIT 100
  `;
  const rows = db.prepare(sql).all(req.user.id, ...params);
  res.json({ jobs: rows });
});

// Job detail
router.get('/:id', authenticateToken, (req, res) => {
  const job = db.prepare(`
    SELECT j.*, u.full_name AS client_name, u.location AS client_location,
      u.created_at AS client_since,
      (SELECT COUNT(*) FROM jobs j2 WHERE j2.client_id = j.client_id) AS client_jobs_posted,
      (SELECT COUNT(*) FROM proposals p WHERE p.job_id = j.id) AS proposals_count
    FROM jobs j
    JOIN users u ON u.id = j.client_id
    WHERE j.id = ?
  `).get(req.params.id);

  if (!job) return res.status(404).json({ error: 'Job not found' });

  const isOwner = req.user.id === job.client_id || req.user.role === 'admin';
  const myProposal = db.prepare('SELECT * FROM proposals WHERE job_id = ? AND handyman_id = ?').get(job.id, req.user.id);
  const contract = db.prepare('SELECT * FROM contracts WHERE job_id = ?').get(job.id);

  let proposals = [];
  if (isOwner) {
    proposals = db.prepare(`
      SELECT p.*, u.full_name AS handyman_name, u.title AS handyman_title,
        u.category AS handyman_category, u.hourly_rate, u.location AS handyman_location,
        u.experience_years,
        (SELECT COALESCE(ROUND(AVG(r.rating), 2), 0) FROM reviews r WHERE r.reviewee_id = u.id) AS rating,
        (SELECT COUNT(*) FROM reviews r WHERE r.reviewee_id = u.id) AS reviews_count,
        (SELECT COUNT(*) FROM contracts c WHERE c.handyman_id = u.id AND c.status = 'completed') AS completed_jobs
      FROM proposals p
      JOIN users u ON u.id = p.handyman_id
      WHERE p.job_id = ?
      ORDER BY p.created_at DESC
    `).all(job.id);
  }

  res.json({ job, proposals, my_proposal: myProposal || null, contract: contract || null, is_owner: isOwner });
});

// Update job status (client owner)
router.patch('/:id', authenticateToken, (req, res) => {
  const { status } = req.body;
  if (!['cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.client_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your job' });
  }
  if (job.status !== 'open') return res.status(400).json({ error: 'Only open jobs can be cancelled' });

  db.prepare("UPDATE jobs SET status = 'cancelled' WHERE id = ?").run(job.id);
  res.json({ message: 'Job cancelled' });
});

module.exports = router;
