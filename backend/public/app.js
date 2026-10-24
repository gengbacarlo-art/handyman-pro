const API = '/api';
const CATEGORIES = ['General Handyman', 'Plumbing', 'Electrical', 'Carpentry', 'Painting', 'Cleaning', 'HVAC', 'Appliance Repair', 'Landscaping', 'Roofing'];

const app = {
  state: {
    token: localStorage.getItem('hp_token'),
    user: JSON.parse(localStorage.getItem('hp_user') || 'null'),
    config: { demoMode: true, commission: 0.18, googleClientId: '' },
    regRole: 'client',
    adminTab: 'users',
    reviewRating: 5
  },

  // ------------------------------------------------------------------ utils
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  money(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  money0(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  },
  initials(name) {
    return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  },
  stars(r) {
    const full = Math.round(Number(r) || 0);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  },
  badge(status) {
    const labels = {
      open: 'Open', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
      pending: 'Pending', shortlisted: 'Shortlisted', hired: 'Hired', rejected: 'Rejected',
      funded: 'Funded', submitted: 'Submitted', approved: 'Approved', active: 'Active'
    };
    return `<span class="badge ${app.esc(status)}">${labels[status] || app.esc(status)}</span>`;
  },
  timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(String(dateStr).replace(' ', 'T') + (String(dateStr).includes('Z') ? '' : 'Z'));
    const diff = Math.max(0, Date.now() - d.getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  toast(msg, isError) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    document.getElementById('toast').appendChild(el);
    setTimeout(() => el.remove(), 3800);
  },
  modal(html) {
    document.getElementById('modal-root').innerHTML =
      `<div class="modal-backdrop" onclick="if(event.target===this)app.closeModal()"><div class="modal">${html}</div></div>`;
  },
  closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  },
  async api(path, method = 'GET', body) {
    const res = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(app.state.token ? { Authorization: 'Bearer ' + app.state.token } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  },
  saveSession(token, user) {
    app.state.token = token;
    app.state.user = user;
    localStorage.setItem('hp_token', token);
    localStorage.setItem('hp_user', JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem('hp_token');
    localStorage.removeItem('hp_user');
    app.state.token = null;
    app.state.user = null;
    location.hash = '#/dashboard';
    app.render();
  },

  // ------------------------------------------------------------------ boot / routing
  async boot() {
    try { app.state.config = await app.api('/config'); } catch (e) { /* offline */ }
    if (app.state.token) {
      try {
        const me = await app.api('/auth/me');
        app.state.user = me.user;
        localStorage.setItem('hp_user', JSON.stringify(me.user));
      } catch (e) {
        app.state.token = null; app.state.user = null;
        localStorage.removeItem('hp_token'); localStorage.removeItem('hp_user');
      }
    }
    app.render();
    window.addEventListener('hashchange', () => app.render());
  },
  parseRoute() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    let name = parts[0] || 'dashboard';
    const id = parts[1] || null;
    if (id && name === 'jobs') name = 'job';
    if (id && name === 'contracts') name = 'contract';
    if (id && name === 'talent') name = 'talent-detail';
    return { name, id, q: new URLSearchParams(queryPart || '') };
  },
  navigate(hash) {
    if (location.hash === hash) app.render();
    else location.hash = hash;
  },
  async render() {
    const authed = !!app.state.user;
    document.getElementById('auth-screen').classList.toggle('hidden', authed);
    document.getElementById('app').classList.toggle('hidden', !authed);
    if (!authed) { app.setupGoogle(); return; }

    app.renderNav();
    const banner = document.getElementById('demo-banner');
    const demo = app.state.config && app.state.config.demoMode;
    banner.innerHTML = '⚠️ Demo mode — payments and payouts are simulated. No card is charged. The data model is Stripe Connect ready.';
    banner.classList.toggle('hidden', !demo);

    const route = app.parseRoute();
    const view = document.getElementById('view');
    view.innerHTML = '<div class="empty">Loading…</div>';
    try {
      if (route.name === 'dashboard') await app.renderDashboard();
      else if (route.name === 'jobs') await app.renderJobs(route);
      else if (route.name === 'job-new') await app.renderNewJob();
      else if (route.name === 'job') await app.renderJob(route.id);
      else if (route.name === 'proposals') await app.renderProposals();
      else if (route.name === 'contracts') await app.renderContracts();
      else if (route.name === 'contract') await app.renderContract(route.id);
      else if (route.name === 'talent') await app.renderTalent(route);
      else if (route.name === 'talent-detail') await app.renderTalentDetail(route.id);
      else if (route.name === 'profile') await app.renderProfile();
      else if (route.name === 'admin') await app.renderAdmin();
      else view.innerHTML = '<div class="empty"><h3>Page not found</h3><p>Check the address and try again.</p></div>';
    } catch (err) {
      view.innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${app.esc(err.message)}</p></div>`;
    }
  },
  renderNav() {
    const u = app.state.user;
    if (!u) return;
    const route = app.parseRoute();
    const activeSection = route.name === 'job' ? 'jobs'
      : route.name === 'contract' ? 'contracts'
      : route.name === 'talent-detail' ? 'talent'
      : route.name;
    const links = u.role === 'client'
      ? [['#/jobs', 'My jobs', 'jobs'], ['#/talent', 'Talent', 'talent'], ['#/contracts', 'Contracts', 'contracts']]
      : u.role === 'handyman'
        ? [['#/jobs', 'Find work', 'jobs'], ['#/proposals', 'My proposals', 'proposals'], ['#/contracts', 'Contracts', 'contracts'], ['#/profile', 'Profile', 'profile']]
        : [['#/admin', 'Admin', 'admin'], ['#/jobs', 'Jobs', 'jobs'], ['#/talent', 'Talent', 'talent'], ['#/contracts', 'Contracts', 'contracts']];

    document.getElementById('nav-links').innerHTML = links.map(([href, label, key]) =>
      `<a href="${href}" class="${activeSection === key ? 'active' : ''}">${label}</a>`
    ).join('');

    document.getElementById('nav-user').innerHTML = `
      ${u.role === 'client' ? '<a class="btn primary sm" href="#/job-new">Post a job</a>' : ''}
      <a class="row" href="#/profile" style="gap:8px">
        <span class="avatar sm">${app.initials(u.full_name)}</span>
        <span class="name">${app.esc(u.full_name.split(' ')[0])}</span>
      </a>
      <button class="btn ghost sm" onclick="app.logout()">Log out</button>
    `;
  },
  globalSearch(e) {
    e.preventDefault();
    const q = document.getElementById('global-search').value.trim();
    const target = app.state.user.role === 'client' ? '#/talent' : '#/jobs';
    app.navigate(target + (q ? '?q=' + encodeURIComponent(q) : ''));
  },

  // ------------------------------------------------------------------ auth
  showLogin() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('tab-register').classList.remove('active');
    document.getElementById('auth-title').textContent = 'Sign in';
  },
  showRegister() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-register').classList.add('active');
    document.getElementById('auth-title').textContent = 'Create account';
  },
  setRegRole(role) {
    app.state.regRole = role;
    document.getElementById('role-client').classList.toggle('active', role === 'client');
    document.getElementById('role-handyman').classList.toggle('active', role === 'handyman');
    document.getElementById('handyman-fields').classList.toggle('hidden', role !== 'handyman');
  },
  async login(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const r = await app.api('/auth/login', 'POST', {
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value
      });
      app.saveSession(r.token, r.user);
      app.toast('Welcome back, ' + r.user.full_name);
      app.navigate('#/dashboard');
    } catch (err) { app.toast(err.message, true); }
    btn.disabled = false; btn.textContent = 'Sign in';
  },
  async register(e) {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const payload = {
        full_name: document.getElementById('reg-name').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-password').value,
        location: document.getElementById('reg-location').value.trim(),
        role: app.state.regRole
      };
      if (app.state.regRole === 'handyman') {
        payload.category = document.getElementById('reg-category').value;
        payload.hourly_rate = Number(document.getElementById('reg-rate').value) || 50;
        payload.title = document.getElementById('reg-title').value.trim();
        payload.experience_years = Number(document.getElementById('reg-exp').value) || 0;
      }
      const r = await app.api('/auth/register', 'POST', payload);
      app.saveSession(r.token, r.user);
      app.toast('Account created. Welcome!');
      app.navigate('#/dashboard');
    } catch (err) { app.toast(err.message, true); }
    btn.disabled = false; btn.textContent = 'Create account';
  },

  // ------------------------------------------------------------------ Google sign-in
  setupGoogle() {
    const el = document.getElementById('google-btn');
    if (!el || el.dataset.ready) return;
    const cid = app.state.config && app.state.config.googleClientId;
    if (!cid) { app.googleDemoButton(el); return; }
    const mount = () => {
      try {
        window.google.accounts.id.initialize({
          client_id: cid,
          callback: resp => app.handleGoogleCredential(resp.credential)
        });
        window.google.accounts.id.renderButton(el, {
          theme: 'outline', size: 'large', shape: 'rect', width: 360,
          text: 'continue_with', logo_alignment: 'center'
        });
        el.dataset.ready = '1';
      } catch (e) { app.googleDemoButton(el); }
    };
    if (window.google && window.google.accounts) { mount(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = mount;
    s.onerror = () => app.googleDemoButton(el);
    document.head.appendChild(s);
  },
  googleDemoButton(el) {
    if (!el) el = document.getElementById('google-btn');
    if (!el) return;
    el.innerHTML = '<button type="button" class="btn-google" onclick="app.googleDemo()">' +
      '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z"/></svg>' +
      ' Continue with Google <span style="color:#6B7280;font-weight:500;font-size:12px">(demo)</span></button>';
    el.dataset.ready = '1';
  },
  async googleDemo() {
    try {
      const r = await app.api('/auth/google', 'POST', { demo: true });
      app.saveSession(r.token, r.user);
      app.toast('Signed in with Google (demo)');
      app.navigate('#/dashboard');
    } catch (e) { app.toast(e.message, true); }
  },
  async handleGoogleCredential(credential) {
    try {
      const r = await app.api('/auth/google', 'POST', { credential });
      app.saveSession(r.token, r.user);
      app.toast('Signed in with Google');
      app.navigate('#/dashboard');
    } catch (e) { app.toast(e.message, true); }
  },

  // ------------------------------------------------------------------ shared renderers
  jobCard(j) {
    const budget = j.budget_type === 'hourly'
      ? `${app.money0(j.budget_min)}–${app.money0(j.budget_max)}/hr`
      : `${app.money0(j.budget_min)}${j.budget_max && j.budget_max !== j.budget_min ? '–' + app.money0(j.budget_max) : ''}`;
    const skills = (j.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    return `
      <div class="job-card">
        <div>
          <a class="job-title" href="#/jobs/${j.id}">${app.esc(j.title)}</a>
          <div class="job-meta">
            <span>${app.esc(j.category)}</span>
            <span>${j.budget_type === 'hourly' ? 'Hourly' : 'Fixed price'}: <b>${budget}</b></span>
            <span>${app.esc(j.experience_level || 'intermediate')}</span>
            <span>Posted ${app.timeAgo(j.created_at)}</span>
            ${j.client_name ? `<span>Client: ${app.esc(j.client_name)}</span>` : ''}
          </div>
          <p class="job-desc">${app.esc(j.description)}</p>
          ${skills.length ? `<div class="skills">${skills.map(s => `<span class="chip">${app.esc(s)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="job-side">
          <div>${app.badge(j.status)}</div>
          <div class="small muted">${j.proposals_count || 0} proposal${Number(j.proposals_count) === 1 ? '' : 's'}</div>
          <a class="btn secondary sm" href="#/jobs/${j.id}">View job</a>
        </div>
      </div>`;
  },
  contractCard(c) {
    const pct = c.total_amount > 0 ? Math.min(100, Math.round((c.released / c.total_amount) * 100)) : 0;
    const other = app.state.user.id === c.client_id ? c.handyman_name : c.client_name;
    return `
      <div class="contract-card">
        <div>
          <div class="spread" style="margin-bottom:6px">
            <a class="job-title" href="#/contracts/${c.id}" style="font-size:16px">${app.esc(c.job_title)}</a>
            ${app.badge(c.status)}
          </div>
          <div class="job-meta">
            <span>With ${app.esc(other)}</span>
            <span>${app.esc(c.category || '')}</span>
            <span>Started ${app.timeAgo(c.started_at)}</span>
          </div>
          <div style="margin-top:12px">
            <div class="spread small muted" style="margin-bottom:4px">
              <span>${app.money(c.released)} released</span>
              <span>${app.money(c.total_amount)} total</span>
            </div>
            <div class="progress"><span style="width:${pct}%"></span></div>
          </div>
        </div>
        <div class="job-side">
          <div class="small"><b>${c.milestones_approved}/${c.milestones_count}</b> milestones approved</div>
          <div class="small muted">${app.money(c.in_escrow)} in escrow</div>
          <a class="btn secondary sm" href="#/contracts/${c.id}">Open contract</a>
        </div>
      </div>`;
  },

  // ------------------------------------------------------------------ dashboard
  async renderDashboard() {
    const u = app.state.user;
    if (u.role === 'admin') return app.renderAdmin();
    const summary = await app.api('/payments/summary');
    const view = document.getElementById('view');

    const stats = u.role === 'client'
      ? [
          ['Open jobs', summary.open_jobs, 'Accepting proposals'],
          ['Active contracts', summary.active_contracts, 'Work in progress'],
          ['In escrow', app.money(summary.in_escrow), 'Funded milestones'],
          ['Total funded', app.money(summary.total_funded), 'Lifetime'],
        ]
      : [
          ['Total earned', app.money(summary.total_earned), '82% payout'],
          ['In escrow', app.money(summary.in_escrow), 'Awaiting approval'],
          ['Active contracts', summary.active_contracts, 'Work in progress'],
          ['Proposals sent', summary.proposals_sent, `${summary.proposals_hired || 0} hired`]
        ];

    let html = `
      <div class="page-head">
        <h1>Welcome back, ${app.esc(u.full_name.split(' ')[0])}</h1>
        <p>${u.role === 'client' ? 'Manage your jobs, proposals and contracts.' : 'Find work, send proposals and track your earnings.'}</p>
      </div>
      <div class="stats">
        ${stats.map(([label, value, sub]) => `
          <div class="stat"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>
        `).join('')}
      </div>`;

    if (u.role === 'client') {
      const [jobsData, contractsData] = await Promise.all([app.api('/jobs?scope=mine'), app.api('/contracts')]);
      const open = jobsData.jobs.filter(j => j.status === 'open').slice(0, 4);
      const active = contractsData.contracts.filter(c => c.status === 'active').slice(0, 3);

      html += `<div class="spread"><div class="section-title">Your open jobs</div><a class="link small" href="#/job-new">Post a new job →</a></div>`;
      html += open.length
        ? `<div class="stack">${open.map(j => app.jobCard(j)).join('')}</div>`
        : `<div class="empty"><h3>No open jobs yet</h3><p>Post your first job and start receiving proposals.</p><a class="btn primary" href="#/job-new" style="margin-top:14px">Post a job</a></div>`;

      html += `<div class="spread"><div class="section-title">Active contracts</div><a class="link small" href="#/contracts">View all →</a></div>`;
      html += active.length
        ? `<div class="stack">${active.map(c => app.contractCard(c)).join('')}</div>`
        : `<div class="empty"><h3>No active contracts</h3><p>When you hire a handyman, the contract appears here.</p></div>`;
    } else {
      const [jobsData, proposalsData, contractsData] = await Promise.all([
        app.api('/jobs?scope=open'), app.api('/proposals/mine'), app.api('/contracts')
      ]);
      const fresh = jobsData.jobs.filter(j => !j.my_proposal_status).slice(0, 3);
      const active = contractsData.contracts.filter(c => c.status === 'active').slice(0, 3);

      html += `<div class="spread"><div class="section-title">Recommended jobs</div><a class="link small" href="#/jobs">Browse all →</a></div>`;
      html += fresh.length
        ? `<div class="stack">${fresh.map(j => app.jobCard(j)).join('')}</div>`
        : `<div class="empty"><h3>You're all caught up</h3><p>New jobs will appear here as clients post them.</p></div>`;

      html += `<div class="spread"><div class="section-title">Active contracts</div><a class="link small" href="#/contracts">View all →</a></div>`;
      html += active.length
        ? `<div class="stack">${active.map(c => app.contractCard(c)).join('')}</div>`
        : `<div class="empty"><h3>No active contracts</h3><p>Win a proposal to start working.</p></div>`;

      const recent = proposalsData.proposals.slice(0, 3);
      if (recent.length) {
        html += `<div class="section-title">Recent proposals</div><div class="stack">`;
        html += recent.map(p => `
          <div class="card spread">
            <div>
              <a class="job-title" style="font-size:15px" href="#/jobs/${p.job_id}">${app.esc(p.job_title)}</a>
              <div class="job-meta"><span>Bid ${app.money(p.bid_amount)}</span><span>Sent ${app.timeAgo(p.created_at)}</span></div>
            </div>
            <div>${app.badge(p.status)}</div>
          </div>`).join('');
        html += `</div>`;
      }
    }

    view.innerHTML = html;
  },

  // ------------------------------------------------------------------ jobs
  async renderJobs(route) {
    const u = app.state.user;
    const scope = route.q.get('scope') || (u.role === 'client' ? 'mine' : 'open');
    const q = route.q.get('q') || '';
    const category = route.q.get('category') || '';
    const params = new URLSearchParams({ scope });
    if (q) params.set('q', q);
    if (category) params.set('category', category);

    const data = await app.api('/jobs?' + params.toString());
    const isClient = u.role === 'client';
    const view = document.getElementById('view');

    view.innerHTML = `
      <div class="spread page-head">
        <div>
          <h1>${isClient ? 'My jobs' : 'Find work'}</h1>
          <p>${isClient ? 'Jobs you have posted and their proposals.' : 'Browse open jobs and submit proposals.'}</p>
        </div>
        ${isClient ? '<a class="btn primary" href="#/job-new">Post a job</a>' : ''}
      </div>
      <form class="filters" onsubmit="app.filterJobs(event)">
        <input id="jobs-q" type="search" placeholder="Search jobs" value="${app.esc(q)}" style="min-width:260px">
        <select id="jobs-category">
          <option value="">All categories</option>
          ${CATEGORIES.map(c => `<option ${c === category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <button class="btn secondary" type="submit">Filter</button>
        ${!isClient ? `<a class="btn ghost" href="#/jobs?scope=open">Refresh</a>` : ''}
      </form>
      <div class="stack">
        ${data.jobs.length
          ? data.jobs.map(j => app.jobCard(j)).join('')
          : `<div class="empty"><h3>No jobs found</h3><p>${isClient ? 'Post a job to start receiving proposals.' : 'Try a different search or category.'}</p></div>`}
      </div>`;
  },
  filterJobs(e) {
    e.preventDefault();
    const q = document.getElementById('jobs-q').value.trim();
    const category = document.getElementById('jobs-category').value;
    const scope = app.state.user.role === 'client' ? 'mine' : 'open';
    const params = new URLSearchParams({ scope });
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    app.navigate('#/jobs?' + params.toString());
  },

  async renderNewJob() {
    const view = document.getElementById('view');
    view.innerHTML = `
      <div class="page-head"><h1>Post a job</h1><p>Describe what you need. Handymen will send proposals with their price and timeline.</p></div>
      <form class="card form-card" onsubmit="app.createJob(event)">
        <div class="field">
          <label>Job title</label>
          <input id="job-title" placeholder="e.g. Fix a leaking kitchen sink" required maxlength="120">
        </div>
        <div class="grid-2">
          <div class="field">
            <label>Category</label>
            <select id="job-category">${CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Experience level</label>
            <select id="job-level">
              <option value="entry">Entry</option>
              <option value="intermediate" selected>Intermediate</option>
              <option value="expert">Expert</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Description</label>
          <textarea id="job-description" placeholder="What needs to be done? Include details, materials and access instructions." required></textarea>
        </div>
        <div class="field">
          <label>Skills (comma separated)</label>
          <input id="job-skills" placeholder="e.g. Leak Repair, Faucet Installation">
        </div>
        <div class="grid-2">
          <div class="field">
            <label>Budget type</label>
            <select id="job-budget-type" onchange="app.toggleBudgetFields()">
              <option value="fixed">Fixed price</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
          <div class="field">
            <label>Project length</label>
            <select id="job-duration">
              <option>Less than 1 week</option>
              <option>Less than 1 month</option>
              <option>1 to 3 months</option>
              <option>More than 3 months</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label id="budget-min-label">Budget min ($)</label>
            <input id="job-budget-min" type="number" min="1" step="1" placeholder="200" required>
          </div>
          <div class="field">
            <label id="budget-max-label">Budget max ($)</label>
            <input id="job-budget-max" type="number" min="1" step="1" placeholder="300">
          </div>
        </div>
        <div class="form-actions">
          <a class="btn ghost" href="#/jobs">Cancel</a>
          <button class="btn primary" type="submit">Post job</button>
        </div>
      </form>`;
  },
  toggleBudgetFields() {
    const hourly = document.getElementById('job-budget-type').value === 'hourly';
    document.getElementById('budget-min-label').textContent = hourly ? 'Hourly rate min ($/hr)' : 'Budget min ($)';
    document.getElementById('budget-max-label').textContent = hourly ? 'Hourly rate max ($/hr)' : 'Budget max ($)';
  },
  async createJob(e) {
    e.preventDefault();
    try {
      const r = await app.api('/jobs', 'POST', {
        title: document.getElementById('job-title').value.trim(),
        category: document.getElementById('job-category').value,
        description: document.getElementById('job-description').value.trim(),
        skills: document.getElementById('job-skills').value.trim(),
        experience_level: document.getElementById('job-level').value,
        budget_type: document.getElementById('job-budget-type').value,
        duration: document.getElementById('job-duration').value,
        budget_min: Number(document.getElementById('job-budget-min').value),
        budget_max: Number(document.getElementById('job-budget-max').value) || undefined
      });
      app.toast('Job posted');
      app.navigate('#/jobs/' + r.job.id);
    } catch (err) { app.toast(err.message, true); }
  },

  async renderJob(id) {
    const data = await app.api('/jobs/' + id);
    const j = data.job;
    const u = app.state.user;
    const view = document.getElementById('view');
    const skills = (j.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    const budget = j.budget_type === 'hourly'
      ? `${app.money0(j.budget_min)}–${app.money0(j.budget_max)}/hr`
      : `${app.money0(j.budget_min)}${j.budget_max && j.budget_max !== j.budget_min ? '–' + app.money0(j.budget_max) : ''}`;

    let actionHtml = '';
    if (u.role === 'handyman') {
      if (data.my_proposal) {
        actionHtml = `
          <div class="card">
            <div class="card-title">Your proposal</div>
            <div class="money-row"><span>Bid</span><b>${app.money(data.my_proposal.bid_amount)}</b></div>
            <div class="money-row"><span>Delivery</span><span>${data.my_proposal.bid_days || '—'} day(s)</span></div>
            <div class="money-row"><span>Status</span>${app.badge(data.my_proposal.status)}</div>
            <p class="small muted" style="margin-top:10px">${app.esc(data.my_proposal.cover_letter)}</p>
          </div>`;
      } else if (j.status === 'open') {
        actionHtml = `
          <div class="card">
            <div class="card-title">Submit a proposal</div>
            <form onsubmit="app.submitProposal(event, ${j.id})">
              <div class="field">
                <label>Cover letter</label>
                <textarea id="prop-cover" placeholder="Explain why you're a great fit, your approach and availability." required></textarea>
              </div>
              <div class="grid-2">
                <div class="field">
                  <label>${j.budget_type === 'hourly' ? 'Hourly rate ($/hr)' : 'Your bid ($)'}</label>
                  <input id="prop-bid" type="number" min="1" step="1" placeholder="${j.budget_type === 'hourly' ? '55' : '250'}" required>
                </div>
                <div class="field">
                  <label>Delivery (days)</label>
                  <input id="prop-days" type="number" min="1" step="1" placeholder="3">
                </div>
              </div>
              <button class="btn primary block" type="submit">Send proposal</button>
              <p class="tiny muted" style="margin-top:8px">Handyman keeps 82% · platform fee 18%</p>
            </form>
          </div>`;
      } else {
        actionHtml = `<div class="card"><div class="card-title">Job closed</div><p class="small muted">This job is no longer accepting proposals.</p></div>`;
      }
    }

    if (data.is_owner) {
      if (data.contract) {
        actionHtml = `<div class="card"><div class="card-title">Contract</div><p class="small muted">You hired a handyman for this job.</p><a class="btn primary block" href="#/contracts/${data.contract.id}">Open contract</a></div>`;
      } else {
        actionHtml = `<div class="card"><div class="card-title">${j.proposals_count} proposal${Number(j.proposals_count) === 1 ? '' : 's'}</div><p class="small muted">Compare bids, ratings and experience, then hire.</p><a class="btn secondary block" href="#proposals-list">View proposals below</a></div>`;
      }
    }

    view.innerHTML = `
      <div class="page-head">
        <a class="small muted" href="#/jobs">← Back to jobs</a>
        <h1 style="margin-top:6px">${app.esc(j.title)}</h1>
        <div class="job-meta">
          <span>${app.esc(j.category)}</span>
          <span>${j.budget_type === 'hourly' ? 'Hourly' : 'Fixed price'}: <b>${budget}</b></span>
          <span>${app.esc(j.duration || '')}</span>
          <span>${app.esc(j.experience_level || 'intermediate')}</span>
          <span>Posted ${app.timeAgo(j.created_at)}</span>
        </div>
      </div>
      <div class="layout">
        <div class="stack">
          <div class="card">
            <div class="card-title">Job description</div>
            <p style="white-space:pre-wrap">${app.esc(j.description)}</p>
            ${skills.length ? `<div class="skills">${skills.map(s => `<span class="chip">${app.esc(s)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="card">
            <div class="card-title">About the client</div>
            <div class="row">
              <span class="avatar">${app.initials(j.client_name)}</span>
              <div>
                <b>${app.esc(j.client_name)}</b>
                <div class="small muted">${app.esc(j.client_location || 'Location not set')} · Member since ${app.timeAgo(j.client_since)}</div>
              </div>
            </div>
            <div class="money-row" style="margin-top:14px"><span>Jobs posted</span><b>${j.client_jobs_posted}</b></div>
          </div>
          ${data.is_owner && data.proposals.length ? `
            <div id="proposals-list" class="card">
              <div class="card-title">Proposals (${data.proposals.length})</div>
              ${data.proposals.map(p => `
                <div class="proposal-card" style="border:none;padding:14px 0;border-bottom:1px solid var(--line);border-radius:0">
                  <span class="avatar">${app.initials(p.handyman_name)}</span>
                  <div class="proposal-main">
                    <div class="spread">
                      <a class="link" href="#/talent/${p.handyman_id}"><b>${app.esc(p.handyman_name)}</b></a>
                      ${app.badge(p.status)}
                    </div>
                    <div class="small muted">${app.esc(p.handyman_title || p.handyman_category || '')}</div>
                    <div class="rating-line" style="margin-top:4px">
                      <span class="stars">${app.stars(p.rating)}</span>
                      <b>${Number(p.rating || 0).toFixed(1)}</b>
                      <span>(${p.reviews_count} review${p.reviews_count === 1 ? '' : 's'})</span>
                    </div>
                    <p>${app.esc(p.cover_letter)}</p>
                  </div>
                  <div class="proposal-side">
                    <b style="font-size:18px">${app.money(p.bid_amount)}${j.budget_type === 'hourly' ? '<span class="small muted">/hr</span>' : ''}</b>
                    <div class="small muted">in ${p.bid_days || '—'} day(s)</div>
                    ${p.status !== 'hired' && p.status !== 'rejected' && j.status === 'open' ? `
                      <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">
                        ${p.status !== 'shortlisted' ? `<button class="btn secondary sm" onclick="app.proposalAction(${p.id}, 'shortlist')">Shortlist</button>` : ''}
                        ${p.status !== 'rejected' ? `<button class="btn danger sm" onclick="app.proposalAction(${p.id}, 'reject')">Reject</button>` : ''}
                        <button class="btn primary sm" data-name="${app.esc(p.handyman_name)}" data-total="${j.budget_type === 'hourly' ? p.bid_amount * 40 : p.bid_amount}" data-hourly="${j.budget_type === 'hourly' ? '1' : '0'}" onclick="app.confirmHire(${p.id}, this.dataset.name, Number(this.dataset.total), this.dataset.hourly === '1')">Hire</button>
                      </div>` : ''}
                  </div>
                </div>`).join('')}
            </div>` : ''}
        </div>
        <div class="stack">${actionHtml}</div>
      </div>`;
  },
  async submitProposal(e, jobId) {
    e.preventDefault();
    try {
      await app.api('/jobs/' + jobId + '/proposals', 'POST', {
        cover_letter: document.getElementById('prop-cover').value.trim(),
        bid_amount: Number(document.getElementById('prop-bid').value),
        bid_days: Number(document.getElementById('prop-days').value) || undefined
      });
      app.toast('Proposal sent');
      app.render();
    } catch (err) { app.toast(err.message, true); }
  },
  confirmHire(proposalId, name, amount, hourly) {
    app.modal(`
      <h3>Hire ${app.esc(name)}?</h3>
      <p>This creates a contract for <b>${app.money(amount)}</b>${hourly ? ' — a 40-hour work block at the proposed hourly rate' : ''}. You can fund the milestone and release payment when the work is approved.</p>
      <div class="actions">
        <button class="btn ghost" onclick="app.closeModal()">Cancel</button>
        <button class="btn primary" onclick="app.proposalAction(${proposalId}, 'hire')">Hire &amp; create contract</button>
      </div>`);
  },
  async proposalAction(id, action) {
    try {
      const r = await app.api('/proposals/' + id, 'PATCH', { action });
      app.closeModal();
      app.toast(r.message || 'Updated');
      if (r.contract_id) app.navigate('#/contracts/' + r.contract_id);
      else app.render();
    } catch (err) { app.toast(err.message, true); }
  },

  // ------------------------------------------------------------------ proposals
  async renderProposals() {
    const data = await app.api('/proposals/mine');
    const view = document.getElementById('view');
    view.innerHTML = `
      <div class="page-head"><h1>My proposals</h1><p>Track the bids you've sent and their status.</p></div>
      <div class="stack">
        ${data.proposals.length ? data.proposals.map(p => `
          <div class="card">
            <div class="spread">
              <div>
                <a class="job-title" style="font-size:16px" href="#/jobs/${p.job_id}">${app.esc(p.job_title)}</a>
                <div class="job-meta">
                  <span>${app.esc(p.category)}</span>
                  <span>Bid <b>${app.money(p.bid_amount)}</b>${p.budget_type === 'hourly' ? '/hr' : ''}</span>
                  <span>${p.bid_days || '—'} day(s)</span>
                  <span>Sent ${app.timeAgo(p.created_at)}</span>
                </div>
              </div>
              <div style="text-align:right">${app.badge(p.status)}<div class="tiny muted" style="margin-top:6px">Job: ${p.job_status.replace('_', ' ')}</div></div>
            </div>
            <p class="small muted" style="margin-top:10px">${app.esc(p.cover_letter)}</p>
          </div>`).join('')
        : `<div class="empty"><h3>No proposals yet</h3><p>Browse open jobs and send your first proposal.</p><a class="btn primary" href="#/jobs" style="margin-top:14px">Find work</a></div>`}
      </div>`;
  },

  // ------------------------------------------------------------------ contracts
  async renderContracts() {
    const data = await app.api('/contracts');
    const view = document.getElementById('view');
    view.innerHTML = `
      <div class="page-head"><h1>Contracts</h1><p>Milestones, escrow and payments for your active and completed work.</p></div>
      <div class="stack">
        ${data.contracts.length ? data.contracts.map(c => app.contractCard(c)).join('')
          : `<div class="empty"><h3>No contracts yet</h3><p>${app.state.user.role === 'client' ? 'Hire a handyman from one of your jobs.' : 'Win a proposal to start a contract.'}</p></div>`}
      </div>`;
  },

  async renderContract(id) {
    const d = await app.api('/contracts/' + id);
    const c = d.contract;
    const u = app.state.user;
    const isClient = d.role === 'client';
    const other = isClient ? c.handyman_name : c.client_name;
    const otherTitle = isClient ? c.handyman_title : 'Client';
    const remaining = Math.max(0, c.total_amount - d.released - d.in_escrow);
    const allocated = d.milestones.reduce((s, m) => s + Number(m.amount), 0);
    const unallocated = Math.max(0, c.total_amount - allocated);
    app.state.contractTotal = c.total_amount;
    const pct = c.total_amount > 0 ? Math.min(100, Math.round((d.released / c.total_amount) * 100)) : 0;

    app.state.milestones = {};
    d.milestones.forEach(m => { app.state.milestones[m.id] = m; });

    const milestonesHtml = d.milestones.map(m => {
      let actions = '';
      if (m.status === 'pending' && isClient && c.status === 'active') {
        actions = `
          <button class="btn primary sm" onclick="app.fundMilestone(${m.id})">Fund ${app.money(m.amount)}</button>
          <button class="btn secondary sm" onclick="app.editMilestone(${m.id}, ${c.id})">Edit</button>
          <button class="btn danger sm" onclick="app.deleteMilestone(${m.id}, ${c.id})">Delete</button>`;
      } else if (m.status === 'funded' && !isClient && c.status === 'active') {
        actions = `<button class="btn primary sm" onclick="app.submitMilestone(${m.id})">Submit work</button>`;
      } else if (m.status === 'submitted' && isClient) {
        actions = `
          <button class="btn primary sm" onclick="app.approveMilestone(${m.id}, ${m.amount})">Approve &amp; release ${app.money(m.amount * 0.82)}</button>
          <button class="btn danger sm" onclick="app.requestChangesModal(${m.id})">Request changes</button>`;
      }
      return `
        <div class="milestone">
          <div class="top">
            <div>
              <b>${app.esc(m.title)}</b>
              <div class="small muted">${m.due_date ? 'Due ' + app.esc(m.due_date) : 'No due date'} · created ${app.timeAgo(m.created_at)}</div>
            </div>
            <div style="text-align:right">
              <div class="amount">${app.money(m.amount)}</div>
              ${app.badge(m.status)}
            </div>
          </div>
          ${m.status === 'submitted' ? '<p class="small" style="margin-top:8px;color:var(--blue)">Work submitted — awaiting client approval.</p>' : ''}
          ${m.status === 'funded' ? '<p class="small muted" style="margin-top:8px">Funded and held in escrow until approval.</p>' : ''}
          ${actions ? `<div class="actions">${actions}</div>` : ''}
        </div>`;
    }).join('') || '<div class="empty"><h3>No milestones yet</h3><p>Add a milestone to start funding this contract.</p></div>';

    const canAddMilestone = isClient && c.status === 'active' && unallocated > 0.001;

    const messagesHtml = d.messages.map(m => `
      <div class="msg ${m.sender_id === u.id ? 'mine' : ''}">
        <div>${app.esc(m.body)}</div>
        <div class="meta">${app.esc(m.sender_name)} · ${app.timeAgo(m.created_at)}</div>
      </div>`).join('') || '<div class="small muted" style="text-align:center;padding:20px">No messages yet. Say hello!</div>';

    let reviewHtml = '';
    if (c.status === 'completed') {
      if (d.can_review) {
        reviewHtml = `
          <div class="review-box">
            <div class="card-title">Leave a review</div>
            <p class="small muted">How was your experience with ${app.esc(other)}?</p>
            <div class="star-picker" id="star-picker">
              ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${n <= app.state.reviewRating ? 'on' : ''}" onclick="app.setReviewRating(${n})">★</button>`).join('')}
            </div>
            <div class="field"><textarea id="review-comment" placeholder="Share details about the work, communication and timeliness."></textarea></div>
            <button class="btn primary" onclick="app.submitReview(${c.id})">Submit review</button>
          </div>`;
      } else if (d.my_review) {
        reviewHtml = `
          <div class="review-box">
            <div class="card-title">Your review</div>
            <div class="rating-line"><span class="stars">${app.stars(d.my_review.rating)}</span><b>${d.my_review.rating}.0</b></div>
            <p class="small muted" style="margin-top:6px">${app.esc(d.my_review.comment || 'No comment')}</p>
          </div>`;
      }
    }

    document.getElementById('view').innerHTML = `
      <div class="page-head">
        <a class="small muted" href="#/contracts">← Back to contracts</a>
        <div class="spread" style="margin-top:6px">
          <h1>${app.esc(c.job_title)}</h1>
          ${app.badge(c.status)}
        </div>
        <p>Contract #${c.id} · started ${app.timeAgo(c.started_at)}</p>
      </div>
      <div class="layout">
        <div class="stack">
          <div class="card">
            <div class="spread">
              <div class="row">
                <span class="avatar lg">${app.initials(other)}</span>
                <div>
                  <div class="small muted">${isClient ? 'Handyman' : 'Client'}</div>
                  <b style="font-size:16px">${app.esc(other)}</b>
                  <div class="small muted">${app.esc(otherTitle || '')}</div>
                </div>
              </div>
              <div style="text-align:right">
                <div class="tiny muted">Contract total</div>
                <div style="font-size:22px;font-weight:800">${app.money(c.total_amount)}</div>
              </div>
            </div>
            <div style="margin-top:16px">
              <div class="spread small muted" style="margin-bottom:4px"><span>${app.money(d.released)} released</span><span>${pct}%</span></div>
              <div class="progress"><span style="width:${pct}%"></span></div>
            </div>
            <div class="grid cols-3" style="margin-top:18px">
              <div><div class="tiny muted">Released</div><b>${app.money(d.released)}</b></div>
              <div><div class="tiny muted">In escrow</div><b>${app.money(d.in_escrow)}</b></div>
              <div><div class="tiny muted">Remaining</div><b>${app.money(remaining)}</b></div>
            </div>
          </div>

          <div class="card">
            <div class="spread"><div class="card-title" style="margin:0">Milestones</div><span class="small muted">18% platform fee · 82% handyman</span></div>
            <div style="margin-top:14px">${milestonesHtml}</div>
            ${canAddMilestone ? `
              <details style="margin-top:14px">
                <summary class="link small" style="cursor:pointer">+ Add milestone</summary>
                <form style="margin-top:12px" onsubmit="app.addMilestone(event, ${c.id})">
                  <div class="grid-2">
                    <div class="field"><label>Title</label><input id="ms-title" placeholder="e.g. Phase 2" required></div>
                    <div class="field"><label>Amount ($)</label><input id="ms-amount" type="number" min="1" step="1" max="${unallocated}" placeholder="${Math.floor(unallocated)}" required></div>
                  </div>
                  <div class="field"><label>Due date</label><input id="ms-due" type="date"></div>
                  <button class="btn secondary" type="submit">Add milestone</button>
                </form>
              </details>` : ''}
          </div>

          <div class="chat">
            <div class="chat-head">Messages</div>
            <div class="chat-body" id="chat-body">${messagesHtml}</div>
            <form class="chat-input" onsubmit="app.sendMessage(event, ${c.id})">
              <input id="chat-input" placeholder="Write a message…" autocomplete="off" required>
              <button class="btn primary" type="submit">Send</button>
            </form>
          </div>

          ${reviewHtml}
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-title">Payment summary</div>
            <div class="money-row"><span>Contract total</span><b>${app.money(c.total_amount)}</b></div>
            <div class="money-row"><span>Platform fee (18%)</span><span>${app.money(c.platform_fee)}</span></div>
            <div class="money-row"><span>Handyman payout (82%)</span><b>${app.money(c.handyman_amount)}</b></div>
            <div class="money-row"><span>Released so far</span><span>${app.money(d.released)}</span></div>
            <div class="money-row"><span>Held in escrow</span><span>${app.money(d.in_escrow)}</span></div>
          </div>
          <div class="card">
            <div class="card-title">How it works</div>
            <p class="small muted">1. Client funds a milestone.<br>2. Handyman does the work and submits it.<br>3. Client approves and payment is released — 82% to the handyman, 18% platform fee.</p>
          </div>
        </div>
      </div>`;

    const chat = document.getElementById('chat-body');
    if (chat) chat.scrollTop = chat.scrollHeight;
  },

  async fundMilestone(id) {
    try { const r = await app.api('/payments/milestones/' + id + '/fund', 'POST', {}); app.toast(r.message); app.render(); }
    catch (e) { app.toast(e.message, true); }
  },
  editMilestone(mid, contractId) {
    const m = (app.state.milestones || {})[mid];
    if (!m) return;
    const others = Object.values(app.state.milestones || {})
      .filter(x => x.id !== m.id)
      .reduce((s, x) => s + Number(x.amount), 0);
    const max = Math.max(0, Number(app.state.contractTotal || 0) - others);
    app.modal(`
      <h3>Edit milestone</h3>
      <form onsubmit="app.saveMilestone(event, ${mid}, ${contractId})">
        <div class="field"><label>Title</label><input id="edit-ms-title" value="${app.esc(m.title)}" required></div>
        <div class="grid-2">
          <div class="field"><label>Amount ($)</label><input id="edit-ms-amount" type="number" min="1" step="1" max="${max}" value="${m.amount}" required></div>
          <div class="field"><label>Due date</label><input id="edit-ms-due" type="date" value="${m.due_date ? String(m.due_date).slice(0, 10) : ''}"></div>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" onclick="app.closeModal()">Cancel</button>
          <button type="submit" class="btn primary">Save milestone</button>
        </div>
      </form>`);
  },
  async saveMilestone(e, mid, contractId) {
    e.preventDefault();
    try {
      await app.api('/contracts/' + contractId + '/milestones/' + mid, 'PATCH', {
        title: document.getElementById('edit-ms-title').value.trim(),
        amount: Number(document.getElementById('edit-ms-amount').value),
        due_date: document.getElementById('edit-ms-due').value || null
      });
      app.closeModal();
      app.toast('Milestone updated');
      app.render();
    } catch (err) { app.toast(err.message, true); }
  },
  deleteMilestone(mid, contractId) {
    app.modal(`
      <h3>Delete milestone?</h3>
      <p>This removes the milestone from the contract. Only pending, unfunded milestones can be deleted.</p>
      <div class="actions">
        <button class="btn ghost" onclick="app.closeModal()">Cancel</button>
        <button class="btn danger" onclick="app.doDeleteMilestone(${mid}, ${contractId})">Delete milestone</button>
      </div>`);
  },
  async doDeleteMilestone(mid, contractId) {
    try {
      const r = await app.api('/contracts/' + contractId + '/milestones/' + mid, 'DELETE');
      app.closeModal();
      app.toast(r.message);
      app.render();
    } catch (err) { app.toast(err.message, true); }
  },
  async submitMilestone(id) {
    try { const r = await app.api('/payments/milestones/' + id + '/submit', 'POST', {}); app.toast(r.message); app.render(); }
    catch (e) { app.toast(e.message, true); }
  },
  approveMilestone(id, amount) {
    app.modal(`
      <h3>Approve &amp; release payment?</h3>
      <p>You are releasing <b>${app.money(amount)}</b> from escrow. The handyman receives <b>${app.money(amount * 0.82)}</b> and the platform keeps <b>${app.money(amount * 0.18)}</b> (18%).</p>
      <div class="actions">
        <button class="btn ghost" onclick="app.closeModal()">Cancel</button>
        <button class="btn primary" onclick="app.doApprove(${id})">Approve &amp; release</button>
      </div>`);
  },
  async doApprove(id) {
    try { const r = await app.api('/payments/milestones/' + id + '/approve', 'POST', {}); app.closeModal(); app.toast(r.message); app.render(); }
    catch (e) { app.toast(e.message, true); }
  },
  requestChangesModal(id) {
    app.modal(`
      <h3>Request changes</h3>
      <p>Tell the handyman what needs to be adjusted. The milestone stays funded in escrow.</p>
      <div class="field"><textarea id="changes-note" placeholder="What should be changed?"></textarea></div>
      <div class="actions">
        <button class="btn ghost" onclick="app.closeModal()">Cancel</button>
        <button class="btn primary" onclick="app.requestChanges(${id})">Send request</button>
      </div>`);
  },
  async requestChanges(id) {
    try {
      const note = document.getElementById('changes-note').value.trim();
      const r = await app.api('/payments/milestones/' + id + '/request-changes', 'POST', { note });
      app.closeModal(); app.toast(r.message); app.render();
    } catch (e) { app.toast(e.message, true); }
  },
  async addMilestone(e, contractId) {
    e.preventDefault();
    try {
      await app.api('/contracts/' + contractId + '/milestones', 'POST', {
        title: document.getElementById('ms-title').value.trim(),
        amount: Number(document.getElementById('ms-amount').value),
        due_date: document.getElementById('ms-due').value || undefined
      });
      app.toast('Milestone added');
      app.render();
    } catch (err) { app.toast(err.message, true); }
  },
  async sendMessage(e, contractId) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      await app.api('/contracts/' + contractId + '/messages', 'POST', { body });
      await app.renderContract(contractId);
    } catch (err) { app.toast(err.message, true); }
  },
  setReviewRating(n) {
    app.state.reviewRating = n;
    document.querySelectorAll('#star-picker button').forEach((b, i) => b.classList.toggle('on', i < n));
  },
  async submitReview(contractId) {
    try {
      await app.api('/contracts/' + contractId + '/reviews', 'POST', {
        rating: app.state.reviewRating,
        comment: document.getElementById('review-comment').value.trim()
      });
      app.toast('Review submitted');
      app.render();
    } catch (e) { app.toast(e.message, true); }
  },

  // ------------------------------------------------------------------ talent
  async renderTalent(route) {
    const q = route.q.get('q') || '';
    const category = route.q.get('category') || '';
    const maxRate = route.q.get('max_rate') || '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (maxRate) params.set('max_rate', maxRate);
    const data = await app.api('/users/handymen?' + params.toString());

    document.getElementById('view').innerHTML = `
      <div class="page-head"><h1>Find talent</h1><p>Browse vetted handymen by trade, rate and rating.</p></div>
      <form class="filters" onsubmit="app.filterTalent(event)">
        <input id="talent-q" type="search" placeholder="Search by name or skill" value="${app.esc(q)}" style="min-width:240px">
        <select id="talent-category">
          <option value="">All categories</option>
          ${CATEGORIES.map(c => `<option ${c === category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <select id="talent-rate">
          <option value="">Any rate</option>
          <option value="50" ${maxRate === '50' ? 'selected' : ''}>Up to $50/hr</option>
          <option value="75" ${maxRate === '75' ? 'selected' : ''}>Up to $75/hr</option>
          <option value="100" ${maxRate === '100' ? 'selected' : ''}>Up to $100/hr</option>
        </select>
        <button class="btn secondary" type="submit">Filter</button>
      </form>
      <div class="grid cols-3">
        ${data.handymen.length ? data.handymen.map(h => `
          <div class="talent-card">
            <div class="talent-head">
              <span class="avatar lg">${app.initials(h.full_name)}</span>
              <div>
                <h3>${app.esc(h.full_name)}</h3>
                <div class="small muted">${app.esc(h.title || h.category || '')}</div>
              </div>
            </div>
            <div class="rating-line">
              <span class="stars">${app.stars(h.rating)}</span>
              <b>${Number(h.rating || 0).toFixed(1)}</b>
              <span>(${h.reviews_count} review${h.reviews_count === 1 ? '' : 's'})</span>
            </div>
            <div class="rate">${app.money0(h.hourly_rate)}<small>/hr</small></div>
            <div class="small muted">${app.esc(h.location || 'Remote')} · ${h.experience_years || 0} yrs exp · ${h.total_jobs} job${h.total_jobs === 1 ? '' : 's'} completed</div>
            ${h.skills ? `<div class="skills">${h.skills.split(',').slice(0, 4).map(s => `<span class="chip">${app.esc(s.trim())}</span>`).join('')}</div>` : ''}
            <a class="btn secondary sm" href="#/talent/${h.id}" style="margin-top:auto">View profile</a>
          </div>`).join('')
        : `<div class="empty" style="grid-column:1/-1"><h3>No talent found</h3><p>Try a different search or category.</p></div>`}
      </div>`;
  },
  filterTalent(e) {
    e.preventDefault();
    const params = new URLSearchParams();
    const q = document.getElementById('talent-q').value.trim();
    const category = document.getElementById('talent-category').value;
    const rate = document.getElementById('talent-rate').value;
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (rate) params.set('max_rate', rate);
    app.navigate('#/talent' + (params.toString() ? '?' + params.toString() : ''));
  },
  async renderTalentDetail(id) {
    const d = await app.api('/users/handymen/' + id);
    const h = d.handyman;
    const skills = (h.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    document.getElementById('view').innerHTML = `
      <div class="page-head"><a class="small muted" href="#/talent">← Back to talent</a></div>
      <div class="layout">
        <div class="stack">
          <div class="card">
            <div class="row">
              <span class="avatar lg">${app.initials(h.full_name)}</span>
              <div class="grow">
                <h1 style="font-size:26px">${app.esc(h.full_name)}</h1>
                <div class="muted">${app.esc(h.title || h.category || '')}</div>
                <div class="rating-line" style="margin-top:6px">
                  <span class="stars">${app.stars(h.rating)}</span>
                  <b>${Number(h.rating || 0).toFixed(1)}</b>
                  <span>(${h.reviews_count} review${h.reviews_count === 1 ? '' : 's'})</span>
                  <span>· ${app.esc(h.location || 'Remote')}</span>
                </div>
              </div>
              <div style="text-align:right">
                <div class="rate" style="font-size:24px;font-weight:800">${app.money0(h.hourly_rate)}<small style="font-size:13px;color:var(--text);font-weight:500">/hr</small></div>
                <div class="small ${h.availability === 'available' ? 'green' : 'muted'}">${h.availability === 'available' ? '● Available now' : '● Busy'}</div>
              </div>
            </div>
            <div class="grid cols-3" style="margin-top:20px">
              <div><div class="tiny muted">Jobs completed</div><b>${h.total_jobs}</b></div>
              <div><div class="tiny muted">Total earned</div><b>${app.money(h.total_earned)}</b></div>
              <div><div class="tiny muted">Experience</div><b>${h.experience_years || 0} years</b></div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Overview</div>
            <p style="white-space:pre-wrap">${app.esc(h.overview || 'This handyman has not added an overview yet.')}</p>
            ${skills.length ? `<div class="skills">${skills.map(s => `<span class="chip">${app.esc(s)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="card">
            <div class="card-title">Reviews</div>
            ${d.reviews.length ? d.reviews.map(r => `
              <div style="padding:14px 0;border-bottom:1px solid var(--line)">
                <div class="spread">
                  <div class="rating-line"><span class="stars">${app.stars(r.rating)}</span><b>${r.rating}.0</b></div>
                  <span class="tiny muted">${app.timeAgo(r.created_at)}</span>
                </div>
                <p class="small" style="margin-top:6px">${app.esc(r.comment || 'No comment')}</p>
                <div class="tiny muted" style="margin-top:4px">${app.esc(r.reviewer_name)} · ${app.esc(r.job_title || '')}</div>
              </div>`).join('')
            : '<p class="small muted">No reviews yet.</p>'}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-title">Work with ${app.esc(h.full_name.split(' ')[0])}</div>
            <p class="small muted">Post a job describing your project and ${app.esc(h.full_name.split(' ')[0])} can send you a proposal.</p>
            ${app.state.user.role === 'client'
              ? '<a class="btn primary block" href="#/job-new" style="margin-top:12px">Post a job</a>'
              : '<div class="small muted" style="margin-top:12px">Switch to a client account to hire talent.</div>'}
          </div>
          <div class="card">
            <div class="card-title">At a glance</div>
            <div class="money-row"><span>Primary trade</span><b>${app.esc(h.category || '—')}</b></div>
            <div class="money-row"><span>Hourly rate</span><b>${app.money0(h.hourly_rate)}/hr</b></div>
            <div class="money-row"><span>Availability</span><span>${app.esc(h.availability || 'available')}</span></div>
            <div class="money-row"><span>Member since</span><span>${app.timeAgo(h.created_at)}</span></div>
          </div>
        </div>
      </div>`;
  },

  // ------------------------------------------------------------------ profile
  async renderProfile() {
    const d = await app.api('/users/me/profile');
    const u = d.user;
    const isHandyman = u.role === 'handyman';
    document.getElementById('view').innerHTML = `
      <div class="page-head"><h1>Profile</h1><p>${isHandyman ? 'Your public profile is what clients see when comparing proposals.' : 'Keep your contact details up to date.'}</p></div>
      <form class="card form-card" onsubmit="app.saveProfile(event)">
        <div class="grid-2">
          <div class="field"><label>Full name</label><input id="prof-name" value="${app.esc(u.full_name)}" required></div>
          <div class="field"><label>Location</label><input id="prof-location" value="${app.esc(u.location || '')}" placeholder="City, State"></div>
        </div>
        ${isHandyman ? `
          <div class="field"><label>Professional title</label><input id="prof-title" value="${app.esc(u.title || '')}" placeholder="e.g. Licensed Plumber"></div>
          <div class="grid-2">
            <div class="field"><label>Primary trade</label>
              <select id="prof-category">${CATEGORIES.map(c => `<option ${c === u.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Hourly rate ($)</label><input id="prof-rate" type="number" min="1" step="1" value="${u.hourly_rate || 50}"></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>Years of experience</label><input id="prof-exp" type="number" min="0" step="1" value="${u.experience_years || 0}"></div>
            <div class="field"><label>Availability</label>
              <select id="prof-availability">
                <option value="available" ${u.availability === 'available' ? 'selected' : ''}>Available now</option>
                <option value="busy" ${u.availability === 'busy' ? 'selected' : ''}>Busy</option>
              </select>
            </div>
          </div>
          <div class="field"><label>Skills (comma separated)</label><input id="prof-skills" value="${app.esc(u.skills || '')}" placeholder="Plumbing, Leak Repair, Faucet Installation"></div>
          <div class="field"><label>Overview</label><textarea id="prof-overview" placeholder="Tell clients about your experience, approach and what you specialize in.">${app.esc(u.overview || '')}</textarea></div>
        ` : ''}
        <div class="form-actions"><button class="btn primary" type="submit">Save profile</button></div>
      </form>`;
  },
  async saveProfile(e) {
    e.preventDefault();
    const u = app.state.user;
    const payload = {
      full_name: document.getElementById('prof-name').value.trim(),
      location: document.getElementById('prof-location').value.trim()
    };
    if (u.role === 'handyman') {
      payload.title = document.getElementById('prof-title').value.trim();
      payload.category = document.getElementById('prof-category').value;
      payload.hourly_rate = Number(document.getElementById('prof-rate').value);
      payload.experience_years = Number(document.getElementById('prof-exp').value);
      payload.availability = document.getElementById('prof-availability').value;
      payload.skills = document.getElementById('prof-skills').value.trim();
      payload.overview = document.getElementById('prof-overview').value.trim();
    }
    try {
      const r = await app.api('/users/me/profile', 'PUT', payload);
      app.state.user = { ...app.state.user, ...r.user };
      localStorage.setItem('hp_user', JSON.stringify(app.state.user));
      app.toast('Profile saved');
      app.render();
    } catch (err) { app.toast(err.message, true); }
  },

  // ------------------------------------------------------------------ admin
  async renderAdmin() {
    const [stats, users, jobs, contracts] = await Promise.all([
      app.api('/admin/stats'), app.api('/admin/users'), app.api('/admin/jobs'), app.api('/admin/contracts')
    ]);
    const tab = app.state.adminTab;
    const view = document.getElementById('view');

    const usersTable = `
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Location</th><th>Activity</th><th>Joined</th></tr></thead>
        <tbody>${users.users.map(u => `
          <tr>
            <td><b>${app.esc(u.full_name)}</b></td>
            <td class="muted">${app.esc(u.email)}</td>
            <td><span class="badge">${u.role}</span></td>
            <td>${app.esc(u.location || '—')}</td>
            <td>${u.role === 'client' ? u.jobs_posted + ' jobs posted' : u.role === 'handyman' ? u.proposals_sent + ' proposals · ' + u.completed_contracts + ' completed' : '—'}</td>
            <td>${app.timeAgo(u.created_at)}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;

    const jobsTable = `
      <div class="table-wrap"><table>
        <thead><tr><th>Job</th><th>Client</th><th>Category</th><th>Budget</th><th>Proposals</th><th>Status</th><th>Posted</th></tr></thead>
        <tbody>${jobs.jobs.map(j => `
          <tr>
            <td><a class="link" href="#/jobs/${j.id}">${app.esc(j.title)}</a></td>
            <td>${app.esc(j.client_name)}</td>
            <td>${app.esc(j.category)}</td>
            <td>${j.budget_type === 'hourly' ? app.money0(j.budget_min) + '–' + app.money0(j.budget_max) + '/hr' : app.money0(j.budget_min) + '–' + app.money0(j.budget_max)}</td>
            <td>${j.proposals_count}</td>
            <td>${app.badge(j.status)}</td>
            <td>${app.timeAgo(j.created_at)}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;

    const contractsTable = `
      <div class="table-wrap"><table>
        <thead><tr><th>Contract</th><th>Client</th><th>Handyman</th><th>Total</th><th>Released</th><th>Fee (18%)</th><th>Status</th></tr></thead>
        <tbody>${contracts.contracts.map(c => `
          <tr>
            <td><a class="link" href="#/contracts/${c.id}">${app.esc(c.job_title)}</a></td>
            <td>${app.esc(c.client_name)}</td>
            <td>${app.esc(c.handyman_name)}</td>
            <td>${app.money(c.total_amount)}</td>
            <td>${app.money(c.released)}</td>
            <td>${app.money(c.platform_fee)}</td>
            <td>${app.badge(c.status)}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;

    view.innerHTML = `
      <div class="page-head"><h1>Admin</h1><p>Platform health, users, jobs and contracts.</p></div>
      <div class="stats">
        <div class="stat"><div class="label">Platform revenue</div><div class="value">${app.money(stats.platform_revenue)}</div><div class="sub">18% of released milestones</div></div>
        <div class="stat"><div class="label">In escrow</div><div class="value">${app.money(stats.escrow)}</div><div class="sub">Funded milestones</div></div>
        <div class="stat"><div class="label">Users</div><div class="value">${stats.users}</div><div class="sub">${stats.clients} clients · ${stats.handymen} handymen</div></div>
        <div class="stat"><div class="label">Contracts</div><div class="value">${stats.contracts}</div><div class="sub">${stats.active_contracts} active · ${stats.completed_contracts} completed</div></div>
      </div>
      <div class="tabs" style="max-width:520px">
        <button class="${tab === 'users' ? 'active' : ''}" onclick="app.setAdminTab('users')">Users (${stats.users})</button>
        <button class="${tab === 'jobs' ? 'active' : ''}" onclick="app.setAdminTab('jobs')">Jobs (${stats.jobs})</button>
        <button class="${tab === 'contracts' ? 'active' : ''}" onclick="app.setAdminTab('contracts')">Contracts (${stats.contracts})</button>
      </div>
      ${tab === 'users' ? usersTable : tab === 'jobs' ? jobsTable : contractsTable}`;
  },
  setAdminTab(tab) {
    app.state.adminTab = tab;
    app.renderAdmin();
  }
};

window.app = app;
app.boot();
