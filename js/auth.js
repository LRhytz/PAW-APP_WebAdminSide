document.addEventListener("DOMContentLoaded", () => {
  firebase.auth().onAuthStateChanged((user) => {
    if (user && window.location.pathname.endsWith("index.html")) {
      const userId = user.uid;
      const db = firebase.database();

      db.ref("admins/" + userId)
        .once("value")
        .then((snapshot) => {
          if (snapshot.exists()) {
            console.log("User is an admin. Redirecting to home.");
            window.location.href = "home.html";
          } else {
            return db.ref("organizations/" + userId).once("value");
          }
        })
        .then((snapshot) => {
          if (snapshot && snapshot.exists()) {
            console.log(
              "User is an organization. Redirecting to org dashboard."
            );
            window.location.href = "organizationDashboard.html";
          } else if (user) {
            console.log("User is general. Redirecting to home.");
            window.location.href = "home.html";
          }
        })
        .catch((err) => {
          console.error("Database check error:", err);
        });
    } else {
      console.log("User not logged in.");
    }
  });

  const form = document.getElementById("login-form");
  const errEl = document.getElementById("error-message");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value;
    errEl.textContent = "";

    console.log("Attempting login with email:", email);

    firebase
      .auth()
      .signInWithEmailAndPassword(email, pass)
      .then((cred) => {
        const userId = cred.user.uid;
        const db = firebase.database();

        db.ref("admins/" + userId)
          .once("value")
          .then((snapshot) => {
            if (snapshot.exists()) {
              console.log("Login as Admin");
              window.location.href = "home.html";
            } else {
              return db.ref("organizations/" + userId).once("value");
            }
          })
          .then((snapshot) => {
            if (snapshot && snapshot.exists()) {
              console.log("Login as Organization");
              window.location.href = "organizationDashboard.html";
            } else {
              console.log("Login as General User");
              window.location.href = "home.html";
            }
          });
      })
      .catch((err) => {
        console.log("Login error:", err.message);
        errEl.textContent = err.message;
      });
  });
});
