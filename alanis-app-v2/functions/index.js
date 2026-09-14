// ============================================================================
// QR/CFDI — Cloud Functions 2da gen desplegadas en alanis-operadores.
//
// Reemplaza, del lado de Alanis Operadores, a Codigo.gs (Apps Script):
//   - sincronizarPendientesOrigen_      ┐
//   - sincronizarResultados_            │ combinadas en un solo trigger sobre
//   - sincronizarResultadoRecepcion_    │ repositorio_mccain, porque las 4
//   - limpiarResultadosObsoletos_       ┘ reaccionan al mismo documento
//   - sincronizarOperadoresAlanis_ → exports.sincronizarOperadoresAlanis
//
// Traducido campo por campo desde Codigo.gs (leído el 2026-09-10). Al ser
// triggers de escritura (no un barrido periódico de toda la colección), el
// problema de cuota de UrlFetchApp que resolvía fsBatchGet_ deja de existir
// por completo — cada función solo procesa el documento que cambió.
//
// FUERA DE ALCANCE A PROPÓSITO (instrucción de Ivan, 2026-09-10): el
// mecanismo de alertas por correo/ntfy.sh no se reconstruye aquí. Ver el
// mismo comentario en el codebase de appadrematasainterno.
//
// Codigo.gs SIGUE CORRIENDO EN PARALELO como respaldo durante la migración.
// ============================================================================

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

// TODO (Ivan): misma región que en el codebase de appadrematasainterno — debe
// coincidir con la ubicación real de Firestore de ESTE proyecto.
const REGION = "us-central1";

// App local: alanis-operadores.
initializeApp();
const dbAlanis = getFirestore();

// App remota: appadrematasainterno. Requiere que la cuenta de servicio de
// runtime de ESTA función tenga el rol "Cloud Datastore User" otorgado en el
// proyecto appadrematasainterno (ver README de IAM).
const adrematasaApp = initializeApp(
  { credential: applicationDefault(), projectId: "appadrematasainterno" },
  "adrematasa"
);
const dbAdrematasa = getFirestore(adrematasaApp);

const COLECCION_REPO = "repositorio_mccain";
const COLECCION_PENDIENTES = "embarques_pendientes_origen";
const COLECCION_RESULTADO = "verificaciones_cfdi_resultado";
const COLECCION_USUARIOS_ALANIS = "usuarios";
const COLECCION_OPERADORES = "operadores_alanis";

const RESULTADOS_RECEPCION_VALIDOS = ["COINCIDE", "NO_COINCIDE_DOCUMENTO", "NO_COINCIDE_OPERADOR"];

