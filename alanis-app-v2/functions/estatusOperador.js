// ============================================================================
// Estatus del operador controlado por el servidor (2026-10-19, pedido de Ivan).
//
// 1) Una OT pone al operador EN TALLER sola, venga de donde venga (su app,
//    ADREMATASA o admin2.js), y lo deja ahí hasta que un Coordinador o admin
//    la TERMINE en ADREMATASA (terminarOrdenTrabajo, en el otro proyecto).
//    Mientras tenga una OT abierta no puede reportar ningún estatus
//    (firestore.rules lo hace cumplir, no solo la pantalla).
// 2) estatus_operador/{uid} (solo lo escribe este archivo; el operador solo
//    lo lee) junta lo que la app necesita para mostrar el estatus y los
//    BLOQUEOS: OTs abiertas + último estatus de patio.
// 3) reportarTallerOperador: el operador reporta Taller desde su app y aquí
//    se crea la OT con el MISMO folio consecutivo de ADREMATASA ("00013-26",
//    contador contadores/ordenes_trabajo_<año>) + su evento de Taller.
//
// Qué OTs cuentan: solo las que nacen a partir de este cambio. Al crearse,
// si su uid es de un operador, el trigger les pone estado:'abierta'. Las
// OTs viejas (sin estado) nunca bloquean a nadie, aunque se editen.
// ============================================================================

const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

const REGION = "us-central1";
const TZ = "America/Matamoros";
const COL_ESTATUS = "estatus_operador";
const ESTATUS_PATIO = ["disponible", "taller", "enfermo", "permiso", "vacaciones", "incapacitado", "liberado_taller"];
const SEVERIDADES = ["alta", "media", "baja"];
const db = () => getFirestore(); // app por default = alanis-operadores

function fechaHoraLocal_() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const v = (t) => (partes.find((p) => p.type === t) || {}).value || "";
  const hora = v("hour") === "24" ? "00" : v("hour");
  return { fecha: `${v("year")}-${v("month")}-${v("day")}`, hora: `${hora}:${v("minute")}` };
}

function aMs_(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  return null;
}

function resumenOT_(id, o) {
  return {
    id,
    folio: String(o.folio || ""),
    unidad: String(o.unidad || o.numero || ""),
    fallas: (Array.isArray(o.fallas) ? o.fallas : []).map((f) => f && f.name).filter(Boolean).slice(0, 12),
    creadaMs: aMs_(o.timestamp) || Date.now(),
    creadaDesde: o.creadaDesde || null,
    creadoPorNombre: (o.creadoPorAdrematasa && o.creadoPorAdrematasa.nombre) || null,
  };
}

async function esOperador_(uid) {
  if (!uid || typeof uid !== "string" || uid.includes("/")) return null;
  const snap = await db().collection("usuarios").doc(uid).get();
  return snap.exists && snap.data().rol === "operador" ? snap.data() : null;
}

function eventoSistema_(uid, datos, estatus, label, extra) {
  const { fecha, hora } = fechaHoraLocal_();
  return {
    uid,
    operador: datos.operador || "",
    numero: datos.numero || "",
    estatus,
    estatus_ids: [estatus],
    estatus_label: label,
    categoria: "patio",
    fecha, hora,
    gps: null,
    viaje_id: null,
    origen: "sistema",
    timestamp: FieldValue.serverTimestamp(),
    ...extra,
  };
}

