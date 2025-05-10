document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const errEl = document.getElementById("error-message");

  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value;
    errEl.textContent = "";

    if (!email || !pass) {
      errEl.textContent = "Please enter both email and password.";
      return;
    }

    console.log("Attempting login with email:", email);

    firebase
      .auth()
      .signInWithEmailAndPassword(email, pass)
      .then((cred) => {
        const userId = cred.user.uid;
        const db = firebase.database();

        return db
          .ref("admins/" + userId)
          .once("value")
          .then((adminSnap) => {
            const isAdmin = adminSnap.val() === true;
            console.log("Is Admin:", isAdmin);

            if (isAdmin) {
              console.log("Login as Admin");
              window.location.href = "home.html";
              return;
            }

            // Check if organization
            return db
              .ref("organizations/" + userId)
              .once("value")
              .then((orgSnap) => {
                const isOrg = orgSnap.exists();
                console.log("Is Organization:", isOrg);

                if (isOrg) {
                  console.log("Login as Organization");
                  window.location.href = "organizationDashboard.html";
                } else {
                  console.log("Login as General User");
                  window.location.href = "home.html";
                }
              });
          });
      })
      .catch((err) => {
        console.error("Login error:", err.message);
        errEl.textContent = err.message;
      });
  });
});
