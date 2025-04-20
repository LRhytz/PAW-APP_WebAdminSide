// parse uid & type
const ps   = new URLSearchParams(window.location.search);
const uid  = ps.get('uid');
const type = ps.get('type'); // 'citizen' or 'organization'
const node = type === 'organization' ? 'organizations' : 'users';

// show/hide sections
document.getElementById('citizen-fields').style.display = (type==='citizen') ? 'block' : 'none';
document.getElementById('org-fields').style.display     = (type==='organization') ? 'block' : 'none';

firebase.auth().onAuthStateChanged(admin => {
  if (!admin) {
    window.location = 'index.html';
    return;
  }

  firebase.database().ref(`${node}/${uid}`).once('value')
    .then(snap => {
      const d = snap.val()||{};
      document.getElementById('email').innerText   = d.email || d.adminEmail || '';
      document.getElementById('contact').innerText = d.phone || d.contactNum || '';

      if (type==='citizen') {
        document.getElementById('firstName').innerText = d.firstName||'';
        document.getElementById('lastName').innerText  = d.lastName||'';
        document.getElementById('username').innerText  = d.username||'';
        document.getElementById('bio').innerText       = d.bio||'';
        document.getElementById('birthdate').innerText = d.birthdate||'';
      } else {
        document.getElementById('orgName').innerText      = d.orgName||'';
        document.getElementById('adminName').innerText    = d.adminName||'';
        document.getElementById('adminEmail').innerText   = d.adminEmail||'';
        document.getElementById('foundingYear').innerText = d.foundingYear||'';
        document.getElementById('address').innerText      = d.address||'';
        document.getElementById('bioOrg').innerText       = d.bio||'';
      }
    })
    .catch(console.error);
});
