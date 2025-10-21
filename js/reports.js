// ========================== reports.js (updated) ==========================
// This version stops rendering "cards" and instead:
// 1) Subscribes to Firebase,
// 2) Normalizes data,
// 3) Emits an array to window.updateReportsMapData(reports),
// letting the HTML handle Table + Map rendering, filtering, and sorting.
// It keeps your accept/reject/status updates, modal, messaging, and toasts.

// -------- Utilities --------

// Simple counter animation for statistics (if needed)
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

// Status badge class (for your modal/toasts)
function getStatusBadgeClass(status) {
  if (!status) return "status-pending";
  status = status.toUpperCase();
  switch (status) {
    case "ACCEPTED":
      return "status-accepted";
    case "IN PROGRESS":
      return "status-in-progress";
    case "ON HOLD":
      return "status-on-hold";
    case "COMPLETED":
      return "status-completed";
    case "REJECTED":
      return "status-rejected";
    default:
      return "status-pending";
  }
}

// Severity class (for your modal)
function getSeverityClass(severity) {
  if (!severity) return "severity-unknown";
  switch (severity.toLowerCase()) {
    case "low":
      return "severity-low";
    case "medium":
      return "severity-medium";
    case "high":
      return "severity-high";
    case "critical":
      return "severity-critical";
    default:
      return "severity-unknown";
  }
}

function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  try {
    const date = new Date(timestamp);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch (e) {
    return String(timestamp);
  }
}

// -------- Data normalization & feed to UI --------

// simple cache for user emails to avoid repeated DB reads
const _userEmailCache = {};

function normalizeReport(id, r) {
  return {
    id,
    reportType: r.reportType || "Unknown",
    status: r.status || "SUBMITTED",
    severity: r.severity || "Unknown",
    location: r.address || "",
    latitude: r.latitude ?? r.lat ?? "",
    longitude: r.longitude ?? r.lng ?? "",
    // Normalize reporter email from several possible shapes.
    // Support multiple id keys (reportUserId, userId, reporterId, etc.) and
    // prefer resolved cache values when available.
    // store reporter uid when available for future use and try multiple strategies
    reporterUid: (() => {
      const uidKeys = [
        "reportUserId",
        "userId",
        "reporterId",
        "reportedById",
        "reportUser",
        "user",
      ];
      for (const k of uidKeys) {
        const val = r[k];
        const candidateUid =
          (val && typeof val === "object" && (val.uid || val.id)) ||
          (typeof val === "string" ? val : null);
        if (candidateUid) return candidateUid;
      }
      return null;
    })(),
    email: (() => {
      // candidate user id keys that reports may use
      const uidKeys = [
        "reportUserId",
        "userId",
        "reporterId",
        "reportedById",
        "reportUser",
        "user",
      ];

      for (const k of uidKeys) {
        const val = r[k];
        // if the field is an object, try to extract .uid or .id
        const candidateUid =
          (val && typeof val === "object" && (val.uid || val.id)) ||
          (typeof val === "string" ? val : null);
        if (candidateUid && _userEmailCache[candidateUid]) {
          return _userEmailCache[candidateUid].email || "";
        }
      }

      // fallback to any direct email fields on the report
      return (
        r.reportUserEmail ||
        r.email ||
        r.reporterEmail ||
        r.reportedByEmail ||
        (r.reportUser && (r.reportUser.email || r.reportUserEmail)) ||
        (r.reporter && (r.reporter.email || r.reporter.emailAddress)) ||
        // as a last attempt, if we previously determined a reporterUid, try cache again
        (
          _userEmailCache[
            (function () {
              const keys = [
                "reportUserId",
                "userId",
                "reporterId",
                "reportedById",
                "reportUser",
                "user",
              ];
              for (const k of keys) {
                const v = r[k];
                const cid =
                  (v && typeof v === "object" && (v.uid || v.id)) ||
                  (typeof v === "string" ? v : null);
                if (cid) return cid;
              }
              return null;
            })()
          ] || {}
        ).email ||
        ""
      );
    })(),
    timestamp: r.timestamp || r.createdAt || r.date || null,
    description: r.reportDescription || "",
    imageUrls: r.imageUrls || [],
    videoUrl: r.videoUrl || null,
    // keep originals in case you need them:
    organizationId: r.organizationId || null,
    messages: r.messages || null,
  };
}

