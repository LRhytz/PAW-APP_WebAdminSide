// editDonation.js
// Handles loading & saving donation data, related transactions,
// impact reports, and usage updates

/**
 * Check if user is authenticated
 * @returns {Promise} Promise that resolves with the user object
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
 * Get query parameter from URL
 * @param {string} name - Parameter name to get
 * @returns {string|null} Parameter value or null if not found
 */
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @returns {string} Formatted amount with PHP symbol
 */
function formatCurrency(amount) {
  return '₱' + parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success or error)
 */
function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type}`;
  
  // Remove hidden class
  notification.classList.remove('hidden');
  
  // Hide notification after 3 seconds
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 3000);
}

/**
 * Show loading overlay
 * @param {boolean} show - Whether to show or hide the overlay
 */
function showLoading(show = true) {
  const overlay = document.getElementById('loadingOverlay');
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

/**
 * Initialize character counter for text areas
 * @param {HTMLElement} textarea - Textarea element
 * @param {HTMLElement} counter - Counter element
 * @param {number} maxLength - Maximum character length
 */
function initCharCounter(textarea, counter, maxLength) {
  function updateCounter() {
    const count = textarea.value.length;
    counter.textContent = count;
    
    if (count > maxLength * 0.9) {
      counter.style.color = count >= maxLength ? 'red' : 'orange';
    } else {
      counter.style.color = '';
    }
  }
  
  textarea.addEventListener('input', updateCounter);
  updateCounter(); // Initial count
}

document.addEventListener("DOMContentLoaded", () => {
  // Get donation ID from URL
  const donationId = getQueryParam("donationId");
  if (!donationId) {
    showNotification("No donation ID provided", "error");
    return window.location.href = "donation.html";
  }

  // Form elements
  const donationForm = document.getElementById("donationForm");
  const nameInput = document.getElementById("name");
  const gcashNameInput = document.getElementById("gcashName");
  const gcashNumInput = document.getElementById("gcashNumber");
  const detailsInput = document.getElementById("details");
  const purposeInput = document.getElementById("purpose");
  const goalInput = document.getElementById("goal");
  const cancelBtn = document.getElementById("cancelBtn");
  const saveBtn = document.getElementById("saveBtn");
  
  // Preview and stats elements
  const txList = document.getElementById("transactions-list");
  const impList = document.getElementById("impact-list");
  const updList = document.getElementById("updates-list");
  const raisedAmount = document.getElementById("raisedAmount");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const donorCount = document.getElementById("donorCount");
  
  // Transaction counts
  const transactionCount = document.getElementById("transactionCount");
  const impactCount = document.getElementById("impactCount");
  const updateCount = document.getElementById("updateCount");
  
  // View all buttons
  const btnAllTx = document.getElementById("viewAllTransactions");
  const btnAllImp = document.getElementById("viewAllImpact");
  const btnAllUpd = document.getElementById("viewAllUpdates");
  
  // Add new buttons
  const addImpactBtn = document.getElementById("addImpactBtn");
  const addUpdateBtn = document.getElementById("addUpdateBtn");
  
  // Modal elements
  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalContent = document.getElementById("modalContent");
  const modalContentLoader = document.getElementById("modalContentLoader");
  const modalClose = document.getElementById("modalClose");
  
  // Add update modal
  const addUpdateModal = document.getElementById("addUpdateModal");
  const addUpdateForm = document.getElementById("addUpdateForm");
  
  // Add impact modal
  const addImpactModal = document.getElementById("addImpactModal");
  const addImpactForm = document.getElementById("addImpactForm");
  
  // Set up character counter for details input
  const detailsCharCount = document.getElementById("detailsCharCount");
  initCharCounter(detailsInput, detailsCharCount, 500);
  
  // Show loading overlay
  showLoading(true);
  
  // Check user authentication
  checkAuth()
    .then(user => {
      const donationRef = firebase.database().ref("donation_requests/" + donationId);
      
      // Load form data
      donationRef.once("value")
        .then(snapshot => {
          showLoading(false);
          
          const donationData = snapshot.val();
          if (!donationData) {
            showNotification("Donation request not found", "error");
            setTimeout(() => {
              window.location.href = "donation.html";
            }, 2000);
            return;
          }
          
          // Fill form fields
          nameInput.value = donationData.name || "";
          gcashNameInput.value = donationData.gcashName || "";
          gcashNumInput.value = donationData.gcashNumber || "";
          detailsInput.value = donationData.details || "";
          purposeInput.value = donationData.purpose || "";
          goalInput.value = (donationData.goalAmount != null) ? donationData.goalAmount : "";
          
          // Update character counts
          detailsCharCount.textContent = detailsInput.value.length;
          
          // Load and calculate stats
          loadDonationStats(donationRef);
          
          // Load related data
          loadRelatedData(donationRef);
        })
        .catch(error => {
          showLoading(false);
          console.error("Error loading donation data:", error);
          showNotification("Error loading donation data: " + error.message, "error");
        });
      
      /**
       * Load donation statistics
       * @param {firebase.database.Reference} ref - Donation reference
       */
      function loadDonationStats(ref) {
        // Get transactions to calculate total and donors
        ref.child("transactions").once("value")
          .then(snapshot => {
            let totalRaised = 0;
            let uniqueDonors = new Set();
            let txCount = 0;
            
            snapshot.forEach(child => {
              const tx = child.val();
              totalRaised += parseFloat(tx.amount) || 0;
              
              if (tx.donorName) {
                uniqueDonors.add(tx.donorName);
              }
              
              txCount++;
            });
            
            // Get goal amount
            const goalAmount = parseFloat(goalInput.value) || 0;
            
            // Update stats UI
            raisedAmount.textContent = formatCurrency(totalRaised);
            donorCount.textContent = uniqueDonors.size;
            transactionCount.textContent = txCount;
            
            // Calculate and update progress
            if (goalAmount > 0) {
              const progressPercent = Math.min(100, (totalRaised / goalAmount) * 100);
              progressBar.style.width = `${progressPercent}%`;
              progressText.textContent = `${Math.round(progressPercent)}% of goal`;
            } else {
              progressBar.style.width = "0%";
              progressText.textContent = "0% of goal";
            }
          })
          .catch(error => {
            console.error("Error loading transactions:", error);
          });
      }
      
      /**
       * Load related data (transactions, impact reports, updates)
       * @param {firebase.database.Reference} ref - Donation reference
       */
      function loadRelatedData(ref) {
        // Load transactions, impact reports, and updates
        loadList("transactions", txList, transactionCount);
        loadList("impactReports", impList, impactCount);
        loadList("updates", updList, updateCount);
        
        /**
         * Load a list of items from a specific path
         * @param {string} path - Firebase path to load
         * @param {HTMLElement} listElement - List element to update
         * @param {HTMLElement} countElement - Count badge element
         */
        function loadList(path, listElement, countElement) {
          ref.child(path).orderByChild(path === "transactions" ? "timestamp" : "date")
            .limitToLast(3)
            .once("value")
            .then(snapshot => {
              const items = [];
              let count = 0;
              
              snapshot.forEach(child => {
                items.push(child.val());
                count++;
              });
              
              // Update count badge
              countElement.textContent = count;
              
              // Reverse to show newest first
              items.reverse();
              
              // Update list UI
              if (items.length) {
                listElement.innerHTML = items.map(item => {
                  let content = '';
                  
                  if (path === "transactions") {
                    const date = new Date(item.timestamp || 0).toLocaleDateString();
                    content = `
                      <span class="item-main">${item.donorName || 'Anonymous'}</span>
                      <span class="item-secondary">${formatCurrency(item.amount)} • ${date}</span>
                    `;
                  } else if (path === "impactReports") {
                    const date = new Date(item.date || 0).toLocaleDateString();
                    content = `
                      <span class="item-main">${item.title || 'No title'}</span>
                      <span class="item-secondary">${date}</span>
                    `;
                  } else { // updates
                    const date = new Date(item.date || 0).toLocaleDateString();
                    content = `
                      <span class="item-main">${item.message || 'No message'}</span>
                      <span class="item-secondary">${date}</span>
                    `;
                  }
                  
                  return `<li>${content}</li>`;
                }).join("");
              } else {
                listElement.innerHTML = `<li class="loading">No items yet</li>`;
              }
            })
            .catch(error => {
              console.error(`Error loading ${path}:`, error);
              listElement.innerHTML = `<li class="loading">Error loading data</li>`;
            });
        }
      }
      
      /**
       * Open modal with full list view
       * @param {string} path - Firebase path to load
       * @param {string} title - Modal title
       */
      function openListModal(path, title) {
        // Show and set up modal
        modalTitle.textContent = title;
        modalContent.innerHTML = '';
        modalContentLoader.style.display = 'flex';
        modalOverlay.classList.remove('hidden');
        
        // Load all items
        donationRef.child(path).orderByChild(path === "transactions" ? "timestamp" : "date")
          .once("value")
          .then(snapshot => {
            const items = [];
            
            snapshot.forEach(child => {
              items.push({
                id: child.key,
                ...child.val()
              });
            });
            
            // Hide loader
            modalContentLoader.style.display = 'none';
            
            // Reverse to show newest first
            items.reverse();
            
            // Update modal content
            if (items.length) {
              modalContent.innerHTML = items.map(item => {
                let content = '';
                
                if (path === "transactions") {
                  const date = new Date(item.timestamp || 0).toLocaleDateString();
                  content = `
                    <div class="modal-item-header">
                      <strong>${item.donorName || 'Anonymous'}</strong>
                      <span>${formatCurrency(item.amount)}</span>
                    </div>
                    <div class="modal-item-body">
                      <span class="modal-item-date">${date}</span>
                      ${item.message ? `<p>${item.message}</p>` : ''}
                    </div>
                  `;
                } else if (path === "impactReports") {
                  const date = new Date(item.date || 0).toLocaleDateString();
                  content = `
                    <div class="modal-item-header">
                      <strong>${item.title || 'No title'}</strong>
                      <span>${date}</span>
                    </div>
                    ${item.description ? `<div class="modal-item-body">
                      <p>${item.description}</p>
                    </div>` : ''}
                    <div class="modal-item-actions" data-id="${item.id}" data-type="impact">
                      <button class="btn-delete" title="Delete this report">
                        <i class="fas fa-trash"></i>
                      </button>
                    </div>
                  `;
                } else { // updates
                  const date = new Date(item.date || 0).toLocaleDateString();
                  content = `
                    <div class="modal-item-header">
                      <strong>Update</strong>
                      <span>${date}</span>
                    </div>
                    <div class="modal-item-body">
                      <p>${item.message || 'No message'}</p>
                    </div>
                    <div class="modal-item-actions" data-id="${item.id}" data-type="update">
                      <button class="btn-delete" title="Delete this update">
                        <i class="fas fa-trash"></i>
                      </button>
                    </div>
                  `;
                }
                
                return `<li>${content}</li>`;
              }).join("");
              
              // Add event listeners for delete buttons
              document.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', event => {
                  const parentActions = event.target.closest('.modal-item-actions');
                  const itemId = parentActions.dataset.id;
                  const itemType = parentActions.dataset.type;
                  
                  if (confirm(`Are you sure you want to delete this ${itemType}?`)) {
                    const deleteRef = itemType === 'impact' 
                      ? donationRef.child('impactReports').child(itemId)
                      : donationRef.child('updates').child(itemId);
                      
                    deleteRef.remove()
                      .then(() => {
                        showNotification(`${itemType === 'impact' ? 'Impact report' : 'Update'} deleted successfully`);
                        // Refresh modal content
                        openListModal(
                          itemType === 'impact' ? 'impactReports' : 'updates', 
                          itemType === 'impact' ? 'All Impact Reports' : 'All Usage Updates'
                        );
                        // Refresh preview lists
                        loadRelatedData(donationRef);
                      })
                      .catch(error => {
                        console.error(`Error deleting ${itemType}:`, error);
                        showNotification(`Error deleting: ${error.message}`, "error");
                      });
                  }
                });
              });
              
            } else {
              modalContent.innerHTML = `<li class="loading">No items to show</li>`;
            }
          })
          .catch(error => {
            console.error(`Error loading ${path}:`, error);
            modalContentLoader.style.display = 'none';
            modalContent.innerHTML = `<li class="loading">Error loading data</li>`;
          });
      }
      
      // Event handlers for "View All" buttons
      btnAllTx.addEventListener("click", () => {
        openListModal("transactions", "All Transactions");
      });
      
      btnAllImp.addEventListener("click", () => {
        openListModal("impactReports", "All Impact Reports");
      });
      
      btnAllUpd.addEventListener("click", () => {
        openListModal("updates", "All Usage Updates");
      });
      
      // Handle form submission
      donationForm.addEventListener("submit", event => {
        event.preventDefault();
        
        showLoading(true);
        
        // Get form values
        const nameVal = nameInput.value.trim();
        const gcashNameVal = gcashNameInput.value.trim();
        const gcashNumVal = gcashNumInput.value.trim();
        const detailsVal = detailsInput.value.trim();
        const purposeVal = purposeInput.value.trim();
        const goalVal = parseFloat(goalInput.value);
        
        // Validate form
        if (!nameVal || !gcashNameVal || !gcashNumVal || !detailsVal || !purposeVal || isNaN(goalVal) || goalVal <= 0) {
          showLoading(false);
          return showNotification("Please fill out all fields with valid values", "error");
        }
        
        // Validate GCash number format
        const gcashRegex = /^09\d{9}$/;
        if (!gcashRegex.test(gcashNumVal)) {
          showLoading(false);
          return showNotification("Please enter a valid GCash number (e.g. 09XXXXXXXXX)", "error");
        }
        
        // Update donation data
        donationRef.update({
          name: nameVal,
          gcashName: gcashNameVal,
          gcashNumber: gcashNumVal,
          details: detailsVal,
          purpose: purposeVal,
          goalAmount: goalVal,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        })
        .then(() => {
          showLoading(false);
          showNotification("Donation request updated successfully");
          
          // Redirect after a short delay
          setTimeout(() => {
            window.location.href = "donation.html";
          }, 1000);
        })
        .catch(error => {
          showLoading(false);
          console.error("Error updating donation:", error);
          showNotification("Error updating donation: " + error.message, "error");
        });
      });
      
      // Cancel button handler
      cancelBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to cancel? Any unsaved changes will be lost.")) {
          window.location.href = "donation.html";
        }
      });
      
      // Handle add impact report
      addImpactBtn.addEventListener("click", () => {
        addImpactModal.classList.remove("hidden");
      });
      
      // Handle add update
      addUpdateBtn.addEventListener("click", () => {
        addUpdateModal.classList.remove("hidden");
      });
      
      // Handle add impact form submission
      addImpactForm.addEventListener("submit", event => {
        event.preventDefault();
        
        const titleInput = document.getElementById("impactTitle");
        const descriptionInput = document.getElementById("impactDescription");
        
        const title = titleInput.value.trim();
        const description = descriptionInput.value.trim();
        
        if (!title || !description) {
          return showNotification("Please fill out all fields", "error");
        }
        
        // Generate a new key for the impact report
        const newImpactKey = donationRef.child("impactReports").push().key;
        
        // Create impact report object
        const impactReport = {
          title,
          description,
          date: firebase.database.ServerValue.TIMESTAMP
        };
        
        // Save impact report
        donationRef.child("impactReports").child(newImpactKey).set(impactReport)
          .then(() => {
            showNotification("Impact report added successfully");
            titleInput.value = "";
            descriptionInput.value = "";
            addImpactModal.classList.add("hidden");
            
            // Refresh preview lists
            loadRelatedData(donationRef);
          })
          .catch(error => {
            console.error("Error adding impact report:", error);
            showNotification("Error adding impact report: " + error.message, "error");
          });
      });
      
      // Handle add update form submission
      addUpdateForm.addEventListener("submit", event => {
        event.preventDefault();
        
        const messageInput = document.getElementById("updateMessage");
        const message = messageInput.value.trim();
        
        if (!message) {
          return showNotification("Please enter an update message", "error");
        }
        
        // Generate a new key for the update
        const newUpdateKey = donationRef.child("updates").push().key;
        
        // Create update object
        const update = {
          message,
          date: firebase.database.ServerValue.TIMESTAMP
        };
        
        // Save update
        donationRef.child("updates").child(newUpdateKey).set(update)
          .then(() => {
            showNotification("Update added successfully");
            messageInput.value = "";
            addUpdateModal.classList.add("hidden");
            
            // Refresh preview lists
            loadRelatedData(donationRef);
          })
          .catch(error => {
            console.error("Error adding update:", error);
            showNotification("Error adding update: " + error.message, "error");
          });
      });
      
      // Handle modal close buttons
      document.querySelectorAll(".modal-close").forEach(closeBtn => {
        closeBtn.addEventListener("click", () => {
          modalOverlay.classList.add("hidden");
          addUpdateModal.classList.add("hidden");
          addImpactModal.classList.add("hidden");
        });
      });
      
      // Close modals when clicking outside
      modalOverlay.addEventListener("click", event => {
        if (event.target === modalOverlay) {
          modalOverlay.classList.add("hidden");
        }
      });
      
      addUpdateModal.addEventListener("click", event => {
        if (event.target === addUpdateModal) {
          addUpdateModal.classList.add("hidden");
        }
      });
      
      addImpactModal.addEventListener("click", event => {
        if (event.target === addImpactModal) {
          addImpactModal.classList.add("hidden");
        }
      });
      
      // Initialize logout button
      document.getElementById("logout-btn").addEventListener("click", () => {
        firebase.auth().signOut()
          .then(() => {
            window.location.href = "index.html";
          })
          .catch(error => {
            console.error("Error signing out:", error);
            showNotification("Error signing out: " + error.message, "error");
          });
      });
    })
    .catch(error => {
      showLoading(false);
      console.error("Authentication error:", error);
    });
});