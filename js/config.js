// js/config.js
// ————— initialize Firebase once for all pages —————
const firebaseConfig = {
    apiKey: "AIzaSyD6NU‑QTsPTRQ2ytvhqElEtinUl0vZnSo4",
    authDomain: "pawappproject.firebaseapp.com",
    databaseURL: "https://pawappproject-default-rtdb.firebaseio.com",
    projectId: "pawappproject",
    storageBucket: "pawappproject.appspot.com",
    messagingSenderId: "635093605118",
    appId: "1:635093605118:web:8e8515afaa445ffe0da3af",
    measurementId: "G-L2J5QK9HCS"
  };
  firebase.initializeApp(firebaseConfig);
  firebase.analytics();
  