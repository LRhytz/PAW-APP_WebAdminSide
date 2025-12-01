// File: js/profile-management-org.js  (paste over your current file)
(function () {
  const form = document.getElementById("profile-form");
  const saveBtn = form.querySelector(".btn.save");
  const avatar = document.getElementById("avatar");
  const fileInput = document.getElementById("profileImage");
  const msg = document.getElementById("msg");
  const PLACEHOLDER = "https://placehold.co/96x96";

  // Sidebar toggle (matches your CSS)
  window.openNav = () => document.body.classList.add("nav-open");
  window.closeNav = () => document.body.classList.remove("nav-open");

  // Load current profile
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) { window.location = "index.html"; return; }
    document.getElementById("email").innerText = user.email;

    try {
      const snap = await firebase.database().ref(`users/${user.uid}`).once("value");
      const data = snap.val() || {};
      document.getElementById("orgNames").innerText = data.organizationName || "(not set)";
      document.getElementById("orgName").value = data.organizationName || "";
      avatar.src = data.logoImageUri || PLACEHOLDER;
    } catch (e) {
      console.error("Fetch error:", e);
      msg.innerText = "Error loading profile.";
    }
  });

  // Local preview
  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    if (f) avatar.src = URL.createObjectURL(f); // why: instant feedback
  });

  // Save (rename + photo)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = firebase.auth().currentUser;
    if (!user) return;

    const newName = document.getElementById("orgName").value.trim();
    if (!newName) { msg.innerText = "Organization name is required."; return; }

    saveBtn.disabled = true;
    msg.innerText = "Saving…";

    const updates = { organizationName: newName };

    try {
      const file = fileInput.files[0];
      if (file) {
        // Unique filename avoids cache + orphaned files
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const filename = `avatar_${Date.now()}.${ext}`;
        const ref = firebase.storage().ref(`profile_images/organizations/${user.uid}/${filename}`);
        const snap = await ref.put(file);
        updates.logoImageUri = await snap.ref.getDownloadURL();
      }

      await firebase.database().ref(`users/${user.uid}`).update(updates);

      // Reflect changes immediately (cache-bust img)
      document.getElementById("orgNames").innerText = updates.organizationName || "(not set)";
      if (updates.logoImageUri) avatar.src = `${updates.logoImageUri}#${Date.now()}`;
      fileInput.value = "";

      msg.innerText = "Profile updated!";
    } catch (err) {
      console.error("Save error:", err);
      msg.innerText = err.message || "Failed to update profile.";
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Optional logout
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("logout-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      try { await firebase.auth().signOut(); window.location = "index.html"; }
      catch (e) { alert(e.message || "Failed to logout"); }
    });
  });
})();
