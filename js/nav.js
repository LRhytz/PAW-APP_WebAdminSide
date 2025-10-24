// js/nav.js
(function () {
  const logoutBtn = document.getElementById('logout-btn');
  const fab = document.getElementById('fab'); // handle FAB visibility

  function openNav() {
    const el = document.getElementById("navbar");
    if (el) el.style.width = "250px";
    document.body.classList.add('nav-open');
  }

  function closeNav() {
    const el = document.getElementById("navbar");
    if (el) el.style.width = "0";
    document.body.classList.remove('nav-open');
  }

  window.openNav = openNav;
  window.closeNav = closeNav;

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await firebase.auth().signOut();
      } finally {
        window.location.href = 'index.html';
      }
    });
  }

  firebase.auth().onAuthStateChanged(() => {
applyRoleVisibility().catch(console.error);
  });
})();
