// js/orgRequestsIndicator.js
// Header bell + dropdown for org-wide adoption requests (Firebase v8)

(function () {
  const auth = firebase.auth();
  const db   = firebase.database();

  const OPEN = new Set(['pending', 'reviewed', 'meet_scheduled']);

  // ---- tiny helpers: last-seen stored in localStorage (no DB writes) ----
  function lsKey(uid){ return `orgInboxLastSeen:${uid}:adoptionRequests`; }
  function readLastSeen(uid){
    const v = localStorage.getItem(lsKey(uid));
    return v ? Number(v) : 0;
  }
  function writeLastSeen(uid, ts){
    try { localStorage.setItem(lsKey(uid), String(ts)); } catch (_) {}
  }

  // ---------------- UI bootstrap ----------------
  function mountBell() {
    const header = document.querySelector('.app-header');
    if (!header || header.querySelector('.req-bell')) return null;

    const wrap = document.createElement('div');
    wrap.className = 'req-bell';
    wrap.setAttribute('aria-label', 'Adoption requests');
    wrap.innerHTML = `
      <i class="fas fa-bell"></i>
      <span class="pill" style="display:none">0</span>
    `;

    const menu = document.createElement('div');
    menu.className = 'req-menu';
    menu.setAttribute('hidden', '');
    menu.innerHTML = `
      <div class="req-menu-header" style="display:flex;align-items:center;gap:.5rem">
        <span>Adoption Requests</span>
        <button id="markAllSeen" style="margin-left:auto;border:none;background:#eef3ff;color:#1565c0;padding:4px 8px;border-radius:999px;cursor:pointer;font-size:12px">Mark all seen</button>
      </div>
      <div class="req-menu-list"></div>
      <div class="req-menu-footer">
        <a href="adoption.html" style="text-decoration:none;color:#333">Open Adoptions</a>
      </div>
    `;

    const holder = document.createElement('div');
    holder.style.position = 'relative';
    holder.appendChild(wrap);
    holder.appendChild(menu);
    header.appendChild(holder);

    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = menu.hasAttribute('hidden');
      document.querySelectorAll('.req-menu').forEach(m => m.setAttribute('hidden',''));
      if (hidden) menu.removeAttribute('hidden');
    });
    document.addEventListener('click', () => menu.setAttribute('hidden',''));

    return {
      bell: wrap,
      pill: wrap.querySelector('.pill'),
      menu,
      list: menu.querySelector('.req-menu-list'),
      markAllBtn: menu.querySelector('#markAllSeen')
    };
  }

  // ---------------- Data wiring ----------------
  const petNameCache = {};
  async function getPetName(petId) {
    if (petNameCache[petId]) return petNameCache[petId];
    const snap = await db.ref('adoptions/' + petId).once('value');
    const name = (snap.val() && snap.val().name) || 'Pet';
    petNameCache[petId] = name;
    return name;
  }

  function summarize(listingMap, lastSeen) {
    const items = [];
    let totalOpen = 0;

    Object.keys(listingMap).forEach(petId => {
      const requests = listingMap[petId] || {};
      Object.values(requests).forEach(r => {
        const st = String(r.status || 'pending').toLowerCase();
        const ts = Number(r.updatedAt || r.createdAt || 0);
        items.push({ petId, reqId: r.id || r.requestId, status: st, ts, isNew: ts > lastSeen });
        if (OPEN.has(st)) totalOpen++;
      });
    });

    items.sort((a,b) => (b.ts||0) - (a.ts||0));
    return { items: items.slice(0, 12), totalOpen, newCount: items.filter(i => i.isNew && OPEN.has(i.status)).length, latestTs: items[0]?.ts || 0 };
  }

  function renderDropdown(ui, summary) {
    // show *new* count on the pill
    if (summary.newCount > 0) {
      ui.pill.style.display = 'inline-block';
      ui.pill.textContent = String(summary.newCount);
    } else {
      ui.pill.style.display = 'none';
      ui.pill.textContent = '0';
    }

    ui.list.innerHTML = '';
    if (summary.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'req-item';
      empty.style.cursor = 'default';
      empty.innerHTML = `<div class="meta">No recent requests</div>`;
      ui.list.appendChild(empty);
      return;
    }

    summary.items.forEach(async it => {
      const row = document.createElement('div');
      row.className = 'req-item';
      row.innerHTML = `
        <i class="fas fa-paw" style="color:#4caf50;"></i>
        <div>
          <div class="title" style="font-weight:600">Loading...</div>
          <div class="meta">${new Date(Number(it.ts||Date.now())).toLocaleString()}</div>
        </div>
        <span class="status">${it.status.replace('_',' ')}</span>
      `;
      if (it.isNew) row.style.background = '#fffbf2';
      row.addEventListener('click', () => {
        window.location.href = `adoptionRequests.html?id=${encodeURIComponent(it.petId)}`;
      });
      ui.list.appendChild(row);

      const name = await getPetName(it.petId);
      row.querySelector('.title').textContent = `${name} • ${it.status.replace('_',' ')}`;
    });

    return summary.latestTs;
  }

  // ---------------- Init ----------------
  auth.onAuthStateChanged(async (u) => {
    if (!u) return;

    const ui = mountBell();
    if (!ui) return;

    const lastSeen0 = readLastSeen(u.uid);

    const orgPath = 'adoptionRequestsByOrg/' + u.uid;
    db.ref(orgPath).on('value', (snap) => {
      const byListing = snap.val() || {};
      Object.keys(byListing).forEach(petId => {
        const reqs = byListing[petId] || {};
        Object.keys(reqs).forEach(rid => { if (!reqs[rid].id) reqs[rid].id = rid; });
      });

      const summary = summarize(byListing, readLastSeen(u.uid));
      const latestTs = renderDropdown(ui, summary);

      // “Mark all seen” button — only localStorage
      ui.markAllBtn.onclick = () => {
        const t = latestTs || Date.now();
        writeLastSeen(u.uid, t);
        // re-render with the new baseline
        const summary2 = summarize(byListing, t);
        renderDropdown(ui, summary2);
      };
    }, (err) => console.warn('req-indicator read error:', err));
  });
})();
