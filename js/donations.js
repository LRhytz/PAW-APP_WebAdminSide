// donations.js - Handles donation campaigns list & UI (Donate removed, bigger cards)

const db = firebase.database();
const auth = firebase.auth();

/** Wait until signed in (redirects to login if not) */
function requireAuth() {
  return new Promise((resolve, reject) => {
    auth.onAuthStateChanged(user => {
      if (user) resolve(user);
      else {
        window.location.href = "index.html";
        reject(new Error("Not authenticated"));
      }
    });
  });
}

/** Currency helper (₱) */
function peso(n = 0) {
  try { return `₱${Number(n).toLocaleString()}`; }
  catch { return `₱${n}`; }
}

/** Main loader */
async function fetchDonations() {
  const container = document.getElementById("donation-cards-container");
  container.innerHTML = `
    <div class="loading-indicator">
      <i class="fas fa-spinner fa-pulse"></i>
      <p>Loading donation campaigns...</p>
    </div>
  `;

  try {
    const user = await requireAuth();

    // Check role
    const roleSnap = await db.ref(`users/${user.uid}/role`).once("value");
    const role = roleSnap.val();

    let idsToLoad = null;

    // If organization, load ONLY their campaigns via index
    if (role === "organization") {
      const idxSnap = await db.ref(`campaignsByOrg/${user.uid}`).once("value");
      if (idxSnap.exists()) {
        idsToLoad = Object.keys(idxSnap.val());
      }
    }

    let campaigns = {};

    if (Array.isArray(idsToLoad) && idsToLoad.length) {
      // Batch fetch only needed campaign nodes
      await Promise.all(
        idsToLoad.map(async (id) => {
          const snap = await db.ref(`donationCampaigns/${id}`).once("value");
          if (snap.exists()) campaigns[id] = snap.val();
        })
      );
    } else {
      // Non-org users (or no index found): read all (rules allow .read: auth != null)
      const allSnap = await db.ref("donationCampaigns").once("value");
      campaigns = allSnap.val() || {};
      // If org but no index, still filter by orgId client-side
      if (role === "organization") {
        campaigns = Object.fromEntries(
          Object.entries(campaigns).filter(([, c]) => c?.orgId === user.uid)
        );
      }
    }

    renderCampaignCards(campaigns);
  } catch (err) {
    console.error("Error fetching donations:", err);
    container.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle fa-3x"></i>
        <p>Error loading campaigns: ${err.message}</p>
        <button onclick="fetchDonations()" class="retry-btn">
          <i class="fas fa-redo"></i> Try Again
        </button>
      </div>
    `;
  }
}

/** Render campaign cards */
function renderCampaignCards(campaigns) {
  const container = document.getElementById("donation-cards-container");
  container.innerHTML = "";

  if (!campaigns || Object.keys(campaigns).length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-donate fa-3x"></i>
        <p>No donation campaigns found.</p>
        <p>Click the + button to create your first campaign.</p>
      </div>
    `;
    return;
  }

  // Sort by most recent update (or createdAt)
  const items = Object.entries(campaigns).sort(([, a], [, b]) => {
    const ta = a.updatedAt || a.createdAt || 0;
    const tb = b.updatedAt || b.createdAt || 0;
    return tb - ta;
  });

  items.forEach(([id, c]) => {
    const title   = c.title || "Untitled Campaign";
    const cat     = c.category || "General";
    const goal    = Number(c.goalAmount || 0);
    const raised  = Number(c.stats?.amountRaised ?? 0);
    const percent = c.stats?.percent != null
      ? Math.max(0, Math.min(100, Number(c.stats.percent)))
      : (goal > 0 ? Math.max(0, Math.min(100, (raised / goal) * 100)) : 0);

    const status  = c.status || c.stats?.status || "Active";
    const cover   = c.coverUrl || "";
    const desc    = c.description || c.shortDescription || "";
    const shortD  = desc.length > 150 ? `${desc.slice(0, 150)}…` : desc;
    const funded  = percent >= 100;

    const card = document.createElement("div");
    card.className = "donation-card"; // larger styles are in base CSS now
    card.setAttribute("data-id", id);
    card.innerHTML = `
      <div class="donation-card__media">
        ${cover ? `<img src="${cover}" alt="${title} cover">` : `
          <div class="donation-card__placeholder"><i class="fas fa-image"></i></div>`}
        <span class="donation-card__badge">${cat}</span>
      </div>

      <div class="donation-card__body">
        <h3 class="donation-card__title">${title}</h3>
        <div class="donation-card__status ${status.toLowerCase()}">${status}</div>
        <p class="donation-card__desc">${shortD || "No description provided."}</p>

        <div class="progress-wrapper">
          <div class="progress-text">
            <span>${peso(raised)}</span>
            <span>${peso(goal)}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${percent.toFixed(0)}%;"></div>
          </div>
          <div class="progress-percent">${percent.toFixed(0)}% ${funded ? "Funded" : "Complete"}</div>
        </div>

        <div class="donation-card__actions">
          <!-- Donate button intentionally removed -->
          <button class="edit-btn" data-id="${id}">
            <i class="fas fa-edit"></i> Edit
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Wire edit button and card click
  container.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      window.location.href = `editDonation.html?donationId=${encodeURIComponent(id)}`;
    });
  });

  container.querySelectorAll(".donation-card").forEach(card => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-id");
      window.location.href = `editDonation.html?donationId=${encodeURIComponent(id)}`;
    });
  });
}

// Init
document.addEventListener("DOMContentLoaded", fetchDonations);
