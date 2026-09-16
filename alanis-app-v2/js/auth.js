// AUTOTRANSPORTES ALANIS - Auth v18
// Cambio (2026-09-15): en móvil, signInWithPopup es poco confiable
// (auth/popup-closed-by-user, auth/operation-not-supported-in-this-environment)
// porque el SO puede interrumpir el popup. Ahora en móvil usamos
// signInWithRedirect directamente, y getRedirectResult() recoge el
// resultado al volver. En escritorio se mantiene el popup, con más
// códigos de error cubiertos como respaldo hacia redirect.
// Cambio (2026-09-16): en algunos Android, al volver de Google el
// signInWithRedirect no dispara onAuthStateChanged ni un error en
// getRedirectResult() — simplemente no pasa nada y el operador se queda
// viendo el login sin explicación. Ahora: (1) getRedirectResult() también
// dispara la verificación directamente si trae usuario, sin depender solo
// de onAuthStateChanged, y (2) si volvemos de un redirect y no se
// resuelve nada en 10 segundos, se le avisa al operador que intente de
// nuevo.

let verificando = false;
let redirectTimeoutId = null;

function esMovil() {
  return /Android|iPhone|iPad|iPod|Mobile|webOS/i.test(navigator.userAgent);
}

function mostrarErrorLogin(mensaje) {
  document.getElementById('loading').classList.remove('show');
  document.getElementById('btn-google').disabled = false;
  document.getElementById('login-error').innerHTML = mensaje;
  document.getElementById('login-error').style.display = 'block';
}

function cancelarEsperaRedirect() {
  if (redirectTimeoutId) {
    clearTimeout(redirectTimeoutId);
    redirectTimeoutId = null;
  }
  sessionStorage.removeItem('esperandoRedirect');
}

// Si volvimos de un signInWithRedirect pero después de unos segundos no
// se resolvió la sesión (pasa en algunos Android por restricciones de
// almacenamiento entre la navegación a Google y de vuelta), avisamos al
// operador en vez de dejarlo en el login sin explicación.
if (sessionStorage.getItem('esperandoRedirect') === '1') {
  document.getElementById('loading').classList.add('show');
  redirectTimeoutId = setTimeout(() => {
    redirectTimeoutId = null;
    sessionStorage.removeItem('esperandoRedirect');
    mostrarErrorLogin('No se pudo completar el inicio de sesión. Verifica tu conexión e intenta de nuevo. Si sigue sin funcionar, cierra Chrome por completo y vuelve a entrar.');
  }, 10000);
}

async function verificarAcceso(user) {
  if (verificando) return;
  verificando = true;
  cancelarEsperaRedirect();
  try {
    const doc = await firebase.firestore().collection('usuarios').doc(user.uid).get();
    if (doc.exists && doc.data().activo === true) {
      const rol = doc.data().rol;
      window.location.replace(['admin','superadmin','supervisor'].includes(rol) ? 'admin.html' : 'operador.html');
      return;
    }
    // No existe en usuarios — guardar solicitud
    await guardarSolicitud(user);
  } catch(e) {
    if (e.code === 'permission-denied') {
      // Usuario nuevo sin acceso — guardar solicitud
      await guardarSolicitud(user);
    } else {
      console.error('ERROR:', e.code, e.message);
      verificando = false;
    }
  }
}

async function guardarSolicitud(user) {
  try {
    await firebase.firestore().collection('solicitudes').doc(user.uid).set({
      uid: user.uid,
      nombre: user.displayName || '',
      correo: user.email || '',
      estado: 'pendiente',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    window.location.replace('pendiente.html');
  } catch(e) {
    console.error('Error guardando solicitud:', e.code, e.message);
    window.location.replace('pendiente.html');
  }
}

firebase.auth().onAuthStateChanged(user => {
  if (!user) return;
  verificarAcceso(user);
});

// Recoge el resultado cuando el navegador regresa de signInWithRedirect.
// onAuthStateChanged arriba normalmente también se dispara en ese
// momento, pero en algunos Android no lo hace a tiempo (o no lo hace),
// así que aquí también disparamos la verificación directamente si
// getRedirectResult() sí trae un usuario.
firebase.auth().getRedirectResult().then(result => {
  if (result && result.user) {
    verificarAcceso(result.user);
  }
}).catch(err => {
  cancelarEsperaRedirect();
  console.error('Error en redirect:', err.code, err.message);
  mostrarErrorLogin('Error: ' + err.message);
});

async function loginGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  document.getElementById('btn-google').disabled = true;
  document.getElementById('login-error').style.display = 'none';

  // En móvil, el popup es poco confiable (el SO lo puede cerrar a
  // medias). Vamos directo a redirect: la página navega a Google y
  // regresa sola, sin ventana emergente que interrumpir.
  if (esMovil()) {
    document.getElementById('loading').classList.add('show');
    try {
      sessionStorage.setItem('esperandoRedirect', '1');
      await firebase.auth().signInWithRedirect(provider);
    } catch(err) {
      sessionStorage.removeItem('esperandoRedirect');
      document.getElementById('loading').classList.remove('show');
      document.getElementById('btn-google').disabled = false;
      document.getElementById('login-error').innerHTML = 'Error: ' + err.message;
      document.getElementById('login-error').style.display = 'block';
    }
    return;
  }

  try {
    const result = await firebase.auth().signInWithPopup(provider);
    await verificarAcceso(result.user);
  } catch(err) {
    const erroresRecuperables = [
      'auth/popup-blocked',
      'auth/cancelled-popup-request',
      'auth/popup-closed-by-user',
      'auth/operation-not-supported-in-this-environment',
    ];
    if (erroresRecuperables.includes(err.code)) {
      sessionStorage.setItem('esperandoRedirect', '1');
      firebase.auth().signInWithRedirect(provider);
    } else {
      document.getElementById('btn-google').disabled = false;
      document.getElementById('loading').classList.remove('show');
      document.getElementById('login-error').innerHTML = 'Error: ' + err.message;
      document.getElementById('login-error').style.display = 'block';
    }
  }
}
