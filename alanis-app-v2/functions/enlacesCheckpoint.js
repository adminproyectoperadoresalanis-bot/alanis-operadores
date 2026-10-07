// ============================================================================
// enlacesCheckpoint — "respaldo por enlace" del Checkpoint 1 (recepción).
//
// Cuando un operador no logra escanear el QR de su factura, Operaciones (en
// ADREMATASA Interno) genera un enlace de un solo uso y se lo manda por
// WhatsApp. El registro del enlace se guarda en la colección
// `enlaces_checkpoint` de ESTE proyecto (alanis-operadores). El ID del
// documento es el SHA-256 (hex, minúsculas) del TEXTO del código; el código en
// claro NUNCA se guarda ni se escribe en logs.
//
// Dos funciones (ambas exigen que el operador haya iniciado sesión):
//   validarEnlaceCheckpoint  → revisa el enlace y devuelve los datos del
//                              embarque para que el operador los confirme.
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
//   expiraEn     Timestamp  (también se acepta el nombre `venceEn`)
//   usado        boolean    false al crear
//   revocado     boolean    false al crear
//   emitidoPor   { uid, nombre }   quién de Operaciones lo generó
//
// DIAGNÓSTICO: cada rechazo se identifica con un `motivo` (ver MOTIVOS abajo).
// El motivo viaja al celular en `error.details.motivo`, se escribe en el log y,
// si el registro existe, queda guardado en el propio registro:
//   ultimoRechazo { motivo, funcion, uid, en, faltantes? }  y  rechazos (contador)
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
const ZONA_HORARIA = "America/Matamoros"; // Nuevo Laredo

function hashCodigo(codigo) {
  return crypto.createHash("sha256").update(codigo, "utf8").digest("hex");
}

// Error con motivo identificable. `interno` NO viaja al cliente (solo log/registro).
function fallo(code, motivo, mensaje, interno) {
  const e = new HttpsError(code, mensaje, { motivo });
  e.interno = interno || null;
  return e;
}

function aMillis(t) {
  return t && typeof t.toMillis === "function" ? t.toMillis() : null;
}

function vigencia(enlace) {
  return enlace.expiraEn !== undefined && enlace.expiraEn !== null
    ? enlace.expiraEn
    : enlace.venceEn;
}

