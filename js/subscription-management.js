firebase.auth().onAuthStateChanged(admin => {
    if (!admin) {
      window.location = 'index.html';
      return;
    }
  
    const db = firebase.database();
    const tbody = document.querySelector('#subs-table tbody');
    const MS_PER_DAY = 24*60*60*1000;
  
    db.ref('subscriptions').once('value')
      .then(snapshot => {
        const subs = snapshot.val() || {};
        tbody.innerHTML = '';
  
        Object.entries(subs).forEach(([uid, rec]) => {
          // derive end date
          const startTs = rec.startDate;
          if (!startTs) return;
          const start = new Date(startTs);
          const end = rec.plan === 'yearly'
            ? new Date(startTs + 365*MS_PER_DAY)
            : new Date(startTs + 30*MS_PER_DAY);
          const daysLeft = Math.ceil((end - Date.now())/MS_PER_DAY);
  
          // fetch emails
          const uRef = db.ref(`users/${uid}/email`).once('value');
          const oRef = db.ref(`organizations/${uid}/email`).once('value');
          Promise.all([uRef, oRef]).then(([uSnap, oSnap]) => {
            const email = uSnap.val() || oSnap.val() || '—';
            const startStr = start.toISOString().slice(0,10);
            const isActive = rec.status === 'active';
  
            // build row
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${email}</td>
              <td>${rec.plan||'—'}</td>
              <td>${startStr}</td>
              <td>
                <span class="status ${isActive?'active':'inactive'}">
                  ${isActive?'Active':'Inactive'}
                </span>
              </td>
              <td>
                <button class="action-btn ${isActive?'cancel':''}" data-uid="${uid}">
                  ${isActive?'Cancel':'Re‑activate'}
                </button>
                <button class="action-btn notify" data-uid="${uid}"
                        ${daysLeft<=7 && daysLeft>0 ? '' : 'disabled'}>
                  Notify
                </button>
              </td>
            `;
            tbody.appendChild(tr);
          });
        });
  
        // delegate all action clicks
        tbody.addEventListener('click', e => {
          const btn = e.target;
          const uid = btn.dataset.uid;
          if (!uid) return;
  
          // Cancel / Re‑activate
          if (btn.classList.contains('cancel') || !btn.classList.contains('cancel') && btn.textContent==='Re‑activate') {
            const newStatus = btn.classList.contains('cancel') ? 'cancelled' : 'active';
            db.ref(`subscriptions/${uid}/status`).set(newStatus)
              .then(() => {
                const row = btn.closest('tr');
                const span = row.querySelector('.status');
                span.className = `status ${newStatus==='active'?'active':'inactive'}`;
                span.textContent = newStatus==='active'?'Active':'Inactive';
                btn.textContent = newStatus==='active'?'Cancel':'Re‑activate';
                btn.classList.toggle('cancel');
              });
          }
  
          // Notify
          if (btn.classList.contains('notify') && !btn.disabled) {
            const msg = `Hi! Your ${rec.plan} subscription ends in 7 days.`;
            db.ref(`notifications/${uid}`).push({
              message: msg,
              sentAt: firebase.database.ServerValue.TIMESTAMP
            })
            .then(() => {
              btn.textContent = 'Notified';
              btn.disabled = true;
            })
            .catch(err => alert('Notify failed: '+err.message));
          }
        });
      })
      .catch(err => console.error('Load error:', err));
  });
  