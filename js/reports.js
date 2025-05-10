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
function fetchReports(filterStatus = "ALL") {
  const db = firebase.database();
  const reportsContainer = document.getElementById("reports-container");

  // Fetch reports from the "reports" node
  db.ref("reports").on("value", (snapshot) => {
    reportsContainer.innerHTML = ""; // Clear the container
    const reports = snapshot.val();

    if (reports) {
      // Get filtered report IDs
      let filteredReportIds = Object.keys(reports).filter((key) => {
        const report = reports[key];
        return filterStatus === "ALL" || report.status === filterStatus;
      });

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

        // Create a card for each report
        const card = document.createElement("div");
        card.className = "card report-card";
        card.setAttribute("data-aos", "fade-up");
        card.setAttribute("data-report-id", key); // Store the report ID in the card
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
            <span>${report.reportType || "Unknown Report Type"}</span>
          </div>
          <div class="card-body">
            <p class="report-description">${
              report.reportDescription || "No description provided."
            }</p>
            
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
                    ${
                      report.latitude && report.longitude
                        ? `Lat: ${parseFloat(report.latitude).toFixed(
                            4
                          )}, Long: ${parseFloat(report.longitude).toFixed(4)}`
                        : "Not specified"
                    }
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
              <button class="btn" title="Edit Report">
                <i class="fas fa-edit"></i>
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
  db.ref(`reports/${reportId}`)
    .update({
      status: "ACCEPTED",
      resolvedAt: Date.now(),
      resolvedBy: firebase.auth().currentUser?.email || "Unknown",
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
  db.ref(`reports/${reportId}`)
    .update({
      status: "REJECTED",
      rejectedAt: Date.now(),
      rejectedBy: firebase.auth().currentUser?.email || "Unknown",
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

// Add event listeners when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
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

// Function to show modal with report details
function showReportModal(report) {
  const modal = document.getElementById("report-modal");

  // Populate modal content
  modal.querySelector(".modal-report-type").textContent =
    report.reportType || "Unknown Report Type";
  modal.querySelector(".report-description").textContent =
    report.reportDescription || "No description provided.";

  // Set status
  const statusElement = modal.querySelector(".modal-report-status");
  statusElement.innerHTML = `
    <span class="status-badge ${getStatusBadgeClass(report.status)}">
      ${report.status || "Pending"}
    </span>`;

  // Set location
  const locationValue = modal.querySelector(".modal-report-location");
  locationValue.textContent =
    report.latitude && report.longitude
      ? `Lat: ${parseFloat(report.latitude).toFixed(4)}, Long: ${parseFloat(
          report.longitude
        ).toFixed(4)}`
      : "Not specified";

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

  // Handle video
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

  // Set the report ID in the modal for reference
  modal.setAttribute("data-report-id", report.reportId);

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
        const reportType =
          reportCard.querySelector(".card-header span").textContent;

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
      } else if (button.title === "Edit Report") {
        console.log("Edit report clicked");
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
    fetchReports(selectedStatus);
  });
});
