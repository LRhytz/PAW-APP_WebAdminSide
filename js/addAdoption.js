// js/addAdoption.js
(function () {
  const auth = firebase.auth();
  const db = firebase.database();
  const storage = firebase.storage();

  const form = document.getElementById("adoptionForm");
  const imageFileEl = document.getElementById("imageFile");
  const previewImg = document.getElementById("previewImg");
  const submitBtn = document.getElementById("submitBtn");

  // Preview image immediately
  imageFileEl.addEventListener("change", () => {
    const f = imageFileEl.files && imageFileEl.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e => (previewImg.src = e.target.result);
    reader.readAsDataURL(f);
  });

  // Require auth and role=organization
  auth.onAuthStateChanged(async (u) => {
    if (!u) return (window.location = "index.html");

    try {
      const snap = await db.ref("users/" + u.uid).once("value");
      const role = ((snap.val() || {}).role || "").toString().toLowerCase();
      if (role !== "organization") {
        // not an org user
        return (window.location = "home.html");
      }
    } catch (e) {
      console.warn("Could not validate role; allowing but this user may not be org.", e);
    }
  });

  function val(id) { return document.getElementById(id).value.trim(); }
  function bool(id) { return document.getElementById(id).checked === true; }
  function num(id) {
    const n = Number(document.getElementById(id).value);
    return isNaN(n) ? 0 : n;
  }

  async function uploadImage(userId, pushId, file) {
    const ref = storage.ref(`adoption_photos/${userId}/${pushId}.jpg`);
    await ref.put(file);
    return await ref.getDownloadURL();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const file = imageFileEl.files && imageFileEl.files[0];
    if (!file) {
      alert("Please select a photo.");
      return;
    }

    // Disable button while saving
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Posting...`;

    try {
      // Generate id first
      const newRef = db.ref("adoptions").push();
      const id = newRef.key;

      // Upload photo
      const photoUrl = await uploadImage(user.uid, id, file);

      // Build exactly your RTDB schema
      const payload = {
        id,                                     // "-OZ3Tgj4jqpApd0263N8"
        orgId: user.uid,                        // "iPtRXxir5cZbpstp36y2dRaGckQ2"
        species: val("species").toLowerCase(),  // "cat" | "dog"
        name: val("name"),                      // "Kahel"
        breed: val("breed"),                    // "orange spotted cat"
        ageMonths: num("ageMonths"),            // 24
        gender: val("gender").toLowerCase(),    // "male" | "female"
        size: val("size").toLowerCase(),        // "small" | "medium" | "large"
        weightLbs: num("weightLbs"),           // 25
        spayedNeutered: bool("spayedNeutered"),
        vaccinated: bool("vaccinated"),
        microchipped: bool("microchipped"),
        goodWithKids: bool("goodWithKids"),
        goodWithDogs: bool("goodWithDogs"),
        goodWithCats: bool("goodWithCats"),
        houseTrained: bool("houseTrained"),
        description: val("description"),
        contactInfo: val("contactInfo"),        // "092980023632 / paws@example.com"
        location: val("location"),              // "Lahug Cebu city"
        photoUrl,
        createdAt: Date.now()
      };

      // Write to /adoptions/{id}
      await newRef.set(payload);

      // Secondary index to support filters (matches your “adoptionsBySpecies”)
      await db.ref(`adoptionsBySpecies/${payload.species}/${id}`).set(true);

      alert("Pet posted successfully!");
      window.location = "adoption.html";
    } catch (err) {
      console.error(err);
      alert("Failed to post. " + err.message);
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fas fa-paw"></i> Post Pet for Adoption`;
    }
  });

  // Logout on sidebar button (if clicked)
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await auth.signOut();
      window.location = "index.html";
    });
  }
})();
