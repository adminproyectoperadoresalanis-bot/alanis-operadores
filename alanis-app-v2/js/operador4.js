// ── NAVEGACION POR NIVELES (operador) ─────────────────────────
function mostrarNivel(nivel) {
  const sel = document.getElementById('nivel-seleccion');
  const pat = document.getElementById('nivel-patio');
  const via = document.getElementById('nivel-viaje');
  const cont = document.getElementById('reporte-flotante');
  // Ocultar todos
  if (sel) sel.classList.add('hidden');
  if (pat) pat.classList.add('hidden');
  if (via) via.classList.add('hidden');
  if (nivel === 'seleccion') {
    if (sel) sel.classList.remove('hidden');
    if (cont) { cont.classList.add('hidden'); cont.classList.remove('flotante'); }
    // Limpiar seleccion al regresar
    selectedPatio = null;
    selectedViaje = [];
    selectedStatus = null;
    selectedFallasInline.clear();
    document.querySelectorAll('.status-option').forEach(function(el) { el.classList.remove('selected'); });
    document.querySelectorAll('.extra-inline').forEach(function(el) { el.classList.add('hidden'); el.innerHTML = ''; });
  } else if (nivel === 'patio') {
    if (pat) pat.classList.remove('hidden');
    if (cont) { cont.classList.remove('hidden'); cont.classList.add('flotante'); }
  } else if (nivel === 'viaje') {
    if (via) via.classList.remove('hidden');
    if (cont) { cont.classList.remove('hidden'); cont.classList.add('flotante'); }
  }
}

// ── ACTUALIZAR RESUMEN DEL ESTATUS (franja flotante) ──────────
function actualizarResumen() {
  const dot = document.getElementById('resumen-dot');
  const txt = document.getElementById('resumen-texto');
  if (!dot || !txt) return;
  // Patio (seleccion unica)
  if (selectedPatio) {
    const est = TODOS_ESTATUS.find(function(s){ return s.id === selectedPatio; });
    if (!est) return;
    dot.style.background = est.color;
    if (selectedPatio === 'taller') {
      const n = selectedFallasInline.size;
      txt.textContent = est.label + ' · ' + n + (n === 1 ? ' falla' : ' fallas');
    } else {
      txt.textContent = est.label;
    }
    return;
  }
  // Viaje (puede ser combinado)
  if (selectedViaje.length > 0) {
    const labels = selectedViaje.map(function(vid) {
      const est = TODOS_ESTATUS.find(function(s){ return s.id === vid; });
      return est ? est.label : vid;
    });
    // Color del primero seleccionado
    const primero = TODOS_ESTATUS.find(function(s){ return s.id === selectedViaje[0]; });
    dot.style.background = primero ? primero.color : '#888';
    txt.textContent = labels.join(' + ');
    return;
  }
  // Nada seleccionado
  dot.style.background = '#888';
  txt.textContent = '—';
}

// ── NORMALIZAR TEXTO (ignora acentos) ─────────────────────────
function normalizar(str) {
  return str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// AUTOTRANSPORTES ALANIS — Operador v4.1

// ----------------------------------------------------------------------
// Control de versión (agregado 2026-09-12): reporta a usuarios/{uid} qué
// versión de la app tiene abierta cada operador (para que Ivan lo pueda
// ver en Firestore sin preguntarle a nadie) y avisa en pantalla cuando
// hay una versión más nueva publicada que la cargada. Sube APP_VERSION
// en cada deploy que quieras poder detectar, y actualiza version.json al
// mismo valor.
// ----------------------------------------------------------------------
const APP_VERSION = "2026.09.12-1";

async function verificarActualizacionYReportarVersion(uid) {
  const footerVersion = document.getElementById('footer-version');
  if (footerVersion) footerVersion.textContent = 'Versión: ' + APP_VERSION;

  firebase.firestore().collection('usuarios').doc(uid).set({
    appVersion: APP_VERSION,
    appVersionFecha: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(function() {});

  try {
    const resp = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) return;
    const datos = await resp.json();
    if (datos.version && datos.version !== APP_VERSION) mostrarBannerActualizacion();
  } catch (e) {
    // Sin conexión o archivo no publicado todavía — no es crítico.
  }
}

function mostrarBannerActualizacion() {
  if (document.getElementById('banner-actualizacion-app')) return;
  const banner = document.createElement('div');
  banner.id = 'banner-actualizacion-app';
  banner.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#92400e;color:#fff;padding:10px 16px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:12px;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
  banner.innerHTML = '<span>Hay una versión nueva de la app disponible.</span><button id="banner-actualizacion-btn" style="background:#fff;color:#92400e;border:none;border-radius:6px;padding:6px 12px;font-weight:700;cursor:pointer;">Recargar</button>';
  document.body.prepend(banner);
  document.getElementById('banner-actualizacion-btn').addEventListener('click', function() { location.reload(); });
}

let currentUser = null;
let userData    = null;
let selectedStatus = null;
let selectedFallasInline = new Set();
let qrIdViaje = null;
let toastTimer = null;
let relojInterval = null;

firebase.auth().onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  const doc = await firebase.firestore().collection('usuarios').doc(user.uid).get();
  if (!doc.exists) { doLogout(); return; }
  userData = doc.data();
  if (userData.activo === false) { doLogout(); return; }
  verificarActualizacionYReportarVersion(user.uid);
  if (['admin','superadmin','supervisor'].includes(userData.rol)) {
    window.location.href = 'admin.html'; return;
  }
  document.getElementById('header-sub').textContent = 'Operador: ' + userData.nombre;
  iniciarReloj();
  buildStatusLists();
  mostrarNivel('seleccion');
  cargarUltimoEstatus();
  cargarHistorial();
  cargarTarjetaQRIntercambio();
  if (localStorage.getItem('darkMode') === '1') toggleDark();
});

function iniciarReloj() {
  function actualizar() {
    const now = new Date();
    const fecha = now.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const hora  = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    document.getElementById('fecha-hora-display').textContent = fecha + '  ' + hora;
  }
  actualizar();
  relojInterval = setInterval(actualizar, 30000);
}

const ESTATUS_PATIO = [
  { id:'disponible',   label:'Disponible',   desc:'Listo para operar',           color:'#639922', extra:null },
  { id:'taller',       label:'Taller',        desc:'Unidad en mantenimiento',     color:'#BA7517', extra:'taller' },
  { id:'enfermo',      label:'Enfermo',       desc:'Incapacidad médica temporal', color:'#E24B4A', extra:'enfermo' },
  { id:'permiso',      label:'Permiso',       desc:'Permiso autorizado',          color:'#378ADD', extra:'permiso' },
  { id:'vacaciones',   label:'Vacaciones',    desc:'Período vacacional',          color:'#9B59B6', extra:'vacaciones' },
  { id:'incapacitado', label:'Incapacitado',  desc:'Incapacidad formal IMSS',     color:'#888780', extra:'incapacitado' },
];

const ESTATUS_VIAJE = [
  { id:'incidencia_viaje', label:'Incidencia en viaje', desc:'Problema durante la ruta', color:'#E67E22', extra:'incidencia' },
  { id:'arribo_destino',   label:'Arribo a destino',    desc:'Llegada al cliente',       color:'#27AE60', extra:'arribo' },
  { id:'fin_descarga',     label:'Fin de descarga',     desc:'Descarga completada',      color:'#16A085', extra:'fin_descarga' },
];
const TODOS_ESTATUS = [...ESTATUS_PATIO, ...ESTATUS_VIAJE];

