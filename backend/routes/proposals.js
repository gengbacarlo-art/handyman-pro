const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const COMMISSION = 0.18;
const round2 = n => Math.round(n * 100) / 100;

// Submit a proposal (handyman)
router.post('/jobs/:jobId/proposals', authenticateToken, requireRole('handyman'), (req, res) => {
  try {
    const { cover_letter, bid_amount, bid_days } = req.body;
    if (!cover_letter || !bid_amount) return res.status(400).json({ error: 'Cover letter and bid are required' });

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'open') return res.status(400).json({ error: 'This job is no longer accepting proposals' });

    const existing = db.prepare('SELECT id FROM proposals WHERE job_id = ? AND handyman_id = ?').get(job.id, req.user.id);
    if (existing) return res.status(409).json({ error: 'You already submitted a proposal for this job' });

    const amount = Number(bid_amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid bid amount' });

    const info = db.prepare(`
      INSERT INTO proposals (job_id, handyman_id, cover_letter, bid_amount, bid_days)
      VALUES (?, ?, ?, ?, ?)
    `).run(job.id, req.user.id, cover_letter, amount, bid_days ? Number(bid_days) : null);

    const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ proposal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Proposals for a job (client owner / admin)
router.get('/jobs/:jobId/proposals', authenticateToken, (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.client_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const rows = db.prepare(`
    SELECT p.*, u.full_name AS handyman_name, u.title AS handyman_title,
      u.category AS handyman_category, u.hourly_rate, u.location AS handyman_location,
      u.experience_years,
      (SELECT COALESCE(ROUND(AVG(r.rating), 2), 0) FROM reviews r WHERE r.reviewee_id = u.id) AS rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.reviewee_id = u.id) AS reviews_count
    FROM proposals p
    JOIN users u ON u.id = p.handyman_id
    WHERE p.job_id = ?
    ORDER BY p.created_at DESC
  `).all(job.id);

  res.json({ proposals: rows });
});

// My proposals (handyman)
router.get('/proposals/mine', authenticateToken, requireRole('handyman'), (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, j.title AS job_title, j.category, j.budget_type, j.budget_min, j.budget_max,
      j.status AS job_status, u.full_name AS client_name, j.created_at AS job_created_at
    FROM proposals p
    JOIN jobs j ON j.id = p.job_id
    JOIN users u ON u.id = j.client_id
    WHERE p.handyman_id = ?
    ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json({ proposals: rows });
});

// Shortlist / reject / hire a proposal (client owner)
router.patch('/proposals/:id', authenticateToken, requireRole('client', 'admin'), (req, res) => {
  try {
    const { action } = req.body;
    if (!['shortlist', 'reject', 'hire'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const proposal = db.prepare(`
      SELECT p.*, j.client_id AS job_client_id, j.status AS job_status, j.title AS job_title,
        j.budget_type
      FROM proposals p
      JOIN jobs j ON j.id = p.job_id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.job_client_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your job' });
    }

    if (action !== 'hire') {
      db.prepare('UPDATE proposals SET status = ? WHERE id = ?')
        .run(action === 'shortlist' ? 'shortlisted' : 'rejected', proposal.id);
      return res.json({ message: `Proposal ${action === 'shortlist' ? 'shortlisted' : 'rejected'}` });
    }

    // HIRE
    if (proposal.job_status !== 'open') return res.status(400).json({ error: 'Job is not open' });
    if (proposal.status === 'hired') return res.status(400).json({ error: 'Proposal already hired' });
    if (proposal.status === 'rejected') return res.status(400).json({ error: 'Rejected proposals cannot be hired' });

    const total = proposal.budget_type === 'hourly'
      ? round2(proposal.bid_amount * 40)   // estimated 40-hour block for hourly contracts
      : round2(proposal.bid_amount);
    const platform_fee = round2(total * COMMISSION);
    const handyman_amount = round2(total - platform_fee);

    const hire = db.transaction(() => {
      const c = db.prepare(`
        INSERT INTO contracts (job_id, client_id, handyman_id, proposal_id, total_amount, platform_fee, handyman_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(proposal.job_id, proposal.job_client_id, proposal.handyman_id, proposal.id, total, platform_fee, handyman_amount);

      db.prepare(`
        INSERT INTO milestones (contract_id, title, amount)
        VALUES (?, ?, ?)
      `).run(c.lastInsertRowid, proposal.budget_type === 'hourly' ? 'First 40-hour work block' : 'Project milestone', total);

      db.prepare("UPDATE proposals SET status = 'hired' WHERE id = ?").run(proposal.id);
      db.prepare("UPDATE proposals SET status = 'rejected' WHERE job_id = ? AND id != ?").run(proposal.job_id, proposal.id);
      db.prepare("UPDATE jobs SET status = 'in_progress' WHERE id = ?").run(proposal.job_id);

      db.prepare(`
        INSERT INTO messages (contract_id, sender_id, body)
        VALUES (?, ?, ?)
      `).run(c.lastInsertRowid, req.user.id, `Hi! I'm excited to work with you on "${proposal.job_title}". Let's get started.`);

      return c.lastInsertRowid;
    });

    const contractId = hire();
    res.json({ message: 'Proposal hired — contract created', contract_id: contractId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
