// ── Lectura por foto + mensajes de error de cámara ──────────────────────
// Por qué existe: el lector en vivo (html5-qrcode) decodifica sobre un lienzo
// del tamaño de la pantalla del celular, así que un QR denso como el del CFDI
// del SAT queda con muy pocos píxeles por cuadrito y a veces no se lee. Una
// foto, en cambio, se decodifica a la resolución completa de la cámara.
// Además, antes el escáner solo miraba un cuadro de 250 px al centro que no
// se veía en pantalla; ahora lee todo el encuadre.

function docConfigLector() {
  const cfg = { verbose: false };
  if (window.Html5QrcodeSupportedFormats) {
    cfg.formatsToSupport = [window.Html5QrcodeSupportedFormats.QR_CODE];
  }
  return cfg;
}

// Navegadores internos (WhatsApp, Facebook, Instagram...) suelen bloquear la
// cámara. Solo se usa para orientar al operador DESPUÉS de que algo falló.
function docEsNavegadorInterno() {
  const ua = navigator.userAgent || '';
  const instalada = (window.navigator.standalone === true) ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (instalada) return false;
  if (/; wv\)|FBAN|FBAV|Instagram|MicroMessenger|Line\//i.test(ua)) return true;
  if (/iPhone|iPad|iPod/i.test(ua) && !/Safari/i.test(ua)) return true;
  return false;
}

function docMensajeErrorCamara(err) {
  const t = String(err && err.name ? (err.name + ' ' + (err.message || '')) : (err || ''));
  if (/NotAllowedError|PermissionDenied|Permission denied/i.test(t)) {
    return 'La cámara está bloqueada para esta app. En Chrome toca el candado junto a la dirección → Permisos → Cámara → Permitir, y vuelve a abrir el escáner. En iPhone: Ajustes → Safari → Cámara. También puedes usar el botón de foto.';
  }
  if (/NotReadableError|TrackStartError|Could not start video source/i.test(t)) {
    return 'La cámara la está usando otra aplicación. Ciérrala (o cierra otras pestañas que usen cámara) e inténtalo de nuevo. También puedes usar el botón de foto.';
  }
  if (/NotFoundError|DevicesNotFound|OverconstrainedError/i.test(t)) {
    return 'No se encontró una cámara trasera en este equipo. Usa el botón de foto.';
  }
  if (/not supported/i.test(t) || docEsNavegadorInterno()) {
    return docEsNavegadorInterno()
      ? 'Parece que abriste la app desde dentro de otra aplicación (como WhatsApp). Ábrela en Chrome o Safari e inténtalo de nuevo.'
      : 'Este navegador no permite usar la cámara aquí. Abre la app en Chrome o Safari, o usa el botón de foto.';
  }
  return 'No se pudo acceder a la cámara (revisa permisos del navegador). También puedes usar el botón de foto.';
}

// Escala la foto para que su lado mayor no pase de ladoMax px (si ya es mas
// chica, devuelve el mismo archivo). Sirve para dos cosas: evitar agotar la
// memoria con fotos de 48-50 MP y, sobre todo, probar varios tamanos: el
// decodificador (ZXing, el que usa el iPhone) lee mejor cuando cada cuadrito
// del QR mide pocos pixeles, asi que a veces una foto MAS CHICA se lee y la
// original no.
function docEscalarImagen(archivo, ladoMax) {
  return new Promise(function(resolve) {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = function() {
      URL.revokeObjectURL(url);
      const mayor = Math.max(img.naturalWidth, img.naturalHeight);
      if (mayor <= ladoMax) { resolve(archivo); return; }
      const f = ladoMax / mayor;
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * f);
      c.height = Math.round(img.naturalHeight * f);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function(blob) {
        resolve(blob ? new File([blob], 'qr.jpg', { type: 'image/jpeg' }) : archivo);
      }, 'image/jpeg', 0.95);
    };
    img.onerror = function() { URL.revokeObjectURL(url); resolve(archivo); };
    img.src = url;
  });
}

async function docLeerFoto(inputEl) {
  const archivo = inputEl && inputEl.files && inputEl.files[0];
  if (inputEl) inputEl.value = '';
  if (!archivo) return;
  const estadoEl = document.getElementById('doc-camara-estado');
  const btn = document.getElementById('doc-foto-btn');
  if (typeof window.Html5Qrcode === 'undefined') {
    estadoEl.textContent = 'No se pudo cargar el lector. Verifica tu conexión e intenta de nuevo.';
    return;
  }
  if (btn) btn.disabled = true;
  estadoEl.textContent = 'Leyendo la foto…';

  // Soltar la cámara en vivo antes de leer el archivo.
  if (docLectorQR) {
    const lectorVivo = docLectorQR;
    docLectorQR = null;
    try { await lectorVivo.stop(); } catch (e) {}
  }

  let texto = null;
  let previa = null;
  const ESCALAS = [4096, 2800, 2000, 1400, 1000];
  for (let i = 0; i < ESCALAS.length && texto === null; i++) {
    try {
      const imagen = await docEscalarImagen(archivo, ESCALAS[i]);
      if (imagen === archivo && previa === archivo) continue; // misma foto, no repetir
      previa = imagen;
      const lector = new window.Html5Qrcode('doc-qr-reader', docConfigLector());
      try {
        const res = await lector.scanFileV2(imagen, false);
        if (res && res.decodedText) texto = res.decodedText;
      } finally {
        // Limpiar ANTES de reiniciar la camara (comparten el mismo contenedor).
        try { lector.clear(); } catch (e) {}
      }
    } catch (e) {
      // no se leyo a esta escala: se prueba la siguiente
    }
  }
  if (btn) btn.disabled = false;

  let motivo = 'noleyo';
  if (texto !== null) {
    const datos = parsearQRDoc(texto);
    if (datos) { docManejarLectura(datos); return; }
    motivo = 'nocfdi';
  }
  docIniciarCamara();
  estadoEl.textContent = motivo === 'nocfdi'
    ? 'Ese código no parece ser un QR de CFDI del SAT. Toma la foto de nuevo enfocando el QR de la factura.'
    : 'No se pudo leer ningún QR en la foto. Acércate para que el QR llene buena parte de la foto, con buena luz y sin reflejos, e inténtalo de nuevo.';
}
