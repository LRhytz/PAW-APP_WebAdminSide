document.addEventListener("DOMContentLoaded", async () => {
  // =========================================================
  // 🧩 SAFE FIREBASE INITIALIZATION
  // =========================================================
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase initialized");
  } else {
    console.log("⚠️ Firebase already initialized, reusing instance.");
  }

  const db = firebase.database();
  const campaignList = document.getElementById("campaignList");
  const donorModal = document.getElementById("donorModal");
  const donorList = document.getElementById("donorList");
  const donorModalTitle = document.getElementById("donorModalTitle");
  const closeDonorModal = document.getElementById("closeDonorModal");

  // =========================================================
  // 🎯 LOAD DONATION CAMPAIGNS
  // =========================================================
  db.ref("donationCampaigns").on("value", (snapshot) => {
    campaignList.innerHTML = "";

    if (!snapshot.exists()) {
      campaignList.innerHTML = "<p>No donation campaigns found.</p>";
      return;
    }

    snapshot.forEach((snap) => {
      const c = snap.val();
      const stats = c.stats || {};
      const raised = stats.amountRaised || c.currentAmount || 0;
      const goal = c.goalAmount || 0;
      const percent = goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;

      const card = document.createElement("div");
      card.className = "campaign-card";
      card.innerHTML = `
        <img src="${c.coverUrl || 'images/default_campaign.jpg'}" alt="${c.title}" class="campaign-cover">
        <div class="campaign-info">
          <h3>${c.title || "Untitled Campaign"}</h3>
          <p>${c.description || "No description available."}</p>
          <div class="progress-container">
            <div class="progress-bar" style="width:${percent}%"></div>
          </div>
          <p class="progress-text">₱${raised.toLocaleString()} / ₱${goal.toLocaleString()}</p>
          <button class="view-donors-btn" data-id="${snap.key}" data-title="${c.title || "Campaign"}">👥 View Donors</button>
        </div>
      `;
      campaignList.appendChild(card);
    });

    // Attach donor view listeners
    document.querySelectorAll(".view-donors-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const campaignId = e.target.dataset.id;
        const campaignTitle = e.target.dataset.title;
        openDonorModal(campaignId, campaignTitle);
      });
    });
  });

// =========================================================
  // 💰 VIEW DONORS (using donationsByUser)
  // =========================================================
  async function openDonorModal(campaignId, campaignTitle) {
    donorModalTitle.textContent = campaignTitle || "Donor List";
    donorList.innerHTML = "<li>Loading donors...</li>";
    donorModal.classList.add("show");

    try {
      // Read all donations from donationsByUser
      const donationsSnap = await db.ref("donationsByUser").once("value");

      console.log("📊 Donations snapshot exists:", donationsSnap.exists());
      console.log("📊 Looking for campaign ID:", campaignId);

      if (!donationsSnap.exists()) {
        donorList.innerHTML = "<li>No donors yet.</li>";
        return;
      }

      donorList.innerHTML = "";
      const donations = [];

      // Loop through all users and their donations
      donationsSnap.forEach((userSnap) => {
        userSnap.forEach((donationSnap) => {
          const donation = donationSnap.val();
          
          // Filter by campaign ID
          if (donation.campaignId === campaignId) {
            console.log("💰 Found donation:", donation);
            donations.push(donation);
          }
        });
      });

      if (donations.length === 0) {
        donorList.innerHTML = "<li>No donors yet.</li>";
        return;
      }

      // Sort by date (newest first)
      donations.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      console.log(`✅ Found ${donations.length} donation(s) for this campaign`);

      // Render all donors
      const donorPromises = donations.map(donation => renderDonorItem(donation));
      const donorItems = await Promise.all(donorPromises);
      
      donorItems.forEach((li) => donorList.appendChild(li));

    } catch (err) {
      console.error("❌ Error loading donors:", err);
      donorList.innerHTML = `<li>Error: ${err.message}</li>`;
    }
  }
  // =========================================================
// 🧠 RENDER DONOR ITEM (look up fullName from /users)
// =========================================================
async function renderDonorItem(donation) {
  const li = document.createElement("li");
  const amount = donation.amount || 0;
  const date = donation.createdAt
    ? new Date(donation.createdAt).toLocaleDateString()
    : "—";

  // Handle anonymous donations
  if (donation.anonymous) {
    li.innerHTML = `
      <strong>Anonymous Donor</strong> — ₱${amount.toLocaleString()}
      <br><small>${date}</small>
    `;
    return li;
  }

  try {
    // 🔍 Look up donor name from users node using userId
    const userSnap = await db.ref(`users/${donation.userId}`).once("value");
    const userData = userSnap.val() || {};
    const name =
      userData.fullName ||
      userData.name ||
      userData.displayName ||
      userData.username ||
      "Unknown Donor";

    li.innerHTML = `
      <strong>${name}</strong> — ₱${amount.toLocaleString()}
      <br><small>${date}</small>
    `;
    return li;
  } catch (error) {
    console.error("Error getting user info:", error);
    li.innerHTML = `
      <strong>${donation.userId || "Unknown Donor"}</strong> — ₱${amount.toLocaleString()}
      <br><small>${date}</small>
    `;
    return li;
  }
}


  // =========================================================
  // ❌ MODAL CLOSE HANDLERS
  // =========================================================
  closeDonorModal.addEventListener("click", () => donorModal.classList.remove("show"));
  donorModal.addEventListener("click", (e) => {
    if (e.target === donorModal) donorModal.classList.remove("show");
  });
});
