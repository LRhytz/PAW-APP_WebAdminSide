// /js/notifications.js
/* Global Notifications (Firebase RTDB)
   Sources:
     - /notifications/{uid}/{pushKey}
     - /orgNotifications/{uid}/{pushKey}
   UI: bell in header + dropdown list.
*/
(function () {
  const Notifications = {
    _initialized: false,
    _uid: null,
    _els: {},
    _unbind: [],
    _items: [],

    init(opts = {}) {
      if (this._initialized) return;

      // ---- HARD CLEANUP: remove any prior bells/dropdowns with same IDs ----
      try {
        document.querySelectorAll("#notif-dropdown").forEach((n) => n.remove());
        document.querySelectorAll("#notif-btn").forEach((n) => n.remove());
      } catch {}

      // ---- Build UI ----
      const mount =
        opts.mount ||
        document.getElementById("nav-actions-right") ||
        document.querySelector(".app-header") ||
        document.body;

      const wrap = document.createElement("div");
      wrap.className = "header-actions";
      wrap.style.position = "relative";

      const btn = document.createElement("button");
      btn.id = "notif-btn";
      btn.className = "icon-btn";
      btn.setAttribute("aria-label", "Notifications");
      btn.setAttribute("title", "Notifications");
      btn.innerHTML =
        '<i class="fas fa-bell"></i><span id="notif-badge" class="badge" hidden>0</span>';

      const dd = document.createElement("div");
      dd.id = "notif-dropdown";
      dd.className = "notif-dropdown";
      dd.hidden = true;
      dd.innerHTML = `
        <div class="notif-head">
          <strong>Notifications</strong>
          <span id="notif-debug" style="margin-left:auto;font-size:11px;color:#6b7280">items: 0</span>
          <button id="notif-markall" class="link-btn" type="button" style="margin-left:8px">Mark all read</button>
        </div>
        <div id="notif-list" class="notif-list"><em>Loading…</em></div>
        <a href="notifications.html" class="notif-foot">View all</a>
      `;

      wrap.appendChild(btn);
      wrap.appendChild(dd);

      if (mount && (mount.id === "nav-actions-right" || mount.classList.contains("app-header"))) {
        mount.appendChild(wrap);
      } else {
        document.body.appendChild(wrap);
      }

      this._els = {
        wrap,
        btn,
        dd,
        list: dd.querySelector("#notif-list"),
        // badge is inside the button
        badge: wrap.querySelector("#notif-badge") || btn.querySelector("#notif-badge"),
        markAll: dd.querySelector("#notif-markall"),
        debug: dd.querySelector("#notif-debug"),
      };

      // Toggle dropdown
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._els.dd.hidden = !this._els.dd.hidden;
      });
      document.addEventListener("click", () => (this._els.dd.hidden = true));
      this._els.dd.addEventListener("click", (e) => e.stopPropagation());

      // Mark all read
      this._els.markAll.addEventListener("click", () => this._markAllRead());

      // ---- Auth wiring ----
      const onAuth = (u) => {
        if (!u) return;
        this._uid = u.uid;
        console.log("[notifications] auth uid:", this._uid);

        // Reset state and unhook previous listeners
        this._unbind.forEach((off) => { try { off(); } catch {} });
        this._unbind = [];
        this._items = [];
        this._render();

        // Bind both paths (ORDER BY createdAt so we truly get newest)
        this._bindPath("notifications", this._uid, normalizeUser);
        this._bindPath("orgNotifications", this._uid, normalizeOrg);
      };

      try {
        const cu = firebase.auth().currentUser;
        if (cu) onAuth(cu);
        firebase.auth().onAuthStateChanged((u) => u && onAuth(u));
      } catch (e) {
        console.warn("[notifications] auth bootstrap failed:", e);
      }

      this._initialized = true;
    },

    // Prime with get(); then attach live listener.
    _bindPath(root, uid, normalize) {
      // IMPORTANT: order by createdAt so "latest" really means latest
      const ref = firebase
        .database()
        .ref(root)
        .child(uid)
        .orderByChild("createdAt")
        .limitToLast(200); // pull more to cover both message + org notifications

      const apply = (snap, tag) => {
        const arr = [];
        snap.forEach((child) => {
          const raw = child.val() || {};
          const n = normalize(child.key, raw);
          // guard against missing createdAt; keep but push to bottom
          if (!n.createdAt && typeof raw.timestamp === "number") n.createdAt = raw.timestamp;
          arr.push(n);
        });

        // Merge by composite key
        const keyOf = (x) => `${x.path}/${x.id}`;
        const map = new Map(this._items.map((x) => [keyOf(x), x]));
        arr.forEach((x) => map.set(keyOf(x), x));
        this._items = Array.from(map.values()).sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );

        console.log(`[notifications] ${tag} ${root}/${uid}`, {
          received: arr.length,
          totalAfterMerge: this._items.length,
        });

        this._render();
      };

      const onValue = (snap) => apply(snap, "value");
      const onErr = (err) => {
        console.warn(`[notifications] listener error @ ${root}/${uid}:`, err?.message || err);
        this._render();
      };

      // Prime, then live
      ref
        .get()
        .then((snap) => apply(snap, "get"))
        .catch((e) => console.warn(`[notifications] get() failed @ ${root}/${uid}:`, e?.message || e))
        .finally(() => {
          ref.on("value", onValue, onErr);
          this._unbind.push(() => ref.off("value", onValue));
        });
    },

    _render() {
      const { list, badge, debug } = this._els;
      if (!list) return;

      try {
        const count = Array.isArray(this._items) ? this._items.length : 0;
        if (debug) debug.textContent = `items: ${count}`;

        if (count === 0) {
          list.innerHTML = "<em>No notifications</em>";
          if (badge) badge.hidden = true;
          return;
        }

        const unread = this._items.filter((n) => !n.seen).length;
        if (badge) {
          badge.textContent = unread > 99 ? "99+" : String(unread);
          badge.hidden = unread === 0;
        }

        list.innerHTML = this._items.map(renderItem).join("");

        // Bind per-item click
        list.querySelectorAll(".notif-item").forEach((el) => {
          el.addEventListener("click", async () => {
            const payload = JSON.parse(el.getAttribute("data-payload") || "{}");
            try {
              this._navigate(payload);
            } finally {
              await this._markOneRead(payload.path, payload.id).catch(() => {});
            }
          });
        });
      } catch (e) {
        console.warn("[notifications] render error:", e);
        try { list.innerHTML = "<em>Failed to render</em>"; } catch {}
      }
    },

    _navigate(payload) {
      // 1) Reports: open detail or page with deep link
      if (payload.reportId) {
        if (typeof window.openReportDetails === "function") {
          try { window.openReportDetails(payload.reportId); return; } catch {}
        }
        window.location.href = `reports.html?reportId=${encodeURIComponent(payload.reportId)}`;
        return;
      }

      // 2) Adoptions: open the Adoption Requests page for a pet,
      //    optionally deep-link to a specific request (requestId)
      if (payload.petId) {
        const q = new URLSearchParams({ id: String(payload.petId) });
        if (payload.requestId) q.set("requestId", String(payload.requestId));
        window.location.href = `adoptionRequests.html?${q.toString()}`;
        return;
      }
    },

    async _markAllRead() {
      if (!this._uid || this._items.length === 0) return;
      const buckets = new Map(); // path -> updates
      this._items.forEach((n) => {
        if (n.seen) return;
        if (!buckets.has(n.path)) buckets.set(n.path, {});
        buckets.get(n.path)[`${n.id}/seen`] = true;
      });
      const tasks = Array.from(buckets.entries()).map(([path, updates]) =>
        firebase.database().ref(path).child(this._uid).update(updates).catch(() => {})
      );
      await Promise.all(tasks);
    },

    _markOneRead(path, id) {
      if (!this._uid || !path || !id) return Promise.resolve();
      return firebase.database().ref(path).child(this._uid).child(id).child("seen").set(true);
    },
  };

  // ---- helpers ----
  function normalizeUser(id, v) {
    return {
      id,
      path: "notifications",
      type: v.type || "status",
      title:
        v.title ||
        (String(v.type || "").toLowerCase().includes("adopt") ? "Adoption Update" :
         v.type === "message" ? "New message" : "Report Update"),
      body: v.body || "",
      reportId: v.reportId || null,
      // adoption deep-linking support
      petId: v.petId || v.listingId || v.adoptionId || null,
      requestId: v.requestId || null,
      messageId: v.messageId || null,
      status: v.status || null,
      createdAt: Number(v.createdAt || 0),
      seen: !!v.seen,
    };
  }
  function normalizeOrg(id, v) {
    return {
      id,
      path: "orgNotifications",
      type: v.type || "organization",
      title:
        v.title ||
        (String(v.type || "").toLowerCase().includes("adopt") ? "Adoption Notification" : "Organization Notification"),
      body: v.body || "",
      reportId: v.reportId || null,
      // adoption deep-linking support
      petId: v.petId || v.listingId || v.adoptionId || null,
      requestId: v.requestId || null,
      messageId: v.messageId || null,
      status: v.status || null,
      createdAt: Number(v.createdAt || 0),
      seen: !!v.seen,
    };
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
    );
  }
  function timeAgo(ts) {
    const d = Date.now() - Number(ts || 0);
    const m = Math.round(d / 60000);
    if (m <= 1) return "just now";
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.round(h / 24);
    return `${days}d`;
  }
  function renderItem(n) {
    const lower = String(n.type || "").toLowerCase();
    const icon =
      lower.includes("adopt") ? "fa-paw" :
      n.type === "message" ? "fa-message" :
      n.type === "status"  ? "fa-clipboard-check" : "fa-bell";

    const payload = {
      path: n.path,
      id: n.id,
      type: n.type,
      reportId: n.reportId || null,
      // adoption bits for navigation
      petId: n.petId || null,
      requestId: n.requestId || null,
      messageId: n.messageId || null,
      status: n.status || null,
    };

    return `
      <div class="notif-item ${n.seen ? "" : "unread"}"
           data-payload='${JSON.stringify(payload)}'>
        <div class="notif-icon"><i class="fas ${icon}"></i></div>
        <div>
          <div class="notif-title">${escapeHtml(n.title || "Notification")}</div>
          ${n.body ? `<div class="notif-body">${escapeHtml(n.body)}</div>` : ""}
        </div>
        <div class="notif-time">${timeAgo(n.createdAt || Date.now())}</div>
      </div>
    `;
  }

  // expose for debugging
  window.Notifications = Notifications;
  window.NotificationsDebug = () => ({
    initialized: Notifications._initialized,
    uid: Notifications._uid,
    count: Notifications._items.length,
    items: Notifications._items,
    els: Object.keys(Notifications._els || {}),
    dom: {
      dropdowns: document.querySelectorAll("#notif-dropdown").length,
      lists: document.querySelectorAll("#notif-list").length,
    },
  });

  // Guarded auto-init: only if a mount exists and we haven't been initialized by nav.js yet
  document.addEventListener("DOMContentLoaded", () => {
    const mount = document.getElementById("nav-actions-right") || document.querySelector(".app-header");
    if (mount && !Notifications._initialized) Notifications.init({ mount });
  });
})();
