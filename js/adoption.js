// File: js/adoption.js

// 🔒 Auth check & initial load
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    const orgUID = user.uid;

    // 🔍 Fetch org info from "organizations" node
    firebase
      .database()
      .ref("organizations/" + orgUID)
      .once("value")
      .then((snapshot) => {
        const orgData = snapshot.val();
        if (!orgData) {
          console.warn("No organization data found for user:", orgUID);
          document.getElementById("adoption-cards").innerHTML = "";
          document.getElementById("empty-state").style.display = "flex";
          return;
        }

        const orgName = orgData.orgName;
        loadAdoptionCards(orgUID, orgName);
        setupSearch();
      })
      .catch((error) => {
        console.error("Error loading organization data:", error);
        document.getElementById("adoption-cards").innerHTML = "";
        document.getElementById("empty-state").style.display = "flex";
        document.querySelector("#empty-state p").textContent =
          "Error loading organization info.";
      });
  } else {
    console.warn("No user signed in");
    window.location.href = "login.html"; // Redirect to login
  }
});

// Pet data storage for filtering
let allPetsData = [];

// 🐾 Load cards filtered by org UID and name
function loadAdoptionCards(orgUID, orgName) {
  const dbRef = firebase.database().ref("adoptions");
  const cardsContainer = document.getElementById("adoption-cards");
  const emptyState = document.getElementById("empty-state");

  dbRef.on(
    "value",
    (snapshot) => {
      const allPets = snapshot.val();
      cardsContainer.innerHTML = "";

      if (!allPets) {
        emptyState.style.display = "flex";
        return;
      }

      const filteredPets = Object.entries(allPets)
        .filter(
          ([id, pet]) =>
            pet.organization === orgUID &&
            pet.organizationName.toLowerCase() === orgName.toLowerCase()
        )
        .map(([id, pet]) => ({
          id,
          ...pet,
        }));

      allPetsData = filteredPets; // Store for filtering

      if (filteredPets.length === 0) {
        emptyState.style.display = "flex";
        return;
      }

      emptyState.style.display = "none";

      // Render pet cards
      filteredPets.forEach((pet) => {
        cardsContainer.appendChild(createPetCard(pet));
      });
    },
    (err) => {
      console.error("RTDB read error:", err);
      emptyState.style.display = "flex";
      document.querySelector("#empty-state p").textContent =
        "Error loading adoptions.";
    }
  );
}

// Create a pet card with all modernized elements
function createPetCard(pet) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.petId = pet.id;

  // Generate random tags for demo
  const tags = ["Friendly", "Neutered", "House-trained", "Playful", "Calm"];
  const randomTags = tags.sort(() => 0.5 - Math.random()).slice(0, 2);

  card.innerHTML = `
    <div class="pet-img-container">
      ${
        pet.imageUrl
          ? `<img src="${pet.imageUrl}" alt="${pet.name}" class="pet-img">`
          : `<img src="/api/placeholder/400/320" alt="placeholder" class="pet-img">`
      }
      ${
        pet.adoptionStatus === "urgent"
          ? '<div class="pet-badge">Urgent</div>'
          : ""
      }
    </div>
    <div class="card-content">
      <div class="card-header">
        <h3>${pet.name}</h3>
        <span class="card-age">${pet.age}</span>
      </div>
      <div class="card-breed">${pet.breed}</div>
      <p>${pet.description || "No description available."}</p>
      <div class="card-tags">
        ${randomTags.map((tag) => `<span class="card-tag">${tag}</span>`).join("")}
      </div>
      <div class="card-footer">
        <div class="card-location">
          <i class="fas fa-map-marker-alt"></i>
          <span>${
            pet.address ? pet.address.split(",")[0] : "Unknown location"
          }</span>
        </div>
        <button class="card-btn view-details-btn">
          <i class="fas fa-paw"></i> Details
        </button>
      </div>
    </div>
  `;

  // Add click event for the entire card
  card.addEventListener("click", () => {
    openPetDetails(pet);
  });

  return card;
}

// Set up search and filter functionality
function setupSearch() {
  const searchInput = document.getElementById("pet-search");
  const speciesFilter = document.getElementById("species-filter");

  searchInput.addEventListener("input", filterPets);
  speciesFilter.addEventListener("change", filterPets);
}

