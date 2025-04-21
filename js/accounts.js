const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

firebase.auth().onAuthStateChanged(user => {
  if (!user) return window.location = 'index.html';

  const citizensTbody = document.querySelector('#citizens-table tbody');
  const orgsTbody     = document.querySelector('#orgs-table tbody');
  const now = Date.now();

  function fmt(ts) {
    if (!ts) return 'Never';
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  function getStatus(ts) {
    if (!ts) return 'inactive';
    return (now - ts <= WEEK_MS) ? 'active' : 'inactive';
  }

  function renderRow(data, uid, type) {
    const email   = data.email || data.adminEmail || '';
    const name    = data.firstName
      ? `${data.firstName} ${data.lastName || ''}`.trim()
      : data.orgName || data.adminName || '';
    const contact = data.phone || data.contactNum || '';
    const lastLogin = data.lastLogin || data.last_login || null;
    const st = getStatus(lastLogin);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${email}</td>
      <td>${name}</td>
      <td>${contact}</td>
      <td>${fmt(lastLogin)}</td>
      <td class="status-cell">
        <span class="status ${st}">
          ${st.charAt(0).toUpperCase()+st.slice(1)}
        </span>
        <button class="view-btn"
                data-uid="${uid}"
                data-type="${type}">
          View
        </button>
      </td>`;
    return tr;
  }

  function attachModalHandlers() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid  = btn.dataset.uid;
        const type = btn.dataset.type;
        const node = type === 'organization' ? 'organizations' : 'users';

        firebase.database().ref(`${node}/${uid}`).once('value')
          .then(snap => {
            const d = snap.val()||{};
            // common
            document.getElementById('mEmail').value   = d.email    || d.adminEmail || '';
            document.getElementById('mContact').value = d.phone    || d.contactNum || '';

            // toggle groups
            document.getElementById('mCitizenFields').style.display =
              type==='citizen' ? 'block' : 'none';
            document.getElementById('mOrgFields').style.display =
              type==='organization' ? 'block' : 'none';

            if (type==='citizen') {
              document.getElementById('mFirstName').value  = d.firstName     || '';
              document.getElementById('mLastName').value   = d.lastName      || '';
              document.getElementById('mUsername').value   = d.username      || '';
              document.getElementById('mBio').value        = d.bio           || '';
              document.getElementById('mBirthdate').value  = d.birthdate     || '';
            } else {
              document.getElementById('mOrgName').value      = d.orgName       || '';
              document.getElementById('mAdminName').value    = d.adminName     || '';
              document.getElementById('mAdminEmail').value   = d.adminEmail    || '';
              document.getElementById('mFoundingYear').value = d.foundingYear  || '';
              document.getElementById('mAddress').value      = d.address       || '';
              document.getElementById('mBioOrg').value       = d.bio           || '';
            }

            showModal();
          });
      });
    });
  }

  // Load Local Citizens
  firebase.database().ref('users').once('value')
    .then(snap => {
      citizensTbody.innerHTML = '';
      Object.entries(snap.val()||{}).forEach(([uid,data]) => {
        citizensTbody.appendChild(renderRow(data, uid, 'citizen'));
      });
      attachModalHandlers();
    });

  // Load Animal Organizations
  firebase.database().ref('organizations').once('value')
    .then(snap => {
      orgsTbody.innerHTML = '';
      Object.entries(snap.val()||{}).forEach(([uid,data]) => {
        orgsTbody.appendChild(renderRow(data, uid, 'organization'));
      });
      attachModalHandlers();
    });

});