const EXTRA_HTML = {
  taller: function() {
    return '<div class="search-wrap" style="margin-bottom:8px">' +
      '<svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input class="search-input" type="text" id="search-falla-inline" placeholder="Buscar falla..." oninput="renderFallasInline()"/>' +
      '</div>' +
      '<div id="falla-list-inline" style="max-height:200px;overflow-y:auto"></div>' +
      '<div id="selected-tags-inline" style="margin-top:6px"></div>';
  },
  enfermo: function() {
    return '<div class="form-group">' +
      '<label>Número de control médico</label>' +
      '<input type="text" id="enfermo-control" placeholder="Ej: MED-2024-001"/>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:0">' +
      '<label>Días estimados de incapacidad</label>' +
      '<input type="number" id="enfermo-dias" placeholder="Ej: 3" min="1"/>' +
      '</div>';
  },
  permiso: function() {
    return '<div class="form-group">' +
      '<label>Autorizado por</label>' +
      '<input type="text" id="permiso-autorizo" placeholder="Nombre del supervisor"/>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:0">' +
      '<label>Fecha estimada de regreso</label>' +
      '<input type="date" id="permiso-regreso"/>' +
      '</div>';
  },
  vacaciones: function() {
    return '<div class="form-group">' +
      '<label>Autorizado por</label>' +
      '<input type="text" id="vac-autorizo" placeholder="Nombre del supervisor"/>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Fecha de inicio</label>' +
      '<input type="date" id="vac-inicio"/>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:0">' +
      '<label>Fecha de regreso</label>' +
      '<input type="date" id="vac-fin"/>' +
      '</div>';
  },
  incapacitado: function() {
    return '<div class="form-group">' +
      '<label>Folio IMSS</label>' +
      '<input type="text" id="imss-folio" placeholder="Folio del documento IMSS"/>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:0">' +
      '<label>Foto del documento IMSS</label>' +
      '<input type="file" id="imss-foto" accept="image/*" capture="environment" style="font-size:13px"/>' +
      '</div>';
  },
  arribo: function() {
    return '<div class="form-group" style="margin-bottom:0">' +
      '<label>Observaciones de arribo</label>' +
      '<textarea id="arribo-obs" placeholder="Anota cualquier detalle relevante de tu llegada..." rows="3" style="width:100%;padding:10px;font-size:14px;border:0.5px solid var(--border-strong);border-radius:8px;background:var(--bg-app);color:var(--text-primary);resize:none;font-family:inherit"></textarea>' +
      '</div>';
  },
  fin_descarga: function() {
    return '<div class="form-group">' +
      '<label>Observaciones de descarga</label>' +
      '<textarea id="fin-obs" placeholder="Anota cualquier detalle de la descarga..." rows="3" style="width:100%;padding:10px;font-size:14px;border:0.5px solid var(--border-strong);border-radius:8px;background:var(--bg-app);color:var(--text-primary);resize:none;font-family:inherit"></textarea>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:0">' +
      '<label>Foto POD (Proof of Delivery)</label>' +
      '<input type="file" id="pod-foto" accept="image/*" style="font-size:13px"/>' +
      '</div>';
  },
  incidencia: function() {
    return '<div class="form-group">' +
      '<label>Descripción de la incidencia</label>' +
      '<textarea id="incidencia-desc" placeholder="Describe brevemente la incidencia..." rows="3" style="width:100%;padding:10px;font-size:14px;border:0.5px solid var(--border-strong);border-radius:8px;background:var(--bg-app);color:var(--text-primary);resize:none;font-family:inherit"></textarea>' +
      '</div>' +
      '<div class="form-group" style="margin-bottom:0">' +
      '<label>Foto (opcional)</label>' +
      '<input type="file" id="incidencia-foto" accept="image/*" capture="environment" style="font-size:13px"/>' +
      '</div>';
  }
};

function buildStatusLists() {
  document.getElementById('status-patio').innerHTML = ESTATUS_PATIO.map(function(s) {
    return buildStatusItem(s);
  }).join('');
  document.getElementById('status-viaje').innerHTML = ESTATUS_VIAJE.map(function(s) {
    return buildStatusItem(s);
  }).join('');
}

function buildStatusItem(s) {
  return '<div class="status-item-wrap" id="wrap-' + s.id + '">' +
    '<div class="status-option" id="opt-' + s.id + '" onclick="selectStatus(\'' + s.id + '\')">' +
    '<span class="status-dot" style="background:' + s.color + '"></span>' +
    '<div><div class="status-label">' + s.label + '</div><div class="status-desc">' + s.desc + '</div></div>' +
    '<div class="radio-circle"></div>' +
    '</div>' +
    '<div class="extra-inline hidden" id="extra-' + s.id + '"></div>' +
    '</div>';
}

// Selecciones activas: un string para patio, array para viaje
let selectedPatio = null;
let selectedViaje = []; // puede tener hasta 2 items compatibles

function esPatioEstatus(id) {
  return ESTATUS_PATIO.find(function(s){ return s.id === id; }) !== undefined;
}

function selectStatus(id) {
  const esPatio = esPatioEstatus(id);

  if (esPatio) {
    // Patio: seleccion unica, limpia todo viaje
    selectedPatio = id;
    selectedViaje = [];
    selectedStatus = id;
  } else {
    // Viaje: logica combinada
    selectedPatio = null;

    // Regla: arribo_destino y fin_descarga no pueden juntos
    if (id === 'arribo_destino' && selectedViaje.includes('fin_descarga')) {
      showToast('Arribo a destino y Fin de descarga no pueden combinarse', true); return;
    }
    if (id === 'fin_descarga' && selectedViaje.includes('arribo_destino')) {
      showToast('Fin de descarga y Arribo a destino no pueden combinarse', true); return;
    }

    // Toggle: si ya esta seleccionado, deseleccionar
    if (selectedViaje.includes(id)) {
      selectedViaje = selectedViaje.filter(function(x){ return x !== id; });
    } else {
      selectedViaje.push(id);
    }
    selectedStatus = selectedViaje.length > 0 ? selectedViaje.join('+') : null;
  }

  // Redibujar UI
  document.querySelectorAll('.status-option').forEach(function(el) { el.classList.remove('selected'); });
  document.querySelectorAll('.extra-inline').forEach(function(el) { el.classList.add('hidden'); el.innerHTML = ''; });
  selectedFallasInline.clear();

  if (esPatio && selectedPatio) {
    document.getElementById('opt-' + selectedPatio).classList.add('selected');
    const est = TODOS_ESTATUS.find(function(s){ return s.id === selectedPatio; });
    if (est && est.extra && EXTRA_HTML[est.extra]) {
      const el = document.getElementById('extra-' + selectedPatio);
      el.innerHTML = EXTRA_HTML[est.extra]();
      el.classList.remove('hidden');
      if (est.extra === 'taller') renderFallasInline();
    }
  } else {
    selectedViaje.forEach(function(vid) {
      document.getElementById('opt-' + vid).classList.add('selected');
      const est = TODOS_ESTATUS.find(function(s){ return s.id === vid; });
      if (est && est.extra && EXTRA_HTML[est.extra]) {
        const el = document.getElementById('extra-' + vid);
        el.innerHTML = EXTRA_HTML[est.extra]();
        el.classList.remove('hidden');
      }
    });
  }
  actualizarResumen();
}

function renderFallasInline() {
  const searchEl = document.getElementById('search-falla-inline');
  const q = normalizar(searchEl ? searchEl.value : '');
  const filtered = FALLAS.filter(function(f) {
    return normalizar(f.name).includes(q) || normalizar(f.cat).includes(q);
  });
  const SEVMAP = { alta:'sev-alta', media:'sev-media', baja:'sev-baja' };
  const SEVLBL = { alta:'Alta', media:'Media', baja:'Baja' };
  const listEl = document.getElementById('falla-list-inline');
  if (!listEl) return;
  listEl.innerHTML = filtered.map(function(f) {
    return '<div class="falla-item ' + (selectedFallasInline.has(f.id) ? 'checked' : '') + '" onclick="toggleFallaInline(' + f.id + ')">' +
      '<div class="falla-checkbox"></div>' +
      '<div><div class="falla-cat">' + f.cat + '</div><div class="falla-name">' + f.name + '</div></div>' +
      '<span class="sev-badge ' + SEVMAP[f.sev] + '">' + SEVLBL[f.sev] + '</span>' +
      '</div>';
  }).join('');
  actualizarTagsInline();
}

function toggleFallaInline(id) {
  if (selectedFallasInline.has(id)) { selectedFallasInline.delete(id); } else { selectedFallasInline.add(id); }
  renderFallasInline();
  actualizarResumen();
}

function actualizarTagsInline() {
  const wrap = document.getElementById('selected-tags-inline');
  if (!wrap) return;
  if (selectedFallasInline.size === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<div class="tags-wrap">' + Array.from(selectedFallasInline).map(function(id) {
    const f = FALLAS.find(function(x) { return x.id === id; });
    return f ? '<span class="tag" onclick="toggleFallaInline(' + id + ')">x ' + f.name + '</span>' : '';
  }).join('') + '</div>';
}

function escanearQR() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const id = 'QR-' + Date.now();
    qrIdViaje = id;
    document.getElementById('qr-id-display').textContent = id;
    document.getElementById('qr-result').style.display = 'block';
    showToast('QR vinculado al viaje');
  };
  input.click();
}

