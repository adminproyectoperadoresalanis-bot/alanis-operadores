// ============================================================================
// enlacesCheckpoint — "respaldo por enlace" del Checkpoint 1 (recepción).
//
// Cuando un operador no logra escanear el QR de su factura, Operaciones (en
// ADREMATASA Interno) genera un enlace de un solo uso y se lo manda por
// WhatsApp. El registro del enlace se guarda en la colección
// `enlaces_checkpoint` de ESTE proyecto (alanis-operadores). El ID del
// documento es el SHA-256 (hex, minúsculas) del código; el código en claro
// NUNCA se guarda ni se escribe en logs.
//
// Dos funciones (ambas exigen que el operador haya iniciado sesión):
//   validarEnlaceCheckpoint  → SOLO LEE. Revisa el enlace y devuelve los datos
//                              del embarque para que el operador los confirme.
//   consumirEnlaceCheckpoint → en una transacción vuelve a revisar todo y
//                              escribe ÚNICAMENTE la llave `recepcionOperador`
//                              del embarque; marca el enlace como usado.
//
// Registro esperado en enlaces_checkpoint/{sha256hex(codigo)}:
//   embarqueId   string     id del documento en repositorio_mccain
//   operadorUid  string     uid (alanis-operadores) del operador destinatario
//   checkpoint   string     "recepcion"
//   uuidEsperado string     UUID de la factura, congelado al generar
//   creadoEn     Timestamp
//   expiraEn     Timestamp
//   usado        boolean    false al crear
//   revocado     boolean    false al crear
//   emitidoPor   { uid, nombre }   quién de Operaciones lo generó
// ============================================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const logger = require("firebase-functions/logger");

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const COL_REPO = "repositorio_mccain";
const COL_ENLACES = "enlaces_checkpoint";
const COL_USUARIOS = "usuarios";
const CODIGO_RE = /^[A-Za-z0-9_-]{20,128}$/;

function hashCodigo(codigo) {
  return crypto.createHash("sha256").update(codigo, "utf8").digest("hex");
}

function leerCodigo(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const codigo = request.data && request.data.codigo;
  if (typeof codigo !== "string" || !CODIGO_RE.test(codigo)) {
    throw new HttpsError("not-found", "Este enlace no es válido.");
  }
  return codigo;
}

function aMillis(t) {
  return t && typeof t.toMillis === "function" ? t.toMillis() : null;
}

// Revisa enlace + embarque. Lanza HttpsError con un mensaje que el operador
// pueda entender. Se usa igual en validar (lectura) y en consumir (transacción).
function verificarEnlace(enlace, embarque, uid) {
  if (!enlace) {
    throw new HttpsError("not-found", "Este enlace no es válido.");
  }
  if (enlace.checkpoint && enlace.checkpoint !== "recepcion") {
    throw new HttpsError("not-found", "Este enlace no es válido.");
  }
  if (enlace.revocado === true) {
    throw new HttpsError("failed-precondition",
      "Este enlace fue cancelado. Pide uno nuevo a Operaciones.");
  }
  if (enlace.usado === true) {
    throw new HttpsError("failed-precondition",
      "Este enlace ya fue utilizado. Si tu recepción ya aparece registrada, no necesitas hacer nada más.");
  }
  const exp = aMillis(enlace.expiraEn);
  if (!exp || exp <= Date.now()) {
    throw new HttpsError("failed-precondition",
      "Este enlace venció. Pide uno nuevo a Operaciones.");
  }
  if (enlace.operadorUid !== uid) {
    throw new HttpsError("permission-denied",
      "Este enlace es para otro operador. Cierra sesión e ingresa con tu propia cuenta.");
  }
  if (!embarque) {
    throw new HttpsError("not-found", "El embarque de este enlace ya no existe.");
  }
  const uidAsignado = embarque.operadorAsignado && embarque.operadorAsignado.uid;
  if (uidAsignado !== uid) {
    throw new HttpsError("permission-denied",
      "Este embarque ya no está asignado a tu cuenta. Avisa a Operaciones.");
  }
  if (embarque.recepcionOperador) {
    if (embarque.recepcionOperador.resultado === "COINCIDE") {
      throw new HttpsError("failed-precondition",
        "La recepción de este embarque ya fue registrada. No necesitas hacer nada más.");
    }
    throw new HttpsError("failed-precondition",
      "Este embarque ya tiene un registro de recepción con diferencias. Avisa a Operaciones.");
  }
  if (!embarque.uuidEsperado || !embarque.receptorRFCEsperado) {
    throw new HttpsError("failed-precondition",
      "Este embarque todavía no tiene su factura esperada. Avisa a Operaciones.");
  }
  if (enlace.uuidEsperado !== embarque.uuidEsperado) {
    throw new HttpsError("failed-precondition",
      "La factura del embarque cambió después de generar el enlace. Pide uno nuevo a Operaciones.");
  }
}

