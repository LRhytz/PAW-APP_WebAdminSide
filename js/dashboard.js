(async function initDashboard() {
  // Wait for auth
  const me = await DB.waitForAuthUser();
  if (!me) return (window.location = 'index.html');

  // Only admins can access aggregated data
  const isAdmin = await DB.isAdmin(me.uid);
  if (!isAdmin) return (window.location = 'index.html');

  const db = firebase.database();

  // Users
  const usersSnap = await DB.getUsersList({ orderByChild: 'role' });
  const users = usersSnap.val() || {};
  let totalCitizens = 0;
  let totalOrgsUsersNode = 0;

  Object.values(users).forEach(u => {
    const role = (u.role || '').toLowerCase();
    if (role === 'citizen') totalCitizens++;
    if (role === 'organization') totalOrgsUsersNode++;
  });

  // Organizations
  const orgsSnap = await db.ref('organizations').once('value');
  const orgs = orgsSnap.val() || {};
  const totalOrgs = Object.keys(orgs).length || totalOrgsUsersNode;

  // Subscriptions
  const subsSnap = await db.ref('subscriptions').once('value');
  const subs = subsSnap.val() || {};
  let activeSubs = 0, inactiveSubs = 0;
  Object.values(subs).forEach(s => {
    if ((s.status || '').toLowerCase() === 'active') activeSubs++;
    else inactiveSubs++;
  });

  // Update UI
  const $ = (id) => document.getElementById(id);
  if ($('totalCitizens')) $('totalCitizens').textContent = totalCitizens;
  if ($('totalOrgs')) $('totalOrgs').textContent = totalOrgs;
  if ($('activeSubs')) $('activeSubs').textContent = activeSubs;
  if ($('inactiveSubs')) $('inactiveSubs').textContent = inactiveSubs;

  // Chart.js
  if (typeof Chart !== 'undefined') {
    const ctx = document.getElementById('registrationChart');
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Citizens', 'Organizations'],
          datasets: [{
            label: 'Registrations',
            data: [totalCitizens, totalOrgs],
            backgroundColor: 'rgba(76, 175, 80, 0.4)',
            borderColor: 'rgba(76, 175, 80, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true }
          },
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: false }
          }
        }
      });
    }
  }
})();
