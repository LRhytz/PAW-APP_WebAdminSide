// ===================
// /js/dashboardOrg.js
// ===================
(function () {
  const db = () => firebase.database();

  // Utility functions
  const $ = (id) => document.getElementById(id);
  const toInt = (n) => Number(n || 0);
  const peso = (n) => (toInt(n)).toLocaleString('en-PH', { maximumFractionDigits: 0 });

  function setText(id, val) {
    const el = $(id);
    if (el) el.textContent = String(val ?? '0');
  }

  function animateNumber(id, end, duration = 900) {
    const el = $(id); if (!el) return;
    const target = Math.max(0, Math.floor(Number(end) || 0));
    if (target <= 0) { el.textContent = '0'; return; }
    let curr = 0;
    const step = Math.max(Math.floor(duration / Math.max(target, 1)), 18);
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
    return (((snap.val() || {}).role) || '').toString().toLowerCase();
  }

  // Chart helper
  function makeBar(ctx, labels, data, colors) {
    return new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 8 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'Category' } },
          y: { beginAtZero: true, title: { display: true, text: 'Count' }, ticks: { stepSize: 1 } }
        },
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }
      }
    });
  }

  // ==========================
  // 🧾 Reports (organizationId)
  // ==========================
  async function loadReports(orgUid) {
    const snap = await db().ref('reports')
      .orderByChild('organizationId')
      .equalTo(orgUid)
      .once('value');

    const reports = snap.val() || {};
    console.log('📋 Reports raw:', reports);

    let accepted = 0, inProgress = 0, onHold = 0, completed = 0;
    Object.values(reports).forEach(r => {
      const s = String(r.status || '').toUpperCase();
      if (s === 'ACCEPTED') accepted++;
      else if (s === 'IN PROGRESS') inProgress++;
      else if (s === 'ON HOLD') onHold++;
      else if (s === 'COMPLETED') completed++;
    });

    const total = Object.keys(reports).length;
    animateNumber('rep_total', total);
    animateNumber('rep_accepted', accepted);
    animateNumber('rep_inprog', inProgress);
    animateNumber('rep_onhold', onHold);
    animateNumber('rep_completed', completed);

    const ctx = $('reportChart')?.getContext('2d');
    if (ctx) {
      makeBar(ctx,
        ['Accepted', 'In Progress', 'On Hold', 'Completed'],
        [accepted, inProgress, onHold, completed],
        ['#4C78A8', '#F58518', '#B279A2', '#54A24B']
      );
    }
  }

  // ==========================
  // 🐾 Adoptions (works correctly)
  // ==========================
  async function loadAdoptions(orgUid) {
    try {
      const adoptionsSnap = await db().ref('adoptions')
        .orderByChild('orgId')
        .equalTo(orgUid)
        .once('value');
      const adoptions = adoptionsSnap.val() || {};

      const orgPets = Object.entries(adoptions).map(([id, p]) => ({ id, ...p }));
      const totalPets = orgPets.length;
      const adopted = orgPets.filter(
        p => String(p.status || p.adoptionStatus || '').toLowerCase() === 'adopted'
      ).length;

      const reqSnap = await db().ref(`adoptionRequestsByOrg/${orgUid}`).once('value');
      const orgRequests = reqSnap.val() || {};

      let totalRequests = 0;
      Object.values(orgRequests).forEach(petRequests => {
        totalRequests += Object.keys(petRequests || {}).length;
      });

      console.log(`🐾 Dashboard Adoption: totalPets=${totalPets}, requests=${totalRequests}, adopted=${adopted}`);

      animateNumber('adp_listed', totalPets);
      animateNumber('adp_available', totalRequests);
      animateNumber('adp_adopted', adopted);

      const ctx = $('adoptionChart')?.getContext('2d');
      if (ctx) {
        makeBar(
          ctx,
          ['Total Pets Listed', 'Requests Received', 'Adopted'],
          [totalPets, totalRequests, adopted],
          ['#8EC5FC', '#A7E9AF', '#FFD966']
        );
      }
    } catch (error) {
      console.error('Adoptions load failed:', error);
    }
  }

  // ==========================
  // 💰 Donations (orgId)
  // ==========================
  async function loadDonations(orgUid) {
    const snap = await db().ref('donationCampaigns')
      .orderByChild('orgId')
      .equalTo(orgUid)
      .once('value');
    const camps = snap.val() || {};

    console.log('💰 Donations raw:', camps);
    let active = 0, raised = 0, supporters = 0;

    await Promise.all(Object.values(camps).map(async c => {
      const status = String(c.status || '').toLowerCase();
      if (status === 'active') active++;
      if (c.stats) {
        raised += toInt(c.stats.amountRaised);
        supporters += toInt(c.stats.supporters);
      } else if (c.id) {
        const s = (await db().ref('donationCampaigns').child(c.id).child('stats').once('value')).val() || {};
        raised += toInt(s.amountRaised);
        supporters += toInt(s.supporters);
      }
    }));

    animateNumber('don_active', active);
    setText('don_raised', (toInt(raised)).toLocaleString('en-PH', { maximumFractionDigits: 0 }));
    animateNumber('don_supporters', supporters);

    const ctx = $('donationChart')?.getContext('2d');
    if (ctx) {
      makeBar(ctx, ['Active'], [active], ['#A8E6CF']);
    }
  }

  // ==========================
  // 📰 Articles (orgId)
  // ==========================
  async function loadArticles(orgUid) {
    const snap = await db().ref('articles')
      .orderByChild('orgId')
      .equalTo(orgUid)
      .once('value');
    const articlesData = snap.val() || {};

    console.log('📰 Articles raw:', articlesData);
    const articles = Object.values(articlesData);
    let published = 0;

    articles.forEach(a => {
      const s = String(a.status || '').toLowerCase();
      if (s === 'published') published++;
    });

    const total = articles.length;
    animateNumber('art_total', total);
    animateNumber('art_published', published);

    const ctx = $('articlesChart')?.getContext('2d');
    if (ctx) {
      makeBar(ctx, ['Published'], [published], ['#FDCB82']);
    }
  }

  // ==========================
  // 🚀 Initialize dashboard
  // ==========================
  async function init() {
    const me = await waitForUser();
    if (!me) { window.location.href = 'index.html'; return; }
    const role = await getRole(me.uid);
    if (role !== 'organization') { window.location.href = 'home.html'; return; }
    const uid = me.uid;

    await Promise.all([
      loadReports(uid).catch(e => console.error('Reports load failed:', e)),
      loadAdoptions(uid).catch(e => console.error('Adoptions load failed:', e)),
      loadDonations(uid).catch(e => console.error('Donations load failed:', e)),
      loadArticles(uid).catch(e => console.error('Articles load failed:', e)),
    ]);

    if (window.AOS) AOS.init({ duration: 600, once: true });
  }

  init().catch(err => console.error('Org dashboard init failed:', err));
})();
