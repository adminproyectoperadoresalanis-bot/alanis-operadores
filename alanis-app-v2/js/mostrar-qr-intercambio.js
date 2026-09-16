// ============================================================================
// QR de intercambio — Alanis Operadores PWA.
//
// Dos puntos de entrada llaman a abrirQRIntercambio(embarqueId), ambos en
// js/operador4.js:
//   1. El botón "Mostrar QR de intercambio" que aparece en la pantalla de
//      éxito justo al completar Checkpoint 1 (mostrarResultadoDoc).
//   2. La tarjeta fija en la pestaña Documentación (cargarTarjetaQRIntercambio),
//      para volver a mostrarlo más tarde sin tener que re-escanear.
//
// Ambos comparten el mismo modal (#qr-intercambio-modal, en operador.html)
// — no hay que duplicar el dibujo del QR ni el conteo regresivo en cada
// pantalla.
//
// Diseño clave: aquí NO se intenta adivinar si el checkpoint ya se cumplió
// (aunque ese dato esté disponible localmente en repositorio_mccain) — la
// función en la nube (generarTokenIntercambio) es quien decide, revalidando
// el dato autoritativo en el servidor en el momento de generar el token; si
// el checkpoint no se ha cumplido, regresa un error claro y esta pantalla
// simplemente lo muestra.
//
// Requiere en el HTML, además de los SDKs de Firebase ya cargados
// (app, auth, firestore -compat):
//   <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-functions-compat.js"></script>
//   <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
// ============================================================================

let qrIntercambioEmbarqueActual = null;
let qrIntercambioTemporizador = null;

async function abrirQRIntercambio(embarqueId) {
  qrIntercambioEmbarqueActual = embarqueId;
  document.getElementById('qr-intercambio-modal').classList.remove('hidden');
  await generarYMostrarQRIntercambio();
}

async function regenerarQRIntercambio() {
  if (!qrIntercambioEmbarqueActual) return;
  await generarYMostrarQRIntercambio();
}

async function generarYMostrarQRIntercambio() {
  const contenedor = document.getElementById('qr-intercambio-contenedor');
  const estado = document.getElementById('qr-intercambio-estado');
  const btnRegenerar = document.getElementById('qr-intercambio-btn-regenerar');

  btnRegenerar.disabled = true;
  estado.textContent = 'Generando código...';
  contenedor.innerHTML = '';
  if (qrIntercambioTemporizador) { clearInterval(qrIntercambioTemporizador); qrIntercambioTemporizador = null; }

  try {
    const generar = firebase.functions().httpsCallable('generarTokenIntercambio');
    const resultado = await generar({ embarqueId: qrIntercambioEmbarqueActual });
    const { token, expiraEnMs } = resultado.data;

    dibujarQRIntercambio(contenedor, token);
    iniciarCuentaRegresivaQRIntercambio(estado, expiraEnMs);
    btnRegenerar.textContent = 'Generar nuevo código';
  } catch (err) {
    contenedor.innerHTML = '';
    if (err.code === 'functions/failed-precondition') {
      estado.textContent = 'Todavía no puedes mostrar tu código: falta completar tu primer checkpoint.';
    } else if (err.code === 'functions/permission-denied') {
      estado.textContent = 'Este embarque no está asignado a tu usuario.';
    } else if (err.code === 'functions/unauthenticated') {
      estado.textContent = 'Tu sesión expiró. Vuelve a iniciar sesión.';
    } else {
      estado.textContent = 'No se pudo generar el código. Intenta de nuevo.';
      console.error('generarTokenIntercambio:', err);
    }
  } finally {
    btnRegenerar.disabled = false;
  }
}

function dibujarQRIntercambio(contenedor, texto) {
  // eslint-disable-next-line no-undef
  new QRCode(contenedor, {
    text: texto,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function iniciarCuentaRegresivaQRIntercambio(elemento, expiraEnMs) {
  function actualizar() {
    const restanteMs = expiraEnMs - Date.now();
    if (restanteMs <= 0) {
      clearInterval(qrIntercambioTemporizador);
      qrIntercambioTemporizador = null;
      document.getElementById('qr-intercambio-contenedor').innerHTML = '';
      elemento.textContent = 'El código venció. Genera uno nuevo para continuar.';
      return;
    }
    const min = Math.floor(restanteMs / 60000);
    const seg = Math.floor((restanteMs % 60000) / 1000).toString().padStart(2, '0');
    elemento.textContent = 'Muéstralo al intercambista. Vence en ' + min + ':' + seg;
  }
  actualizar();
  qrIntercambioTemporizador = setInterval(actualizar, 1000);
}

function cerrarQRIntercambio() {
  if (qrIntercambioTemporizador) { clearInterval(qrIntercambioTemporizador); qrIntercambioTemporizador = null; }
  document.getElementById('qr-intercambio-modal').classList.add('hidden');
  document.getElementById('qr-intercambio-contenedor').innerHTML = '';
  qrIntercambioEmbarqueActual = null;
}
