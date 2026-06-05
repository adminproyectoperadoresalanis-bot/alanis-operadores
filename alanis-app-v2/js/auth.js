// ============================================================
// AUTOTRANSPORTES ALANÍS — Autenticación con Google
// ============================================================

const provider = new firebase.auth.GoogleAuthProvider();
// Forzar selección de cuenta cada vez (útil si hay varios usuarios en el celular)
provider.setCustomParameters({ prompt: 'select_account' });

// ── Si ya tiene sesión activa, redirigir directo ──────────────
auth.onAuthStateChanged(async user => {
  if (!user) return; // Sin sesión, quedarse en login

  try {
    const doc = await db.collection('usuarios').doc(user.uid).get();

    if (!doc.exists) {
      // Usuario autenticado con Google pero NO registrado en el sistema
      mostrarError(
        `Tu correo <strong>${user.email}</strong> no está registrado en el sistema. ` +
        `Contacta a tu supervisor para que te den acceso.`
      );
      auth.signOut();
      return;
    }

    const rol = doc.data().rol;
    if (rol === 'admin' || rol === 'supervisor') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'operador.html';
    }
  } catch (e) {
    mostrarError('Error al verificar tu acceso. Intenta de nuevo.');
    auth.signOut();
  }
});

// ── Login con Google ──────────────────────────────────────────
async function loginGoogle() {
  const btn = document.getElementById('btn-google');
  const loading = document.getElementById('loading');

  btn.disabled = true;
  loading.classList.add('show');
  ocultarError();

  try {
    await auth.signInWithPopup(provider);
    // onAuthStateChanged se encargará del redireccionamiento
  } catch (err) {
    btn.disabled = false;
    loading.classList.remove('show');

    const msgs = {
      'auth/popup-closed-by-user':     'Cerraste la ventana de Google antes de completar.',
      'auth/popup-blocked':            'El navegador bloqueó la ventana. Permite popups e intenta de nuevo.',
      'auth/cancelled-popup-request':  'Inicio cancelado. Intenta de nuevo.',
      'auth/network-request-failed':   'Sin conexión a internet. Verifica tu red.',
      'auth/unauthorized-domain':      'Dominio no autorizado. Contacta al administrador.',
    };
    mostrarError(msgs[err.code] || `Error: ${err.message}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────
function mostrarError(msg) {
  const el = document.getElementById('login-error');
  el.innerHTML = msg;
  el.style.display = 'block';
}

function ocultarError() {
  document.getElementById('login-error').style.display = 'none';
}
