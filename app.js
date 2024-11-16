// LOGIN FUNCTIONALITY
(function() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Prevent the form from refreshing the page

            // Get the values from the form fields
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorMessage = document.getElementById('error-message');

            // Check if firebase is initialized
            if (typeof firebase !== 'undefined') {
                // Sign in using Firebase Authentication
                firebase.auth().signInWithEmailAndPassword(email, password)
                    .then(userCredential => {
                        // Successful login, redirect to admin dashboard
                        window.location.href = 'home.html'; // Ensure this points to your dashboard page
                    })
                    .catch(error => {
                        // Handle login errors here
                        errorMessage.innerText = error.message;
                    });
            } else {
                errorMessage.innerText = "Firebase is not initialized.";
            }
        });
    }
})();

// LOGOUT FUNCTIONALITY (if needed)
(function() {
    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            firebase.auth().signOut().then(() => {
                // User successfully logged out, redirect to login page
                window.location.href = 'index.html';
            }).catch((error) => {
                console.error('Error logging out: ', error);
            });
        });
    }
})();
