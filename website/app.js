/* ═══════════════════════════════════════════════════════════════
   SEOPulse — app.js
   Handles: API integration, WebSocket, dashboard views,
            navbar scroll, animations, interactive elements
   ═══════════════════════════════════════════════════════════════ */

const API = 'http://localhost:8000';
const WS_BASE = 'ws://localhost:8000';

/* ─────────────────────────────────────────────────────────────── 
   SHARED UTILITIES
───────────────────────────────────────────────────────────────── */
function fmt(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch { return dateStr; }
}

function scoreClass(score) {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function severityClass(sev) {
  if (sev === 'error')   return 'error';
  if (sev === 'warning') return 'warning';
  return 'info';
}

function copyText(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

/* ─────────────────────────────────────────────────────────────── 
   API HEALTH CHECK — used on both pages
───────────────────────────────────────────────────────────────── */
async function checkApiStatus() {
  // Landing page elements
  const dot  = document.getElementById('api-dot');
  const text = document.getElementById('api-status-text');
  // Dashboard elements
  const sidebarDot  = document.querySelector('#sidebar-api-status .status-dot');
  const sidebarText = document.getElementById('sidebar-status-text');
  const miniDot     = document.querySelector('#mini-status .status-dot');
  const miniText    = document.getElementById('mini-status-text');

  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    const ok  = res.ok;

    if (dot)  { dot.classList.toggle('online', ok); dot.classList.toggle('offline', !ok); }
    if (text) text.textContent = ok ? 'Online' : 'Offline';

    if (sidebarDot)  sidebarDot.classList.toggle('online', ok);
    if (sidebarText) sidebarText.textContent = ok ? 'API Online' : 'API Offline';
    if (miniDot)     miniDot.classList.toggle('green', ok);
    if (miniText)    miniText.textContent = ok ? 'API Online' : 'API Offline';
  } catch {
    if (dot)  { dot.classList.remove('online'); dot.classList.add('offline'); }
    if (text) text.textContent = 'Offline';
    if (sidebarDot)  sidebarDot.classList.remove('online');
    if (sidebarText) sidebarText.textContent = 'API Offline';
    if (miniText)    miniText.textContent = 'API Offline';
  }
}

/* ─────────────────────────────────────────────────────────────── 
   LANDING PAGE — Navbar scroll effect
───────────────────────────────────────────────────────────────── */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  // Hamburger mobile menu
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.querySelector('.nav-links');
  const navActions = document.querySelector('.nav-actions');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      if (navLinks)  navLinks.style.display  = navLinks.style.display  === 'flex' ? 'none' : 'flex';
      if (navActions) navActions.style.display = navActions.style.display === 'flex' ? 'none' : 'flex';
    });
  }
}

/* ─────────────────────────────────────────────────────────────── 
   LANDING PAGE — Scroll-in animations (Intersection Observer)
───────────────────────────────────────────────────────────────── */
function initScrollAnimations() {
  const targets = document.querySelectorAll(
    '.feature-card, .rule-card, .stack-item, .pipeline-step, .arch-box, .score-pill'
  );
  if (!targets.length) return;

  targets.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = `opacity 0.5s ease ${(i % 6) * 60}ms, transform 0.5s ease ${(i % 6) * 60}ms`;
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  targets.forEach(el => obs.observe(el));
}

