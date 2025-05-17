// 🔐 Get current org after login
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
          cardsContainer.innerHTML = "<p>Organization data not found.</p>";
          return;
        }

        const orgName = orgData.orgName;
        loadAdoptionCards(orgUID, orgName);
      })
      .catch((error) => {
        console.error("Error loading organization data:", error);
        cardsContainer.innerHTML = "<p>Error loading organization info.</p>";
      });
  } else {
    console.warn("No user signed in");
    cardsContainer.innerHTML = "<p>Please log in to view adoptions.</p>";
  }
});

// 🐾 Load cards filtered by org UID and name
function loadAdoptionCards(orgUID, orgName) {
  const dbRef = firebase.database().ref("adoptions");
  const cardsContainer = document.getElementById("adoption-cards");

  dbRef.on(
    "value",
    (snapshot) => {
      const allPets = snapshot.val();
      cardsContainer.innerHTML = "";

      if (!allPets) {
        cardsContainer.innerHTML = "<p>No pets to adopt right now.</p>";
        return;
      }

      const filteredPets = Object.values(allPets).filter(
        (pet) =>
          pet.organization === orgUID &&
          pet.organizationName.toLowerCase() === orgName.toLowerCase()
      );

      if (filteredPets.length === 0) {
        cardsContainer.innerHTML =
          "<p>No pets available under your organization.</p>";
        return;
      }

      // Render pet cards
      filteredPets.forEach((pet) => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
        ${
          pet.imageUrl
            ? `<img src="${pet.imageUrl}" alt="${pet.name}" class="pet-img">`
            : ""
        }
        <h3>${pet.name}</h3>
        <p><strong>Breed:</strong> ${pet.breed}</p>
        <p><strong>Age:</strong> ${pet.age}</p>
        <p>${pet.description}</p>
      `;
        cardsContainer.appendChild(card);
      });
    },
    (err) => {
      console.error("RTDB read error:", err);
      cardsContainer.innerHTML = "<p>Error loading adoptions.</p>";
    }
  );
}

// ➕ Add Adoption button
const addBtn = document.getElementById("addAdoptionBtn");
addBtn.addEventListener("click", () => {
  window.location.href = "addAdoption.html";
});
