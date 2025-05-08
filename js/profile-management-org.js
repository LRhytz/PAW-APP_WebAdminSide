const form = document.getElementById("profile-form");
const avatar = document.getElementById("avatar");
const fileInput = document.getElementById("profileImage");
const msg = document.getElementById("msg");

firebase.auth().onAuthStateChanged((user) => {
  if (!user) {
    window.location = "index.html";
    return;
  }

  const uid = user.uid;
  document.getElementById("email").innerText = user.email;

  // Fetch the organization profile data
  firebase
    .database()
    .ref(`organizations/${uid}`)
    .once("value")
    .then((snapshot) => {
      const data = snapshot.val() || {};
      const orgName = data.orgName || "(not set)";
      const profileImageUrl =
        data.profileImage || "https://via.placeholder.com/96";

      document.getElementById("orgNames").innerText = orgName;
      document.getElementById("orgName").value = data.orgName || "";

      // Log and set the profile image
      console.log("Fetched profile image URL:", profileImageUrl);
      avatar.src = profileImageUrl;
    })
    .catch((error) => {
      console.error("Error fetching data: ", error);
      msg.innerText = "Error loading profile.";
    });
});

// Handle preview of the new avatar
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) avatar.src = URL.createObjectURL(file);
});

// Save changes to the profile
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const user = firebase.auth().currentUser;
  if (!user) return;

  const uid = user.uid;
  const orgNameValue = document.getElementById("orgName").value.trim();
  const updates = { orgName: orgNameValue };

  const file = fileInput.files[0];
  let promise = Promise.resolve();

  // If there is a file, upload and get the download URL
  if (file) {
    const ref = firebase
      .storage()
      .ref(`profile_images/organizations/${uid}/${file.name}`);
    promise = ref
      .put(file)
      .then((snap) => snap.ref.getDownloadURL())
      .then((url) => {
        updates.profileImage = url;
      });
  }

  // Update the organization profile
  promise
    .then(() => firebase.database().ref(`organizations/${uid}`).update(updates))
    .then(() => {
      msg.innerText = "Profile updated!";
    })
    .catch((err) => {
      msg.innerText = err.message;
    });
});