// Filter pets based on search and dropdown selections
function filterPets() {
  const searchInput = document.getElementById("pet-search");
  const speciesFilter = document.getElementById("species-filter");
  const cardsContainer = document.getElementById("adoption-cards");
  const emptyState = document.getElementById("empty-state");

  const searchTerm = searchInput.value.toLowerCase();
  const selectedSpecies = speciesFilter.value.toLowerCase();

  const filteredPets = allPetsData.filter((pet) => {
    const matchesSearch =
      pet.name.toLowerCase().includes(searchTerm) ||
      pet.breed.toLowerCase().includes(searchTerm) ||
      (pet.description &&
        pet.description.toLowerCase().includes(searchTerm));

    const matchesSpecies =
      !selectedSpecies ||
      (pet.species && pet.species.toLowerCase() === selectedSpecies);

    return matchesSearch && matchesSpecies;
  });

  cardsContainer.innerHTML = "";

  if (filteredPets.length === 0) {
    emptyState.style.display = "flex";
    document.querySelector("#empty-state p").textContent =
      "No pets found matching your criteria";
    return;
  }

  emptyState.style.display = "none";

  filteredPets.forEach((pet) => {
    cardsContainer.appendChild(createPetCard(pet));
  });
}

// Open pet details in modal (with Edit, Requests button & badge)
function openPetDetails(pet) {
  const modal = document.getElementById("pet-modal");
  const content = document.getElementById("pet-details-content");

  // Inject existing pet‐details markup
  content.innerHTML = `
    <div class="pet-details-media">
      ${
        pet.imageUrl
          ? `<img src="${pet.imageUrl}" alt="${pet.name}">`
          : `<img src="/api/placeholder/800/600" alt="placeholder">`
      }
      <div class="pet-details-gallery">
        ${
          pet.imageUrl
            ? `<div class="gallery-thumb active"><img src="${pet.imageUrl}" alt="${pet.name}"></div>`
            : ""
        }
        <div class="gallery-thumb"><img src="/api/placeholder/100/100" alt="placeholder"></div>
        <div class="gallery-thumb"><img src="/api/placeholder/100/100" alt="placeholder"></div>
      </div>
    </div>
    <div class="pet-details-info">
      <div class="pet-details-header">
        <h2>${pet.name}</h2>
        <div class="pet-details-meta">
          <div class="pet-details-meta-item">
            <i class="fas fa-dog"></i>
            <span>${pet.species || "Unknown"}</span>
          </div>
          <div class="pet-details-meta-item">
            <i class="fas fa-birthday-cake"></i>
            <span>${pet.age}</span>
          </div>
          <div class="pet-details-meta-item">
            <i class="fas fa-venus-mars"></i>
            <span>${pet.gender || "Unknown"}</span>
          </div>
        </div>
      </div>

      <div class="pet-details-section">
        <h3>About ${pet.name}</h3>
        <p class="pet-details-description">${
          pet.fullDescription ||
          pet.description ||
          "No description available for this pet."
        }</p>
      </div>

      <div class="pet-details-section">
        <h3>Details</h3>
        <div class="pet-details-table">
          <dt>Breed</dt>
          <dd>${pet.breed}</dd>
          <dt>Size</dt>
          <dd>${pet.size || "Unknown"}</dd>
          <dt>Location</dt>
          <dd>${pet.address || "Unknown location"}</dd>
          <dt>Special Needs</dt>
          <dd>${pet.specialNeeds || "None"}</dd>
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

  // Show the modal
  modal.classList.add("show");

  // Close button
  modal.querySelector(".close-modal").onclick = () =>
    modal.classList.remove("show");

  // Edit button
  modal.querySelector(".edit-btn").onclick = () =>
    (window.location.href = `editAdoption.html?id=${pet.id}`);

  // Requests button
  const viewBtn = modal.querySelector("#viewRequestsBtn");
  viewBtn.onclick = () =>
    (window.location.href = `adoptionRequests.html?petId=${pet.id}`);

  // Per‐pet badge
  const badge = modal.querySelector("#request-badge");
  badge.style.visibility = "hidden";
  firebase
    .database()
    .ref("adoptionApplications")
    .orderByChild("petId")
    .equalTo(pet.id)
    .on("value", (snap) => {
      const count = snap.numChildren();
      badge.textContent = count;
      badge.style.visibility = count > 0 ? "visible" : "hidden";
    });

  // Click outside to close (only once)
  if (!modal._outsideHandler) {
    modal._outsideHandler = (e) => {
      if (e.target === modal) modal.classList.remove("show");
    };
    modal.addEventListener("click", modal._outsideHandler);
  }

  // Gallery thumbnails
  modal.querySelectorAll(".gallery-thumb").forEach((thumb) => {
    thumb.onclick = () => {
      modal
        .querySelectorAll(".gallery-thumb")
        .forEach((t) => t.classList.remove("active"));
      thumb.classList.add("active");
      modal.querySelector(".pet-details-media > img").src =
        thumb.querySelector("img").src;
    };
  });
}

// ➕ Add Adoption button
document
  .getElementById("addAdoptionBtn")
  .addEventListener("click", () => {
    window.location.href = "addAdoption.html";
  });