/* ─────────────────────────────────────────────────────────────── 
   DASHBOARD — Sidebar navigation
───────────────────────────────────────────────────────────────── */
function switchView(viewName) {
  // Update links
  document.querySelectorAll('.sidebar-link').forEach(l => {
    l.classList.toggle('active', l.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewName}`);
  });

  // Update header
  const titles = {
    crawl:     ['New Crawl',    'Start a new SEO audit crawl'],
    jobs:      ['Crawl Jobs',   'View and manage all crawl jobs'],
    pages:     ['Pages',        'Browse audited pages and their scores'],
    analytics: ['Analytics',    'Score trends and regression detection'],
  };
  const [title, subtitle] = titles[viewName] || ['Dashboard', ''];
  const h1 = document.getElementById('view-title');
  const p  = document.getElementById('view-subtitle');
  if (h1) h1.textContent = title;
  if (p)  p.textContent  = subtitle;

  // Auto-load jobs when switching to that view
  if (viewName === 'jobs') loadJobs();
}

function initSidebarLinks() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });

  // Mobile sidebar toggle
  const toggle  = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
}

/* ─────────────────────────────────────────────────────────────── 
   DASHBOARD — Crawl form + WebSocket live log
───────────────────────────────────────────────────────────────── */
let activeWs = null;

function logEntry(msg, type = 'info') {
  const log  = document.getElementById('liveLog');
  if (!log) return;
  const placeholder = log.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const time = new Date().toLocaleTimeString('en', { hour12: false });
  const div  = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">[${time}]</span><span class="log-${type}">${escHtml(msg)}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setLiveIndicator(active, text = '') {
  const ind = document.getElementById('liveIndicator');
  const dot = ind?.querySelector('.live-dot');
  if (!ind) return;
  ind.innerHTML = '';
  const d = document.createElement('span');
  d.className = 'live-dot' + (active ? ' active' : '');
  const s = document.createElement('span');
  s.textContent = text || (active ? ' Live' : ' Waiting...');
  ind.appendChild(d);
  ind.appendChild(s);
}

function connectWebSocket(jobId) {
  if (activeWs) { try { activeWs.close(); } catch {} }
  const url = `${WS_BASE}/ws/crawl/${jobId}`;
  logEntry(`Connecting to WebSocket: ${url}`, 'info');
  setLiveIndicator(true, ' Connecting...');

  try {
    const ws = new WebSocket(url);
    activeWs = ws;

    ws.onopen = () => {
      logEntry('WebSocket connected — streaming live results', 'ok');
      setLiveIndicator(true, ' Live');
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const type = data.status === 'error' ? 'error'
                   : data.status === 'completed' ? 'ok' : 'info';
        const msg  = data.url
          ? `${data.status?.toUpperCase() || 'UPDATE'} — ${data.url}${data.score !== undefined ? ` [score: ${data.score}]` : ''}`
          : JSON.stringify(data);
        logEntry(msg, type);
      } catch {
        logEntry(e.data, 'info');
      }
    };

    ws.onerror = () => {
      logEntry('WebSocket error — live streaming unavailable (API may not support WS yet)', 'warn');
      setLiveIndicator(false, ' Disconnected');
    };

    ws.onclose = () => {
      logEntry('WebSocket connection closed', 'info');
      setLiveIndicator(false, ' Done');
      activeWs = null;
    };
  } catch (err) {
    logEntry(`WebSocket not available: ${err.message}`, 'warn');
    setLiveIndicator(false, ' No WS');
  }
}

function initCrawlForm() {
  const form    = document.getElementById('crawlForm');
  const sitemapCheck = document.getElementById('f-sitemap');
  const sitemapGroup = document.getElementById('sitemap-url-group');

  if (!form) return;

  if (sitemapCheck && sitemapGroup) {
    sitemapCheck.addEventListener('change', () => {
      sitemapGroup.style.display = sitemapCheck.checked ? 'flex' : 'none';
    });
  }

  // Auto-fill start URL when domain is typed
  const domainInput   = document.getElementById('f-domain');
  const startUrlInput = document.getElementById('f-starturl');
  if (domainInput && startUrlInput) {
    domainInput.addEventListener('blur', () => {
      if (domainInput.value && !startUrlInput.value) {
        const domain = domainInput.value.trim().replace(/^https?:\/\//, '');
        startUrlInput.value = `https://${domain}`;
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnText   = document.getElementById('crawlBtnText');
    const btnLoader = document.getElementById('crawlBtnLoader');
    const submitBtn = document.getElementById('crawlSubmitBtn');

    btnText.style.display   = 'none';
    btnLoader.style.display = 'inline';
    submitBtn.disabled      = true;

    const body = {
      domain:         document.getElementById('f-domain').value.trim(),
      start_url:      document.getElementById('f-starturl').value.trim(),
      max_depth:      parseInt(document.getElementById('f-depth').value) || 2,
      max_pages:      parseInt(document.getElementById('f-pages').value) || 100,
      respect_robots: document.getElementById('f-robots').checked,
      use_sitemap:    document.getElementById('f-sitemap').checked,
      sitemap_url:    document.getElementById('f-sitemapurl')?.value || null,
      include_patterns: [],
      exclude_patterns: [],
    };

    // Clear log
    const log = document.getElementById('liveLog');
    if (log) log.innerHTML = '';
    logEntry(`Starting crawl for domain: ${body.domain}`, 'info');

    try {
      const res = await fetch(`${API}/api/v1/crawls/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      logEntry(`Crawl created — Job ID: ${data.job_id}`, 'ok');
      logEntry(`Status: ${data.status}`, 'ok');

      // Show result card
      const resultCard = document.getElementById('crawlResult');
      if (resultCard) {
        resultCard.style.display = 'block';
        document.getElementById('res-jobid').textContent    = data.job_id;
        document.getElementById('res-domain').textContent   = data.domain;
        document.getElementById('res-status').textContent   = data.status;
        document.getElementById('res-status').className     = `status-badge ${data.status}`;
        document.getElementById('res-created').textContent  = fmt(data.created_at);
      }

      // Connect WS for live updates
      connectWebSocket(data.job_id);

    } catch (err) {
      logEntry(`Error: ${err.message}`, 'error');
      setLiveIndicator(false, ' Error');
    } finally {
      btnText.style.display   = 'inline';
      btnLoader.style.display = 'none';
      submitBtn.disabled      = false;
    }
  });
}

/* ─────────────────────────────────────────────────────────────── 
   DASHBOARD — Jobs view
───────────────────────────────────────────────────────────────── */
async function loadJobs() {
  const wrap   = document.getElementById('jobsTableWrap');
  const filter = document.getElementById('jobsDomainFilter');
  if (!wrap) return;

  wrap.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading jobs...</p></div>`;

  const domain = filter?.value?.trim() || '';
  const url    = domain
    ? `${API}/api/v1/crawls/?domain=${encodeURIComponent(domain)}&limit=50`
    : `${API}/api/v1/crawls/?limit=50`;

  try {
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const jobs = await res.json();

    if (!jobs.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No crawl jobs found. Start one from the New Crawl tab.</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Domain</th>
            <th>Status</th>
            <th>Pages</th>
            <th>Created</th>
            <th>Completed</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="jobsTbody"></tbody>
      </table>`;

    const tbody = document.getElementById('jobsTbody');
    jobs.forEach(job => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code title="Click to copy" onclick="copyText('${job.job_id}')">${job.job_id.slice(0,8)}…</code></td>
        <td>${escHtml(job.domain)}</td>
        <td><span class="status-badge ${job.status}">${job.status}</span></td>
        <td>${job.crawled_urls ?? '—'} / ${job.total_urls ?? '—'}</td>
        <td>${fmt(job.created_at)}</td>
        <td>${fmt(job.completed_at)}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openJobModal('${job.job_id}')">Details</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Failed to load jobs: ${escHtml(err.message)}</p></div>`;
  }
}

async function openJobModal(jobId) {
  const overlay = document.getElementById('modalOverlay');
  const body    = document.getElementById('modalBody');
  const title   = document.getElementById('modalTitle');
  if (!overlay || !body) return;

  title.textContent = 'Loading…';
  body.innerHTML    = `<div class="loading-state"><div class="spinner"></div></div>`;
  overlay.style.display = 'flex';

  try {
    const res = await fetch(`${API}/api/v1/crawls/${jobId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const job = await res.json();

    title.textContent = `Job: ${job.job_id.slice(0,16)}…`;
    body.innerHTML = `
      <div class="modal-field"><label>Job ID</label><code>${job.job_id}</code></div>
      <div class="modal-field"><label>Domain</label><span class="val">${escHtml(job.domain)}</span></div>
      <div class="modal-field"><label>Status</label><span class="status-badge ${job.status}">${job.status}</span></div>
      <div class="modal-field"><label>Pages crawled</label><span class="val">${job.crawled_urls ?? '—'} / ${job.total_urls ?? '—'}</span></div>
      <div class="modal-field"><label>Created</label><span class="val">${fmt(job.created_at)}</span></div>
      <div class="modal-field"><label>Started</label><span class="val">${fmt(job.started_at)}</span></div>
      <div class="modal-field"><label>Completed</label><span class="val">${fmt(job.completed_at)}</span></div>
      <div style="margin-top:16px">
        <button class="btn btn-outline btn-sm" onclick="switchView('pages'); document.getElementById('pagesJobFilter').value='${job.job_id}'; loadPages(); closeModal()">
          View Pages for this Job →
        </button>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><p>Error: ${escHtml(err.message)}</p></div>`;
  }
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.style.display = 'none';
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  const overlay = document.getElementById('modalOverlay');
  if (e.target === overlay) closeModal();
});

// Filter jobs on Enter
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement?.id === 'jobsDomainFilter') loadJobs();
});

/* ─────────────────────────────────────────────────────────────── 
   DASHBOARD — Pages view
───────────────────────────────────────────────────────────────── */
async function loadPages() {
  const wrap   = document.getElementById('pagesTableWrap');
  const filter = document.getElementById('pagesJobFilter');
  if (!wrap || !filter) return;

  const jobId = filter.value.trim();
  if (!jobId) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>Enter a Job ID to load pages.</p></div>`;
    return;
  }

  wrap.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading pages...</p></div>`;

  try {
    const res   = await fetch(`${API}/api/v1/pages/?job_id=${encodeURIComponent(jobId)}&limit=100`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pages = await res.json();

    if (!pages.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No pages found for this job yet. Try again once the crawl is running.</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>URL</th>
            <th>Score</th>
            <th>Errors</th>
            <th>Warnings</th>
            <th>Status</th>
            <th>Audited</th>
          </tr>
        </thead>
        <tbody id="pagesTbody"></tbody>
      </table>`;

    const tbody = document.getElementById('pagesTbody');
    pages.forEach(page => {
      const score = page.score ?? page.audit_score ?? '—';
      const cls   = typeof score === 'number' ? scoreClass(score) : '';
      const tr    = document.createElement('tr');
      tr.innerHTML = `
        <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <a href="${escHtml(page.url)}" target="_blank" style="color:var(--neon)">${escHtml(page.url)}</a>
        </td>
        <td>${cls ? `<span class="score-badge ${cls}">${score}</span>` : score}</td>
        <td><span style="color:var(--red)">${page.error_count ?? '—'}</span></td>
        <td><span style="color:var(--yellow)">${page.warning_count ?? '—'}</span></td>
        <td><span class="status-badge ${page.status || 'completed'}">${page.status || 'audited'}</span></td>
        <td>${fmt(page.audited_at || page.created_at)}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Failed to load pages: ${escHtml(err.message)}</p></div>`;
  }
}

/* ─────────────────────────────────────────────────────────────── 
   DASHBOARD — Analytics view
───────────────────────────────────────────────────────────────── */
async function loadAnalytics() {
  const wrap   = document.getElementById('analyticsContent');
  const input  = document.getElementById('analyticsDomain');
  if (!wrap || !input) return;

  const domain = input.value.trim();
  if (!domain) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Enter a domain to load analytics.</p></div>`;
    return;
  }

  wrap.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading analytics for ${escHtml(domain)}…</p></div>`;

  try {
    const [trendsRes, regressionsRes] = await Promise.allSettled([
      fetch(`${API}/api/v1/analytics/trends/${encodeURIComponent(domain)}`),
      fetch(`${API}/api/v1/analytics/regressions/${encodeURIComponent(domain)}`),
    ]);

    const trends      = trendsRes.status === 'fulfilled' && trendsRes.value.ok
      ? await trendsRes.value.json() : [];
    const regressions = regressionsRes.status === 'fulfilled' && regressionsRes.value.ok
      ? await regressionsRes.value.json() : [];

    if (!trends.length && !regressions.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No analytics data found for <strong>${escHtml(domain)}</strong>. Run at least one crawl first.</p></div>`;
      return;
    }

    wrap.innerHTML = `<div class="analytics-grid" id="analyticsGrid"></div>`;
    const grid = document.getElementById('analyticsGrid');

    // Trends section
    const trendsSection = document.createElement('div');
    trendsSection.className = 'analytics-section';
    trendsSection.innerHTML = `<h4>📈 Score Trends</h4>`;
    if (trends.length) {
      trends.slice(0, 15).forEach(t => {
        const score = t.avg_score ?? t.score ?? 0;
        const row   = document.createElement('div');
        row.className = 'trend-row';
        row.innerHTML = `
          <span class="trend-date">${fmt(t.date || t.snapshot_date)}</span>
          <div class="trend-bar-wrap"><div class="trend-bar" style="width:${score}%"></div></div>
          <span class="trend-score" style="color:${score>=80?'#34d399':score>=50?'#fbbf24':'#f87171'}">${Math.round(score)}</span>`;
        trendsSection.appendChild(row);
      });
    } else {
      trendsSection.innerHTML += `<p style="color:var(--text3);font-size:13px">No trend data yet.</p>`;
    }
    grid.appendChild(trendsSection);

    // Regressions section
    const regSection = document.createElement('div');
    regSection.className = 'analytics-section';
    regSection.innerHTML = `<h4>⚠️ Regressions</h4>`;
    if (regressions.length) {
      regressions.slice(0, 15).forEach(r => {
        const diff  = (r.score_diff ?? r.change ?? 0);
        const isDown = diff < 0;
        const row    = document.createElement('div');
        row.className = 'regression-row';
        row.innerHTML = `
          <span class="reg-url">${escHtml(r.url || r.page_url || '—')}</span>
          <span class="reg-change ${isDown ? 'down' : 'up'}">${isDown ? '▼' : '▲'} ${Math.abs(diff).toFixed(1)} pts</span>
          <span style="font-size:12px;color:var(--text3)">${escHtml(r.rule_name || r.tag || '')}</span>`;
        regSection.appendChild(row);
      });
    } else {
      regSection.innerHTML += `<p style="color:var(--text3);font-size:13px">No regressions detected. 🎉</p>`;
    }
    grid.appendChild(regSection);

  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Failed to load analytics: ${escHtml(err.message)}</p></div>`;
  }
}

/* ─────────────────────────────────────────────────────────────── 
   LANDING PAGE — Typewriter effect on hero title
───────────────────────────────────────────────────────────────── */
function initTypewriter() {
  const el = document.querySelector('.hero-title');
  if (!el) return;
  // Just ensure the gradient is animated smoothly
  el.style.backgroundSize = '200%';
}

/* ─────────────────────────────────────────────────────────────── 
   LANDING PAGE — Counter animation for stat cards
───────────────────────────────────────────────────────────────── */
function initCounters() {
  // No dynamic counters on landing currently — placeholder for extension
}

/* ─────────────────────────────────────────────────────────────── 
   DASHBOARD — Keyboard shortcuts
───────────────────────────────────────────────────────────────── */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape closes modal
    if (e.key === 'Escape') closeModal();
    // Ctrl+1/2/3/4 switches views
    if (e.ctrlKey) {
      const views = ['crawl','jobs','pages','analytics'];
      const idx   = parseInt(e.key) - 1;
      if (idx >= 0 && idx < views.length && document.getElementById(`view-${views[idx]}`)) {
        e.preventDefault();
        switchView(views[idx]);
      }
    }
  });
}

/* ─────────────────────────────────────────────────────────────── 
   LANDING PAGE — Particle / orb interaction
───────────────────────────────────────────────────────────────── */
function initOrbParallax() {
  const orbs = document.querySelectorAll('.bg-orb');
  if (!orbs.length) return;
  document.addEventListener('mousemove', (e) => {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / cx;
    const dy = (e.clientY - cy) / cy;
    orbs.forEach((orb, i) => {
      const factor = (i + 1) * 8;
      orb.style.transform = `translate(${dx * factor}px, ${dy * factor}px)`;
    });
  }, { passive: true });
}

/* ─────────────────────────────────────────────────────────────── 
   INIT — Detect which page we're on and initialise accordingly
───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const isDashboard = document.querySelector('.dash-body') !== null;

  // Always check API status
  checkApiStatus();
  setInterval(checkApiStatus, 15000);

  if (isDashboard) {
    // Dashboard page
    initSidebarLinks();
    initCrawlForm();
    initKeyboardShortcuts();

    // Keyboard Enter triggers filter loads
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (document.activeElement?.id === 'analyticsDomain') loadAnalytics();
        if (document.activeElement?.id === 'pagesJobFilter')  loadPages();
      }
    });
  } else {
    // Landing page
    initNavbar();
    initScrollAnimations();
    initOrbParallax();
    initTypewriter();
    initCounters();
  }
});

// Expose globally for onclick attributes
window.switchView    = switchView;
window.loadJobs      = loadJobs;
window.loadPages     = loadPages;
window.loadAnalytics = loadAnalytics;
window.openJobModal  = openJobModal;
window.closeModal    = closeModal;
window.copyText      = copyText;
