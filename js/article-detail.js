// js/article-detail.js
(function () {
  const db = () => firebase.database();
  const container = document.getElementById("articleDetail");

  async function waitForUser() {
    return new Promise((resolve) => {
      const off = firebase.auth().onAuthStateChanged((u) => {
        off();
        resolve(u || null);
      });
    });
  }

  function getArticleId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  async function init() {
    const me = await waitForUser();
    if (!me) {
      window.location.href = "index.html";
      return;
    }

    const articleId = getArticleId();
    if (!articleId) {
      container.innerHTML = `<p class="loading">No article selected.</p>`;
      return;
    }

    const snap = await db().ref("articles/" + articleId).once("value");
    if (!snap.exists()) {
      container.innerHTML = `<p class="loading">Article not found.</p>`;
      return;
    }

    const a = snap.val();
    const date = new Date(a.publishedAt || Date.now()).toLocaleDateString();

    container.innerHTML = `
      <img src="${a.coverUrl || 'https://via.placeholder.com/800x400?text=No+Image'}" alt="cover image">
      <h2>${a.title}</h2>
      <div class="article-meta">${a.category || "General"} • ${date}</div>
      <div class="article-description">${a.description || ""}</div>
      <div class="article-body">${a.body || ""}</div>
      <a href="article.html" class="back-link"><i class="fas fa-arrow-left"></i> Back to Articles</a>
    `;
  }

  init().catch((err) => {
    console.error(err);
    container.innerHTML = `<p class="loading">Failed to load article.</p>`;
  });
})();
