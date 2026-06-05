// ============================================================
// AUTOTRANSPORTES ALANÍS — Lógica del operador
// ============================================================

let currentUser = null;
let userData    = null;
let selectedStatus = null;
let selectedFallas = new Set();
let toastTimer  = null;

// ---------- INICIALIZACIÓN ----------
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;

  // Cargar datos del usuario
  const doc = await db.collection('usuarios').doc(user.uid).get();
  if (!doc.exists) { doLogout(); return; }
  userData = doc.data();

  // Si es admin, redirigir
  if (userData.rol === 'admin' || userData.rol === 'supervisor') {
    window.location.href = 'admin.html'; return;
  }

  // Inicializar UI
  document.getElementById('header-sub').textContent = `Operador: ${userData.nombre}`;
  setFecha();
  buildStatusList();
  verificarReporteHoy();
  renderFallas();
  cargarHistorial();
  cargarMisOTs();

  // Modo oscuro guardado
  if (localStorage.getItem('darkMode') === '1') toggleDark();
});

// ---------- FECHA ----------
function setFecha() {
  const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  document.getElementById('fecha-hoy').textContent =
    new Date().toLocaleDateString('es-MX', opts);
}

// ---------- TABS ----------
function switchTab(tab) {
  ['reporte','ot','historial'].forEach(t => {
    document.getElementById('tab-' + t).classList.add('hidden');
    document.getElementById('nav-' + t).classList.remove('active');
  });
  document.getElementById('tab-' + tab).classList.remove('hidden');
  document.getElementById('nav-' + tab).classList.add('active');
}

// ---------- DARK MODE ----------
function toggleDark() {
  document.body.classList.toggle('dark-mode');
  const on = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', on ? '1' : '0');
}

// ---------- LOGOUT ----------
function doLogout() {
  auth.signOut().then(() => window.location.href = 'index.html');
}

// ---------- STATUS LIST ----------
const STATUSES = [
  { id:'disponible',   label:'Disponible',          desc:'Listo para operar hoy',          color:'#639922' },
  { id:'taller',       label:'Taller',               desc:'Unidad en mantenimiento',        color:'#BA7517' },
  { id:'enfermo',      label:'Enfermo',              desc:'Incapacidad médica temporal',    color:'#E24B4A' },
  { id:'permiso',      label:'Solicitud de permiso', desc:'Permiso personal',               color:'#378ADD' },
  { id:'incapacitado', label:'Incapacitado',         desc:'Incapacidad formal IMSS',        color:'#888780' },
];

function buildStatusList() {
  document.getElementById('status-list').innerHTML = STATUSES.map(s => `
    <div class="status-option" id="opt-${s.id}" onclick="selectStatus('${s.id}')">
      <span class="status-dot" style="background:${s.color}"></span>
      <div>
        <div class="status-label">${s.label}</div>
        <div class="status-desc">${s.desc}</div>
      </div>
      <div class="radio-circle"></div>
    </div>`).join('');
}

function selectStatus(id) {
  selectedStatus = id;
  document.querySelectorAll('.status-option').forEach(el => el.classList.remove('selected'));
  document.getElementById('opt-' + id).classList.add('selected');
}

// ---------- VERIFICAR SI YA REPORTÓ HOY ----------
async function verificarReporteHoy() {
  const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const snap = await db.collection('reportes')
    .where('uid', '==', currentUser.uid)
    .where('fecha', '==', hoy)
    .limit(1).get();

  if (!snap.empty) {
    document.getElementById('ya-reportado').classList.remove('hidden');
    document.getElementById('btn-reporte').disabled = true;
    document.querySelectorAll('.status-option').forEach(el => el.style.pointerEvents = 'none');
    const r = snap.docs[0].data();
    const s = STATUSES.find(x => x.id === r.estatus);
    if (s) selectStatus(r.estatus);
  }
}

