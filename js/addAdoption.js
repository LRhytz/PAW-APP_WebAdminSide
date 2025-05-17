const adoptionForm = document.getElementById("adoptionForm");

firebase.auth().onAuthStateChanged((user) => {
  if (!user) {
    alert("Please log in first.");
    window.location.href = "login.html";
    return;
  }

  const orgUID = user.uid;

  firebase
    .database()
    .ref("organizations/" + orgUID)
    .once("value")
    .then((snapshot) => {
      const orgData = snapshot.val();
      if (!orgData) {
        alert("Organization info not found.");
        return;
      }

      const organizationName = orgData.orgName;

      adoptionForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const imageFile = document.getElementById("imageFile").files[0];
        if (!imageFile) {
          alert("Please select an image.");
          return;
        }

        // 1️⃣ Upload the image to Firebase Storage
        const storageRef = firebase.storage().ref();
        const imageRef = storageRef.child(
          `pet_images/${Date.now()}_${imageFile.name}`
        );

        try {
          const snapshot = await imageRef.put(imageFile);
          const downloadURL = await snapshot.ref.getDownloadURL();

          // 2️⃣ Form data including image URL
          const formData = {
            name: document.getElementById("name").value,
            species: document.getElementById("species").value,
            breed: document.getElementById("breed").value,
            age: document.getElementById("age").value,
            size: document.getElementById("size").value,
            gender: document.getElementById("gender").value,
            description: document.getElementById("description").value,
            fullDescription: document.getElementById("fullDescription").value,
            embedding: {},
            address: document.getElementById("address").value,
            contactLocation: document.getElementById("contactLocation").value,
            contactPhone: document.getElementById("contactPhone").value,
            contactEmail: document.getElementById("contactEmail").value,
            imageUrl: downloadURL,
            createdAt: Date.now(),
            organization: orgUID,
            organizationName: organizationName,
          };

          // 3️⃣ Push to Realtime Database
          const newRef = firebase.database().ref("adoptions").push();
          formData.id = newRef.key;

          await newRef.set(formData);

          alert("Adoption entry added successfully!");
          adoptionForm.reset();
        } catch (error) {
          console.error("Upload or save failed:", error);
          alert("Failed to add pet.");
        }
      });
    });
});
