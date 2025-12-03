// js/dashboard.js
(async function initDashboard() {
  const me = await DB.waitForAuthUser();
  if (!me) return (window.location = "index.html");
  const isAdmin = await DB.isAdmin(me.uid);
  if (!isAdmin) return (window.location = "index.html");

  const db = firebase.database();
  const $ = (id) => document.getElementById(id);

  /* ---------- REFS ---------- */
  const refs = {
    users: db.ref("users"),
    orgSubs: db.ref("orgSubscriptions"),
    adoptions: db.ref("adoptions"),
    reports: db.ref("reports"),
    campaigns: db.ref("donationCampaigns"),
    donations: db.ref("donations"),          // grouped by campaignId
    articles: db.ref("articles")
  };

  /* ---------- SUMMARY STATE ---------- */
  const summary = {
    totalUsers: 0,
    verifiedOrgs: 0,
    petsListed: 0,
    petsAdopted: 0,
    activeCampaigns: 0,
    totalDonations: 0,
    openReports: 0
  };

  // Animated Summary Rendering
  function renderSummary() {
    const section = $("summarySection");
    if (!section) return;

    // Keep previous numbers to animate changes
    const prev = {};
    section.querySelectorAll(".stat-number").forEach((el) => {
      const label = el.getAttribute("data-label") || "";
      prev[label] = parseInt((el.textContent || "0").replace(/[₱,]/g, ""), 10) || 0;
    });

    section.innerHTML = `
      <div class="card summary-card">
        <div class="card-header"><i class="fas fa-users"></i><span>Total Users</span></div>
        <p class="stat-number" data-label="totalUsers">${summary.totalUsers}</p>
      </div>
      <div class="card summary-card">
        <div class="card-header"><i class="fas fa-building"></i><span>Verified Orgs</span></div>
        <p class="stat-number" data-label="verifiedOrgs">${summary.verifiedOrgs}</p>
      </div>
      <div class="card summary-card">
        <div class="card-header"><i class="fas fa-paw"></i><span>Pets Listed</span></div>
        <p class="stat-number" data-label="petsListed">${summary.petsListed}</p>
      </div>
      <div class="card summary-card">
        <div class="card-header"><i class="fas fa-heart"></i><span>Pets Adopted</span></div>
        <p class="stat-number" data-label="petsAdopted">${summary.petsAdopted}</p>
      </div>
      <div class="card summary-card">
        <div class="card-header"><i class="fas fa-hand-holding-heart"></i><span>Active Campaigns</span></div>
        <p class="stat-number" data-label="activeCampaigns">${summary.activeCampaigns}</p>
      </div>
      <div class="card summary-card">
        <div class="card-header"><i class="fas fa-peso-sign"></i><span>Total Donations</span></div>
        <p class="stat-number" data-label="totalDonations">₱${(summary.totalDonations || 0).toLocaleString()}</p>
      </div>
      <div class="card summary-card">
        <div class="card-header"><i class="fas fa-file-alt"></i><span>Open Reports</span></div>
        <p class="stat-number" data-label="openReports">${summary.openReports}</p>
      </div>
    `;

    // Animate changed stats
    section.querySelectorAll(".stat-number").forEach((el) => {
      const label = el.getAttribute("data-label") || "";
      const text = el.textContent || "0";
      const newVal = parseInt(text.replace(/[₱,]/g, ""), 10) || 0;
      if (prev[label] !== undefined && prev[label] !== newVal) {
        el.classList.add("pulse");
        setTimeout(() => el.classList.remove("pulse"), 500);
      }
    });
  }

  /* ---------- SUMMARY LISTENERS ---------- */

  // Users → total users + users-by-role chart
  refs.users.on("value", (snap) => {
    const users = snap.val() || {};
    summary.totalUsers = Object.keys(users).length;

    // Update users by role chart
    let citizens = 0, orgs = 0;
    Object.values(users).forEach((u) => {
      const r = (u.role || "").toLowerCase();
      if (r === "citizen") citizens++;
      else if (r === "organization") orgs++;
    });
    usersRoleChart.data.labels = ["Citizens", "Organizations"];
    usersRoleChart.data.datasets[0].data = [citizens, orgs];
    usersRoleChart.update();

    renderSummary();
  });

  // Org subscriptions → verified orgs
  refs.orgSubs.on("value", (snap) => {
    const orgs = snap.val() || {};
    summary.verifiedOrgs = Object.values(orgs).filter((s) => s && s.verified === true).length;
    renderSummary();
  });

  // Adoptions → pets listed & adopted + species chart
  refs.adoptions.on("value", (snap) => {
    const ads = snap.val() || {};
    let listed = 0;
    let adopted = 0;

    // Count listed/adopted + update species chart (listed only)
    let dogs = 0, cats = 0;
    Object.values(ads).forEach((a) => {
      const status = (a.status || "").toLowerCase();
      const isListed = a.available === true || a.available === undefined || status === "listed";
      if (isListed) {
        listed++;
        const s = (a.species || "").toLowerCase();
        if (s === "dog") dogs++;
        else if (s === "cat") cats++;
      }
      if (status === "adopted" || a.available === false || a.adoptedAt) adopted++;
    });

    summary.petsListed = listed;
    summary.petsAdopted = adopted;
    renderSummary();

    // Update species chart
    speciesChart.data.datasets[0].data = [dogs, cats];
    speciesChart.update();
  });

  // Reports → open reports + status chart
  refs.reports.on("value", (snap) => {
    const obj = snap.val() || {};
    const arr = Object.values(obj);

    summary.openReports = arr.filter(
      (r) => (r.status || "").toUpperCase() !== "COMPLETED"
    ).length;
    renderSummary();

    const counts = { submitted: 0, accepted: 0, "in progress": 0, "on hold": 0, completed: 0 };
    arr.forEach((r) => {
      const s = (r.status || "").toLowerCase();
      if (s === "submitted") counts.submitted++;
      else if (s === "accepted") counts.accepted++;
      else if (s === "in progress") counts["in progress"]++;
      else if (s === "on hold") counts["on hold"]++;
      else if (s === "completed") counts.completed++;
    });
    updateReportsStatusChart(counts);
  });

  // Articles → category chart (sorted desc, "Uncategorized" for missing)
  refs.articles.on("value", (snap) => {
    const obj = snap.val() || {};
    const counts = {};
    Object.values(obj).forEach((a) => {
      const cat = (a.category || "Uncategorized").trim();
      counts[cat] = (counts[cat] || 0) + 1;
    });

    // Sort by count desc
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = entries.map((e) => e[0]);
    const data = entries.map((e) => e[1]);

    updateArticlesCategoryChart(labels, data);
  });

  // Campaigns → active campaigns (status === Active)
  refs.campaigns.on("value", (snap) => {
    const c = snap.val() || {};
    summary.activeCampaigns = Object.values(c).filter(
      (ca) => (ca.status || "").toLowerCase() === "active"
    ).length;
    renderSummary();
  });

  // Donations → total donations (sum all-time, non-negative) + 30-day time series
  refs.donations.on("value", (snap) => {
    let total = 0;
    const byDay = {};
    const now = Date.now();
    const dayMs = 86400000;
    const start = now - 29 * dayMs;

    snap.forEach((campSnap) => {
      campSnap.forEach((donSnap) => {
        const d = donSnap.val() || {};
        const rawAmt = Number(d.amount);
        const amt = Number.isFinite(rawAmt) ? Math.max(0, rawAmt) : 0;
        const ts = Number(d.createdAt || d.timestamp || 0);
        total += amt;
        if (ts && ts >= start) {
          const dayKey = new Date(ts).toISOString().slice(0, 10);
          byDay[dayKey] = (byDay[dayKey] || 0) + amt;
        }
      });
    });

    summary.totalDonations = total;
    renderSummary();
    updateDonations30Chart(byDay, start, now);
  });

  /* ---------- CHARTS ---------- */
  const palette = ["#4C78A8", "#F58518", "#54A24B", "#E45756", "#72B7B2", "#B279A2"];

  // Users by Role
  const usersRoleChart = new Chart($("usersRoleChart"), {
    type: "bar",
    data: {
      labels: ["Citizens", "Organizations"],
      datasets: [{ label: "Users", backgroundColor: [palette[0], palette[2]], data: [0, 0] }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  // Pets Listed by Species (dogs & cats only, listed only)
  const speciesChart = new Chart($("adoptionsSpeciesChart"), {
    type: "pie",
    data: {
      labels: ["Dogs", "Cats"],
      datasets: [{ data: [0, 0], backgroundColor: [palette[0], palette[3]] }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });

  // Donations over last 30 days (line)
  const donations30Chart = new Chart($("donations30Chart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "₱ per day",
        borderColor: palette[1],
        data: [],
        fill: false,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, ticks: { callback: (v) => "₱" + Number(v).toLocaleString() } }
      },
      plugins: { legend: { display: false } }
    }
  });

  function updateDonations30Chart(byDayMap, startMs, nowMs) {
    const labels = [];
    const data = [];
    const dayMs = 86400000;
    for (let t = startMs; t <= nowMs; t += dayMs) {
      const d = new Date(t);
      const key = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
      data.push(byDayMap[key] || 0);
    }
    donations30Chart.data.labels = labels;
    donations30Chart.data.datasets[0].data = data;
    donations30Chart.update();
  }

  // Reports by Status (doughnut)
  const reportsStatusChart = new Chart($("reportsStatusChart"), {
    type: "doughnut",
    data: {
      labels: ["Submitted", "Accepted", "In Progress", "On Hold", "Completed"],
      datasets: [{
        data: [0, 0, 0, 0, 0],
        backgroundColor: [palette[0], palette[2], palette[1], palette[3], palette[5]]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, cutout: "55%" }
  });

  function updateReportsStatusChart(counts) {
    reportsStatusChart.data.datasets[0].data = [
      counts.submitted || 0,
      counts.accepted || 0,
      counts["in progress"] || 0,
      counts["on hold"] || 0,
      counts.completed || 0
    ];
    reportsStatusChart.update();
  }

  // Articles by Category (bar, dynamic labels)
  const articlesCategoryChart = new Chart($("articlesCategoryChart"), {
    type: "bar",
    data: { labels: [], datasets: [{ label: "Articles", backgroundColor: palette[4], data: [] }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  function updateArticlesCategoryChart(labels, data) {
    articlesCategoryChart.data.labels = labels;
    articlesCategoryChart.data.datasets[0].data = data;
    articlesCategoryChart.update();
  }

  /* ---------- RECENT ACTIVITY (sorted, de-duped) ---------- */
  const feed = $("activityFeed");
  const activityMap = new Map(); // key -> {ts, html}
  const MAX_ITEMS = 20;

  function safeTs(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : Date.now();
  }

  function upsertActivity(key, ts, html) {
    activityMap.set(key, { ts: safeTs(ts), html });
    renderActivity();
  }

  function renderActivity() {
    if (!feed) return;
    // sort by ts desc
    const items = Array.from(activityMap.values())
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_ITEMS);

    feed.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.innerHTML = `${it.html}<time>${new Date(it.ts).toLocaleString()}</time>`;
      feed.appendChild(li);
    }
  }

  // Listeners (compose stable keys to de-dupe)
  refs.reports.on("child_added", (snap) => {
    const r = snap.val() || {};
    const ts = r.lastActivityAt || r.createdAt || r.updatedAt || Date.now();
    upsertActivity(`report:${snap.key}`, ts, `📝 New report: <b>${(r.reportType || r.type || "Report")}</b>`);
  });

  refs.adoptions.on("child_added", (snap) => {
    const a = snap.val() || {};
    const ts = a.createdAt || a.updatedAt || Date.now();
    upsertActivity(`adopt:${snap.key}`, ts, `🐾 Adoption listed: <b>${a.name || "Pet"}</b> (${a.species || "N/A"})`);
  });

  refs.campaigns.on("child_added", (snap) => {
    const c = snap.val() || {};
    const ts = c.createdAt || c.updatedAt || Date.now();
    upsertActivity(`camp:${snap.key}`, ts, `💰 Campaign created: <b>${c.title || "Campaign"}</b>`);
  });

  refs.articles.on("child_added", (snap) => {
    const art = snap.val() || {};
    const ts = art.publishedAt || art.createdAt || art.updatedAt || Date.now();
    upsertActivity(`article:${snap.key}`, ts, `📰 Article: <b>${art.title || "Article"}</b>`);
  });

  // Live indicator
  firebase.database().ref(".info/connected").on("value", (snap) => {
    const dot = document.getElementById("liveIndicator");
    if (!dot) return;
    const on = !!snap.val();
    dot.style.background = on ? "#0f0" : "#f00";
    dot.style.boxShadow = on ? "0 0 8px #0f0" : "0 0 8px #f00";
  });
})();
