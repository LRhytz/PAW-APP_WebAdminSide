// js/dashboard.js
(async function initDashboard() {
  // Wait for auth
  const me = await DB.waitForAuthUser();
  if (!me) return (window.location = 'index.html');

  // Only admins can read aggregated data from /users & /organizations
  const isAdmin = await DB.isAdmin(me.uid);
  if (!isAdmin) {
    return (window.location = 'index.html');
  }

  const db = firebase.database();

  // Users (admin can list; your rules allow /users for admins)
  const usersSnap = await DB.getUsersList({ orderByChild: 'role' });
  const users = usersSnap.val() || {};
  let totalCitizens = 0;
  let totalOrgsUsersNode = 0; // in case orgs also live under /users
  Object.values(users).forEach(u => {
    const role = (u.role || '').toLowerCase();
    if (role === 'citizen') totalCitizens++;
    if (role === 'organization') totalOrgsUsersNode++;
  });

  // Organizations (separate node)
  const orgsSnap = await db.ref('organizations').once('value');
  const orgs = orgsSnap.val() || {};
  const totalOrgs = Object.keys(orgs).length || totalOrgsUsersNode;

  // Subscriptions (user subs only here)
  const subsSnap = await db.ref('subscriptions').once('value');
  const subs = subsSnap.val() || {};
  let activeSubs = 0, inactiveSubs = 0;
  Object.values(subs).forEach(s => {
    if ((s.status || '').toLowerCase() === 'active') activeSubs++;
    else inactiveSubs++;
  });

  // Update UI
  const $ = (id) => document.getElementById(id);
  const elCitizens = $('totalCitizens');
  const elOrgs     = $('totalOrgs');
  const elActive   = $('activeSubs');
  const elInactive = $('inactiveSubs');

  if (elCitizens) elCitizens.textContent = String(totalCitizens);
  if (elOrgs)     elOrgs.textContent     = String(totalOrgs);
  if (elActive)   elActive.textContent   = String(activeSubs);
  if (elInactive) elInactive.textContent = String(inactiveSubs);

  // Optional chart
  if (typeof Chart !== 'undefined') {
    const ctx = document.getElementById('registrationChart');
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Citizens', 'Organizations'],
          datasets: [{
            label: 'Registrations',
            data: [totalCitizens, totalOrgs]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  }
})();