async function cargarUltimoEstatus() {
  try {
    const snap = await firebase.firestore().collection('eventos')
      .where('uid', '==', currentUser.uid)
      .orderBy('timestamp', 'desc')
      .limit(1).get();
    if (!snap.empty) {
      const e = snap.docs[0].data();
      const est = TODOS_ESTATUS.find(function(s) { return s.id === e.estatus; });
      document.getElementById('ultimo-estatus-box').style.display = 'block';
      document.getElementById('ultimo-dot').style.background = est ? est.color : '#888';
      document.getElementById('ultimo-label').textContent = est ? est.label : e.estatus;
      document.getElementById('ultimo-hora').textContent = e.fecha + ' ' + e.hora;
    }
  } catch(e) { console.log('Sin historial previo'); }
}

async function enviarReporte() {
  const esCombinado = selectedViaje.length > 0;
  if (!esCombinado && !selectedPatio) {
    showToast('Selecciona un estatus antes de enviar', true); return;
  }
  if (esCombinado && selectedViaje.length === 0) {
    showToast('Selecciona al menos un estatus de viaje', true); return;
  }

  const btn = document.getElementById('btn-reporte');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const now = new Date();
  const fecha = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const hora  = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

  let gps = null;
  try {
    const pos = await new Promise(function(resolve, reject) {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout:5000 });
    });
    gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch(e) { gps = null; }

  // Construir label para historial
  const estatusIds = esCombinado ? selectedViaje : [selectedPatio];
  const estatusLabels = estatusIds.map(function(id) {
    const e = TODOS_ESTATUS.find(function(s){ return s.id === id; });
    return e ? e.label : id;
  }).join(' + ');

  const evento = {
    uid:       currentUser.uid,
    operador:  userData.nombre,
    numero:    userData.numero || '',
    estatus:   estatusIds[0],
    estatus_ids: estatusIds,
    estatus_label: estatusLabels,
    categoria: esCombinado ? 'viaje' : 'patio',
    fecha:     fecha,
    hora:      hora,
    gps:       gps,
    viaje_id:  qrIdViaje || null,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (selectedStatus === 'taller') {
    evento.fallas = Array.from(selectedFallasInline).map(function(id) {
      return FALLAS.find(function(f) { return f.id === id; });
    }).filter(Boolean);
  }
  if (selectedStatus === 'enfermo') {
    evento.control_medico   = document.getElementById('enfermo-control') ? document.getElementById('enfermo-control').value.trim() : '';
    evento.dias_incapacidad = document.getElementById('enfermo-dias') ? document.getElementById('enfermo-dias').value : '';
  }
  if (selectedStatus === 'permiso') {
    evento.autorizo      = document.getElementById('permiso-autorizo') ? document.getElementById('permiso-autorizo').value.trim() : '';
    evento.fecha_regreso = document.getElementById('permiso-regreso') ? document.getElementById('permiso-regreso').value : '';
  }
  if (selectedStatus === 'vacaciones') {
    evento.autorizo   = document.getElementById('vac-autorizo') ? document.getElementById('vac-autorizo').value.trim() : '';
    evento.vac_inicio = document.getElementById('vac-inicio') ? document.getElementById('vac-inicio').value : '';
    evento.vac_fin    = document.getElementById('vac-fin') ? document.getElementById('vac-fin').value : '';
  }
  if (selectedStatus === 'incapacitado') {
    evento.imss_folio = document.getElementById('imss-folio') ? document.getElementById('imss-folio').value.trim() : '';
  }
  if (selectedStatus === 'incidencia_viaje') {
    evento.incidencia_desc = document.getElementById('incidencia-desc') ? document.getElementById('incidencia-desc').value.trim() : '';
  }
  if (selectedStatus === 'arribo_destino') {
    evento.observaciones = document.getElementById('arribo-obs') ? document.getElementById('arribo-obs').value.trim() : '';
  }
  if (selectedStatus === 'fin_descarga') {
    evento.observaciones = document.getElementById('fin-obs') ? document.getElementById('fin-obs').value.trim() : '';
  }

  try {
    await firebase.firestore().collection('eventos').add(evento);

    // ── Crear OT automática si es taller con fallas ──
    if (selectedStatus === 'taller' && evento.fallas && evento.fallas.length > 0) {
      const anio = new Date().getFullYear();
      const folio = 'OT-' + String(Math.floor(Math.random() * 900000) + 100000) + '-' + anio;
      const tallerUnidadEl = document.getElementById('taller-unidad');
      const unidadOT = tallerUnidadEl && tallerUnidadEl.value.trim() ? tallerUnidadEl.value.trim() : evento.numero;
      await firebase.firestore().collection('ordenes_trabajo').add({
        folio:     folio,
        anio:      anio,
        uid:       evento.uid,
        operador:  evento.operador,
        numero:    unidadOT,
        unidad:    unidadOT,
        fallas:    evento.fallas,
        fecha:     evento.fecha,
        hora:      evento.hora,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    showToast('Estatus enviado: ' + estatusLabels);
    selectedStatus = null;
    selectedPatio = null;
    selectedViaje = [];
    selectedFallasInline.clear();
    qrIdViaje = null;
    document.querySelectorAll('.status-option').forEach(function(el) { el.classList.remove('selected'); });
    document.querySelectorAll('.extra-inline').forEach(function(el) { el.classList.add('hidden'); el.innerHTML = ''; });
    document.getElementById('qr-result').style.display = 'none';
    cargarUltimoEstatus();
    cargarHistorial();
  } catch(e) {
    console.error(e);
    showToast('Error al enviar. Intenta de nuevo.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar estatus';
  }
}

async function cargarHistorial() {
  try {
    const hoy = new Date();
    const fecha = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0') + '-' + String(hoy.getDate()).padStart(2,'0');
    const snap = await firebase.firestore().collection('eventos')
      .where('uid', '==', currentUser.uid)
      .where('fecha', '==', fecha)
      .orderBy('timestamp', 'desc')
      .limit(20).get();
    const el = document.getElementById('historial-list');
    if (snap.empty) {
      el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px">Sin eventos hoy.</p>';
      return;
    }
    el.innerHTML = snap.docs.map(function(d) {
      const e = d.data();
      const est = TODOS_ESTATUS.find(function(s) { return s.id === e.estatus; });
      const color = est ? est.color : '#888';
      const label = e.estatus_label || (est ? est.label : e.estatus);
      let detalle = '';
      if (e.fallas && e.fallas.length) detalle = e.fallas.length + ' falla(s) reportada(s)';
      if (e.control_medico) detalle = 'Control: ' + e.control_medico;
      if (e.autorizo) detalle = 'Autorizó: ' + e.autorizo;
      if (e.incidencia_desc) detalle = e.incidencia_desc;
      if (e.viaje_id) detalle += (detalle ? ' · ' : '') + 'Viaje: ' + e.viaje_id;
      if (e.observaciones) detalle += (detalle ? ' · ' : '') + e.observaciones;
      if (e.gps) detalle += (detalle ? ' · ' : '') + '📍 GPS';
      return '<div class="timeline-item">' +
        '<span class="timeline-dot" style="background:' + color + '"></span>' +
        '<div class="timeline-time">' + e.hora + '</div>' +
        '<div class="timeline-status">' + label + '</div>' +
        (detalle ? '<div class="timeline-detail">' + detalle + '</div>' : '') +
        '</div>';
    }).join('');
  } catch(e) { console.error('Error historial:', e); }
}


// ── ASIGNACIONES (OPERADOR) ───────────────────────────────────
async function cargarAsignacionesOp() {
  try {
    const snap = await firebase.firestore().collection('asignaciones')
      .where('uid_operador', '==', currentUser.uid)
      .orderBy('timestamp', 'desc')
      .limit(30).get();
    const lista = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    const pendientes = lista.filter(function(a) { return a.estado === 'pendiente'; }).length;
    const badge = document.getElementById('asig-op-badge');
    if (pendientes > 0) { badge.classList.remove('hidden'); badge.textContent = pendientes; }
    else badge.classList.add('hidden');
    renderAsignacionesOp(lista);
  } catch(e) { console.error('Error asignaciones op:', e); }
}

function renderAsignacionesOp(lista) {
  const el = document.getElementById('asignaciones-op-list');
  if (lista.length === 0) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:24px">Sin asignaciones por ahora.</p>';
    return;
  }
  const ESTADO = { pendiente:'🟡 Pendiente', aceptada:'🟢 Aceptada', rechazada:'🔴 Rechazada' };
  el.innerHTML = lista.map(function(a) {
    let acciones = '';
    if (a.estado === 'pendiente') {
      acciones = '<div class="row mt-12" style="gap:8px">' +
        '<button class="btn-secondary" style="padding:10px;font-size:13px;flex:1" onclick="rechazarAsignacion(\'' + a.id + '\')">Rechazar</button>' +
        '<button class="btn-primary" style="padding:10px;font-size:13px;flex:1" onclick="aceptarAsignacion(\'' + a.id + '\')">Aceptar viaje</button>' +
        '</div>';
    }
    return '<div class="card">' +
      '<div class="row-between">' +
      '<span style="font-size:16px;font-weight:700;color:var(--brand-light)">Unidad ' + a.unidad + '</span>' +
      '<span style="font-size:12px">' + (ESTADO[a.estado] || a.estado) + '</span>' +
      '</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);margin-top:8px;line-height:1.8">' +
      '<div><strong>Cliente:</strong> ' + a.cliente + '</div>' +
      '<div><strong>Destino:</strong> ' + (a.destino || '—') + '</div>' +
      '<div><strong>Remolque:</strong> ' + a.remolque + '</div>' +
      '<div><strong>Línea:</strong> ' + a.linea + '</div>' +
      '<div><strong>Cita:</strong> ' + (a.cita || '—') + '</div>' +
      '</div>' +
      acciones +
      (a.motivo_rechazo ? '<div style="font-size:12px;color:var(--red);margin-top:8px">Motivo: ' + a.motivo_rechazo + '</div>' : '') +
      '</div>';
  }).join('');
}

async function aceptarAsignacion(id) {
  try {
    await firebase.firestore().collection('asignaciones').doc(id).update({
      estado: 'aceptada',
      fecha_respuesta: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('Viaje aceptado');
    cargarAsignacionesOp();
  } catch(e) { console.error(e); showToast('Error al aceptar', true); }
}

async function rechazarAsignacion(id) {
  const motivo = prompt('Motivo del rechazo:');
  if (motivo === null) return;
  try {
    await firebase.firestore().collection('asignaciones').doc(id).update({
      estado: 'rechazada',
      motivo_rechazo: motivo || 'Sin motivo especificado',
      fecha_respuesta: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('Viaje rechazado');
    cargarAsignacionesOp();
  } catch(e) { console.error(e); showToast('Error al rechazar', true); }
}

function switchTab(tab) {
  ['reporte','asignaciones','historial','documentacion'].forEach(function(t) {
    document.getElementById('tab-' + t).classList.add('hidden');
    document.getElementById('nav-' + t).classList.remove('active');
  });
  document.getElementById('tab-' + tab).classList.remove('hidden');
  document.getElementById('nav-' + tab).classList.add('active');
  if (tab === 'asignaciones') cargarAsignacionesOp();
  if (tab === 'documentacion') cargarTarjetaQRIntercambio();
  // Contenedor flotante solo en tab reporte
  const cont = document.getElementById('reporte-flotante');
  if (cont && tab !== 'reporte') { cont.classList.add('hidden'); cont.classList.remove('flotante'); }
  if (tab === 'reporte') mostrarNivel('seleccion');
}

function toggleDark() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? '1' : '0');
}

function doLogout() {
  if (relojInterval) clearInterval(relojInterval);
  firebase.auth().signOut().then(function() { window.location.href = 'index.html'; });
}

function showToast(msg, warn) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.className = 'toast' + (warn ? ' toast-warn' : '');
  void t.offsetWidth;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 3500);
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENTACIÓN — Checkpoints QR/CFDI (McCain): recepción y pre-entrega
// ═══════════════════════════════════════════════════════════════
// Mecanismo (confirmado por Ivan, 2026-09-02): ninguno de los dos
// checkpoints necesita que el operador sepa de antemano qué embarque le
// toca. El operador escanea el QR de la factura que trae en la mano y la
// app busca en repositorio_mccain qué embarque tiene ese uuidEsperado —
// si no encuentra nada es porque Atención al Cliente y/o Operaciones
// todavía no validaron ese CFDI (o acaban de hacerlo y aún no sincroniza
// desde ADREMATASA Interno, hasta 5 minutos vía Apps Script).
//
// ACTUALIZADO (2026-09-07): Checkpoint 1 (recepción) ya SÍ valida contra
// una asignación operador↔embarque — operadorAsignado, que Operaciones
// captura en ADREMATASA al hacer la 2da validación (no depende del
// sistema de asignación de viajes de Alanis Operadores, todavía en
// pruebas). Por eso el resultado de Checkpoint 1 tiene 3 estados en vez
// de 2: COINCIDE, NO_COINCIDE_DOCUMENTO (factura equivocada) y
// NO_COINCIDE_OPERADOR (factura correcta, pero no es tu carga). Checkpoint
// 2 (pre-entrega) NO se tocó — sigue siendo solo documento, sin chequeo de
// operador.
//
// Checkpoint 1 (recepción) escribe recepcionOperador — validado por la
// regla esRecepcionOperadorValida(). Checkpoint 2 (pre-entrega) escribe
// destinoEscaneo/estatusValidacion/validadoPor/discrepanciaDetalle —
// validado por la regla esEscaneoDestinoValido() ya desplegada. En
// ambos casos la regla recalcula la comparación y rechaza el write si el
// cliente intenta "inventar" un resultado que no cuadra.

let docCheckpointActual = null; // 'recepcion' | 'pre_entrega'
let docLectorQR = null;
let docDatosLeidos = null;
let docEmbarqueEncontrado = null; // { id, ...datos de repositorio_mccain }
let docWakeLock = null;
let docAlarmaInterval = null;

// Extrae { uuid, rfc } del QR de verificación del CFDI del SAT
// (https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=...&rr=...).
// El total (tt) se ignora a propósito, por privacidad.
function parsearQRDoc(texto) {
  let url;
  try { url = new URL(texto); } catch (e) { return null; }
  const uuid = (url.searchParams.get('id') || '').trim();
  const rfc = (url.searchParams.get('rr') || '').trim();
  if (!uuid || !rfc) return null;
  if (!/^[0-9a-fA-F-]{30,40}$/.test(uuid)) return null;
  return { uuid: uuid.toUpperCase(), rfc: rfc.toUpperCase() };
}

function docReproducirSonido(tipo) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (tipo === 'exito') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
      osc.onended = function() { ctx.close().catch(function(){}); };
    } else {
      [0, 0.22, 0.44].forEach(function(offset) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square'; osc.frequency.value = 220;
        gain.gain.setValueAtTime(1.0, ctx.currentTime + offset);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.16);
      });
      setTimeout(function() { ctx.close().catch(function(){}); }, 800);
    }
  } catch (e) { /* sin soporte de audio en este navegador — se ignora */ }
}

