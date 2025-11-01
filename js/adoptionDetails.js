document.addEventListener("DOMContentLoaded", () => {
  const spinner = document.getElementById("loading-spinner");
  const detailsContainer = document.getElementById("pet-details-container");
  const errorContainer = document.getElementById("error-container");
  const errorMessage = document.getElementById("error-message");
  const actionBar = document.getElementById("adoption-actions");

  const favoriteBtn = document.getElementById("favorite-btn");
  const shareBtn = document.getElementById("share-btn");
  const mobileShareBtn = document.getElementById("mobile-share-btn");

  // Extract petId
  const urlParams = new URLSearchParams(window.location.search);
  const petId = urlParams.get("id");

  if (!petId) {
    showError("Missing pet ID in URL.");
    return;
  }

  // Fetch from Firebase
  spinner.style.display = "flex";
  const ref = firebase.database().ref("adoptions/" + petId);

  ref.once("value")
    .then(snapshot => {
      spinner.style.display = "none";

      const pet = snapshot.val();
      if (!pet) {
        showError("Pet not found or has been adopted.");
        return;
      }

      actionBar.style.display = "flex";
      renderPetDetails(pet);
    })
    .catch(error => {
      console.error(error);
      showError("Error loading pet details.");
    });

  // Functions
  function showError(msg) {
    spinner.style.display = "none";
    errorMessage.textContent = msg;
    errorContainer.style.display = "flex";
  }

function renderPetDetails(pet) {
  detailsContainer.innerHTML = `
    <div class="pet-details-page">
      <div class="pet-hero">
        <div class="pet-images-carousel">
          <div class="main-image-container">
            <img src="${pet.photoUrl || '/api/placeholder/800/500'}" alt="${pet.name}" class="main-image">
          </div>
        </div>
        <div class="pet-badges">
          ${pet.available ? `<span class="pet-badge available">Available</span>` : `<span class="pet-badge adopted">Adopted</span>`}
        </div>
      </div>

      <div class="pet-info-container">
        <div class="pet-header">
          <h1>${pet.name || "Unnamed Pet"}</h1>
          <div class="pet-subheader">
            <div class="breed-age">
              <span class="breed">${pet.breed || "Unknown Breed"}</span>
              <span class="age">${pet.ageMonths ? pet.ageMonths + " months old" : "Age not specified"}</span>
            </div>
            <div class="location">
              <i class="fas fa-map-marker-alt"></i>
              <span>${pet.location || "No location info"}</span>
            </div>
          </div>
        </div>

        <div class="pet-stats">
          <div class="stat-item"><i class="fas fa-venus-mars"></i> <strong>Gender:</strong> ${pet.gender || "Unknown"}</div>
          <div class="stat-item"><i class="fas fa-ruler-vertical"></i> <strong>Size:</strong> ${pet.size || "N/A"}</div>
          <div class="stat-item"><i class="fas fa-paw"></i> <strong>Species:</strong> ${pet.species || "N/A"}</div>
          <div class="stat-item"><i class="fas fa-weight"></i> <strong>Weight:</strong> ${pet.weightLbs ? pet.weightLbs + " lbs" : "N/A"}</div>
        </div>

        <div class="pet-section">
          <h2>About ${pet.name}</h2>
          <p>${pet.description || "No description available."}</p>
        </div>

        <div class="pet-section">
          <h2>Compatibility</h2>
          <div class="compatibility-grid">
            <div class="compatibility-item ${pet.goodWithKids ? "compatible" : "incompatible"}">
              <i class="fas fa-child"></i><span>Children</span>
            </div>
            <div class="compatibility-item ${pet.goodWithDogs ? "compatible" : "incompatible"}">
              <i class="fas fa-dog"></i><span>Dogs</span>
            </div>
            <div class="compatibility-item ${pet.goodWithCats ? "compatible" : "incompatible"}">
              <i class="fas fa-cat"></i><span>Cats</span>
            </div>
          </div>
        </div>

        <div class="pet-section">
          <h2>Health & Training</h2>
          <div class="details-grid">
            <div class="detail-item"><strong>Vaccinated:</strong> ${pet.vaccinated ? "Yes" : "No"}</div>
            <div class="detail-item"><strong>Spayed/Neutered:</strong> ${pet.spayedNeutered ? "Yes" : "No"}</div>
            <div class="detail-item"><strong>Microchipped:</strong> ${pet.microchipped ? "Yes" : "No"}</div>
            <div class="detail-item"><strong>House Trained:</strong> ${pet.houseTrained ? "Yes" : "No"}</div>
          </div>
        </div>

        <div class="pet-section contact-section">
          <h2>Contact Information</h2>
          <div class="contact-card">
            <div class="organization-info">
              <i class="fas fa-building"></i>
              <div>
                <h3>Organization ID: ${pet.orgId || "N/A"}</h3>
                <p>${pet.location || "Location not specified"}</p>
              </div>
            </div>
            <div class="contact-details">
              <a href="tel:${pet.contactInfo || ""}" class="contact-method phone">
                <i class="fas fa-phone-alt"></i>
                <span>${pet.contactInfo || "Not provided"}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

  // Favorite Button
  favoriteBtn.addEventListener("click", () => {
    const icon = favoriteBtn.querySelector("i");
    icon.classList.toggle("fas");
    icon.classList.toggle("far");
    showToast(icon.classList.contains("fas") ? "Added to favorites" : "Removed from favorites");
  });

  // Share Buttons
  function sharePet() {
    const petName = document.querySelector(".pet-header h1")?.textContent || "this pet";
    const shareUrl = window.location.href;

    if (navigator.share) {
      navigator.share({
        title: `Adopt ${petName}`,
        text: `Check out ${petName}, available for adoption!`,
        url: shareUrl,
      });
    } else {
      prompt("Copy this link to share:", shareUrl);
    }
  }

  shareBtn.addEventListener("click", sharePet);
  mobileShareBtn.addEventListener("click", sharePet);

  // Toast
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 100);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
});
