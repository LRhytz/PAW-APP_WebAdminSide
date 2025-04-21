const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Simple counter animation
function animateNumber(id, end, duration = 800) {
  const el = document.getElementById(id);
  let start = 0;
  if (end === 0) return el.innerText = '0';
  const stepTime = Math.max(Math.floor(duration / end), 20);
  const timer = setInterval(() => {
    start++;
    el.innerText = start;
    if (start >= end) clearInterval(timer);
  }, stepTime);
}

firebase.auth().onAuthStateChanged(user => {
  if (!user) return window.location = 'index.html';

  const db = firebase.database();
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0,10));
  }

  let totalCitizens = 0, totalOrgs = 0;
  let activeSubs = 0, inactiveSubs = 0;
  const counts = { citizen: Array(7).fill(0), organization: Array(7).fill(0) };

  Promise.all([
    db.ref('users').once('value'),
    db.ref('organizations').once('value'),
    db.ref('subscriptions').once('value')
  ]).then(([uSnap, oSnap, sSnap]) => {
    // Users
    const users = uSnap.val() || {};
    totalCitizens = Object.keys(users).length;
    Object.values(users).forEach(u => {
      const ts = u.createdAt || u.registeredAt;
      if (!ts) return;
      const date = new Date(ts).toISOString().slice(0,10);
      const idx = days.indexOf(date);
      if (idx>=0) counts.citizen[idx]++;
    });

    // Orgs
    const orgs = oSnap.val() || {};
    totalOrgs = Object.keys(orgs).length;
    Object.values(orgs).forEach(o => {
      const ts = o.createdAt || o.registeredAt;
      if (!ts) return;
      const date = new Date(ts).toISOString().slice(0,10);
      const idx = days.indexOf(date);
      if (idx>=0) counts.organization[idx]++;
    });

    // Subscriptions
    const subs = sSnap.val() || {};
    const totalSubs = Object.keys(subs).length;
    activeSubs = Object.values(subs).filter(s => s.status === 'active').length;
    inactiveSubs = totalSubs - activeSubs;

    // Animate numbers
    animateNumber('totalCitizens', totalCitizens);
    animateNumber('totalOrgs', totalOrgs);
    animateNumber('activeSubs', activeSubs);
    animateNumber('inactiveSubs', inactiveSubs);

    // Chart
    const ctx = document.getElementById('registrationChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{
          label: 'Local Citizens',
          data: counts.citizen,
          backgroundColor(ctx) {
            const g = ctx.chart.ctx.createLinearGradient(0,0,0,300);
            g.addColorStop(0,'rgba(255,192,203,0.7)');
            g.addColorStop(1,'rgba(255,192,203,0.3)');
            return g;
          },
          borderRadius: 4
        },{
          label: 'Animal Organizations',
          data: counts.organization,
          backgroundColor(ctx) {
            const g = ctx.chart.ctx.createLinearGradient(0,0,0,300);
            g.addColorStop(0,'rgba(76,175,80,0.7)');
            g.addColorStop(1,'rgba(76,175,80,0.3)');
            return g;
          },
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 800 },
        scales: {
          x: { title: { display: true, text: 'Date' } },
          y: { beginAtZero: true, title: { display: true, text: 'Registrations' }, ticks: { stepSize: 1 }}
        },
        plugins: {
          legend: { position: 'top' },
          tooltip: { mode: 'index', intersect: false }
        }
      }
    });

    if (window.AOS) AOS.init({ duration: 600, once: true });
  })
  .catch(console.error);
});