function docVibrar(tipo) {
  if (!navigator.vibrate) return;
  navigator.vibrate(tipo === 'exito' ? [80] : [200, 100, 200, 100, 200]);
}

async function docPedirWakeLock() {
  try {
    if ('wakeLock' in navigator) docWakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* no crítico */ }
}
function docSoltarWakeLock() {
  if (docWakeLock) { docWakeLock.release().catch(function(){}); docWakeLock = null; }
}

const DOC_ICONO_EXITO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>';
const DOC_ICONO_ALERTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L22.5 20.5H1.5L12 3Z"/><path d="M12 9.5v5"/><path d="M12 18h.01"/></svg>';

const DOC_TITULOS = {
  recepcion: 'Checkpoint 1 · Despacho',
  pre_entrega: 'Checkpoint 2 · Pre-entrega'
};
const DOC_NOTAS = {
  recepcion: 'Escanea el QR de la factura que acabas de recibir en el paquete de documentos.',
  pre_entrega: 'Antes de presentarte con el cliente: vuelve a escanear el QR de la misma factura.'
};

// Busca, en una sola consulta, todos los embarques de repositorio_mccain
// asignados al operador actual (operadorAsignado.uid). Se reusa tanto para
// el pre-check de Checkpoint 1 como para la tarjeta de "Mostrar QR de
// intercambio" en la pestaña Documentación — cada quien filtra el
// resultado según lo que necesita.
async function buscarEmbarquesAsignados() {
  const snap = await firebase.firestore().collection('repositorio_mccain')
    .where('operadorAsignado.uid', '==', currentUser.uid)
    .get();
  return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
}

