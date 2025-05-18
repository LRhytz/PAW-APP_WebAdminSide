document.addEventListener("DOMContentLoaded", function () {
  if (!firebase.apps.length) {
    try {
      firebase.initializeApp(firebaseConfig);
      console.log("Firebase initialized successfully");
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      alert(
        "Failed to connect to the database. Please check your internet connection or try again later."
      );
      return;
    }
  }

  const submitButton = document.getElementById("submitDonation");
  if (submitButton) {
    submitButton.addEventListener("click", async () => {
      const name = document.getElementById("name").value.trim();
      const gcashName = document.getElementById("gcashName").value.trim();
      const gcashNumber = document.getElementById("gcashNumber").value.trim();
      const details = document.getElementById("details").value.trim();
      const purpose = document.getElementById("purpose").value.trim();

      if (!name || !gcashName || !gcashNumber || !details || !purpose) {
        alert("Please fill in all fields.");
        return;
      }

      if (!/^\d{10,11}$/.test(gcashNumber)) {
        alert("Please enter a valid GCash phone number (10-11 digits).");
        return;
      }

      try {
        const db = firebase.database();

        const donationRef = db.ref("donation_requests").push();
        const donationId = donationRef.key;
        console.log("Generated donation ID:", donationId);

        const donationData = {
          name: name,
          gcashName: gcashName,
          gcashNumber: gcashNumber,
          details: details,
          purpose: purpose,
          id: donationId,
        };

        console.log("Donation data:", donationData);

        await donationRef.set(donationData);
        console.log("Donation successfully added to Firebase!");

        alert("Donation request added successfully!");
        document.getElementById("name").value = "";
        document.getElementById("gcashName").value = "";
        document.getElementById("gcashNumber").value = "";
        document.getElementById("details").value = "";
        document.getElementById("purpose").value = "";

        window.location.href = "donation.html";
      } catch (error) {
        console.error("Error adding donation:", error);
        alert(
          "There was an error submitting your donation request: " +
            error.message
        );
      }
    });
  } else {
    console.error("Submit button not found!");
  }
});
