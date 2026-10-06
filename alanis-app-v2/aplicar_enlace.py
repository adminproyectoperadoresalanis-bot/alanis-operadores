import re, sys

# ---------------------------------------------------------------
# Bloque JS (operador4.js): captura del ?enlace= + confirmacion
# ---------------------------------------------------------------
BLOQUE_JS = r'''// ── Enlace de respaldo para el Checkpoint 1 ─────────────────────────────
// Operaciones puede mandar por WhatsApp un enlace de un solo uso a un operador
// que no logra escanear su factura. Al abrirlo (operador.html?enlace=CODIGO)
// el operador inicia sesion, ve los datos del embarque, confirma, y el
// servidor registra la recepcion. El codigo se guarda en memoria y en
// localStorage (si el navegador lo permite) para sobrevivir al login, y se
// borra de la barra de direcciones en cuanto se captura.
var enlaceCheckpointCodigo = null;
(function capturarEnlaceCheckpoint() {
  try {
    var p = new URLSearchParams(window.location.search);
    var c = p.get('enlace');
    if (c) {
      enlaceCheckpointCodigo = c.trim();
      try { localStorage.setItem('enlaceCheckpointPendiente', enlaceCheckpointCodigo); } catch (e) {}
      p.delete('enlace');
      var q = p.toString();
      window.history.replaceState(null, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
    } else {
      try { enlaceCheckpointCodigo = localStorage.getItem('enlaceCheckpointPendiente') || null; } catch (e) {}
    }
  } catch (e) {}
})();

function sufijoEnlacePendiente() {
  return enlaceCheckpointCodigo ? '?enlace=' + encodeURIComponent(enlaceCheckpointCodigo) : '';
}

function limpiarEnlacePendiente() {
  enlaceCheckpointCodigo = null;
  try { localStorage.removeItem('enlaceCheckpointPendiente'); } catch (e) {}
}

function enlaceFn(nombre) {
  return firebase.app().functions('us-central1').httpsCallable(nombre);
}

function enlaceMostrar(estado, datos, err) {
  var overlay = document.getElementById('enlace-modal-overlay');
  if (!overlay) return;
  ['cargando', 'confirmar', 'ok', 'error'].forEach(function(s) {
    document.getElementById('enlace-st-' + s).style.display = (s === estado) ? 'block' : 'none';
  });
  if (estado === 'confirmar') {
    document.getElementById('enlace-d-shipment').textContent = datos.shipment || '—';
    document.getElementById('enlace-d-cliente').textContent = datos.clienteNombre || '—';
    document.getElementById('enlace-d-oc').textContent = datos.ocCliente || '—';
    document.getElementById('enlace-d-caja').textContent = datos.caja || '—';
    var b = document.getElementById('enlace-btn-confirmar');
    b.disabled = false;
    b.textContent = 'Confirmar recepción';
  }
  if (estado === 'ok') {
    document.getElementById('enlace-ok-shipment').textContent = (datos && datos.shipment) ? 'Embarque ' + datos.shipment : '';
  }
  if (estado === 'error') {
    document.getElementById('enlace-error-texto').textContent = datos;
    var ajeno = !!(err && err.code === 'functions/permission-denied');
    document.getElementById('enlace-btn-salir').style.display = ajeno ? 'block' : 'none';
  }
  overlay.style.display = 'flex';
}

function enlaceMensajeError(err) {
  var code = err && err.code ? String(err.code) : '';
  var utiles = ['functions/not-found', 'functions/permission-denied', 'functions/failed-precondition', 'functions/invalid-argument'];
  if (utiles.indexOf(code) !== -1 && err.message) return err.message;
  return 'No se pudo verificar el enlace. Revisa tu conexión a internet e inténtalo de nuevo.';
}

async function procesarEnlaceCheckpointPendiente() {
  if (!enlaceCheckpointCodigo) return;
  enlaceMostrar('cargando');
  try {
    var res = await enlaceFn('validarEnlaceCheckpoint')({ codigo: enlaceCheckpointCodigo });
    enlaceMostrar('confirmar', res.data);
  } catch (err) {
    console.warn('Enlace:', err);
    enlaceMostrar('error', enlaceMensajeError(err), err);
  }
}

async function confirmarEnlaceCheckpoint() {
  var btn = document.getElementById('enlace-btn-confirmar');
  btn.disabled = true;
  btn.textContent = 'Registrando…';
  try {
    var res = await enlaceFn('consumirEnlaceCheckpoint')({ codigo: enlaceCheckpointCodigo });
    limpiarEnlacePendiente();
    enlaceMostrar('ok', res.data);
    try { cargarTarjetaQRIntercambio(); } catch (e) {}
  } catch (err) {
    console.warn('Enlace:', err);
    enlaceMostrar('error', enlaceMensajeError(err), err);
  }
}

function cerrarEnlaceCheckpoint() {
  limpiarEnlacePendiente();
  var overlay = document.getElementById('enlace-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Cuenta equivocada: se conserva el codigo para usarlo despues de cambiar de cuenta.
function salirYReintentarEnlace() {
  doLogout();
}

'''

