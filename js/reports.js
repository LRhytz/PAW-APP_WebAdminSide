// ---- Early no-op shims (avoid ReferenceError if called before HTML defines them) ----
(function ensureShims() {
  if (typeof window.renderReportsTable !== "function") window.renderReportsTable = function () {};
  if (typeof window.updateMapMarkers !== "function") window.updateMapMarkers = function () {};
})();

// -------- Utilities --------

function animateNumber(id, end, duration = 800) {
  const el = document.getElementById(id);
  let start = 0;
  if (!el || end === 0) return el ? (el.innerText = "0") : null;
  const stepTime = Math.max(Math.floor(duration / end), 20);
  const timer = setInterval(() => {
    start++;
    el.innerText = start;
    if (start >= end) clearInterval(timer);
  }, stepTime);
}

async function getAddressFromCoords(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    const data = await response.json();
    return data.display_name || "Unknown address";
  } catch (error) {
    console.error("Error fetching address:", error);
    return "Address not available";
  }
}

function getStatusBadgeClass(status) {
  const s = (status || "SUBMITTED").toUpperCase().replace(/\s+/g, "-");
  return `status-${s}`;
}

function getSeverityClass(severity) {
  if (!severity) return "severity-unknown";
  switch (severity.toLowerCase()) {
    case "low": return "severity-low";
    case "medium": return "severity-medium";
    case "high": return "severity-high";
    case "critical": return "severity-critical";
    default: return "severity-unknown";
  }
}

function formatDate(timestamp) {
  if (!timestamp) return "—";
  try {
    const date = new Date(timestamp);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return String(timestamp);
  }
}

/** Parse yyyyMMdd_HHmmss from reportId, if needed */
function parseTimestampFromReportId(reportId) {
  if (!reportId || typeof reportId !== "string") return 0;
  const parts = reportId.split("_");
  if (parts.length < 3) return 0;
  const raw = (parts[1] || "") + (parts[2] || "");
  if (!/^\d{14}$/.test(raw)) return 0;
  const y = +raw.slice(0, 4);
  const M = +raw.slice(4, 6) - 1;
  const d = +raw.slice(6, 8);
  const h = +raw.slice(8, 10);
  const m = +raw.slice(10, 12);
  const s = +raw.slice(12, 14);
  const dt = new Date(y, M, d, h, m, s);
  return isFinite(dt.getTime()) ? dt.getTime() : 0;
}