/**
 * Subscribe to Firebase, normalize, and emit to the page.
 * No DOM rendering here — Table & Map will render from the emitted array.
 */
function subscribeReports() {
  const db = firebase.database();
  const orgId = firebase.auth().currentUser?.uid;

  db.ref("reports").on("value", (snapshot) => {
    const raw = snapshot.val();

    if (!raw) {
      window.updateReportsMapData?.([]);
      return;
    }

    // Collect report user ids from several possible keys that we may need to resolve
    const entries = Object.entries(raw);
    const missingUserIds = new Set();
    const possibleUidKeys = [
      "reportUserId",
      "userId",
      "reporterId",
      "reportedById",
      "reportUser",
      "user",
    ];

    entries.forEach(([id, r]) => {
      if (!r) return;
      for (const k of possibleUidKeys) {
        const val = r[k];
        const candidateUid =
          (val && typeof val === "object" && (val.uid || val.id)) ||
          (typeof val === "string" ? val : null);
        if (candidateUid && !_userEmailCache[candidateUid]) {
          missingUserIds.add(candidateUid);
        }
      }
    });

    // If there are missing users, fetch them once and populate cache
    if (missingUserIds.size > 0) {
      // Read the full user node then extract email when possible. Some datasets
      // store email at /users/{uid}/email, others include it in the user object.
      const currentUid = firebase.auth().currentUser?.uid || null;

      // Determine if current user is an admin (admins/{uid} may be simple true
      // or an object with isAdmin). Reading admins/{currentUid} is allowed by
      // your rules since it only permits auth.uid to read their own admin node.
      const checkAdmin = currentUid
        ? db
            .ref(`admins/${currentUid}`)
            .once("value")
            .then((s) => {
              const val = s.val();
              return val === true || (val && val.isAdmin === true);
            })
            .catch(() => false)
        : Promise.resolve(false);

      checkAdmin.then((isAdmin) => {
        const promises = Array.from(missingUserIds).map((uid) => {
          // Allow fetching the user node if the uid is the current user or
          // the current user is an admin. Otherwise skip to avoid permission errors.
          if (!currentUid || (uid !== currentUid && !isAdmin)) {
            _userEmailCache[uid] = { email: "" };
            console.debug(
              `reports.subscribe -> skipped fetching user ${uid} (not current user and not admin)`
            );
            return Promise.resolve();
          }

          return db
            .ref(`users/${uid}`)
            .once("value")
            .then((s) => {
              const userObj = s.val() || {};
              const emailVal = userObj.email || userObj.emailAddress || "";
              _userEmailCache[uid] = { email: emailVal };
            })
            .catch((err) => {
              console.warn("Error fetching user", uid, err);
              _userEmailCache[uid] = { email: "" };
            });
        });

        Promise.all(promises).then(() => {
          const visible = entries.map(([id, r]) => normalizeReport(id, r));
          // Debug: show first few normalized reports (id + email) to help verify
          try {
            console.debug(
              "reports.subscribe -> normalized preview",
              visible.slice(0, 5).map((x) => ({ id: x.id, email: x.email }))
            );
          } catch (e) {}
          if (window.updateReportsMapData) {
            window.updateReportsMapData(visible);
          } else {
            window.dispatchEvent(
              new CustomEvent("reportsLoaded", { detail: { reports: visible } })
            );
          }
        });
      });
    } else {
      const visible = entries.map(([id, r]) => normalizeReport(id, r));
      try {
        console.debug(
          "reports.subscribe -> normalized preview",
          visible.slice(0, 5).map((x) => ({ id: x.id, email: x.email }))
        );
      } catch (e) {}
      if (window.updateReportsMapData) {
        window.updateReportsMapData(visible);
      } else {
        window.dispatchEvent(
          new CustomEvent("reportsLoaded", { detail: { reports: visible } })
        );
      }
    }
  });
}

