// js/create-article.js
(function () {
  const db = () => firebase.database();
  const storage = () => firebase.storage();

  async function waitForUser() {
    return new Promise((resolve) => {
      const off = firebase.auth().onAuthStateChanged((u) => {
        off();
        resolve(u || null);
      });
    });
  }

  async function init() {
    const me = await waitForUser();
    if (!me) {
      window.location.href = "index.html";
      return;
    }

    const form = document.getElementById("articleForm");
    const fileInput = document.getElementById("coverImage");
    const previewImage = document.getElementById("previewImage");
    const previewContainer = document.getElementById("previewContainer");
    const removeImageBtn = document.getElementById("removeImage");
    const descriptionTextarea = document.getElementById("description");
    const charCount = document.querySelector(".char-count");
    const loadingOverlay = document.getElementById("loadingOverlay");

    // Character counter for description
    if (descriptionTextarea && charCount) {
      descriptionTextarea.addEventListener("input", () => {
        const length = descriptionTextarea.value.length;
        charCount.textContent = `${length} / 200`;
        
        if (length > 180) {
          charCount.style.color = "#f44336";
        } else {
          charCount.style.color = "#9e9e9e";
        }
      });
    }

    // Image preview
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          alert("Please select a valid image file.");
          fileInput.value = "";
          return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          alert("Image size should not exceed 5MB.");
          fileInput.value = "";
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          previewImage.src = reader.result;
          previewContainer.classList.add("active");
        };
        reader.readAsDataURL(file);
      }
    });

    // Remove image preview
    if (removeImageBtn) {
      removeImageBtn.addEventListener("click", () => {
        fileInput.value = "";
        previewImage.src = "";
        previewContainer.classList.remove("active");
      });
    }

    // Form submission
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = document.getElementById("title").value.trim();
      const category = document.getElementById("category").value.trim();
      const description = document.getElementById("description").value.trim();
      const body = document.getElementById("body").value.trim();
      const file = fileInput.files[0];

      // Validation
      if (!title) {
        alert("Please enter a title.");
        document.getElementById("title").focus();
        return;
      }

      if (!category) {
        alert("Please select a category.");
        document.getElementById("category").focus();
        return;
      }

      if (!body) {
        alert("Please enter article content.");
        document.getElementById("body").focus();
        return;
      }

      if (!file) {
        alert("Please select a cover image.");
        return;
      }

      // Show loading overlay
      loadingOverlay.classList.add("active");

      try {
        const articleId = db().ref().child("articles").push().key;
        const now = Date.now();

        // Upload cover image
        const storageRef = storage().ref(`articles/${me.uid}/${articleId}/${file.name}`);
        await storageRef.put(file);
        const coverUrl = await storageRef.getDownloadURL();

        // Prepare article data
        const data = {
          id: articleId,
          orgId: me.uid,
          title,
          category,
          description: description || "",
          coverUrl,
          body,
          status: "published",
          createdAt: now,
          updatedAt: now,
          publishedAt: now,
        };

        // Save to database
        await db().ref("articles/" + articleId).set(data);

        // Hide loading overlay
        loadingOverlay.classList.remove("active");

        // Show success message
        alert("✅ Article published successfully!");
        
        // Redirect to articles page
        window.location.href = "article.html";
      } catch (err) {
        console.error("Error publishing article:", err);
        loadingOverlay.classList.remove("active");
        alert("❌ Error publishing article. Please try again.");
      }
    });
  }

  init().catch((err) => console.error("Create article init error:", err));
})();