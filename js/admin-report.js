// js/admin-report.js
(function () {
  // -------- Utilities --------
  function $(id) { return document.getElementById(id); }
  function fmtDate(ms) {
    if (!ms) return "-";
    try { return new Date(ms).toLocaleString(); } catch (_) { return "-"; }
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function shortId(id) { return (id || "").slice(0, 6) + "…"; }

  let me = null;
  let isAdmin = false;

  const db = firebase.database();
  const refs = {
    reports: db.ref("reports"), // indexed by: reportUserId, organizationId, status, lastMessageAt, lastActivityAt
    users: db.ref("users"),
    orgs: db.ref("organizations")
  };

  // -------- State --------
  let allReports = [];     // full list from RTDB
  let filtered = [];       // after filters
  let page = 1;
  let pageSize = 10;

  // -------- Elements --------
  const tbody = $("reportsTbody");
  const resultsCount = $("resultsCount");
  const pageInfo = $("pageInfo");
  const prevBtn = $("prevPage");
  const nextBtn = $("nextPage");

  // Filters
  const statusFilter = $("statusFilter");
  const typeSearch = $("typeSearch");
  const orgFilter = $("orgFilter");
  const dateFrom = $("dateFrom");
  const dateTo = $("dateTo");
  const clearFiltersBtn = $("clearFiltersBtn");
  const exportCsvBtn = $("exportCsvBtn");
  const pageSizeSel = $("pageSize");

  // Drawer
  const drawer = $("reportDrawer");
  const drawerClose = $("drawerClose");
  const drawerTitle = $("drawerTitle");
  const drawerBody = $("drawerBody");

  // -------- Auth gate --------
  DB.waitForAuthUser().then(async (user) => {
    me = user;
    if (!me) return (window.location = "index.html");
    isAdmin = await DB.isAdmin(me.uid);
    if (!isAdmin) return (window.location = "index.html");

    attachListeners();
  });

  // -------- Realtime + UI listeners --------
  function attachListeners() {
    refs.reports.orderByChild("lastActivityAt").limitToLast(400).on("value", (snap) => {
      const data = snap.val() || {};
      allReports = Object.values(data).map(r => r).sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));

      // Build org list from visible reports
      const orgSet = new Set();
      allReports.forEach(r => { if (r.organizationId) orgSet.add(r.organizationId); });
      rebuildOrgFilter([...orgSet]);

      applyFilters();
    });

    [statusFilter, typeSearch, orgFilter, dateFrom, dateTo].forEach(el => {
      el.addEventListener("input", () => { page = 1; applyFilters(); });
      el.addEventListener("change", () => { page = 1; applyFilters(); });
    });

    clearFiltersBtn.addEventListener("click", () => {
      statusFilter.value = "";
      typeSearch.value = "";
      orgFilter.value = "";
      dateFrom.value = "";
      dateTo.value = "";
      page = 1;
      applyFilters();
    });

    pageSizeSel.addEventListener("change", () => {
      pageSize = parseInt(pageSizeSel.value, 10) || 10;
      page = 1;
      renderTable();
    });

    prevBtn.addEventListener("click", () => { if (page > 1) { page--; renderTable(); }});
    nextBtn.addEventListener("click", () => {
      const max = Math.ceil(filtered.length / pageSize) || 1;
      if (page < max) { page++; renderTable(); }
    });

    exportCsvBtn.addEventListener("click", exportCsv);

    drawerClose.addEventListener("click", closeDrawer);
    drawer.addEventListener("click", (e) => { if (e.target === drawer) closeDrawer(); });
  }

  function rebuildOrgFilter(ids) {
    const current = new Set();
    [...orgFilter.options].forEach(o => current.add(o.value));
    ids.forEach(id => {
      if (!current.has(id)) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id; // optional: map to human name if desired
        orgFilter.appendChild(opt);
      }
    });
  }

  // -------- Filtering --------
  function applyFilters() {
    const qStatus = (statusFilter.value || "").trim();
    const qType = (typeSearch.value || "").toLowerCase().trim();
    const qOrg = (orgFilter.value || "").trim();

    const fromMs = dateFrom.value ? new Date(dateFrom.value + "T00:00:00").getTime() : null;
    const toMs = dateTo.value ? new Date(dateTo.value + "T23:59:59").getTime() : null;

    filtered = allReports.filter(r => {
      if (qStatus && (String(r.status || "").toUpperCase() !== qStatus)) return false;
      if (qType) {
        const hay = `${r.reportType || ""} ${r.reportDescription || ""}`.toLowerCase();
        if (!hay.includes(qType)) return false;
      }
      if (qOrg && String(r.organizationId || "") !== qOrg) return false;

      const created = r.createdAt || 0;
      if (fromMs && created < fromMs) return false;
      if (toMs && created > toMs) return false;

      return true;
    });

    page = 1;
    renderTable();
  }

  // -------- Table render --------
  function renderTable() {
    const total = filtered.length;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(page, maxPage);
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    resultsCount.textContent = total ? `${total} result${total === 1 ? "" : "s"}` : "No results";

    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="muted">No reports match the current filters.</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(r => {
        const sev = escapeHtml(r.severity || "-");
        const status = escapeHtml(r.status || "-");
        const type = escapeHtml(r.reportType || "-");
        const reporter = escapeHtml(r.reporterDisplayName || r.reportUserEmail || r.reportUserId || "-");
        const org = escapeHtml(r.organizationName || r.organizationId || "-");
        const rid = escapeHtml(r.reportId || "");
        return `
          <tr class="row-click" data-report-id="${rid}">
            <td title="${rid}">${shortId(rid)}</td>
            <td>${type}</td>
            <td><span class="badge status-${status.replace(/\s+/g,'-').toLowerCase()}">${status}</span></td>
            <td>${sev}</td>
            <td>${org}</td>
            <td>${reporter}</td>
            <td>${fmtDate(r.createdAt)}</td>
            <td>${fmtDate(r.lastActivityAt || r.lastMessageAt)}</td>
          </tr>
        `;
      }).join("");
    }

    pageInfo.textContent = `Page ${page} / ${maxPage}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= maxPage;

    tbody.querySelectorAll("tr.row-click").forEach(tr => {
      tr.addEventListener("click", () => openDrawer(tr.getAttribute("data-report-id")));
    });
  }

  // -------- Drawer --------
  function openDrawer(reportId) {
    const r = allReports.find(x => x.reportId === reportId);
    if (!r) return;

    drawerTitle.textContent = `${r.reportType || "Report"} • ${shortId(reportId)}`;

    // Writes allowed per rules only to reporter or the assigned org
    const canWrite = !!(r.reportUserId === me.uid || r.organizationId === me.uid);

    const imgs = (r.imageUrls && typeof r.imageUrls === "object")
      ? Object.values(r.imageUrls).filter(Boolean)
      : [];

    drawerBody.innerHTML = `
      <div class="drawer-section">
        <div class="kv"><span class="k">Status</span><span class="v"><span class="badge status-${String(r.status||"").replace(/\s+/g,'-').toLowerCase()}">${escapeHtml(r.status || "-")}</span></span></div>
        <div class="kv"><span class="k">Severity</span><span class="v">${escapeHtml(r.severity || "-")}</span></div>
        <div class="kv"><span class="k">Reporter</span><span class="v">${escapeHtml(r.reporterDisplayName || r.reportUserEmail || r.reportUserId || "-")}</span></div>
        <div class="kv"><span class="k">Organization</span><span class="v">${escapeHtml(r.organizationName || r.organizationId || "-")}</span></div>
        <div class="kv"><span class="k">Created</span><span class="v">${fmtDate(r.createdAt)}</span></div>
        <div class="kv"><span class="k">Last Activity</span><span class="v">${fmtDate(r.lastActivityAt || r.lastMessageAt)}</span></div>
      </div>

      <div class="drawer-section">
        <h4>Description</h4>
        <p class="desc">${escapeHtml(r.reportDescription || "-")}</p>
        ${imgs.length ? `<div class="media-grid">${imgs.map(u=>`<img src="${escapeHtml(u)}" alt="image" />`).join("")}</div>` : ""}
        ${r.videoUrl ? `<video src="${escapeHtml(r.videoUrl)}" controls class="media-video"></video>` : ""}
      </div>

      <div class="drawer-section">
        <h4>Actions</h4>
        <div class="actions-row">
          ${renderStatusBtn("ACCEPTED", canWrite)}
          ${renderStatusBtn("IN PROGRESS", canWrite)}
          ${renderStatusBtn("ON HOLD", canWrite)}
          ${renderStatusBtn("COMPLETED", canWrite)}
        </div>
        ${!canWrite ? `<p class="muted small">You can view this report, but only the reporter or the assigned organization may change its status per data rules.</p>` : ""}
      </div>

      <div class="drawer-section">
        <h4>Recent History</h4>
        <div id="historyList" class="history-list"><div class="muted small">Loading…</div></div>
      </div>

      <div class="drawer-section">
        <h4>Recent Messages</h4>
        <div id="messageList" class="message-list"><div class="muted small">Loading…</div></div>
      </div>
    `;

    drawerBody.querySelectorAll("button[data-status]").forEach(btn => {
      btn.addEventListener("click", () => updateStatus(reportId, btn.getAttribute("data-status")));
    });

    loadHistory(reportId);
    loadMessages(reportId);

    drawer.classList.add("open");
  }

  function renderStatusBtn(label, enabled) {
    const cls = enabled ? "btn btn-primary" : "btn btn-disabled";
    const title = enabled ? "" : ' title="You don\'t have permission to update this report"';
    return `<button class="${cls}" data-status="${label}" ${enabled ? "" : "disabled"}${title}>${label}</button>`;
  }

  function closeDrawer() { drawer.classList.remove("open"); }

  // -------- Writes (respecting rules) --------
  function updateStatus(reportId, newStatus) {
    if (!reportId || !newStatus) return;
    const ref = refs.reports.child(reportId);
    ref.update({
      status: newStatus,
      updatedAt: Date.now(),
      updatedBy: me.uid,
      lastActivityAt: Date.now()
    }).catch(err => {
      alert("Update failed: " + (err && err.message ? err.message : err));
    });
  }

  // -------- History/messages --------
  function loadHistory(reportId) {
    const container = $("historyList");
    if (!container) return;
    db.ref(`reports/${reportId}/history`).limitToLast(20).on("value", (snap) => {
      const data = snap.val() || {};
      const rows = Object.values(data).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
      if (!rows.length) {
        container.innerHTML = `<div class="muted small">No history yet.</div>`;
      } else {
        container.innerHTML = rows.map(h => `
          <div class="history-row">
            <span class="badge status-${String(h.status||"").replace(/\s+/g,'-').toLowerCase()}">${escapeHtml(h.status || "")}</span>
            <span class="muted">${fmtDate(h.timestamp)}</span>
            <span class="muted">by ${escapeHtml(h.changedBy || "-")}</span>
          </div>
        `).join("");
      }
    });
  }

  function loadMessages(reportId) {
    const container = $("messageList");
    if (!container) return;
    db.ref(`reports/${reportId}/messages`).limitToLast(20).on("value", (snap) => {
      const data = snap.val() || {};
      const rows = Object.values(data).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
      if (!rows.length) {
        container.innerHTML = `<div class="muted small">No messages yet.</div>`;
      } else {
        container.innerHTML = rows.map(m => `
          <div class="msg-row">
            <div class="msg-meta">
              <span class="msg-name">${escapeHtml(m.senderName || m.senderId || "User")}</span>
              <span class="muted">${fmtDate(m.timestamp)}</span>
            </div>
            <div class="msg-body">${escapeHtml(m.text || "")}</div>
          </div>
        `).join("");
      }
    });
  }

  // -------- CSV export --------
  function exportCsv() {
    const headers = ["reportId","reportType","status","severity","organizationId","organizationName","reportUserId","reportUserEmail","createdAt","lastActivityAt"];
    const rows = filtered.map(r => [
      r.reportId || "",
      r.reportType || "",
      r.status || "",
      r.severity || "",
      r.organizationId || "",
      r.organizationName || "",
      r.reportUserId || "",
      r.reportUserEmail || "",
      r.createdAt || "",
      r.lastActivityAt || r.lastMessageAt || ""
    ]);

    const csv = [headers.join(","), ...rows.map(row => row.map(cell =>
      /[",\n]/.test(String(cell)) ? `"${String(cell).replace(/"/g,'""')}"` : String(cell)
    ).join(","))].join("\n");

    const blob = new Blob([csv], {type: "text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin_reports_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
})();
