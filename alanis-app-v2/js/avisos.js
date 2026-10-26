// ##########################################################################
// PROYECTO: ALANIS OPERADORES  (Codespace: alanis-operadores)
// RUTA:     /workspaces/alanis-operadores/alanis-app-v2/js/avisos.js
// ##########################################################################
// Avisos (notificaciones push) para el operador.
// - Muestra una cinta "Activa los avisos" hasta que el operador los active.
// - En iPhone solo funciona con la app agregada a la pantalla de inicio
//   (iOS 16.4 o más reciente); si la abre en Safari, la cinta se lo explica.
// - Al activar: pide permiso, obtiene el token del teléfono, lo registra con
//   la función registrarDispositivoAvisos y manda un aviso de prueba.
// - Cada vez que abre la app revisa el token en silencio (puede cambiar).
// - Solo en celulares (iPhone/iPad/Android): en computadora no hace nada.
// Requiere cargar antes: firebase-app/auth/functions-compat, firebase-config.js
// y firebase-messaging-compat.js (9.23.0).

(function () {
  "use strict";

  var VAPID = "BHMpumvr1k0FW6OmWRYXxIrm6g1F7QtmdnCRVlCDCigPIzCnnaK2QcUvX6D0cJ1eAaG6BARUGQ7JQNuOqlbCwgo";
  var CLAVE_TOKEN = "avisos_token_";        // + uid
  var CLAVE_DESPUES = "avisos_despues_hasta"; // "Ahora no" la oculta 3 días
  var regSW = null;
  var escuchando = false;
  var uidActual = null;

  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

  function esIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function esInstalada() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      navigator.standalone === true;
  }
  function esCelular() {
    return esIOS() || /android|mobi/i.test(navigator.userAgent);
  }
  function plataforma() {
    return esIOS() ? "ios" : (/android/i.test(navigator.userAgent) ? "android" : "otro");
  }

  // ---------- Cinta ----------
  function estilos() {
    if (document.getElementById("avisos-estilos")) return;
    var s = document.createElement("style");
    s.id = "avisos-estilos";
    s.textContent =
      "#avisos-cinta{position:fixed;left:8px;right:8px;top:8px;z-index:9998;background:#2C1E0F;color:#fff;" +
      "border-radius:12px;padding:12px 14px;box-shadow:0 6px 20px rgba(0,0,0,.25);font:14px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif;}" +
      "#avisos-cinta b{display:block;font-size:15px;margin-bottom:2px;}" +
      "#avisos-cinta .av-btns{display:flex;gap:8px;margin-top:10px;}" +
      "#avisos-cinta button{border:0;border-radius:8px;padding:9px 14px;font-size:14px;font-weight:700;cursor:pointer;}" +
      "#avisos-cinta .av-si{background:#fff;color:#2C1E0F;}" +
      "#avisos-cinta .av-no{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);}" +
      "#avisos-cinta.av-ok{background:#3B7A1E;}#avisos-cinta.av-err{background:#C0392B;}";
    document.head.appendChild(s);
  }

  function quitarCinta() {
    var c = document.getElementById("avisos-cinta");
    if (c) c.remove();
  }

  // botones: [{txt, clase, fn}]
  function cinta(titulo, texto, botones, tipo) {
    estilos();
    quitarCinta();
    var c = document.createElement("div");
    c.id = "avisos-cinta";
    if (tipo) c.className = tipo;
    var b = document.createElement("b");
    b.textContent = titulo;
    c.appendChild(b);
    var p = document.createElement("div");
    p.textContent = texto;
    c.appendChild(p);
    if (botones && botones.length) {
      var caja = document.createElement("div");
      caja.className = "av-btns";
      botones.forEach(function (x) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = x.clase;
        btn.textContent = x.txt;
        btn.addEventListener("click", function () { x.fn(btn); });
        caja.appendChild(btn);
      });
      c.appendChild(caja);
    }
    document.body.appendChild(c);
    return c;
  }

  function mensaje(titulo, texto, tipo, segundos) {
    cinta(titulo, texto, [{ txt: "Cerrar", clase: "av-no", fn: quitarCinta }], tipo);
    if (segundos) setTimeout(quitarCinta, segundos * 1000);
  }

  function ahoraNo() {
    guardar(CLAVE_DESPUES, String(Date.now() + 3 * 24 * 3600 * 1000));
    quitarCinta();
  }

  // ---------- Firebase Messaging ----------
  async function soportado() {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;
    if (!firebase.messaging || !firebase.messaging.isSupported) return false;
    try { return await firebase.messaging.isSupported(); } catch (e) { return false; }
  }

  async function registrarSW() {
    if (!regSW) regSW = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    return regSW;
  }

  async function obtenerYGuardarToken(forzar) {
    var reg = await registrarSW();
    var token = await firebase.messaging().getToken({ vapidKey: VAPID, serviceWorkerRegistration: reg });
    if (!token) throw new Error("El teléfono no entregó el token de avisos.");
    var clave = CLAVE_TOKEN + uidActual;
    if (forzar || leer(clave) !== token) {
      await firebase.functions().httpsCallable("registrarDispositivoAvisos")({
        token: token, plataforma: plataforma(), instalada: !!esInstalada()
      });
      guardar(clave, token);
    }
    return token;
  }

  // Con la app abierta, Firebase no muestra el aviso solo: lo mostramos aquí.
  function escucharPrimerPlano() {
    if (escuchando) return;
    escuchando = true;
    firebase.messaging().onMessage(function (p) {
      var n = (p && p.notification) || {};
      var link = (p && p.fcmOptions && p.fcmOptions.link) || "/operador.html";
      var titulo = n.title || "Alanis";
      var cuerpo = n.body || "";
      registrarSW().then(function (reg) {
        return reg.showNotification(titulo, { body: cuerpo, icon: "/img/logo.webp", data: { link: link } });
      }).catch(function () {
        mensaje(titulo, cuerpo, null, 10);
      });
    });
  }

  async function activar(btn) {
    btn.disabled = true;
    btn.textContent = "Activando…";
    var permiso = "default";
    // En iPhone el permiso debe pedirse justo al tocar el botón, antes de cualquier espera.
    try { permiso = await Notification.requestPermission(); } catch (e) { permiso = "default"; }
    if (permiso !== "granted") {
      mensaje("Avisos no activados",
        esIOS()
          ? "Si cambias de opinión: Ajustes del iPhone > Notificaciones > Alanis Op > Permitir notificaciones."
          : "Si cambias de opinión: toca el candado junto a la dirección > Permisos > Notificaciones > Permitir.",
        "av-err");
      return;
    }
    try {
      await obtenerYGuardarToken(true);
      escucharPrimerPlano();
      var r = await firebase.functions().httpsCallable("avisoPrueba")({});
      var d = (r && r.data) || {};
      if (d.enviados > 0) {
        mensaje("Avisos activados", "Te enviamos un aviso de prueba. Debe llegarte en unos segundos.", "av-ok", 10);
      } else {
        mensaje("Avisos activados", "Quedó registrado tu teléfono, pero el aviso de prueba no salió. Avísale a tu coordinador.", "av-err");
      }
    } catch (e) {
      console.error("[avisos]", e);
      mensaje("No se pudieron activar", (e && e.message) || String(e), "av-err");
    }
  }

  async function revisar(user) {
    quitarCinta();
    if (!user) { uidActual = null; return; }
    uidActual = user.uid;
    if (!esCelular()) return;

    if (!(await soportado())) {
      if (esIOS() && !esInstalada()) {
        var hasta = Number(leer(CLAVE_DESPUES) || 0);
        if (hasta > Date.now()) return;
        cinta("Recibe avisos de tus viajes",
          "En iPhone: toca Compartir y luego \"Agregar a pantalla de inicio\". Después abre la app desde ese ícono.",
          [{ txt: "Entendido", clase: "av-no", fn: ahoraNo }]);
      }
      return;
    }

    registrarSW().catch(function (e) { console.warn("[avisos] service worker:", e); });

    if (Notification.permission === "granted") {
      escucharPrimerPlano();
      obtenerYGuardarToken(false).catch(function (e) { console.warn("[avisos] token:", e); });
      return;
    }
    if (Notification.permission === "denied") return;
    if (Number(leer(CLAVE_DESPUES) || 0) > Date.now()) return;

    cinta("Activa los avisos",
      "Te llegará una notificación cuando te asignen un viaje, aunque tengas la app cerrada.",
      [{ txt: "Activar avisos", clase: "av-si", fn: activar },
       { txt: "Ahora no", clase: "av-no", fn: ahoraNo }]);
  }

  function iniciar() {
    if (typeof firebase === "undefined" || !firebase.auth) return;
    firebase.auth().onAuthStateChanged(function (user) {
      revisar(user).catch(function (e) { console.warn("[avisos]", e); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();