// ============================================================================
// repositorio_mccain (ALANIS) → embarques_pendientes_origen +
// verificaciones_cfdi_resultado (ADREMATASA)
//
// Un solo trigger que cubre, sobre el MISMO snapshot `after`:
//   2) sincronizarPendientesOrigen_  (crear/actualizar o borrar el espejo de
//      "pendiente de escanear en origen")
//   3) sincronizarResultados_        (espejo de VALIDADO/DISCREPANCIA)
//   3b) sincronizarResultadoRecepcion_ (espejo del resultado de Checkpoint 1)
//   3c) limpiarResultadosObsoletos_  (borra el espejo de resultado si ya no
//      es cierto)
// ============================================================================
exports.procesarCambioRepositorioMccain = onDocumentWritten(
  {
    document: `${COLECCION_REPO}/{embarqueId}`,
    region: REGION,
    serviceAccount: "qr-cfdi-sync@alanis-operadores.iam.gserviceaccount.com",
  },
  async (event) => {
    const embarqueId = event.params.embarqueId;
    const after = event.data.after;

    const pendienteRef = dbAdrematasa.collection(COLECCION_PENDIENTES).doc(embarqueId);
    const resultadoRef = dbAdrematasa.collection(COLECCION_RESULTADO).doc(embarqueId);

    try {
      if (!after || !after.exists) {
        // El embarque ya no existe del lado de Alanis (típicamente, borrado
        // de prueba) — limpiar ambos espejos. Ver nota de "MEJORA" en el
        // codebase de appadrematasainterno.
        await Promise.all([
          pendienteRef.delete().catch(() => {}),
          resultadoRef.delete().catch(() => {}),
        ]);
        return;
      }

      const d = after.data();
      const uuidEsperado = d.uuidEsperado || "";
      const yaEscaneado = uuidEsperado !== "";

      // --- 2) sincronizarPendientesOrigen_ ---
      if (!yaEscaneado) {
        if (d.ocCliente || d.shipment) {
          const correccion = d.correccionDetectada || null;
          await pendienteRef.set({
            embarqueId,
            ocCliente: d.ocCliente || null,
            shipment: d.shipment || null,
            clienteNombre: d.clienteNombre || "McCain",
            caja: d.caja || null,
            fechaEntrega: d.fechaEntrega || null,
            uuidFactura: d.uuidFactura || null,
            correccionCajaAnterior: correccion ? correccion.cajaAnterior || null : null,
            correccionCajaNueva: correccion ? correccion.cajaNueva || null : null,
            correccionDetectadaEn: correccion ? correccion.detectadaEn || null : null,
            correccionAsuntoCorreo: correccion ? correccion.asuntoCorreo || null : null,
            correccionPostValidacion: d.estatusValidacion === "CORRECCION_PENDIENTE",
            actualizado: new Date().toISOString(),
          });
        }
      } else {
        await pendienteRef.delete().catch(() => {});
      }

      // --- 3) sincronizarResultados_ ---
      if (d.estatusValidacion === "VALIDADO" || d.estatusValidacion === "DISCREPANCIA") {
        await resultadoRef.set(
          {
            estatusValidacion: d.estatusValidacion,
            discrepanciaDetalle: d.discrepanciaDetalle || null,
            // uid del operador que hizo la validación de pre-entrega (Checkpoint 2).
            // Se guarda además del nombre para que ADREMATASA pueda resolver el
            // nombre correcto en vivo contra operadores_alanis, en vez de quedarse
            // con el texto que el operador haya tecleado al momento de validar.
            validadoPor: d.validadoPor || null,
            timestamp: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      // --- 3b) sincronizarResultadoRecepcion_ ---
      const recepcion = d.recepcionOperador || null;
      if (recepcion && RESULTADOS_RECEPCION_VALIDOS.includes(recepcion.resultado)) {
        await resultadoRef.set(
          {
            recepcionResultado: recepcion.resultado,
            recepcionOperadorNombre: recepcion.nombre || null,
            // uid del operador de Checkpoint 1 (Recepción) — mismo motivo que
            // validadoPor arriba: permite resolver el nombre correcto en vivo.
            recepcionOperadorUid: recepcion.uid || null,
            recepcionTimestamp: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      // --- 3c) limpiarResultadosObsoletos_ ---
      const estatusSigueVigente = d.estatusValidacion === "VALIDADO" || d.estatusValidacion === "DISCREPANCIA";
      const recepcionSigueVigente = yaEscaneado; // uuidEsperado no vacío
      if (!estatusSigueVigente && !recepcionSigueVigente) {
        await resultadoRef.delete().catch(() => {});
      }
    } catch (error) {
      logger.error(`[procesarCambioRepositorioMccain] embarqueId ${embarqueId}: ${error.message}`, error);
      throw error;
    }
  }
);

// ============================================================================
// usuarios (rol:'operador', activo:true) → operadores_alanis (ADREMATASA)
//
// Equivalente a sincronizarOperadoresAlanis_. Al ser un trigger por usuario,
// reacciona de inmediato cuando alguien se activa/desactiva o cambia de rol
// — no hace falta un barrido periódico de todo el catálogo.
// ============================================================================
exports.sincronizarOperadoresAlanis = onDocumentWritten(
  {
    document: `${COLECCION_USUARIOS_ALANIS}/{uid}`,
    region: REGION,
    serviceAccount: "qr-cfdi-sync@alanis-operadores.iam.gserviceaccount.com",
  },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data.after;
    const mirrorRef = dbAdrematasa.collection(COLECCION_OPERADORES).doc(uid);

    const calificaOperador = (data) => !!data && data.rol === "operador" && data.activo === true;

    try {
      if (!after || !after.exists || !calificaOperador(after.data())) {
        await mirrorRef.delete().catch(() => {});
        return;
      }

      const d = after.data();
      // nombreOficial (2026-09-14, pedido de Ivan): lo captura a mano el
      // admin en la pantalla de "Operadores registrados" — a diferencia de
      // "nombre" (que el propio operador auto-captura y a veces escribe con
      // mayúsculas/minúsculas inconsistentes), nombreOficial nunca lo toca
      // el operador. Si el admin lo dejó vacío, cae de regreso a "nombre"
      // para no dejar el espejo sin nombre.
      const nombreResuelto = (d.nombreOficial && d.nombreOficial.trim()) || d.nombre || null;
      await mirrorRef.set({
        nombre: nombreResuelto,
        numero: d.numero || null,
        activo: true,
      });
    } catch (error) {
      logger.error(`[sincronizarOperadoresAlanis] uid ${uid}: ${error.message}`, error);
      throw error;
    }
  }
);