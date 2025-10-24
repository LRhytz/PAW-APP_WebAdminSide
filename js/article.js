// js/article.js
(function () {
  const db = () => firebase.database();
  const list = document.getElementById("articlesList");

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

    const snap = await db()
      .ref("articles")
      .orderByChild("orgId")
      .equalTo(me.uid)
      .once("value");

    if (!snap.exists()) {
      list.innerHTML = `<p class="loading">No articles found. <a href="create-article.html">Create one?</a></p>`;
      return;
    }

    const articles = Object.entries(snap.val()).reverse();

    list.innerHTML = articles
      .map(([id, a]) => {
        const date = new Date(a.publishedAt || Date.now()).toLocaleDateString();
        return `
          <div class="article-card" data-id="${id}">
            <img src="${a.coverUrl || 'https://via.placeholder.com/300x160?text=No+Image'}" alt="cover">
            <div class="article-info">
              <h3>${a.title || "Untitled"}</h3>
              <p>${a.description || ""}</p>
              <small>${a.category || "General"} • ${date}</small>
            </div>
          </div>
        `;
      })
      .join("");

    // ✅ Make each article clickable
    document.querySelectorAll(".article-card").forEach((card) => {
      card.addEventListener("click", () => {
        const articleId = card.dataset.id;
        window.location.href = `article-detail.html?id=${articleId}`;
      });
    });
  }

  init().catch((err) => {
    console.error(err);
    list.innerHTML = `<p class="loading">Failed to load articles.</p>`;
  });
})();