function formatoFecha(ms) {
  try {
    return new Date(ms).toLocaleString("es-MX", {
      timeZone: ZONA_HORARIA, day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch (e) {
    return new Date(ms).toISOString();
  }
}

function leerCodigo(request) {
  if (!request.auth) {
    throw fallo("unauthenticated", "sin_sesion", "Debes iniciar sesión.");
  }
  const codigo = request.data && request.data.codigo;
  if (typeof codigo !== "string" || codigo.trim() === "") {
    throw fallo("invalid-argument", "falta_codigo",
      "Al enlace le falta su código. Pide a Operaciones que te lo envíe de nuevo.");
  }
  if (!CODIGO_RE.test(codigo)) {
    throw fallo("invalid-argument", "codigo_invalido",
      "El enlace está incompleto o dañado (a veces WhatsApp lo corta). Pide a Operaciones que te lo envíe de nuevo.");
  }
  return codigo;
}

// Campos que el registro DEBE traer. Si Interno escribe un nombre distinto,
// aquí queda a la vista en vez de confundirse con "vencido" o "ajeno".
function camposFaltantes(enlace) {
  const f = [];
  const idOk = typeof enlace.embarqueId === "string" && enlace.embarqueId && enlace.embarqueId.indexOf("/") === -1;
  if (!idOk) f.push("embarqueId");
  if (typeof enlace.operadorUid !== "string" || !enlace.operadorUid) f.push("operadorUid");
  if (typeof enlace.uuidEsperado !== "string" || !enlace.uuidEsperado) f.push("uuidEsperado");
  if (aMillis(vigencia(enlace)) === null) f.push("expiraEn (Timestamp)");
  return f;
}

// Revisa el registro del enlace (sin mirar todavía el embarque).
function verificarRegistro(enlace, uid) {
  if (!enlace) {
    throw fallo("not-found", "no_existe",
      "Este enlace no existe o ya fue reemplazado. Pide uno nuevo a Operaciones.");
  }
  const faltantes = camposFaltantes(enlace);
  if (faltantes.length) {
    throw fallo("failed-precondition", "registro_incompleto",
      "Este enlace se generó incompleto. Avisa a Operaciones para que genere uno nuevo.",
      { faltantes });
  }
  if (enlace.checkpoint && enlace.checkpoint !== "recepcion") {
    throw fallo("failed-precondition", "checkpoint_distinto",
      "Este enlace no es para la recepción del documento. Pide uno nuevo a Operaciones.");
  }
  if (enlace.revocado === true) {
    throw fallo("failed-precondition", "revocado",
      "Este enlace fue cancelado porque Operaciones generó uno más reciente. Usa el último que te enviaron o pide uno nuevo.");
  }
  if (enlace.usado === true) {
    throw fallo("failed-precondition", "usado",
      "Este enlace ya fue utilizado. Si tu recepción ya aparece registrada, no necesitas hacer nada más.");
  }
  const exp = aMillis(vigencia(enlace));
  if (exp <= Date.now()) {
    throw fallo("failed-precondition", "vencido",
      "Este enlace venció el " + formatoFecha(exp) + " (hora de Nuevo Laredo). Pide uno nuevo a Operaciones.");
  }
  if (enlace.operadorUid !== uid) {
    throw fallo("permission-denied", "otro_operador",
      "Este enlace es para otro operador. Cierra sesión e ingresa con tu propia cuenta.");
  }
}

// Revisa el embarque contra el enlace.
function verificarEmbarque(enlace, embarque, uid) {
  if (!embarque) {
    throw fallo("not-found", "embarque_no_existe",
      "El embarque de este enlace ya no existe. Avisa a Operaciones.");
  }
  const uidAsignado = embarque.operadorAsignado && embarque.operadorAsignado.uid;
  if (uidAsignado !== uid) {
    throw fallo("permission-denied", "embarque_reasignado",
      "Este embarque ya no está asignado a tu cuenta. Avisa a Operaciones.");
  }
  if (embarque.recepcionOperador) {
    if (embarque.recepcionOperador.resultado === "COINCIDE") {
      throw fallo("failed-precondition", "recepcion_ya_registrada",
        "La recepción de este embarque ya fue registrada. No necesitas hacer nada más.");
    }
    throw fallo("failed-precondition", "recepcion_con_diferencias",
      "Este embarque ya tiene un registro de recepción con diferencias. Avisa a Operaciones.");
  }
  if (!embarque.uuidEsperado || !embarque.receptorRFCEsperado) {
    throw fallo("failed-precondition", "sin_factura_esperada",
      "Este embarque todavía no tiene su factura esperada. Avisa a Operaciones.");
  }
  if (enlace.uuidEsperado !== embarque.uuidEsperado) {
    throw fallo("failed-precondition", "factura_cambio",
      "La factura del embarque cambió después de generar el enlace. Pide uno nuevo a Operaciones.");
  }
}

// Quién generó el enlace. Interno lo guarda como `creadoPor` {uid, nombre, correo,
// proyecto}; el contrato original lo llamaba `emitidoPor`. Se acepta cualquiera.
function quienEmitio(enlace) {
  const p = enlace.emitidoPor || enlace.creadoPor;
  if (!p || typeof p !== "object") return null;
  return { uid: p.uid || null, nombre: p.nombre || null, correo: p.correo || null };
}

// Ejecuta una función y, si se rechaza con un motivo, lo deja en el log y en el
// registro del enlace (si existe). Nunca escribe el código en claro.
async function conDiagnostico(funcion, request, fn) {
  const ctx = { funcion, uid: request.auth ? request.auth.uid : null, ref: null, existe: false, huella: null };
  try {
    return await fn(ctx);
  } catch (err) {
    const motivo = err && err.details && err.details.motivo;
    if (motivo) {
      const faltantes = err.interno && err.interno.faltantes;
      logger.warn("Enlace rechazado", {
        funcion, motivo, uid: ctx.uid, huella: ctx.huella, faltantes: faltantes || null,
      });
      if (ctx.ref && ctx.existe) {
        try {
          const rechazo = { motivo, funcion, uid: ctx.uid, en: admin.firestore.FieldValue.serverTimestamp() };
          if (faltantes) rechazo.faltantes = faltantes;
          await ctx.ref.update({
            ultimoRechazo: rechazo,
            rechazos: admin.firestore.FieldValue.increment(1),
          });
        } catch (e) {
          logger.error("No se pudo guardar el motivo del rechazo", { motivo, error: String(e && e.message) });
        }
      }
    } else {
      logger.error("Error inesperado en enlace", { funcion, uid: ctx.uid, error: String(err && err.message) });
    }
    throw err;
  }
}

exports.validarEnlaceCheckpoint = onCall(
  { region: "us-central1" },
  (request) => conDiagnostico("validar", request, async (ctx) => {
    const codigo = leerCodigo(request);
    const uid = request.auth.uid;
    const id = hashCodigo(codigo);
    ctx.huella = id.slice(0, 8);
    ctx.ref = db.collection(COL_ENLACES).doc(id);

    const enlaceSnap = await ctx.ref.get();
    ctx.existe = enlaceSnap.exists;
    const enlace = enlaceSnap.exists ? enlaceSnap.data() : null;
    verificarRegistro(enlace, uid);

    const embSnap = await db.collection(COL_REPO).doc(enlace.embarqueId).get();
    const embarque = embSnap.exists ? embSnap.data() : null;
    verificarEmbarque(enlace, embarque, uid);

    return {
      shipment: embarque.shipment || "",
      clienteNombre: embarque.clienteNombre || "",
      ocCliente: embarque.ocCliente || "",
      caja: embarque.caja || "",
      expiraEnMs: aMillis(vigencia(enlace)),
    };
  })
);

exports.consumirEnlaceCheckpoint = onCall(
  { region: "us-central1" },
  (request) => conDiagnostico("consumir", request, async (ctx) => {
    const codigo = leerCodigo(request);
    const uid = request.auth.uid;
    const id = hashCodigo(codigo);
    ctx.huella = id.slice(0, 8);
    ctx.ref = db.collection(COL_ENLACES).doc(id);
    const enlaceRef = ctx.ref;

    const resultado = await db.runTransaction(async (tx) => {
      const enlaceSnap = await tx.get(enlaceRef);
      ctx.existe = enlaceSnap.exists;
      const enlace = enlaceSnap.exists ? enlaceSnap.data() : null;
      verificarRegistro(enlace, uid);

      const embarqueRef = db.collection(COL_REPO).doc(enlace.embarqueId);
      const embSnap = await tx.get(embarqueRef);
      const embarque = embSnap.exists ? embSnap.data() : null;
      const userSnap = await tx.get(db.collection(COL_USUARIOS).doc(uid));
      const usuario = userSnap.exists ? userSnap.data() : null;

      verificarEmbarque(enlace, embarque, uid);

      if (!usuario || usuario.activo === false) {
        throw fallo("permission-denied", "cuenta_inactiva", "Tu cuenta no está activa.");
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
            emitidoPor: quienEmitio(enlace),
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
    logger.info("Checkpoint 1 registrado por enlace", { embarqueId: resultado.embarqueId, uid });
    return { ok: true, shipment: resultado.shipment };
  })
);
