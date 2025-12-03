// ===================
// /js/nav.js
// ===================
(function () {
  const logoutBtn = document.getElementById("logout-btn");

  // ===================
  // Sidebar open/close controls
  // ===================
  function openNav() {
    const el = document.getElementById("navbar");
    if (el) el.style.width = "250px";
    document.body.classList.add("nav-open");
  }

  function closeNav() {
    const el = document.getElementById("navbar");
    if (el) el.style.width = "0";
    document.body.classList.remove("nav-open");
  }

  // Make them globally available for HTML buttons
  window.openNav = openNav;
  window.closeNav = closeNav;

  // ===================
  // Safe logout handler
  // ===================
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await firebase.auth().signOut();
      } catch (err) {
        console.error("Logout failed:", err);
      } finally {
        window.location.href = "index.html";
      }
    });
  }

  // ===================
  // Helpers: nav mount for actions (notifications, etc.)
  // ===================
  function ensureActionsMount() {
    let mount = document.getElementById("nav-actions-right");
    if (!mount) {
      const header = document.querySelector(".app-header");
      if (header) {
        mount = document.createElement("div");
        mount.id = "nav-actions-right";
        mount.style.display = "inline-flex";
        mount.style.alignItems = "center";
        mount.style.gap = "10px";
        header.appendChild(mount);
      }
    }
    return mount;
  }

  // ===================
  // Notifications bootstrap (if notifications.js is present)
  // ===================
  function initNotificationsIfAvailable(user) {
    try {
      const mount = ensureActionsMount();
      if (!mount) return;

      // Optional: avoid double init
      if (mount.__notificationsMounted) return;

      if (window.Notifications && typeof window.Notifications.init === "function") {
        window.Notifications.init({
          mount,
          // You can pass options here if your module supports them:
          // e.g., maxItems: 20, pollMs: 0 (realtime), menuAlign: 'right'
        });
        mount.__notificationsMounted = true;
      } else {
        // Graceful placeholder so layout doesn't jump if notifications.js isn't loaded yet
        if (!mount.querySelector(".notif-placeholder")) {
          const btn = document.createElement("button");
          btn.className = "notif-placeholder";
          btn.style.background = "transparent";
          btn.style.border = "0";
          btn.style.color = "#fff";
          btn.style.fontSize = "18px";
          btn.style.cursor = "default";
          btn.title = "Notifications";
          btn.innerHTML = '<i class="fas fa-bell"></i>';
          mount.appendChild(btn);
        }
      }
    } catch (e) {
      console.warn("initNotificationsIfAvailable error:", e);
    }
  }

  // ===================
  // Role-based visibility
  // ===================
  async function applyRoleVisibility() {
    try {
      const user = firebase.auth().currentUser;
      if (!user) return;

      const db = firebase.database();
      const snap = await db.ref("users/" + user.uid).once("value");
      const data = snap.val() || {};
      const role = (data.role || "").toLowerCase();

      document.querySelectorAll(".nav-links a").forEach((link) => {
        const allowed =
          !role ||
          (role === "organization" && !link.href.includes("citizen")) ||
          (role === "citizen" && !link.href.includes("organization"));

        link.style.display = allowed ? "" : "none";
      });

      console.log(`👤 Role visibility applied for: ${role}`);
    } catch (err) {
      console.warn("applyRoleVisibility error:", err);
    }
  }

  // ===================
  // Highlight active page
  // ===================
  function highlightActiveNav() {
    const currentPage = window.location.pathname.split("/").pop();
    document.querySelectorAll(".nav-links a").forEach((link) => {
      const hrefPage = link.getAttribute("href").split("/").pop();
      if (hrefPage === currentPage) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }

  // ===================
  // Initialize after Auth + ensure DOM ready
  // ===================
  firebase.auth().onAuthStateChanged((user) => {
    // Mount the right-side actions container early
    ensureActionsMount();

    applyRoleVisibility()
      .then(() => {
        setTimeout(() => {
          highlightActiveNav();

          // Close sidebar when clicking a nav link (better mobile UX)
          document.querySelectorAll(".nav-links a").forEach((link) => {
            link.addEventListener("click", () => closeNav());
          });

          // Try to initialize notifications (if module is loaded)
          initNotificationsIfAvailable(user);
        }, 100);
      })
      .catch(console.error);
  });

  // Also try once after DOM has fully loaded (covers anonymous / delayed script load)
  window.addEventListener("DOMContentLoaded", () => {
    ensureActionsMount();
    initNotificationsIfAvailable(firebase.auth().currentUser);
  });
})();