# ---------------------------------------------------------------
# Modal HTML (operador.html)
# ---------------------------------------------------------------
MODAL_HTML = r'''<!-- MODAL ENLACE CHECKPOINT 1 -->
<div id="enlace-modal-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);z-index:3000;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">
  <div style="background:var(--bg-card,#fff);color:var(--text-primary,#2b2017);border-radius:16px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto;padding:22px;box-sizing:border-box">

    <div id="enlace-st-cargando" style="display:none;text-align:center;padding:24px 0">
      <div style="font-size:15px;font-weight:600">Verificando enlace…</div>
    </div>

    <div id="enlace-st-confirmar" style="display:none">
      <div style="font-size:17px;font-weight:700">Confirmar recepción</div>
      <div style="font-size:13px;color:var(--text-muted,#8a8070);margin-top:6px;line-height:1.5">Operaciones autorizó este enlace. Confirma <b>solo si tienes en la mano la factura</b> de este embarque.</div>
      <div style="margin-top:16px;border:1px solid var(--border-strong,#d8cfc0);border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.9">
        <div><span style="color:var(--text-muted,#8a8070)">Embarque:</span> <b id="enlace-d-shipment">—</b></div>
        <div><span style="color:var(--text-muted,#8a8070)">Cliente:</span> <b id="enlace-d-cliente">—</b></div>
        <div><span style="color:var(--text-muted,#8a8070)">Orden de compra:</span> <b id="enlace-d-oc">—</b></div>
        <div><span style="color:var(--text-muted,#8a8070)">Caja:</span> <b id="enlace-d-caja">—</b></div>
      </div>
      <button type="button" id="enlace-btn-confirmar" class="btn-primary" style="width:100%;margin-top:18px" onclick="confirmarEnlaceCheckpoint()">Confirmar recepción</button>
      <button type="button" class="btn-secondary" style="width:100%;margin-top:8px" onclick="cerrarEnlaceCheckpoint()">Cancelar</button>
    </div>

    <div id="enlace-st-ok" style="display:none;text-align:center">
      <div style="font-size:42px">✅</div>
      <div style="font-size:17px;font-weight:700;margin-top:6px">Recepción registrada</div>
      <div id="enlace-ok-shipment" style="font-size:13px;color:var(--text-muted,#8a8070);margin-top:4px"></div>
      <button type="button" class="btn-primary" style="width:100%;margin-top:18px" onclick="cerrarEnlaceCheckpoint()">Continuar</button>
    </div>

    <div id="enlace-st-error" style="display:none">
      <div style="font-size:17px;font-weight:700">No se pudo usar el enlace</div>
      <div id="enlace-error-texto" style="font-size:14px;margin-top:10px;line-height:1.5"></div>
      <button type="button" id="enlace-btn-salir" class="btn-primary" style="display:none;width:100%;margin-top:18px" onclick="salirYReintentarEnlace()">Cerrar sesión y entrar con mi cuenta</button>
      <button type="button" class="btn-secondary" style="width:100%;margin-top:8px" onclick="cerrarEnlaceCheckpoint()">Cerrar</button>
    </div>

  </div>
</div>

'''

def leer(ruta):
    with open(ruta, 'r', encoding='utf-8') as f:
        return f.read()

def escribir(ruta, txt):
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(txt)

def unico(txt, ancla, donde, nombre):
    n = txt.count(ancla)
    if n != 1:
        raise SystemExit('ERROR: esperaba encontrar 1 vez "' + nombre + '" en ' + donde + ' y encontre ' + str(n) + '. No se modifico NADA. Avisa a Claude.')

# ---------------------------------------------------------------
# Leer todo primero; escribir solo si todo cuadra
# ---------------------------------------------------------------
js   = leer('js/operador4.js')
html = leer('operador.html')
auth = leer('js/auth.js')
idx  = leer('index.html')
fidx = leer('functions/index.js')
rul  = leer('firestore.rules')

cambios = {}

# 1) operador4.js ------------------------------------------------
if 'procesarEnlaceCheckpointPendiente' in js:
    print('js/operador4.js: ya estaba actualizado, no se toco.')
else:
    A_LOGIN = "firebase.auth().onAuthStateChanged(async user => {"
    A_REDIR = "if (!user) { window.location.href = 'index.html'; return; }"
    A_FIN   = "  cargarTarjetaQRIntercambio();\n  if (localStorage.getItem('darkMode') === '1') toggleDark();"
    unico(js, A_LOGIN, 'js/operador4.js', 'onAuthStateChanged')
    unico(js, A_REDIR, 'js/operador4.js', 'redireccion a index.html sin sesion')
    unico(js, A_FIN,   'js/operador4.js', 'cargarTarjetaQRIntercambio + darkMode')
    js = js.replace(A_LOGIN, BLOQUE_JS + A_LOGIN, 1)
    js = js.replace(A_REDIR, "if (!user) { window.location.href = 'index.html' + sufijoEnlacePendiente(); return; }", 1)
    js = js.replace(A_FIN, "  cargarTarjetaQRIntercambio();\n  procesarEnlaceCheckpointPendiente();\n  if (localStorage.getItem('darkMode') === '1') toggleDark();", 1)
    cambios['js/operador4.js'] = js

