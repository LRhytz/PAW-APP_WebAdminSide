document.addEventListener('DOMContentLoaded', () => {
  // Check if user is already logged in
  firebase.auth().onAuthStateChanged(user => {
    if (user && window.location.pathname.endsWith('index.html')) {
      console.log("User already logged in. Redirecting to home.");
      window.location.href = 'home.html';  // Redirect to home page
    } else {
      console.log("User not logged in.");
    }
  });

  const form = document.getElementById('login-form');
  const errEl = document.getElementById('error-message');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    errEl.textContent = '';

    console.log('Attempting login with email:', email);

    firebase.auth().signInWithEmailAndPassword(email, pass)
      .then(() => {
        console.log('Login successful');
        window.location.href = 'home.html';  // Redirect after successful login
      })
      .catch(err => {
        console.log('Login error:', err.message);
        errEl.textContent = err.message;  // Show error message if login fails
      });
  });
});
