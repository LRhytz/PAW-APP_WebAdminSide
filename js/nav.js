firebase.auth().onAuthStateChanged(user => {
    if (!user) {
      window.location.href = 'index.html';
    } else {
      const msg = document.getElementById('welcome-message');
      if (msg) msg.innerText = `Welcome, ${user.email}`;
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('logout-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
          window.location.href = 'index.html';
        });
      });
    }
  });
  window.openNav = function() {
    document.getElementById("navbar").style.width = "250px";
    document.getElementById("main-content").style.marginLeft = "250px";
    document.getElementById("main-content").style.opacity = "0.5";
  };
  window.closeNav = function() {
    document.getElementById("navbar").style.width = "0";
    document.getElementById("main-content").style.marginLeft = "0";
    document.getElementById("main-content").style.opacity = "1";
  };
  