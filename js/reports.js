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

// Get appropriate status badge class
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

// Get appropriate severity class
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

// Map severity strings to a numeric priority: lower = more urgent
function severityPriority(severity) {
  switch (severity?.toLowerCase()) {
    case "critical":
      return 1;
    case "high":
      return 2;
    case "medium":
      return 3;
    case "low":
      return 4;
    default:
      return 5; // Unknown severity
  }
}

// Format date from timestamp if available
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
    return timestamp;
  }
}

// Fetch and display reports with optional status filtering
// Modified fetchReports function to properly sort by severity
function fetchReports(filterStatus = "ALL", filterSeverity = "ALL") {
  const db = firebase.database();
  const reportsContainer = document.getElementById("reports-container");
  const orgId = firebase.auth().currentUser?.uid;

  db.ref("reports").on("value", (snapshot) => {
    reportsContainer.innerHTML = "";
    const reports = snapshot.val();

    const visibleReports = Object.entries(reports).filter(([id, report]) => {
      return !report.organizationId || report.organizationId === orgId;
    });

    if (reports) {
      const searchQuery = document
        .getElementById("report-search")
        ?.value.toLowerCase()
        .trim();

      let filteredReportIds = visibleReports
        .filter(([key, report]) => {
          const statusMatch =
            filterStatus === "ALL" || report.status === filterStatus;
          const severityMatch =
            filterSeverity === "ALL" ||
            (report.severity &&
              report.severity.toLowerCase() === filterSeverity.toLowerCase());

          const keywords = searchQuery ? searchQuery.split(/\s+/) : [];
          const searchableText = [
            report.reportType,
            report.reportDescription,
            report.reportUserEmail,
            report.status,
            report.severity,
          ]
            .join(" ")
            .toLowerCase();

          const searchMatch = keywords.every((kw) =>
            searchableText.includes(kw)
          );
          return statusMatch && severityMatch && searchMatch;
        })
        .map(([key]) => key);

      if (filteredReportIds.length === 0) {
        reportsContainer.innerHTML =
          '<p class="no-reports"><i class="fas fa-folder-open"></i> No reports found for the selected status.</p>';
        return;
      }

      // Sort reports by severity priority (critical first, then high, medium, low)
      filteredReportIds.sort((a, b) => {
        const reportA = reports[a];
        const reportB = reports[b];
        // Lower number = higher priority
        return (
          severityPriority(reportA.severity) -
          severityPriority(reportB.severity)
        );
      });

      // Create and append report cards
      filteredReportIds.forEach((key) => {
        const report = reports[key];
        const statusClass = getStatusBadgeClass(report.status);
        const severityClass = getSeverityClass(report.severity);
        const reportDate = formatDate(report.timestamp || report.date);

        // --- Count unread messages ---
        let unreadCount = 0;
        if (report.messages) {
          unreadCount = Object.values(report.messages).filter(
            (msg) => msg.senderRole !== "ORG" && !msg.read
          ).length;
        }

        // Create a card for each report
        const card = document.createElement("div");
        card.className = "card report-card";
        card.setAttribute("data-aos", "fade-up");
        card.setAttribute("data-report-id", key); // Store the report ID in the card
        card.setAttribute("data-report-type", report.reportType || "Unknown");
        card.setAttribute("data-latitude", report.latitude || "");
        card.setAttribute("data-longitude", report.longitude || "");
        card.setAttribute("data-email", report.reportUserEmail || "");
        card.setAttribute("data-severity", report.severity || "unknown"); // Add severity attribute for easier sorting
        card.setAttribute(
          "data-image-urls",
          JSON.stringify(report.imageUrls || [])
        );
        card.setAttribute("data-video-url", report.videoUrl || "");

        // Populate the card with report details
        card.innerHTML = `
          <div class="card-header">
            <div class="doc-icon">
              <div class="doc-icon-inner">
                <div class="doc-icon-bg"></div>
                <i class="fas fa-file-alt"></i>
              </div>
            </div>
           <span>${key}</span>
          </div>
          <div class="card-body">
            <p class="report-description">${
              report.reportDescription || "No description provided."
            }</p>
            <div class="report-type"><strong>Report Type:</strong> ${
              report.reportType || "Unknown"
            }</div>
            <div class="report-metadata">
              <div class="metadata-item">
                <i class="fas fa-tag"></i>
                <div class="metadata-content">
                  <div class="metadata-label">Status</div>
                  <div class="metadata-value">
                    <span class="status-badge ${statusClass}">
                      ${report.status || "Pending"}
                    </span>
                  </div>
                </div>
              </div>
              
              <div class="metadata-item">
                <i class="fas fa-map-marker-alt"></i>
                <div class="metadata-content">
                  <div class="metadata-label">Location</div>
                  <div class="metadata-value">
                    ${report.address || "unknown"}
                  </div>
                </div>
              </div>
              
              <div class="metadata-item">
                <i class="fas fa-user"></i>
                <div class="metadata-content">
                  <div class="metadata-label">Reported By</div>
                  <div class="metadata-value">${
                    report.reportUserEmail || "Anonymous"
                  }</div>
                </div>
              </div>

              <div class="metadata-item">
                <i class="fas fa-exclamation-circle"></i>
                <div class="metadata-content">
                  <div class="metadata-label">Severity</div>
                  <div class="metadata-value ${severityClass}">
                    ${report.severity || "Unknown"}
                  </div>
                </div>
              </div>
            </div>
            
            ${
              report.imageUrls && report.imageUrls.length > 0
                ? `<div class="report-images-container">
                    <button class="toggle-images-btn">Show Images</button>
                    <div class="report-images hidden">
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
                      </div>
                    </div>
                  </div>`
                : ""
            }
            
            ${
              report.videoUrl
                ? `<div class="report-video">
                    <a href="${report.videoUrl}" target="_blank">
                      <i class="fas fa-video"></i> View Attached Video
                    </a>
                  </div>`
                : `<div class="report-video">
                    <p class="no-video"><i class="fas fa-video-slash"></i> No attached video</p>
                  </div>`
            }
          </div>
          
          <div class="card-footer">
            <div class="report-date">
              <i class="far fa-clock"></i> ${reportDate}
            </div>
            <div class="action-buttons">
              <button class="btn" title="View Details">
                <i class="fas fa-eye"></i>
              </button>
              <button class="btn" title="Message">
                <i class="fas fa-comment-dots"></i>
                ${
                  unreadCount > 0
                    ? `<span class="unread-badge">${unreadCount}</span>`
                    : ""
                }
              </button>
            </div>
          </div>
        `;

        reportsContainer.appendChild(card);
      });

      // Add event listeners for toggling images
      document.querySelectorAll(".toggle-images-btn").forEach((button) => {
        button.addEventListener("click", (e) => {
          const imagesContainer = e.target.nextElementSibling;
          if (imagesContainer.classList.contains("hidden")) {
            imagesContainer.classList.remove("hidden");
            e.target.textContent = "Hide Images";
          } else {
            imagesContainer.classList.add("hidden");
            e.target.textContent = "Show Images";
          }
        });
      });
    } else {
      reportsContainer.innerHTML =
        '<p class="no-reports"><i class="fas fa-folder-open"></i> No reports available.</p>';
    }
  });
}

