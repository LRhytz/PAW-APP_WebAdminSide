// js/profile.js
firebase.auth().onAuthStateChanged(user => {
    if (!user) return;  // auth-check already redirected in profile.html
  
    // show email
    document.getElementById('profile-email').innerText = user.email;
  
    // fetch name fields from Realtime DB
    firebase.database()
      .ref(`users/${user.uid}`)
      .once('value')
      .then(snap => {
        const data = snap.val() || {};
        const fullName = [data.firstName, data.lastName]
          .filter(Boolean)
          .join(' ');
        document.getElementById('profile-name')
          .innerText = fullName || '(not set)';
      })
      .catch(err => console.error(err));
  });
  