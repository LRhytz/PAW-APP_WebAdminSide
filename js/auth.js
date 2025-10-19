document.addEventListener("DOMContentLoaded", () => {
  if (firebase?.apps?.length) {
    try {
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (e) {}
  }

  const form = document.getElementById("login-form");
  const errEl = document.getElementById("error-message");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value;
    if (errEl) errEl.textContent = "";
    if (!email || !pass) {
      if (errEl) errEl.textContent = "Please enter both email and password.";
      return;
    }

    firebase
      .auth()
      .signInWithEmailAndPassword(email, pass)
      .then(async (cred) => {
        const userId = cred.user.uid;
        const db = firebase.database();

        const adminSnap = await db.ref("admins/" + userId).once("value");
        const isAdmin = adminSnap.val() === true;
        if (isAdmin) {
          localStorage.setItem("sessionRole", "admin");
          localStorage.setItem("sessionUid", userId);
          await cred.user.getIdToken(true);
          window.location.href = "home.html";
          return;
        }

        const userSnap = await db.ref("users/" + userId).once("value");
        if (!userSnap.exists()) {
          localStorage.setItem("sessionRole", "general");
          localStorage.setItem("sessionUid", userId);
          await cred.user.getIdToken(true);
          window.location.href = "home.html";
          return;
        }

        const role = ((userSnap.val() || {}).role || "")
          .toString()
          .toLowerCase();

        if (role === "citizen") {
          if (errEl)
            errEl.textContent = "Only admins or organizations can sign in.";
          try {
            await firebase.auth().signOut();
          } catch {}
          return;
        }
        if (role === "organization") {
          localStorage.setItem("sessionRole", "organization");
          localStorage.setItem("sessionUid", userId);
          await cred.user.getIdToken(true);
          window.location.href = "organizationDashboard.html";
          return;
        }
        localStorage.setItem("sessionRole", "general");
        localStorage.setItem("sessionUid", userId);
        await cred.user.getIdToken(true);
        window.location.href = "home.html";
      })
      .catch((err) => {
        if (errEl) errEl.textContent = err?.message || "Could not sign you in.";
      });
  });
});