// Function to handle report acceptance
function acceptReport(reportId) {
  if (!reportId) return;

  const db = firebase.database();
  const orgId = firebase.auth().currentUser?.uid || "Unknown";
  db.ref(`reports/${reportId}`)
    .update({
      status: "ACCEPTED",
      resolvedAt: Date.now(),
      resolvedBy: firebase.auth().currentUser?.email || "Unknown",
      organizationId: orgId,
    })
    .then(() => {
      showToast("Report accepted successfully");
      closeModal();
    })
    .catch((error) => {
      console.error("Error accepting report:", error);
      showToast("Error accepting report", "error");
    });
}

// Function to handle report rejection
function rejectReport(reportId) {
  if (!reportId) return;

  const db = firebase.database();
  const orgId = firebase.auth().currentUser?.uid || "Unknown";
  db.ref(`reports/${reportId}`)
    .update({
      status: "REJECTED",
      rejectedAt: Date.now(),
      rejectedBy: firebase.auth().currentUser?.email || "Unknown",
      organizationId: orgId,
    })
    .then(() => {
      showToast("Report rejected");
      closeModal();
    })
    .catch((error) => {
      console.error("Error rejecting report:", error);
      showToast("Error rejecting report", "error");
    });
}

// Add this helper function:
function updateReportStatus(reportId, newStatus) {
  if (!reportId) return;
  const db = firebase.database();
  const orgId = firebase.auth().currentUser?.uid || "Unknown";
  db.ref(`reports/${reportId}`)
    .update({
      status: newStatus,
      updatedAt: Date.now(),
      updatedBy: firebase.auth().currentUser?.email || "Unknown",
      organizationId: orgId,
    })
    .then(() => {
      showToast(`Report status updated to ${newStatus}`);
      closeModal();
    })
    .catch((error) => {
      console.error("Error updating report status:", error);
      showToast("Error updating report status", "error");
    });
}

