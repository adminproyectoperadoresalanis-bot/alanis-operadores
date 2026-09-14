// AUTOTRANSPORTES ALANÍS — Lógica del operador v2

let currentUser = null;
let userData    = null;
let selectedStatus = null;
let selectedFallas = new Set();
let toastTimer  = null;

firebase.auth().onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;

  const doc = await firebase.firestore().collection('usuarios').doc(user.uid).get();
  if (!doc.exists) { doLogout(); return; }
  userData = doc.data();

  if (userData.rol === 'admin' || userData.rol === 'supervisor') {
    window.location.href = 'admin.html'; return;
  }

  document.getElementById('header-sub').textContent = 'Operador: ' + userData.nombre;
  setFecha();
  buildStatusList();
  verificarReporteHoy();
  renderFallas();
  cargarHistorial();
  cargarMisOTs();

  if (localStorage.getItem('darkMode') === '1') toggleDark();
});

function setFecha() {
  const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  document.getElementById('fecha-hoy').textContent =
    new Date().toLocaleDateString('es-MX', opts);
}

function switchTab(tab) {
  ['reporte','ot','historial'].forEach(t => {
    document.getElementById('tab-' + t).classList.add('hidden');
    document.getElementById('nav-' + t).classList.remove('active');
  });
  document.getElementById('tab-' + tab).classList.remove('hidden');
  document.getElementById('nav-' + tab).classList.add('active');
}

function toggleDark() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? '1' : '0');
}

function doLogout() {
  firebase.auth().signOut().then(() => window.location.href = 'index.html');
}

const STATUSES = [
  { id:'disponible',   label:'Disponible',          desc:'Listo para operar hoy',         color:'#639922' },
  { id:'taller',       label:'Taller',               desc:'Unidad en mantenimiento',        color:'#BA7517' },
  { id:'enfermo',      label:'Enfermo',              desc:'Incapacidad medica temporal',    color:'#E24B4A' },
  { id:'permiso',      label:'Solicitud de permiso', desc:'Permiso personal',               color:'#378ADD' },
  { id:'incapacitado', label:'Incapacitado',         desc:'Incapacidad formal IMSS',        color:'#888780' },
];

function buildStatusList() {
  document.getElementById('status-list').innerHTML = STATUSES.map(s =>
    '<div class="status-option" id="opt-' + s.id + '" onclick="selectStatus(\'' + s.id + '\')">' +
    '<span class="status-dot" style="background:' + s.color + '"></span>' +
    '<div><div class="status-label">' + s.label + '</div><div class="status-desc">' + s.desc + '</div></div>' +
    '<div class="radio-circle"></div></div>'
  ).join('');
}

function selectStatus(id) {
  selectedStatus = id;
  document.querySelectorAll('.status-option').forEach(el => el.classList.remove('selected'));
  document.getElementById('opt-' + id).classList.add('selected');
}

async function verificarReporteHoy() {
  const hoy = getFechaLocal();
  const snap = await firebase.firestore().collection('reportes')
    .where('uid', '==', currentUser.uid)
    .where('fecha', '==', hoy)
    .limit(1).get();

  if (!snap.empty) {
    document.getElementById('ya-reportado').classList.remove('hidden');
    document.getElementById('btn-reporte').disabled = true;
    document.getElementById('btn-reporte').textContent = 'Reporte enviado';
    document.querySelectorAll('.status-option').forEach(el => el.style.pointerEvents = 'none');
    selectStatus(snap.docs[0].data().estatus);
  }
}

function getFechaLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function getHoraLocal() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

