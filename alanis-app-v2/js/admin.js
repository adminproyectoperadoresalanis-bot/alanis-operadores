// AUTOTRANSPORTES ALANÍS — Panel de administración v2

let todosReportes = [];
let todasOTs      = [];
let totalOps      = 0;
let toastTimer    = null;

firebase.auth().onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  const doc = await firebase.firestore().collection('usuarios').doc(user.uid).get();
  if (!doc.exists || (doc.data().rol !== 'admin' && doc.data().rol !== 'supervisor')) {
    window.location.href = 'operador.html'; return;
  }
  if (localStorage.getItem('darkMode') === '1') toggleDark();
  setFechaAdmin();
  cargarReportesHoy();
  cargarOTs();
  cargarTotalOperadores();
  cargarSolicitudes();
});

function setFechaAdmin() {
  document.getElementById('fecha-admin').textContent =
    new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
}

function switchTab(tab) {
  ['dashboard','ots','solicitudes'].forEach(t => {
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

async function cargarTotalOperadores() {
  const snap = await firebase.firestore().collection('usuarios').where('rol', '==', 'operador').get();
  totalOps = snap.size;
  actualizarStats();
}

async function cargarReportesHoy() {
  const hoy = new Date().toISOString().split('T')[0];
  const snap = await firebase.firestore().collection('reportes')
    .where('fecha', '==', hoy)
    .orderBy('timestamp', 'desc').get();
  todosReportes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  actualizarStats();
  renderReportes('todos');
}

function actualizarStats() {
  const disponibles = todosReportes.filter(r => r.estatus === 'disponible').length;
  const incidencias = todosReportes.filter(r => r.estatus !== 'disponible').length;
  const sinReporte  = Math.max(0, totalOps - todosReportes.length);
  document.getElementById('cnt-disponible').textContent = disponibles;
  document.getElementById('cnt-incidencia').textContent = incidencias;
  document.getElementById('cnt-sinreporte').textContent = sinReporte;
  document.getElementById('cnt-total').textContent      = totalOps || '—';
}

const BADGE_CLS = { disponible:'badge-disponible', taller:'badge-taller', enfermo:'badge-enfermo', permiso:'badge-permiso', incapacitado:'badge-incapacitado' };
const BADGE_LBL = { disponible:'Disponible', taller:'Taller', enfermo:'Enfermo', permiso:'Permiso', incapacitado:'Incapacitado' };

function filterReportes(tipo, btn) {
  document.querySelectorAll('#tab-dashboard .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderReportes(tipo);
}

function renderReportes(tipo) {
  const INCIDENCIAS = ['taller','enfermo','permiso','incapacitado'];
  let lista = todosReportes;
  if (tipo === 'disponible') lista = todosReportes.filter(r => r.estatus === 'disponible');
  if (tipo === 'incidencia') lista = todosReportes.filter(r => INCIDENCIAS.includes(r.estatus));
  const el = document.getElementById('reportes-list');
  if (lista.length === 0) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:24px">Sin reportes en esta categoría.</p>';
    return;
  }
  el.innerHTML = lista.map(r => {
    const initials = (r.operador||'OP').split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
    return `<div class="card">
      <div class="op-row" style="padding:0;border:none">
        <div class="op-avatar">${initials}</div>
        <div><div class="op-name">${r.operador||'—'}</div><div class="op-sub">${r.numero||''}</div></div>
        <span class="badge ${BADGE_CLS[r.estatus]||''}">${BADGE_LBL[r.estatus]||r.estatus}</span>
      </div>
    </div>`;
  }).join('');
}

async function cargarOTs() {
  const snap = await firebase.firestore().collection('ordenes_trabajo').orderBy('timestamp', 'desc').limit(50).get();
  todasOTs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const pendientes = todasOTs.filter(o => o.estado === 'pendiente').length;
  const badge = document.getElementById('ots-badge');
  if (pendientes > 0) { badge.classList.remove('hidden'); badge.textContent = pendientes; }
  renderOTs('todos');
}

function filterOTs(tipo, btn) {
  document.querySelectorAll('#tab-ots .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOTs(tipo);
}

function renderOTs(tipo) {
  const lista = tipo === 'todos' ? todasOTs : todasOTs.filter(o => o.estado === tipo);
  const el = document.getElementById('ots-list');
  if (lista.length === 0) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:24px">Sin órdenes en esta categoría.</p>';
    return;
  }
  const ESTADO_LBL = { pendiente:'🟡 Pendiente', en_proceso:'🔵 En proceso', resuelto:'🟢 Resuelto' };
  el.innerHTML = lista.map(o => {
    const fecha = o.fecha ? new Date(o.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'}) : '—';
    const fallasHtml = (o.fallas||[]).slice(0,5).map(f =>
      `<div style="font-size:12px;color:var(--text-secondary);padding:3px 0;border-bottom:0.5px solid var(--border)">• ${f.name} <span class="sev-badge sev-${f.sev}">${f.sev==='alta'?'Alta':f.sev==='media'?'Media':'Baja'}</span></div>`
    ).join('');
    const masLabel = (o.fallas?.length||0) > 5 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">+${o.fallas.length-5} más...</div>` : '';
    return `<div class="card">
      <div class="row-between">
        <span style="font-size:15px;font-weight:700;color:var(--brand-light)">${o.folio}</span>
        <span style="font-size:12px">${ESTADO_LBL[o.estado]||o.estado}</span>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin:4px 0 8px">${o.operador} — Unidad: ${o.unidad} — ${fecha}</div>
      <div>${fallasHtml}${masLabel}</div>
      <div class="row mt-8" style="gap:6px">
        <button onclick="cambiarEstadoOT('${o.id}','en_proceso')" class="btn-secondary" style="padding:7px;font-size:12px">En proceso</button>
        <button onclick="cambiarEstadoOT('${o.id}','resuelto')" class="btn-primary" style="padding:7px;font-size:12px">Marcar resuelta</button>
      </div>
    </div>`;
  }).join('');
}

async function cambiarEstadoOT(id, nuevoEstado) {
  try {
    await firebase.firestore().collection('ordenes_trabajo').doc(id).update({ estado: nuevoEstado });
    showToast(`OT marcada como: ${nuevoEstado === 'en_proceso' ? 'En proceso' : 'Resuelta'}`);
    cargarOTs();
  } catch(e) {
    showToast('Error al actualizar. Intenta de nuevo.', true);
  }
}

async function cargarSolicitudes() {
  const snap = await firebase.firestore().collection('solicitudes')
    .where('estado', '==', 'pendiente')
    .orderBy('timestamp', 'desc').get();
  const badge = document.getElementById('sol-badge');
  if (snap.size > 0) { badge.classList.remove('hidden'); badge.textContent = snap.size; }
  else badge.classList.add('hidden');
  renderSolicitudes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

function renderSolicitudes(lista) {
  const el = document.getElementById('solicitudes-list');
  if (lista.length === 0) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:24px">No hay solicitudes pendientes.</p>';
    return;
  }
  el.innerHTML = lista.map(s => {
    const fecha = s.timestamp?.toDate
      ? s.timestamp.toDate().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : '—';
    const initials = (s.nombre||'OP').split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
    return `<div class="card" id="sol-${s.id}">
      <div class="op-row" style="padding:0;border:none;margin-bottom:12px">
        <div class="op-avatar">${initials}</div>
        <div>
          <div class="op-name">${s.nombre||'Sin nombre'}</div>
          <div class="op-sub">${s.correo||'—'}</div>
          <div class="op-sub">${fecha}</div>
        </div>
        <span class="badge" style="background:#FAEEDA;color:#633806">🟡 Pendiente</span>
      </div>
      <div class="form-group">
        <label>Número económico (opcional)</label>
        <input type="text" id="num-${s.id}" placeholder="Ej: OP-1021" style="font-size:14px"/>
      </div>
      <div class="row" style="gap:8px">
        <button onclick="rechazarSolicitud('${s.id}')" class="btn-secondary" style="padding:10px;font-size:13px;flex:1">✕ Rechazar</button>
        <button onclick="aprobarSolicitud('${s.id}','${s.correo}','${s.nombre}')" class="btn-primary" style="padding:10px;font-size:13px;flex:1">✓ Aprobar acceso</button>
      </div>
    </div>`;
  }).join('');
}

async function aprobarSolicitud(uid, correo, nombre) {
  const numero = document.getElementById('num-' + uid)?.value.trim() || '';
  try {
    await firebase.firestore().collection('usuarios').doc(uid).set({
      nombre, correo, numero, rol: 'operador', activo: true,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await firebase.firestore().collection('solicitudes').doc(uid).update({ estado: 'aprobado' });
    showToast(`✅ ${nombre} aprobado como operador`);
    cargarSolicitudes();
    cargarTotalOperadores();
  } catch(e) {
    showToast('Error al aprobar. Intenta de nuevo.', true);
  }
}

async function rechazarSolicitud(uid) {
  try {
    await firebase.firestore().collection('solicitudes').doc(uid).update({ estado: 'rechazado' });
    showToast('Solicitud rechazada');
    cargarSolicitudes();
  } catch(e) {
    showToast('Error al rechazar. Intenta de nuevo.', true);
  }
}

function exportarExcel() {
  if (todosReportes.length === 0) { showToast('No hay reportes para exportar', true); return; }
  const hoy = new Date().toISOString().split('T')[0];
  const rows = [['Operador','Número','Estatus','Fecha']];
  todosReportes.forEach(r => rows.push([r.operador, r.numero, r.estatus, r.fecha]));
  const csv = rows.map(r => r.map(c => `"${c||''}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `reporte-alanis-${hoy}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Exportación descargada');
}

function showToast(msg, warn = false) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.className = 'toast' + (warn ? ' toast-warn' : '');
  void t.offsetWidth;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
