(async function initDashboard() {
  const me = await DB.waitForAuthUser();
  if (!me) return (window.location = "index.html");
  const isAdmin = await DB.isAdmin(me.uid);
  if (!isAdmin) return (window.location = "index.html");

  const db = firebase.database();
  const $ = (id) => document.getElementById(id);

  /* ---------- SUMMARY SECTION ---------- */
  const refs = {
    users: db.ref("users"),
    subs: db.ref("subscriptions"),
    adoptions: db.ref("adoptions"),
    reports: db.ref("reports"),
    campaigns: db.ref("donationCampaigns"),
  };

  const summary = {
    citizens: 0,
    orgs: 0,
    activeSubs: 0,
    adoptions: 0,
    reportsPending: 0,
    campaigns: 0,
  };

  // 🔄 Animated Summary Rendering
  function renderSummary() {
    const section = $("summarySection");
    if (!section) return;

    // Capture old values to detect change
    const prev = {};
    section.querySelectorAll(".stat-number").forEach(el => {
      const label = el.parentElement.querySelector("span")?.textContent.trim() || "";
      prev[label] = parseInt(el.textContent) || 0;
    });

    // Re-render summary
    section.innerHTML = `
      <div class="card summary-card"><div class="card-header"><i class="fas fa-user"></i><span>Citizens</span></div><p class="stat-number">${summary.citizens}</p></div>
      <div class="card summary-card"><div class="card-header"><i class="fas fa-users"></i><span>Organizations</span></div><p class="stat-number">${summary.orgs}</p></div>
      <div class="card summary-card"><div class="card-header"><i class="fas fa-check-circle"></i><span>Active Subs</span></div><p class="stat-number">${summary.activeSubs}</p></div>
      <div class="card summary-card"><div class="card-header"><i class="fas fa-paw"></i><span>Adoptions Listed</span></div><p class="stat-number">${summary.adoptions}</p></div>
      <div class="card summary-card"><div class="card-header"><i class="fas fa-file-alt"></i><span>Pending Reports</span></div><p class="stat-number">${summary.reportsPending}</p></div>
      <div class="card summary-card"><div class="card-header"><i class="fas fa-hand-holding-heart"></i><span>Active Campaigns</span></div><p class="stat-number">${summary.campaigns}</p></div>
    `;

    // Animate numbers that changed
    section.querySelectorAll(".stat-number").forEach(el => {
      const label = el.parentElement.querySelector("span")?.textContent.trim() || "";
      const newVal = parseInt(el.textContent) || 0;
      if (prev[label] !== undefined && prev[label] !== newVal) {
        el.classList.add("pulse");
        setTimeout(() => el.classList.remove("pulse"), 500);
      }
    });
  }

  refs.users.on("value", (snap) => {
    const users = snap.val() || {};
    summary.citizens = Object.values(users).filter(u => (u.role || "").toLowerCase() === "citizen").length;
    summary.orgs = Object.values(users).filter(u => (u.role || "").toLowerCase() === "organization").length;
    renderSummary();
  });

// Count active subscriptions from both users and organizations
async function updateActiveSubs() {
  const [subsSnap, orgSubsSnap] = await Promise.all([
    db.ref("subscriptions").once("value"),
    db.ref("orgSubscriptions").once("value"),
  ]);
  const subs = subsSnap.val() || {};
  const orgSubs = orgSubsSnap.val() || {};

  const activeUserSubs = Object.values(subs).filter(
    (s) => (s.status || "").toLowerCase() === "active"
  ).length;
  const activeOrgSubs = Object.values(orgSubs).filter(
    (s) => (s.status || "").toLowerCase() === "active"
  ).length;

  summary.activeSubs = activeUserSubs + activeOrgSubs;
  renderSummary();
}

// initial call + live updates
updateActiveSubs();
db.ref("subscriptions").on("value", updateActiveSubs);
db.ref("orgSubscriptions").on("value", updateActiveSubs);

  // ✅ FIXED: Count all available or listed adoptions
  refs.adoptions.on("value", (snap) => {
    const ads = snap.val() || {};
    summary.adoptions = Object.values(ads).filter(a => {
      const status = (a.status || "").toLowerCase();
      return a.available === true || a.available === undefined || status === "listed";
    }).length;
    renderSummary();
  });

  refs.reports.on("value", (snap) => {
    const reports = snap.val() || {};
    summary.reportsPending = Object.values(reports).filter(r => (r.status || "").toLowerCase() !== "completed").length;
    renderSummary();
  });

  refs.campaigns.on("value", (snap) => {
    const c = snap.val() || {};
    summary.campaigns = Object.values(c).filter(ca => (ca.status || "").toLowerCase() === "active").length;
    renderSummary();
  });

  /* ---------- CHARTS ---------- */
  const palette = ["#4C78A8","#F58518","#54A24B","#E45756","#72B7B2","#B279A2"];

  const regChart = new Chart($("registrationChart"), {
    type:"bar",
    data:{labels:["Citizens","Organizations"],
      datasets:[{label:"Registrations",backgroundColor:[palette[2],palette[0]],data:[0,0]}]},
    options:{responsive:true,maintainAspectRatio:false}
  });
  refs.users.on("value", snap=>{
    const users=snap.val()||{};
    const c=Object.values(users).filter(u=>u.role==="citizen").length;
    const o=Object.values(users).filter(u=>u.role==="organization").length;
    regChart.data.datasets[0].data=[c,o]; regChart.update();
  });

  const perfChart = new Chart($("performanceChart"), {
    type:"line",
    data:{labels:[],datasets:[
      {label:"Adoptions",borderColor:palette[2],data:[],fill:false,tension:.3},
      {label:"Donations (₱)",borderColor:palette[0],data:[],fill:false,tension:.3}
    ]},
    options:{responsive:true,maintainAspectRatio:false}
  });
  const adoptionMonthly={}, donationMonthly={};
  function formatMonth(ts){return new Date(ts).toLocaleString("default",{month:"short"});}
  function updatePerformance(){
    const months=[...new Set([...Object.keys(adoptionMonthly),...Object.keys(donationMonthly)])];
    perfChart.data.labels=months;
    perfChart.data.datasets[0].data=months.map(m=>adoptionMonthly[m]||0);
    perfChart.data.datasets[1].data=months.map(m=>donationMonthly[m]||0);
    perfChart.update();
  }
  refs.adoptions.on("value",snap=>{
    Object.keys(adoptionMonthly).forEach(k=>delete adoptionMonthly[k]);
    Object.values(snap.val()||{}).forEach(a=>{
      if(a.createdAt){
        const m=formatMonth(a.createdAt);
        adoptionMonthly[m]=(adoptionMonthly[m]||0)+1;
      }
    });
    updatePerformance();
  });
  refs.campaigns.on("value",snap=>{
    Object.keys(donationMonthly).forEach(k=>delete donationMonthly[k]);
    Object.values(snap.val()||{}).forEach(c=>{
      if(c.stats?.amountRaised){
        const m=formatMonth(c.updatedAt||c.createdAt||Date.now());
        donationMonthly[m]=(donationMonthly[m]||0)+c.stats.amountRaised;
      }
    });
    updatePerformance();
  });

  const repChart = new Chart($("reportsChart"),{
    type:"doughnut",
    data:{labels:["Pending","In Progress","Completed"],
      datasets:[{backgroundColor:[palette[3],palette[1],palette[2]],data:[0,0,0]}]},
    options:{responsive:true,maintainAspectRatio:false}
  });
  refs.reports.on("value",snap=>{
    const reports=Object.values(snap.val()||{});
    const counts={pending:0,progress:0,completed:0};
    reports.forEach(r=>{
      const s=(r.status||"").toLowerCase();
      if(s==="completed")counts.completed++;
      else if(s==="in progress")counts.progress++;
      else counts.pending++;
    });
    repChart.data.datasets[0].data=[counts.pending,counts.progress,counts.completed];
    repChart.update();
  });

  const catChart=new Chart($("donationCategoryChart"),{
    type:"bar",
    data:{labels:[],datasets:[{label:"Campaigns",backgroundColor:palette[5],data:[]}]},
    options:{responsive:true,maintainAspectRatio:false}
  });
  refs.campaigns.on("value",snap=>{
    const campaigns=Object.values(snap.val()||{});
    const catCount={};
    campaigns.forEach(c=>{
      const cat=(c.category||"Uncategorized").trim();
      catCount[cat]=(catCount[cat]||0)+1;
    });
    const labels=Object.keys(catCount);
    catChart.data.labels=labels;
    catChart.data.datasets[0].data=labels.map(l=>catCount[l]);
    catChart.update();
  });

  /* ---------- ACTIVITY FEED ---------- */
  const feed=$("activityFeed");
  function addActivity(msg,ts){
    const li=document.createElement("li");
    li.innerHTML=`${msg}<time>${new Date(ts).toLocaleString()}</time>`;
    feed.prepend(li); if(feed.children.length>10)feed.removeChild(feed.lastChild);
  }
  refs.reports.on("child_added",snap=>{
    const r=snap.val(); addActivity(`📝 New report: <b>${r.category||"Report"}</b>`,r.createdAt||Date.now());
  });
  refs.adoptions.on("child_added",snap=>{
    const a=snap.val(); addActivity(`🐾 Adoption listed: <b>${a.name||"Pet"}</b>`,a.createdAt||Date.now());
  });
  refs.campaigns.on("child_added",snap=>{
    const c=snap.val(); addActivity(`💰 Campaign: <b>${c.title||"Campaign"}</b>`,c.createdAt||Date.now());
  });

  // Live indicator
  firebase.database().ref(".info/connected").on("value", snap => {
    const dot = document.getElementById("liveIndicator");
    if (!dot) return;
    dot.style.background = snap.val() ? "#0f0" : "#f00";
    dot.style.boxShadow = snap.val() ? "0 0 8px #0f0" : "0 0 8px #f00";
  });

  /* ---------- QUICK INSIGHTS ---------- */
  const insightsData = {
    citizens: 0,
    orgs: 0,
    adoptions: { thisWeek: 0, lastWeek: 0 },
    donations: { thisWeek: 0, lastWeek: 0 }
  };

  function getWeekNumber(d) {
    const date = new Date(d);
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDays = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
  }

  function updateQuickInsights() {
    const list = document.getElementById("insightList");
    if (!list) return;

    const {
      citizens,
      orgs,
      adoptions: { thisWeek: adThis, lastWeek: adLast },
      donations: { thisWeek: dnThis, lastWeek: dnLast }
    } = insightsData;

    const adDiff = adThis - adLast;
    const dnDiff = dnThis - dnLast;

    const adTrend =
      adDiff > 0
        ? `<span class="trend-up pulse-trend">📈 +${adDiff}</span>`
        : adDiff < 0
        ? `<span class="trend-down pulse-trend">📉 ${adDiff}</span>`
        : `<span>⚖️ No change</span>`;

    const dnTrend =
      dnDiff > 0
        ? `<span class="trend-up pulse-trend">📈 +₱${dnDiff.toLocaleString()}</span>`
        : dnDiff < 0
        ? `<span class="trend-down pulse-trend">📉 ₱${dnDiff.toLocaleString()}</span>`
        : `<span>⚖️ No change</span>`;

    list.innerHTML = `
      <li>🐾 <strong>${adThis}</strong> adoptions this week ${adTrend}</li>
      <li>💰 <strong>₱${dnThis.toLocaleString()}</strong> raised this week ${dnTrend}</li>
      <li>👥 <strong>${citizens}</strong> citizens registered</li>
      <li>🏢 <strong>${orgs}</strong> organizations onboarded</li>
    `;

    // Add highlight flicker when trends change
    list.querySelectorAll(".pulse-trend").forEach(el => {
      el.style.animation = "flickerTrend 0.7s ease";
      setTimeout(() => el.style.animation = "", 700);
    });
  }

  db.ref("users").on("value", snap => {
    const users = snap.val() || {};
    insightsData.citizens = Object.values(users).filter(u => u.role === "citizen").length;
    insightsData.orgs = Object.values(users).filter(u => u.role === "organization").length;
    updateQuickInsights();
  });

  db.ref("adoptions").on("value", snap => {
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const lastWeek = currentWeek - 1;
    insightsData.adoptions = { thisWeek: 0, lastWeek: 0 };
    snap.forEach(ch => {
      const val = ch.val();
      if (val.createdAt) {
        const wk = getWeekNumber(val.createdAt);
        if (wk === currentWeek) insightsData.adoptions.thisWeek++;
        else if (wk === lastWeek) insightsData.adoptions.lastWeek++;
      }
    });
    updateQuickInsights();
  });

  db.ref("donationCampaigns").on("value", snap => {
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const lastWeek = currentWeek - 1;
    insightsData.donations = { thisWeek: 0, lastWeek: 0 };
    snap.forEach(ch => {
      const val = ch.val();
      const ts = val.updatedAt || val.createdAt || Date.now();
      const wk = getWeekNumber(ts);
      const amt = val.stats?.amountRaised || 0;
      if (wk === currentWeek) insightsData.donations.thisWeek += amt;
      else if (wk === lastWeek) insightsData.donations.lastWeek += amt;
    });
    updateQuickInsights();
  });
})();
