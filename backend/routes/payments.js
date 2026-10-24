const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const COMMISSION = 0.18;
const round2 = n => Math.round(n * 100) / 100;

function getMilestone(id) {
  return db.prepare(`
    SELECT m.*, c.client_id, c.handyman_id, c.status AS contract_status, c.total_amount,
      c.job_id, j.title AS job_title
    FROM milestones m
    JOIN contracts c ON c.id = m.contract_id
    JOIN jobs j ON j.id = c.job_id
    WHERE m.id = ?
  `).get(id);
}

// Fund a milestone (client -> escrow)
router.post('/payments/milestones/:id/fund', authenticateToken, (req, res) => {
  try {
    const m = getMilestone(req.params.id);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (m.client_id !== req.user.id) return res.status(403).json({ error: 'Only the client can fund milestones' });
    if (m.contract_status !== 'active') return res.status(400).json({ error: 'Contract is not active' });
    if (m.status !== 'pending') return res.status(400).json({ error: 'Milestone is not awaiting funding' });

    const fund = db.transaction(() => {
      db.prepare("UPDATE milestones SET status = 'funded', funded_at = CURRENT_TIMESTAMP WHERE id = ?").run(m.id);
      db.prepare(`
        INSERT INTO transactions (contract_id, milestone_id, client_id, handyman_id, amount, platform_fee, handyman_amount, type)
        VALUES (?, ?, ?, ?, ?, 0, 0, 'fund')
      `).run(m.contract_id, m.id, m.client_id, m.handyman_id, m.amount);
    });
    fund();

    res.json({ message: `$${m.amount.toFixed(2)} funded into escrow`, demo: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit work for a funded milestone (handyman)
router.post('/payments/milestones/:id/submit', authenticateToken, (req, res) => {
  try {
    const m = getMilestone(req.params.id);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (m.handyman_id !== req.user.id) return res.status(403).json({ error: 'Not your contract' });
    if (m.status !== 'funded') return res.status(400).json({ error: 'Milestone must be funded before submitting work' });

    db.prepare("UPDATE milestones SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE id = ?").run(m.id);
    db.prepare('INSERT INTO messages (contract_id, sender_id, body) VALUES (?, ?, ?)')
      .run(m.contract_id, req.user.id, `I've submitted "${m.title}" for your review.`);

    res.json({ message: 'Work submitted for client approval' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Request changes (client): submitted -> funded
router.post('/payments/milestones/:id/request-changes', authenticateToken, (req, res) => {
  try {
    const m = getMilestone(req.params.id);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (m.client_id !== req.user.id) return res.status(403).json({ error: 'Only the client can request changes' });
    if (m.status !== 'submitted') return res.status(400).json({ error: 'Milestone is not awaiting approval' });

    const note = (req.body.note || '').trim();
    db.prepare("UPDATE milestones SET status = 'funded', submitted_at = NULL WHERE id = ?").run(m.id);
    db.prepare('INSERT INTO messages (contract_id, sender_id, body) VALUES (?, ?, ?)')
      .run(m.contract_id, req.user.id, note ? `Changes requested: ${note}` : 'I requested changes on the submitted work.');

    res.json({ message: 'Changes requested' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve & release payment (client): submitted -> approved, 82% handyman / 18% platform
router.post('/payments/milestones/:id/approve', authenticateToken, (req, res) => {
  try {
    const m = getMilestone(req.params.id);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (m.client_id !== req.user.id) return res.status(403).json({ error: 'Only the client can approve work' });
    if (m.status !== 'submitted') return res.status(400).json({ error: 'Milestone is not awaiting approval' });

    const fee = round2(m.amount * COMMISSION);
    const payout = round2(m.amount - fee);

    const approve = db.transaction(() => {
      db.prepare("UPDATE milestones SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id = ?").run(m.id);
      db.prepare(`
        INSERT INTO transactions (contract_id, milestone_id, client_id, handyman_id, amount, platform_fee, handyman_amount, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'release')
      `).run(m.contract_id, m.id, m.client_id, m.handyman_id, m.amount, fee, payout);

      const remaining = db.prepare("SELECT COUNT(*) AS n FROM milestones WHERE contract_id = ? AND status != 'approved'").get(m.contract_id).n;
      if (remaining === 0) {
        db.prepare("UPDATE contracts SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(m.contract_id);
        db.prepare("UPDATE jobs SET status = 'completed' WHERE id = ?").run(m.job_id);
      }
      db.prepare('INSERT INTO messages (contract_id, sender_id, body) VALUES (?, ?, ?)')
        .run(m.contract_id, req.user.id, `Payment released for "${m.title}". Thanks for the great work!`);
    });
    approve();

    res.json({
      message: `Payment released — handyman received $${payout.toFixed(2)}, platform fee $${fee.toFixed(2)}`,
      handyman_amount: payout,
      platform_fee: fee
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Earnings / spend summary
router.get('/payments/summary', authenticateToken, (req, res) => {
  if (req.user.role === 'admin') {
    const released = db.prepare(`
      SELECT COALESCE(SUM(platform_fee), 0) AS platform_revenue,
             COALESCE(SUM(handyman_amount), 0) AS handyman_payouts
      FROM transactions WHERE type = 'release'
    `).get();
    const escrow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM milestones WHERE status IN ('funded', 'submitted')
    `).get();
    const counts = db.prepare(`
      SELECT (SELECT COUNT(*) FROM users WHERE role = 'client') AS clients,
             (SELECT COUNT(*) FROM users WHERE role = 'handyman') AS handymen,
             (SELECT COUNT(*) FROM jobs WHERE status = 'open') AS open_jobs,
             (SELECT COUNT(*) FROM contracts WHERE status = 'active') AS active_contracts,
             (SELECT COUNT(*) FROM contracts WHERE status = 'completed') AS completed_contracts
    `).get();
    return res.json({
      total_earned: round2(released.platform_revenue),
      platform_revenue: round2(released.platform_revenue),
      handyman_payouts: round2(released.handyman_payouts),
      in_escrow: round2(escrow.total),
      ...counts
    });
  }

  if (req.user.role === 'handyman') {
    const released = db.prepare(`
      SELECT COALESCE(SUM(handyman_amount), 0) AS earned,
             COALESCE(SUM(platform_fee), 0) AS fees
      FROM transactions WHERE type = 'release' AND handyman_id = ?
    `).get(req.user.id);
    const escrow = db.prepare(`
      SELECT COALESCE(SUM(m.amount), 0) AS total
      FROM milestones m JOIN contracts c ON c.id = m.contract_id
      WHERE c.handyman_id = ? AND m.status IN ('funded', 'submitted')
    `).get(req.user.id);
    const counts = db.prepare(`
      SELECT (SELECT COUNT(*) FROM contracts WHERE handyman_id = ? AND status = 'active') AS active_contracts,
             (SELECT COUNT(*) FROM contracts WHERE handyman_id = ? AND status = 'completed') AS completed_contracts,
             (SELECT COUNT(*) FROM proposals WHERE handyman_id = ?) AS proposals_sent,
             (SELECT COUNT(*) FROM proposals WHERE handyman_id = ? AND status = 'hired') AS proposals_hired
    `).get(req.user.id, req.user.id, req.user.id, req.user.id);

    return res.json({
      total_earned: round2(released.earned),
      in_escrow: round2(escrow.total * (1 - COMMISSION)),
      fees_paid: round2(released.fees),
      ...counts
    });
  }

  // client
  const spent = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'release' AND client_id = ?
  `).get(req.user.id);
  const funded = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'fund' AND client_id = ?
  `).get(req.user.id);
  const escrow = db.prepare(`
    SELECT COALESCE(SUM(m.amount), 0) AS total
    FROM milestones m JOIN contracts c ON c.id = m.contract_id
    WHERE c.client_id = ? AND m.status IN ('funded', 'submitted')
  `).get(req.user.id);
  const counts = db.prepare(`
    SELECT (SELECT COUNT(*) FROM jobs WHERE client_id = ? AND status = 'open') AS open_jobs,
           (SELECT COUNT(*) FROM jobs WHERE client_id = ?) AS jobs_posted,
           (SELECT COUNT(*) FROM contracts WHERE client_id = ? AND status = 'active') AS active_contracts,
           (SELECT COUNT(*) FROM contracts WHERE client_id = ? AND status = 'completed') AS completed_contracts
  `).get(req.user.id, req.user.id, req.user.id, req.user.id);

  res.json({
    total_spent: round2(spent.total),
    total_funded: round2(funded.total),
    in_escrow: round2(escrow.total),
    ...counts
  });
});

// Transaction history
router.get('/payments/transactions', authenticateToken, (req, res) => {
  let sql = `
    SELECT t.*, j.title AS job_title
    FROM transactions t
    JOIN contracts c ON c.id = t.contract_id
    JOIN jobs j ON j.id = c.job_id
  `;
  const params = [];
  if (req.user.role === 'handyman') {
    sql += ' WHERE t.handyman_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'client') {
    sql += ' WHERE t.client_id = ?';
    params.push(req.user.id);
  }
  sql += ' ORDER BY t.created_at DESC, t.id DESC LIMIT 100';
  res.json({ transactions: db.prepare(sql).all(...params) });
});

module.exports = router;
