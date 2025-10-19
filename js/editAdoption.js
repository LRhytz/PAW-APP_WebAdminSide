// js/editAdoption.js — rules-aligned edit flow for RTDB "adoptions"

const auth = firebase.auth();
const db   = firebase.database();

document.addEventListener("DOMContentLoaded", () => {
  const editForm     = document.getElementById("editForm");
  const currentImage = document.getElementById("currentImage");
  const logoutBtn    = document.getElementById("logout-btn");

  // Safe placeholder (prevents 404)
  const PLACEHOLDER = "https://placehold.co/400x300?text=Loading+image";

  // Simple toast
  const showNotification = (msg, type = "success") => {
    // Replace with your own toast if you like
    alert(msg);
  };

  // Loading state on the submit button
  const submitButton = editForm.querySelector(".btn-submit");
  const setLoading = (isLoading) => {
    if (isLoading) {
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      submitButton.disabled = true;
    } else {
      submitButton.innerHTML = '<i class="fas fa-save"></i> Save Changes';
      submitButton.disabled = false;
    }
  };

  // Get pet id
  const urlParams = new URLSearchParams(window.location.search);
  const petId = urlParams.get("id");

  if (!petId) {
    showNotification("No pet ID provided.", "error");
    window.location.href = "adoption.html";
    return;
  }

  // Small helpers
  const clampEnum = (val, allowed, fallback = "") =>
    allowed.includes((val || "").toLowerCase()) ? (val || "").toLowerCase() : fallback;

  const toNumber = (v, d = null) => {
    if (v === undefined || v === null || v === "") return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  // Auth gate
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      showNotification("Please sign in to continue", "error");
      window.location.href = "index.html";
      return;
    }

    try {
      currentImage.src = PLACEHOLDER;

      const snap = await db.ref("adoptions/" + petId).once("value");
      const pet = snap.val();
      if (!pet) throw new Error("Pet not found or access denied.");

      // Pre-fill inputs
      document.getElementById("name").value              = pet.name || "";
      document.getElementById("species").value           = pet.species || "";              // dog | cat
      document.getElementById("breed").value             = pet.breed || "";
      document.getElementById("age").value               = pet.ageMonths != null ? String(pet.ageMonths) : ""; // months
      document.getElementById("size").value              = pet.size || "";                 // small | medium | large
      document.getElementById("gender").value            = pet.gender || "";               // male | female
      document.getElementById("description").value       = pet.description || "";
      document.getElementById("fullDescription").value   = pet.description || "";          // we’ll persist into description
      document.getElementById("address").value           = pet.location || "";
      document.getElementById("contactLocation").value   = pet.location || "";
      document.getElementById("contactPhone").value      = pet.contactInfo || "";          // we’ll parse/build contactInfo
      document.getElementById("contactEmail").value      = "";                             // optional; combined in contactInfo

      // Show photo (schema uses photoUrl)
      if (pet.photoUrl) {
        const img = new Image();
        img.onload = () => {
          currentImage.style.opacity = 0;
          currentImage.src = pet.photoUrl;
          requestAnimationFrame(() => (currentImage.style.opacity = 1));
        };
        img.src = pet.photoUrl;
      }

      // Basic rules-aligned validation
      const validateForm = () => {
        let ok = true;

        // Required text fields
        const required = [
          "name", "species", "breed", "age",
          "size", "gender", "description", "fullDescription",
          "address", "contactLocation", "contactPhone"
        ];

        required.forEach(id => {
          const el = document.getElementById(id);
          if (!el.value.trim()) {
            el.classList.add("error");
            ok = false;
          } else {
            el.classList.remove("error");
          }
        });

        // Enums & numbers (RTDB rules)
        const species = clampEnum(document.getElementById("species").value, ["dog", "cat"]);
        const size    = clampEnum(document.getElementById("size").value, ["small", "medium", "large"]);
        const gender  = clampEnum(document.getElementById("gender").value, ["male", "female"], "");

        const ageMonths = toNumber(document.getElementById("age").value, null);

        if (!species) ok = false;
        if (!size) ok = false;
        if (!gender) ok = false;
        if (ageMonths === null || ageMonths < 0 || ageMonths > 240) ok = false;

        return ok;
      };

      // Submit
      editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateForm()) {
          showNotification("Please fix highlighted fields (check species/size/gender and age in months).", "error");
          return;
        }

        setLoading(true);

        // Build contactInfo string from phone/email (RTDB uses a single string)
        const phone = (document.getElementById("contactPhone").value || "").trim();
        const email = (document.getElementById("contactEmail").value || "").trim();
        let contactInfo = phone;
        if (email) {
          contactInfo = contactInfo ? `${phone} • ${email}` : email;
        }

        // Compose updates strictly with fields allowed by your rules
        const updates = {
          // required by rules (and unchanged by us): id/orgId exist in the node already
          name: (document.getElementById("name").value || "").trim().slice(0, 120),
          species: clampEnum(document.getElementById("species").value, ["dog", "cat"]),
          size: clampEnum(document.getElementById("size").value, ["small", "medium", "large"]),
          breed: (document.getElementById("breed").value || "").trim(),
          gender: clampEnum(document.getElementById("gender").value, ["male", "female"], undefined),
          ageMonths: toNumber(document.getElementById("age").value, 0),
          description: (document.getElementById("fullDescription").value || document.getElementById("description").value || "").trim().slice(0, 2000),
          location: (document.getElementById("address").value || "").trim().slice(0, 300),
          contactInfo: contactInfo.slice(0, 500),

          // keep existing photo url name (schema: photoUrl)
          photoUrl: pet.photoUrl || null,

          updatedAt: Date.now()
        };

        try {
          await db.ref("adoptions/" + petId).update(updates);
          showNotification("Pet details updated!");
          setTimeout(() => (window.location.href = "adoption.html"), 800);
        } catch (err) {
          console.error(err);
          showNotification("Failed to update pet details. Please try again.", "error");
          setLoading(false);
        }
      });
    } catch (err) {
      console.error(err);
      showNotification("Could not load pet data.", "error");
      setTimeout(() => (window.location.href = "adoption.html"), 1500);
    }
  });

  // Logout
  logoutBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to log out?")) {
      auth.signOut().then(() => (window.location.href = "index.html"));
    }
  });

  // Inline styles for validation emphasis
  const style = document.createElement("style");
  style.textContent = `
    .form-group input.error, .form-group textarea.error {
      border-color: #f44336;
      background-color: rgba(244,67,54,.05);
    }
    .form-group input.error:focus, .form-group textarea.error:focus {
      box-shadow: 0 0 0 3px rgba(244,67,54,.15);
    }
    #currentImage { transition: opacity .25s ease; }
  `;
  document.head.appendChild(style);
});
