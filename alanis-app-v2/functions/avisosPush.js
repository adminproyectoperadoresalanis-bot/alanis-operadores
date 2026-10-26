// ##########################################################################
// PROYECTO: ALANIS OPERADORES  (Codespace: alanis-operadores)
// RUTA:     /workspaces/alanis-operadores/alanis-app-v2/functions/avisosPush.js
// ##########################################################################
// Avisos (notificaciones push) con Firebase Cloud Messaging.
// - registrarDispositivoAvisos (callable): guarda el token del teléfono del
//   usuario en avisos_dispositivos/{hash del token}. Solo el servidor escribe
//   ahí (no hace falta regla nueva: el navegador no tiene acceso).
// - avisoPrueba (callable): manda un aviso de prueba a los teléfonos del
//   propio usuario.
// - avisoAsignacion (trigger): al crearse asignaciones/{id}, avisa al
//   operador (uid_operador).
// Los tokens que Firebase reporta como inválidos se borran solos.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const crypto = require("crypto");

const REGION = "us-central1";
const COL = "avisos_dispositivos";
const SITIO = "https://alanis-operadores.web.app";
const LINK_OPERADOR = SITIO + "/operador.html";
const ICONO = SITIO + "/img/logo.webp";
const ZONA = "America/Matamoros";

function idDe(token) {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 40);
}

async function enviarAUid(uid, titulo, cuerpo, link) {
  const db = getFirestore();
  const snap = await db.collection(COL).where("uid", "==", uid).get();
  if (snap.empty) return { dispositivos: 0, enviados: 0, fallidos: 0 };

  const docs = snap.docs;
  const r = await getMessaging().sendEachForMulticast({
    tokens: docs.map(d => d.get("token")),
    webpush: {
      notification: { title: titulo, body: cuerpo, icon: ICONO },
      fcmOptions: { link: link || LINK_OPERADOR },
    },
  });

  const borrar = [];
  r.responses.forEach((x, i) => {
    if (x.success) return;
    const code = (x.error && x.error.code) || "";
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
      borrar.push(docs[i].ref.delete());
    } else {
      console.warn("[avisos] fallo", uid, code, x.error && x.error.message);
    }
  });
  await Promise.all(borrar);
  return { dispositivos: docs.length, enviados: r.successCount, fallidos: r.failureCount };
}

exports.registrarDispositivoAvisos = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión.");
  const datos = req.data || {};
  const token = String(datos.token || "");
  if (token.length < 20 || token.length > 4096) throw new HttpsError("invalid-argument", "Token inválido.");
  const plataforma = ["ios", "android", "otro"].includes(datos.plataforma) ? datos.plataforma : "otro";

  await getFirestore().collection(COL).doc(idDe(token)).set({
    uid: req.auth.uid,
    correo: req.auth.token.email || "",
    token,
    plataforma,
    instalada: !!datos.instalada,
    actualizadoMs: Date.now(),
  }, { merge: true });

  return { ok: true };
});

exports.avisoPrueba = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión.");
  return enviarAUid(req.auth.uid,
    "Prueba de avisos · Alanis",
    "Si ves este mensaje, los avisos ya funcionan en este teléfono.");
});

function textoCita(c) {
  if (!c) return "";
  if (typeof c === "string") return c;
  const d = typeof c.toDate === "function" ? c.toDate() : new Date(c);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("es-MX", {
    timeZone: ZONA, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

exports.avisoAsignacion = onDocumentCreated({ document: "asignaciones/{id}", region: REGION }, async (event) => {
  const a = (event.data && event.data.data()) || {};
  const uid = a.uid_operador;
  if (!uid) return;

  const partes = [];
  if (a.unidad) partes.push("Unidad " + a.unidad);
  if (a.cliente) partes.push(a.cliente);
  let cuerpo = partes.join(" · ");
  if (a.destino) cuerpo += (cuerpo ? " → " : "") + a.destino;
  const cita = textoCita(a.cita);
  if (cita) cuerpo += (cuerpo ? "\n" : "") + "Cita: " + cita;

  const r = await enviarAUid(uid, "Nuevo viaje asignado", cuerpo || "Abre la app para ver el detalle.");
  console.log("[avisos] asignacion", event.params.id, uid, JSON.stringify(r));
});