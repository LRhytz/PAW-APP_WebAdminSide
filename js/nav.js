// js/nav.js
(function () {
  // Elements used across pages (ignore if not present on a given page)
  const logoutBtn = document.getElementById('logout-btn');

  function openNav() {
    const el = document.getElementById("navbar");
    if (el) el.style.width = "250px";
  }
  function closeNav() {
    const el = document.getElementById("navbar");
    if (el) el.style.width = "0";
  }
  window.openNav = openNav;
  window.closeNav = closeNav;

  // Wire up logout if button exists
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await firebase.auth().signOut();
      } finally {
        window.location.href = 'index.html';
      }
    });
  }

  // Show/hide links based on admin; DOES NOT read /users
  async function applyRoleVisibility() {
    try {
      const user = firebase.auth().currentUser;
      const links = document.querySelectorAll('.nav-links a');
      if (!user || links.length === 0) return;

      const v = (await firebase.database().ref(`admins/${user.uid}`).once('value')).val();
      const isAdmin = v === true || (v && v.isAdmin === true);

      // Example (disabled by default). If you add data-role="admin" on links, uncomment:
      // links.forEach(a => {
      //   if (a.dataset.role === 'admin') a.style.display = isAdmin ? '' : 'none';
      // });
    } catch (e) {
      console.warn('applyRoleVisibility error:', e);
    }
  }

  firebase.auth().onAuthStateChanged(() => {
    applyRoleVisibility().catch(console.error);
  });
})();