# 2) operador.html -----------------------------------------------
if 'enlace-modal-overlay' in html:
    print('operador.html: ya estaba actualizado, no se toco.')
else:
    A_SDK = '<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>'
    unico(html, A_SDK, 'operador.html', 'script firebase-app-compat')
    html = html.replace(A_SDK, MODAL_HTML + A_SDK, 1)
    m = re.search(r'operador4\.js\?v=(\d+)', html)
    if m:
        html = html.replace(m.group(0), 'operador4.js?v=' + str(int(m.group(1)) + 1), 1)
        print('operador.html: operador4.js v=' + m.group(1) + ' -> v=' + str(int(m.group(1)) + 1))
    else:
        print('Aviso: no encontre operador4.js?v=N en operador.html, revisa el cache-busting a mano.')
    cambios['operador.html'] = html

# 3) auth.js (login: conservar el enlace al regresar a operador.html) ---
if 'enlaceCheckpointPendiente' in auth:
    print('js/auth.js: ya estaba actualizado, no se toco.')
else:
    A_AUTH = "? 'admin.html' : 'operador.html');"
    unico(auth, A_AUTH, 'js/auth.js', "redireccion final a operador.html")
    N_AUTH = ("? 'admin.html' : 'operador.html' + (function() { try { "
              "var c = new URLSearchParams(window.location.search).get('enlace') || localStorage.getItem('enlaceCheckpointPendiente'); "
              "return c ? '?enlace=' + encodeURIComponent(c) : ''; } catch (e) { return ''; } })());")
    auth = auth.replace(A_AUTH, N_AUTH, 1)
    cambios['js/auth.js'] = auth
    m = re.search(r'auth\.js\?v=(\d+)', idx)
    if m:
        idx = idx.replace(m.group(0), 'auth.js?v=' + str(int(m.group(1)) + 1), 1)
        print('index.html: auth.js v=' + m.group(1) + ' -> v=' + str(int(m.group(1)) + 1))
        cambios['index.html'] = idx
    else:
        print('Aviso: no encontre auth.js?v=N en index.html, revisa el cache-busting a mano.')

# 4) functions/index.js ------------------------------------------
if 'validarEnlaceCheckpoint' in fidx:
    print('functions/index.js: ya estaba actualizado, no se toco.')
else:
    A_EXP = 'exports.validarTokenIntercambio = require("./validarTokenIntercambio").validarTokenIntercambio;'
    unico(fidx, A_EXP, 'functions/index.js', 'export de validarTokenIntercambio')
    NUEVO = (A_EXP + '\n'
             'exports.validarEnlaceCheckpoint = require("./enlacesCheckpoint").validarEnlaceCheckpoint;\n'
             'exports.consumirEnlaceCheckpoint = require("./enlacesCheckpoint").consumirEnlaceCheckpoint;')
    fidx = fidx.replace(A_EXP, NUEVO, 1)
    cambios['functions/index.js'] = fidx

# 5) firestore.rules ---------------------------------------------
if 'enlaces_checkpoint' in rul:
    print('firestore.rules: ya estaba actualizado, no se toco.')
else:
    if re.search(r'match\s*/\{[A-Za-z_]+=\*\*\}', rul):
        print('AVISO: firestore.rules tiene un comodin "match /{...=**}". Revisalo: podria dejar abierta la coleccion enlaces_checkpoint. Avisa a Claude.')
    m = re.search(r'\}\s*\}\s*$', rul)
    if not m:
        raise SystemExit('ERROR: firestore.rules no termina con las dos llaves de cierre esperadas. No se modifico NADA. Avisa a Claude.')
    BLOQUE_R = ('\n    // Enlaces de respaldo del Checkpoint 1: SOLO las Cloud Functions (Admin SDK)\n'
                '    // pueden leer o escribir. Ningun cliente.\n'
                '    match /enlaces_checkpoint/{id} {\n'
                '      allow read, write: if false;\n'
                '    }\n')
    # se inserta antes de la llave que cierra "documents" (la penultima)
    ult = rul.rstrip()
    i2 = ult.rfind('}')            # cierre de service
    i1 = ult.rfind('}', 0, i2)     # cierre de documents
    rul = ult[:i1].rstrip() + '\n' + BLOQUE_R + '  ' + ult[i1:] + '\n'
    cambios['firestore.rules'] = rul

# ---------------------------------------------------------------
for ruta, txt in cambios.items():
    escribir(ruta, txt)
    print('modificado: ' + ruta)
print('Listo.')
