import re

# ============================================================
# 1) admin.html — buscador + modal + bump de version de admin2.js
# ============================================================
with open('admin.html', 'r', encoding='utf-8') as f:
    html = f.read()

if 'modal-solicitud-overlay' in html:
    print('admin.html: ya estaba actualizado (encontre "modal-solicitud-overlay"), no se toco.')
    html_cambiado = False
else:
    ANCLA_TAB = '''<!-- SOLICITUDES DE ACCESO -->
<div class="page-content hidden" id="tab-solicitudes">
  <p class="section-label">Solicitudes de acceso pendientes</p>
  <div id="solicitudes-list"></div>
</div>'''

    NUEVO_TAB = '''<!-- SOLICITUDES DE ACCESO -->
<div class="page-content hidden" id="tab-solicitudes">
  <p class="section-label">Solicitudes de acceso pendientes</p>
  <input type="text" id="buscar-solicitud" placeholder="Buscar por nombre o correo..." oninput="filtrarSolicitudes()" style="width:100%;padding:10px 12px;font-size:14px;border:0.5px solid var(--border-strong);border-radius:8px;background:var(--bg-app);color:var(--text-primary);margin-bottom:12px"/>
  <div id="solicitudes-list"></div>
</div>'''

    if ANCLA_TAB not in html:
        raise SystemExit('ERROR: no encontre el bloque de tab-solicitudes esperado en admin.html. No se modifico nada. Avisa a Claude.')
    html = html.replace(ANCLA_TAB, NUEVO_TAB, 1)

    ANCLA_MODAL = '''  <span id="toast-msg"></span>
</div>

<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>'''

    with open('modal_solicitud_html.html', 'r', encoding='utf-8') as f:
        modal_html = f.read().rstrip('\n')

    NUEVO_MODAL = '''  <span id="toast-msg"></span>
</div>

''' + modal_html + '''

<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>'''

    if ANCLA_MODAL not in html:
        raise SystemExit('ERROR: no encontre el bloque del toast/firebase-scripts esperado en admin.html. No se modifico nada. Avisa a Claude.')
    html = html.replace(ANCLA_MODAL, NUEVO_MODAL, 1)

    m = re.search(r'admin2\.js\?v=(\d+)', html)
    if m:
        old_v = int(m.group(1))
        new_v = old_v + 1
        html = html.replace('admin2.js?v=' + str(old_v), 'admin2.js?v=' + str(new_v))
        print('admin.html: buscador + modal agregados. Version de admin2.js actualizada: v=' + str(old_v) + ' -> v=' + str(new_v))
    else:
        print('admin.html: buscador + modal agregados. Aviso: no encontre el query ?v= de admin2.js, revisa el cache-busting a mano.')

    with open('admin.html', 'w', encoding='utf-8') as f:
        f.write(html)
    html_cambiado = True

# ============================================================
# 2) js/admin2.js — reemplazo del bloque de Solicitudes
# ============================================================
with open('js/admin2.js', 'r', encoding='utf-8') as f:
    js = f.read()

if 'solicitudAbierta' in js:
    print('js/admin2.js: ya estaba actualizado (encontre "solicitudAbierta"), no se toco.')