// Add event listeners when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
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
      if (window.leafletMap) {
        window.leafletMap.remove();
      }
      window.leafletMap = L.map("leaflet-map").setView([lat, lng], 14);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(window.leafletMap);

      L.marker([lat, lng])
        .addTo(window.leafletMap)
        .bindPopup("Report Location")
        .openPopup();
    }, 250);
  }

  // Close button event listener
  document.querySelector(".modal-close").addEventListener("click", closeModal);

  // Accept button event listener
  document.querySelector(".btn-accept").addEventListener("click", () => {
    const reportId = document
      .getElementById("report-modal")
      .getAttribute("data-report-id");
    acceptReport(reportId);
  });

  // Reject button event listener
  document.querySelector(".btn-reject").addEventListener("click", () => {
    const reportId = document
      .getElementById("report-modal")
      .getAttribute("data-report-id");
    rejectReport(reportId);
  });

  // Close modal when clicking outside of it
  document.getElementById("report-modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("report-modal")) {
      closeModal();
    }
  });
});

document.getElementById("report-search").addEventListener("input", () => {
  const status = document.getElementById("status-filter").value;
  const severity = document.getElementById("severity-filter").value;
  fetchReports(status, severity);
});

// Function to show modal with report details
function showReportModal(report) {
  const modal = document.getElementById("report-modal");
  modal.querySelector(".modal-report-type-value").textContent =
    report.reportType || "Unknown";
  modal.setAttribute("data-latitude", report.latitude || "");
  modal.setAttribute("data-longitude", report.longitude || "");

  // Populate modal content
  modal.querySelector(".report-description").textContent =
    report.reportDescription || "No description provided.";

  // Set status
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
    locationValue.textContent = "Not specified";
  }

  // Set reporter email
  modal.querySelector(".modal-report-email").textContent =
    report.reportUserEmail || "Anonymous";

  // Set severity
  const severityElement = modal.querySelector(".modal-report-severity");
  severityElement.innerHTML = `
    <span class="${getSeverityClass(report.severity)}">
      ${report.severity || "Unknown"}
    </span>`;

  // Handle images
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
    videoContainer.innerHTML = `
      <p class="no-video"><i class="fas fa-video-slash"></i> No attached video</p>`;
  }

  modal.setAttribute("data-report-id", report.reportId);

  const footer = modal.querySelector(".modal-footer .action-buttons");
  footer.innerHTML = "";

  if ((report.status || "").toUpperCase() === "ACCEPTED") {
    const statuses = [
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
    ];
    statuses.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = `btn ${s.class}`;
      btn.innerHTML = `<i class="fas ${s.icon}"></i><span>${s.label}</span>`;
      btn.onclick = () => updateReportStatus(report.reportId, s.value);
      footer.appendChild(btn);
    });
  } else {
    // Show Accept and Reject buttons
    const acceptBtn = document.createElement("button");
    acceptBtn.className = "btn-accept";
    acceptBtn.textContent = "Accept";
    acceptBtn.onclick = () => acceptReport(report.reportId);

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "btn-reject";
    rejectBtn.textContent = "Reject";
    rejectBtn.onclick = () => rejectReport(report.reportId);

    footer.appendChild(rejectBtn);
    footer.appendChild(acceptBtn);
  }

  // Show modal
  modal.classList.add("show");
  document.body.style.overflow = "hidden"; // Prevent scrolling when modal is open
}

// Function to close the modal
function closeModal() {
  const modal = document.getElementById("report-modal");
  modal.classList.remove("show");
  document.body.style.overflow = ""; // Restore scrolling
}

// Show toast notification
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Show toast
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  // Hide and remove toast
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

