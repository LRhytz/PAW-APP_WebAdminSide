const donationContainer = document.getElementById("donation-cards-container");

function checkAuth() {
  return new Promise((resolve, reject) => {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        console.log("User is signed in:", user.email);
        resolve(user);
      } else {
        console.log("No user is signed in");
        // Redirect to login page if not logged in
        window.location.href = "index.html";
        reject(new Error("Not authenticated"));
      }
    });
  });
}

function fetchDonations() {
  console.log("Fetching donations...");
  donationContainer.innerHTML = "<p>Loading donation requests...</p>";

  checkAuth()
    .then(() => {
      const db = firebase.database();
      const donationsRef = db.ref("donation_requests");

      // Get the data
      donationsRef.on(
        "value",
        (snapshot) => {
          if (snapshot.exists()) {
            const donations = snapshot.val();
            console.log("Donations data retrieved:", donations);
            displayDonations(donations);
          } else {
            console.log("No donations found in database");
            donationContainer.innerHTML = "<p>No donations found.</p>";
          }
        },
        (error) => {
          console.error("Error fetching donations:", error);
          donationContainer.innerHTML = `<p>Error loading donations: ${error.message}</p>`;

          if (error.code === "PERMISSION_DENIED") {
            donationContainer.innerHTML = `
            <p>Permission denied. This could be due to:</p>
            <ul>
              <li>You need to be logged in to access this data</li>
              <li>Your account doesn't have permission to view donations</li>
              <li>Firebase database rules are restricting access</li>
            </ul>
            <p>Please contact your administrator or try logging in again.</p>
          `;
          }
        }
      );
    })
    .catch((error) => {
      console.error("Authentication error:", error);
    });
}

function displayDonations(donations) {
  console.log("Displaying donations...");
  donationContainer.innerHTML = "";

  let count = 0;

  for (const donationId in donations) {
    count++;
    const donation = donations[donationId];
    console.log(`Processing donation: ${donationId}`, donation);

    const donationCard = document.createElement("div");
    donationCard.classList.add("donation-card");

    donationCard.innerHTML = `
      <h3>Donation ID: ${donation.id || donationId}</h3>
      <p><strong>Name:</strong> ${donation.name || "N/A"}</p>
      <p><strong>Gcash Name:</strong> ${donation.gcashName || "N/A"}</p>
      <p><strong>Gcash Number:</strong> ${donation.gcashNumber || "N/A"}</p>
      <p><strong>Purpose:</strong> ${donation.purpose || "N/A"}</p>
      <p><strong>Details:</strong> ${donation.details || "N/A"}</p>
    `;

    donationContainer.appendChild(donationCard);
  }

  console.log(`Displayed ${count} donation cards`);

  if (count === 0) {
    donationContainer.innerHTML = "<p>No donation requests found.</p>";
  }
}

window.onload = fetchDonations;
