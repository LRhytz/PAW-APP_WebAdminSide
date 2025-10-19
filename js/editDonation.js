// editDonation.js — details page totals now match the list page

/* ---------- Auth helpers ---------- */
function requireAuth() {
  return new Promise((resolve, reject) => {
    firebase.auth().onAuthStateChanged((u) => {
      if (u) resolve(u);
      else {
        window.location.href = "index.html";
        reject(new Error("Not authenticated"));
      }
    });
  });
}
function getQP(k) { return new URLSearchParams(location.search).get(k); }
function peso(n) {
  const num = Number(n) || 0;
  return "₱" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function show(el, on = true) { if (el) el.classList.toggle("hidden", !on); }

/* ---------- DOM ---------- */
const raisedEl = document.getElementById("raisedAmount");
const donorsEl = document.getElementById("donorCount");
const pbarEl   = document.getElementById("progressBar");
const ptxtEl   = document.getElementById("progressText");

const txListEl = document.getElementById("transactions-list");
const txCountEl= document.getElementById("transactionCount");

const impactListEl = document.getElementById("impact-list");
const impactCountEl= document.getElementById("impactCount");
const updatesListEl= document.getElementById("updates-list");
const updateCountEl= document.getElementById("updateCount");

const overlay = document.getElementById("loadingOverlay");
const notify  = document.getElementById("notification");

/* ---------- small UI helpers ---------- */
function toast(msg, type = "success") {
  if (!notify) return;
  notify.textContent = msg;
  notify.className = `notification ${type}`;
  notify.classList.remove("hidden");
  setTimeout(() => notify.classList.add("hidden"), 2200);
}

/* ---------- totals refreshers ---------- */
async function loadFromStats(campaignRef, goalAmount) {
  const snap = await campaignRef.child("stats").once("value");
  const v = snap.val();
  if (!v) return null;

  const amountRaised = Number(v.amountRaised || 0);
  const supporters   = Number(v.supporters || 0);
  const pct = goalAmount > 0 ? Math.min(100, (amountRaised / goalAmount) * 100) : 0;

  raisedEl && (raisedEl.textContent = peso(amountRaised));
  donorsEl && (donorsEl.textContent = supporters);
  pbarEl   && (pbarEl.style.width = `${pct}%`);
  ptxtEl   && (ptxtEl.textContent = `${Math.round(pct)}% of goal`);

  return { amountRaised, supporters };
}

async function loadFromDonations(db, campaignId, goalAmount) {
  const ref = db.ref(`donations/${campaignId}`);
  const snap = await ref.orderByChild("createdAt").once("value"); // works even if createdAt missing; returns all
  if (!snap.exists()) return null;

  let total = 0;
  const donors = new Set();
  const items = [];
  snap.forEach(ch => {
    const d = ch.val() || {};
    const amt = Number(d.amount) || 0;
    total += amt;
    if (!d.anonymous) {
      if (d.userId) donors.add(d.userId);
      else if (d.donorName) donors.add("name:" + d.donorName);
    }
    items.push({ id: ch.key, ...d, createdAt: Number(d.createdAt) || 0, amount: amt });
  });

  const pct = goalAmount > 0 ? Math.min(100, (total / goalAmount) * 100) : 0;
  raisedEl && (raisedEl.textContent = peso(total));
  donorsEl && (donorsEl.textContent = donors.size);
  pbarEl   && (pbarEl.style.width = `${pct}%`);
  ptxtEl   && (ptxtEl.textContent = `${Math.round(pct)}% of goal`);

  // recent 3 in the preview
  items.sort((a,b)=>b.createdAt-a.createdAt);
  txCountEl && (txCountEl.textContent = items.length);
  if (txListEl) {
    if (items.length === 0) txListEl.innerHTML = `<li class="loading">No donations yet</li>`;
    else {
      const recent = items.slice(0,3);
      txListEl.innerHTML = recent.map(d=>{
        const when = d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "";
        const who  = d.anonymous ? "Anonymous" : (d.donorName || "Donor");
        return `<li><span class="item-main">${who}</span><span class="item-secondary">${peso(d.amount)} • ${when}</span></li>`;
      }).join("");
    }
  }
  return { amountRaised: total, supporters: donors.size };
}

async function loadFromTransactions(campaignRef, goalAmount) {
  const snap = await campaignRef.child("transactions").orderByChild("timestamp").once("value");
  if (!snap.exists()) return null;

  let total = 0;
  const items = [];
  snap.forEach(ch => {
    const t = ch.val() || {};
    const amt = Number(t.amount) || 0;
    total += amt;
    items.push({ id: ch.key, ...t, timestamp: Number(t.timestamp) || 0, amount: amt });
  });

  const pct = goalAmount > 0 ? Math.min(100, (total / goalAmount) * 100) : 0;
  raisedEl && (raisedEl.textContent = peso(total));
  pbarEl   && (pbarEl.style.width = `${pct}%`);
  ptxtEl   && (ptxtEl.textContent = `${Math.round(pct)}% of goal`);

  // donors unknown here, leave as is unless you also store donorId on transactions
  txCountEl && (txCountEl.textContent = items.length);
  if (txListEl) {
    if (items.length === 0) txListEl.innerHTML = `<li class="loading">No donations yet</li>`;
    else {
      items.sort((a,b)=>b.timestamp-a.timestamp);
      const recent = items.slice(0,3);
      txListEl.innerHTML = recent.map(t=>{
        const when = t.timestamp ? new Date(t.timestamp).toLocaleDateString() : "";
        return `<li><span class="item-main">Donation</span><span class="item-secondary">${peso(t.amount)} • ${when}</span></li>`;
      }).join("");
    }
  }
  return { amountRaised: total, supporters: null };
}

/* ---------- page init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  const campaignId = getQP("donationId");
  if (!campaignId) {
    toast("Missing donationId in URL", "error");
    return (location.href = "donation.html");
  }

  show(overlay, true);

  try {
    await requireAuth();
    const db = firebase.database();
    const campaignRef = db.ref(`donationCampaigns/${campaignId}`);

    // load campaign basics into the form/preview
    const cSnap = await campaignRef.once("value");
    const c = cSnap.val();
    if (!c) {
      show(overlay, false);
      toast("Campaign not found", "error");
      return setTimeout(()=>location.href="donation.html", 1000);
    }

    // Fill form fields that exist in your HTML
    const nameInput    = document.getElementById("name");
    const detailsInput = document.getElementById("details");
    const purposeInput = document.getElementById("purpose");
    const goalInput    = document.getElementById("goal");
    if (nameInput)    nameInput.value    = c.title || "";
    if (detailsInput) detailsInput.value = c.description || "";
    if (purposeInput) purposeInput.value = c.category || "";
    if (goalInput)    goalInput.value    = Number(c.goalAmount || 0);

    const goal = Number(c.goalAmount || (goalInput ? goalInput.value : 0)) || 0;

    /* 1) Try to match the list page: read stats first */
    let got = await loadFromStats(campaignRef, goal);

    /* 2) Fallback: aggregate from /donations/{campaignId} */
    if (!got) got = await loadFromDonations(db, campaignId, goal);

    /* 3) Final fallback: aggregate from /donationCampaigns/{id}/transactions */
    if (!got) got = await loadFromTransactions(campaignRef, goal);

    // Impact & Updates previews (unchanged)
    const loadPreview = async (child, listEl, countEl, dateKey="date") => {
      try {
        const s = await campaignRef.child(child).orderByChild(dateKey).limitToLast(3).once("value");
        const arr = [];
        s.forEach(ch => arr.push({ id: ch.key, ...ch.val() }));
        arr.sort((a,b)=> (b[dateKey]||0) - (a[dateKey]||0));
        countEl && (countEl.textContent = arr.length);
        if (!listEl) return;
        if (arr.length === 0) listEl.innerHTML = `<li class="loading">No items yet</li>`;
        else listEl.innerHTML = arr.map(it=>{
          const when = it[dateKey] ? new Date(it[dateKey]).toLocaleDateString() : "";
          const main = child === "impactReports" ? (it.title || "Impact") : (it.text || it.message || "Update");
          return `<li><span class="item-main">${main}</span><span class="item-secondary">${when}</span></li>`;
        }).join("");
      } catch (e) {
        console.error("Preview load error", e);
        listEl && (listEl.innerHTML = `<li class="loading">Error loading</li>`);
      }
    };
    await Promise.all([
      loadPreview("impactReports", impactListEl, impactCountEl),
      loadPreview("updates", updatesListEl, updateCountEl)
    ]);

    // Save handler (kept simple)
    const form = document.getElementById("donationForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        show(overlay, true);
        try {
          const payload = {
            ...(nameInput    ? { title: nameInput.value.trim() } : {}),
            ...(detailsInput ? { description: detailsInput.value.trim() } : {}),
            ...(purposeInput ? { category: purposeInput.value.trim() } : {}),
            ...(goalInput    ? { goalAmount: Number(goalInput.value)||0 } : {}),
            updatedAt: Date.now()
          };
          await campaignRef.update(payload);
          toast("Saved");
          // recompute totals if goal changed
          const newGoal = Number(payload.goalAmount ?? goal);
          await (loadFromStats(campaignRef, newGoal)
              || loadFromDonations(db, campaignId, newGoal)
              || loadFromTransactions(campaignRef, newGoal));
        } catch (e2) {
          console.error(e2);
          toast("Error saving: " + e2.message, "error");
        } finally {
          show(overlay, false);
        }
      });
    }

    // “View All” transactions modal button (reads from the same source used for totals)
    const viewAllBtn = document.getElementById("viewAllTransactions");
    const modalOverlay = document.getElementById("modalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalContent = document.getElementById("modalContent");
    const modalLoader = document.getElementById("modalContentLoader");
    document.querySelectorAll(".modal-close").forEach(b => b.addEventListener("click", ()=> modalOverlay.classList.add("hidden")));

    if (viewAllBtn) {
      viewAllBtn.addEventListener("click", async () => {
        modalTitle.textContent = "All Donations";
        modalContent.innerHTML = "";
        modalLoader.style.display = "flex";
        modalOverlay.classList.remove("hidden");

        // Prefer donations/; fallback to transactions/
        try {
          const dSnap = await firebase.database().ref(`donations/${campaignId}`).orderByChild("createdAt").once("value");
          let rows = [];
          if (dSnap.exists()) {
            dSnap.forEach(ch => rows.push({ id: ch.key, ...ch.val(), createdAt: Number(ch.val()?.createdAt)||0, amount: Number(ch.val()?.amount)||0 }));
            rows.sort((a,b)=>b.createdAt-a.createdAt);
          } else {
            const tSnap = await campaignRef.child("transactions").orderByChild("timestamp").once("value");
            tSnap.forEach(ch => rows.push({ id: ch.key, ...ch.val(), createdAt: Number(ch.val()?.timestamp)||0, amount: Number(ch.val()?.amount)||0 }));
            rows.sort((a,b)=>b.createdAt-a.createdAt);
          }

          modalLoader.style.display = "none";
          if (rows.length === 0) modalContent.innerHTML = `<li class="loading">No donations yet</li>`;
          else {
            modalContent.innerHTML = rows.map(r=>{
              const who = r.anonymous ? "Anonymous" : (r.donorName || r.userId || "Donor");
              const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
              const msg  = r.message ? `<div class="modal-item-body"><p>${r.message}</p></div>` : "";
              return `<li><div class="modal-item-header"><strong>${who}</strong><span>${peso(r.amount)}</span></div><div class="modal-item-body"><span class="modal-item-date">${when}</span></div>${msg}</li>`;
            }).join("");
          }
        } catch (e) {
          console.error(e);
          modalLoader.style.display = "none";
          modalContent.innerHTML = `<li class="loading">Error loading</li>`;
        }
      });
    }

  } catch (e) {
    console.error(e);
    toast("Error loading page", "error");
  } finally {
    show(overlay, false);
  }
});