// Initialize the reports page
document.addEventListener("DOMContentLoaded", () => {
  fetchReports();

  document.getElementById("open-map-btn").addEventListener("click", () => {
    const modal = document.getElementById("report-modal");
    const lat = parseFloat(modal.getAttribute("data-latitude"));
    const lng = parseFloat(modal.getAttribute("data-longitude"));

    if (isNaN(lat) || isNaN(lng)) {
      alert("Invalid coordinates for this report.");
      return;
    }

    document.getElementById("map-modal").classList.add("show");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      // Remove old map if exists
      if (window.leafletMap) {
        window.leafletMap.remove();
      }

      // Create map
      window.leafletMap = L.map("leaflet-map").setView([lat, lng], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(window.leafletMap);
      L.marker([lat, lng]).addTo(window.leafletMap);
    }, 300);
  });

  // Create modal if it doesn't exist
  if (!document.getElementById("report-modal")) {
    const modalHtml = `
        <div id="report-modal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3 id="modal-report-title">Report Details</h3>
              <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
              <p class="report-description"></p>
              <p class="report-status"></p>
              <p class="report-location"></p>
              <p class="report-severity"></p>
              <p class="report-email"></p>
              <p class="report-id"></p>
            </div>
            <div class="modal-footer">
              <button id="reject-btn" class="btn-reject">Reject</button>
              <button id="accept-btn" class="btn-accept">Accept</button>
            </div>
          </div>
        </div>
      `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    // Add event listeners for modal buttons
    document.getElementById("accept-btn").addEventListener("click", () => {
      const reportId = document
        .getElementById("report-modal")
        .getAttribute("data-report-id");
      acceptReport(reportId);
    });

    document.getElementById("reject-btn").addEventListener("click", () => {
      const reportId = document
        .getElementById("report-modal")
        .getAttribute("data-report-id");
      rejectReport(reportId);
    });

    // Close modal when clicking outside
    document.getElementById("report-modal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("report-modal")) {
        closeModal();
      }
    });
  }

  // Example: Animate total reports count (if needed)
  const db = firebase.database();
  db.ref("reports")
    .once("value")
    .then((snapshot) => {
      const reports = snapshot.val();
      const totalReports = reports ? Object.keys(reports).length : 0;
      animateNumber("totalReports", totalReports);
    });

  if (window.AOS) AOS.init({ duration: 600, once: true });

  // Add click handlers for buttons and document icon
  document.addEventListener("click", (e) => {
    // Handle button clicks
    if (
      e.target.classList.contains("btn") ||
      e.target.parentElement.classList.contains("btn")
    ) {
      const button = e.target.classList.contains("btn")
        ? e.target
        : e.target.parentElement;

      if (button.title === "View Details") {
        // Get the report card and report ID
        const reportCard = button.closest(".report-card");
        const reportId = reportCard.getAttribute("data-report-id");
        const reportType = reportCard.getAttribute("data-report-type");

        const report = {
          reportType: reportType,
          reportDescription: reportCard.querySelector(".report-description")
            .textContent,
          status: reportCard.querySelector(".status-badge").textContent.trim(),
          latitude: reportCard.getAttribute("data-latitude"),
          longitude: reportCard.getAttribute("data-longitude"),
          severity: reportCard
            .querySelector('[class*="severity-"]')
            .textContent.trim(),
          reportUserEmail: reportCard.getAttribute("data-email"),
          reportId: reportId,
          imageUrls: JSON.parse(
            reportCard.getAttribute("data-image-urls") || "[]"
          ),
          videoUrl: reportCard.getAttribute("data-video-url") || null,
        };

        showReportModal(report);
      } else if (button.title === "Message") {
        const reportCard = button.closest(".report-card");
        const reportUserEmail = reportCard.getAttribute("data-email");
        const reportId = reportCard.getAttribute("data-report-id");
        showMessageModal(reportId, reportUserEmail);
      }
    }

    // Handle document icon clicks
    const docIcon = e.target.closest(".doc-icon");
    if (docIcon) {
      const reportCard = docIcon.closest(".report-card");
      if (reportCard) {
        const reportId = reportCard.getAttribute("data-report-id");

        const report = {
          reportType: reportCard.querySelector(".card-header span").textContent,
          reportDescription: reportCard.querySelector(".report-description")
            .textContent,
          status: reportCard.querySelector(".status-badge").textContent.trim(),
          latitude: reportCard.getAttribute("data-latitude"),
          longitude: reportCard.getAttribute("data-longitude"),
          severity: reportCard
            .querySelector('[class*="severity-"]')
            .textContent.trim(),
          reportUserEmail: reportCard.getAttribute("data-email"),
          reportId: reportId,
          imageUrls: JSON.parse(
            reportCard.getAttribute("data-image-urls") || "[]"
          ),
          videoUrl: reportCard.getAttribute("data-video-url") || null,
        };

        showReportModal(report);
      }
    }
  });

  // Add event listener for the status filter dropdown
  document.getElementById("status-filter").addEventListener("change", (e) => {
    const selectedStatus = e.target.value;
    const selectedSeverity = document.getElementById("severity-filter").value;
    fetchReports(selectedStatus, selectedSeverity);
  });

  document.getElementById("severity-filter").addEventListener("change", (e) => {
    const selectedSeverity = e.target.value;
    const selectedStatus = document.getElementById("status-filter").value;
    fetchReports(selectedStatus, selectedSeverity);
  });
});