async function enviarReporte() {
  if (!selectedStatus) {
    showToast('Selecciona un estatus antes de enviar', true); return;
  }
  const btn = document.getElementById('btn-reporte');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const hoy  = getFechaLocal();
  const hora = getHoraLocal();

  try {
    await firebase.firestore().collection('reportes').add({
      uid:       currentUser.uid,
      operador:  userData.nombre,
      numero:    userData.numero || '',
      estatus:   selectedStatus,
      fecha:     hoy,
      hora:      hora,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    btn.textContent = 'Reporte enviado';
    document.getElementById('ya-reportado').classList.remove('hidden');
    document.querySelectorAll('.status-option').forEach(el => el.style.pointerEvents = 'none');
    const lbl = STATUSES.find(s => s.id === selectedStatus).label;
    showToast('Reporte enviado — Estatus: ' + lbl);
    cargarHistorial();
  } catch(e) {
    btn.disabled = false;
    btn.textContent = 'Enviar reporte de disponibilidad';
    showToast('Error al enviar. Intenta de nuevo.', true);
    console.error(e);
  }
}

function renderFallas() {
  const q = (document.getElementById('search-falla') ? document.getElementById('search-falla').value : '').toLowerCase();
  const filtered = FALLAS.filter(function(f) {
    return f.name.toLowerCase().includes(q) || f.cat.toLowerCase().includes(q);
  });
  const SEVMAP = { alta:'sev-alta', media:'sev-media', baja:'sev-baja' };
  const SEVLBL = { alta:'Alta', media:'Media', baja:'Baja' };
  document.getElementById('falla-list').innerHTML = filtered.length
    ? filtered.map(function(f) {
        return '<div class="falla-item ' + (selectedFallas.has(f.id) ? 'checked' : '') + '" id="fi-' + f.id + '" onclick="toggleFalla(' + f.id + ')">' +
          '<div class="falla-checkbox"></div>' +
          '<div><div class="falla-cat">' + f.cat + '</div><div class="falla-name">' + f.name + '</div></div>' +
          '<span class="sev-badge ' + SEVMAP[f.sev] + '">' + SEVLBL[f.sev] + '</span>' +
          '</div>';
      }).join('')
    : '<p class="text-muted" style="text-align:center;padding:20px">Sin resultados</p>';
}

function toggleFalla(id) {
  if (selectedFallas.has(id)) { selectedFallas.delete(id); } else { selectedFallas.add(id); }
  updateFallaUI();
  renderFallas();
}

function updateFallaUI() {
  const count = selectedFallas.size;
  document.getElementById('falla-count').textContent = count;
  const badge = document.getElementById('ot-badge');
  if (count > 0) { badge.classList.remove('hidden'); badge.textContent = count; }
  else { badge.classList.add('hidden'); }

  const box  = document.getElementById('selected-tags-box');
  const wrap = document.getElementById('selected-tags');
  if (count > 0) {
    box.classList.remove('hidden');
    wrap.innerHTML = Array.from(selectedFallas).map(function(id) {
      const f = FALLAS.find(function(x) { return x.id === id; });
      return f ? '<span class="tag" onclick="toggleFalla(' + id + ')">x ' + f.name + '</span>' : '';
    }).join('');
  } else { box.classList.add('hidden'); }
}

async function enviarOT() {
  if (selectedFallas.size === 0) {
    showToast('Selecciona al menos una falla', true); return;
  }
  const btn = document.getElementById('btn-ot');
  btn.disabled = true;
  btn.textContent = 'Creando...';

  const folio = 'OT-' + String(Math.floor(Math.random() * 90000) + 10000);
  const fallasArr = Array.from(selectedFallas).map(function(id) {
    return FALLAS.find(function(f) { return f.id === id; });
  }).filter(Boolean);

  try {
    await firebase.firestore().collection('ordenes_trabajo').add({
      uid:       currentUser.uid,
      operador:  userData.nombre,
      numero:    userData.numero || '',
      unidad:    userData.numero || 'Sin asignar',
      folio:     folio,
      fallas:    fallasArr,
      estado:    'pendiente',
      fecha:     getFechaLocal(),
      hora:      getHoraLocal(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(folio + ' creada con ' + fallasArr.length + ' falla(s)');
    selectedFallas.clear();
    document.getElementById('search-falla').value = '';
    updateFallaUI();
    renderFallas();
    cargarMisOTs();
  } catch(e) {
    showToast('Error al crear la OT. Intenta de nuevo.', true);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear orden de trabajo';
  }
}

async function cargarHistorial() {
  try {
    const snap = await firebase.firestore().collection('reportes')
      .where('uid', '==', currentUser.uid)
      .orderBy('timestamp', 'desc')
      .limit(15).get();

    const DOT = { disponible:'#639922', taller:'#BA7517', enfermo:'#E24B4A', permiso:'#378ADD', incapacitado:'#888780' };
    const LBL = { disponible:'Disponible', taller:'Taller', enfermo:'Enfermo', permiso:'Permiso', incapacitado:'Incapacitado' };

    const el = document.getElementById('historial-list');
    if (snap.empty) {
      el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px">Sin reportes aun.</p>';
      return;
    }
    el.innerHTML = snap.docs.map(function(d) {
      const r = d.data();
      const fecha = r.fecha || '—';
      const hora  = r.hora  || '—';
      return '<div class="historial-item">' +
        '<div class="historial-fecha">' + fecha + ' ' + hora + '</div>' +
        '<div class="historial-status">' +
        '<span class="historial-dot" style="background:' + (DOT[r.estatus] || '#888') + '"></span>' +
        '<span style="font-size:14px;font-weight:600;color:var(--text-primary)">' + (LBL[r.estatus] || r.estatus) + '</span>' +
        '</div></div>';
    }).join('');
  } catch(e) { console.error('Error historial:', e); }
}

async function cargarMisOTs() {
  try {
    const snap = await firebase.firestore().collection('ordenes_trabajo')
      .where('uid', '==', currentUser.uid)
      .orderBy('timestamp', 'desc')
      .limit(10).get();

    const el = document.getElementById('mis-ots');
    if (snap.empty) {
      el.innerHTML = '<p class="text-muted" style="text-align:center;padding:16px">Sin ordenes de trabajo aun.</p>';
      return;
    }
    const ESTADO = { pendiente:'Pendiente', en_proceso:'En proceso', resuelto:'Resuelto' };
    el.innerHTML = snap.docs.map(function(d) {
      const o = d.data();
      return '<div class="ot-folio-item">' +
        '<div>' +
        '<div class="ot-folio-num">' + o.folio + '</div>' +
        '<div class="ot-folio-date">' + (o.fecha || '—') + ' ' + (o.hora || '') + ' — Unidad: ' + o.unidad + '</div>' +
        '<div class="ot-folio-count">' + (o.fallas ? o.fallas.length : 0) + ' falla(s) — ' + (ESTADO[o.estado] || o.estado) + '</div>' +
        '</div></div>';
    }).join('');
  } catch(e) { console.error('Error OTs:', e); }
}

function showToast(msg, warn) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.className = 'toast' + (warn ? ' toast-warn' : '');
  void t.offsetWidth;
  t.classList.add('show');
  if (toastTimer) { clearTimeout(toastTimer); }
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 3500);
}