// ---- 1) OTs → estatus del operador ------------------------------------------
exports.estatusOperadorPorOT = onDocumentWritten({ document: "ordenes_trabajo/{id}", region: REGION }, async (event) => {
  const id = event.params.id;
  const antes = event.data.before.exists ? event.data.before.data() : null;
  const despues = event.data.after.exists ? event.data.after.data() : null;

  try {
    // OT nueva sin estado: si es de un operador, se marca 'abierta'. Si NO
    // viene de su app (ADREMATASA/admin2), además se registra su evento de
    // Taller (desde su app, reportarTallerOperador ya lo registró).
    if (!antes && despues && !despues.estado) {
      const op = await esOperador_(despues.uid);
      if (!op) return;
      await event.data.after.ref.update({ estado: "abierta" });
      if (despues.creadaDesde !== "app_operador") {
        await db().collection("eventos").add(eventoSistema_(despues.uid, {
          operador: op.nombreOficial || op.nombre || despues.operador || "",
          numero: op.numero || despues.unidad || "",
        }, "taller", "Taller", {
          fallas: Array.isArray(despues.fallas) ? despues.fallas : [],
          otId: id, otFolio: despues.folio || "",
        }));
      }
      return; // el update de arriba vuelve a disparar este trigger y arma la lista
    }

    // Solo cuentan las OTs con estado (las que nacieron con este cambio).
    const rastreada = (d) => d && (d.estado === "abierta" || d.estado === "terminada");
    if (!rastreada(antes) && !rastreada(despues)) return;

    const uids = new Set([antes && antes.uid, despues && despues.uid].filter(Boolean));
    for (const uid of uids) {
      const op = await esOperador_(uid);
      if (!op) continue;
      const ref = db().collection(COL_ESTATUS).doc(uid);
      const liberar = await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const lista = (snap.exists && Array.isArray(snap.data().otsAbiertas)) ? snap.data().otsAbiertas : [];
        const otras = lista.filter((x) => x.id !== id);
        const abierta = despues && despues.uid === uid && despues.estado === "abierta";
        const nueva = abierta ? [...otras, resumenOT_(id, despues)] : otras;
        tx.set(ref, { uid, otsAbiertas: nueva, actualizadoMs: Date.now() }, { merge: true });
        return lista.length > 0 && nueva.length === 0;
      });
      // Se terminó (o borró) su última OT abierta: sale de Taller.
      if (liberar) {
        await db().collection("eventos").add(eventoSistema_(uid, {
          operador: op.nombreOficial || op.nombre || "",
          numero: op.numero || "",
        }, "liberado_taller", "Liberado de taller", {
          otId: id,
          otFolio: (despues && despues.folio) || (antes && antes.folio) || "",
          terminadaPor: (despues && despues.terminadaPor && despues.terminadaPor.nombre) || null,
        }));
      }
    }
  } catch (error) {
    logger.error(`[estatusOperadorPorOT] ${id}: ${error.message}`);
    throw error;
  }
});

// ---- 2) Eventos de patio → último estatus ------------------------------------
exports.estatusOperadorPorEvento = onDocumentCreated({ document: "eventos/{id}", region: REGION }, async (event) => {
  const ev = event.data && event.data.data();
  if (!ev || !ev.uid) return;
  const idEst = ev.estatus || (Array.isArray(ev.estatus_ids) ? ev.estatus_ids[0] : "");
  if (!ESTATUS_PATIO.includes(idEst)) return;
  const ms = aMs_(ev.timestamp) || Date.now();
  const ref = db().collection(COL_ESTATUS).doc(ev.uid);
  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const previo = snap.exists && snap.data().ultimo;
      if (previo && (previo.ms || 0) > ms) return;
      tx.set(ref, {
        uid: ev.uid,
        ultimo: {
          id: idEst, ms, fecha: ev.fecha || "", hora: ev.hora || "",
          origen: ev.origen || "operador",
          gpsPrecision: ev.gps && typeof ev.gps.precision === "number" ? ev.gps.precision : null,
          distanciaPatioM: typeof ev.distanciaPatioM === "number" ? ev.distanciaPatioM : null,
        },
        actualizadoMs: Date.now(),
      }, { merge: true });
    });
  } catch (error) {
    logger.error(`[estatusOperadorPorEvento] ${ev.uid}: ${error.message}`);
    throw error;
  }
});

