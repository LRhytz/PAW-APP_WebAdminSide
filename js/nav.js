// ===================
// /js/nav.js
// ===================
(function () {
  const logoutBtn = document.getElementById("logout-btn");
  const fab = document.getElementById("fab"); // handle FAB visibility

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
  // ✅ Safe logout handler
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
  // ✅ Role-based visibility
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
  // ✅ Highlight active page
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
  // ✅ Initialize after Auth + ensure DOM ready
  // ===================
  firebase.auth().onAuthStateChanged(() => {
    applyRoleVisibility()
      .then(() => {
        // small delay ensures DOM + role filters fully applied
        setTimeout(() => {
          highlightActiveNav();

          // Optional: close sidebar when clicking a nav link (mobile UX)
          document.querySelectorAll(".nav-links a").forEach((link) => {
            link.addEventListener("click", () => closeNav());
          });
        }, 100);
      })
      .catch(console.error);
  });
})();
