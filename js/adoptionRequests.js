/**
 * Adoption Requests Manager
 * Modernized JS implementation for handling pet adoption applications
 */
document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const elements = {
    requestsList: document.getElementById("requests-list"),
    noRequests: document.getElementById("no-requests"),
    loadingIndicator: document.getElementById("loading-indicator"),
    pageTitle: document.getElementById("page-title"),
    petName: document.getElementById("pet-name"),
    totalRequests: document.getElementById("total-requests"),
    modal: document.getElementById("request-modal"),
    modalBody: document.getElementById("modal-body"),
    searchInput: document.getElementById("search-requests"),
    sortSelect: document.getElementById("sort-requests"),
    backBtn: document.getElementById("back-btn"),
    logoutBtn: document.getElementById("logout-btn"),
    approveBtn: document.getElementById("approve-btn"),
    rejectBtn: document.getElementById("reject-btn"),
    closeModalBtn: document.getElementById("close-modal-btn"),
    closeModalX: document.querySelector(".close-modal"),
    sidebarNav: document.getElementById("sidebar-nav"),
    menuToggle: document.getElementById("menu-toggle")
  };

  elements.closeModalBtn = document.getElementById("close-modal-btn");
  elements.approveBtn    = document.getElementById("approve-btn");
  elements.rejectBtn     = document.getElementById("reject-btn");

  // App State
  const state = {
    allRequests: [],
    petId: new URLSearchParams(window.location.search).get("petId"),
    currentRequestId: null
  };

  // Initialize the application
  const init = async () => {
    // Setup event listeners
    setupEventListeners();
    
    // Validate petId
    if (!state.petId) {
      showNotification("No pet specified", "error");
      return window.location.href = "adoption.html";
    }

    // Check authentication status
    firebase.auth().onAuthStateChanged(user => {
      if (!user) {
        return window.location.href = "login.html";
      }
      
      loadPetDetails();
      loadApplications();
    });
  };

  /**
   * Setup all event listeners
   */
  const setupEventListeners = () => {
    // Search and filter
    elements.searchInput.addEventListener("input", filterRequests);
    elements.sortSelect.addEventListener("change", filterRequests);
    
    // Modal controls
    elements.closeModalX.addEventListener("click", closeModal);
    elements.closeModalBtn.addEventListener("click", closeModal);
    elements.modal.addEventListener("click", (e) => {
      if (e.target === elements.modal) closeModal();
    });
    
    // Action buttons
    elements.approveBtn.addEventListener("click", handleApproveRequest);
    elements.rejectBtn.addEventListener("click", handleRejectRequest);
    elements.logoutBtn.addEventListener("click", handleLogout);
    elements.backBtn.addEventListener("click", () => window.history.back());
    
    // Sidebar toggle if exists
    if (elements.menuToggle && elements.sidebarNav) {
      elements.menuToggle.addEventListener("click", toggleSidebar);
      
      // Close sidebar when clicking outside
      document.addEventListener("click", (e) => {
        if (elements.sidebarNav.classList.contains("active") && 
            !e.target.closest("#sidebar-nav") && 
            !e.target.closest("#menu-toggle")) {
          elements.sidebarNav.classList.remove("active");
        }
      });
    }
  };

  /**
   * Load pet details from Firebase
   */
  const loadPetDetails = async () => {
    try {
      const snapshot = await firebase.database().ref(`adoptions/${state.petId}`).once("value");
      const pet = snapshot.val();
      
      if (pet?.name) {
        elements.pageTitle.textContent = `Requests for "${pet.name}"`;
        elements.petName.textContent = pet.name;
      } else {
        throw new Error("Pet not found");
      }
    } catch (error) {
      console.error("Error loading pet details:", error);
      elements.petName.textContent = "Unknown Pet";
    }
  };

  /**
   * Load adoption applications from Firebase
   * — now filters out approved/rejected so they disappear immediately
   */
  const loadApplications = async () => {
    showLoadingState();
    
    try {
      const snapshot = await firebase.database()
        .ref("adoptionApplications")
        .orderByChild("petId")
        .equalTo(state.petId)
        .once("value");
      
      const apps = snapshot.val() || {};
      const keys = Object.keys(apps);
      
      // Build an array of all apps...
      const allApps = keys.map(appId => ({
        id: appId,
        ...apps[appId]
      }));

      // **NEW**: only keep those not yet approved or rejected
      const pending = allApps.filter(a => a.status !== "approved" && a.status !== "rejected");

      // Update state + count
      state.allRequests = pending;
      elements.totalRequests.textContent = pending.length;
      
      // Display them
      displayRequests(pending);
    } catch (error) {
      console.error("Failed to load requests:", error);
      showErrorState("Failed to load requests. Please try again later.");
    } finally {
      elements.loadingIndicator.style.display = "none";
    }
  };

  /**
   * Filter and sort requests based on user input
   */
  const filterRequests = () => {
    const searchTerm = elements.searchInput.value.toLowerCase().trim();
    const sortBy = elements.sortSelect.value;
    
    // Apply search filter
    let filtered = searchTerm 
      ? state.allRequests.filter(app => 
          (app.fullName?.toLowerCase().includes(searchTerm)) || 
          (app.email?.toLowerCase().includes(searchTerm))
        )
      : [...state.allRequests];
    
    // Apply sorting
    filtered = sortRequests(filtered, sortBy);
    
    // Update display
    displayRequests(filtered);
  };

  /**
   * Sort requests by the given criteria
   */
  const sortRequests = (requests, sortBy) => {
    switch (sortBy) {
      case "newest":
        return [...requests].sort((a, b) => (b.appliedTimestamp || 0) - (a.appliedTimestamp || 0));
      case "oldest":
        return [...requests].sort((a, b) => (a.appliedTimestamp || 0) - (b.appliedTimestamp || 0));
      case "name":
        return [...requests].sort((a, b) => 
          (a.fullName || "").localeCompare(b.fullName || "", undefined, { sensitivity: "base" })
        );
      default:
        return requests;
    }
  };

  /**
   * Display the list of requests
   */
  const displayRequests = (requests) => {
    elements.requestsList.innerHTML = "";
    
    if (requests.length === 0) {
      elements.noRequests.style.display = "block";
      elements.requestsList.style.display = "none";
      return;
    }
    
    elements.noRequests.style.display = "none";
    elements.requestsList.style.display = "grid";
    
    requests.forEach(app => {
      const card = createRequestCard(app);
      elements.requestsList.appendChild(card);
    });
  };

  /**
   * Create a request card element
   */
  const createRequestCard = (app) => {
    const card = document.createElement("div");
    card.className = "card";
    
    // Format the timestamp
    const appliedAt = app.appliedTimestamp
      ? new Date(+app.appliedTimestamp).toLocaleString()
      : "Unknown";
    
    // Get status class/text
    const statusClass = app.status === "reviewed" ? "reviewed" : "new";
    const statusText = app.status === "reviewed" ? "Reviewed" : "New";
    
    card.innerHTML = `
      <h3>${app.fullName || "Unnamed Applicant"}</h3>
      <div class="card-meta">
        <div class="status-badge ${statusClass}">${statusText}</div>
        <div class="date"><i class="far fa-calendar-alt"></i> ${appliedAt}</div>
      </div>
      <div class="card-field">
        <i class="far fa-envelope"></i>
        <p>${app.email || "No email provided"}</p>
      </div>
      <div class="card-field">
        <i class="fas fa-phone"></i>
        <p>${app.phone || "Not provided"}</p>
      </div>
      <div class="card-field">
        <i class="fas fa-home"></i>
        <p>${app.housingType || "Not specified"}</p>
      </div>
      <div class="card-footer">
        <span class="view-details">View application <i class="fas fa-chevron-right"></i></span>
      </div>
    `;
    
    // Open modal on click
    card.addEventListener("click", () => openModalWithApp(app));
    return card;
  };

  /**
   * Open and populate modal with application details
   */
  const openModalWithApp = (app) => {
    state.currentRequestId = app.id;
    
    // Format the timestamp
    const appliedAt = app.appliedTimestamp
      ? new Date(+app.appliedTimestamp).toLocaleString()
      : "Unknown";
    
    elements.modalBody.innerHTML = `
      <div class="modal-section">
        <h3>Applicant Information</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="label">Full Name</div>
            <div class="value">${app.fullName || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Applied On</div>
            <div class="value">${appliedAt}</div>
          </div>
          <div class="detail-item">
            <div class="label">Email</div>
            <div class="value"><a href="mailto:${app.email}">${app.email || "Not provided"}</a></div>
          </div>
          <div class="detail-item">
            <div class="label">Phone</div>
            <div class="value"><a href="tel:${app.phone}">${app.phone || "Not provided"}</a></div>
          </div>
          <div class="detail-item">
            <div class="label">Date of Birth</div>
            <div class="value">${app.dateOfBirth || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Occupation</div>
            <div class="value">${app.occupation || "Not provided"}</div>
          </div>
        </div>
      </div>
      
      <div class="modal-section">
        <h3>Housing Information</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="label">Household Size</div>
            <div class="value">${app.householdCount || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Housing Type</div>
            <div class="value">${app.housingType || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Own or Rent</div>
            <div class="value">${app.ownOrRent || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Permission to Keep Pet</div>
            <div class="value">${app.permissionToKeep || "Not provided"}</div>
          </div>
        </div>
      </div>
      
      <div class="modal-section">
        <h3>Pet Experience</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="label">Previously Owned a Pet</div>
            <div class="value">${app.ownPet || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Adopted Before</div>
            <div class="value">${app.adoptedBefore || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Vet Care Plans</div>
            <div class="value">${app.vetCare || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Work Schedule</div>
            <div class="value">${app.workSchedule || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Job Stability</div>
            <div class="value">${app.jobStability || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Emotionally Prepared</div>
            <div class="value">${app.emotionalPrepared || "Not provided"}</div>
          </div>
          <div class="detail-item">
            <div class="label">Mental Health Considerations</div>
            <div class="value">${app.mentalHealth || "Not provided"}</div>
          </div>
        </div>
      </div>
      
      <div class="modal-section">
        <h3>Documents & Additional Information</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="label">Government ID</div>
            <div class="value">
              ${app.govIdUrl
                ? `<a href="${app.govIdUrl}" target="_blank">View document <i class="fas fa-external-link-alt"></i></a>`
                : "Not uploaded"}
            </div>
          </div>
          <div class="detail-item detail-full">
            <div class="label">Additional Details</div>
            <div class="value">${app.petDetails || "No additional details provided"}</div>
          </div>
        </div>
      </div>
    `;
    
    elements.modal.classList.add("show");
    
    // Update button status based on application status
    updateActionButtons(app.status);
  };

  /**
   * Update action buttons based on application status
   */
  const updateActionButtons = (status) => {
    if (status === "approved") {
      elements.approveBtn.disabled = true;
      elements.rejectBtn.disabled  = false;
    } else if (status === "rejected") {
      elements.approveBtn.disabled = false;
      elements.rejectBtn.disabled  = true;
    } else {
      elements.approveBtn.disabled = false;
      elements.rejectBtn.disabled  = false;
    }
  };

  /**
   * Close the modal
   */
  const closeModal = () => {
    elements.modal.classList.remove("show");
    state.currentRequestId = null;
  };

  /**
   * Handle approval of an application
   */
  const handleApproveRequest = async () => {
    if (!state.currentRequestId) return;
    try {
      // 1) Mark application approved
      await firebase.database()
        .ref(`adoptionApplications/${state.currentRequestId}`)
        .update({
          status:     "approved",
          reviewedAt: Date.now(),
          reviewedBy: firebase.auth().currentUser.uid
        });

      // 2) Fetch the app to get userId/fullName
      const appSnap = await firebase.database()
        .ref(`adoptionApplications/${state.currentRequestId}`)
        .once("value");
      const appData = appSnap.val();

      // 3) Push notification under /notifications/{userId}
      if (appData?.userId) {
        const notifRef = firebase.database()
          .ref(`notifications/${appData.userId}`)
          .push();
        await notifRef.set({
          id:        notifRef.key,
          title:     "Adoption Approved",
          message:   `Congratulations ${appData.fullName}! Your request to adopt "${elements.petName.textContent}" has been approved.`,
          timestamp: Date.now(),
          read:      false
        });
      }

      showNotification("Application approved successfully", "success");
      closeModal();
      loadApplications();  // <-- after approval it reloads & filters out
    } catch (error) {
      console.error("Error approving application:", error);
      showNotification("Failed to approve application", "error");
    }
  };

  /**
   * Handle rejection of an application
   */
  const handleRejectRequest = async () => {
    if (!state.currentRequestId) return;
    try {
      // 1) Mark application rejected
      await firebase.database()
        .ref(`adoptionApplications/${state.currentRequestId}`)
        .update({
          status:     "rejected",
          reviewedAt: Date.now(),
          reviewedBy: firebase.auth().currentUser.uid
        });

      // 2) Fetch the app to get userId/fullName
      const appSnap = await firebase.database()
        .ref(`adoptionApplications/${state.currentRequestId}`)
        .once("value");
      const appData = appSnap.val();

      // 3) Push notification under /notifications/{userId}
      if (appData?.userId) {
        const notifRef = firebase.database()
          .ref(`notifications/${appData.userId}`)
          .push();
        await notifRef.set({
          id:        notifRef.key,
          title:     "Adoption Rejected",
          message:   `Hello ${appData.fullName}, we’re sorry to let you know your adoption request for "${elements.petName.textContent}" was not approved.`,
          timestamp: Date.now(),
          read:      false
        });
      }

      showNotification("Application rejected", "success");
      closeModal();
      loadApplications();  // <-- after rejection it reloads & filters out
    } catch (error) {
      console.error("Error rejecting application:", error);
      showNotification("Failed to reject application", "error");
    }
  };

  /**
   * Handle logout
   */
  const handleLogout = async () => {
    try {
      await firebase.auth().signOut();
      window.location.href = "login.html";
    } catch (error) {
      console.error("Error signing out:", error);
      showNotification("Failed to sign out", "error");
    }
  };

  /**
   * Show notification message
   */
  const showNotification = (message, type = "success") => {
    const existingNotification = document.querySelector(".notification");
    if (existingNotification) existingNotification.remove();

    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add("show"), 10);
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  };

  /**
   * Toggle sidebar (if exists)
   */
  const toggleSidebar = () => {
    if (elements.sidebarNav) {
      elements.sidebarNav.classList.toggle("active");
    }
  };

  /**
   * Show loading state
   */
  const showLoadingState = () => {
    elements.loadingIndicator.style.display = "block";
    elements.requestsList.style.display = "none";
    elements.noRequests.style.display = "none";
  };

  /**
   * Show error state
   */
  const showErrorState = (message) => {
    elements.noRequests.style.display = "block";
    elements.requestsList.style.display = "none";
    elements.pageTitle.textContent = "Error loading requests";

    elements.noRequests.innerHTML = `
      <div class="empty-icon">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h3>Error loading requests</h3>
      <p>${message}</p>
    `;
  };

  // Initialize app
  init();
});
