const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const COMMISSION = 0.18;
const DEMO_MODE = !process.env.STRIPE_SECRET_KEY || process.env.DEMO_MODE === 'true';
const stripe = DEMO_MODE ? null : require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create PaymentIntent for a job (client pays; 18% platform fee, 82% to handyman)
router.post('/create-intent', authenticateToken, requireRole('client'), async (req, res) => {
  try {
    const { job_id } = req.body;
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND client_id = ?').get(job_id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found or not yours' });
    if (job.status !== 'pending' && job.status !== 'accepted') return res.status(400).json({ error: 'Job is not awaiting payment' });

    if (DEMO_MODE) {
      const fakeId = 'demo_pi_' + Date.now() + '_' + job.id;
      db.prepare(
        'INSERT INTO payments (job_id, amount, status, stripe_payment_intent_id) VALUES (?, ?, ?, ?)'
      ).run(job.id, job.total_amount, 'pending', fakeId);
      return res.json({
        clientSecret: 'demo_secret',
        paymentIntentId: fakeId,
        demo: true,
        breakdown: { total: job.total_amount, platform_fee: job.platform_fee, handyman_earning: job.handyman_earning }
      });
    }

    // Real Stripe flow
    const profile = db.prepare('SELECT stripe_account_id FROM handymen_profiles WHERE user_id = ?').get(job.handyman_id);
    const stripeAccountId = profile ? profile.stripe_account_id : null;

    const amountCents = Math.round(job.total_amount * 100);
    const applicationFeeCents = Math.round(job.platform_fee * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      application_fee_amount: applicationFeeCents,
      transfer_data: stripeAccountId ? { destination: stripeAccountId } : undefined,
      metadata: {
        job_id: job.id,
        platform_fee: job.platform_fee,
        handyman_earning: job.handyman_earning,
      },
    });

    db.prepare(
      'INSERT INTO payments (job_id, amount, status, stripe_payment_intent_id) VALUES (?, ?, ?, ?)'
    ).run(job.id, job.total_amount, 'pending', paymentIntent.id);

    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Confirm payment (client)
router.post('/confirm', authenticateToken, requireRole('client'), async (req, res) => {
  try {
    const { payment_intent_id, job_id } = req.body;

    const payment = db.prepare('SELECT * FROM payments WHERE stripe_payment_intent_id = ?').get(payment_intent_id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    if (!DEMO_MODE) {
      const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (pi.status !== 'succeeded') {
        return res.json({ status: pi.status });
      }
    }

    db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('completed', payment.id);
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run('completed', job_id);

    const job = db.prepare('SELECT handyman_id FROM jobs WHERE id = ?').get(job_id);
    if (job && job.handyman_id) {
      db.prepare('UPDATE handymen_profiles SET total_jobs = total_jobs + 1 WHERE user_id = ?').run(job.handyman_id);
    }

    res.json({
      status: 'completed',
      message: DEMO_MODE
        ? 'Payment simulated (demo mode). Handyman credited 82%; platform kept 18%.'
        : 'Payment successful. Handyman received 82%; platform kept 18%.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Stripe Connect onboarding link (handyman)
router.post('/connect-onboard', authenticateToken, requireRole('handyman'), async (req, res) => {
  try {
    if (DEMO_MODE) {
      return res.status(400).json({ error: 'Demo mode: Stripe Connect onboarding is disabled. Add real Stripe keys to enable.' });
    }
    const profile = db.prepare('SELECT stripe_account_id FROM handymen_profiles WHERE user_id = ?').get(req.user.id);
    if (!profile || !profile.stripe_account_id) {
      return res.status(404).json({ error: 'No Stripe Connect account found' });
    }

    const accountLink = await stripe.accountLinks.create({
      account: profile.stripe_account_id,
      refresh_url: 'http://localhost:4000/api/payments/connect-reauth',
      return_url: 'http://localhost:4000/api/payments/connect-success',
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Earnings for handyman (82% share)
router.get('/earnings', authenticateToken, requireRole('handyman'), (req, res) => {
  const rows = db.prepare(`
    SELECT j.id, j.title, j.total_amount, j.platform_fee, j.handyman_earning, j.status, j.created_at
    FROM jobs j
    WHERE j.handyman_id = ?
    ORDER BY j.created_at DESC
  `).all(req.user.id);

  const totalEarnings = rows
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + (r.handyman_earning || 0), 0);

  const pendingEarnings = rows
    .filter(r => r.status !== 'completed' && r.status !== 'cancelled')
    .reduce((sum, r) => sum + (r.handyman_earning || 0), 0);

  const commissionPaid = rows
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + (r.platform_fee || 0), 0);

  res.json({
    jobs: rows,
    total_earnings: totalEarnings,
    pending_earnings: pendingEarnings,
    commission_paid: commissionPaid
  });
});

// Admin: platform revenue (18%)
router.get('/admin/revenue', authenticateToken, requireRole('admin'), (req, res) => {
  const row = db.prepare(`
    SELECT COALESCE(SUM(platform_fee), 0) as platform_revenue,
           COALESCE(SUM(handyman_earning), 0) as handyman_payouts,
           COUNT(*) as completed_jobs
    FROM jobs
    WHERE status = 'completed'
  `).get();
  res.json(row);
});

module.exports = router;
