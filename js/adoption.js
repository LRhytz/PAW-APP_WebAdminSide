// js/adoption.js — RTDB schema–aware (orgId/photoUrl/location/ageMonths)

(function () {
  // ----------------------------
  // Utils: normalize a raw RTDB pet to the UI shape expected by the page
  // ----------------------------
  function normalizePet(raw, id) {
    const ageText =
      raw.age?.toString().trim() ||
      (typeof raw.ageMonths === "number"
        ? `${raw.ageMonths} month${raw.ageMonths === 1 ? "" : "s"}`
        : "");

    // contactInfo in your sample looks like a phone; try to split into phone/email if present
    let contactPhone = "";
    let contactEmail = "";
    if (typeof raw.contactInfo === "string") {
      // very light parsing: pull the first email and first phone-ish sequence
      const emailMatch = raw.contactInfo.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const phoneMatch = raw.contactInfo.match(/(\+?\d[\d\s-]{6,})/);
      contactEmail = emailMatch ? emailMatch[0] : "";
      contactPhone = phoneMatch ? phoneMatch[0].replace(/\s+/g, " ").trim() : raw.contactInfo;
    }

    return {
      id: id || raw.id || "",
      orgId: raw.orgId || raw.organizationId || raw.organization || "",
      name: raw.name || "Unnamed",
      species: raw.species || raw.type || "",
      breed: raw.breed || "",
      age: ageText || "—",
      size: raw.size || "",
      gender: raw.gender || "",
      // images / location
      imageUrl: raw.imageUrl || raw.photoUrl || "",
      address: raw.address || raw.location || "",
      // descriptions
      description: raw.description || "",
      fullDescription: raw.fullDescription || "",
      // contact
      contactPhone: raw.contactPhone || contactPhone || "",
      contactEmail: raw.contactEmail || contactEmail || "",
      contactLocation: raw.contactLocation || "",
      // misc flags (map common ones)
      adoptionStatus: raw.adoptionStatus || "",
      goodWithKids: !!raw.goodWithKids,
      goodWithDogs: !!raw.goodWithDogs,
      goodWithCats: !!raw.goodWithCats,
      vaccinated: raw.vaccinated,
      neutered: raw.neutered || raw.spayedNeutered,
      houseTrained: raw.houseTrained,
      health: raw.health || ""
    };
  }

  // ----------------------------
  // State
  // ----------------------------
  let allPetsData = []; // normalized pets for current org

  // ----------------------------
  // Entry: auth -> load -> wire filters
  // ----------------------------
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      console.warn("No user signed in");
      window.location.href = "login.html";
      return;
    }

    try {
      // We don’t block if organizations/<uid> is missing; we just filter by orgId
      loadAdoptionCards(user.uid);
      setupSearch();
    } catch (err) {
      console.error("Init error:", err);
      showEmpty("Error loading organization info.");
    }
  });

  // ----------------------------
  // Load + render
  // ----------------------------
  function showEmpty(msg) {
    const cards = document.getElementById("adoption-cards");
    const empty = document.getElementById("empty-state");
    if (cards) cards.innerHTML = "";
    if (empty) {
      empty.style.display = "flex";
      if (msg) {
        const p = empty.querySelector("p");
        if (p) p.textContent = msg;
      }
    }
  }

  function hideEmpty() {
    const empty = document.getElementById("empty-state");
    if (empty) empty.style.display = "none";
  }

  function loadAdoptionCards(orgUID) {
    const dbRef = firebase.database().ref("adoptions");
    const cardsContainer = document.getElementById("adoption-cards");

    dbRef.on(
      "value",
      (snapshot) => {
        const allPets = snapshot.val();
        cardsContainer.innerHTML = "";

        if (!allPets) {
          showEmpty();
          return;
        }

        // Filter by orgId
        const filteredPets = Object.entries(allPets)
          .filter(([id, pet]) => {
            const orgId = pet.orgId || pet.organizationId || pet.organization;
            return orgId === orgUID;
          })
          .map(([id, pet]) => normalizePet(pet, id));

        allPetsData = filteredPets;

        if (filteredPets.length === 0) {
          showEmpty("No pets for this organization yet.");
          return;
        }

        hideEmpty();
        filteredPets.forEach((pet) => cardsContainer.appendChild(createPetCard(pet)));
      },
      (err) => {
        console.error("RTDB read error:", err);
        showEmpty("Error loading adoptions.");
      }
    );
  }

  // ----------------------------
  // UI builders
  // ----------------------------
  function createPetCard(pet) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.petId = pet.id;

    const tags = ["Friendly", "Neutered", "House-trained", "Playful", "Calm"];
    const randomTags = tags.sort(() => 0.5 - Math.random()).slice(0, 2);

    card.innerHTML = `
      <div class="pet-img-container">
        ${
          pet.imageUrl
            ? `<img src="${pet.imageUrl}" alt="${pet.name}" class="pet-img">`
            : `<img src="/api/placeholder/400/320" alt="placeholder" class="pet-img">`
        }
        ${pet.adoptionStatus === "urgent" ? '<div class="pet-badge">Urgent</div>' : ""}
      </div>
      <div class="card-content">
        <div class="card-header">
          <h3>${pet.name}</h3>
          <span class="card-age">${pet.age}</span>
        </div>
        <div class="card-breed">${pet.breed || "&nbsp;"}</div>
        <p>${pet.description || "No description available."}</p>
        <div class="card-tags">
          ${randomTags.map((t) => `<span class="card-tag">${t}</span>`).join("")}
        </div>
        <div class="card-footer">
          <div class="card-location">
            <i class="fas fa-map-marker-alt"></i>
            <span>${pet.address ? pet.address.split(",")[0] : "Unknown location"}</span>
          </div>
          <button class="card-btn view-details-btn">
            <i class="fas fa-paw"></i> Details
          </button>
        </div>
      </div>
    `;

    card.addEventListener("click", () => openPetDetails(pet));
    return card;
  }

  // ----------------------------
  // Search / filter
  // ----------------------------
  function setupSearch() {
    const searchInput = document.getElementById("pet-search");
    const speciesFilter = document.getElementById("species-filter");
    if (searchInput) searchInput.addEventListener("input", filterPets);
    if (speciesFilter) speciesFilter.addEventListener("change", filterPets);
  }

  function filterPets() {
    const searchInput = document.getElementById("pet-search");
    const speciesFilter = document.getElementById("species-filter");
    const cardsContainer = document.getElementById("adoption-cards");

    const searchTerm = (searchInput?.value || "").toLowerCase();
    const selectedSpecies = (speciesFilter?.value || "").toLowerCase();

    const filtered = allPetsData.filter((pet) => {
      const matchesSearch =
        pet.name.toLowerCase().includes(searchTerm) ||
        (pet.breed || "").toLowerCase().includes(searchTerm) ||
        (pet.description || "").toLowerCase().includes(searchTerm);

      const matchesSpecies =
        !selectedSpecies || (pet.species && pet.species.toLowerCase() === selectedSpecies);

      return matchesSearch && matchesSpecies;
    });

    cardsContainer.innerHTML = "";
    if (filtered.length === 0) {
      showEmpty("No pets found matching your criteria");
      return;
    }
    hideEmpty();
    filtered.forEach((p) => cardsContainer.appendChild(createPetCard(p)));
  }

  // ----------------------------
  // Modal (uses normalized pet)
  // ----------------------------
  function openPetDetails(pet) {
    const modal = document.getElementById("pet-modal");
    const content = document.getElementById("pet-details-content");
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="pet-details-media">
        ${
          pet.imageUrl
            ? `<img src="${pet.imageUrl}" alt="${pet.name}">`
            : `<img src="/api/placeholder/800/600" alt="placeholder">`
        }
        <div class="pet-details-gallery">
          ${pet.imageUrl ? `<div class="gallery-thumb active"><img src="${pet.imageUrl}" alt="${pet.name}"></div>` : ""}
          <div class="gallery-thumb"><img src="/api/placeholder/100/100" alt="placeholder"></div>
          <div class="gallery-thumb"><img src="/api/placeholder/100/100" alt="placeholder"></div>
        </div>
      </div>
      <div class="pet-details-info">
        <div class="pet-details-header">
          <h2>${pet.name}</h2>
          <div class="pet-details-meta">
            <div class="pet-details-meta-item"><i class="fas fa-dog"></i><span>${pet.species || "Unknown"}</span></div>
            <div class="pet-details-meta-item"><i class="fas fa-birthday-cake"></i><span>${pet.age}</span></div>
            <div class="pet-details-meta-item"><i class="fas fa-venus-mars"></i><span>${pet.gender || "Unknown"}</span></div>
          </div>
        </div>

        <div class="pet-details-section">
          <h3>About ${pet.name}</h3>
          <p class="pet-details-description">${pet.fullDescription || pet.description || "No description available."}</p>
        </div>

        <div class="pet-details-section">
          <h3>Details</h3>
          <div class="pet-details-table">
            <dt>Breed</dt><dd>${pet.breed || "—"}</dd>
            <dt>Size</dt><dd>${pet.size || "—"}</dd>
            <dt>Location</dt><dd>${pet.address || "Unknown location"}</dd>
            <dt>Special Needs</dt><dd>${pet.specialNeeds || "None"}</dd>
          </div>
        </div>

        <div class="pet-details-contact">
          <h3>Adoption Status</h3>
          <div class="contact-info">
            <dt><i class="fas fa-clipboard-check"></i> Status</dt>
            <dd>${pet.adoptionStatus || "Available"}</dd>
          </div>
        </div>
      </div>
    `;

    modal.classList.add("show");

    // Close
    modal.querySelector(".close-modal").onclick = () => modal.classList.remove("show");
    if (!modal._outsideHandler) {
      modal._outsideHandler = (e) => {
        if (e.target === modal) modal.classList.remove("show");
      };
      modal.addEventListener("click", modal._outsideHandler);
    }

    // Edit page
    const editBtn = modal.querySelector(".edit-btn");
    if (editBtn) editBtn.onclick = () => (window.location.href = `editAdoption.html?id=${pet.id}`);

    // Requests button + badge
    const viewBtn = modal.querySelector("#viewRequestsBtn");
    const badge = modal.querySelector("#request-badge");
    if (badge) badge.style.visibility = "hidden";
    if (viewBtn) viewBtn.onclick = () => (window.location.href = `adoptionRequests.html?petId=${pet.id}`);

    firebase
      .database()
      .ref("adoptionApplications")
      .orderByChild("petId")
      .equalTo(pet.id)
      .on("value", (snap) => {
        if (!badge) return;
        const count = snap.numChildren();
        badge.textContent = count;
        badge.style.visibility = count > 0 ? "visible" : "hidden";
      });

    // thumbs
    modal.querySelectorAll(".gallery-thumb").forEach((thumb) => {
      thumb.onclick = () => {
        modal.querySelectorAll(".gallery-thumb").forEach((t) => t.classList.remove("active"));
        thumb.classList.add("active");
        modal.querySelector(".pet-details-media > img").src = thumb.querySelector("img").src;
      };
    });
  }

  // ----------------------------
  // “Add Adoption” FAB
  // ----------------------------
  const addBtn = document.getElementById("addAdoptionBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => (window.location.href = "addAdoption.html"));
  }
})();
