firebase.auth().onAuthStateChanged(user => {
    if (!user) {
      window.location = 'index.html';
      return;
    }
  
    const db = firebase.database();
    // Prepare last 7-day labels (YYYY-MM-DD)
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0,10));
    }
  
    // Initialize counts
    const counts = {
      citizen:    Array(7).fill(0),
      organization: Array(7).fill(0)
    };
  
    // Placeholders for summary
    let totalCitizens = 0, totalOrgs = 0;
    let activeSubs = 0, inactiveSubs = 0;
  
    // Fetch users, orgs, subs in parallel
    Promise.all([
      db.ref('users').once('value'),
      db.ref('organizations').once('value'),
      db.ref('subscriptions').once('value')
    ]).then(([usersSnap, orgSnap, subsSnap]) => {
      const now = Date.now();
  
      // Process user registrations
      const users = usersSnap.val() || {};
      totalCitizens = Object.keys(users).length;
      Object.values(users).forEach(u => {
        const ts = u.createdAt || u.registeredAt;
        if (!ts) return;
        const date = new Date(ts).toISOString().slice(0,10);
        const idx = days.indexOf(date);
        if (idx >= 0) counts.citizen[idx]++;
      });
  
      // Process org registrations
      const orgs = orgSnap.val() || {};
      totalOrgs = Object.keys(orgs).length;
      Object.values(orgs).forEach(o => {
        const ts = o.createdAt || o.registeredAt;
        if (!ts) return;
        const date = new Date(ts).toISOString().slice(0,10);
        const idx = days.indexOf(date);
        if (idx >= 0) counts.organization[idx]++;
      });
  
      // Process subscriptions summary
      const subs = subsSnap.val() || {};
      Object.values(subs).forEach(s => {
        // assume s.status === 'active' or 'inactive'
        if (s.status === 'active') activeSubs++;
        else inactiveSubs++;
      });
  
      // Fill summary into DOM
      document.getElementById('totalCitizens').innerText = totalCitizens;
      document.getElementById('totalOrgs').innerText     = totalOrgs;
      document.getElementById('activeSubs').innerText    = activeSubs;
      document.getElementById('inactiveSubs').innerText  = inactiveSubs;
  
      // Render vertical bar chart
      const ctx = document.getElementById('registrationChart').getContext('2d');
      new Chart(ctx, {
        type: 'bar',           // vertical bars
        data: {
          labels: days,
          datasets: [
            {
              label: 'Local Citizens',
              data: counts.citizen,
              backgroundColor: 'rgba(76,175,80,0.7)'
            },
            {
              label: 'Animal Organizations',
              data: counts.organization,
              backgroundColor: 'rgba(255,152,0,0.7)'
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            x: {
              title: { display: true, text: 'Date' }
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Registrations' },
              ticks: { stepSize: 1 }
            }
          },
          plugins: {
            legend: { position: 'top' },
            tooltip: { mode: 'index', intersect: false }
          }
        }
      });
    }).catch(console.error);
  });
  