// Build " • 5 min ago"
function buildUpdatedAgo(updatedAt, fallbackReportId) {
  let ts = updatedAt || 0;
  if (!ts && fallbackReportId) {
    const parts = fallbackReportId.split("_");
    if (parts.length >= 3) {
      const date = parts[1]; // yyyyMMdd
      const time = parts[2]; // HHmmss
      try {
        const y = +date.slice(0, 4),
          M = +date.slice(4, 6) - 1,
          d = +date.slice(6, 8),
          h = +time.slice(0, 2),
          m = +time.slice(2, 4),
          s = +time.slice(4, 6);
        ts = new Date(y, M, d, h, m, s).getTime();
      } catch {}
    }
  }
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return ` • ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return ` • ${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return ` • ${days} day${days === 1 ? "" : "s"} ago`;
}

// -------- Data normalization --------

function pickReportEmail(r) {
  return r.reportUserEmail || r.email || "";
}

function normalizeReport(id, r) {
  const reporterUid = (() => {
    const uidKeys = ["reportUserId", "userId", "reporterId", "reportedById", "reportUser", "user"];
    for (const k of uidKeys) {
      const val = r[k];
      const candidateUid =
        (val && typeof val === "object" && (val.uid || val.id)) ||
        (typeof val === "string" ? val : null);
      if (candidateUid) return candidateUid;
    }
    return null;
  })();

  const createdAt =
    Number(r.createdAt) ||
    Number(r.timestamp) ||
    Number(r.date) ||
    parseTimestampFromReportId(id) ||
    0;

  return {
    id,
    reportType: r.reportType || "Unknown",
    status: r.status || "SUBMITTED",
    severity: r.severity || "Unknown",
    location: r.address || "",
    latitude: r.latitude ?? r.lat ?? "",
    longitude: r.longitude ?? r.lng ?? "",
    reporterUid,
    reporterDisplayName: r.reporterDisplayName || "",
    email: pickReportEmail(r),
    createdAt,
    timestamp: createdAt,
    description: r.reportDescription || "",
    imageUrls: r.imageUrls || [],
    videoUrl: r.videoUrl || null,
    organizationId: r.organizationId || null,
    messages: r.messages || null,
  };
}

/** Subscribe -> normalize -> emit to page */
function subscribeReports() {
  const db = firebase.database();
  db.ref("reports").on("value", (snapshot) => {
    const raw = snapshot.val();
    if (!raw) {
      window.updateReportsMapData?.([]);
      return;
    }
    const visible = Object.entries(raw).map(([id, r]) => normalizeReport(id, r));
    try {
      console.debug(
        "reports.subscribe -> normalized preview",
        visible.slice(0, 5).map((x) => ({ id: x.id, createdAt: x.createdAt, name: x.reporterDisplayName, email: x.email }))
      );
    } catch {}
    if (typeof window.updateReportsMapData === "function") {
      window.updateReportsMapData(visible);
    } else {
      window.dispatchEvent(new CustomEvent("reportsLoaded", { detail: { reports: visible } }));
    }
  });
}

// -------- Status transitions (Android parity) --------

const allowedTransitions = {
  SUBMITTED: ["ACCEPTED"],
  ACCEPTED: ["IN PROGRESS", "ON HOLD"],
  "IN PROGRESS": ["ON HOLD", "COMPLETED"],
  "ON HOLD": ["IN PROGRESS", "COMPLETED"],
  COMPLETED: [],
};

function canTransition(current, next) {
  return (allowedTransitions[(current || "").toUpperCase()] || []).includes((next || "").toUpperCase());
}

// -------- Status updates with confirmations --------

function acceptReport(reportId) {
  if (!reportId) return;
  withAuth((user) => {
    const db = firebase.database();
    const ref = db.ref(`reports/${reportId}`);

    ref.once("value").then((snap) => {
      const data = snap.val() || {};
      const currStatus = String(data.status || "SUBMITTED").toUpperCase();
      const assignedTo = data.organizationId || null;
      if (currStatus !== "SUBMITTED") {
        showToast(`This report is already ${currStatus}`, "error");
        return;
      }
      if (assignedTo) {
        showToast("This report has already been assigned", "error");
        return;
      }

      const type = data.reportType || "Report";
      const addr = data.address;
      const msg = `Respond to this ${type}?\n\nResponding will assign this report to your organization and enable chat with the reporter.\n\nThis action can’t be undone (ownership stays with your org).` + (addr ? `\n\nLocation:\n${addr}` : "");
      if (!window.confirm(msg)) return;

      const myUid = user.uid;
      // step 1: claim + set ACCEPTED
      const step1 = {
        organizationId: myUid,
        status: "ACCEPTED",
        updatedAt: Date.now(),
        updatedBy: user.email || myUid,
      };

      ref.update(step1).then(() => {
        // step 2: enrich org fields from /users/{uid}
        firebase
          .database()
          .ref("users")
          .child(myUid)
          .once("value")
          .then((uSnap) => {
            const u = uSnap.val() || {};
            const orgName = u.organizationName || u.displayName || u.representativeName || "Organization";
            const orgPhoto = u.logoImageUri || u.organizationPhotoUrl || u.photoUrl || "";
            return ref.update({
              organizationName: orgName,
              organizationEmail: user.email || "",
              organizationPhotoUrl: orgPhoto,
              updatedAt: Date.now(),
              updatedBy: user.email || myUid,
            });
          })
          .finally(() => {
            // history entry
            ref.child("history").push({
              status: "ACCEPTED",
              changedBy: myUid,
              timestamp: Date.now(),
            });
            showToast("Report accepted successfully");
            // Refresh modal with latest data (keep it open)
            ref.once("value").then((fresh) => {
              const freshNorm = normalizeReport(reportId, fresh.val() || {});
              showReportModal(freshNorm);
            });
          });
      });
    });
  });
}

function updateReportStatus(reportId, newStatus) {
  if (!reportId) return;
  withAuth((user) => {
    const db = firebase.database();
    const ref = db.ref(`reports/${reportId}`);
    const myUid = user.uid;

    ref.once("value").then((snap) => {
      const data = snap.val() || {};
      const currStatus = String(data.status || "SUBMITTED").toUpperCase();
      const currOrgId = data.organizationId || null;

      if (!canTransition(currStatus, newStatus)) {
        showToast(`You can’t move from ${currStatus} to ${newStatus}`, "error");
        return;
      }

      // Only assigned org can change after claim
      if (currStatus !== "SUBMITTED" && (!currOrgId || currOrgId !== myUid)) {
        showToast("Only the assigned organization can update this report", "error");
        return;
      }

      if (newStatus === "COMPLETED") {
        const ok = window.confirm("Mark this report as Completed?\n\nMake sure all actions are finalized.");
        if (!ok) return;
      }

      const updates = {
        status: newStatus,
        updatedAt: Date.now(),
        updatedBy: user.email || myUid,
      };

      ref
        .update(updates)
        .then(() => {
          // write history
          ref.child("history").push({
            status: newStatus,
            changedBy: myUid,
            timestamp: Date.now(),
          });
          showToast(`Report status updated to ${newStatus}`);
          // Refresh modal with latest data (keep it open)
          ref.once("value").then((fresh) => {
            const freshNorm = normalizeReport(reportId, fresh.val() || {});
            showReportModal(freshNorm);
          });
        })
        .catch((error) => {
          console.error("Error updating report status:", error);
          showToast("Error updating report status: " + (error.message || error), "error");
        });
    });
  });
}

// Ensure firebase auth is ready and supply the user
function withAuth(callback) {
  try {
    const user = firebase.auth().currentUser;
    if (user) return callback(user);
    const off = firebase.auth().onAuthStateChanged((u) => {
      off && typeof off === "function" && off();
      if (u) return callback(u);
      showToast("You must be signed in to perform this action", "error");
    });
  } catch (err) {
    console.error("Auth helper error:", err);
    showToast("Authentication error: " + (err.message || err), "error");
  }
}

// -------- Modal helpers --------

function ensureMetaItem(container, cls, icon, labelText) {
  let item = container.querySelector(`.${cls}`);
  if (!item) {
    item = document.createElement("div");
    item.className = `metadata-item ${cls}`;
    item.innerHTML = `
      <i class="${icon}"></i>
      <div class="metadata-content">
        <div class="metadata-label">${labelText}</div>
        <div class="metadata-value"></div>
      </div>`;
    container.appendChild(item);
  }
  return item.querySelector(".metadata-value");
}

// ===== NEW: Status timeline helpers =====
function _normStatusWeb(s) {
  const u = String(s || '').toUpperCase();
  if (u === 'PENDING') return 'SUBMITTED';
  if (u === 'APPROVED') return 'ACCEPTED';
  if (u === 'IN-PROGRESS' || u === 'IN_PROGRESS') return 'IN PROGRESS';
  if (u === 'ON-HOLD' || u === 'ON_HOLD') return 'ON HOLD';
  return u;
}

function renderTimelineFromSnapshot(reportId, snap) {
  const list = document.getElementById('timeline-list');
  if (!list) return;

  const data = snap.val() || {};
  const allowed = new Set(['SUBMITTED', 'ACCEPTED', 'IN PROGRESS', 'ON HOLD', 'COMPLETED']);

  // 1) collect history entries
  const raw = [];
  const hist = snap.child('history');
  hist.forEach(h => {
    const st = _normStatusWeb(h.child('status').val());
    raw.push({
      status: st,
      timestamp: Number(h.child('timestamp').val()) || 0,
      changedBy: h.child('changedBy').val() || null,
      changedByName: h.child('changedByName').val() || null
    });
  });

  // 2) seed SUBMITTED if missing
  const hasSubmitted = raw.some(x => x.status === 'SUBMITTED');
  if (!hasSubmitted) {
    const createdAt =
      Number(data.createdAt || 0) ||
      parseTimestampFromReportId(reportId) || 0;
    raw.push({
      status: 'SUBMITTED',
      timestamp: createdAt,
      changedBy: data.reportUserId || null,
      changedByName: data.reporterDisplayName || data.reportUserEmail || null
    });
  }

  // 3) keep allowed only
  const filtered = raw.filter(x => allowed.has(x.status));

  // 4) sort asc then drop consecutive duplicates
  const asc = filtered.sort((a,b) => (a.timestamp||0)-(b.timestamp||0));
  const dedup = [];
  let last = null;
  asc.forEach(e => {
    if (e.status !== last) { dedup.push(e); last = e.status; }
  });

  // 5) newest first
  const finalList = dedup.sort((a,b) => (b.timestamp||0)-(a.timestamp||0));

  // 6) render
  const fmtDate = (ts) => {
    if (!ts) return {d:'', t:''};
    const d = new Date(ts);
    return {
      d: d.toLocaleDateString(undefined, { month:'short', day:'2-digit' }),
      t: d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })
    };
  };
  const who = (e) => {
    if (e.changedByName) return e.changedByName;
    if (e.status === 'SUBMITTED') return data.reporterDisplayName || data.reportUserEmail || 'Reporter';
    return data.organizationName || data.organizationEmail || 'Organization';
  };
  const titleFor = (st) => ({
    'SUBMITTED':'Report Submitted',
    'ACCEPTED':'Report Accepted',
    'IN PROGRESS':'Report In Progress',
    'ON HOLD':'Report On Hold',
    'COMPLETED':'Report Completed'
  }[st] || `Status updated to ${st}`);

  list.innerHTML = finalList.map((e, idx) => {
    const dt = fmtDate(e.timestamp);
    return `
      <div class="timeline-item">
        <div class="timeline-date">
          <div class="d">${dt.d}</div>
          <div class="t">${dt.t}</div>
        </div>
        <div class="timeline-axis">
          <div class="timeline-dot"></div>
          <div class="timeline-line"></div>
        </div>
        <div class="timeline-body">
          <div class="timeline-title">${titleFor(e.status)}</div>
          <div class="timeline-sub">${e.status === 'SUBMITTED' ? 'Reported by ' : 'By '}${who(e)}</div>
        </div>
      </div>`;
  }).join('');
}

