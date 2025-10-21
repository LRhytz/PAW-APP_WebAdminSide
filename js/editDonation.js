// js/editDonation.js — Edit campaign + wired buttons for Impact & Fund Usage with robust reads

/* ---------- Auth & helpers ---------- */
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

/* ---------- DOM refs ---------- */
const raisedEl = document.getElementById("raisedAmount");
const donorsEl = document.getElementById("donorCount");
const pbarEl   = document.getElementById("progressBar");
const ptxtEl   = document.getElementById("progressText");

const txListEl   = document.getElementById("transactions-list");
const txCountEl  = document.getElementById("transactionCount");

const impactListEl  = document.getElementById("impact-list");
const impactCountEl = document.getElementById("impactCount");
const updatesListEl = document.getElementById("updates-list");
const updateCountEl = document.getElementById("updateCount");

const overlay = document.getElementById("loadingOverlay");
const notify  = document.getElementById("notification");

/* ---------- toasts ---------- */
function toast(msg, type = "success") {
  if (!notify) return;
  notify.textContent = msg;
  notify.className = `notification ${type}`;
  notify.classList.remove("hidden");
  setTimeout(() => notify.classList.add("hidden"), 2200);
}

/* ---------- Storage helper ---------- */
async function uploadImageToStorage(file, storagePath) {
  if (!file) return null;
  const storage = firebase.storage();
  const ref = storage.ref().child(storagePath);
  await ref.put(file);
  return await ref.getDownloadURL();
}

/* ---------- Stats loaders ---------- */
async function loadFromStats(campaignRef, goalAmount) {
  const snap = await campaignRef.child("stats").once("value");
  const v = snap.val();
  if (!v) return null;

  const amountRaised = Number(v.amountRaised || 0);
  const supporters   = Number(v.supporters || 0);
  const pct = goalAmount > 0 ? Math.min(100, (amountRaised / goalAmount) * 100) : 0;

  if (raisedEl) raisedEl.textContent = peso(amountRaised);
  if (donorsEl) donorsEl.textContent = supporters;
  if (pbarEl)   pbarEl.style.width = `${pct}%`;
  if (ptxtEl)   ptxtEl.textContent = `${Math.round(pct)}% of goal`;

  return { amountRaised, supporters };
}

