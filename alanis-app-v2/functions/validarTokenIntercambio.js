// ============================================================================
// validarTokenIntercambio — "la puerta" que la tablet del intercambista toca.
// Vive en el proyecto Firebase de Alanis Operadores, en la misma carpeta
// functions/ que generarTokenIntercambio.js — mismo proyecto, mismo Firestore.
//
// No hay ninguna razón técnica para que esta función viva en un proyecto
// distinto: es un endpoint HTTPS plano (no un Callable atado al SDK de un
// cliente en particular), así que la tablet de Misael la llama igual sin
// importar en qué proyecto de Firebase esté desplegada — con el POST + la
// llave compartida de siempre. Ponerla junto a generarTokenIntercambio,
// donde ya vive el dato real (repositorio_mccain), elimina por completo la
// necesidad de una cuenta de servicio cruzando a ADREMATASA Interno.
//
// Contrato con Misael / Adrematasa Oficial (sin cambios):
//   POST https://.../validarTokenIntercambio
//   Header:  x-api-key: <secreto compartido>
//   Body:    { "token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
//   Respuesta (siempre HTTP 200, para que su lado nunca tenga que
//   distinguir códigos de estado): { "valido": true }  ó  { "valido": false }
//   No se regresa nada más — ni datos del embarque, ni del cliente, ni motivo
//   detallado del rechazo. Eso es intencional (ver README de seguridad).
// ============================================================================
//
// ⚠️  CONFIRMAR ANTES DE DESPLEGAR:
//   - VIGENCIA_MINUTOS: cuántos minutos debe vivir un token antes de vencer
//     (debe coincidir con el mismo valor en generarTokenIntercambio.js).
//
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ---- Configuración ---------------------------------------------------------
const REPOSITORIO_COLLECTION = "repositorio_mccain"; // confirmado en operador4.js
const VIGENCIA_MINUTOS = 10;

// Secreto compartido con Adrematasa Oficial / tablet. Se configura con:
//   firebase functions:secrets:set INTERCAMBIO_API_KEY
const INTERCAMBIO_API_KEY = defineSecret("INTERCAMBIO_API_KEY");

// Formato esperado del token (ver generarTokenIntercambio): base64url, ~32 chars.
const TOKEN_REGEX = /^[A-Za-z0-9_-]{20,64}$/;

async function registrarBitacora(resultado, extra = {}) {
  try {
    await db.collection("bitacoraValidacionesIntercambio").add({
      resultado,
      fecha: FieldValue.serverTimestamp(),
      ...extra,
    });
  } catch (e) {
    // La bitácora nunca debe tumbar la validación real.
    logger.error("No se pudo escribir bitácora de validación", e);
  }
}

exports.validarTokenIntercambio = onRequest(
  { secrets: [INTERCAMBIO_API_KEY], cors: false, region: "us-central1" },
  async (req, res) => {
    // 1) Solo POST.
    if (req.method !== "POST") {
      return res.status(405).json({ valido: false });
    }

    // 2) Llave compartida — se valida ANTES de tocar Firestore, para no
    //    gastar lecturas en tráfico no autorizado.
    const llave = req.get("x-api-key");
    if (!llave || llave !== INTERCAMBIO_API_KEY.value()) {
      logger.warn("validarTokenIntercambio: intento con x-api-key inválida o ausente");
      return res.status(401).json({ valido: false });
    }

    const token = (req.body && req.body.token || "").trim();
    if (!TOKEN_REGEX.test(token)) {
      await registrarBitacora("formato_invalido");
      return res.status(200).json({ valido: false });
    }

    try {
      const embarqueIdValidado = await db.runTransaction(async (tx) => {
        const tokenRef = db.collection("tokensIntercambio").doc(token);
        const tokenSnap = await tx.get(tokenRef);

        if (!tokenSnap.exists) throw new Error("no_encontrado");
        const tokenData = tokenSnap.data();

        if (tokenData.usado === true) throw new Error("ya_usado");

        const expiraEnMs = tokenData.expiraEn && tokenData.expiraEn.toMillis
          ? tokenData.expiraEn.toMillis() : 0;
        if (expiraEnMs < Date.now()) throw new Error("expirado");

        const embarqueRef = db.collection(REPOSITORIO_COLLECTION).doc(tokenData.embarqueId);
        const embarqueSnap = await tx.get(embarqueRef);
        if (!embarqueSnap.exists) throw new Error("embarque_no_existe");

        // Revalidación del checkpoint en el momento de cruzar el portón —
        // nunca se confía únicamente en que el token exista: si algo
        // corrigió o revirtió recepcionOperador entre la generación del
        // token y este instante, la puerta lo rechaza igual.
        const embarqueData = embarqueSnap.data();
        const recepcion = embarqueData.recepcionOperador;
        if (!recepcion || recepcion.resultado !== "COINCIDE") {
          throw new Error("checkpoint_no_cumplido");
        }

        // Un solo uso: se marca consumido dentro de la misma transacción,
        // así dos lecturas concurrentes del mismo token no pueden validar
        // ambas como "válido" (condición de carrera).
        tx.update(tokenRef, { usado: true, usadoEn: FieldValue.serverTimestamp() });

        return tokenData.embarqueId;
      });

      await registrarBitacora("valido", { embarqueId: embarqueIdValidado });
      return res.status(200).json({ valido: true });
    } catch (err) {
      const motivo = err && err.message ? err.message : "error_desconocido";
      // El motivo detallado solo se guarda internamente para auditoría —
      // nunca se regresa en la respuesta HTTP.
      await registrarBitacora(motivo, { tokenPrefijo: token.slice(0, 8) });
      return res.status(200).json({ valido: false });
    }
  }
);