// ---------- ENVIAR REPORTE ----------
async function enviarReporte() {
  if (!selectedStatus) {
    showToast('Selecciona un estatus antes de enviar', true); return;
  }
  const btn = document.getElementById('btn-reporte');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const hoy = new Date().toISOString().split('T')[0];
  try {
    await db.collection('reportes').add({
      uid:       currentUser.uid,
      operador:  userData.nombre,
      numero:    userData.numero || '',
      estatus:   selectedStatus,
      fecha:     hoy,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    document.getElementById('ya-reportado').classList.remove('hidden');
    document.querySelectorAll('.status-option').forEach(el => el.style.pointerEvents = 'none');
    const lbl = STATUSES.find(s => s.id === selectedStatus).label;
    showToast(`Reporte enviado — Estatus: ${lbl}`);
    cargarHistorial();
  } catch(e) {
    btn.disabled = false;
    btn.innerHTML = 'Enviar reporte de disponibilidad';
    showToast('Error al enviar. Intenta de nuevo.', true);
  }
}

// ---------- CATÁLOGO DE FALLAS ----------
function renderFallas() {
  const q = (document.getElementById('search-falla')?.value || '').toLowerCase();
  const filtered = FALLAS.filter(f =>
    f.name.toLowerCase().includes(q) || f.cat.toLowerCase().includes(q)
  );
  const SEV = { alta:'sev-alta Alta', media:'sev-media Media', baja:'sev-baja Baja' };
  document.getElementById('falla-list').innerHTML = filtered.length
    ? filtered.map(f => {
        const [cls, lbl] = SEV[f.sev].split(' ');
        return `<div class="falla-item ${selectedFallas.has(f.id)?'checked':''}" id="fi-${f.id}" onclick="toggleFalla(${f.id})">
          <div class="falla-checkbox"></div>
          <div><div class="falla-cat">${f.cat}</div><div class="falla-name">${f.name}</div></div>
          <span class="sev-badge ${cls}">${lbl}</span>
        </div>`;
      }).join('')
    : '<p class="text-muted" style="text-align:center;padding:20px">Sin resultados</p>';
}

function toggleFalla(id) {
  selectedFallas.has(id) ? selectedFallas.delete(id) : selectedFallas.add(id);
  updateFallaUI();
  renderFallas();
}

function updateFallaUI() {
  const count = selectedFallas.size;
  document.getElementById('falla-count').textContent = count;
  const badge = document.getElementById('ot-badge');
  if (count > 0) { badge.classList.remove('hidden'); badge.textContent = count; }
  else badge.classList.add('hidden');

  const box  = document.getElementById('selected-tags-box');
  const wrap = document.getElementById('selected-tags');
  if (count > 0) {
    box.classList.remove('hidden');
    wrap.innerHTML = [...selectedFallas].map(id => {
      const f = FALLAS.find(x => x.id === id);
      return f ? `<span class="tag" onclick="toggleFalla(${id})">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ${f.name}
      </span>` : '';
    }).join('');
  } else box.classList.add('hidden');
}

// ---------- ENVIAR OT ----------
async function enviarOT() {
  if (selectedFallas.size === 0) {
    showToast('Selecciona al menos una falla', true); return;
  }
  const unidad = document.getElementById('ot-unidad').value.trim();
  if (!unidad) {
    showToast('Ingresa el número económico de la unidad', true); return;
  }

  const btn = document.getElementById('btn-ot');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const folio = 'OT-' + String(Math.floor(Math.random() * 90000) + 10000);
  const fallasArr = [...selectedFallas].map(id => FALLAS.find(f => f.id === id)).filter(Boolean);

  try {
    await db.collection('ordenes_trabajo').add({
      uid:       currentUser.uid,
      operador:  userData.nombre,
      numero:    userData.numero || '',
      unidad:    unidad,
      folio:     folio,
      fallas:    fallasArr,
      estado:    'pendiente',
      fecha:     new Date().toISOString().split('T')[0],
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`${folio} creada — ${fallasArr.length} falla(s)`);
    selectedFallas.clear();
    document.getElementById('search-falla').value = '';
    document.getElementById('ot-unidad').value = '';
    updateFallaUI();
    renderFallas();
    cargarMisOTs();
  } catch(e) {
    showToast('Error al crear la OT. Intenta de nuevo.', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Crear orden de trabajo';
  }
}

// ---------- HISTORIAL ----------
async function cargarHistorial() {
  const snap = await db.collection('reportes')
    .where('uid', '==', currentUser.uid)
    .orderBy('timestamp', 'desc')
    .limit(15).get();

  const DOT = { disponible:'#639922', taller:'#BA7517', enfermo:'#E24B4A', permiso:'#378ADD', incapacitado:'#888780' };
  const LBL = { disponible:'Disponible', taller:'Taller', enfermo:'Enfermo', permiso:'Permiso', incapacitado:'Incapacitado' };

  const el = document.getElementById('historial-list');
  if (snap.empty) { el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px">Sin reportes aún.</p>'; return; }

  el.innerHTML = snap.docs.map(d => {
    const r = d.data();
    const fecha = r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short', year:'numeric' }) : '—';
    return `<div class="historial-item">
      <div class="historial-fecha">${fecha}</div>
      <div class="historial-status">
        <span class="historial-dot" style="background:${DOT[r.estatus]||'#888'}"></span>
        <span style="font-size:14px;font-weight:600;color:var(--text-primary)">${LBL[r.estatus]||r.estatus}</span>
      </div>
    </div>`;
  }).join('');
}

// ---------- MIS OTS ----------
async function cargarMisOTs() {
  const snap = await db.collection('ordenes_trabajo')
    .where('uid', '==', currentUser.uid)
    .orderBy('timestamp', 'desc')
    .limit(10).get();

  const el = document.getElementById('mis-ots');
  if (snap.empty) { el.innerHTML = '<p class="text-muted" style="text-align:center;padding:16px">Sin órdenes de trabajo aún.</p>'; return; }

  const ESTADO = { pendiente:'🟡 Pendiente', en_proceso:'🔵 En proceso', resuelto:'🟢 Resuelto' };
  el.innerHTML = snap.docs.map(d => {
    const o = d.data();
    const fecha = o.fecha ? new Date(o.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' }) : '—';
    return `<div class="ot-folio-item">
      <div>
        <div class="ot-folio-num">${o.folio}</div>
        <div class="ot-folio-date">${fecha} — Unidad: ${o.unidad}</div>
        <div class="ot-folio-count">${o.fallas?.length || 0} falla(s) — ${ESTADO[o.estado] || o.estado}</div>
      </div>
    </div>`;
  }).join('');
}

// ---------- TOAST ----------
function showToast(msg, warn = false) {
  const t   = document.getElementById('toast');
  const svg = t.querySelector('svg');
  document.getElementById('toast-msg').textContent = msg;
  t.className = 'toast' + (warn ? ' toast-warn' : '');
  void t.offsetWidth;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
