(async function initArticlesModeration() {
  if (!firebase.apps.length) {
    console.error("❌ Firebase not initialized — check config.js is loaded before this script.");
    return;
  }

  const db = firebase.database();
  const auth = firebase.auth();
  const $ = (id) => document.getElementById(id);

  const tableBody = $("articlesTable").querySelector("tbody");
  const categoryFilter = $("categoryFilter");
  const statusFilter = $("statusFilter");
  const searchBox = $("searchBox");

  const modal = $("previewModal");
  const modalTitle = $("modalTitle");
  const modalContent = $("modalContent");
  const modalImage = $("modalImage");
  const closeModal = $("closeModal");

  /* ---------- AUTH CHECK ---------- */
  const me = await new Promise((resolve) => auth.onAuthStateChanged((u) => resolve(u)));
  if (!me) return (window.location = "index.html");

  const adminSnap = await db.ref(`admins/${me.uid}`).once("value");
  if (!adminSnap.exists()) return (window.location = "index.html");

  /* ---------- DATA ---------- */
  let allArticles = {};

  db.ref("articles").on("value", (snap) => {
    allArticles = snap.val() || {};
    populateCategoryFilter();
    renderTable();
  });

  function populateCategoryFilter() {
    const cats = new Set(["all"]);
    Object.values(allArticles).forEach((a) => cats.add(a.category || "Uncategorized"));
    categoryFilter.innerHTML = [...cats]
      .map((c) => `<option value="${c}">${c}</option>`)
      .join("");
  }

  function renderTable() {
    const term = searchBox.value.toLowerCase();
    const cat = categoryFilter.value;
    const status = statusFilter.value;

    const filtered = Object.entries(allArticles)
      .filter(([id, a]) => {
        const title = (a.title || "").toLowerCase();
        const orgName = (a.orgName || "").toLowerCase();
        const category = (a.category || "Uncategorized");
        const stat = (a.status || "published").toLowerCase();

        const matchSearch = title.includes(term) || orgName.includes(term);
        const matchCat = cat === "all" || category === cat;
        const matchStatus = status === "all" || stat === status;
        return matchSearch && matchCat && matchStatus;
      })
      .sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" class="empty">No articles found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered
      .map(([id, a]) => {
        const created = new Date(a.createdAt || Date.now()).toLocaleDateString();
        const stat = (a.status || "published").toLowerCase();

        const authorName = a.orgName || a.author || "—";
        const authorPhoto = a.orgPhotoUrl || "";
        const authorHTML = authorPhoto
          ? `<div class="author-cell"><img src="${authorPhoto}" alt="logo"/><span>${authorName}</span></div>`
          : authorName;

        return `
          <tr>
            <td>${a.title || "(Untitled)"}</td>
            <td>${a.category || "Uncategorized"}</td>
            <td>${authorHTML}</td>
            <td><span class="status-${stat}">${stat}</span></td>
            <td>${created}</td>
            <td>
              <button class="btn-view" data-id="${id}">View</button>
              ${stat === "published" ? `<button class="btn-unpublish" data-id="${id}">Unpublish</button>` : `<button class="btn-publish" data-id="${id}">Publish</button>`}
              <button class="btn-archive" data-id="${id}">Archive</button>
            </td>
          </tr>`;
      })
      .join("");
  }

  [categoryFilter, statusFilter, searchBox].forEach((el) =>
    el.addEventListener("input", renderTable)
  );

  /* ---------- ACTIONS ---------- */
  tableBody.addEventListener("click", (e) => {
    const id = e.target.dataset.id;
    if (!id) return;

    const ref = db.ref(`articles/${id}`);
    const article = allArticles[id];

    if (e.target.classList.contains("btn-publish")) {
      ref.update({ status: "published" });
    } else if (e.target.classList.contains("btn-unpublish")) {
      ref.update({ status: "unpublished" });
    } else if (e.target.classList.contains("btn-archive")) {
      ref.update({ status: "archived" });
    } else if (e.target.classList.contains("btn-view")) {
      openPreview(article);
    }
  });

  /* ---------- MODAL ---------- */
  function openPreview(article) {
    modalTitle.textContent = article.title || "(Untitled)";
    modalContent.textContent = article.body || article.content || "(No content)";
    modalImage.src = article.coverUrl || "";
    modalImage.style.display = article.coverUrl ? "block" : "none";
    modal.style.display = "flex";
  }

  closeModal.onclick = () => (modal.style.display = "none");
  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };

  /* ---------- CONNECTION INDICATOR ---------- */
  const liveDot = document.getElementById("liveIndicator");
  if (liveDot) {
    db.ref(".info/connected").on("value", (snap) => {
      const connected = snap.val();
      liveDot.style.background = connected ? "#0f0" : "#f00";
      liveDot.style.boxShadow = connected
        ? "0 0 8px #0f0"
        : "0 0 8px #f00";
    });
  }

  console.log("✅ Articles Moderation (Semi-auto publish) loaded successfully");
})();
