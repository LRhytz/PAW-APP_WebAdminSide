firebase.auth().onAuthStateChanged(user => {
    if (user && window.location.pathname.endsWith('index.html')) {
      window.location.href = 'home.html';
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const email    = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const errEl    = document.getElementById('error-message');
      firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => { window.location.href = 'home.html'; })
        .catch(err => { errEl.innerText = err.message; });
    });
  });
  