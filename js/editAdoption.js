// js/editAdoption.js - modernized version

// Grab services
const auth = firebase.auth();
const database = firebase.database();

document.addEventListener("DOMContentLoaded", () => {
  const editForm = document.getElementById("editForm");
  const currentImage = document.getElementById("currentImage");
  const logoutBtn = document.getElementById("logout-btn");
  
  // Add loading state
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

  // Get petId from URL
  const urlParams = new URLSearchParams(window.location.search);
  const petId = urlParams.get("id");
  
  if (!petId) {
    showNotification("No pet ID provided", "error");
    return window.location.href = "adoption.html";
  }

  // Custom notification function
  const showNotification = (message, type = "success") => {
    // You could implement a proper toast notification system here
    alert(message);
  };

  // Ensure user is signed in
  auth.onAuthStateChanged(user => {
    if (!user) {
      showNotification("Please sign in to continue", "error");
      return window.location.href = "index.html";
    }

    // Load pet data with loading indicator
    currentImage.src = "/api/placeholder/400/300"; // Placeholder while loading
    
    database.ref("adoptions/" + petId).once("value")
      .then(snapshot => {
        const pet = snapshot.val();
        if (!pet) throw new Error("Pet not found");

        // Pre-fill fields
        document.getElementById("name").value = pet.name || "";
        document.getElementById("species").value = pet.species || "";
        document.getElementById("breed").value = pet.breed || "";
        document.getElementById("age").value = pet.age || "";
        document.getElementById("size").value = pet.size || "";
        document.getElementById("gender").value = pet.gender || "";
        document.getElementById("description").value = pet.description || "";
        document.getElementById("fullDescription").value = pet.fullDescription || "";
        document.getElementById("address").value = pet.address || "";
        document.getElementById("contactLocation").value = pet.contactLocation || "";
        document.getElementById("contactPhone").value = pet.contactPhone || "";
        document.getElementById("contactEmail").value = pet.contactEmail || "";
        
        // Set image with fade-in effect
        if (pet.imageUrl) {
          const img = new Image();
          img.onload = () => {
            currentImage.style.opacity = 0;
            currentImage.src = pet.imageUrl;
            setTimeout(() => {
              currentImage.style.opacity = 1;
            }, 50);
          };
          img.src = pet.imageUrl;
        }

        // Form validation - basic example
        const validateForm = () => {
          let isValid = true;
          const requiredFields = editForm.querySelectorAll('[required]');
          
          requiredFields.forEach(field => {
            if (!field.value.trim()) {
              field.classList.add('error');
              isValid = false;
            } else {
              field.classList.remove('error');
            }
          });
          
          return isValid;
        };

        // On submit, just update fields (imageUrl stays the same)
        editForm.addEventListener("submit", async e => {
          e.preventDefault();
          
          if (!validateForm()) {
            showNotification("Please fill in all required fields", "error");
            return;
          }
          
          setLoading(true);

          const updates = {
            name: document.getElementById("name").value,
            species: document.getElementById("species").value,
            breed: document.getElementById("breed").value,
            age: document.getElementById("age").value,
            size: document.getElementById("size").value,
            gender: document.getElementById("gender").value,
            description: document.getElementById("description").value,
            fullDescription: document.getElementById("fullDescription").value,
            address: document.getElementById("address").value,
            contactLocation: document.getElementById("contactLocation").value,
            contactPhone: document.getElementById("contactPhone").value,
            contactEmail: document.getElementById("contactEmail").value,
            // keep the existing image URL
            imageUrl: pet.imageUrl,
            // Add updated timestamp
            updatedAt: firebase.database.ServerValue.TIMESTAMP
          };

          try {
            await database.ref("adoptions/" + petId).update(updates);
            showNotification("Successfully updated pet details!");
            setTimeout(() => {
              window.location.href = "adoption.html";
            }, 1000);
          } catch (error) {
            console.error(error);
            setLoading(false);
            showNotification("Failed to update pet details. Please try again.", "error");
          }
        });
      })
      .catch(err => {
        console.error(err);
        showNotification("Could not load pet data.", "error");
        setTimeout(() => {
          window.location.href = "adoption.html";
        }, 1500);
      });
  });

  // Logout with confirmation
  logoutBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to log out?")) {
      auth.signOut().then(() => window.location.href = "index.html");
    }
  });
  
  // Add some basic CSS for form validation
  const style = document.createElement('style');
  style.textContent = `
    .form-group input.error,
    .form-group textarea.error {
      border-color: #f44336;
      background-color: rgba(244, 67, 54, 0.05);
    }
    
    .form-group input.error:focus,
    .form-group textarea.error:focus {
      box-shadow: 0 0 0 3px rgba(244, 67, 54, 0.15);
    }
    
    #currentImage {
      transition: opacity 0.3s ease;
    }
  `;
  document.head.appendChild(style);
});