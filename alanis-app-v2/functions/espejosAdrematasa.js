// ============================================================================
// Espejos en vivo → ADREMATASA (2026-10-16, pedido de Ivan).
//
// Cada vez que cambia un documento aquí (alanis-operadores), se copia su
// versión resumida a appadrematasainterno en 1–2 segundos. Así las pantallas
// de ADREMATASA (Aceptación de ingreso, Órdenes de trabajo, Operadores
// registrados, Turnos) leen localmente y en vivo, sin llamar funciones ni
// esperar arranques en frío.
//
// Mismo mecanismo y misma cuenta de servicio que sincronizarOperadoresAlanis
// (index.js): la app "adrematasa" ya está inicializada allá. Este archivo NO
// toca la app del operador ni ninguna colección de este proyecto: solo lee el
// cambio y escribe el espejo del otro lado.
//
// La forma de cada espejo está en espejosOperadoresComun.js (idéntico en los
// dos proyectos).
// ============================================================================

const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const comun = require("./espejosOperadoresComun");

const REGION = "us-central1";
const CUENTA = "qr-cfdi-sync@alanis-operadores.iam.gserviceaccount.com";
const dbAdrematasa = () => getFirestore(getApp("adrematasa"));

// Espejo 1 a 1: mismo id, se reemplaza completo o se borra.
function espejo(etiqueta, ruta, coleccionEspejo, transformar) {
  return onDocumentWritten({ document: ruta, region: REGION, serviceAccount: CUENTA }, async (event) => {
    const id = event.params.id;
    const after = event.data && event.data.after;
    const ref = dbAdrematasa().collection(coleccionEspejo).doc(id);
    try {
      const datos = after && after.exists ? transformar(after.data()) : null;
      if (!datos) {
        await ref.delete().catch(() => {});
      } else {
        await ref.set({ ...datos, espejoMs: Date.now() });
      }
    } catch (error) {
      logger.error(`[${etiqueta}] ${id}: ${error.message}`);
      throw error;
    }
  });
}

exports.espejoSolicitudesOperadores = espejo("espejoSolicitudesOperadores", "solicitudes/{id}", comun.COL.solicitudes, comun.solicitud);
exports.espejoOperadores = espejo("espejoOperadores", "usuarios/{id}", comun.COL.operadores, comun.operador);
exports.espejoOrdenesTrabajo = espejo("espejoOrdenesTrabajo", "ordenes_trabajo/{id}", comun.COL.ordenes, comun.orden);
exports.espejoAsignaciones = espejo("espejoAsignaciones", "asignaciones/{id}", comun.COL.asignaciones, comun.asignacion);

// Estatus de patio: los eventos solo se crean (no se editan). Se guarda el
// ÚLTIMO de cada operador; si llega uno más viejo (reintento), se ignora.
exports.espejoEstatusOperadores = onDocumentCreated({ document: "eventos/{id}", region: REGION, serviceAccount: CUENTA }, async (event) => {
  const ev = event.data && event.data.data();
  const est = comun.estatus(ev);
  if (!est) return;
  const db = dbAdrematasa();
  const ref = db.collection(comun.COL.estatus).doc(ev.uid);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && (snap.data().ms || 0) > (est.ms || 0)) return;
      tx.set(ref, { ...est, espejoMs: Date.now() });
    });
  } catch (error) {
    logger.error(`[espejoEstatusOperadores] ${ev.uid}: ${error.message}`);
    throw error;
  }
});