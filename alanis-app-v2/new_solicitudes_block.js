let solicitudesListener = null;
let solicitudesCache    = [];
let solicitudAbierta    = null;

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
      solicitudesCache = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
      filtrarSolicitudes();
    }, function(e) { console.error('Error solicitudes:', e); });
}

function filtrarSolicitudes() {
  const inputEl = document.getElementById('buscar-solicitud');
  const q = ((inputEl ? inputEl.value : '') || '').trim().toLowerCase();
  const filtrada = !q ? solicitudesCache : solicitudesCache.filter(function(s) {
    return (s.nombre || '').toLowerCase().indexOf(q) !== -1 ||
           (s.correo || '').toLowerCase().indexOf(q) !== -1;
  });
  renderSolicitudes(filtrada);
}

function renderSolicitudes(lista) {
  const el = document.getElementById('solicitudes-list');
  if (lista.length === 0) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:24px">No hay solicitudes pendientes.</p>';
    return;
  }
  el.innerHTML = lista.map(function(s) {
    const fecha = s.timestamp && s.timestamp.toDate
      ? s.timestamp.toDate().toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : '—';
    const initials = (s.nombre||'OP').split(' ').map(function(n){ return n[0]; }).join('').substring(0,2).toUpperCase();
    return '<div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer" onclick="abrirSolicitud(\'' + s.id + '\')">' +
      '<div class="op-avatar">' + initials + '</div>' +
      '<div style="flex:1;min-width:0">' +
      '<div class="op-name">' + escAttrAdmin(s.nombre || 'Sin nombre') + '</div>' +
      '<div class="op-sub">' + escAttrAdmin(s.correo || '—') + '</div>' +
      '</div>' +
      '<div style="font-size:11.5px;color:var(--text-muted);text-align:right;white-space:nowrap">' + fecha + '</div>' +
      '<div style="color:var(--text-muted);font-size:18px;flex-shrink:0">›</div>' +
      '</div>';
  }).join('');
}

function abrirSolicitud(uid) {
  const s = solicitudesCache.find(function(x) { return x.id === uid; });
  if (!s) return;
  solicitudAbierta = s;
  const fecha = s.timestamp && s.timestamp.toDate
    ? s.timestamp.toDate().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : '—';
  document.getElementById('modal-sol-nombre').textContent = s.nombre || 'Sin nombre';
  document.getElementById('modal-sol-correo').textContent = s.correo || '—';
  document.getElementById('modal-sol-fecha').textContent  = 'Solicitó el ' + fecha;
  document.getElementById('modal-sol-economico').value     = '';
  document.getElementById('modal-sol-nombreoficial').value = '';
  document.getElementById('modal-sol-lada').value          = '52';
  document.getElementById('modal-sol-telefono').value      = '';

  const botones = document.getElementById('modal-sol-botones');
  botones.innerHTML =
    '<button onclick="rechazarSolicitud(\'' + uid + '\')" class="btn-secondary" style="padding:10px;font-size:13px;flex:1">Rechazar</button>' +
    (window.esSuperAdmin
      ? '<button onclick="aprobarSolicitud(\'' + uid + '\',\'operador\')" class="btn-primary" style="padding:10px;font-size:13px;flex:1">✅ Operador</button>' +
        '<button onclick="aprobarSolicitud(\'' + uid + '\',\'admin\')" class="btn-primary" style="padding:10px;font-size:13px;flex:1;background:#378ADD">👤 Admin</button>'
      : '<button onclick="aprobarSolicitud(\'' + uid + '\',\'operador\')" class="btn-primary" style="padding:10px;font-size:13px;flex:1">Aprobar acceso</button>'
    );

  document.getElementById('modal-solicitud-overlay').classList.remove('hidden');
}

function cerrarModalSolicitud() {
  document.getElementById('modal-solicitud-overlay').classList.add('hidden');
  solicitudAbierta = null;
}

async function aprobarSolicitud(uid, rol) {
  rol = rol || 'operador';
  if (rol === 'admin' && !window.esSuperAdmin) {
    showToast('Sin permisos para crear administradores', true);
    return;
  }
  const s = solicitudesCache.find(function(x) { return x.id === uid; }) || solicitudAbierta || {};
  const nombre = s.nombre || '';
  const correo = s.correo || '';

  const numero        = (document.getElementById('modal-sol-economico').value || '').trim();
  const nombreOficial = (document.getElementById('modal-sol-nombreoficial').value || '').trim();
  const lada          = document.getElementById('modal-sol-lada').value || '52';
  const telefono      = (document.getElementById('modal-sol-telefono').value || '').trim().replace(/\D/g, '');

  if (telefono !== '' && telefono.length !== 10) {
    showToast('El teléfono debe tener 10 dígitos', true);
    return;
  }

  try {
    const datos = {
      nombre: nombre, correo: correo, numero: numero, nombreOficial: nombreOficial,
      rol: rol, activo: true,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (telefono !== '') { datos.lada = lada; datos.telefono = telefono; }

    await firebase.firestore().collection('usuarios').doc(uid).set(datos);
    await firebase.firestore().collection('solicitudes').doc(uid).update({ estado: 'aprobado' });
    showToast(nombre + ' aprobado como ' + rol);
    cerrarModalSolicitud();
    cargarTotalOperadores();
  } catch(e) { showToast('Error al aprobar', true); }
}

async function rechazarSolicitud(uid) {
  try {
    await firebase.firestore().collection('solicitudes').doc(uid).update({ estado: 'rechazado' });
    showToast('Solicitud rechazada');
    cerrarModalSolicitud();
  } catch(e) { showToast('Error al rechazar', true); }
}
