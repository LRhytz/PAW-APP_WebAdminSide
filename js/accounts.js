// js/accounts.js
(async function initAccountsPage() {
  // Require auth
  const me = await DB.waitForAuthUser();
  if (!me) return (window.location = 'index.html');

  // Require admin
  const admin = await DB.isAdmin(me.uid);
  if (!admin) return (window.location = 'index.html');

  const citizensTbody = document.querySelector('#citizens-table tbody');
  const orgsTbody     = document.querySelector('#orgs-table tbody');

  // Helper: build a row with the requested columns
  function renderRow(data, uid, type) {
    const email   = data.email || '';
    const name    = (type === 'citizen')
      ? (data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim())
      : (data.representativeName || data.adminName || data.orgName || data.organizationName || '');
    const contact = data.phone || data.contactNum || '';
    const address = data.address || '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${email}</td>
      <td>${name}</td>
      <td>${contact}</td>
      <td>${address}</td>
      <td>
        <button class="view-btn" data-uid="${uid}" data-type="${type}">
          View
        </button>
      </td>`;
    return tr;
  }

  // Load ALL users once, then split by role (‘citizen’ vs ‘organization’)
  const { snap: usersSnap } = await DB.getUsersSafe({ orderByChild: 'role' });
  const users = usersSnap.val() || {};

  // Citizens
  citizensTbody.innerHTML = '';
  Object.entries(users).forEach(([uid, data]) => {
    const role = (data.role || '').toLowerCase();
    if (role === 'citizen') {
      citizensTbody.appendChild(renderRow(data, uid, 'citizen'));
    }
  });

  // Organizations (they live under /users with role:"organization" in your data)
  orgsTbody.innerHTML = '';
  Object.entries(users).forEach(([uid, data]) => {
    const role = (data.role || '').toLowerCase();
    if (role === 'organization') {
      orgsTbody.appendChild(renderRow(data, uid, 'organization'));
    }
  });

  // Attach modal handlers (reads from /users first, then falls back to /organizations if needed)
  function attachModalHandlers() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid  = btn.dataset.uid;
        const type = btn.dataset.type;

        async function readAccount(uid) {
          const u = await firebase.database().ref('users/' + uid).once('value');
          if (u.exists()) return u.val();
          const o = await firebase.database().ref('organizations/' + uid).once('value');
          return o.val() || {};
        }

        const d = await readAccount(uid);

        // Common fields
        document.getElementById('mEmail').value    = d.email || '';
        document.getElementById('mContact').value  = d.phone || d.contactNum || '';
        document.getElementById('mAddress').value  = d.address || '';

        // Toggle groups
        document.getElementById('mCitizenFields').style.display = (type==='citizen') ? 'block' : 'none';
        document.getElementById('mOrgFields').style.display     = (type==='organization') ? 'block' : 'none';

        if (type === 'citizen') {
          document.getElementById('mFullName').value  = d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim();
          document.getElementById('mBirthdate').value = d.dateOfBirth || d.birthdate || '';
        } else {
          document.getElementById('mOrgName').value = d.organizationName || d.orgName || '';
          document.getElementById('mRepName').value = d.representativeName || d.adminName || '';
          document.getElementById('mLicense').value = d.licenseNumber || '';
          document.getElementById('mOrgType').value = d.organizationType || '';
        }

        if (typeof showModal === 'function') showModal();
      });
    });
  }

  attachModalHandlers();
})();
