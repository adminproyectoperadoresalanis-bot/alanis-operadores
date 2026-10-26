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

// Clic en CUALQUIER aviso (2026-10-26). Se registra antes que el de Firebase
// y lo detiene (stopImmediatePropagation) para manejarlo aquí:
// - si la app ya está abierta: le avisa (postMessage) a qué pantalla ir y la trae al frente;
// - si está cerrada: la abre en el enlace del aviso (p. ej. operador.html#asignaciones).
self.addEventListener("notificationclick", function (event) {
  var d = (event.notification && event.notification.data) || {};
  var fcm = d.FCM_MSG || null;
  var link = d.link ||
    (fcm && ((fcm.fcmOptions && fcm.fcmOptions.link) || (fcm.notification && fcm.notification.click_action))) ||
    "/operador.html";
  event.stopImmediatePropagation();
  event.notification.close();
  var url = new URL(link, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (ventanas) {
      for (var i = 0; i < ventanas.length; i++) {
        var w = ventanas[i];
        if (w.url.indexOf(self.location.origin) === 0 && "focus" in w) {
          w.postMessage({ tipo: "alanis-aviso-click", link: url });
          return w.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

firebase.messaging();

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });