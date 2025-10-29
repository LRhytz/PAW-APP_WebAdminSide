const form = document.getElementById("profile-form");
const avatar = document.getElementById("avatar");
const fileInput = document.getElementById("profileImage");
const toastContainer = document.getElementById("toast-container");

// ✅ Toast message
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 50);
  setTimeout(() => toast.remove(), 3000);
}

// ✅ Firebase Auth listener
firebase.auth().onAuthStateChanged((user) => {
  if (!user) {
    window.location = "index.html";
    return;
  }
  const uid = user.uid;
  document.getElementById("email").innerText = user.email;

  firebase
    .database()
    .ref(`admins/${uid}`)
    .once("value")
    .then((snapshot) => {
      const data = snapshot.val() || {};
      const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ");
      document.getElementById("name").innerText = fullName || "(not set)";
      document.getElementById("firstName").value = data.firstName || "";
      document.getElementById("lastName").value = data.lastName || "";
      avatar.src = data.profileImage || "https://via.placeholder.com/96";
    })
    .catch(console.error);
});

// ✅ Avatar preview
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) avatar.src = URL.createObjectURL(file);
});

// ✅ Save changes
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const user = firebase.auth().currentUser;
  if (!user) return;

  const uid = user.uid;
  const updates = {
    firstName: document.getElementById("firstName").value.trim(),
    lastName: document.getElementById("lastName").value.trim(),
    updatedAt: firebase.database.ServerValue.TIMESTAMP,
  };

  const file = fileInput.files[0];
  const btn = form.querySelector(".btn.save");
  btn.disabled = true;

  let promise = Promise.resolve();
  if (file) {
    const ref = firebase.storage().ref(`admin_profiles/${uid}/${file.name}`);
    const uploadTask = ref.put(file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        showToast(`Uploading ${pct.toFixed(0)}%...`, "info");
      },
      (err) => showToast(err.message, "error"),
      () =>
        uploadTask.snapshot.ref.getDownloadURL().then((url) => {
          updates.profileImage = url;
          firebase
            .database()
            .ref(`admins/${uid}`)
            .update(updates)
            .then(() => showToast("Profile updated successfully!"))
            .catch((err) => showToast(err.message, "error"))
            .finally(() => (btn.disabled = false));
        })
    );
  } else {
    promise = firebase
      .database()
      .ref(`admins/${uid}`)
      .update(updates)
      .then(() => showToast("Profile updated successfully!"))
      .catch((err) => showToast(err.message, "error"))
      .finally(() => (btn.disabled = false));
  }
});