// --- Message Modal HTML ---
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
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // Close modal on background click
  document.getElementById("message-modal").addEventListener("click", (e) => {
    if (e.target.id === "message-modal") closeMessageModal();
  });

  // Close modal on close button click
  document
    .getElementById("message-modal-close-btn")
    .addEventListener("click", closeMessageModal);
}

// Make sure this is globally accessible
function closeMessageModal() {
  const modal = document.getElementById("message-modal");
  if (modal) {
    modal.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(() => {
      // Dispatch remove event for cleanup
      modal.dispatchEvent(new Event("remove"));
      modal.remove();
    }, 200); // Remove from DOM after animation (if any)
  }
}
window.closeMessageModal = closeMessageModal;

// --- Show Message Modal and Load Messages ---
function showMessageModal(reportId, reportUserEmail) {
  createMessageModal();
  const modal = document.getElementById("message-modal");
  modal.classList.add("show");
  document.body.style.overflow = "hidden";
  modal.setAttribute("data-report-id", reportId);

  // Load report meta (reporter and severity)
  const db = firebase.database();
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
        </div>
      `;
    } else {
      metaDiv.innerHTML = "";
    }
  });

  // --- Real-time message history ---
  const historyDiv = modal.querySelector("#message-history");
  historyDiv.innerHTML = "<em>Loading...</em>";

  // Remove any previous listener to avoid duplicates
  if (window._pawMessageListener) {
    window._pawMessageListener.off();
    window._pawMessageListener = null;
  }
  const messagesRef = db
    .ref(`reports/${reportId}/messages`)
    .orderByChild("timestamp");
  window._pawMessageListener = messagesRef;
  messagesRef.on("value", (snapshot) => {
    const messages = snapshot.val();
    if (!messages) {
      historyDiv.innerHTML = "<em>No messages yet.</em>";
      return;
    }
    // Mark all unread messages as read (ORG side)
    Object.entries(messages).forEach(([msgId, msg]) => {
      if (msg.senderRole !== "ORG" && !msg.read) {
        db.ref(`reports/${reportId}/messages/${msgId}`).update({ read: true });
      }
    });

    historyDiv.innerHTML = Object.values(messages)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(
        (msg) => `
    <div style="margin-bottom:8px;">
      <strong>${msg.senderRole === "ORG" ? "You" : reportUserEmail}:</strong>
      <span>${msg.text}</span>
      <div style="font-size:10px;color:#888;">${formatDate(msg.timestamp)}</div>
    </div>
  `
      )
      .join("");
    historyDiv.scrollTop = historyDiv.scrollHeight;
  });

  // Send message handler
  modal.querySelector("#send-message-btn").onclick = function () {
    const input = modal.querySelector("#message-input");
    const text = input.value.trim();
    if (!text) return;
    const user = firebase.auth().currentUser;
    const newMsgRef = db.ref(`reports/${reportId}/messages`).push();
    newMsgRef
      .set({
        messageId: newMsgRef.key,
        senderId: user ? user.uid : "ORG",
        senderRole: "ORG",
        text: text,
        timestamp: Date.now(),
      })
      .then(() => {
        input.value = "";
        showToast("Message sent");
        // No need to reload modal, real-time listener will update messages
      });
  };

  // Allow sending message with Enter key (but not Shift+Enter for new line)
  modal
    .querySelector("#message-input")
    .addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        modal.querySelector("#send-message-btn").click();
      }
    });

  // Clean up listener when modal is closed
  modal.addEventListener("remove", () => {
    if (window._pawMessageListener) {
      window._pawMessageListener.off();
      window._pawMessageListener = null;
    }
  });
}
