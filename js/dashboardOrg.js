// js/dashboardOrg.js

(function () {
  const db = () => firebase.database();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // not used now, kept if you want activity badges later

  // Utilities
  const $ = (id) => document.getElementById(id);
  function setText(id, val) { const el = $(id); if (el) el.textContent = String(val ?? '0'); }

  function animateNumber(id, end, duration = 800) {
    const el = $(id);
    if (!el) return;
    const target = Number(end) || 0;
    if (target <= 0) { el.textContent = '0'; return; }
    let curr = 0;
    const step = Math.max(Math.floor(duration / target), 20);
    const t = setInterval(() => {
      curr += 1;
      el.textContent = String(curr);
      if (curr >= target) clearInterval(t);
    }, step);
  }

  async function waitForUser() {
    return new Promise((resolve) => {
      const off = firebase.auth().onAuthStateChanged((u) => { off(); resolve(u || null); });
    });
  }

  async function getRole(uid) {
    const snap = await db().ref('users/' + uid).once('value');
    const role = ((snap.val() || {}).role || '').toString().toLowerCase();
    return role;
  }

  function normStatus(s) {
    const v = (s || '').toString().trim().toLowerCase();
    if (v === 'in_progress' || v === 'in progress') return 'in_progress';
    if (v === 'on_hold' || v === 'on hold') return 'on_hold';
    if (v === 'accepted' || v === 'approved') return 'accepted';
    if (v === 'completed' || v === 'resolved' || v === 'closed') return 'completed';
    return v; // fallback
  }

  // 🆕 Load organization's articles
  async function loadArticles(orgUid) {
    const list = document.getElementById('articlesList');
    if (!list) return;

    list.innerHTML = `<p class="loading">Loading your articles...</p>`;

    const snap = await db().ref('articles').orderByChild('orgId').equalTo(orgUid).once('value');

    if (!snap.exists()) {
      list.innerHTML = `<p class="loading">No articles found. <a href="create-article.html">Add one?</a></p>`;
      return;
    }

    const articles = Object.entries(snap.val()).reverse();

    list.innerHTML = articles.map(([id, data]) => `
      <div class="article-card" data-id="${id}">
        <img src="${data.coverUrl || data.orgPhotoUrl || 'https://via.placeholder.com/300x180?text=No+Image'}" alt="cover">
        <div class="article-info">
          <h3>${data.title || 'Untitled'}</h3>
          <p>${data.description || ''}</p>
          <small>${data.category || 'Uncategorized'} • ${new Date(data.publishedAt || Date.now()).toLocaleDateString()}</small>
        </div>
      </div>
    `).join('');
  }

  // ── Main init ──────────────────────────────
  async function init() {
    const me = await waitForUser();
    if (!me) {
      window.location.href = 'index.html';
      return;
    }

    // Ensure this user is an organization
    let role = await getRole(me.uid);
    if (role !== 'organization') {
      window.location.href = 'home.html';
      return;
    }

    const orgUid = me.uid;

    // 🆕 Load Articles
    await loadArticles(orgUid);

    // ── Load only this org's reports ───────────────────────────────────────
    const snap = await db().ref('reports')
      .orderByChild('organizationId').equalTo(orgUid)
      .once('value');

    const reports = snap.val() || {};
    const ids = Object.keys(reports);

    let accepted = 0;
    let inProgress = 0;
    let onHold = 0;
    let completed = 0;

    ids.forEach(id => {
      const st = normStatus(reports[id].status);
      if (st === 'accepted') accepted++;
      else if (st === 'in_progress') inProgress++;
      else if (st === 'on_hold') onHold++;
      else if (st === 'completed') completed++;
    });

    const total = ids.length;

    // Update cards
    animateNumber('totalReports', total);
    animateNumber('acceptedReports', accepted);
    animateNumber('inProgressReports', inProgress);
    animateNumber('onHoldReports', onHold);
    animateNumber('completedReports', completed);

    // Chart
    const chartEl = $('reportChart');
    if (chartEl && window.Chart) {
      const ctx = chartEl.getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Accepted', 'In Progress', 'On Hold', 'Completed'],
          datasets: [{
            label: 'Reports',
            data: [accepted, inProgress, onHold, completed],
            backgroundColor: [
              'rgba(100,149,237,0.7)',   // accepted
              'rgba(255,223,51,0.7)',    // in progress
              'rgba(255,165,0,0.7)',     // on hold
              'rgba(76,175,80,0.7)'      // completed
            ],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { title: { display: true, text: 'Status' } },
            y: { beginAtZero: true, title: { display: true, text: 'Count' }, ticks: { stepSize: 1 } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false }
          }
        }
      });
    }

    if (window.AOS) AOS.init({ duration: 600, once: true });
  }

  init().catch(err => console.error('Org dashboard init failed:', err));
})();
