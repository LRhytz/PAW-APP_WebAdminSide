/* Adoption Requests page logic: loads requests, shows badge, pretty message, approve/reject */

(function () {
  const auth = firebase.auth();
  const db = firebase.database();

  // DOM
  const backBtn = document.getElementById('back-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const petNameEl = document.getElementById('pet-name');
  const totalRequestsEl = document.getElementById('total-requests');
  const pendingBadgeEl = document.getElementById('pending-badge');
  const pendingCountEl = document.getElementById('pending-count');
  const listEl = document.getElementById('requests-list');
  const emptyEl = document.getElementById('no-requests');
  const loadingEl = document.getElementById('loading-indicator');
  const searchInput = document.getElementById('search-requests');
  const sortSelect = document.getElementById('sort-requests');

  // Modal
  const modal = document.getElementById('request-modal');
  const modalBody = document.getElementById('modal-body');
  const modalCloseX = document.querySelector('.close-modal');
  const modalCloseBtn = document.getElementById('close-modal-btn');
  const approveBtn = document.getElementById('approve-btn');
  const rejectBtn = document.getElementById('reject-btn');

  const urlParams = new URLSearchParams(location.search);
  const petId = urlParams.get('id') || urlParams.get('petId');

  const state = {
    orgUid: null,
    pet: null,
    all: [],
    filtered: [],
    selected: null
  };

  backBtn.addEventListener('click', () => history.back());
  logoutBtn.addEventListener('click', () => auth.signOut());

  modalCloseX.addEventListener('click', closeModal);
  modalCloseBtn.addEventListener('click', closeModal);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  searchInput.addEventListener('input', () => {
    applyFilters();
    render();
  });

  sortSelect.addEventListener('change', () => {
    applyFilters();
    render();
  });

  approveBtn.addEventListener('click', () => updateStatus('approved'));
  rejectBtn.addEventListener('click', () => updateStatus('declined'));

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      location.href = 'login.html';
      return;
    }

    try {
      if (!petId) throw new Error('Missing pet/listing id');

      loading(true);

      // Load the pet; this also gives us orgId to satisfy rules
      const petSnap = await db.ref('adoptions/' + petId).once('value');
      state.pet = petSnap.val();
      if (!state.pet) throw new Error('Pet not found or no access');

      petNameEl.textContent = state.pet.name || 'Pet';

      // org that owns this pet
      state.orgUid = state.pet.orgId;

      // Collect request IDs from the index that the rules expose
      const indexSnap = await db.ref('adoptionRequestsByListing/' + petId).once('value');
      const ids = [];
      indexSnap.forEach((child) => { if (child.val()) ids.push(child.key); });

      if (ids.length === 0) {
        state.all = [];
        updateCounts();
        loading(false);
        render();
        return;
      }

      // Fetch the actual requests (parallel)
      const reqSnaps = await Promise.all(
        ids.map(id => db.ref('adoptionRequests/' + id).once('value'))
      );

      const apps = reqSnaps
        .map(s => ({ id: s.key, ...s.val() }))
        .filter(a => a && a.listingId === petId); // defensive

      state.all = apps;

      updateCounts();
      applyFilters();
      render();
      loading(false);
    } catch (err) {
      console.error('Failed to load requests:', err);
      alert('Failed to load requests. ' + err.message);
      loading(false);
    }
  });

  function loading(isLoading) {
    loadingEl.style.display = isLoading ? 'block' : 'none';
  }

  function applyFilters() {
    const q = (searchInput.value || '').toLowerCase().trim();
    let arr = [...state.all];

    if (q) {
      arr = arr.filter(a => {
        const name = (a.fullName || a.requesterName || '').toLowerCase();
        const email = (a.email || a.requesterEmail || '').toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }

    const sort = sortSelect.value;
    if (sort === 'name') {
      arr.sort((a, b) => (a.fullName || a.requesterName || '').localeCompare(b.fullName || b.requesterName || ''));
    } else {
      const getTs = (x) => Number(x.createdAt || x.appliedTimestamp || 0);
      arr.sort((a, b) => getTs(b) - getTs(a));
      if (sort === 'oldest') arr.reverse();
    }

    state.filtered = arr;
  }

  function updateCounts() {
    const total = state.all.length;
    const pendingOnly = state.all.filter(a => (a.status || 'pending') === 'pending');
    totalRequestsEl.textContent = String(total);

    if (pendingOnly.length > 0) {
      pendingCountEl.textContent = String(pendingOnly.length);
      pendingBadgeEl.style.display = 'inline-flex';
    } else {
      pendingBadgeEl.style.display = 'none';
    }
  }

  function render() {
    listEl.innerHTML = '';
    const arr = state.filtered.length ? state.filtered : state.all;

    if (!arr.length) {
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';

    arr.forEach(app => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = cardHTML(app);
      card.addEventListener('click', () => openModal(app));
      listEl.appendChild(card);
    });
  }

  function cardHTML(a) {
    const name = a.fullName || a.requesterName || 'Unknown';
    const email = a.email || a.requesterEmail || '—';
    const phone = a.phone || '—';
    const when = a.createdAt || a.appliedTimestamp || Date.now();
    const date = new Date(Number(when)).toLocaleString();
    const status = (a.status || 'pending');

    return `
      <h3>${name}</h3>
      <div class="card-meta">
        <i class="fas fa-envelope"></i> ${email}
        <span class="date">${date}</span>
      </div>
      <div class="card-field"><i class="fas fa-phone"></i><p>${phone}</p></div>
      <div class="card-footer">
        <span class="status-badge ${status === 'pending' ? 'new' : ''}">${status}</span>
        <span class="view-details">View details</span>
      </div>
    `;
  }

  // ---------- Modal ----------
  function openModal(app) {
    state.selected = app;
    modalBody.innerHTML = buildModalHTML(app);
    modal.classList.add('show');
  }

  function closeModal() {
    state.selected = null;
    modal.classList.remove('show');
  }

  const prettyNote = (txt = "") => {
    if (!txt || typeof txt !== "string") return "No additional details";

    let t = txt.trim();

    // Common separators → line breaks
    t = t.replace(/\s*—\s*/g, "\n");     // em-dash groups into new lines
    t = t.replace(/•/g, "\n• ");         // bullet → new line

    // Add line breaks before Label:
    t = t.replace(/\s([A-Z][A-Za-z/&\s]{2,}?):/g, "\n$1:");

    // Bold labels at the start of lines
    t = t.replace(/(^|\n)([A-Z][A-Za-z/&\s]{2,}?):/g, (m, p1, p2) => `${p1}<b>${p2}:</b> `);

    // Compress extra blank lines
    t = t.replace(/\n{3,}/g, "\n\n");

    return t;
  };

  function buildModalHTML(a) {
    const name = a.fullName || a.requesterName || 'Not provided';
    const email = a.email || a.requesterEmail || '';
    const phone = a.phone || '';
    const when = a.createdAt || a.appliedTimestamp || null;
    const whenText = when ? new Date(Number(when)).toLocaleString() : 'Unknown';

    return `
      <div class="modal-section">
        <h3>Applicant Information</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="label">Full Name</div>
            <div class="value">${name}</div>
          </div>
          <div class="detail-item">
            <div class="label">Applied On</div>
            <div class="value">${whenText}</div>
          </div>
          <div class="detail-item">
            <div class="label">Email</div>
            <div class="value">
              ${email ? `<a href="mailto:${email}">${email}</a>` : 'Not provided'}
            </div>
          </div>
          <div class="detail-item">
            <div class="label">Phone</div>
            <div class="value">
              ${phone ? `<a href="tel:${phone}">${phone}</a>` : 'Not provided'}
            </div>
          </div>
        </div>
      </div>

      <div class="modal-section">
        <h3>Message</h3>
        <div class="detail-grid">
          <div class="detail-item detail-full">
            <div class="label">Applicant Note</div>
            <div class="value message-text">${prettyNote(a.message)}</div>
          </div>
        </div>
      </div>
    `;
  }

  async function updateStatus(next) {
    if (!state.selected) return;
    try {
      const id = state.selected.id;
      await db.ref('adoptionRequests/' + id).update({
        status: next,
        updatedAt: Date.now()
      });

      // reflect in local state
      const idx = state.all.findIndex(x => x.id === id);
      if (idx >= 0) state.all[idx].status = next;

      updateCounts();
      applyFilters();
      render();
      closeModal();
      toast(`Application ${next}`);
    } catch (e) {
      console.error('Failed to update status', e);
      alert('Failed to update status: ' + e.message);
    }
  }

  // tiny toast
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'notification show';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.classList.remove('show'); el.remove(); }, 2200);
  }
})();
