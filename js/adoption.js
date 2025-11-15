// js/adoption.js — full version with Adopted Pets section integrated (and tab toggle added)

(function () {
  // ----------------------------
  // Utils
  // ----------------------------
  function normalizePet(raw, id) {
    const ageText =
      raw.age?.toString().trim() ||
      (typeof raw.ageMonths === "number"
        ? `${raw.ageMonths} month${raw.ageMonths === 1 ? "" : "s"}`
        : "");

    let contactPhone = "";
    let contactEmail = "";
    if (typeof raw.contactInfo === "string") {
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
      imageUrl: raw.imageUrl || raw.photoUrl || "",
      address: raw.address || raw.location || "",
      description: raw.description || "",
      fullDescription: raw.fullDescription || "",
      contactPhone: raw.contactPhone || contactPhone || "",
      contactEmail: raw.contactEmail || contactEmail || "",
      contactLocation: raw.contactLocation || "",
      adoptionStatus: raw.adoptionStatus || "",
      available: raw.available !== undefined ? raw.available : true,
      adoptedBy: raw.adoptedBy || "",
      adoptedAt: raw.adoptedAt || 0,
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
  let allPetsData = [];
  let allAdoptedData = [];

  const activeRequestListeners = {};

  // ----------------------------
  // Entry
  // ----------------------------
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      console.warn("No user signed in");
      window.location.href = "login.html";
      return;
    }

    try {
      loadAdoptionCards(user.uid);
      loadAdoptedPets(user.uid);
      setupSearch();
      setupTabSwitching(); // <-- NEW: connect tabs
    } catch (err) {
      console.error("Init error:", err);
      showEmpty("Error loading organization info.");
    }
  });

  // ----------------------------
  // Load Available Pets
  // ----------------------------
  function showEmpty(msg) {
    const cards = document.getElementById("adoption-cards");
    const empty = document.getElementById("empty-state");
    if (cards) cards.innerHTML = "";
    if (empty) {
      empty.style.display = "flex";
      const p = empty.querySelector("p");
      if (p && msg) p.textContent = msg;
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

        const filteredPets = Object.entries(allPets)
          .filter(([id, pet]) => {
            const orgId = pet.orgId || pet.organizationId || pet.organization;
            return orgId === orgUID && pet.available !== false;
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

  // 1) Add this helper near the top (or above loadAdoptedPets)
async function getAdopterFromFinalizedRequest(orgUID, petId) {
  const ref = firebase.database().ref(`adoptionRequestsByOrg/${orgUID}/${petId}`);
  const snap = await ref.once('value');
  if (!snap.exists()) return null;

  // pick the most recent finalized request
  let chosen = null;
  snap.forEach(cs => {
    const r = cs.val();
    if (r?.status === 'finalized') {
      const t = r.updatedAt || r.createdAt || 0;
      if (!chosen || t > (chosen.updatedAt || chosen.createdAt || 0)) chosen = r;
    }
  });
  return chosen;
}


// ----------------------------
// Load Adopted Pets
// ----------------------------
async function loadAdoptedPets(orgUID) {
  const dbRef = firebase.database().ref("adoptions");

  // Ensure container exists early
  let adoptedSection = document.getElementById("adopted-section");
  if (!adoptedSection) {
    adoptedSection = document.createElement("section");
    adoptedSection.id = "adopted-section";
    adoptedSection.style.display = "none"; // hidden until tab clicked
    adoptedSection.innerHTML = `
      <h2 class="section-title">Adopted Pets</h2>
      <div id="adopted-cards" class="pet-grid"></div>
      <div id="empty-adopted" class="empty-state">
        <i class="fas fa-heart"></i>
        <p>No adopted pets yet</p>
        <span>Once your pets are adopted, they'll show up here</span>
      </div>`;
    document.querySelector(".main-content").appendChild(adoptedSection);
  }

  const adoptedGrid = adoptedSection.querySelector("#adopted-cards");
  const emptyState = adoptedSection.querySelector("#empty-adopted");

  // Listen to database changes
  dbRef.on("value", async (snapshot) => {
    if (!adoptedGrid) return;
    adoptedGrid.innerHTML = "";

    const allPets = snapshot.val();
    if (!allPets) {
      if (emptyState) emptyState.style.display = "flex";
      return;
    }

    const adoptedPets = Object.entries(allPets)
      .filter(([id, pet]) => {
        const orgId = pet.orgId || pet.organizationId || pet.organization;
        return orgId === orgUID && pet.available === false;
      })
      .map(([id, pet]) => normalizePet(pet, id));
      allAdoptedData = adoptedPets; // ✅ store globally for filtering


    if (adoptedPets.length === 0) {
      if (emptyState) emptyState.style.display = "flex";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

// NEW (uses adoptionRequests; no /users read)
for (const pet of adoptedPets) {
  pet.adopterName = "Unknown adopter";
  try {
    const req = await getAdopterFromFinalizedRequest(orgUID, pet.id);
    if (req) {
      pet.adopterName =
        req.requesterName ||
        req.requesterEmail ||
        req.phone ||
        "Unknown adopter";
      pet.adopterEmail = req.requesterEmail || "";
    }
  } catch (e) {
    console.warn("Adopter lookup failed for", pet.id, e);
  }
}

    console.log("✅ Adopted Pets loaded:", adoptedPets.map(p => ({ name: p.name, adopter: p.adopterName })));

    adoptedPets.forEach((p) => adoptedGrid.appendChild(createAdoptedCard(p)));
  });
}


  // ----------------------------
  // Card Builders
  // ----------------------------
  function createPetCard(pet) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.petId = pet.id;

    const tags = ["Friendly", "Neutered", "Playful", "Calm"];
    const randomTags = tags.sort(() => 0.5 - Math.random()).slice(0, 2);

    card.innerHTML = `
      <div class="pet-img-container">
        ${
          pet.imageUrl
            ? `<img src="${pet.imageUrl}" alt="${pet.name}" class="pet-img">`
            : `<img src="/api/placeholder/400/320" alt="placeholder" class="pet-img">`
        }
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
            <span>${pet.address ? pet.address.split(",")[0] : "Unknown"}</span>
          </div>
          <button class="card-btn view-details-btn">
            <i class="fas fa-paw"></i> Details
          </button>
        </div>
      </div>`;
const detailsBtn = card.querySelector(".view-details-btn");
if (detailsBtn) {
const detailsBtn = card.querySelector(".view-details-btn");
if (detailsBtn) {
  detailsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openPetDetails(pet); // 🩵 open modal instead of redirecting
  });
}
}

// Keep the card click to open modal if you want that preview behavior
card.addEventListener("click", () => openPetDetails(pet));
    return card;
  }

  function createAdoptedCard(pet) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="pet-img-container">
        ${
          pet.imageUrl
            ? `<img src="${pet.imageUrl}" alt="${pet.name}" class="pet-img">`
            : `<img src="/api/placeholder/400/320" alt="placeholder" class="pet-img">`
        }
        <div class="pet-badge">Adopted</div>
      </div>
      <div class="card-content">
        <div class="card-header">
          <h3>${pet.name}</h3>
          <span class="card-age">${pet.age}</span>
        </div>
        <div class="card-breed">${pet.breed || "&nbsp;"}</div>
        <p>${pet.description || "No description available."}</p>
        <p><strong>Adopted by:</strong> ${pet.adopterName || "Unknown adopter"}</p>
        <p style="color:#777;font-size:0.85rem;">${
          pet.adoptedAt
            ? "Adopted on: " +
              new Date(pet.adoptedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric"
              })
            : ""
        }</p>
      </div>`;
    return card;
  }

  // ----------------------------
  // Search / Filter
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
  const searchTerm = (searchInput?.value || "").toLowerCase();
  const selectedSpecies = (speciesFilter?.value || "").toLowerCase();

  // Detect which tab is active
  const isAdoptedTab = document.getElementById("tab-adopted")?.classList.contains("active");

  // Select correct dataset & container
  const cardsContainer = document.getElementById(
    isAdoptedTab ? "adopted-cards" : "adoption-cards"
  );
  const dataSource = isAdoptedTab ? allAdoptedData : allPetsData;

  // Filter
  const filtered = dataSource.filter((pet) => {
    const matchesSearch =
      pet.name.toLowerCase().includes(searchTerm) ||
      (pet.breed || "").toLowerCase().includes(searchTerm) ||
      (pet.description || "").toLowerCase().includes(searchTerm);
    const matchesSpecies =
      !selectedSpecies || (pet.species && pet.species.toLowerCase() === selectedSpecies);
    return matchesSearch && matchesSpecies;
  });

  // Clear and repopulate
  cardsContainer.innerHTML = "";
  if (filtered.length === 0) {
    const emptyMsg = isAdoptedTab
      ? "No adopted pets found matching your criteria"
      : "No available pets found matching your criteria";
    showEmpty(emptyMsg);
    return;
  }

  hideEmpty();

  filtered.forEach((p) =>
    cardsContainer.appendChild(
      isAdoptedTab ? createAdoptedCard(p) : createPetCard(p)
    )
  );
}

  // ----------------------------
  // Modal
  // ----------------------------
function openPetDetails(pet) {
  const modal = document.getElementById("pet-modal");
  const content = document.getElementById("pet-details-content");
  if (!modal || !content) return;

  // Populate the modal content
  content.innerHTML = `
    <div class="pet-details-layout">
      <!-- LEFT: Large Image -->
      <div class="pet-details-media">
        <img src="${pet.imageUrl || '/api/placeholder/800/600'}" alt="${pet.name}" />
      </div>

      <!-- RIGHT: Details -->
      <div class="pet-details-info">
        <div class="pet-details-header">
          <h2>${pet.name || "Unnamed Pet"}</h2>
          <div class="pet-details-meta">
            <div class="pet-details-meta-item"><i class="fas fa-paw"></i> ${pet.species || "Unknown"}</div>
            <div class="pet-details-meta-item"><i class="fas fa-ruler-vertical"></i> ${pet.size || "N/A"}</div>
            <div class="pet-details-meta-item"><i class="fas fa-venus-mars"></i> ${pet.gender || "N/A"}</div>
            <div class="pet-details-meta-item"><i class="fas fa-birthday-cake"></i> ${pet.age || "N/A"}</div>
          </div>
        </div>

        <div class="pet-details-section">
          <h3>About ${pet.name}</h3>
          <p class="pet-details-description">${pet.description || "No description available."}</p>
        </div>

        <div class="pet-details-section">
          <h3>Compatibility</h3>
          <dl class="pet-details-table">
            <dt>Good with kids:</dt><dd>${pet.goodWithKids ? "Yes" : "No"}</dd>
            <dt>Good with dogs:</dt><dd>${pet.goodWithDogs ? "Yes" : "No"}</dd>
            <dt>Good with cats:</dt><dd>${pet.goodWithCats ? "Yes" : "No"}</dd>
          </dl>
        </div>

        <div class="pet-details-section">
          <h3>Health & Training</h3>
          <dl class="pet-details-table">
            <dt>Vaccinated:</dt><dd>${pet.vaccinated ? "Yes" : "No"}</dd>
            <dt>Spayed/Neutered:</dt><dd>${pet.neutered ? "Yes" : "No"}</dd>
            <dt>House Trained:</dt><dd>${pet.houseTrained ? "Yes" : "No"}</dd>
          </dl>
        </div>

        <div class="pet-details-section">
          <h3>Contact Information</h3>
          <dl class="pet-details-table">
            <dt>Phone:</dt><dd>${pet.contactPhone || "Not provided"}</dd>
            <dt>Email:</dt><dd>${pet.contactEmail || "Not provided"}</dd>
            <dt>Location:</dt><dd>${pet.address || "Not specified"}</dd>
          </dl>
        </div>
      </div>
    </div>
  `;

  // Show modal
  modal.classList.add("show");

  // --- CLOSE BUTTON ---
  const closeBtn = modal.querySelector(".close-modal");
  if (closeBtn) closeBtn.onclick = () => modal.classList.remove("show");

  // --- EDIT BUTTON ---
  const editBtn = modal.querySelector(".edit-btn");
  if (editBtn) {
    editBtn.onclick = () => {
      modal.classList.remove("show");
      window.location.href = `editAdoption.html?id=${encodeURIComponent(pet.id)}`;
    };
  }

  // --- REQUESTS BUTTON ---
  const reqBtn = modal.querySelector("#viewRequestsBtn");
  if (reqBtn) {
    reqBtn.onclick = () => {
      modal.classList.remove("show");
      window.location.href = `adoptionRequests.html?id=${encodeURIComponent(pet.id)}`;
    };
  }
}




  // ----------------------------
  // Add Button
  // ----------------------------
  const addBtn = document.getElementById("addAdoptionBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => (window.location.href = "addAdoption.html"));
  }

  // ----------------------------
  // Tabs: Available ↔ Adopted
  // ----------------------------
  function setupTabSwitching() {
    const tabAvailable = document.getElementById("tab-available");
    const tabAdopted = document.getElementById("tab-adopted");
    const availableSection = document.getElementById("available-section");
    const adoptedSection = document.getElementById("adopted-section");

    if (!tabAvailable || !tabAdopted || !availableSection || !adoptedSection) return;

    tabAvailable.addEventListener("click", () => {
      tabAvailable.classList.add("active");
      tabAdopted.classList.remove("active");
      availableSection.style.display = "block";
      adoptedSection.style.display = "none";
    });

    tabAdopted.addEventListener("click", () => {
      tabAdopted.classList.add("active");
      tabAvailable.classList.remove("active");
      availableSection.style.display = "none";
      adoptedSection.style.display = "block";
    });
  }

  // ----------------------------
// Back Button (closes modal)
// ----------------------------
const backBtn = document.getElementById("backBtn");
if (backBtn) {
  backBtn.addEventListener("click", () => {
    const modal = document.getElementById("pet-modal");
    if (modal) {
      modal.classList.remove("show"); // hide the modal
      document.body.style.overflow = "auto"; // restore scroll
    }
  });
}

})();
