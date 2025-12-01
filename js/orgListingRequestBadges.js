// Per-card request count badges for org pet listings
// Drop-in: same API/classes; fewer DOM touches & lighter observer.

(function () {
  const auth = firebase.auth();
  const db   = firebase.database();
  const OPEN = new Set(['pending', 'reviewed', 'meet_scheduled']);

  let countsByPet = {}; // { petId: number }

  function computeCounts(byListing) {
    const out = {};
    Object.keys(byListing || {}).forEach(petId => {
      let n = 0;
      const reqs = byListing[petId] || {};
      Object.values(reqs).forEach(r => {
        const st = String(r.status || 'pending').toLowerCase();
        if (OPEN.has(st)) n++;
      });
      out[petId] = n;
    });
    return out;
  }

  // small debounce to avoid repaint storms
  const debounce = (fn, ms = 80) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const refreshAllBadges = debounce(() => {
    document.querySelectorAll('.card[data-pet-id]').forEach(card => {
      const petId = card.getAttribute('data-pet-id');
      if (!petId) return;

      const footer = card.querySelector('.card-footer');
      if (!footer) return;

      let badge = footer.querySelector('.req-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'req-badge';
        badge.title = 'View adoption requests';
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.href = `adoptionRequests.html?id=${encodeURIComponent(petId)}`;
        });
        footer.appendChild(badge);
      }

      const c = countsByPet[petId] || 0;
      if (c > 0) {
        badge.textContent = `${c} request${c > 1 ? 's' : ''}`;
        badge.removeAttribute('hidden');
      } else {
        badge.setAttribute('hidden', '');
      }
    });
  });

  function watchDom() {
    const grid = document.getElementById('adoption-cards');
    if (!grid) return;
    const mo = new MutationObserver(() => refreshAllBadges());
    // lighter observer: we only care when cards are added/removed at grid level
    mo.observe(grid, { childList: true });
    refreshAllBadges();
  }

  auth.onAuthStateChanged((u) => {
    if (!u) return;

    const orgPath = `adoptionRequestsByOrg/${u.uid}`;
    db.ref(orgPath).on('value', (snap) => {
      const byListing = snap.val() || {};
      // normalize ids (no layout change)
      Object.keys(byListing).forEach(petId => {
        Object.keys(byListing[petId] || {}).forEach(rid => {
          if (!byListing[petId][rid].id) byListing[petId][rid].id = rid;
        });
      });
      countsByPet = computeCounts(byListing);
      refreshAllBadges();
    }, (err) => console.warn('per-card badge read error:', err));

    watchDom();
  });
})();
