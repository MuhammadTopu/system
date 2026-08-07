importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyADKguakddYhon3a3bYa6Fs51nD-NGxYnk",
  authDomain: "kristen-7362e.firebaseapp.com",
  projectId: "kristen-7362e",
  storageBucket: "kristen-7362e.firebasestorage.app",
  messagingSenderId: "473592403679",
  appId: "1:473592403679:web:61de51bf8423b1a27cbb6a",
});

const messaging = firebase.messaging();

// Fires when a push arrives while the tab is NOT focused/open.
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Notification", {
    body: body || "",
  });
});
