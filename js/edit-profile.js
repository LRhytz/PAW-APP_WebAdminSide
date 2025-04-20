// js/edit-profile.js
firebase.auth().onAuthStateChanged(user => {
    if (!user) return window.location = 'index.html';
  
    // prefill form
    firebase.database()
      .ref(`users/${user.uid}`)
      .once('value')
      .then(snap => {
        const d = snap.val() || {};
        document.getElementById('firstName').value = d.firstName || '';
        document.getElementById('lastName').value  = d.lastName  || '';
      });
  });
  
  // handle submit
  document.getElementById('edit-profile-form')
    .addEventListener('submit', e => {
      e.preventDefault();
      const user = firebase.auth().currentUser;
      if (!user) return window.location = 'index.html';
  
      const updates = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName:  document.getElementById('lastName').value.trim(),
      };
      firebase.database()
        .ref(`users/${user.uid}`)
        .update(updates)
        .then(() => {
          document.getElementById('edit-msg').innerText = 'Profile updated!';
          setTimeout(() => window.location = 'profile.html', 800);
        })
        .catch(err => {
          document.getElementById('edit-msg').innerText = err.message;
        });
    });
  