// ============================================================================
// generarTokenIntercambio — genera el código de un solo uso que el operador
// muestra como QR. Vive en el proyecto de Alanis Operadores — igual que
// validarTokenIntercambio.js (la puerta), en la misma carpeta functions/.
//
// Arquitectura de un solo proyecto (confirmado en operador4.js, sesión del
// 2026-09-16): el checkpoint 1 (recepción) y la asignación operador↔embarque
// viven NATIVAMENTE en `repositorio_mccain`, colección del proyecto Alanis
// Operadores — no son una copia sincronizada que haya que ir a buscar a
// ADREMATASA Interno. `operadorAsignado` sí se sincroniza desde ADREMATASA
// hacia allá (vía Apps Script, hasta 5 min), pero eso ya pasó antes de que
// esta función se ejecute: para generarTokenIntercambio, repositorio_mccain
// es la fuente de verdad y basta con leerla localmente.
//
// Por eso ya NO hace falta una cuenta de servicio ni un segundo proyecto de
// Firebase: ambas funciones (generar y validar) corren en el mismo proyecto,
// leen/escriben el mismo Firestore con el Admin SDK por defecto, y el token
// nunca cruza de proyecto. Es la misma capa de seguridad que antes, con una
// pieza de infraestructura menos que mantener.
//
// ⚠️  CONFIRMAR ANTES DE DESPLEGAR:
//   - Que `repositorio_mccain` sea, en este momento, el nombre real de la
//     colección en el proyecto Alanis Operadores donde vive `operador4.js`
//     (así se ve en el código fuente compartido esta sesión — no debería
//     haber cambiado, pero es la única pieza que vale la pena verificar dos
//     veces antes de un despliegue real).
//
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// ---- Configuración ---------------------------------------------------------
const REPOSITORIO_COLLECTION = "repositorio_mccain"; // confirmado en operador4.js
const VIGENCIA_MINUTOS = 10;
const REGENERAR_SI_CREADO_HACE_MENOS_DE_SEG = 5; // evita duplicar por doble-tap

function generarToken() {
  // 24 bytes = 192 bits de entropía, codificado en base64url (sin +, /, =):
  // suficiente para que adivinarlo por fuerza bruta no sea viable, y corto
  // para que el QR sea denso pero legible.
  return crypto.randomBytes(24).toString("base64url");
}

exports.generarTokenIntercambio = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const uid = request.auth.uid;
    const embarqueId = request.data && request.data.embarqueId;
    if (!embarqueId || typeof embarqueId !== "string") {
      throw new HttpsError("invalid-argument", "Falta embarqueId.");
    }

    const embarqueRef = db.collection(REPOSITORIO_COLLECTION).doc(embarqueId);
    const embarqueSnap = await embarqueRef.get();

    if (!embarqueSnap.exists) {
      throw new HttpsError("not-found", "Embarque no encontrado.");
    }
    const embarque = embarqueSnap.data();

    // Autorización: SOLO el operador asignado a este embarque puede generar
    // su propio código — nunca un uid distinto, aunque esté autenticado.
    // operadorAsignado.uid viene sincronizado desde ADREMATASA (ver
    // operador4.js línea ~939), pero eso ya sucedió antes de este momento:
    // aquí solo se relee el dato tal como está ahora en repositorio_mccain.
    const uidAsignado = embarque.operadorAsignado && embarque.operadorAsignado.uid;
    if (uidAsignado !== uid) {
      throw new HttpsError("permission-denied", "No autorizado para este embarque.");
    }

    // Verificación real del checkpoint 1 (recepción) — nunca se confía en lo
    // que diga el cliente, se relee el dato autoritativo en el momento.
    // recepcionOperador.resultado tiene 3 estados posibles (ver operador4.js
    // línea ~944-946): solo 'COINCIDE' cuenta como checkpoint cumplido.
    // NO_COINCIDE_DOCUMENTO (factura equivocada) y NO_COINCIDE_OPERADOR
    // (factura correcta pero no es su carga) NO habilitan el token.
    const recepcion = embarque.recepcionOperador;
    if (!recepcion || recepcion.resultado !== "COINCIDE") {
      throw new HttpsError(
        "failed-precondition",
        "El checkpoint de recepción todavía no se ha cumplido."
      );
    }
    // Defensa adicional: quien completó el checkpoint con éxito debe ser el
    // mismo uid que está pidiendo el token ahora — no solo "alguien" marcó
    // COINCIDE en algún momento.
    if (recepcion.uid !== uid) {
      throw new HttpsError("permission-denied", "No autorizado para este embarque.");
    }

    // Si ya existe un token activo reciente (evita duplicar por doble-tap
    // o por reabrir la pantalla), lo reutiliza en vez de generar otro.
    const activo = embarque.tokenIntercambioActivo;
    if (activo && activo.usado !== true && activo.expiraEn && activo.expiraEn.toMillis) {
      const creadoHaceMs = Date.now() - (activo.creadoEnMs || 0);
      if (activo.expiraEn.toMillis() > Date.now()
          && creadoHaceMs < REGENERAR_SI_CREADO_HACE_MENOS_DE_SEG * 1000) {
        return { token: activo.token, expiraEnMs: activo.expiraEn.toMillis() };
      }
    }

    const token = generarToken();
    const ahora = admin.firestore.Timestamp.now();
    const expiraEn = admin.firestore.Timestamp.fromMillis(
      ahora.toMillis() + VIGENCIA_MINUTOS * 60 * 1000
    );

    await db.collection("tokensIntercambio").doc(token).set({
      embarqueId,
      operadorUid: uid,
      creadoEn: ahora,
      expiraEn,
      usado: false,
      usadoEn: null,
    });

    // Copia denormalizada en el embarque — solo para que la propia app
    // pueda mostrar "ya tienes un código activo, vence en X" sin una
    // consulta aparte. La fuente de verdad para validar sigue siendo
    // la colección tokensIntercambio.
    await embarqueRef.update({
      tokenIntercambioActivo: {
        token,
        creadoEnMs: ahora.toMillis(),
        expiraEn,
        usado: false,
      },
    });

    return { token, expiraEnMs: expiraEn.toMillis() };
  }
);
