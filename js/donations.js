// donations.js - Handles donation request data and UI

/**
 * Wait for Firebase auth state and redirect if not authenticated
 * @returns {Promise<firebase.User>}
 */
function checkAuth() {
  return new Promise((resolve, reject) => {
    firebase.auth().onAuthStateChanged(user => {
      if (user) resolve(user);
      else {
        window.location.href = "index.html";
        reject(new Error("Not authenticated"));
      }
    });
  });
}

/**
 * Fetches all donation requests from Firebase
 */
function fetchDonations() {
  const donationContainer = document.getElementById("donation-cards-container");

  // Show loading indicator
  donationContainer.innerHTML = `
    <div class="loading-indicator">
      <i class="fas fa-spinner fa-pulse"></i>
      <p>Loading donation requests...</p>
    </div>
  `;

  checkAuth()
    .then(user => {
      // Optionally filter by org: const orgId = user.uid;
      return firebase.database().ref("donation_requests").once("value");
    })
    .then(snapshot => {
      if (!snapshot.exists()) {
        donationContainer.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-donate fa-3x"></i>
            <p>No donation requests found.</p>
            <p>Click the + button to create your first donation request.</p>
          </div>
        `;
        return;
      }
      displayDonations(snapshot.val());
    })
    .catch(err => {
      console.error("Error fetching donations:", err);
      donationContainer.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-triangle fa-3x"></i>
          <p>Error loading donations: ${err.message}</p>
          <button onclick="fetchDonations()" class="retry-btn">
            <i class="fas fa-redo"></i> Try Again
          </button>
        </div>
      `;
    });
}

/**
 * Displays donation cards in the UI
 * @param {Object} donations - Object containing donation request data
 */
function displayDonations(donations) {
  const container = document.getElementById("donation-cards-container");
  container.innerHTML = "";
  let count = 0;

  // Sort by % complete ascending
  const sorted = Object.entries(donations).sort((a, b) => {
    const [, A] = a, [, B] = b;
    const pctA = A.goalAmount > 0 ? (A.currentAmount||0)/A.goalAmount : 0;
    const pctB = B.goalAmount > 0 ? (B.currentAmount||0)/B.goalAmount : 0;
    return pctA - pctB;
  });

  sorted.forEach(([id, d]) => {
    count++;
    const goal    = d.goalAmount || 0;
    const current = d.currentAmount || 0;
    const rawPct  = goal>0 ? (current/goal)*100 : 0;
    const pct     = Math.min(rawPct, 100);
    const funded  = pct >= 100;
    const details = d.details || "";
    const shortD  = details.length>100 ? details.slice(0,100)+"…" : details;

    // build card
    const card = document.createElement("div");
    card.className = "donation-card";
    card.setAttribute("data-id", id);
    card.innerHTML = `
      <h3>${d.name || "Unnamed Donation"}</h3>
      <p><strong>Purpose:</strong> ${d.purpose || "General"}</p>
      <p>${shortD}</p>
      <div class="progress-wrapper">
        <div class="progress-text">
          <span>₱${current.toLocaleString()}</span>
          <span>₱${goal.toLocaleString()}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%;"></div>
        </div>
        <div class="progress-percent">
          ${pct.toFixed(0)}% ${funded ? "Funded" : "Complete"}
        </div>
      </div>
      <button
        class="donate-btn"
        data-id="${id}"
        ${funded ? "disabled" : ""}
      >
        <i class="fas ${funded ? "fa-check-circle" : "fa-hand-holding-heart"}"></i>
        ${funded ? "Fully Funded" : "Donate Now"}
      </button>
    `;
    container.appendChild(card);
  });

  // Donate button wiring
  container.querySelectorAll(".donate-btn").forEach(btn => {
    if (!btn.disabled) {
      btn.addEventListener("click", ev => {
        ev.stopPropagation();
        const id = btn.getAttribute("data-id");
        window.location.href = `donate.html?donationId=${encodeURIComponent(id)}`;
      });
    }
  });

  // Card click → edit page
  container.querySelectorAll(".donation-card").forEach(card => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-id");
      window.location.href = `editDonation.html?donationId=${encodeURIComponent(id)}`;
    });
  });

  if (count === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-donate fa-3x"></i>
        <p>No donation requests found.</p>
        <p>Click the + button to create your first donation request.</p>
      </div>
    `;
  }
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", fetchDonations);