// -------- Report Modal (reordered + timeline) --------
function showReportModal(report) {
  const modal = document.getElementById("report-modal");
  if (!modal) return;

  // Enable background scroll for this modal
  modal.classList.add("modal-backscroll");

  // Title + header sub
  const titleSpan = modal.querySelector(".modal-report-type-value");
  if (titleSpan) titleSpan.textContent = report.reportType || "Report";

  // store coords on modal root
  modal.setAttribute("data-latitude", report.latitude || "");
  modal.setAttribute("data-longitude", report.longitude || "");

  // description
  modal.querySelector(".report-description").textContent =
    report.description || "No description provided.";

  // status badge
  const statusElement = modal.querySelector(".modal-report-status");
  statusElement.innerHTML = `
    <span class="status-badge ${getStatusBadgeClass(report.status)}">
      ${report.status || "SUBMITTED"}
    </span>`;

  // location (resolve from coords when available)
  const locationValue = modal.querySelector(".modal-report-location");
  if (report.latitude && report.longitude) {
    locationValue.textContent = "Fetching address...";
    getAddressFromCoords(report.latitude, report.longitude).then((address) => {
      locationValue.textContent = address;
    });
  } else {
    locationValue.textContent = report.location || "Not specified";
  }

  // Reporter (name/email combined line)
  modal.querySelector(".modal-report-email").textContent =
    (report.reporterDisplayName && report.email)
      ? `${report.reporterDisplayName} • ${report.email}`
      : (report.reporterDisplayName || report.email || "Anonymous");

  // Severity chip
  const severityElement = modal.querySelector(".modal-report-severity");
  severityElement.innerHTML = `
    <span class="${getSeverityClass(report.severity)}">
      ${report.severity || "Unknown"}
    </span>`;

  // ===== MEDIA (now under description in the left column) =====
  const imagesContainer = modal.querySelector(".report-images");
  if (report.imageUrls && report.imageUrls.length > 0) {
    imagesContainer.innerHTML = `
      <div class="images-label">
        <i class="fas fa-images"></i> Attached Images (${report.imageUrls.length})
      </div>
      <div class="image-gallery">
        ${report.imageUrls
          .map(
            (url) =>
              `<a href="${url}" target="_blank"><img src="${url}" alt="Report Image" class="report-image"></a>`
          )
          .join("")}
      </div>`;
  } else {
    imagesContainer.innerHTML = `<p class="no-images"><i class="fas fa-image-slash"></i> No attached images</p>`;
  }

  const videoContainer = modal.querySelector(".report-video");
  if (report.videoUrl) {
    videoContainer.innerHTML = `
      <a href="${report.videoUrl}" target="_blank">
        <i class="fas fa-video"></i> View Attached Video
      </a>`;
  } else {
    videoContainer.innerHTML = `<p class="no-video"><i class="fas fa-video-slash"></i> No attached video</p>`;
  }

  // For actions
  modal.setAttribute("data-report-id", report.id);

  // -------- Extra metadata (Assigned Org / Created / Updated + updated-ago) --------
  const metaGrid = modal.querySelector(".report-metadata");

  const assignedVal = ensureMetaItem(metaGrid, "meta-assigned-org", "fas fa-building", "Assigned Organization");
  const createdVal  = ensureMetaItem(metaGrid, "meta-created-at", "fas fa-calendar-plus", "Created At");
  const updatedVal  = ensureMetaItem(metaGrid, "meta-updated-at", "fas fa-clock", "Updated At");

  // Load fresh snapshot for organizationName/Email + updatedAt + TIMELINE
  firebase.database().ref(`reports/${report.id}`).once("value").then((snap) => {
    const data = snap.val() || {};
    const orgName = data.organizationName;
    const orgEmail = data.organizationEmail;
    const orgId = data.organizationId;

    if (!orgId) {
      assignedVal.textContent = "Unassigned";
    } else if (orgName) {
      assignedVal.textContent = orgName;
    } else if (orgEmail) {
      assignedVal.textContent = orgEmail;
    } else {
      assignedVal.textContent = orgId;
    }

    const createdAtMs = Number(data.createdAt || report.createdAt || 0) || parseTimestampFromReportId(report.id);
    createdVal.textContent = createdAtMs ? new Date(createdAtMs).toLocaleString() : "—";

    const updatedAtMs = Number(data.updatedAt || 0);
    const updatedStr = updatedAtMs ? new Date(updatedAtMs).toLocaleString() : "—";
    updatedVal.textContent = updatedStr;

    // Update header sub ("Report Details • … ago")
    const subEl = modal.querySelector(".header-sub");
    const ago = buildUpdatedAgo(updatedAtMs, report.id);
    if (subEl) subEl.textContent = `Report Details${ago || ""}`;

    // ===== NEW: render right-side timeline =====
    renderTimelineFromSnapshot(report.id, snap);
  });

  // ---------- LEFT: Message button slot (participants on active statuses only) ----------
  const footerEl = modal.querySelector(".modal-footer");
  let leftSlot = modal.querySelector(".footer-left-actions");
  if (!leftSlot) {
    leftSlot = document.createElement("div");
    leftSlot.className = "footer-left-actions";
    footerEl.insertBefore(leftSlot, footerEl.firstChild);
  }
  leftSlot.innerHTML = "";

  const currentUser = firebase.auth().currentUser;
  const me = currentUser?.uid || null;
  const statusUpper = (report.status || "").toUpperCase();
  const isActive = ["ACCEPTED", "IN PROGRESS", "ON HOLD"].includes(statusUpper);
  const isParticipant = !!me && (report.organizationId === me || report.reporterUid === me);

  if (isActive && isParticipant) {
    const msgBtn = document.createElement("button");
    msgBtn.className = "btn btn-message";
    msgBtn.innerHTML = `<i class="fas fa-comment"></i><span>Message</span>`;
    msgBtn.onclick = () => showMessageModal(report.id, report.email || "Anonymous");
    leftSlot.appendChild(msgBtn);
  }

  // ---------- RIGHT: status action buttons (use allowedTransitions + special ACCEPTED rule) ----------
  const actionsWrap = modal.querySelector(".modal-footer .action-buttons");
  actionsWrap.innerHTML = "";

  const curr = statusUpper;

  // Helper to create a button
  const addBtn = (label, value, icon, className) => {
    const btn = document.createElement("button");
    btn.className = `btn ${className}`;
    btn.innerHTML = `<i class="fas ${icon}"></i><span>${label}</span>`;
    btn.onclick = () => (value === "ACCEPTED" ? acceptReport(report.id) : updateReportStatus(report.id, value));
    actionsWrap.appendChild(btn);
  };

  if (curr === "SUBMITTED") {
    addBtn("Respond", "ACCEPTED", "fa-check", "btn-accept");
  } else if (curr === "ACCEPTED") {
    addBtn("In Progress", "IN PROGRESS", "fa-spinner", "btn-inprogress");
  } else if (curr === "IN PROGRESS") {
    addBtn("On Hold", "ON HOLD", "fa-pause-circle", "btn-onhold");
    addBtn("Completed", "COMPLETED", "fa-check-circle", "btn-completed");
  } else if (curr === "ON HOLD") {
    addBtn("In Progress", "IN PROGRESS", "fa-spinner", "btn-inprogress");
    addBtn("Completed", "COMPLETED", "fa-check-circle", "btn-completed");
  }
  // COMPLETED -> no buttons

  // Show modal (no body scroll locking)
  modal.classList.add("show");
}

