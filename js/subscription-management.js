// js/subscription-management.js
(async function initSubs() {
  const me = await DB.waitForAuthUser();
  if (!me) return (window.location = "index.html");

  const isAdmin = await DB.isAdmin(me.uid);
  if (!isAdmin) return (window.location = "index.html");

  const db = firebase.database();
  const tbody = document.querySelector("#subs-table tbody");
  const container = document.querySelector(".subs-card");
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // ---------- helpers ----------
  const toDateStr = (ms) => {
    const n = Number(ms);
    if (!n || isNaN(n)) return "—";
    try {
      const d = new Date(n);
      return (
        d.toLocaleDateString() +
        " " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return "—";
    }
  };

  const timeAgo = (timestamp) => {
    if (!timestamp) return "—";
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  };

  const planDurationMs = (plan) => {
    const p = (plan || "").toLowerCase();
    if (p === "yearly" || p === "annual" || p === "annually") return 365 * MS_PER_DAY;
    return 30 * MS_PER_DAY;
  };

  const computeStartMs = (rec) => {
    if (rec.updatedAt) return Number(rec.updatedAt);
    const endMs = Number(rec.currentPeriodEndMs);
    const dur = planDurationMs(rec.plan);
    return endMs && dur ? endMs - dur : null;
  };

  // ---------- Toast ----------
  function showToast(message, type = "info") {
    let toast = document.createElement("div");
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add("show"), 50);
    // Remove after 3 seconds
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  // Inject minimal toast styles
  const toastStyle = document.createElement("style");
  toastStyle.textContent = `
    .toast-message {
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: #333;
      color: #fff;
      padding: 10px 18px;
      border-radius: 6px;
      opacity: 0;
      transition: all 0.4s ease;
      z-index: 9999;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.25);
    }
    .toast-message.show { opacity: 1; transform: translateY(-5px); }
    .toast-message.success { background: #28a745; }
    .toast-message.error { background: #dc3545; }
    .toast-message.info { background: #17a2b8; }
  `;
  document.head.appendChild(toastStyle);

  // ---------- load data ----------
  const subsSnap = await db.ref("subscriptions").once("value");
  const orgSubsSnap = await db.ref("orgSubscriptions").once("value");
  const citizenSubs = subsSnap.val() || {};
  const orgSubs = orgSubsSnap.val() || {};

  const records = [];

  const processSubs = (src, type) => {
    Object.entries(src).forEach(([uid, rec]) => {
      const endMs = Number(rec.currentPeriodEndMs);
      if (!endMs) return;
      records.push({
        uid,
        type,
        plan: (rec.plan || "").toLowerCase(),
        status: (rec.status || "").toLowerCase(),
        startMs: computeStartMs(rec),
        endMs,
        lastNotifiedAt: rec.lastNotifiedAt || null,
      });
    });
  };

  processSubs(citizenSubs, "user");
  processSubs(orgSubs, "org");

  const subsByUid = {};
  records.forEach((r) => (subsByUid[r.uid] = r));

  // ---------- render ----------
  tbody.innerHTML = "";

  // Add "Notify All Inactive" button safely
  const notifyAllBtn = document.createElement("button");
  notifyAllBtn.id = "notifyAllBtn";
  notifyAllBtn.className = "action-btn notify";
  notifyAllBtn.textContent = "Notify All Inactive";
  notifyAllBtn.style.marginBottom = "1rem";

  const tableWrap = container.querySelector(".table-wrap");
  if (tableWrap && container.contains(tableWrap)) {
    container.insertBefore(notifyAllBtn, tableWrap);
  } else {
    container.prepend(notifyAllBtn);
  }

  // Render table rows
  for (const r of records) {
    const { uid, type, plan, status, startMs, lastNotifiedAt } = r;
    const startStr = toDateStr(startMs);
    const isActive = status === "active";
    const email = (await db.ref(`users/${uid}/email`).once("value")).val() || "—";

    const tr = document.createElement("tr");
    tr.classList.toggle("inactive-row", !isActive);

    tr.innerHTML = `
      <td>${email}</td>
      <td>${plan || "—"}</td>
      <td>${startStr}</td>
      <td>
        <span class="status ${isActive ? "active" : "inactive"}">
          ${isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td data-time="${lastNotifiedAt || ""}">
        ${timeAgo(lastNotifiedAt)}
      </td>
      <td>
        <button class="action-btn notify"
                data-uid="${uid}"
                data-type="${type}"
                ${!isActive ? "" : "disabled"}>
          Notify
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // ---------- Auto-refresh "time ago" every minute ----------
  setInterval(() => {
    tbody.querySelectorAll("td[data-time]").forEach((cell) => {
      const ts = Number(cell.dataset.time);
      cell.textContent = timeAgo(ts);
    });
  }, 60000);

  // ---------- notify single ----------
  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button.notify");
    if (!btn || btn.disabled) return;

    const uid = btn.dataset.uid;
    const type = btn.dataset.type;
    const rec = subsByUid[uid];

    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      await sendNotification(rec);
      const now = Date.now();
      rec.lastNotifiedAt = now;
      const row = btn.closest("tr");
      const cell = row.querySelector("td[data-time]");
      cell.dataset.time = now;
      cell.textContent = timeAgo(now);

      btn.textContent = "✅ Notified";
      showToast(`Notified ${type === "org" ? "organization" : "user"} successfully`, "success");
    } catch (err) {
      console.error("Notify failed:", err);
      btn.textContent = "Error";
      showToast("Failed to send notification.", "error");
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "Notify";
      }, 2500);
    }
  });

  // ---------- notify all inactive ----------
  notifyAllBtn.addEventListener("click", async () => {
    const inactive = records.filter((r) => r.status !== "active");
    if (!inactive.length) return showToast("No inactive users or orgs found.", "info");

    if (!confirm(`Notify ${inactive.length} inactive account(s)?`)) return;

    let successCount = 0;
    for (const r of inactive) {
      try {
        await sendNotification(r);
        r.lastNotifiedAt = Date.now();
        successCount++;
      } catch (err) {
        console.error("Notify failed for", r.uid, err);
      }
    }

    // Update all visible cells
    tbody.querySelectorAll("td[data-time]").forEach((cell) => {
      const ts = Number(cell.dataset.time);
      cell.textContent = timeAgo(ts);
    });

    showToast(`✅ Notified ${successCount} inactive account(s).`, "success");
    notifyAllBtn.disabled = true;
  });

  // ---------- send notification ----------
  async function sendNotification(rec) {
    const { uid, type, plan } = rec;
    const title = "Subscription Reminder";
    const message = `Your ${plan || "subscription"} plan is inactive. Please renew to continue access.`;

    const notifData = {
      id: firebase.database().ref().push().key,
      type: "subscription_reminder",
      title,
      body: message,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      seen: false,
    };

    if (type === "user") {
      // ✅ Citizen notification path
      const refPath = db.ref(`userNotifications/${uid}/${notifData.id}`);
      await refPath.set(notifData);
      await db
        .ref(`subscriptions/${uid}/lastNotifiedAt`)
        .set(firebase.database.ServerValue.TIMESTAMP);
    } else {
      // ✅ Organization notification path
      const refPath = db.ref(`orgNotifications/${uid}/${notifData.id}`);
      await refPath.set({
        ...notifData,
        read: false,
      });
      await db
        .ref(`orgSubscriptions/${uid}/lastNotifiedAt`)
        .set(firebase.database.ServerValue.TIMESTAMP);
    }
  }
})();