// ACTUALIZADO (2026-09-16): Checkpoint 1 (recepción) ya no abre la cámara a
// ciegas para luego buscar por lo que se escanee — primero confirma, contra
// repositorio_mccain, que el operador tiene una asignación pendiente en
// este checkpoint. Si la tiene, guarda ESE documento en docEmbarqueEncontrado
// y docManejarLectura compara lo escaneado contra él (nunca vuelve a
// buscar). Así ningún operador puede ver el shipment/cliente/caja de un
// embarque que no es el suyo con solo escanear un QR ajeno — antes de esto,
// docManejarLectura buscaba por el UUID escaneado y mostraba esos datos
// aunque el embarque fuera de otro operador (el chequeo de operador llegaba
// después, ya con la info en pantalla). Checkpoint 2 (pre-entrega) sigue
// exactamente igual que antes — no usa este pre-check.
async function abrirEscaneoDocumentacion(checkpoint) {
  // Checkpoint 2 (pre-entrega) no debe estar disponible mientras Checkpoint
  // 1 no se haya completado — pedido de Ivan (2026-09-16), después de ver
  // que el botón se veía tocable aunque el operador todavía no hubiera
  // hecho el despacho. checkpoint2Habilitado lo mantiene actualizado
  // cargarTarjetaQRIntercambio() (mismo criterio que ya usa para mostrar la
  // tarjeta de "Mostrar QR de intercambio": recepción en COINCIDE y
  // pre-entrega todavía sin registrar). Esto es un candado de UI para
  // evitar el toque accidental — no reemplaza ninguna validación de
  // Firestore.
  if (checkpoint === 'pre_entrega' && !checkpoint2Habilitado) {
    showToast('Primero completa el Checkpoint 1 de tu embarque asignado.', true);
    return;
  }
  docCheckpointActual = checkpoint;
  docDatosLeidos = null;
  docEmbarqueEncontrado = null;
  document.getElementById('doc-modal-titulo').textContent = DOC_TITULOS[checkpoint] || 'Escanear CFDI';
  document.getElementById('doc-modal-nota').textContent = DOC_NOTAS[checkpoint] || '';
  document.getElementById('doc-modal-error').textContent = '';
  document.getElementById('doc-modal-confirmar').classList.add('hidden');
  document.getElementById('doc-modal-no-encontrado').classList.add('hidden');
  document.getElementById('doc-modal-buscando').classList.add('hidden');
  document.getElementById('doc-modal-cancelar-wrap').classList.remove('hidden');
  document.getElementById('doc-no-encontrado-reescanear-btn').classList.remove('hidden');
  document.getElementById('doc-modal').classList.remove('hidden');

  if (checkpoint === 'recepcion') {
    document.getElementById('doc-modal-captura').classList.add('hidden');
    document.getElementById('doc-modal-buscando').classList.remove('hidden');
    let asignados;
    try {
      asignados = await buscarEmbarquesAsignados();
    } catch (e) {
      document.getElementById('doc-modal-buscando').classList.add('hidden');
      document.getElementById('doc-modal-error').textContent = 'No se pudo verificar tu asignación: ' + e.message;
      document.getElementById('doc-modal-captura').classList.remove('hidden');
      return;
    }
    const pendientes = asignados.filter(function(e) { return !e.recepcionOperador; });
    document.getElementById('doc-modal-buscando').classList.add('hidden');

    if (pendientes.length === 0) {
      // Sin embarque asignado no hay nada contra qué comparar todavía — ni
      // siquiera se llegó a abrir la cámara (docEmbarqueEncontrado sigue en
      // null). "Volver a escanear" no aplica aquí: no es un caso de "el
      // documento no coincidió", es "no tienes nada asignado". Si se dejara
      // el botón y el operador insistiera en escanear, docManejarLectura
      // tronaría al intentar leer .uuidEsperado de un docEmbarqueEncontrado
      // nulo. Se oculta el botón y solo queda "Cerrar".
      document.getElementById('doc-no-encontrado-msg').textContent =
        'No tienes ningún embarque asignado pendiente de despacho. Si Operaciones acaba de asignarte, espera unos minutos — puede tardar en sincronizar — e intenta de nuevo.';
      document.getElementById('doc-no-encontrado-reescanear-btn').classList.add('hidden');
      document.getElementById('doc-modal-no-encontrado').classList.remove('hidden');
      document.getElementById('doc-modal-cancelar-wrap').classList.add('hidden');
      return;
    }
    if (pendientes.length > 1) {
      // Un operador solo puede tener 1 embarque abierto a la vez (regla
      // aplicada del lado de Operaciones desde 2026-09-16) — más de uno
      // aquí solo puede ser un caso heredado de antes de esa regla. Se usa
      // el primero y se deja constancia en consola, sin bloquear al
      // operador por un caso que ya no debería volver a ocurrir.
      console.warn('Operador con más de 1 embarque abierto (caso heredado):', currentUser.uid, pendientes.map(function(e) { return e.id; }));
    }
    docEmbarqueEncontrado = pendientes[0];
  }

  document.getElementById('doc-modal-captura').classList.remove('hidden');
  docPedirWakeLock();
  docIniciarCamara();
}

function docIniciarCamara() {
  const estadoEl = document.getElementById('doc-camara-estado');
  if (typeof window.Html5Qrcode === 'undefined') {
    estadoEl.textContent = 'No se pudo cargar la cámara. Verifica tu conexión e intenta de nuevo.';
    return;
  }
  docDetenerCamara();
  docLectorQR = new window.Html5Qrcode('doc-qr-reader');
  estadoEl.textContent = 'Apunta la cámara al código QR de la factura.';
  docLectorQR.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 250 },
    function(textoLeido) {
      const datos = parsearQRDoc(textoLeido);
      if (!datos) {
        estadoEl.textContent = 'Ese código no parece ser un QR de CFDI del SAT. Sigue intentando.';
        return;
      }
      docManejarLectura(datos);
    },
    function() { /* sin QR en este cuadro — normal mientras se acomoda la cámara */ }
  ).catch(function() {
    estadoEl.textContent = 'No se pudo acceder a la cámara (revisa permisos del navegador).';
  });
}

function docDetenerCamara() {
  if (docLectorQR) {
    const lector = docLectorQR;
    docLectorQR = null;
    lector.stop().catch(function(){});
  }
}

