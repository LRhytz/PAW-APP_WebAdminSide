// js/addDonation.js — Create campaign with image upload + fund breakdown (dynamic)

/* ---------- Auth helpers ---------- */
function checkAuth() {
  return new Promise((resolve, reject) => {
    firebase.auth().onAuthStateChanged(user => {
      if (user) resolve(user);
      else { window.location.href = "index.html"; reject(new Error("Not authenticated")); }
    });
  });
}

/* ---------- UI helpers ---------- */
function showLoading(){ document.getElementById('loadingOverlay').classList.add('active'); }
function hideLoading(){ document.getElementById('loadingOverlay').classList.remove('active'); }
function toast(msg){ alert(msg); } // lightweight inline alert; swap to nicer toast if you want

/* ---------- Char counter ---------- */
function updateCharCounter(e) {
  const t = e.target, c = document.getElementById('detailsCounter');
  c.textContent = t.value.length;
  c.style.color = t.value.length > 2000 ? '#e53935' : '#777';
}

/* ---------- Breakdown rows ---------- */
const breakdownListEl = document.getElementById("breakdownList");

function makeBreakdownRow(initial = {}) {
  const row = document.createElement("div");
  row.className = "breakdown-row";

  row.innerHTML = `
    <div class="bd-col">
      <label>Item</label>
      <input type="text" class="bd-label" placeholder="e.g., Vet bills" maxlength="100" value="${initial.label || ""}">
    </div>
    <div class="bd-col amount">
      <label>Amount</label>
      <div class="input-with-icon">
        <span class="prefix-icon">₱</span>
        <input type="number" class="bd-amount" placeholder="0.00" min="0" step="0.01" value="${initial.amount != null ? Number(initial.amount) : ""}">
      </div>
    </div>
    <div class="bd-actions">
      <button type="button" title="Remove" class="bd-remove">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;

  row.querySelector(".bd-remove").addEventListener("click", () => {
    row.remove();
    if (breakdownListEl.children.length === 0) {
      // keep at least one row
      addDefaultRows(1);
    }
  });

  breakdownListEl.appendChild(row);
}

function addDefaultRows(n = 3) {
  for (let i = 0; i < n; i++) makeBreakdownRow();
}

/* ---------- Cover image preview/remove ---------- */
const coverFileInput = document.getElementById("coverFile");
const coverPreview = document.getElementById("coverPreview");
const coverPreviewImg = document.getElementById("coverPreviewImg");
const removeCoverBtn = document.getElementById("removeCoverBtn");

if (coverFileInput) {
  coverFileInput.addEventListener("change", () => {
    const file = coverFileInput.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        coverPreviewImg.src = reader.result;
        coverPreview.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    } else {
      coverPreviewImg.src = "";
      coverPreview.classList.add("hidden");
    }
  });
}

if (removeCoverBtn) {
  removeCoverBtn.addEventListener("click", () => {
    coverFileInput.value = "";
    coverPreviewImg.src = "";
    coverPreview.classList.add("hidden");
  });
}

/* ---------- Validation ---------- */
function validateForm() {
  const title     = document.getElementById("title").value.trim();
  const category  = document.getElementById("category").value.trim();
  const goalRaw   = document.getElementById("goal").value;
  const shortDesc = document.getElementById("shortDescription").value.trim();
  const details   = document.getElementById("details").value.trim();

  if (!title || !category || !goalRaw || !shortDesc || !details) {
    toast("Please fill in all required fields."); return false;
  }
  const allowedCats = ["Medical", "Housing", "Food Relief", "Education", "Disaster Relief"];
  if (!allowedCats.includes(category)) {
    toast("Category must be one of: Medical, Housing, Food Relief (form limited), or Education, Disaster Relief (also allowed).");
    return false;
  }
  const goalAmount = parseFloat(goalRaw);
  if (isNaN(goalAmount) || goalAmount <= 0) {
    toast("Please enter a valid goal amount greater than ₱0."); return false;
  }
  if (details.length > 2000) { toast("Full Story cannot exceed 2000 characters."); return false; }

  // validate breakdown rows
  const rows = Array.from(breakdownListEl.querySelectorAll(".breakdown-row"));
  for (const r of rows) {
    const label = r.querySelector(".bd-label").value.trim();
    const amtRaw = r.querySelector(".bd-amount").value;
    if (!label && !amtRaw) continue; // empty row tolerated
    if (!label) { toast("Each breakdown row needs an Item label or remove the row."); return false; }
    if (label.length > 100) { toast("Breakdown item label must be ≤ 100 characters."); return false; }
    const amt = parseFloat(amtRaw);
    if (isNaN(amt) || amt < 0) { toast("Breakdown amount must be a number ≥ 0."); return false; }
  }

  return true;
}

/* ---------- Storage upload helper ---------- */
async function uploadCoverIfAny(campaignId) {
  const file = coverFileInput?.files?.[0];
  if (!file) return null;
  const storage = firebase.storage();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const ref = storage.ref().child(`donations/campaigns/${campaignId}/cover.${ext}`);
  await ref.put(file);
  return await ref.getDownloadURL();
}

/* ---------- Submit ---------- */
async function submitDonation() {
  if (!validateForm()) return;

  try {
    showLoading();

    const title     = document.getElementById("title").value.trim();
    const category  = document.getElementById("category").value.trim();
    const shortDesc = document.getElementById("shortDescription").value.trim();
    const details   = document.getElementById("details").value.trim();
    const goalAmount= parseFloat(document.getElementById("goal").value);

    const user   = firebase.auth().currentUser;
    const userId = user.uid;

    const db  = firebase.database();

    // Optional: early check for org role + verified subscription (write rules enforce anyway)
    const [roleSnap, verifiedSnap] = await Promise.all([
      db.ref(`users/${userId}/role`).once("value"),
      db.ref(`orgSubscriptions/${userId}/verified`).once("value")
    ]);
    const role = roleSnap.val();
    const verified = !!verifiedSnap.val();
    if (role !== "organization" || !verified) {
      hideLoading();
      return toast("Your organization must be verified to publish campaigns.");
    }

    // Create campaign node key
    const ref = db.ref("donationCampaigns").push();
    const id  = ref.key;
    const now = Date.now();

    // Upload cover (if any) first to get URL
    const coverUrl = await uploadCoverIfAny(id);

    // Build campaign payload (respecting DB rules)
    const campaign = {
      id,
      orgId: userId,
      title, // required by rules
      category, // must match allowed set
      status: "Active",
      goalAmount: goalAmount,
      description: details,          // ≤2000 chars per rule
      shortDescription: shortDesc,   // extra field allowed by $other
      coverUrl: coverUrl || "",
      createdAt: now,
      updatedAt: now,
      stats: {
        amountRaised: 0,
        supporters: 0,
        percent: 0,
        updatedAt: now
      }
    };

    // Collect breakdown rows
    const breakdownRows = [];
    Array.from(breakdownListEl.querySelectorAll(".breakdown-row")).forEach(r => {
      const label = r.querySelector(".bd-label").value.trim();
      const amtRaw = r.querySelector(".bd-amount").value;
      if (!label && !amtRaw) return; // skip empty
      const amt = Number(amtRaw) || 0;
      breakdownRows.push({ label, amount: amt });
    });

    // Build multi-path update (campaign + indexes + breakdown)
    const updates = {};
    updates[`donationCampaigns/${id}`] = campaign;
    updates[`campaignsByOrg/${userId}/${id}`] = true;
    updates[`campaignsByCategory/${category}/${id}`] = true;

    // add breakdown rows at donationCampaigns/{id}/breakdown/{rowId}
    breakdownRows.forEach(br => {
      const rowKey = db.ref().child("x").push().key;
      updates[`donationCampaigns/${id}/breakdown/${rowKey}`] = {
        label: br.label,
        amount: br.amount
      };
    });

    // Commit
    await db.ref().update(updates);

    hideLoading();
    alert("Donation campaign published successfully!");
    window.location.href = "donation.html";
  } catch (e) {
    hideLoading();
    console.error("Error adding donation:", e);
    alert("Error: " + e.message);
  }
}

/* ---------- Cancel ---------- */
function cancelForm() {
  if (confirm("Cancel and discard fields?")) window.location.href = "donation.html";
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  try { await checkAuth(); } catch { return; }

  // default three breakdown rows
  addDefaultRows(3);

  // handlers
  document.getElementById("submitDonation").addEventListener("click", submitDonation);
  document.getElementById("cancelBtn").addEventListener("click", cancelForm);
  document.getElementById("details").addEventListener("input", updateCharCounter);
  document.getElementById("addBreakdownRow").addEventListener("click", () => makeBreakdownRow());

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    firebase.auth().signOut().then(() => (window.location.href = "index.html"));
  });
});