// ---- 3) El operador reporta Taller desde su app ------------------------------
// entrada: { fallas: [{ id, cat, name, sev }], gps?: { lat, lng, precision } }
exports.reportarTallerOperador = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión de nuevo.");
  const uid = request.auth.uid;
  const op = await esOperador_(uid);
  if (!op || op.activo === false) throw new HttpsError("permission-denied", "Tu cuenta no está activa como operador.");

  const e = request.data || {};
  const lista = Array.isArray(e.fallas) ? e.fallas : [];
  if (lista.length === 0) throw new HttpsError("invalid-argument", "Selecciona al menos una falla.");
  if (lista.length > 60) throw new HttpsError("invalid-argument", "Demasiadas fallas en un solo reporte.");
  const fallas = lista.map((f) => {
    const name = f && typeof f.name === "string" ? f.name.trim().slice(0, 150) : "";
    if (!name) throw new HttpsError("invalid-argument", "Hay una falla sin nombre.");
    return {
      id: typeof f.id === "number" && isFinite(f.id) ? f.id : null,
      cat: typeof f.cat === "string" ? f.cat.trim().slice(0, 80) : "Sin clasificar",
      name,
      sev: SEVERIDADES.includes(f.sev) ? f.sev : "media",
    };
  });
  let gps = null;
  if (e.gps && typeof e.gps.lat === "number" && typeof e.gps.lng === "number") {
    gps = { lat: e.gps.lat, lng: e.gps.lng, precision: typeof e.gps.precision === "number" ? Math.round(e.gps.precision) : null };
  }

  const refEstatus = db().collection(COL_ESTATUS).doc(uid);
  const est = await refEstatus.get();
  if (est.exists && Array.isArray(est.data().otsAbiertas) && est.data().otsAbiertas.length > 0) {
    throw new HttpsError("failed-precondition", "Ya tienes una orden de trabajo abierta. Espera a que Operaciones la termine.");
  }

  const { fecha, hora } = fechaHoraLocal_();
  const anio = Number(fecha.slice(0, 4));
  const nombre = op.nombreOficial || op.nombre || "";
  const unidad = String(op.numero || "");
  const refContador = db().collection("contadores").doc(`ordenes_trabajo_${anio}`);
  const refOT = db().collection("ordenes_trabajo").doc();
  const refEv = db().collection("eventos").doc();

  try {
    const folio = await db().runTransaction(async (tx) => {
      const snapC = await tx.get(refContador);
      const siguiente = (snapC.exists ? Number(snapC.data().ultimo) || 0 : 0) + 1;
      if (siguiente > 99999) throw new HttpsError("resource-exhausted", "Se llegó al límite de folios del año.");
      const nuevoFolio = `${String(siguiente).padStart(5, "0")}-${String(anio).slice(-2)}`;
      tx.set(refContador, { ultimo: siguiente, anio, actualizado: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(refOT, {
        folio: nuevoFolio, anio, uid,
        operador: nombre, numero: unidad, unidad, fallas,
        fecha, hora,
        timestamp: FieldValue.serverTimestamp(),
        creadaDesde: "app_operador",
        estado: "abierta",
      });
      tx.set(refEv, {
        uid, operador: nombre, numero: unidad,
        estatus: "taller", estatus_ids: ["taller"], estatus_label: "Taller",
        categoria: "patio", fecha, hora, gps, viaje_id: null,
        fallas, otId: refOT.id, otFolio: nuevoFolio,
        origen: "operador",
        timestamp: FieldValue.serverTimestamp(),
      });
      return nuevoFolio;
    });
    logger.info(`[reportarTallerOperador] ${folio} uid=${uid}`);
    return { ok: true, folio, otId: refOT.id };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error(`[reportarTallerOperador] ${uid}: ${error.message}`);
    throw new HttpsError("internal", "No se pudo registrar el taller. Intenta de nuevo.");
  }
});