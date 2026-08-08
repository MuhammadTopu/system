importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyArT1oDarFsH2me25ZWHXs0eY7oz0c3irA",
  authDomain: "rrsc-92ef2.firebaseapp.com",
  projectId: "rrsc-92ef2",
  storageBucket: "rrsc-92ef2.firebasestorage.app",
  messagingSenderId: "668126403636",
  appId: "1:668126403636:web:ceea18e1367e0572c57e61",
});

const messaging = firebase.messaging();

// Fires when a push arrives while the tab is NOT focused/open.
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Notification", {
    body: body || "",
  });
});