// Compatibility alias
window.openModal = showReportModal;

function closeModal() {
  const modal = document.getElementById("report-modal");
  if (modal) {
    modal.classList.remove("show");
    // leave background scroll as-is
  }
}

// -------- Toast --------
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// -------- Message modal (fixed-size + reliable stream) --------
(function () {
  let _msgsOff = null;
  let _headerOff = null;

  function createMessageModal() {
    if (document.getElementById("message-modal")) return;

    const html = `
      <div id="message-modal" class="modal">
        <div class="modal-content modal-wide" id="message-modal-content">
          <style>
            /* Scoped to #message-modal only */
            #message-modal .modal-content.modal-wide{
              max-width:980px; width:calc(100% - 48px);
              /* make the whole modal taller and let the middle row truly fill */
              height:calc(100vh - 24px);
              max-height:calc(100vh - 24px);
              overflow:hidden;
              display:grid;
              grid-template-rows:auto minmax(0,1fr) auto; /* header • FULL • input */
              overscroll-behavior: contain;
            }

            /* Header */
            #message-modal .chat-header{
              position:sticky; top:0; z-index:2;
              display:flex; align-items:center; gap:12px;
              padding:12px 16px; border-bottom:1px solid var(--border); background:#f5f5f5;
            }
            #message-modal .x-close{
              position:absolute; right:10px; top:8px; border:0; background:transparent;
              font-size:22px; line-height:1; cursor:pointer; color:#777;
            }
            #message-modal .x-close:hover{ color:#333; }
            #message-modal .peer-avatar{ width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid #e5e7eb; }
            #message-modal .chat-title{ font-weight:700; font-size:16px; line-height:1.2; }
            #message-modal .chat-sub{ font-size:12px; color:#6b7280; }

            /* Messages list — now truly takes all free space */
            #message-modal .chat-body{
              padding:12px 16px;
              overflow:auto;
              background:#fff;
              min-height:0;   /* CRITICAL so the grid row can shrink/expand */
            }
            #message-modal .msg-row{ display:flex; align-items:flex-end; gap:10px; margin:10px 0; }
            #message-modal .msg-left{ justify-content:flex-start; }
            #message-modal .msg-right{ justify-content:flex-end; }
            #message-modal .msg-avatar{ width:32px; height:32px; border-radius:50%; object-fit:cover; border:1px solid #e5e7eb; flex:0 0 32px; }
            /* Make bubbles wider so the chat “feels” larger without changing layout */
            #message-modal .bubble{ max-width:96%; padding:10px 14px; border-radius:16px; font-size:14px; line-height:1.45; word-break:break-word; }
            #message-modal .bubble.org{ background:#e8f5e9; color:#1b5e20; }
            #message-modal .bubble.citizen{ background:#fffde7; color:#7a4b00; }
            #message-modal .bubble.peer{ background:#f3f4f6; color:#111827; }
            #message-modal .ts{ font-size:10px; color:#888; margin-top:2px; }

            /* Input bar (fixed at the bottom) */
            #message-modal .chat-input{
              display:flex; gap:8px; padding:12px 16px;
              border-top:1px solid var(--border); background:#fafafa;
            }
            #message-modal .chat-input textarea{
              flex:1; resize:none; min-height:42px; max-height:120px;
              border:1px solid var(--border); border-radius:8px; padding:10px; font-size:14px; background:#fff;
            }
            #message-modal .chat-input button{
              background:var(--primary); color:#fff; border:0; border-radius:20px; padding:10px 16px; font-weight:700; cursor:pointer;
            }
            #message-modal .chat-input button:hover{ background:#388e3c; }
            #message-modal .chat-input.hidden{ display:none; }
          </style>

          <div class="chat-header">
            <img class="peer-avatar" alt="peer"/>
            <div style="min-width:0;">
              <div class="chat-title" id="chat-title">Chat</div>
              <div class="chat-sub" id="chat-sub"></div>
            </div>
            <button class="x-close" id="message-modal-close-btn" title="Close">&times;</button>
          </div>

          <div class="chat-body" id="message-history"><em>Loading…</em></div>

          <div class="chat-input" id="chat-input">
            <textarea id="message-input" rows="2" placeholder="Type your message..."></textarea>
            <button id="send-message-btn"><i class="fas fa-paper-plane"></i> Send</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);

    // Backdrop click closes
    const mm = document.getElementById("message-modal");
    mm.addEventListener("click", (e) => { if (e.target.id === "message-modal") closeMessageModal(); });
    document.getElementById("message-modal-close-btn").addEventListener("click", closeMessageModal);
  }

  function closeMessageModal() {
    // Clean listeners
    if (_msgsOff) { _msgsOff(); _msgsOff = null; }
    if (_headerOff) { _headerOff(); _headerOff = null; }
    const modal = document.getElementById("message-modal");
    if (!modal) return;
    modal.classList.remove("show");
    setTimeout(() => modal.remove(), 120);
  }
  window.closeMessageModal = closeMessageModal;

  // Safe getters for participants like Android
  function resolveCitizenUid(report) {
    return (
      report.reportUserId ||
      (report.reportUser && (report.reportUser.uid || report.reportUser.id)) ||
      report.userId || report.reporterId || null
    );
  }
  function resolveOrgUid(report) {
    return report.organizationId || null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
    );
  }

  function showMessageModal(reportId, fallbackPeerLabel) {
    createMessageModal();
    const modal = document.getElementById("message-modal");
    modal.classList.add("show");
    modal.setAttribute("data-report-id", reportId);

    const me = firebase.auth().currentUser;
    const myUid = me?.uid || null;

    const db = firebase.database();
    const reportRef = db.ref(`reports/${reportId}`);
    const msgsRef = reportRef.child("messages");

    const historyDiv = document.getElementById("message-history");
    const titleEl = document.getElementById("chat-title");
    const subEl = document.getElementById("chat-sub");
    const peerAvatarEl = modal.querySelector(".peer-avatar");
    const inputWrap = document.getElementById("chat-input");
    const inputEl = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-message-btn");

    if (!myUid) {
      inputWrap.classList.add("hidden");
      historyDiv.innerHTML = `<em>You must be signed in to send messages.</em>`;
      return;
    }

    // ----- Header, participants & input visibility -----
    let orgUid = null, citizenUid = null, myRole = "CITIZEN";

    const onReportValue = async (snap) => {
      const r = snap.val() || {};
      orgUid = resolveOrgUid(r);
      citizenUid = resolveCitizenUid(r);
      myRole = (myUid && orgUid === myUid) ? "ORG" : "CITIZEN";

      // Title + sub
      const peerName = (myRole === "ORG"
        ? (r.reporterDisplayName || r.reportUserEmail)
        : (r.organizationName || r.organizationEmail)) || fallbackPeerLabel || "Chat";
      titleEl.textContent = peerName;
      subEl.textContent = `${r.reportType || "Report"}${r.severity ? " • " + r.severity : ""}`;

      // Peer avatar (denorm first, then /users fallback)
      let url = (myRole === "ORG" ? r.reporterPhotoUrl : r.organizationPhotoUrl) || "";
      if (!url) {
        const peerUid = (myRole === "ORG") ? citizenUid : orgUid;
        if (peerUid) {
          const uSnap = await firebase.database().ref("users").child(peerUid).once("value");
          const u = uSnap.val() || {};
          url = u.logoImageUri || u.photoUrl || u.profilePhotoUrl || u.avatarUrl || "";
          if (titleEl.textContent === "Chat") {
            titleEl.textContent =
              (myRole === "ORG")
                ? (u.fullName || u.displayName || u.name || u.email || peerName)
                : (u.organizationName || u.representativeName || u.email || peerName);
          }
        }
      }
      peerAvatarEl.src = url || "";
      peerAvatarEl.alt = peerName || "User";
      peerAvatarEl.onerror = function () {
        this.onerror = null;
        this.src =
          "data:image/svg+xml;charset=UTF-8," +
          encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="#e5e7eb"/><text x="50%" y="54%" text-anchor="middle" font-family="Arial" font-size="22" fill="#9ca3af">👤</text></svg>');
      };

      // If some incoming bubbles were rendered before we had the URL, patch them
      if (url) {
        document.querySelectorAll('#message-modal .msg-avatar.peer').forEach(img => {
          if (!img.getAttribute('data-set')) {
            img.src = url;
            img.setAttribute('data-set', '1');
          }
        });
      }

      // Input allowed only on active statuses
      const allowed = ["ACCEPTED", "IN PROGRESS", "ON HOLD"].includes(String(r.status || "").toUpperCase());
      inputWrap.classList.toggle("hidden", !allowed);
    };
    reportRef.on("value", onReportValue);
    _headerOff = () => reportRef.off("value", onReportValue);

    // ----- Seed existing messages (once), then live stream -----
    let lastTs = 0;
    historyDiv.innerHTML = "<em>Loading…</em>";
    msgsRef.once("value").then((s) => {
      const all = s.val() || {};
      const arr = Object.values(all).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      historyDiv.innerHTML = "";
      arr.forEach((m) => {
        lastTs = Math.max(lastTs, Number(m.timestamp || 0));
        historyDiv.insertAdjacentHTML("beforeend", renderRow(m, myUid, me?.photoURL, peerAvatarEl.src));
      });
      historyDiv.scrollTop = historyDiv.scrollHeight;

      // live: only newer messages
      const q = msgsRef.orderByChild("timestamp").startAt(lastTs + 1);
      const onChildAdded = (sn) => {
        const m = sn.val() || {};
        historyDiv.insertAdjacentHTML("beforeend", renderRow(m, myUid, me?.photoURL, peerAvatarEl.src));
        historyDiv.scrollTop = historyDiv.scrollHeight;
        // mark read (best effort)
        if (m.senderId && m.senderId !== myUid) {
          msgsRef.child(sn.key).child("readBy").update({ [myUid]: true }).catch(() => {});
        }
      };
      q.on("child_added", onChildAdded);
      _msgsOff = () => q.off("child_added", onChildAdded);
    });

    // ----- Send -----
    sendBtn.onclick = async () => {
      const text = (inputEl.value || "").trim();
      if (!text) return;

      const role = (myUid === orgUid) ? "ORG" : "CITIZEN";
      const node = msgsRef.push();
      const payload = {
        messageId: node.key,
        senderId: myUid,
        senderRole: role,
        text,
        timestamp: Date.now(),
        senderName: me.displayName || me.email || null,
        senderPhotoUrl: me.photoURL || null
      };

      try {
        // write message
        await node.set(payload);

        // bump thread timestamp (allowed since author is a participant)
        await reportRef.update({ lastMessageAt: Date.now() });

        // clear input + keep view at bottom
        inputEl.value = "";
        historyDiv.scrollTop = historyDiv.scrollHeight;

        // notify peer
        const recipientUid = (role === "ORG") ? citizenUid : orgUid;
        if (recipientUid) {
          const notifRef = firebase.database().ref("notifications").child(recipientUid).push();
          await notifRef.set({
            id: notifRef.key || "",
            type: "message",
            reportId,
            messageId: node.key,
            title: me.displayName || "New message",
            senderName: me.displayName || "User",
            body: text.substring(0, 80),
            createdAt: Date.now(),
            seen: false
          });
        }
      } catch (e) {
        console.error("send message error:", e);
        showToast("Failed to send message: " + (e.message || e), "error");
      }
    };

    // Helpers
    function renderRow(m, myUid, myPhotoUrl, peerPhotoUrl) {
      const isMine = m.senderId === myUid;
      const side = isMine ? "msg-right" : "msg-left";
      const bubbleClass = isMine
        ? (String(m.senderRole || "").toUpperCase() === "ORG" ? "org" : "citizen")
        : "peer";
      const ts = m.timestamp ? new Date(m.timestamp).toLocaleString() : "";
      // Show avatar only for peer (incoming) messages
      const avatarHtml = !isMine
        ? `<img class="msg-avatar peer" src="${peerPhotoUrl || ""}" alt="">`
        : "";
      return `
        <div class="msg-row ${side}">
          ${avatarHtml}
          <div>
            <div class="bubble ${bubbleClass}">${escapeHtml(m.text || "")}</div>
            <div class="ts">${ts}</div>
          </div>
        </div>`;
    }
  }

  window.showMessageModal = showMessageModal;
})();


// -------- Map button inside the detail modal (delegated) --------
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("map-location-btn") || e.target.closest(".map-location-btn")) {
    const modal = document.getElementById("report-modal");
    const lat = parseFloat(modal.getAttribute("data-latitude"));
    const lng = parseFloat(modal.getAttribute("data-longitude"));

    if (isNaN(lat) || isNaN(lng)) {
      alert("Location data is missing or invalid.");
      return;
    }

    const mapModal = document.getElementById("map-modal");
    mapModal.classList.add("modal-backscroll");
    mapModal.classList.add("show");

    setTimeout(() => {
      if (window.leafletMap) window.leafletMap.remove();
      window.leafletMap = L.map("leaflet-map").setView([lat, lng], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(window.leafletMap);
      L.marker([lat, lng]).addTo(window.leafletMap).bindPopup("Report Location").openPopup();
    }, 250);
  }
});

// -------- Page init --------
document.addEventListener("DOMContentLoaded", () => {
  subscribeReports();

  const db = firebase.database();
  db.ref("reports")
    .once("value")
    .then((snapshot) => {
      const reports = snapshot.val();
      const totalReports = reports ? Object.keys(reports).length : 0;
      animateNumber("totalReports", totalReports);
    });

  if (window.AOS) AOS.init({ duration: 600, once: true });
});

// ======================== end reports.js ========================