// -------- Status updates --------

function acceptReport(reportId) {
  if (!reportId) return;
  // Ensure we have an authenticated user before writing metadata that relies on auth
  withAuth((user) => {
    const db = firebase.database();
    const orgId = user?.uid || "Unknown";

    db.ref(`reports/${reportId}`)
      .update({
        status: "ACCEPTED",
        resolvedAt: Date.now(),
        resolvedBy: user?.email || "Unknown",
        organizationId: orgId,
      })
      .then(() => {
        showToast("Report accepted successfully");
        closeModal();
      })
      .catch((error) => {
        console.error("Error accepting report:", error);
        showToast(
          "Error accepting report: " + (error.message || error),
          "error"
        );
      });
  });
}

function rejectReport(reportId) {
  if (!reportId) return;
  withAuth((user) => {
    const db = firebase.database();
    db.ref(`reports/${reportId}`)
      .update({
        status: "REJECTED",
        organizationId: null,
        rejectedAt: Date.now(),
        rejectedBy: user?.email || "Unknown",
      })
      .then(() => {
        showToast("Report rejected");
        closeModal();
      })
      .catch((error) => {
        console.error("Error rejecting report:", error);
        showToast(
          "Error rejecting report: " + (error.message || error),
          "error"
        );
      });
  });
}

function updateReportStatus(reportId, newStatus) {
  if (!reportId) return;
  withAuth((user) => {
    const db = firebase.database();
    const orgId = user?.uid || "Unknown";

    db.ref(`reports/${reportId}`)
      .update({
        status: newStatus,
        updatedAt: Date.now(),
        updatedBy: user?.email || "Unknown",
        organizationId: orgId,
      })
      .then(() => {
        showToast(`Report status updated to ${newStatus}`);
        closeModal();
      })
      .catch((error) => {
        console.error("Error updating report status:", error);
        showToast(
          "Error updating report status: " + (error.message || error),
          "error"
        );
      });
  });
}