function idEmbarque(enlace) {
  const id = enlace && enlace.embarqueId;
  if (typeof id !== "string" || !id || id.indexOf("/") !== -1) {
    throw new HttpsError("not-found", "Este enlace no es válido.");
  }
  return id;
}

exports.validarEnlaceCheckpoint = onCall(
  { region: "us-central1" },
  async (request) => {
    const codigo = leerCodigo(request);
    const uid = request.auth.uid;

    const enlaceSnap = await db.collection(COL_ENLACES).doc(hashCodigo(codigo)).get();
    const enlace = enlaceSnap.exists ? enlaceSnap.data() : null;
    if (!enlace) throw new HttpsError("not-found", "Este enlace no es válido.");

    const embSnap = await db.collection(COL_REPO).doc(idEmbarque(enlace)).get();
    const embarque = embSnap.exists ? embSnap.data() : null;

    verificarEnlace(enlace, embarque, uid);

    return {
      shipment: embarque.shipment || "",
      clienteNombre: embarque.clienteNombre || "",
      ocCliente: embarque.ocCliente || "",
      caja: embarque.caja || "",
      expiraEnMs: aMillis(enlace.expiraEn),
    };
  }
);

exports.consumirEnlaceCheckpoint = onCall(
  { region: "us-central1" },
  async (request) => {
    const codigo = leerCodigo(request);
    const uid = request.auth.uid;
    const enlaceRef = db.collection(COL_ENLACES).doc(hashCodigo(codigo));

    const resultado = await db.runTransaction(async (tx) => {
      const enlaceSnap = await tx.get(enlaceRef);
      const enlace = enlaceSnap.exists ? enlaceSnap.data() : null;
      if (!enlace) throw new HttpsError("not-found", "Este enlace no es válido.");

      const embarqueRef = db.collection(COL_REPO).doc(idEmbarque(enlace));
      const embSnap = await tx.get(embarqueRef);
      const embarque = embSnap.exists ? embSnap.data() : null;
      const userSnap = await tx.get(db.collection(COL_USUARIOS).doc(uid));
      const usuario = userSnap.exists ? userSnap.data() : null;

      verificarEnlace(enlace, embarque, uid);

      if (!usuario || usuario.activo === false) {
        throw new HttpsError("permission-denied", "Tu cuenta no está activa.");
      }
      const nombre = usuario.nombreOficial || usuario.nombre || "";

      // Mismos campos que escribe la app al escanear, más la huella del método.
      tx.update(embarqueRef, {
        recepcionOperador: {
          uid,
          nombre,
          uuidCfdi: embarque.uuidEsperado,
          rfcReceptor: embarque.receptorRFCEsperado,
          resultado: "COINCIDE",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          metodo: "enlace",
          enlace: {
            emitidoPor: enlace.emitidoPor || null,
            emitidoEn: enlace.creadoEn || null,
          },
        },
      });
      tx.update(enlaceRef, {
        usado: true,
        usadoEn: admin.firestore.FieldValue.serverTimestamp(),
        usadoPor: uid,
      });
      return { embarqueId: embSnap.id, shipment: embarque.shipment || "" };
    });

    // Sin el código: solo el embarque y quién lo usó.
    logger.info("Checkpoint 1 registrado por enlace", {
      embarqueId: resultado.embarqueId,
      uid,
    });
    return { ok: true, shipment: resultado.shipment };
  }
);