async function docManejarLectura(datos) {
  docDatosLeidos = datos;
  docDetenerCamara();
  document.getElementById('doc-modal-error').textContent = '';

  if (docCheckpointActual === 'recepcion') {
    // El embarque ya se conoce desde el pre-check en abrirEscaneoDocumentacion
    // (antes de abrir la cámara) — aquí solo se compara lo escaneado contra
    // ESE documento, nunca se vuelve a buscar en Firestore por el UUID
    // leído. Si no corresponde, se rechaza el escaneo sin registrar nada
    // (se puede volver a intentar con "Volver a escanear") — el pre-check
    // ya garantiza que este embarque es del operador que está escaneando,
    // así que aquí no puede salir NO_COINCIDE_OPERADOR.
    const coincideDoc = docEmbarqueEncontrado.uuidEsperado === datos.uuid
      && docEmbarqueEncontrado.receptorRFCEsperado === datos.rfc;

    if (!coincideDoc) {
      document.getElementById('doc-modal-captura').classList.add('hidden');
      document.getElementById('doc-no-encontrado-msg').textContent =
        'Esta factura no corresponde a tu embarque asignado (' + (docEmbarqueEncontrado.shipment || docEmbarqueEncontrado.id) + '). Verifica que es el documento correcto e inténtalo de nuevo.';
      document.getElementById('doc-modal-no-encontrado').classList.remove('hidden');
      document.getElementById('doc-modal-cancelar-wrap').classList.add('hidden');
      return;
    }

    document.getElementById('doc-info-embarque').innerHTML =
      '<strong>Shipment:</strong> ' + docEsc(docEmbarqueEncontrado.shipment || '—') + '<br>' +
      '<strong>Cliente:</strong> ' + docEsc(docEmbarqueEncontrado.clienteNombre || '—') + '<br>' +
      '<strong>OC Cliente:</strong> ' + docEsc(docEmbarqueEncontrado.ocCliente || '—') + '<br>' +
      '<strong>Caja/remolque:</strong> ' + docEsc(docEmbarqueEncontrado.caja || '—') +
      '<br><br>Verifica que estos datos correspondan a la factura que tienes en la mano.';
    document.getElementById('doc-modal-captura').classList.add('hidden');
    document.getElementById('doc-modal-confirmar').classList.remove('hidden');
    return;
  }

  // Checkpoint 2 (pre-entrega) — sin cambios: sigue buscando en
  // repositorio_mccain por el UUID escaneado, tal como siempre.
  let encontrado;
  try {
    const snap = await firebase.firestore().collection('repositorio_mccain')
      .where('uuidEsperado', '==', datos.uuid)
      .limit(1).get();
    encontrado = snap.empty ? null : Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
  } catch (e) {
    document.getElementById('doc-modal-error').textContent = 'Error al buscar: ' + e.message;
    document.getElementById('doc-modal-captura').classList.remove('hidden');
    docIniciarCamara();
    return;
  }

  if (!encontrado) {
    // No hay ningún embarque con este UUID ya validado (uuidEsperado). Eso
    // por sí solo no dice si es "todavía no sincroniza" o "documento
    // equivocado" — ambos casos dan la misma búsqueda vacía. Para
    // distinguirlos (pedido de Ivan, 2026-09-08) se hace una segunda
    // búsqueda de respaldo por uuidFactura: ese campo lo captura la macro
    // VBA del PDF real desde que llega el correo, MUCHO antes de cualquier
    // validación — así que si aparece algo ahí, el documento sí es real y
    // solo está pendiente de sincronizar; si no aparece nada en ninguna de
    // las dos búsquedas, el documento simplemente no corresponde a nada en
    // el sistema. No expone ningún dato sensible del embarque pendiente
    // (no se muestra a quién pertenece, solo que existe).
    let yaExisteSinSincronizar = false;
    try {
      const snap2 = await firebase.firestore().collection('repositorio_mccain')
        .where('uuidFactura', '==', datos.uuid)
        .limit(1).get();
      yaExisteSinSincronizar = !snap2.empty;
    } catch (e) {
      // Si esta segunda búsqueda falla (p.ej. sin conexión intermitente),
      // no bloquea nada — simplemente no se puede distinguir el caso y se
      // muestra el mensaje genérico de siempre.
    }

    docEmbarqueEncontrado = null;
    document.getElementById('doc-modal-captura').classList.add('hidden');
    document.getElementById('doc-no-encontrado-msg').textContent = yaExisteSinSincronizar
      ? 'Este documento ya está en el sistema, pero Atención al Cliente / Operaciones todavía no completan su validación (o acaban de hacerlo y falta que sincronice). Espera unos minutos y vuelve a intentar.'
      : 'Este UUID no corresponde a ningún embarque del sistema. Verifica que es el documento correcto — no es un problema de sincronización.';
    document.getElementById('doc-modal-no-encontrado').classList.remove('hidden');
    document.getElementById('doc-modal-cancelar-wrap').classList.add('hidden');
    return;
  }

  // Ya se registró la pre-entrega de este embarque antes — no se puede
  // volver a escribir (la regla de Firestore lo bloquearía de todas
  // formas). Checkpoint 1 (recepción) ya no llega hasta aquí — su propio
  // chequeo de "ya se registró" ocurre en el pre-check, antes de escanear.
  if (encontrado.estatusValidacion === 'VALIDADO' || encontrado.estatusValidacion === 'DISCREPANCIA') {
    document.getElementById('doc-modal-error').textContent =
      'Ya se registró la pre-entrega de este embarque.';
    document.getElementById('doc-modal-captura').classList.remove('hidden');
    docIniciarCamara();
    return;
  }

  docEmbarqueEncontrado = encontrado;
  document.getElementById('doc-info-embarque').innerHTML =
    '<strong>Shipment:</strong> ' + docEsc(encontrado.shipment || '—') + '<br>' +
    '<strong>Cliente:</strong> ' + docEsc(encontrado.clienteNombre || '—') + '<br>' +
    '<strong>OC Cliente:</strong> ' + docEsc(encontrado.ocCliente || '—') + '<br>' +
    '<strong>Caja/remolque:</strong> ' + docEsc(encontrado.caja || '—') +
    '<br><br>Verifica que estos datos correspondan a la factura que tienes en la mano.';
  document.getElementById('doc-modal-captura').classList.add('hidden');
  document.getElementById('doc-modal-confirmar').classList.remove('hidden');
}

function docEsc(texto) {
  const div = document.createElement('div');
  div.textContent = texto || '';
  return div.innerHTML;
}

function volverAEscanearDoc() {
  document.getElementById('doc-modal-confirmar').classList.add('hidden');
  document.getElementById('doc-modal-no-encontrado').classList.add('hidden');
  document.getElementById('doc-modal-captura').classList.remove('hidden');
  document.getElementById('doc-modal-cancelar-wrap').classList.remove('hidden');
  document.getElementById('doc-modal-error').textContent = '';
  docIniciarCamara();
}

function cerrarModalDoc() {
  docDetenerCamara();
  docSoltarWakeLock();
  document.getElementById('doc-modal').classList.add('hidden');
  docCheckpointActual = null;
  docDatosLeidos = null;
  docEmbarqueEncontrado = null;
}

