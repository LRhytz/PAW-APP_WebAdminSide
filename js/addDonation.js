// js/addDonation.js — Create campaign without any GCash fields

function checkAuth() {
  return new Promise((resolve, reject) => {
    firebase.auth().onAuthStateChanged(user => {
      if (user) resolve(user);
      else { window.location.href = "index.html"; reject(new Error("Not authenticated")); }
    });
  });
}

function showLoading(){ document.getElementById('loadingOverlay').classList.add('active'); }
function hideLoading(){ document.getElementById('loadingOverlay').classList.remove('active'); }

function updateCharCounter(e) {
  const t = e.target, c = document.getElementById('detailsCounter');
  c.textContent = t.value.length;
  c.style.color = t.value.length > 280 ? '#e53935' : '#777';
}

function validateForm() {
  const title     = document.getElementById("title").value.trim();
  const category  = document.getElementById("category").value.trim();
  const goalRaw   = document.getElementById("goal").value;
  const shortDesc = document.getElementById("shortDescription").value.trim();
  const details   = document.getElementById("details").value.trim();

  if (!title || !category || !goalRaw || !shortDesc || !details) {
    alert("Please fill in all required fields."); return false;
  }
  const goalAmount = parseFloat(goalRaw);
  if (isNaN(goalAmount) || goalAmount <= 0) {
    alert("Please enter a valid goal amount greater than ₱0."); return false;
  }
  if (details.length > 300) { alert("Details cannot exceed 300 characters."); return false; }
  return true;
}

async function submitDonation() {
  if (!validateForm()) return;

  try {
    showLoading();

    const title     = document.getElementById("title").value.trim();
    const category  = document.getElementById("category").value.trim();
    const coverUrl  = document.getElementById("coverUrl").value.trim();
    const shortDesc = document.getElementById("shortDescription").value.trim();
    const details   = document.getElementById("details").value.trim();
    const goalAmount= parseFloat(document.getElementById("goal").value);

    const user   = firebase.auth().currentUser;
    const userId = user.uid;

    const db  = firebase.database();
    const ref = db.ref("donationCampaigns").push();
    const id  = ref.key;
    const now = Date.now();

    const campaign = {
      id,
      orgId: userId,
      category,
      coverUrl: coverUrl || "",
      description: details,
      shortDescription: shortDesc,
      goalAmount: goalAmount,
      createdAt: now,
      updatedAt: now,
      status: "Active",
      stats: {
        title,
        amountRaised: 0,
        percent: 0,
        status: "Active",
        updatedAt: now
      }
    };

    const updates = {};
    updates[`donationCampaigns/${id}`] = campaign;
    updates[`campaignsByOrg/${userId}/${id}`] = true;
    updates[`campaignsByCategory/${category}/${id}`] = true;

    await db.ref().update(updates);

    hideLoading();
    alert("Donation campaign created successfully!");
    window.location.href = "donation.html";
  } catch (e) {
    hideLoading();
    console.error("Error adding donation:", e);
    alert("Error: " + e.message);
  }
}

function cancelForm() {
  if (confirm("Cancel and discard fields?")) window.location.href = "donation.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  try { await checkAuth(); } catch { return; }
  document.getElementById("submitDonation").addEventListener("click", submitDonation);
  document.getElementById("cancelBtn").addEventListener("click", cancelForm);
  document.getElementById("details").addEventListener("input", updateCharCounter);

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    firebase.auth().signOut().then(() => (window.location.href = "index.html"));
  });
});