async function loadFromDonations(db, campaignId, goalAmount) {
  const ref = db.ref(`donations/${campaignId}`);
  const snap = await ref.orderByChild("createdAt").once("value");
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
  if (raisedEl) raisedEl.textContent = peso(total);
  if (donorsEl) donorsEl.textContent = donors.size;
  if (pbarEl)   pbarEl.style.width = `${pct}%`;
  if (ptxtEl)   ptxtEl.textContent = `${Math.round(pct)}% of goal`;

  items.sort((a,b)=>b.createdAt-a.createdAt);
  if (txCountEl) txCountEl.textContent = items.length;
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
  if (raisedEl) raisedEl.textContent = peso(total);
  if (pbarEl)   pbarEl.style.width = `${pct}%`;
  if (ptxtEl)   ptxtEl.textContent = `${Math.round(pct)}% of goal`;

  if (txCountEl) txCountEl.textContent = items.length;
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

/* ---------- Utility: robust child read (no orderByChild surprises) ---------- */
async function readChildArray(parentRef, childName, sortKey) {
  const snap = await parentRef.child(childName).once("value");
  const raw = snap.val() || {};
  const arr = Object.entries(raw).map(([id, v]) => ({ id, ...(v || {}) }));
  if (sortKey) {
    arr.sort((a, b) => (Number(b[sortKey])||0) - (Number(a[sortKey])||0));
  }
  return arr;
}

/* ---------- page init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  /* Back button -> Donation list */
  document.getElementById("backBtn")?.addEventListener("click", () => {
    window.location.href = "donation.html";
  });

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

    // Form fields
    const titleInput    = document.getElementById("title");
    const categoryInput = document.getElementById("category");
    const coverUrlInput = document.getElementById("coverUrl");
    const shortDescInp  = document.getElementById("shortDescription");
    const detailsInput  = document.getElementById("details");
    const goalInput     = document.getElementById("goal");
    const statusInput   = document.getElementById("status");

    if (titleInput)    titleInput.value    = c.title || "";
    if (categoryInput) categoryInput.value = c.category || "";
    if (coverUrlInput) coverUrlInput.value = c.coverUrl || "";
    if (shortDescInp)  shortDescInp.value  = c.shortDescription || "";
    if (detailsInput)  detailsInput.value  = c.description || "";
    if (goalInput)     goalInput.value     = Number(c.goalAmount || 0);
    if (statusInput)   statusInput.value   = c.status || "Active";

    const goal = Number(c.goalAmount || (goalInput ? goalInput.value : 0)) || 0;

    // Prefer stats, then donations, then transactions
    let got = await loadFromStats(campaignRef, goal);
    if (!got) got = await loadFromDonations(db, campaignId, goal);
    if (!got) got = await loadFromTransactions(campaignRef, goal);

    // ---- Robust previews (NO orderByChild) ----
    const impactArr = await readChildArray(campaignRef, "impactReports", "date");
    if (impactCountEl) impactCountEl.textContent = impactArr.length;
    if (impactListEl) {
      impactListEl.innerHTML = impactArr.length
        ? impactArr.slice(0,3).map(it => {
            const when = it.date ? new Date(it.date).toLocaleDateString() : "";
            return `<li><span class="item-main">${it.title || "Impact"}</span><span class="item-secondary">${when}</span></li>`;
          }).join("")
        : `<li class="loading">No items yet</li>`;
    }

    const updatesArr = await readChildArray(campaignRef, "updates", "timestamp");
    if (updateCountEl) updateCountEl.textContent = updatesArr.length;
    if (updatesListEl) {
      updatesListEl.innerHTML = updatesArr.length
        ? updatesArr.slice(0,3).map(it => {
            const when = it.timestamp ? new Date(it.timestamp).toLocaleDateString() : "";
            return `<li><span class="item-main">${it.text || "Update"}</span><span class="item-secondary">${when}</span></li>`;
          }).join("")
        : `<li class="loading">No items yet</li>`;
    }

    // Save handler
    const form = document.getElementById("donationForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        show(overlay, true);
        try {
          const allowedCats = ["Medical", "Housing", "Food Relief", "Education", "Disaster Relief"];
          const nextCategory = (categoryInput?.value || "").trim();
          if (nextCategory && !allowedCats.includes(nextCategory)) {
            toast("Category must be one of: " + allowedCats.join(", "), "error");
            return;
          }

          const payload = {
            ...(titleInput    ? { title: (titleInput.value || "").trim() } : {}),
            ...(detailsInput  ? { description: (detailsInput.value || "").trim() } : {}),
            ...(shortDescInp  ? { shortDescription: (shortDescInp.value || "").trim() } : {}),
            ...(coverUrlInput ? { coverUrl: (coverUrlInput.value || "").trim() } : {}),
            ...(categoryInput ? { category: nextCategory } : {}),
            ...(statusInput   ? { status: (statusInput.value || "Active") } : {}),
            ...(goalInput     ? { goalAmount: Number(goalInput.value)||0 } : {}),
            updatedAt: Date.now()
          };
          await campaignRef.update(payload);
          toast("Saved");

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

    // “View All” modal common nodes
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

        try {
          const dSnap = await firebase.database().ref(`donations/${campaignId}`).orderByChild("createdAt").once("value");
          let rows = [];
          if (dSnap.exists()) {
            dSnap.forEach(ch => rows.push({ id: ch.key, ...ch.val(), createdAt: Number(ch.val()?.createdAt)||0, amount: Number(ch.val()?.amount)||0 }));
            rows.sort((a,b)=>b.createdAt-a.createdAt);
          } else {
            const t = await readChildArray(campaignRef, "transactions", "timestamp");
            rows = t.map(x => ({ ...x, createdAt: Number(x.timestamp)||0 }));
          }

          modalLoader.style.display = "none";
          modalContent.innerHTML = rows.length === 0
            ? `<li class="loading">No donations yet</li>`
            : rows.map(r=>{
                const who = r.anonymous ? "Anonymous" : (r.donorName || r.userId || "Donor");
                const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
                const msg  = r.message ? `<div class="modal-item-body"><p>${r.message}</p></div>` : "";
                return `<li><div class="modal-item-header"><strong>${who}</strong><span>${peso(r.amount)}</span></div><div class="modal-item-body"><span class="modal-item-date">${when}</span></div>${msg}</li>`;
              }).join("");
        } catch (e) {
          console.error(e);
          modalLoader.style.display = "none";
          modalContent.innerHTML = `<li class="loading">Error loading</li>`;
        }
      });
    }

    /* ------------------- Impact & Updates wiring + IMAGE UPLOAD ------------------- */
    const currentUid = firebase.auth().currentUser?.uid || null;
    const orgId = c.orgId;

    // Hide add buttons if the viewer isn't the campaign owner
    const addImpactBtn = document.getElementById("addImpactBtn");
    const addUpdateBtn = document.getElementById("addUpdateBtn");
    if (currentUid && orgId && currentUid !== orgId) {
      addImpactBtn?.classList.add("hidden");
      addUpdateBtn?.classList.add("hidden");
    }

    // Modal closers for the 2 add modals
    document.querySelectorAll(".add-modal-close").forEach(b =>
      b.addEventListener("click", () => {
        document.getElementById("addImpactModal")?.classList.add("hidden");
        document.getElementById("addUpdateModal")?.classList.add("hidden");
      })
    );

    const formatDate = (ms) => (ms ? new Date(ms).toLocaleString() : "");
    const renderList = (rows, mapper) => rows && rows.length ? rows.map(mapper).join("") : `<li class="loading">No items yet</li>`;

    // VIEW ALL IMPACT REPORTS (robust + fallback image fetch)
    const viewAllImpactBtn = document.getElementById("viewAllImpact");
    if (viewAllImpactBtn) {
      viewAllImpactBtn.addEventListener("click", async () => {
        modalTitle.textContent = "All Impact Reports";
        modalContent.innerHTML = "";
        modalLoader.style.display = "flex";
        modalOverlay.classList.remove("hidden");

        try {
          let rows = await readChildArray(campaignRef, "impactReports", "date");

          // Fallback: fetch top-level data for any items missing coverUrl/summary
          const needIds = rows.filter(r => !r.coverUrl || !r.summary).map(r => r.id);
          if (needIds.length) {
            const snaps = await Promise.all(needIds.map(id => firebase.database().ref(`impactReports/${id}`).once("value")));
            const map = {};
            snaps.forEach(s => { if (s.exists()) map[s.key] = s.val(); });
            rows = rows.map(r => map[r.id] ? { ...r, ...map[r.id] } : r);
          }

          modalLoader.style.display = "none";
          modalContent.innerHTML = renderList(rows, r => {
            const title = r.title || "Impact";
            const when  = formatDate(r.date || r.createdAt);
            const desc  = r.description || r.summary || r.content || "";
            const img   = r.coverUrl ? `<div class="modal-item-body"><img src="${r.coverUrl}" alt="${title}" style="max-width:100%;border-radius:12px;margin-top:6px"/></div>` : "";
            return `<li>
              <div class="modal-item-header"><strong>${title}</strong></div>
              <div class="modal-item-body">
                <span class="modal-item-date">${when}</span>
                ${desc ? `<p>${desc}</p>` : ""}
              </div>
              ${img}
            </li>`;
          });
        } catch (err) {
          console.error(err);
          modalLoader.style.display = "none";
          modalContent.innerHTML = `<li class="loading">Error loading</li>`;
        }
      });
    }

    // ADD IMPACT REPORT (mirror coverUrl into child)
    if (addImpactBtn) {
      addImpactBtn.addEventListener("click", () => {
        if (currentUid !== orgId) {
          return toast("Only the campaign owner can add impact reports.", "error");
        }
        document.getElementById("impactTitle").value = "";
        document.getElementById("impactDescription").value = "";
        const f = document.getElementById("impactImage"); if (f) f.value = "";
        document.getElementById("addImpactModal").classList.remove("hidden");
      });
    }

    const addImpactForm = document.getElementById("addImpactForm");
    if (addImpactForm) {
      addImpactForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (currentUid !== orgId) return toast("You are not allowed to add an impact report.", "error");

        const title = (document.getElementById("impactTitle").value || "").trim();
        const description = (document.getElementById("impactDescription").value || "").trim();
        const imageFile = document.getElementById("impactImage")?.files?.[0] || null;
        if (!title || !description) return toast("Please fill in all fields.", "error");

        show(overlay, true);
        try {
          const now = Date.now();
          const newRef = firebase.database().ref("impactReports").push();
          const impactId = newRef.key;

          let coverUrl = null;
          if (imageFile) {
            const ext = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
            const storagePath = `donations/campaigns/${campaignId}/impact/${impactId}.${ext}`;
            coverUrl = await uploadImageToStorage(imageFile, storagePath);
          }

          // IMPORTANT: mirror coverUrl into child so modals show it without extra fetch
          const childPayload = { title, description, date: now, ...(coverUrl ? { coverUrl } : {}) };
          const topPayload = {
            id: impactId, campaignId, orgId, title, type: "general",
            summary: description.length > 300 ? (description.slice(0, 297) + "…") : description,
            content: description, ...(coverUrl ? { coverUrl } : {}),
            createdAt: now, updatedAt: now
          };

          const updates = {};
          updates[`donationCampaigns/${campaignId}/impactReports/${impactId}`] = childPayload;
          updates[`impactReports/${impactId}`] = topPayload;
          updates[`impactReportsByCampaign/${campaignId}/${impactId}`] = true;
          updates[`impactReportsByOrg/${orgId}/${impactId}`] = true;
          await firebase.database().ref().update(updates);

          // Refresh preview robustly
          const refreshed = await readChildArray(campaignRef, "impactReports", "date");
          if (impactCountEl) impactCountEl.textContent = refreshed.length;
          if (impactListEl) {
            impactListEl.innerHTML = refreshed.length
              ? refreshed.slice(0,3).map(it=>{
                  const when = it.date ? new Date(it.date).toLocaleDateString() : "";
                  return `<li><span class="item-main">${it.title || "Impact"}</span><span class="item-secondary">${when}</span></li>`;
                }).join("")
              : `<li class="loading">No items yet</li>`;
          }

          document.getElementById("addImpactModal").classList.add("hidden");
          toast("Impact report added");
        } catch (err) {
          console.error(err);
          toast("Error adding impact report: " + err.message, "error");
        } finally {
          show(overlay, false);
        }
      });
    }

    // VIEW ALL FUND USAGE UPDATES (robust + fallback image fetch)
    const viewAllUpdatesBtn = document.getElementById("viewAllUpdates");
    if (viewAllUpdatesBtn) {
      viewAllUpdatesBtn.addEventListener("click", async () => {
        modalTitle.textContent = "All Fund Usage Updates";
        modalContent.innerHTML = "";
        modalLoader.style.display = "flex";
        modalOverlay.classList.remove("hidden");

        try {
          let rows = await readChildArray(campaignRef, "updates", "timestamp");

          // Fallback: fetch top-level data for any items missing photoUrl/title/content
          const needIds = rows.filter(r => !r.photoUrl || !r.title).map(r => r.id);
          if (needIds.length) {
            const snaps = await Promise.all(needIds.map(id => firebase.database().ref(`fundUsageUpdates/${id}`).once("value")));
            const map = {};
            snaps.forEach(s => { if (s.exists()) map[s.key] = s.val(); });
            rows = rows.map(r => map[r.id] ? { ...r, ...map[r.id] } : r);
          }

          modalLoader.style.display = "none";
          modalContent.innerHTML = renderList(rows, r => {
            const title = r.title || "Update";
            const when  = formatDate(r.timestamp || r.createdAt);
            const body  = r.text || r.content || "";
            const img   = r.photoUrl ? `<div class="modal-item-body"><img src="${r.photoUrl}" alt="${title}" style="max-width:100%;border-radius:12px;margin-top:6px"/></div>` : "";
            return `<li>
              <div class="modal-item-header"><strong>${title}</strong></div>
              <div class="modal-item-body">
                <span class="modal-item-date">${when}</span>
                ${body ? `<p>${body}</p>` : ""}
              </div>
              ${img}
            </li>`;
          });
        } catch (err) {
          console.error(err);
          modalLoader.style.display = "none";
          modalContent.innerHTML = `<li class="loading">Error loading</li>`;
        }
      });
    }

    // ADD FUND USAGE UPDATE (mirror photoUrl into child)
    if (addUpdateBtn) {
      addUpdateBtn.addEventListener("click", () => {
        if (currentUid !== orgId) return toast("Only the campaign owner can add updates.", "error");
        document.getElementById("updateMessage").value = "";
        const p = document.getElementById("updateImage"); if (p) p.value = "";
        document.getElementById("addUpdateModal").classList.remove("hidden");
      });
    }

    const addUpdateForm = document.getElementById("addUpdateForm");
    if (addUpdateForm) {
      addUpdateForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (currentUid !== orgId) return toast("You are not allowed to add an update.", "error");

        const message  = (document.getElementById("updateMessage").value || "").trim();
        const imageFile = document.getElementById("updateImage")?.files?.[0] || null;
        if (!message) return toast("Please enter an update message.", "error");

        show(overlay, true);
        try {
          const now = Date.now();
          const newRef = firebase.database().ref("fundUsageUpdates").push();
          const updateId = newRef.key;

          const autoTitle = (() => {
            const first = message.split("\n")[0].trim();
            const short = first.length > 80 ? first.slice(0, 77) + "…" : first;
            return short || `Update — ${new Date(now).toLocaleDateString()}`;
          })();

          let photoUrl = null;
          if (imageFile) {
            const ext = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
            const storagePath = `donations/campaigns/${campaignId}/updates/${updateId}.${ext}`;
            photoUrl = await uploadImageToStorage(imageFile, storagePath);
          }

          // IMPORTANT: mirror photoUrl into child so modals show it without extra fetch
          const childPayload = { id: updateId, authorId: currentUid, text: message, timestamp: now, ...(photoUrl ? { photoUrl } : {}) };
          const topPayload   = { id: updateId, campaignId, orgId, title: autoTitle, content: message, ...(photoUrl ? { photoUrl } : {}), createdAt: now, updatedAt: now };

          const updates = {};
          updates[`donationCampaigns/${campaignId}/updates/${updateId}`] = childPayload;
          updates[`fundUsageUpdates/${updateId}`] = topPayload;
          updates[`fundUsageUpdatesByCampaign/${campaignId}/${updateId}`] = true;
          updates[`fundUsageUpdatesByOrg/${orgId}/${updateId}`] = true;
          await firebase.database().ref().update(updates);

          // Refresh preview robustly
          const refreshed = await readChildArray(campaignRef, "updates", "timestamp");
          if (updateCountEl) updateCountEl.textContent = refreshed.length;
          if (updatesListEl) {
            updatesListEl.innerHTML = refreshed.length
              ? refreshed.slice(0,3).map(it=>{
                  const when = it.timestamp ? new Date(it.timestamp).toLocaleDateString() : "";
                  return `<li><span class="item-main">${it.text || "Update"}</span><span class="item-secondary">${when}</span></li>`;
                }).join("")
              : `<li class="loading">No items yet</li>`;
          }

          document.getElementById("addUpdateModal").classList.add("hidden");
          toast("Update added");
        } catch (err) {
          console.error(err);
          toast("Error adding update: " + err.message, "error");
        } finally {
          show(overlay, false);
        }
      });
    }

    // Character counter (plain DOM, no jQuery)
    const detailsCharCount = document.getElementById("detailsCharCount");
    if (detailsInput && detailsCharCount) {
      detailsCharCount.textContent = (detailsInput.value || "").length;
      detailsInput.addEventListener("input", () => {
        detailsCharCount.textContent = (detailsInput.value || "").length;
      });
    }

    // Cancel button returns to list
    const cancelBtn = document.getElementById("cancelBtn");
    if (cancelBtn) cancelBtn.addEventListener("click", () => { location.href = "donation.html"; });

    // Logout
    document.getElementById("logout-btn")?.addEventListener("click", () => {
      firebase.auth().signOut().then(() => (window.location.href = "index.html"));
    });

  } catch (e) {
    console.error(e);
    toast("Error loading page", "error");
  } finally {
    show(overlay, false);
  }
});