async function confirmarRegistroDoc() {
  if (!docDatosLeidos || !docEmbarqueEncontrado) return;
  const btn = document.getElementById('doc-btn-confirmar');
  btn.disabled = true;
  try {
    const coincide = docEmbarqueEncontrado.uuidEsperado === docDatosLeidos.uuid
      && docEmbarqueEncontrado.receptorRFCEsperado === docDatosLeidos.rfc;

    if (docCheckpointActual === 'recepcion') {
      // Resultado de 3 estados (nuevo, 2026-09-07): además de si el
      // documento es el correcto, ahora también importa si quien escanea
      // es el operador que Operaciones asignó a este embarque en la 2da
      // validación (operadorAsignado, sincronizado desde ADREMATASA). La
      // regla esRecepcionOperadorValida() recalcula esto mismo y rechaza
      // el write si no cuadra — esto de aquí solo decide qué mandar.
      const operadorCoincide = !!(docEmbarqueEncontrado.operadorAsignado
        && docEmbarqueEncontrado.operadorAsignado.uid === currentUser.uid);
      const resultado = !coincide
        ? 'NO_COINCIDE_DOCUMENTO'
        : (!operadorCoincide ? 'NO_COINCIDE_OPERADOR' : 'COINCIDE');

      await firebase.firestore().collection('repositorio_mccain').doc(docEmbarqueEncontrado.id).update({
        recepcionOperador: {
          uid: currentUser.uid,
          nombre: userData.nombre || null,
          uuidCfdi: docDatosLeidos.uuid,
          rfcReceptor: docDatosLeidos.rfc,
          resultado: resultado,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }
      });
      document.getElementById('doc-modal').classList.add('hidden');
      docSoltarWakeLock();
      mostrarResultadoDoc(resultado);
      return;
    } else {
      const estatusValidacion = coincide ? 'VALIDADO' : 'DISCREPANCIA';
      const discrepanciaDetalle = coincide ? null : (
        docEmbarqueEncontrado.uuidEsperado !== docDatosLeidos.uuid
          ? 'UUID de CFDI no coincide con el esperado'
          : 'RFC receptor no coincide con el esperado'
      );
      await firebase.firestore().collection('repositorio_mccain').doc(docEmbarqueEncontrado.id).update({
        destinoEscaneo: {
          uuidCfdi: docDatosLeidos.uuid,
          rfcReceptor: docDatosLeidos.rfc,
          escaneadoPor: { uid: currentUser.uid },
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        },
        estatusValidacion: estatusValidacion,
        validadoPor: currentUser.uid,
        discrepanciaDetalle: discrepanciaDetalle
      });
    }

    document.getElementById('doc-modal').classList.add('hidden');
    docSoltarWakeLock();
    mostrarResultadoDoc(coincide);
  } catch (e) {
    document.getElementById('doc-modal-error').textContent = 'No se pudo registrar: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

// Acepta dos formas de "resultado" (Checkpoint 2 sigue siendo booleano —
// no se le agregó verificación de operador, solo Checkpoint 1 la tiene):
//   true / false                                     → Checkpoint 2 (pre-entrega)
//   'COINCIDE' / 'NO_COINCIDE_DOCUMENTO' / 'NO_COINCIDE_OPERADOR'
//                                                     → Checkpoint 1 (recepción)
function mostrarResultadoDoc(resultado) {
  const overlay = document.getElementById('doc-resultado');
  const icono = document.getElementById('doc-resultado-icono');
  const titulo = document.getElementById('doc-resultado-titulo');
  const detalle = document.getElementById('doc-resultado-detalle');
  const telefonos = document.getElementById('doc-resultado-telefonos');

  const esExito = resultado === true || resultado === 'COINCIDE';

  overlay.classList.remove('hidden', 'exito', 'discrepancia');
  overlay.classList.add(esExito ? 'exito' : 'discrepancia');
  icono.innerHTML = esExito ? DOC_ICONO_EXITO : DOC_ICONO_ALERTA;
  telefonos.innerHTML = '';

  if (docCheckpointActual === 'pre_entrega') {
    if (esExito) {
      titulo.textContent = 'DOCUMENTACIÓN CORRECTA';
      detalle.textContent = 'LA DOCUMENTACIÓN ESCANEADA ES LA CORRECTA, CONTINÚE. PRESÉNTESE CON EL ÁREA DE RECIBO O SEGURIDAD Y ENTREGUE SU DOCUMENTACIÓN, GRACIAS.';
    } else {
      titulo.textContent = '¡ALTO! NO PRESENTE LA DOCUMENTACIÓN';
      detalle.textContent = 'LA DOCUMENTACIÓN INTEGRADA ES INCORRECTA. USTED NO DEBE PRESENTARLA AL CLIENTE.\nREPÓRTESE INMEDIATAMENTE A DESPACHO.';
      telefonos.innerHTML =
        '<a class="doc-resultado-tel" href="tel:8672178357">📞 Despacho 24 horas: 867 217 8357</a>' +
        '<div style="color:#fff;font-size:13px;margin:10px 0 6px;opacity:0.9">Si no contesta:</div>' +
        '<a class="doc-resultado-tel" href="tel:8672742725">Cristian — 867 274 2725</a>' +
        '<a class="doc-resultado-tel" href="tel:8672064880">Daniel — 867 206 4880</a>' +
        '<a class="doc-resultado-tel" href="tel:8671160114">Juan Pablo — 867 116 0114</a>';
    }
  } else if (resultado === 'NO_COINCIDE_OPERADOR') {
    // Documento correcto, pero este embarque está asignado a otro operador
    // (nuevo, 2026-09-07) — es un error distinto a "documentación
    // incorrecta", así que trae su propio mensaje: no es un problema con la
    // factura, es que esta carga no le toca a quien está escaneando.
    titulo.textContent = 'ESTA CARGA NO TE CORRESPONDE';
    detalle.textContent = 'La factura es correcta, pero este embarque está asignado a otro operador. Verifica con Despacho antes de continuar.';
    telefonos.innerHTML =
      '<a class="doc-resultado-tel" href="tel:8672178357">📞 Despacho 24 horas: 867 217 8357</a>';
  } else {
    titulo.textContent = esExito ? 'Despacho registrado' : 'Despacho registrado — revisar';
    detalle.textContent = esExito
      ? 'La factura escaneada corresponde al embarque validado. Guarda bien la documentación.'
      : 'Se registró el despacho, pero hay una discrepancia con lo validado. Informa a un supervisor antes de continuar.';
  }

  docReproducirSonido(esExito ? 'exito' : 'discrepancia');
  docVibrar(esExito ? 'exito' : 'discrepancia');

  docDetenerAlarmaDoc();
  if (!esExito) {
    docAlarmaInterval = setInterval(function() {
      docReproducirSonido('discrepancia');
      docVibrar('discrepancia');
    }, 1400);
  }

  // Botón "Mostrar QR de intercambio" (nuevo, 2026-09-16): solo aparece
  // justo al completar Checkpoint 1 con éxito — es el momento en que ya se
  // sabe con certeza que este operador y este embarque quedaron validados.
  // docEmbarqueEncontrado todavía tiene el embarque aquí (cerrarResultadoDoc
  // es quien lo limpia, al cerrar esta pantalla).
  const qrBtn = document.getElementById('doc-resultado-qr-btn');
  if (qrBtn) {
    if (docCheckpointActual === 'recepcion' && resultado === 'COINCIDE' && docEmbarqueEncontrado) {
      const embarqueId = docEmbarqueEncontrado.id;
      qrBtn.classList.remove('hidden');
      qrBtn.onclick = function() { abrirQRIntercambio(embarqueId); };
    } else {
      qrBtn.classList.add('hidden');
      qrBtn.onclick = null;
    }
  }
}

function docDetenerAlarmaDoc() {
  if (docAlarmaInterval) { clearInterval(docAlarmaInterval); docAlarmaInterval = null; }
}

function cerrarResultadoDoc() {
  docDetenerAlarmaDoc();
  document.getElementById('doc-resultado').classList.add('hidden');
  const qrBtn = document.getElementById('doc-resultado-qr-btn');
  if (qrBtn) { qrBtn.classList.add('hidden'); qrBtn.onclick = null; }
  docCheckpointActual = null;
  docDatosLeidos = null;
  docEmbarqueEncontrado = null;
  // Si este checkpoint acaba de habilitar el QR de intercambio (o si había
  // uno vigente que ya se cerró con Checkpoint 2), la tarjeta en la
  // pestaña Documentación se actualiza sola — sin esperar a que el
  // operador la vuelva a abrir.
  cargarTarjetaQRIntercambio();
}

// ═══════════════════════════════════════════════════════════════
// EXCEPCIÓN — checkpoints QR/CFDI sin escaneo (McCain, SIN FACTURA)
// ═══════════════════════════════════════════════════════════════
// Decisión de Ivan (2026-09-12): botón auxiliar junto al de "Escanear QR"
// de cada checkpoint, solo para embarques SIN FACTURA (QR interno) cuando
// la cámara, la luz o la impresión no dejan escanear. El operador NO
// busca ni selecciona nada de entrada — la app encuentra el/los
// embarque(s) sin factura que Operaciones le asignó a ÉL y que siguen
// pendientes en ese checkpoint (normalmente uno solo). Aplica a los dos
// checkpoints, recepción y pre-entrega.
//
// El resultado de una excepción es siempre "correcto" (no hay documento
// real que comparar): la regla de Firestore (esRecepcionOperadorValida /
// esEscaneoDestinoValido) recalcula que el embarque en verdad sea
// SIN-FACTURA y que quien escribe sea de verdad el operadorAsignado antes
// de aceptar el write — esto de aquí solo arma los datos a enviar. Queda
// marcado con viaExcepcion:true (+ motivoExcepcion opcional) para
// auditoría, tanto en recepcionOperador como en destinoEscaneo.
let excCheckpointActual = null;      // 'recepcion' | 'pre_entrega'
let excEmbarqueSeleccionado = null;  // { id, ...datos de repositorio_mccain }
let excCandidatos = [];

async function abrirExcepcion(checkpoint) {
  excCheckpointActual = checkpoint;
  excEmbarqueSeleccionado = null;
  excCandidatos = [];
  document.getElementById('excepcion-modal-titulo').textContent =
    checkpoint === 'recepcion' ? 'Excepción · Checkpoint 1 · Despacho' : 'Excepción · Checkpoint 2 · Pre-entrega';
  document.getElementById('excepcion-modal-error').textContent = '';
  document.getElementById('excepcion-buscando').classList.remove('hidden');
  document.getElementById('excepcion-no-encontrado').classList.add('hidden');
  document.getElementById('excepcion-seleccion').classList.add('hidden');
  document.getElementById('excepcion-confirmar').classList.add('hidden');
  document.getElementById('excepcion-cancelar-wrap').classList.remove('hidden');
  document.getElementById('excepcion-modal').classList.remove('hidden');

  try {
    const snap = await firebase.firestore().collection('repositorio_mccain')
      .where('operadorAsignado.uid', '==', currentUser.uid)
      .where('receptorRFCEsperado', '==', 'SIN-FACTURA')
      .get();
    const todos = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    const pendientes = todos.filter(function(e) {
      return checkpoint === 'recepcion'
        ? !e.recepcionOperador
        : (e.estatusValidacion !== 'VALIDADO' && e.estatusValidacion !== 'DISCREPANCIA');
    });
    excCandidatos = pendientes;
    document.getElementById('excepcion-buscando').classList.add('hidden');

    if (pendientes.length === 0) {
      document.getElementById('excepcion-no-encontrado').classList.remove('hidden');
      document.getElementById('excepcion-cancelar-wrap').classList.add('hidden');
    } else if (pendientes.length === 1) {
      mostrarConfirmarExcepcion(pendientes[0]);
    } else {
      mostrarSeleccionExcepcion(pendientes);
    }
  } catch (e) {
    document.getElementById('excepcion-buscando').classList.add('hidden');
    document.getElementById('excepcion-modal-error').textContent = 'No se pudo buscar tu embarque: ' + e.message;
  }
}

function mostrarSeleccionExcepcion(lista) {
  document.getElementById('excepcion-seleccion').classList.remove('hidden');
  document.getElementById('excepcion-lista').innerHTML = lista.map(function(e, i) {
    return '<div class="doc-btn" onclick="mostrarConfirmarExcepcion(excCandidatos[' + i + '])">' +
      '<div class="doc-btn-text">' +
      '<div class="doc-btn-title">' + docEsc(e.shipment || e.ocCliente || e.id) + '</div>' +
      '<div class="doc-btn-sub">' + docEsc(e.clienteNombre || '—') + ' · Caja ' + docEsc(e.caja || '—') + '</div>' +
      '</div><span class="doc-btn-arrow">›</span></div>';
  }).join('');
}

function mostrarConfirmarExcepcion(embarque) {
  excEmbarqueSeleccionado = embarque;
  document.getElementById('excepcion-seleccion').classList.add('hidden');
  document.getElementById('excepcion-confirmar').classList.remove('hidden');
  document.getElementById('excepcion-info-embarque').innerHTML =
    '<strong>Shipment:</strong> ' + docEsc(embarque.shipment || '—') + '<br>' +
    '<strong>Cliente:</strong> ' + docEsc(embarque.clienteNombre || '—') + '<br>' +
    '<strong>OC Cliente:</strong> ' + docEsc(embarque.ocCliente || '—') + '<br>' +
    '<strong>Caja/remolque:</strong> ' + docEsc(embarque.caja || '—');
}

async function confirmarExcepcion() {
  if (!excEmbarqueSeleccionado) return;
  const btn = document.getElementById('excepcion-btn-confirmar');
  btn.disabled = true;
  const motivoSel = document.getElementById('excepcion-motivo');
  const motivo = motivoSel ? motivoSel.value : '';

  try {
    const embarque = excEmbarqueSeleccionado;
    if (excCheckpointActual === 'recepcion') {
      await firebase.firestore().collection('repositorio_mccain').doc(embarque.id).update({
        recepcionOperador: {
          uid: currentUser.uid,
          nombre: userData.nombre || null,
          uuidCfdi: embarque.uuidEsperado,
          rfcReceptor: embarque.receptorRFCEsperado,
          resultado: 'COINCIDE',
          viaExcepcion: true,
          motivoExcepcion: motivo || null,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }
      });
    } else {
      await firebase.firestore().collection('repositorio_mccain').doc(embarque.id).update({
        destinoEscaneo: {
          uuidCfdi: embarque.uuidEsperado,
          rfcReceptor: embarque.receptorRFCEsperado,
          escaneadoPor: { uid: currentUser.uid },
          viaExcepcion: true,
          motivoExcepcion: motivo || null,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        },
        estatusValidacion: 'VALIDADO',
        validadoPor: currentUser.uid,
        discrepanciaDetalle: null
      });
    }
    document.getElementById('excepcion-modal').classList.add('hidden');
    docCheckpointActual = excCheckpointActual; // para que mostrarResultadoDoc muestre el texto del checkpoint correcto
    mostrarResultadoDoc(excCheckpointActual === 'recepcion' ? 'COINCIDE' : true);
    const detalleEl = document.getElementById('doc-resultado-detalle');
    if (detalleEl) detalleEl.textContent += '\n(Registrado por excepción — sin escaneo de QR.)';
  } catch (e) {
    document.getElementById('excepcion-modal-error').textContent = 'No se pudo registrar la excepción: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

function cerrarExcepcion() {
  document.getElementById('excepcion-modal').classList.add('hidden');
  excCheckpointActual = null;
  excEmbarqueSeleccionado = null;
  excCandidatos = [];
}

// ═══════════════════════════════════════════════════════════════
// QR DE INTERCAMBIO — tarjeta en la pestaña Documentación
// ═══════════════════════════════════════════════════════════════
// Decisión de Ivan (2026-09-16): además del botón que aparece justo al
// completar Checkpoint 1 (ver mostrarResultadoDoc), se deja una tarjeta
// fija en Documentación para que el operador pueda volver a mostrar su QR
// de intercambio más tarde sin tener que re-escanear nada. Se muestra
// mientras el embarque siga "abierto" con la misma definición que ya usa
// Operaciones del lado de ADREMATASA (un operador, un embarque abierto a
// la vez): Checkpoint 1 en COINCIDE y Checkpoint 2 (pre-entrega) todavía
// sin completar. En cuanto se registra la pre-entrega, la tarjeta
// desaparece sola.
let tarjetaQRIntercambioEmbarque = null;

// Checkpoint 2 (pre-entrega) no debe estar disponible mientras Checkpoint 1
// no se haya completado para el embarque abierto del operador (pedido de
// Ivan, 2026-09-16). checkpoint2Habilitado se recalcula cada vez que corre
// cargarTarjetaQRIntercambio() — mismo criterio ("listos", abajo) que ya
// decide si se muestra la tarjeta de "Mostrar QR de intercambio": recepción
// en COINCIDE y pre-entrega todavía sin registrar. Arranca en false (igual
// que el HTML, que ya carga el botón visualmente deshabilitado) para que,
// si esta consulta tarda o falla, el botón se quede bloqueado en vez de
// quedar disponible por default.
// NOTA — alcance decidido con Ivan (2026-09-16): esto es solo un candado de
// UI para evitar el toque accidental. No revisa que el embarque sea del
// operador que escanea en Checkpoint 2 (ese hueco existe desde antes, ver
// nota en docManejarLectura/confirmarRegistroDoc) ni cierra el acceso por
// "Excepción" en embarques sin factura — ambos quedaron fuera de alcance
// por ahora, a propósito.
let checkpoint2Habilitado = false;

function actualizarDisponibilidadCheckpoint2(habilitado) {
  checkpoint2Habilitado = habilitado;
  const btn = document.getElementById('doc-btn-checkpoint2');
  const sub = document.getElementById('doc-checkpoint2-sub');
  if (!btn) return;
  if (habilitado) {
    btn.classList.remove('doc-btn-disabled');
    if (sub) sub.textContent = 'Antes de presentarte con el cliente, vuelve a escanear el QR de la factura.';
  } else {
    btn.classList.add('doc-btn-disabled');
    if (sub) sub.textContent = 'Disponible después de completar el Checkpoint 1 de tu embarque asignado.';
  }
}

async function cargarTarjetaQRIntercambio() {
  if (!currentUser) return;
  try {
    const asignados = await buscarEmbarquesAsignados();
    const listos = asignados.filter(function(e) {
      return e.recepcionOperador && e.recepcionOperador.resultado === 'COINCIDE'
        && e.estatusValidacion !== 'VALIDADO' && e.estatusValidacion !== 'DISCREPANCIA';
    });
    actualizarDisponibilidadCheckpoint2(listos.length > 0);

    const cont = document.getElementById('doc-qr-intercambio-tarjeta');
    if (!cont) return;
    if (listos.length === 0) {
      tarjetaQRIntercambioEmbarque = null;
      cont.innerHTML = '';
      cont.classList.add('hidden');
      return;
    }
    tarjetaQRIntercambioEmbarque = listos[0];
    cont.innerHTML =
      '<p class="section-label">Intercambio</p>' +
      '<div class="doc-btn" onclick="abrirQRIntercambio(tarjetaQRIntercambioEmbarque.id)">' +
      '<span class="doc-btn-icon">🔑</span>' +
      '<div class="doc-btn-text">' +
      '<div class="doc-btn-title">Mostrar QR de intercambio</div>' +
      '<div class="doc-btn-sub">' + docEsc(tarjetaQRIntercambioEmbarque.shipment || tarjetaQRIntercambioEmbarque.id) + ' — muéstralo al intercambista en el portón.</div>' +
      '</div><span class="doc-btn-arrow">›</span></div>';
    cont.classList.remove('hidden');
  } catch (e) {
    // No es crítico: si falla, simplemente no se muestra/actualiza la
    // tarjeta — el botón de la pantalla de éxito del checkpoint (que no
    // depende de esta consulta) sigue funcionando igual.
    console.warn('No se pudo cargar la tarjeta de QR de intercambio:', e.message);
  }
}