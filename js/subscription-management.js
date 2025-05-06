// js/subscription-management.js

firebase.auth().onAuthStateChanged(admin => {
  if (!admin) {
    window.location = 'index.html';
    return;
  }

  const db        = firebase.database();
  const tbody     = document.querySelector('#subs-table tbody');
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // ─── 1) Load citizen subscriptions ────────────────────────────────────
  db.ref('subscriptions').once('value')
    .then(subsSnap => {
      const citizenSubs = subsSnap.val() || {};

      // ─── 2) Load organizations ──────────────────────────────────────────
      return db.ref('organizations').once('value')
        .then(orgSnap => {
          const orgs = orgSnap.val() || {};
          const records = [];

          // citizens
          Object.entries(citizenSubs).forEach(([uid, rec]) => {
            if (rec.startDate) {
              records.push({
                uid,
                plan:      rec.plan,
                startDate: rec.startDate,
                status:    rec.status,
                type:      'user'
              });
            }
          });

          // organizations
          Object.entries(orgs).forEach(([uid, rec]) => {
            const s = rec.subscription;
            if (s && s.startDate) {
              records.push({
                uid,
                plan:      s.plan,
                startDate: s.startDate,
                status:    s.status,
                type:      'org'
              });
            }
          });

          return records;
        });
    })
    .then(records => {
      // index by uid for click handlers
      const subsByUid = {};
      records.forEach(r => { subsByUid[r.uid] = r; });

      tbody.innerHTML = '';

      // render rows
      records.forEach(r => {
        const { uid, plan, startDate, status, type } = r;
        const startTs  = Number(startDate);
        const start    = new Date(startTs);
        const end      = plan==='yearly'
          ? new Date(startTs + 365 * MS_PER_DAY)
          : new Date(startTs + 30  * MS_PER_DAY);
        const daysLeft = Math.ceil((end - Date.now()) / MS_PER_DAY);
        const isActive = status==='active';
        const startStr = start.toISOString().slice(0,10);

        // fetch email
        const emailPath = type==='user'
          ? `users/${uid}/email`
          : `organizations/${uid}/email`;

        db.ref(emailPath).once('value').then(snap => {
          const email = snap.val() || '—';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${email}</td>
            <td>${plan||'—'}</td>
            <td>${startStr}</td>
            <td>
              <span class="status ${isActive?'active':'inactive'}">
                ${isActive?'Active':'Inactive'}
              </span>
            </td>
            <td>
              <button
                class="action-btn ${isActive?'cancel':''}"
                data-uid="${uid}"
                data-action="toggle"
              >
                ${isActive?'Cancel':'Re-activate'}
              </button>
              <button
                class="action-btn notify"
                data-uid="${uid}"
                data-type="${type}"
                data-days-left="${daysLeft}"
                ${daysLeft<=7 && daysLeft>0?'':'disabled'}
              >
                Notify
              </button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      });

      // delegate clicks
      tbody.addEventListener('click', e => {
        const btn = e.target;
        const uid = btn.dataset.uid;
        if (!uid) return;

        // toggle subscription status
        if (btn.dataset.action==='toggle') {
          const rec = subsByUid[uid];
          const willCancel = btn.classList.contains('cancel');
          const newStatus  = willCancel?'cancelled':'active';

          db.ref(`subscriptions/${uid}/status`)
            .set(newStatus)
            .then(() => {
              const row  = btn.closest('tr');
              const span = row.querySelector('.status');
              span.className = `status ${newStatus==='active'?'active':'inactive'}`;
              span.textContent = newStatus==='active'?'Active':'Inactive';
              btn.textContent = newStatus==='active'?'Cancel':'Re-activate';
              btn.classList.toggle('cancel');
            })
            .catch(console.error);
        }

        // notify
        if (btn.classList.contains('notify') && !btn.disabled) {
          const rec      = subsByUid[uid];
          const daysLeft = btn.dataset.daysLeft;
          const planText = rec.plan||'your';
          const message  = `Your ${planText} subscription ends in ${daysLeft} day${daysLeft==1?'':'s'}.`;
          const title    = 'Subscription Reminder';

          if (rec.type==='user') {
            // citizens → /notifications/{uid}/entries
            const parentRef = db.ref(`notifications/${uid}`);
            const entryRef  = parentRef.child('entries').push();
            const entry     = {
              id:     entryRef.key,
              title,
              message,
              sentAt: firebase.database.ServerValue.TIMESTAMP,
              read:   false
            };

            entryRef.set(entry)
              .then(() => {
                // bump unreadCount
                parentRef.child('unreadCount')
                  .transaction(c => (c||0) + 1);
                btn.textContent = 'Notified';
                btn.disabled    = true;
              })
              .catch(err => alert('Notify failed: '+err.message));

          } else {
            // orgs → /orgNotifications/{uid}/entries
            const parentRef = db.ref(`orgNotifications/${uid}`);
            const entryRef  = parentRef.child('entries').push();
            const entry     = {
              id:        entryRef.key,
              title,
              message,
              timestamp: firebase.database.ServerValue.TIMESTAMP,
              read:      false
            };

            entryRef.set(entry)
              .then(() => {
                parentRef.child('unreadCount')
                  .transaction(c => (c||0) + 1);
                btn.textContent = 'Notified';
                btn.disabled    = true;
              })
              .catch(err => alert('Notify failed: '+err.message));
          }
        }
      });
    })
    .catch(err => console.error('Subscription-load error:', err));
});
