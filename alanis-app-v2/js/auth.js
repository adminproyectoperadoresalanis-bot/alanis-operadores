// AUTOTRANSPORTES ALANIS - Auth v17
// Cambio (2026-09-15): en móvil, signInWithPopup es poco confiable
// (auth/popup-closed-by-user, auth/operation-not-supported-in-this-environment)
// porque el SO puede interrumpir el popup. Ahora en móvil usamos
// signInWithRedirect directamente, y getRedirectResult() recoge el
// resultado al volver. En escritorio se mantiene el popup, con más
// códigos de error cubiertos como respaldo hacia redirect.

let verificando = false;

function esMovil() {
  return /Android|iPhone|iPad|iPod|Mobile|webOS/i.test(navigator.userAgent);
}

async function verificarAcceso(user) {
  if (verificando) return;
  verificando = true;
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
// onAuthStateChanged arriba también se dispara en ese momento, pero
// getRedirectResult() nos deja mostrar el error correcto si el
// redirect falló (en vez de dejar al usuario parado en el login sin
// explicación).
firebase.auth().getRedirectResult().catch(err => {
  console.error('Error en redirect:', err.code, err.message);
  document.getElementById('loading').classList.remove('show');
  document.getElementById('btn-google').disabled = false;
  document.getElementById('login-error').innerHTML = 'Error: ' + err.message;
  document.getElementById('login-error').style.display = 'block';
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
      await firebase.auth().signInWithRedirect(provider);
    } catch(err) {
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
      firebase.auth().signInWithRedirect(provider);
    } else {
      document.getElementById('btn-google').disabled = false;
      document.getElementById('loading').classList.remove('show');
      document.getElementById('login-error').innerHTML = 'Error: ' + err.message;
      document.getElementById('login-error').style.display = 'block';
    }
  }
}