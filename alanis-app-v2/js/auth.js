// AUTOTRANSPORTES ALANIS - Auth v15

let verificando = false;

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

async function loginGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await firebase.auth().signInWithPopup(provider);
    await verificarAcceso(result.user);
  } catch(err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      firebase.auth().signInWithRedirect(provider);
    } else {
      document.getElementById('btn-google').disabled = false;
      document.getElementById('loading').classList.remove('show');
      document.getElementById('login-error').innerHTML = 'Error: ' + err.message;
      document.getElementById('login-error').style.display = 'block';
    }
  }
}