else:
    ANCLA_JS = r"""let solicitudesListener = null;

function cargarSolicitudes() {
  // Si ya hay un listener activo, no crear otro
  if (solicitudesListener) return;
  solicitudesListener = firebase.firestore().collection('solicitudes')
    .where('estado', '==', 'pendiente')
    .orderBy('timestamp', 'desc')
    .onSnapshot(function(snap) {
      const badge = document.getElementById('sol-badge');
      if (snap.size > 0) { badge.classList.remove('hidden'); badge.textContent = snap.size; }
      else badge.classList.add('hidden');
      renderSolicitudes(snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); }));
    }, function(e) { console.error('Error solicitudes:', e); });
}

function renderSolicitudes(lista) {
  const el = document.getElementById('solicitudes-list');
  if (lista.length === 0) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:24px">No hay solicitudes pendientes.</p>';
    return;
  }
  el.innerHTML = lista.map(function(s) {
    const fecha = s.timestamp && s.timestamp.toDate
      ? s.timestamp.toDate().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : '—';
    const initials = (s.nombre||'OP').split(' ').map(function(n){ return n[0]; }).join('').substring(0,2).toUpperCase();
    return '<div class="card" id="sol-' + s.id + '">' +
      '<div class="op-row" style="padding:0;border:none;margin-bottom:12px">' +
      '<div class="op-avatar">' + initials + '</div>' +
      '<div>' +
      '<div class="op-name">' + (s.nombre||'Sin nombre') + '</div>' +
      '<div class="op-sub">' + (s.correo||'—') + '</div>' +
      '<div class="op-sub">' + fecha + '</div>' +
      '</div>' +
      '<span class="badge" style="background:#FAEEDA;color:#633806">🟡 Pendiente</span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Numero economico (opcional)</label>' +
      '<input type="text" id="num-' + s.id + '" placeholder="Ej: OP-1021" style="font-size:14px"/>' +
      '</div>' +
      '<div class="row" style="gap:8px">' +
      '<button onclick="rechazarSolicitud(\'' + s.id + '\')" class="btn-secondary" style="padding:10px;font-size:13px;flex:1">Rechazar</button>' +
      (window.esSuperAdmin
        ? '<button onclick="aprobarSolicitud(\'' + s.id + '\',\'' + (s.correo||'') + '\',\'' + (s.nombre||'') + '\',\'operador\')" class="btn-primary" style="padding:10px;font-size:13px;flex:1">✅ Operador</button>' +
          '<button onclick="aprobarSolicitud(\'' + s.id + '\',\'' + (s.correo||'') + '\',\'' + (s.nombre||'') + '\',\'admin\')" class="btn-primary" style="padding:10px;font-size:13px;flex:1;background:#378ADD">👤 Admin</button>'
        : '<button onclick="aprobarSolicitud(\'' + s.id + '\',\'' + (s.correo||'') + '\',\'' + (s.nombre||'') + '\',\'operador\')" class="btn-primary" style="padding:10px;font-size:13px;flex:1">Aprobar acceso</button>'
      ) +
      '</div></div>';
  }).join('');
}

async function aprobarSolicitud(uid, correo, nombre, rol) {
  rol = rol || 'operador';
  if (rol === 'admin' && !window.esSuperAdmin) {
    showToast('Sin permisos para crear administradores', true);
    return;
  }
  const numEl = document.getElementById('num-' + uid);
  const numero = numEl ? numEl.value.trim() : '';
  try {
    await firebase.firestore().collection('usuarios').doc(uid).set({
      nombre: nombre, correo: correo, numero: numero, rol: rol, activo: true,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await firebase.firestore().collection('solicitudes').doc(uid).update({ estado:'aprobado' });
    showToast(nombre + ' aprobado como ' + rol);
    cargarSolicitudes();
    cargarTotalOperadores();
  } catch(e) { showToast('Error al aprobar', true); }
}
async function rechazarSolicitud(uid) {
  try {
    await firebase.firestore().collection('solicitudes').doc(uid).update({ estado: 'rechazado' });
    showToast('Solicitud rechazada');
    cargarSolicitudes();
  } catch(e) { showToast('Error al rechazar', true); }
}"""

    if ANCLA_JS not in js:
        raise SystemExit('ERROR: no encontre el bloque de Solicitudes esperado en js/admin2.js. No se modifico nada. Avisa a Claude.')

    with open('new_solicitudes_block.js', 'r', encoding='utf-8') as f:
        nuevo_js = f.read().rstrip('\n')

    js = js.replace(ANCLA_JS, nuevo_js, 1)
    with open('js/admin2.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print('js/admin2.js: bloque de Solicitudes actualizado (lista compacta + modal + buscador).')

print('Listo.')
