// js/addDonation.js - Enhanced version

/**
 * Checks if user is authenticated, redirects to login if not
 * @returns {Promise<firebase.User>}
 */
function checkAuth() {
  return new Promise((resolve, reject) => {
    firebase.auth().onAuthStateChanged(user => {
      if (user) resolve(user);
      else {
        window.location.href = "index.html";
        reject(new Error("Not authenticated"));
      }
    });
  });
}

/**
 * Shows loading overlay
 */
function showLoading() {
  document.getElementById('loadingOverlay').classList.add('active');
}

/**
 * Hides loading overlay
 */
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}

/**
 * Validates GCash number format
 * @param {string} number - The GCash number to validate
 * @returns {boolean} - Whether the number is valid
 */
function validateGCashNumber(number) {
  // Remove any '+63' prefix if present
  const cleanNumber = number.replace(/^\+?63/, '');
  // Check if the number is 10-11 digits (first digit should be 9)
  return /^9\d{9,10}$/.test(cleanNumber);
}

/**
 * Updates character counter for textarea
 * @param {Event} event - Input event
 */
function updateCharCounter(event) {
  const textarea = event.target;
  const counter = document.getElementById('detailsCounter');
  counter.textContent = textarea.value.length;
  
  // Visual feedback if approaching limit
  if (textarea.value.length > 280) {
    counter.style.color = '#e53935';
  } else {
    counter.style.color = '#777';
  }
}

/**
 * Validates all form inputs
 * @returns {boolean} - Whether all inputs are valid
 */
function validateForm() {
  const name = document.getElementById("name").value.trim();
  const gcashName = document.getElementById("gcashName").value.trim();
  const gcashNumber = document.getElementById("gcashNumber").value.trim();
  const details = document.getElementById("details").value.trim();
  const purpose = document.getElementById("purpose").value.trim();
  const goalRaw = document.getElementById("goal").value;
  const goalAmount = parseFloat(goalRaw);
  
  // Check for empty fields
  if (!name || !gcashName || !gcashNumber || !details || !purpose || !goalRaw) {
    alert("Please fill in all required fields.");
    return false;
  }
  
  // Validate GCash number
  if (!validateGCashNumber(gcashNumber)) {
    alert("Please enter a valid GCash phone number (must start with 9 and be 10-11 digits).");
    return false;
  }
  
  // Validate amount
  if (isNaN(goalAmount) || goalAmount <= 0) {
    alert("Please enter a valid goal amount greater than ₱0.");
    return false;
  }
  
  // Check character limit for details
  if (details.length > 300) {
    alert("Details cannot exceed 300 characters.");
    return false;
  }
  
  return true;
}

/**
 * Submits donation request to Firebase
 */
async function submitDonation() {
  if (!validateForm()) return;
  
  try {
    showLoading();
    
    const name = document.getElementById("name").value.trim();
    const gcashName = document.getElementById("gcashName").value.trim();
    let gcashNumber = document.getElementById("gcashNumber").value.trim();
    const details = document.getElementById("details").value.trim();
    const purpose = document.getElementById("purpose").value.trim();
    const goalAmount = parseFloat(document.getElementById("goal").value);
    
    // Clean the GCash number (ensure it's in the right format)
    gcashNumber = gcashNumber.replace(/^\+?63/, ''); // Remove +63 prefix if present
    if (!gcashNumber.startsWith('9')) {
      gcashNumber = '9' + gcashNumber; // Ensure it starts with 9
    }
    
    // Get current user data
    const user = firebase.auth().currentUser;
    const userId = user.uid;
    
    const db = firebase.database();
    const donationRef = db.ref("donation_requests").push();
    const donationId = donationRef.key;
    
    // Prepare timestamp
    const now = new Date();
    const timestamp = now.toISOString();
    
    const donationData = {
      id: donationId,
      name,
      gcashName,
      gcashNumber,
      details,
      purpose,
      goalAmount,
      currentAmount: 0,
      verified: false,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'pending', // Initial status
      contributors: 0,    // Initialize contributors count
      donationsCount: 0   // Initialize donations count
    };
    
    await donationRef.set(donationData);
    
    // Also add to user's donations collection for quick access
    await db.ref(`users/${userId}/donations/${donationId}`).set({
      id: donationId,
      createdAt: timestamp,
      status: 'pending'
    });
    
    hideLoading();
    alert("Donation request added successfully!");
    
    // Redirect back to list
    window.location.href = "donation.html";
    
  } catch (error) {
    hideLoading();
    console.error("Error adding donation:", error);
    alert("Error submitting donation: " + error.message);
  }
}

/**
 * Cancels form submission and returns to donation list
 */
function cancelForm() {
  const confirmCancel = confirm("Are you sure you want to cancel? Any unsaved information will be lost.");
  if (confirmCancel) {
    window.location.href = "donation.html";
  }
}

/**
 * Initialize the page
 */
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize Firebase app if not already done
  if (!firebase.apps.length) {
    try {
      firebase.initializeApp(firebaseConfig);
    } catch (err) {
      console.error("Firebase initialization error:", err);
      alert("Could not connect to database. Please try again later.");
      return;
    }
  }
  
  // Ensure user is signed in
  try {
    await checkAuth();
  } catch {
    return;
  }
  
  // Set up event listeners
  document.getElementById("submitDonation").addEventListener("click", submitDonation);
  document.getElementById("cancelBtn").addEventListener("click", cancelForm);
  document.getElementById("details").addEventListener("input", updateCharCounter);
  
  // Set up logout button
  document.getElementById("logout-btn").addEventListener("click", () => {
    firebase.auth().signOut().then(() => {
      window.location.href = "index.html";
    }).catch(error => {
      console.error("Logout error:", error);
    });
  });
});