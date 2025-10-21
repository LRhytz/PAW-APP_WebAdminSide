/* Adoption Requests page (ORG side)
   - Loads from /adoptionRequestsByListing/{petId} -> /adoptionRequests/{id}
   - On page load: PENDING -> REVIEWED (flat + ByOrg mirror)
   - Actions:
      * Approve -> schedule meet (creates /adoptionMeets + status=meet_scheduled)
      * If already meet_scheduled -> Finalize winner & close others (+ mark pet adopted, drop species index)
      * Decline -> status=declined
   - Also writes /userNotifications to the citizen (same as Android), including meet date/time + location + note.
*/
(function () {
  const auth = firebase.auth();
  const db   = firebase.database();

  // DOM
  const backBtn         = document.getElementById('back-btn');
  const logoutBtn       = document.getElementById('logout-btn');
  const petNameEl       = document.getElementById('pet-name');
  const totalRequestsEl = document.getElementById('total-requests');
  const pendingBadgeEl  = document.getElementById('pending-badge');
  const pendingCountEl  = document.getElementById('pending-count');
  const listEl          = document.getElementById('requests-list');
  const emptyEl         = document.getElementById('no-requests');
  const loadingEl       = document.getElementById('loading-indicator');
  const searchInput     = document.getElementById('search-requests');
  const sortSelect      = document.getElementById('sort-requests');

  // Modal
  const modal         = document.getElementById('request-modal');
  const modalBody     = document.getElementById('modal-body');
  const modalCloseX   = document.querySelector('.close-modal');
  const modalCloseBtn = document.getElementById('close-modal-btn');
  const approveBtn    = document.getElementById('approve-btn');
  const rejectBtn     = document.getElementById('reject-btn');

  const urlParams = new URLSearchParams(location.search);
  const petId = urlParams.get('id') || urlParams.get('petId');

  const state = {
    orgUid: null,
    pet: null,
    all: [],
    filtered: [],
    selected: null
  };

  backBtn?.addEventListener('click', () => history.back());
  logoutBtn?.addEventListener('click', () => auth.signOut());

  modalCloseX?.addEventListener('click', closeModal);
  modalCloseBtn?.addEventListener('click', closeModal);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  searchInput?.addEventListener('input', () => { applyFilters(); render(); });
  sortSelect?.addEventListener('change', () => { applyFilters(); render(); });

  // Action buttons
  approveBtn?.addEventListener('click', onApproveOrFinalize);
  rejectBtn?.addEventListener('click', () => updateStatus('declined'));

  auth.onAuthStateChanged(async (user) => {
    if (!user) { location.href = 'login.html'; return; }

    try {
      if (!petId) throw new Error('Missing pet/listing id');
      loading(true);

      // Load pet to get orgId
      const petSnap = await db.ref('adoptions/' + petId).once('value');
      state.pet = petSnap.val();
      if (!state.pet) throw new Error('Pet not found or no access');

      petNameEl.textContent = state.pet.name || 'Pet';
      state.orgUid = state.pet.orgId;

      // Collect request ids from listing index
      const indexSnap = await db.ref('adoptionRequestsByListing/' + petId).once('value');
      const ids = [];
      indexSnap.forEach(ch => { if (ch.val()) ids.push(ch.key); });

      if (!ids.length) {
        state.all = [];
        updateCounts();
        loading(false);
        render();
        return;
      }

      // Fetch requests
      const reqSnaps = await Promise.all(ids.map(id => db.ref('adoptionRequests/' + id).once('value')));
      const apps = reqSnaps.map(s => ({ id: s.key, ...s.val() })).filter(a => a && a.listingId === petId);
      state.all = apps;

      // Mark all PENDING -> REVIEWED (flat + org mirror), like Android
      const toReviewed = state.all
        .filter(a => (a.status || 'pending').toLowerCase() === 'pending')
        .map(a => a.id);

      if (toReviewed.length) {
        const updates = {};
        toReviewed.forEach(id => {
          updates[`adoptionRequests/${id}/status`]    = 'reviewed';
          updates[`adoptionRequests/${id}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
          if (state.orgUid) {
            updates[`adoptionRequestsByOrg/${state.orgUid}/${petId}/${id}/status`]    = 'reviewed';
            updates[`adoptionRequestsByOrg/${state.orgUid}/${petId}/${id}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
          }
        });
        try {
          await db.ref().update(updates);
          state.all = state.all.map(a => toReviewed.includes(a.id)
            ? { ...a, status: 'reviewed', updatedAt: Date.now() }
            : a
          );
        } catch (e) { console.warn('Could not mark reviewed:', e); }
      }

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

  function loading(isLoading) { if (loadingEl) loadingEl.style.display = isLoading ? 'block' : 'none'; }

  function applyFilters() {
    const q = (searchInput?.value || '').toLowerCase().trim();
    let arr = [...state.all];

    if (q) {
      arr = arr.filter(a => {
        const name  = (a.fullName || a.requesterName || '').toLowerCase();
        const email = (a.email || a.requesterEmail || '').toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }

    const sort = sortSelect?.value;
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
    const pendingOnly = state.all.filter(a => (a.status || 'pending').toLowerCase() === 'pending');
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
    const name  = a.fullName || a.requesterName || 'Unknown';
    const email = a.email || a.requesterEmail || '—';
    const phone = a.phone || '—';
    const when  = a.createdAt || a.appliedTimestamp || Date.now();
    const date  = new Date(Number(when)).toLocaleString();
    const status= (a.status || 'pending');

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

    // Button enable/disable + label logic (disable for closed states)
    const st = (app.status || 'pending').toLowerCase();
    const actionable = st === 'pending' || st === 'reviewed' || st === 'meet_scheduled';
    approveBtn.disabled = !actionable;
    rejectBtn.disabled  = !actionable;
    approveBtn.textContent = (st === 'meet_scheduled') ? 'Finalize' : 'Approve';
    approveBtn.style.opacity = actionable ? '1' : '0.6';
    rejectBtn.style.opacity  = actionable ? '1' : '0.6';
  }

  function closeModal() {
    state.selected = null;
    modal.classList.remove('show');
  }

  const prettyNote = (txt = "") => {
    if (!txt || typeof txt !== "string") return "No additional details";
    let t = txt.trim();
    t = t.replace(/\s*—\s*/g, "\n");
    t = t.replace(/•/g, "\n• ");
    t = t.replace(/\s([A-Z][A-Za-z/&\s]{2,}?):/g, "\n$1:");
    t = t.replace(/(^|\n)([A-Z][A-Za-z/&\s]{2,}?):/g, (m, p1, p2) => `${p1}<b>${p2}:</b> `);
    t = t.replace(/\n{3,}/g, "\n\n");
    return t;
  };

  function buildModalHTML(a) {
    const name  = a.fullName || a.requesterName || 'Not provided';
    const email = a.email || a.requesterEmail || '';
    const phone = a.phone || '';
    const when  = a.createdAt || a.appliedTimestamp || null;
    const whenText = when ? new Date(Number(when)).toLocaleString() : 'Unknown';

    // Approve hint
    const hint = (a.status || '').toLowerCase() === 'meet_scheduled'
      ? 'Finalize adoption for this applicant'
      : 'Approve & schedule a meet';

    return `
      <div class="modal-section">
        <h3>Applicant Information</h3>
        <div class="detail-grid">
          <div class="detail-item"><div class="label">Full Name</div><div class="value">${name}</div></div>
          <div class="detail-item"><div class="label">Applied On</div><div class="value">${whenText}</div></div>
          <div class="detail-item"><div class="label">Email</div><div class="value">${email ? `<a href="mailto:${email}">${email}</a>` : 'Not provided'}</div></div>
          <div class="detail-item"><div class="label">Phone</div><div class="value">${phone ? `<a href="tel:${phone}">${phone}</a>` : 'Not provided'}</div></div>
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
      <p style="margin:.5rem 0 0;color:#666;font-size:.9rem">${hint}</p>
    `;
  }

  // ================= ORG ACTIONS =================

  // Approve → schedule meet (if not yet), else finalize winner
  async function onApproveOrFinalize() {
    const r = state.selected;
    if (!r) return;

    const st = (r.status || 'pending').toLowerCase();
    const actionable = st === 'pending' || st === 'reviewed' || st === 'meet_scheduled';
    if (!actionable) return; // ignore clicks for closed requests

    try {
      if (st === 'meet_scheduled') {
        await finalizeWinnerAndCloseOthers(r);
        toast('Adoption finalized');
        closeModal();
        return;
      }

      await scheduleMeet(r);
      toast('Meet scheduled');
      closeModal();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to perform action');
    }
  }

  // Decline & mirror
  async function updateStatus(next) {
    if (!state.selected) return;
    try {
      const id = state.selected.id;

      const updates = {
        [`adoptionRequests/${id}/status`]: next,
        [`adoptionRequests/${id}/updatedAt`]: firebase.database.ServerValue.TIMESTAMP
      };
      if (state.orgUid) {
        updates[`adoptionRequestsByOrg/${state.orgUid}/${petId}/${id}/status`] = next;
        updates[`adoptionRequestsByOrg/${state.orgUid}/${petId}/${id}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
      }
      await db.ref().update(updates);

      // notify citizen when declined
      const citizenId = (state.selected.citizenId || '').trim();
      if (citizenId && next === 'declined') {
        await notifyCitizenStatus(
          citizenId,
          id,
          'Adoption Decision',
          `Thank you for your interest in adopting ${(state.selected.petName || 'this pet')}. ` +
          `After review, we’re not able to approve this request right now. ` +
          `Please consider other pets in our care—happy to help with suggestions!`
        );
      }

      // local state
      const idx = state.all.findIndex(x => x.id === id);
      if (idx >= 0) {
        state.all[idx].status = next;
        state.all[idx].updatedAt = Date.now();
      }

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

  // ---------- schedule meet (prompts for when/where/note) ----------
  async function scheduleMeet(req) {
    // simple inputs via prompt to avoid building a new dialog right now
    const whenStr = window.prompt('Meet date/time (YYYY-MM-DD HH:mm)', '');
    if (!whenStr) throw new Error('Cancelled');
    const where = window.prompt('Meet location', '') || '';
    if (!where.trim()) throw new Error('Location required');
    const note = window.prompt('Optional note to the applicant', '') || '';

    // parse when (best-effort)
    const whenEpochMs = Date.parse(whenStr.replace(' ', 'T')) || (Date.now() + 3*24*60*60*1000);
    const whenText = new Date(whenEpochMs).toLocaleString();

    const orgId = state.orgUid || req.orgId || '';
    const citizenId = (req.citizenId || '').trim();
    const meetRef = db.ref('adoptionMeets').push();
    const meetId  = meetRef.key;

    const updates = {};

    // meet record
    updates[`adoptionMeets/${meetId}/id`]          = meetId;
    updates[`adoptionMeets/${meetId}/requestId`]   = req.id;
    updates[`adoptionMeets/${meetId}/orgId`]       = orgId;
    updates[`adoptionMeets/${meetId}/petId`]       = petId;
    updates[`adoptionMeets/${meetId}/citizenId`]   = citizenId;
    updates[`adoptionMeets/${meetId}/scheduledAt`] = whenEpochMs;
    updates[`adoptionMeets/${meetId}/location`]    = where;
    updates[`adoptionMeets/${meetId}/note`]        = note;
    updates[`adoptionMeets/${meetId}/createdAt`]   = firebase.database.ServerValue.TIMESTAMP;
    updates[`adoptionMeets/${meetId}/updatedAt`]   = firebase.database.ServerValue.TIMESTAMP;

    // flip request status (flat + org mirror)
    updates[`adoptionRequests/${req.id}/status`]    = 'meet_scheduled';
    updates[`adoptionRequests/${req.id}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
    if (orgId) {
      updates[`adoptionRequestsByOrg/${orgId}/${petId}/${req.id}/status`]    = 'meet_scheduled';
      updates[`adoptionRequestsByOrg/${orgId}/${petId}/${req.id}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
    }

    // Notify requester (includes when/where/note in both body and fields)
    if (citizenId) {
      const notifRef = db.ref('userNotifications').child(citizenId).push();
      const payload = {
        id: notifRef.key,
        type: 'request_status',
        requestId: req.id,
        title: `Meet scheduled for ${(req.petName || 'the pet')}`,
        body: `Your meet is scheduled for ${whenText} at ${where}.` + (note ? `\nNote: ${note}` : ''),
        scheduledAt: whenEpochMs,
        location: where,
        note: note,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        seen: false
      };
      updates[`userNotifications/${citizenId}/${notifRef.key}`] = payload;
    }

    await db.ref().update(updates);

    // reflect locally
    const idx = state.all.findIndex(x => x.id === req.id);
    if (idx >= 0) {
      state.all[idx].status = 'meet_scheduled';
      state.all[idx].updatedAt = Date.now();
    }
    updateCounts(); applyFilters(); render();
  }

  // ---------- finalize winner & close others ----------
  async function finalizeWinnerAndCloseOthers(winner) {
    const orgId = state.orgUid || winner.orgId || '';
    if (!orgId) throw new Error('Missing orgId');

    const byOrgRef = db.ref(`adoptionRequestsByOrg/${orgId}/${petId}`);
    const snap = await byOrgRef.once('value');

    const updates = {};

    // winner -> finalized
    updates[`adoptionRequests/${winner.id}/status`]    = 'finalized';
    updates[`adoptionRequests/${winner.id}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
    updates[`adoptionRequestsByOrg/${orgId}/${petId}/${winner.id}/status`]    = 'finalized';
    updates[`adoptionRequestsByOrg/${orgId}/${petId}/${winner.id}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;

    // listing -> adopted/unavailable
    updates[`adoptions/${petId}/available`] = false;
    updates[`adoptions/${petId}/status`]    = 'adopted';
    updates[`adoptions/${petId}/adoptedAt`] = firebase.database.ServerValue.TIMESTAMP;
    updates[`adoptions/${petId}/adoptedBy`] = (winner.citizenId || '').trim();

    // drop species index
    const species = (winner.species || state.pet?.species || '').toLowerCase();
    if (species) {
      updates[`adoptionsBySpecies/${species}/${petId}`] = null;
    }

    // decline others + notify
    snap.forEach((c) => {
      const other = c.val() || {};
      const otherId = other.id;
      if (!otherId || otherId === winner.id) return;

      const st = (other.status || '').toLowerCase();
      const isClosed = st === 'finalized' || st === 'declined' || st === 'cancelled';
      if (isClosed) return;

      updates[`adoptionRequests/${otherId}/status`]    = 'declined';
      updates[`adoptionRequests/${otherId}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
      updates[`adoptionRequestsByOrg/${orgId}/${petId}/${otherId}/status`]    = 'declined';
      updates[`adoptionRequestsByOrg/${orgId}/${petId}/${otherId}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;

      const otherCitizen = (other.citizenId || '').trim();
      if (otherCitizen) {
        const notifRef = db.ref('userNotifications').child(otherCitizen).push();
        const payload = {
          id: notifRef.key, type: 'request_status', requestId: otherId,
          title: 'Adoption Update',
          body: `Thanks for applying to adopt ${(winner.petName || 'this pet')}. Another applicant was selected and the pet has now been adopted. We’d be happy to suggest other great matches for your home—thank you for supporting rescue!`,
          createdAt: firebase.database.ServerValue.TIMESTAMP, seen: false
        };
        updates[`userNotifications/${otherCitizen}/${notifRef.key}`] = payload;
      }
    });

    // notify winner
    const winCitizen = (winner.citizenId || '').trim();
    if (winCitizen) {
      const notifRef = db.ref('userNotifications').child(winCitizen).push();
      const payload = {
        id: notifRef.key, type: 'request_status', requestId: winner.id,
        title: 'Pawsome! Adoption Finalized 🐾',
        body: `Pawsome! Your adoption of ${(winner.petName || 'the pet')} has been finalized. We’ll follow up with paperwork, pickup logistics, and care tips. Welcome to the pack!`,
        createdAt: firebase.database.ServerValue.TIMESTAMP, seen: false
      };
      updates[`userNotifications/${winCitizen}/${notifRef.key}`] = payload;
    }

    await db.ref().update(updates);

    // reflect locally
    state.all = state.all.map(a =>
      a.id === winner.id ? { ...a, status: 'finalized', updatedAt: Date.now() }
      : { ...a, status: a.status === 'finalized' || a.status === 'declined' || a.status === 'cancelled' ? a.status : 'declined' }
    );
    updateCounts(); applyFilters(); render();
  }

  // ---------- tiny helper: user notification ----------
  async function notifyCitizenStatus(citizenId, requestId, title, body) {
    const ref = db.ref('userNotifications').child(citizenId).push();
    const payload = {
      id: ref.key, type: 'request_status', requestId, title, body,
      createdAt: firebase.database.ServerValue.TIMESTAMP, seen: false
    };
    await ref.set(payload);
  }

  // ---------- toast ----------
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'notification show';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.classList.remove('show'); el.remove(); }, 2200);
  }
})();
