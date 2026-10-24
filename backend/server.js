require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Demo seed — fresh Upwork-style marketplace
// ---------------------------------------------------------------------------
const hash = pw => bcrypt.hashSync(pw, 10);
const backdate = (table, id, days) =>
  db.prepare(`UPDATE ${table} SET created_at = datetime('now', ?) WHERE id = ?`).run(`-${days} days`, id);

function insertUser(u) {
  const info = db.prepare(`
    INSERT INTO users (email, password_hash, role, full_name, title, overview, category, skills,
      hourly_rate, experience_years, location, availability)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    u.email, hash(u.password), u.role, u.full_name,
    u.title || null, u.overview || null, u.category || null, u.skills || null,
    u.hourly_rate || null, u.experience_years || 0, u.location || null, u.availability || 'available'
  );
  return info.lastInsertRowid;
}

function insertJob(j) {
  const info = db.prepare(`
    INSERT INTO jobs (client_id, title, description, category, skills, budget_type,
      budget_min, budget_max, duration, experience_level, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    j.client_id, j.title, j.description, j.category, j.skills || null, j.budget_type,
    j.budget_min, j.budget_max, j.duration || null, j.experience_level || 'intermediate', j.status || 'open'
  );
  backdate('jobs', info.lastInsertRowid, j.days || 0);
  return info.lastInsertRowid;
}

function insertProposal(p) {
  const info = db.prepare(`
    INSERT INTO proposals (job_id, handyman_id, cover_letter, bid_amount, bid_days, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(p.job_id, p.handyman_id, p.cover_letter, p.bid_amount, p.bid_days || null, p.status || 'pending');
  backdate('proposals', info.lastInsertRowid, p.days || 0);
  return info.lastInsertRowid;
}

function insertContract(c) {
  const fee = Math.round(c.total_amount * 18) / 100;
  const payout = Math.round((c.total_amount - fee) * 100) / 100;
  const info = db.prepare(`
    INSERT INTO contracts (job_id, client_id, handyman_id, proposal_id, total_amount,
      platform_fee, handyman_amount, status, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    c.job_id, c.client_id, c.handyman_id, c.proposal_id || null, c.total_amount,
    fee, payout, c.status || 'active'
  );
  db.prepare(`UPDATE contracts SET started_at = datetime('now', ?) WHERE id = ?`)
    .run(`-${c.days || 0} days`, info.lastInsertRowid);
  if (c.status === 'completed') {
    db.prepare("UPDATE contracts SET completed_at = datetime('now', ?) WHERE id = ?")
      .run(`-${Math.max(1, (c.days || 1) - 1)} days`, info.lastInsertRowid);
  }
  return info.lastInsertRowid;
}

function insertMilestone(m) {
  const info = db.prepare(`
    INSERT INTO milestones (contract_id, title, amount, status, funded_at, submitted_at, approved_at)
    VALUES (?, ?, ?, ?, NULL, NULL, NULL)
  `).run(
    m.contract_id, m.title, m.amount, m.status
  );
  const id = info.lastInsertRowid;
  backdate('milestones', id, m.days || 0);
  if (m.funded_days != null) db.prepare("UPDATE milestones SET funded_at = datetime('now', ?) WHERE id = ?").run(`-${m.funded_days} days`, id);
  if (m.submitted_days != null) db.prepare("UPDATE milestones SET submitted_at = datetime('now', ?) WHERE id = ?").run(`-${m.submitted_days} days`, id);
  if (m.approved_days != null) db.prepare("UPDATE milestones SET approved_at = datetime('now', ?) WHERE id = ?").run(`-${m.approved_days} days`, id);
  return id;
}

function insertMessage(contract_id, sender_id, body, days) {
  const info = db.prepare('INSERT INTO messages (contract_id, sender_id, body) VALUES (?, ?, ?)').run(contract_id, sender_id, body);
  backdate('messages', info.lastInsertRowid, days || 0);
}

function insertTransaction(t) {
  const info = db.prepare(`
    INSERT INTO transactions (contract_id, milestone_id, client_id, handyman_id, amount,
      platform_fee, handyman_amount, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(t.contract_id, t.milestone_id, t.client_id, t.handyman_id, t.amount,
    t.platform_fee || 0, t.handyman_amount || 0, t.type);
  backdate('transactions', info.lastInsertRowid, t.days || 0);
}

function insertReview(r) {
  const info = db.prepare(`
    INSERT INTO reviews (contract_id, reviewer_id, reviewee_id, rating, comment)
    VALUES (?, ?, ?, ?, ?)
  `).run(r.contract_id, r.reviewer_id, r.reviewee_id, r.rating, r.comment || null);
  backdate('reviews', info.lastInsertRowid, r.days || 0);
}

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
  const admin = insertUser({ email: 'admin@handyman.app', password: 'admin123', role: 'admin', full_name: 'Platform Admin' });
  const alice = insertUser({ email: 'alice@client.com', password: 'password123', role: 'client', full_name: 'Alice Cooper', location: 'Austin, TX' });
  const dave = insertUser({ email: 'dave@client.com', password: 'password123', role: 'client', full_name: 'Dave Grohl', location: 'Denver, CO' });

  const bob = insertUser({
    email: 'bob@builder.com', password: 'password123', role: 'handyman', full_name: 'Bob Builder',
    title: 'Licensed Plumber & Pipefitting Specialist', category: 'Plumbing',
    skills: 'Plumbing, Pipefitting, Leak Repair, Water Heaters, Faucet Installation',
    hourly_rate: 75, experience_years: 10, location: 'Austin, TX',
    overview: 'Licensed master plumber with 10+ years of residential experience. I specialize in leak detection, faucet and fixture replacement, water heaters, and emergency repairs. Clean work, clear pricing, and I leave every job site better than I found it.'
  });
  const mary = insertUser({
    email: 'mary@mason.com', password: 'password123', role: 'handyman', full_name: 'Mary Mason',
    title: 'Certified Electrician & Lighting Designer', category: 'Electrical',
    skills: 'Electrical, Wiring, Lighting, Panel Upgrades, Smart Home',
    hourly_rate: 85, experience_years: 8, location: 'Austin, TX',
    overview: 'Certified electrician focused on safe, code-compliant work. From recessed lighting and ceiling fans to panel upgrades and smart-home installs, I bring precision and a tidy finish to every project.'
  });
  const carl = insertUser({
    email: 'carl@tiler.com', password: 'password123', role: 'handyman', full_name: 'Carl Tiler',
    title: 'Carpenter & Furniture Assembly Pro', category: 'Carpentry',
    skills: 'Carpentry, Furniture Assembly, Shelving, Doors, Drywall',
    hourly_rate: 60, experience_years: 12, location: 'Denver, CO',
    overview: 'Carpenter with 12 years of experience in custom shelving, door installation, furniture assembly, and small remodels. I work fast, measure twice, and guarantee the fit.'
  });
  const ana = insertUser({
    email: 'ana@painter.com', password: 'password123', role: 'handyman', full_name: 'Ana Ortiz',
    title: 'Interior Painter & Drywall Finisher', category: 'Painting',
    skills: 'Painting, Drywall, Wallpaper, Color Consulting, Trim',
    hourly_rate: 55, experience_years: 6, location: 'Denver, CO',
    overview: 'Interior painting specialist with an eye for color and detail. I handle prep, patching, priming, and clean two-coat finishes — plus wallpaper and trim work.'
  });
  const pete = insertUser({
    email: 'pete@plumb.com', password: 'password123', role: 'handyman', full_name: 'Pete Plumb',
    title: 'Emergency Plumber & Drain Specialist', category: 'Plumbing',
    skills: 'Plumbing, Drain Cleaning, Leak Repair, Emergency Repairs',
    hourly_rate: 70, experience_years: 7, location: 'Austin, TX',
    overview: 'Fast, friendly plumbing help for leaks, clogs, and fixtures. Available for same-day emergency calls around Austin.'
  });

  // Open jobs
  const job1 = insertJob({
    client_id: alice, days: 3,
    title: 'Fix leaking kitchen sink and replace faucet',
    description: 'The kitchen sink has been dripping under the cabinet for a week and the faucet cartridge is worn out. Looking for someone to diagnose the leak, replace the faucet (I already bought a Moen single-handle model), and check the supply lines. Please bring your own tools and sealant.',
    category: 'Plumbing', skills: 'Leak Repair, Faucet Installation',
    budget_type: 'fixed', budget_min: 200, budget_max: 300,
    duration: 'Less than 1 week', experience_level: 'intermediate'
  });
  const job2 = insertJob({
    client_id: dave, days: 2,
    title: 'Install 4 recessed ceiling lights',
    description: 'I have four 6-inch recessed LED lights ready to install in a finished living room ceiling. Need cutting, wiring, and patching. The attic is accessible. Must be comfortable working with existing wiring and leave the ceiling clean.',
    category: 'Electrical', skills: 'Lighting, Wiring',
    budget_type: 'fixed', budget_min: 350, budget_max: 450,
    duration: 'Less than 1 week', experience_level: 'intermediate'
  });
  const job3 = insertJob({
    client_id: alice, days: 1,
    title: 'Paint living room and hallway (2 coats)',
    description: 'Living room (~400 sq ft) and hallway need two coats of paint. Walls are currently a light beige; we want a warm white. Includes minor nail-hole patching and taping. Paint and supplies can be reimbursed or provided.',
    category: 'Painting', skills: 'Painting, Drywall',
    budget_type: 'hourly', budget_min: 45, budget_max: 60,
    duration: 'Less than 1 month', experience_level: 'entry'
  });
  const job4 = insertJob({
    client_id: dave, days: 5, status: 'in_progress',
    title: 'Assemble 6 office desks and 10 chairs',
    description: 'New office setup: six height-adjustable desks and ten ergonomic chairs, all flat-packed. Need assembly, placement, and cardboard cleanup. Building has a freight elevator — please bring a dolly.',
    category: 'General Handyman', skills: 'Furniture Assembly',
    budget_type: 'fixed', budget_min: 150, budget_max: 220,
    duration: 'Less than 1 week', experience_level: 'entry'
  });
  const job5 = insertJob({
    client_id: alice, days: 14, status: 'completed',
    title: 'Replace bathroom faucet and shower head',
    description: 'Replace an old bathroom faucet and shower head with new fixtures I already purchased. Simple swap, but the shutoff valves are stiff. Please test for leaks afterward.',
    category: 'Plumbing', skills: 'Faucet Installation',
    budget_type: 'fixed', budget_min: 150, budget_max: 200,
    duration: 'Less than 1 week', experience_level: 'intermediate'
  });

  // Proposals
  const propBob1 = insertProposal({
    job_id: job1, handyman_id: bob, days: 2, bid_amount: 240, bid_days: 2,
    cover_letter: "Hi Alice — I can take care of the leak and install your Moen faucet this week. I'll bring new supply lines and sealant, and I'll pressure-test everything before I leave. My quote includes parts and cleanup."
  });
  insertProposal({
    job_id: job1, handyman_id: pete, days: 2, bid_amount: 225, bid_days: 1,
    cover_letter: "I can come by tomorrow morning. Leak diagnosis and faucet swap is a straightforward job for me — I'll also check the P-trap and shutoff valves while I'm under there."
  });
  insertProposal({
    job_id: job2, handyman_id: mary, days: 1, bid_amount: 380, bid_days: 2,
    cover_letter: "Hi Dave — I install recessed lighting regularly. I'll cut clean holes, wire the four fixtures to the existing circuit, and patch the ceiling. I can start this weekend."
  });
  insertProposal({
    job_id: job3, handyman_id: ana, days: 1, bid_amount: 55, bid_days: 5,
    cover_letter: "I'd love to help with the living room and hallway. I'll handle patching, taping, and two coats with a warm white. I can provide a color sample card and keep the space tidy."
  });
  const propCarl = insertProposal({
    job_id: job4, handyman_id: carl, days: 4, bid_amount: 180, bid_days: 2, status: 'hired',
    cover_letter: "I assemble office furniture every week. I'll bring a dolly, organize the boxes by station, and take all the cardboard with me when I'm done."
  });
  const propBob2 = insertProposal({
    job_id: job5, handyman_id: bob, days: 13, bid_amount: 180, bid_days: 2, status: 'hired',
    cover_letter: "Happy to swap both fixtures. I'll bring new washers and test the shutoff valves before starting."
  });

  // Active contract: Dave + Carl (funded + submitted milestone awaiting approval)
  const contract1 = insertContract({
    job_id: job4, client_id: dave, handyman_id: carl, proposal_id: propCarl,
    total_amount: 180, status: 'active', days: 4
  });
  const ms1 = insertMilestone({
    contract_id: contract1, title: 'Assemble desks and chairs', amount: 180,
    status: 'submitted', days: 4, funded_days: 3, submitted_days: 1
  });
  insertTransaction({ contract_id: contract1, milestone_id: ms1, client_id: dave, handyman_id: carl, amount: 180, type: 'fund', days: 3 });
  insertMessage(contract1, dave, 'Hi Carl — the desks arrive Friday morning. The freight elevator is booked for 9am.', 4);
  insertMessage(contract1, carl, "Perfect. I'll be there at 8:45 to set up and start sorting the boxes.", 4);
  insertMessage(contract1, carl, 'All six desks and ten chairs are assembled and placed. I submitted the work for your review — cardboard is already broken down.', 1);

  // Completed contract: Alice + Bob (paid + reviewed)
  const contract2 = insertContract({
    job_id: job5, client_id: alice, handyman_id: bob, proposal_id: propBob2,
    total_amount: 180, status: 'completed', days: 12
  });
  const ms2 = insertMilestone({
    contract_id: contract2, title: 'Fixture replacement', amount: 180,
    status: 'approved', days: 12, funded_days: 11, submitted_days: 10, approved_days: 9
  });
  insertTransaction({ contract_id: contract2, milestone_id: ms2, client_id: alice, handyman_id: bob, amount: 180, type: 'fund', days: 11 });
  insertTransaction({
    contract_id: contract2, milestone_id: ms2, client_id: alice, handyman_id: bob,
    amount: 180, platform_fee: 32.4, handyman_amount: 147.6, type: 'release', days: 9
  });
  insertMessage(contract2, alice, 'The new shower head is a Delta — everything is in the box on the bathroom counter.', 12);
  insertMessage(contract2, bob, "Got it. I'll bring replacement washers and check the shutoff valves first.", 11);
  insertMessage(contract2, bob, 'Both fixtures are installed and tested. No leaks — submitted for your review.', 10);
  insertMessage(contract2, alice, 'Looks great, thank you! Releasing payment now.', 9);
  insertReview({
    contract_id: contract2, reviewer_id: alice, reviewee_id: bob, rating: 5, days: 9,
    comment: 'Bob was punctual, professional, and cleaned up after the job. The fixtures look perfect and he tested everything for leaks. Would hire again.'
  });
  insertReview({
    contract_id: contract2, reviewer_id: bob, reviewee_id: alice, rating: 5, days: 9,
    comment: 'Alice was clear about the scope and had everything ready when I arrived. Great communication and quick payment.'
  });

  console.log('Seeded Upwork-style demo data');
  console.log('  admin@handyman.app / admin123');
  console.log('  alice@client.com / password123 (client)');
  console.log('  bob@builder.com / password123 (handyman)');
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/config', (req, res) => {
  res.json({
    demoMode: !process.env.STRIPE_SECRET_KEY || process.env.DEMO_MODE === 'true',
    commission: 0.18,
    appName: 'Handyman Pro',
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
});

// Marketing pages and the app shell
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/pricing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pricing.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api', require('./routes/proposals'));
app.use('/api', require('./routes/contracts'));
app.use('/api', require('./routes/reviews'));
app.use('/api', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Handyman Pro (Upwork-style) running on http://localhost:${PORT}`);
  console.log(`Landing: http://localhost:${PORT}/  |  App: http://localhost:${PORT}/app`);
});
