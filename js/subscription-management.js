// js/subscription-management.js
(async function initSubs() {
  const me = await DB.waitForAuthUser();
  if (!me) return (window.location = 'index.html');

  const isAdmin = await DB.isAdmin(me.uid);
  if (!isAdmin) return (window.location = 'index.html');

  const db         = firebase.database();
  const tbody      = document.querySelector('#subs-table tbody');
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // ---------- helpers ----------
  const toDateStr = (ms) => {
    const n = Number(ms);
    if (!n || isNaN(n)) return '—';
    try { return new Date(n).toISOString().slice(0, 10); }
    catch { return '—'; }
  };

  const planDurationMs = (plan) => {
    const p = (plan || '').toLowerCase();
    if (p === 'yearly' || p === 'annual' || p === 'annually') return 365 * MS_PER_DAY;
    return 30 * MS_PER_DAY; // default monthly
  };

  const computeStartMs = (rec) => {
    // prefer updatedAt if you use it as "period start"
    if (rec.updatedAt) return Number(rec.updatedAt);
    const endMs  = Number(rec.currentPeriodEndMs);
    const dur    = planDurationMs(rec.plan);
    return (endMs && dur) ? (endMs - dur) : null;
  };

  // ---------- load data ----------
  const subsSnap     = await db.ref('subscriptions').once('value');        // citizens
  const orgSubsSnap  = await db.ref('orgSubscriptions').once('value');     // orgs
  const citizenSubs  = subsSnap.val()    || {};
  const orgSubs      = orgSubsSnap.val() || {};

  const records = [];

  // citizens
  Object.entries(citizenSubs).forEach(([uid, rec]) => {
    const endMs = Number(rec.currentPeriodEndMs);
    if (!endMs) return; // skip invalid rows
    records.push({
      uid,
      type: 'user',
      plan:   (rec.plan   || '').toLowerCase(),
      status: (rec.status || '').toLowerCase(),
      startMs: computeStartMs(rec),
      endMs
    });
  });

  // orgs
  Object.entries(orgSubs).forEach(([uid, rec]) => {
    const endMs = Number(rec.currentPeriodEndMs);
    if (!endMs) return;
    records.push({
      uid,
      type: 'org',
      plan:   (rec.plan   || '').toLowerCase(),
      status: (rec.status || '').toLowerCase(),
      startMs: computeStartMs(rec),
      endMs
    });
  });

  const subsByUid = {};
  records.forEach(r => { subsByUid[r.uid] = r; });

  // ---------- render ----------
  tbody.innerHTML = '';

  for (const r of records) {
    const { uid, type, plan, status, startMs, endMs } = r;
    const startStr = toDateStr(startMs);
    const daysLeft = Math.ceil((endMs - Date.now()) / MS_PER_DAY);
    const isActive = status === 'active';

    // In your data, both citizen & org emails are in /users/<uid>/email
    const email = (await db.ref(`users/${uid}/email`).once('value')).val() || '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${email}</td>
      <td>${plan || '—'}</td>
      <td>${startStr}</td>
      <td>
        <span class="status ${isActive ? 'active' : 'inactive'}">
          ${isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <button class="action-btn ${isActive ? 'cancel' : ''}"
                data-uid="${uid}"
                data-type="${type}"
                data-action="toggle">
          ${isActive ? 'Cancel' : 'Re-activate'}
        </button>
        <button class="action-btn notify"
                data-uid="${uid}"
                data-type="${type}"
                data-days-left="${daysLeft}"
                ${daysLeft <= 7 && daysLeft > 0 ? '' : 'disabled'}>
          Notify
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // ---------- actions ----------
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const uid  = btn.dataset.uid;
    const type = btn.dataset.type;

    // toggle status
    if (btn.dataset.action === 'toggle') {
      const rec = subsByUid[uid];
      if (!rec) return;
      const nowActive = !(rec.status === 'active');
      const newStatus = nowActive ? 'active' : 'cancelled';
      const base      = (type === 'org') ? 'orgSubscriptions' : 'subscriptions';

      try {
        await db.ref(`${base}/${uid}/status`).set(newStatus);
        rec.status = newStatus;

        const row  = btn.closest('tr');
        const span = row.querySelector('.status');
        span.className   = `status ${nowActive ? 'active' : 'inactive'}`;
        span.textContent = nowActive ? 'Active' : 'Inactive';
        btn.textContent  = nowActive ? 'Cancel' : 'Re-activate';
        btn.classList.toggle('cancel', nowActive);
      } catch (err) {
        console.error(err);
        alert('Failed to update subscription status.');
      }
      return;
    }

    // notify
    if (btn.classList.contains('notify') && !btn.disabled) {
      const rec      = subsByUid[uid];
      const daysLeft = Number(btn.dataset.daysLeft);
      const planText = rec.plan || 'your';
      const message  = `Your ${planText} subscription ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`;
      const title    = 'Subscription Reminder';

      try {
        if (type === 'user') {
          const parentRef = db.ref(`notifications/${uid}`);
          const entryRef  = parentRef.child('entries').push();
          await entryRef.set({
            id: entryRef.key,
            title,
            message,
            sentAt: firebase.database.ServerValue.TIMESTAMP,
            read: false
          });
          await parentRef.child('unreadCount').transaction(c => (c || 0) + 1);
        } else {
          const parentRef = db.ref(`orgNotifications/${uid}`);
          const entryRef  = parentRef.child('entries').push();
          await entryRef.set({
            id: entryRef.key,
            title,
            message,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            read: false
          });
          await parentRef.child('unreadCount').transaction(c => (c || 0) + 1);
        }
        btn.textContent = 'Notified';
        btn.disabled    = true;
      } catch (err) {
        console.error(err);
        alert('Notify failed: ' + err.message);
      }
    }
  });
})();
