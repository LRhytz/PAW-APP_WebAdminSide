// js/nav.js
document.addEventListener('DOMContentLoaded', () => {
  // 1) Sidebar open/close helpers (for your ☰ Menu and × buttons)
  window.openNav = () => {
    document.getElementById('navbar').style.width        = '250px';
    document.getElementById('main-content').style.marginLeft = '250px';
  };
  window.closeNav = () => {
    document.getElementById('navbar').style.width        = '0';
    document.getElementById('main-content').style.marginLeft = '0';
  };

  // 2) Logout button (assumes <a id="logout-btn"> in your markup)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      firebase.auth().signOut()
        .then(() => { window.location.href = 'index.html'; })
        .catch(err => console.error('Logout error:', err));
    });
  }

  // 3) Highlight the “active” link based on current URL
  const currentPage = window.location.pathname.split('/').pop(); 
  document
    .querySelectorAll('#navbar a[href$=".html"]')
    .forEach(link => {
      if (link.getAttribute('href') === currentPage) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
});
