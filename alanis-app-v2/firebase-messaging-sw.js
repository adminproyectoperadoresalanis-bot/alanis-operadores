// ##########################################################################
// PROYECTO: ALANIS OPERADORES  (Codespace: alanis-operadores)
// RUTA:     /workspaces/alanis-operadores/alanis-app-v2/firebase-messaging-sw.js
// ##########################################################################
// Service worker de avisos (notificaciones push) con Firebase Cloud Messaging.
// - Va en la RAIZ del sitio (junto a operador.html), no en js/.
// - No guarda nada en caché: no interfiere con la cinta de "nueva versión".
// - La configuración del proyecto la da Firebase Hosting (/__/firebase/init.js),
//   así que este archivo no lleva llaves ni configuración.

importScripts("/__/firebase/9.23.0/firebase-app-compat.js");
importScripts("/__/firebase/9.23.0/firebase-messaging-compat.js");
importScripts("/__/firebase/init.js");

// Clic en avisos que mostró la propia app (cuando estaba abierta).
// Los avisos que llegan con la app cerrada los abre el SDK de Firebase.
self.addEventListener("notificationclick", function (event) {
  var d = (event.notification && event.notification.data) || {};
  if (d.FCM_MSG) return;
  event.notification.close();
  var url = new URL(d.link || "/operador.html", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (ventanas) {
      for (var i = 0; i < ventanas.length; i++) {
        if (ventanas[i].url.indexOf(self.location.origin) === 0 && "focus" in ventanas[i]) return ventanas[i].focus();
      }
      return clients.openWindow(url);
    })
  );
});

firebase.messaging();

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });