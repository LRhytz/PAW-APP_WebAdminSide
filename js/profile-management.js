const form = document.getElementById('profile-form');
const avatar = document.getElementById('avatar');
const fileInput = document.getElementById('profileImage');
const msg = document.getElementById('msg');

firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location = 'index.html';
    return;
  }
  const uid = user.uid;
  document.getElementById('email').innerText = user.email;

  firebase.database().ref(`admins/${uid}`).once('value')
    .then(snapshot => {
      const data = snapshot.val() || {};
      const fullName = [data.firstName, data.lastName]
        .filter(Boolean)
        .join(' ');
      document.getElementById('name').innerText = fullName || '(not set)';
      document.getElementById('firstName').value = data.firstName || '';
      document.getElementById('lastName').value  = data.lastName  || '';
      avatar.src = data.profileImage || 'https://via.placeholder.com/96';
    })
    .catch(console.error);
});

// preview new avatar
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if (f) avatar.src = URL.createObjectURL(f);
});

// save changes
form.addEventListener('submit', e => {
  e.preventDefault();
  const user = firebase.auth().currentUser;
  if (!user) return;
  const uid = user.uid;
  const updates = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName:  document.getElementById('lastName').value.trim()
  };

  const file = fileInput.files[0];
  let promise = Promise.resolve();
  if (file) {
    const ref = firebase.storage().ref(`admin_profiles/${uid}/${file.name}`);
    promise = ref.put(file)
      .then(snap => snap.ref.getDownloadURL())
      .then(url => { updates.profileImage = url; });
  }

  promise
    .then(() => firebase.database().ref(`admins/${uid}`).update(updates))
    .then(() => { msg.innerText = 'Profile updated!'; })
    .catch(err => { msg.innerText = err.message; });
});
