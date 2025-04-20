// Get URL params
const params = new URLSearchParams(window.location.search);
const uid   = params.get('uid');
const type  = params.get('type'); // 'citizen' or 'organization'
const refPath = type === 'organization' ? 'organizations' : 'users';

// Define fields to load/save
const fieldsConfig = {
  users: [
    { key: 'email',      label: 'Email',           type: 'email', readOnly:true },
    { key: 'username',   label: 'Username',        type: 'text'  },
    { key: 'bio',        label: 'Bio',             type: 'text'  },
    { key: 'birthdate',  label: 'Birthdate',       type: 'date'  },
    { key: 'firstName',  label: 'First Name',      type: 'text'  },
    { key: 'lastName',   label: 'Last Name',       type: 'text'  },
    { key: 'phone',      label: 'Contact Number',  type: 'tel'   },
    { key: 'profileImage',label:'Profile Image URL',type:'url' },
    { key: 'userType',   label: 'User Type',       type: 'select',
      options: ['Local Citizen','Animal Organization']
    }
  ],
  organizations: [
    { key: 'email',       label: 'Email',            type:'email', readOnly:true },
    { key: 'adminName',   label: 'Admin Name',       type:'text' },
    { key: 'adminEmail',  label: 'Admin Email',      type:'email' },
    { key: 'orgName',     label: 'Organization Name',type:'text' },
    { key: 'bio',         label: 'Bio',              type:'text' },
    { key: 'foundingYear',label: 'Founding Year',    type:'number' },
    { key: 'address',     label: 'Address',          type:'text' },
    { key: 'phone',       label: 'Contact Number',   type:'tel'  },
    { key: 'profileImage',label:'Profile Image URL',type:'url' },
    { key: 'userType',    label: 'User Type',        type:'select',
      options: ['Local Citizen','Animal Organization']
    }
  ]
};

// Render form fields
const container = document.getElementById('fields-container');
const cfg = fieldsConfig[refPath];
cfg.forEach(f => {
  const div = document.createElement('div');
  div.className = 'field';
  let input;
  if (f.type === 'select') {
    input = document.createElement('select');
    f.options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.innerText = opt;
      input.appendChild(o);
    });
  } else {
    input = document.createElement('input');
    input.type = f.type;
  }
  input.id = f.key;
  if (f.readOnly) input.readOnly = true;
  div.innerHTML = `<label for="${f.key}">${f.label}</label>`;
  div.appendChild(input);
  container.appendChild(div);
});

// Load existing data
firebase.auth().onAuthStateChanged(user => {
  if (!user) return window.location = 'index.html';

  firebase.database()
    .ref(`${refPath}/${uid}`)
    .once('value')
    .then(snap => {
      const data = snap.val() || {};
      cfg.forEach(f => {
        const el = document.getElementById(f.key);
        if (!el) return;
        if (data[f.key] != null) el.value = data[f.key];
      });
    });
});

// Handle form submit
document
  .getElementById('edit-profile-form')
  .addEventListener('submit', e => {
    e.preventDefault();
    const updates = {};
    cfg.forEach(f => {
      if (f.readOnly) return;
      const el = document.getElementById(f.key);
      updates[f.key] = el.value;
    });

    firebase.database()
      .ref(`${refPath}/${uid}`)
      .update(updates)
      .then(() => {
        document.getElementById('edit-msg').innerText = 'Updated successfully!';
      })
      .catch(err => {
        document.getElementById('edit-msg').innerText = err.message;
      });
  });