// Helper: ensure firebase auth state is ready and supply the user to the callback
function withAuth(callback) {
  try {
    const user = firebase.auth().currentUser;
    if (user) return callback(user);

    // Wait once for auth state to become available
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

// -------- Modal helpers (optional — used if you still want your custom modal) --------

function showReportModal(report) {
  const modal = document.getElementById("report-modal");
  if (!modal) return;

  modal.querySelector(".modal-report-type-value").textContent =
    report.reportType || "Unknown";
  modal.setAttribute("data-latitude", report.latitude || "");
  modal.setAttribute("data-longitude", report.longitude || "");

  modal.querySelector(".report-description").textContent =
    report.description || "No description provided.";

  const statusElement = modal.querySelector(".modal-report-status");
  statusElement.innerHTML = `
    <span class="status-badge ${getStatusBadgeClass(report.status)}">
      ${report.status || "Pending"}
    </span>`;

  const locationValue = modal.querySelector(".modal-report-location");
  if (report.latitude && report.longitude) {
    locationValue.textContent = "Fetching address...";
    getAddressFromCoords(report.latitude, report.longitude).then((address) => {
      locationValue.textContent = address;
    });
  } else {
    locationValue.textContent = report.location || "Not specified";
  }

  modal.querySelector(".modal-report-email").textContent =
    report.email || "Anonymous";

  const severityElement = modal.querySelector(".modal-report-severity");
  severityElement.innerHTML = `
    <span class="${getSeverityClass(report.severity)}">
      ${report.severity || "Unknown"}
    </span>`;

  const imagesContainer = modal.querySelector(".report-images");
  if (report.imageUrls && report.imageUrls.length > 0) {
    imagesContainer.innerHTML = `
      <div class="images-label">
        <i class="fas fa-images"></i> Attached Images (${
          report.imageUrls.length
        })
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

  // for action buttons
  modal.setAttribute("data-report-id", report.id);

  const footer = modal.querySelector(".modal-footer .action-buttons");
  footer.innerHTML = "";

  const status = (report.status || "").toUpperCase();
  if (["ACCEPTED", "IN PROGRESS", "ON HOLD"].includes(status)) {
    [
      {
        label: "In Progress",
        value: "IN PROGRESS",
        icon: "fa-spinner",
        class: "btn-inprogress",
      },
      {
        label: "On Hold",
        value: "ON HOLD",
        icon: "fa-pause-circle",
        class: "btn-onhold",
      },
      {
        label: "Completed",
        value: "COMPLETED",
        icon: "fa-check-circle",
        class: "btn-completed",
      },
      {
        label: "Rejected",
        value: "REJECTED",
        icon: "fa-times-circle",
        class: "btn-reject",
      },
    ].forEach((s) => {
      const btn = document.createElement("button");
      btn.className = `btn ${s.class}`;
      btn.innerHTML = `<i class="fas ${s.icon}"></i><span>${s.label}</span>`;
      btn.onclick = () => updateReportStatus(report.id, s.value);
      footer.appendChild(btn);
    });
  } else if (status !== "REJECTED" && status !== "COMPLETED") {
    const acceptBtn = document.createElement("button");
    acceptBtn.className = "btn-accept";
    acceptBtn.textContent = "Accept";
    acceptBtn.onclick = () => acceptReport(report.id);

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "btn-reject";
    rejectBtn.textContent = "Reject";
    rejectBtn.onclick = () => rejectReport(report.id);

    footer.appendChild(rejectBtn);
    footer.appendChild(acceptBtn);
  }

  modal.classList.add("show");
  document.body.style.overflow = "hidden";
}

// Make the table's openReportDetails() compatible if it calls openModal(report)
window.openModal = showReportModal;

function closeModal() {
  const modal = document.getElementById("report-modal");
  if (modal) {
    modal.classList.remove("show");
    document.body.style.overflow = "";
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

// -------- Message modal (kept, with bugfix for read path) --------
function createMessageModal() {
  if (document.getElementById("message-modal")) return;
  const modalHtml = `
    <div id="message-modal" class="modal">
      <div class="modal-content" style="max-width:400px">
        <div class="modal-header">
          <h3>Send Message</h3>
          <button class="modal-close" id="message-modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div id="message-meta" style="margin-bottom:10px;"></div>
          <div id="message-history" style="max-height:200px;overflow-y:auto;margin-bottom:10px;"></div>
          <textarea id="message-input" rows="3" style="width:100%;" placeholder="Type your message..."></textarea>
        </div>
        <div class="modal-footer">
          <button id="send-message-btn" class="btn btn-accept">Send</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  document.getElementById("message-modal").addEventListener("click", (e) => {
    if (e.target.id === "message-modal") closeMessageModal();
  });
  document
    .getElementById("message-modal-close-btn")
    .addEventListener("click", closeMessageModal);
}

function closeMessageModal() {
  const modal = document.getElementById("message-modal");
  if (!modal) return;
  modal.classList.remove("show");
  document.body.style.overflow = "";
  setTimeout(() => {
    modal.dispatchEvent(new Event("remove"));
    modal.remove();
  }, 200);
}
window.closeMessageModal = closeMessageModal;

function showMessageModal(reportId, reportUserEmail) {
  createMessageModal();
  const modal = document.getElementById("message-modal");
  modal.classList.add("show");
  document.body.style.overflow = "hidden";
  modal.setAttribute("data-report-id", reportId);

  const db = firebase.database();

  // Meta
  db.ref(`reports/${reportId}`).once("value", (snapshot) => {
    const report = snapshot.val();
    const metaDiv = modal.querySelector("#message-meta");
    if (report) {
      metaDiv.innerHTML = `
        <div style="font-size:13px;">
          <strong>Reported By:</strong> ${
            report.reportUserEmail || "Anonymous"
          }<br>
          <strong>Severity:</strong> <span class="${getSeverityClass(
            report.severity
          )}">${report.severity || "Unknown"}</span>
        </div>`;
    } else {
      metaDiv.innerHTML = "";
    }
  });

  // Real-time history under /reports/{id}/messages/{orgId}
  const historyDiv = modal.querySelector("#message-history");
  historyDiv.innerHTML = "<em>Loading...</em>";

  if (window._pawMessageListener) {
    window._pawMessageListener.off();
    window._pawMessageListener = null;
  }

  const orgId = firebase.auth().currentUser?.uid;
  const messagesRef = db
    .ref(`reports/${reportId}/messages/${orgId}`)
    .orderByChild("timestamp");
  window._pawMessageListener = messagesRef;

  messagesRef.on("value", (snapshot) => {
    const messages = snapshot.val();
    if (!messages) {
      historyDiv.innerHTML = "<em>No messages yet.</em>";
      return;
    }

    // Mark unread as read at the correct path /messages/{orgId}/{msgId}
    Object.entries(messages).forEach(([msgId, msg]) => {
      if (msg.senderRole !== "ORG" && !msg.read) {
        db.ref(`reports/${reportId}/messages/${orgId}/${msgId}`).update({
          read: true,
        });
      }
    });

    historyDiv.innerHTML = Object.values(messages)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(
        (msg) => `
        <div style="margin-bottom:8px;">
          <strong>${
            msg.senderRole === "ORG" ? "You" : reportUserEmail
          }:</strong>
          <span>${msg.text}</span>
          <div style="font-size:10px;color:#888;">${formatDate(
            msg.timestamp
          )}</div>
        </div>
      `
      )
      .join("");

    historyDiv.scrollTop = historyDiv.scrollHeight;
  });

  modal.querySelector("#send-message-btn").onclick = function () {
    const input = modal.querySelector("#message-input");
    const text = input.value.trim();
    if (!text) return;
    const user = firebase.auth().currentUser;
    const newMsgRef = db.ref(`reports/${reportId}/messages/${orgId}`).push();

    newMsgRef
      .set({
        messageId: newMsgRef.key,
        senderId: user ? user.uid : "ORG",
        senderRole: "ORG",
        text,
        timestamp: Date.now(),
        read: false,
      })
      .then(() => {
        input.value = "";
        showToast("Message sent");
      });
  };

  modal.addEventListener("remove", () => {
    if (window._pawMessageListener) {
      window._pawMessageListener.off();
      window._pawMessageListener = null;
    }
  });
}
window.showMessageModal = showMessageModal;

// -------- Map button inside the detail modal (delegated) --------
document.addEventListener("click", (e) => {
  if (
    e.target.classList.contains("map-location-btn") ||
    e.target.closest(".map-location-btn")
  ) {
    const modal = document.getElementById("report-modal");
    const lat = parseFloat(modal.getAttribute("data-latitude"));
    const lng = parseFloat(modal.getAttribute("data-longitude"));

    if (isNaN(lat) || isNaN(lng)) {
      alert("Location data is missing or invalid.");
      return;
    }

    document.getElementById("map-modal").classList.add("show");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      if (window.leafletMap) window.leafletMap.remove();
      window.leafletMap = L.map("leaflet-map").setView([lat, lng], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(window.leafletMap);
      L.marker([lat, lng])
        .addTo(window.leafletMap)
        .bindPopup("Report Location")
        .openPopup();
    }, 250);
  }
});

// -------- Page init --------
document.addEventListener("DOMContentLoaded", () => {
  // Start subscription (no card rendering here)
  subscribeReports();

  // Example: total count animation
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

// ======================== end reports.js (updated) ========================
