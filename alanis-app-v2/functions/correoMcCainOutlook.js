// ##########################################################################
// PROYECTO: ALANIS OPERADORES  (Codespace: alanis-operadores)
// RUTA:     /workspaces/alanis-operadores/alanis-app-v2/functions/correoMcCainOutlook.js
// ##########################################################################
// Captura de correos McCain desde el Outlook de Atención al Cliente
// (2026-11-25, pedido de Ivan). Sustituye, sin apagarlo todavía, al VBA de la
// laptop de Ivan (Module1.ProcesarCorreoMcCain): misma lectura, mismo
// documento y mismos campos en repositorio_mccain, así que la sincronización
// hacia ADREMATASA y los checkpoints no cambian.
//
// recibirCorreoMcCain (HTTPS, POST): lo llama la macro de Outlook de la PC
// (modAdrematasaMcCain.bas). Cuerpo JSON:
//   { asunto, cuerpo, remitente, recibidoUtc (ISO), modo: "auto"|"boton",
//     adjuntos: [{ nombre, base64 }] }
// Encabezado X-Alanis-Token: código de la PC. Los códigos válidos viven en el
// secreto MCCAIN_OUTLOOK_TOKENS como JSON { "Litzy": "<código>", ... }; para
// revocar uno se cambia el secreto y se vuelve a desplegar. En la PC no hay
// contraseña de Firebase.
//
// Qué hace (igual que el VBA):
//   - Filtro: remitente @mccain.com, o asunto con SHIPMENT o CAJA.
//   - Del asunto: CAJA, SHIPMENT, OC:, CLIENTE (o CLEINTE), FECHA DE ENTREGA.
//   - Shipment del cuerpo y bandera de confianza (ALTA/MEDIA/REQUIERE_REVISION).
//   - UUID de la factura: Cadena Original del SAT del PDF (como hoy); si no se
//     pudo leer y viene el XML del CFDI, el UUID del XML.
//   - docId: shipment > "OC-<oc>" > "SINID-<fecha>".
//   - Si el documento ya existe: solo actualiza campos (nunca reemplaza todo);
//     detecta correcciones de caja (parche 2026-09-09) y, si ya estaba
//     validado, lo regresa a CORRECCION_PENDIENTE.
//   - Adjuntos a Storage: mccain/<aaaa-mm>/<nombre como hoy>.
//   - Aviso ntfy al canal de McCain.
//   - Bitácora: bitacora_captura_mccain/{huella del correo}. Un correo que ya
//     se procesó desde Outlook no se vuelve a procesar en automático (sí con
//     el botón).

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const crypto = require("crypto");

const REGION = "us-central1";
const COLECCION = "repositorio_mccain";
const BITACORA = "bitacora_captura_mccain";
const DOMINIO = "mccain.com";
const NTFY = "alanis-mccain-ivan-2026";
const ZONA = "America/Matamoros";
const MAX_ADJ_BYTES = 6 * 1024 * 1024;
const tokensOutlook = defineSecret("MCCAIN_OUTLOOK_TOKENS");
const VERSION = "2026-11-25a";

// ---------- Lectura del asunto/cuerpo (port directo del VBA) ----------
const ESPACIOS = new Set([" ", ":", "\t", " "]);
const indiceSinMayus = (texto, etiqueta, desde = 0) => texto.toUpperCase().indexOf(etiqueta.toUpperCase(), desde);

// Primer bloque de dígitos justo después de la etiqueta (solo espacios, ":" o tab en medio).
function primerBloqueDigitos(texto, etiqueta) {
  const p = indiceSinMayus(texto, etiqueta);
  if (p < 0) return "";
  let i = p + etiqueta.length, r = "";
  while (i < texto.length && ESPACIOS.has(texto[i])) i++;
  while (i < texto.length && texto[i] >= "0" && texto[i] <= "9") r += texto[i++];
  return r;
}
// Token después de la etiqueta, hasta espacio, tab, ":" o "/" (arreglo de "N410557// URGE").
function tokenDespues(texto, etiqueta) {
  const p = indiceSinMayus(texto, etiqueta);
  if (p < 0) return "";
  let r = "", empezo = false;
  for (let i = p + etiqueta.length; i < texto.length; i++) {
    const c = texto[i];
    if (c === " " || c === "\t" || c === ":" || c === "/" || c === " ") { if (empezo) break; }
    else { r += c; empezo = true; }
  }
  return r;
}
// Texto después de la etiqueta hasta el primer terminador de la lista.
function leerToken(texto, etiqueta, finales) {
  const p = indiceSinMayus(texto, etiqueta);
  if (p < 0) return "";
  let ini = p + etiqueta.length;
  while (ini < texto.length && (texto[ini] === ":" || texto[ini] === " ")) ini++;
  let fin = texto.length;
  for (const f of finales) { const fp = indiceSinMayus(texto, f, ini); if (fp >= 0 && fp < fin) fin = fp; }
  return texto.slice(ini, fin).trim();
}
const quitarAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
function sanitizar(s) {
  let r = quitarAcentos(String(s || "").trim()).replace(/[^A-Za-z0-9 _-]/g, "").replace(/[ _-]/g, "-").replace(/-+/g, "-").trim();
  if (r.length > 40) r = r.slice(0, 40);
  return r || "SinCliente";
}
const nz = (s, alt) => (String(s || "").trim() ? s : alt);
function esCorreoDeCorreccion(asunto, cuerpo) {
  const t = quitarAcentos(`${asunto} ${cuerpo}`).toUpperCase();
  return ["CORRECCION", "CORRIJO", "CORRIGE", "CORREGIR", "CORRIGIENDO"].some((p) => t.includes(p));
}

// ---------- Factura ----------
function extraerCadenaOriginal(texto) {
  const pE = indiceSinMayus(texto, "Cadena Original del Complemento de Certificaci");
  if (pE < 0) return "";
  const pI = texto.indexOf("||", pE);
  if (pI < 0) return "";
  const pF = texto.indexOf("||", pI + 2);
  if (pF < 0) return "";
  return texto.slice(pI, pF + 2).replace(/\s+/g, "");
}
const RE_UUID = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i;
const uuidDeTexto = (t) => { const m = RE_UUID.exec(t || ""); return m ? m[0].toUpperCase() : ""; };
async function textoDePdf(buffer) {
  try {
    // Se usa lib/pdf-parse.js directo: el index del paquete intenta abrir un PDF de prueba.
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const r = await pdfParse(buffer);
    return r.text || "";
  } catch (e) {
    logger.warn("correoMcCain: no se pudo leer un PDF", { error: e.message });
    return "";
  }
}
function uuidDeXml(texto) {
  const m = /TimbreFiscalDigital[^>]*\sUUID\s*=\s*"([^"]+)"/i.exec(texto || "");
  return m ? uuidDeTexto(m[1]) : "";
}

// ---------- Fechas ----------
function partesLocales(fecha) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(fecha).map((x) => [x.type, x.value]));
  return p; // year, month, day, hour, minute, second
}

// ---------- Auxiliares de la petición ----------
function usuarioDelToken(token) {
  let mapa = {};
  try { mapa = JSON.parse(tokensOutlook.value() || "{}"); } catch (e) { logger.error("correoMcCain: MCCAIN_OUTLOOK_TOKENS no es JSON válido"); return null; }
  const a = Buffer.from(String(token || ""));
  for (const [nombre, valor] of Object.entries(mapa)) {
    const b = Buffer.from(String(valor || ""));
    if (a.length >= 20 && a.length === b.length && crypto.timingSafeEqual(a, b)) return nombre;
  }
  return null;
}
async function avisarNtfy(titulo, mensaje, etiqueta) {
  try {
    await fetch(`https://ntfy.sh/${NTFY}`, { method: "POST", headers: { Title: quitarAcentos(titulo), Tags: etiqueta, "Content-Type": "text/plain; charset=utf-8" }, body: quitarAcentos(mensaje) });
  } catch (e) { logger.warn("correoMcCain: ntfy falló", { error: e.message }); }
}

exports.recibirCorreoMcCain = onRequest({ region: REGION, secrets: [tokensOutlook], memory: "512MiB", timeoutSeconds: 120, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "Solo POST" }); return; }
  const usuario = usuarioDelToken(req.get("X-Alanis-Token"));
  if (!usuario) { res.status(401).json({ ok: false, error: "Código de PC no válido" }); return; }

  const e = req.body || {};
  // Prueba de conexión desde la macro (ProbarConexionAdrematasa): no escribe nada.
  if (e.prueba === true) { res.json({ ok: true, prueba: true, usuario, version: VERSION }); return; }
  const asunto = String(e.asunto || "").slice(0, 1000);
  const cuerpo = String(e.cuerpo || "").slice(0, 200000);
  const remitente = String(e.remitente || "").trim().toLowerCase().slice(0, 200);
  const modo = e.modo === "boton" ? "boton" : "auto";
  const recibido = new Date(e.recibidoUtc);
  if (isNaN(recibido.getTime())) { res.status(400).json({ ok: false, error: "Falta la hora de recepción" }); return; }

  // Filtro (igual que el VBA).
  if (!remitente.includes(DOMINIO) && indiceSinMayus(asunto, "SHIPMENT") < 0 && indiceSinMayus(asunto, "CAJA") < 0) {
    res.json({ ok: true, ignorado: true, motivo: "No parece correo de McCain" });
    return;
  }

  const db = getFirestore();
  const huella = crypto.createHash("sha256").update(`${remitente}|${asunto}|${recibido.toISOString()}`).digest("hex").slice(0, 40);
  const refBit = db.collection(BITACORA).doc(huella);
  if (modo === "auto") {
    const previa = await refBit.get();
    if (previa.exists && previa.data().resultado === "ok") {
      const p = previa.data();
      res.json({ ok: true, repetido: true, docId: p.docId, shipment: p.shipment, oc: p.oc, caja: p.caja, confianza: p.confianza });
      return;
    }
  }

  try {
    // --- Asunto ---
    const caja = primerBloqueDigitos(asunto, "CAJA");
    const shipSubject = primerBloqueDigitos(asunto, "SHIPMENT");
    const oc = tokenDespues(asunto, "OC:");
    let cliente = leerToken(asunto, "CLIENTE", ["||", "//", "FECHA"]);
    if (!cliente) cliente = leerToken(asunto, "CLEINTE", ["||", "//", "FECHA"]);
    const fechaEnt = leerToken(asunto, "FECHA DE ENTREGA", ["||", "//"]);
    // --- Cuerpo y confianza ---
    const shipBody = primerBloqueDigitos(cuerpo, "SHIPMENT");
    let confianza, obs = "";
    if (shipSubject && shipBody) {
      if (shipSubject === shipBody) confianza = "ALTA";
      else { confianza = "REQUIERE_REVISION"; obs = `Shipment NO coincide: asunto=${shipSubject} cuerpo=${shipBody}`; }
    } else if (shipSubject || shipBody) { confianza = "MEDIA"; obs = "Shipment de una sola fuente"; }
    else { confianza = "REQUIERE_REVISION"; obs = oc ? `Sin SHIPMENT; se uso OC ${oc}` : "Sin SHIPMENT ni OC en el asunto"; }
    const shipment = shipSubject || shipBody;

    // --- docId (igual que el VBA) ---
    const L = partesLocales(recibido);
    const docId = shipment ? shipment : (oc ? `OC-${sanitizar(oc)}` : `SINID-${L.year}${L.month}${L.day}-${L.hour}${L.minute}${L.second}`);

    // --- Adjuntos: factura + Storage ---
    const lista = Array.isArray(e.adjuntos) ? e.adjuntos.slice(0, 10) : [];
    let cadenaOriginalSAT = "", uuidFactura = "", uuidXml = "";
    const adjuntos = [];
    let idx = 0, erroresStorage = 0;
    for (const a of lista) {
      const nombreOrig = String(a && a.nombre || "");
      const ext = (nombreOrig.match(/\.[A-Za-z0-9]+$/) || [""])[0].toLowerCase();
      let buf;
      try { buf = Buffer.from(String(a && a.base64 || ""), "base64"); } catch (x) { continue; }
      if (!buf.length || buf.length > MAX_ADJ_BYTES) continue;
      idx++;
      const nombre = `MCCAIN_SHIP-${nz(shipment, nz(oc, "SD"))}_CAJA-${nz(caja, "SD")}_${sanitizar(cliente)}_REC-${L.year}${L.month}${L.day}-${L.hour}${L.minute}${L.second}_${String(idx).padStart(2, "0")}${ext}`.replace(/[\\/:*?"<>|]/g, "_");
      const ruta = `mccain/${L.year}-${L.month}/${nombre}`;
      try {
        await getStorage().bucket().file(ruta).save(buf, { resumable: false, contentType: ext === ".pdf" ? "application/pdf" : ext === ".xml" ? "application/xml" : "application/octet-stream" });
        adjuntos.push({ nombre, rutaStorage: ruta, nombreOriginal: nombreOrig });
      } catch (x) {
        erroresStorage++;
        logger.error("correoMcCain: no se pudo guardar en Storage", { ruta, error: x.message });
        adjuntos.push({ nombre, rutaStorage: "", nombreOriginal: nombreOrig });
      }
      if (ext === ".pdf" && !cadenaOriginalSAT) {
        const cad = extraerCadenaOriginal(await textoDePdf(buf));
        if (cad) { cadenaOriginalSAT = cad; uuidFactura = uuidDeTexto(cad); }
      }
      if (ext === ".xml" && !uuidXml) uuidXml = uuidDeXml(buf.toString("utf8"));
    }
    let uuidSoloXml = false;
    if (!uuidFactura && uuidXml) { uuidFactura = uuidXml; uuidSoloXml = true; }
    if (!uuidFactura) obs = (obs ? obs + " | " : "") + "No se pudo leer la Cadena Original del SAT del PDF adjunto.";
    else if (uuidSoloXml) obs = (obs ? obs + " | " : "") + "UUID tomado del XML (no se leyó la Cadena Original del PDF).";

    // --- Firestore (misma lógica que EscribirEmbarqueFirestore del VBA) ---
    const ref = db.collection(COLECCION).doc(docId);
    const fhRecep = Timestamp.fromDate(recibido);
    const captura = { via: "outlook", usuario, modo, version: VERSION, en: FieldValue.serverTimestamp() };
    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const previo = snap.exists ? snap.data() : null;
      const datos = {
        shipment, ocCliente: oc, caja, clienteNombre: cliente, fechaEntrega: fechaEnt,
        remitente, asuntoOriginal: asunto, fechaCorreo: fhRecep, ultimaCaptura: captura,
      };
      let esCorreccion = false, yaValidado = false, cajaExistente = "";
      if (previo) {
        cajaExistente = String(previo.caja || "");
        const uuidEsperadoExistente = String(previo.uuidEsperado || "");
        const estatusExistente = String(previo.estatusValidacion || "");
        esCorreccion = !!caja && !!cajaExistente && caja !== cajaExistente && esCorreoDeCorreccion(asunto, cuerpo);
        yaValidado = !!uuidEsperadoExistente || (!!estatusExistente && estatusExistente !== "PENDIENTE");
      }
      if (esCorreccion) {
        datos.confianzaDatos = "REQUIERE_REVISION";
        datos.observaciones = `CORRECCION recibida ${L.year}-${L.month}-${L.day} ${L.hour}:${L.minute}: caja ${cajaExistente} -> ${caja}. ${obs}`;
        datos.correccionDetectada = { cajaAnterior: cajaExistente, cajaNueva: caja, detectadaEn: fhRecep, asuntoCorreo: asunto };
        if (yaValidado) Object.assign(datos, { estatusValidacion: "CORRECCION_PENDIENTE", uuidEsperado: "", receptorRFCEsperado: "", validadoPor: "" });
      } else {
        datos.confianzaDatos = confianza;
        datos.observaciones = obs;
      }
      if (cadenaOriginalSAT) { datos.cadenaOriginalSAT = cadenaOriginalSAT; datos.uuidFactura = uuidFactura; }
      else if (uuidFactura && (!previo || !previo.uuidFactura)) datos.uuidFactura = uuidFactura; // solo XML: no pisa uno ya leído
      if (adjuntos.length) datos.adjuntos = adjuntos;

      if (previo) {
        tx.update(ref, datos); // nunca reemplazo total
      } else {
        Object.assign(datos, {
          estatusValidacion: "PENDIENTE", validadoPor: "", uuidEsperado: "", receptorRFCEsperado: "",
          origen: "VBA", // mismo valor que el VBA: la sincronización no distingue
          createdAt: FieldValue.serverTimestamp(), fechaPrimerCorreo: fhRecep,
        });
        if (!("cadenaOriginalSAT" in datos)) datos.cadenaOriginalSAT = "";
        if (!("uuidFactura" in datos)) datos.uuidFactura = "";
        if (!("adjuntos" in datos)) datos.adjuntos = [];
        tx.set(ref, datos);
      }
      return { nuevo: !previo, esCorreccion, yaValidado, cajaExistente };
    });

    const salida = { ok: true, docId, shipment, oc, caja, cliente, confianza: resultado.esCorreccion ? "REQUIERE_REVISION" : confianza, uuidLeido: !!uuidFactura, adjuntos: adjuntos.length, nuevo: resultado.nuevo, correccion: resultado.esCorreccion };
    if (erroresStorage) salida.aviso = `${erroresStorage} adjunto(s) no se pudieron guardar en Storage`;

    await refBit.set({
      resultado: "ok", usuario, modo, docId, shipment, oc, caja, confianza: salida.confianza, uuidLeido: salida.uuidLeido,
      adjuntos: adjuntos.length, remitente, asunto, recibido: fhRecep, nuevo: resultado.nuevo, correccion: resultado.esCorreccion,
      version: VERSION, veces: FieldValue.increment(1), ultimaVez: FieldValue.serverTimestamp(),
    }, { merge: true });

    await avisarNtfy(`Nueva instruccion McCain (${usuario})`,
      `SHIP ${nz(shipment, "s/d")} | OC ${nz(oc, "s/d")} | CAJA ${nz(caja, "s/d")}\nConfianza: ${salida.confianza}\n${adjuntos.length} adjunto(s) | UUID: ${uuidFactura ? "leido" : "NO leido"}`,
      salida.confianza === "ALTA" ? "incoming_envelope" : "warning");
    if (resultado.esCorreccion && resultado.yaValidado) {
      await avisarNtfy("CORRECCION McCain - requiere revalidar",
        `Embarque ${docId}: caja cambio de ${resultado.cajaExistente} a ${caja}. Ya tenia validacion(es) hecha(s) con la caja anterior - se marco CORRECCION_PENDIENTE y vuelve a pendientes de origen.`, "warning");
    }
    res.json(salida);
  } catch (err) {
    logger.error("correoMcCain: falló", { version: VERSION, usuario, asunto, error: err.message });
    try { await refBit.set({ resultado: "error", error: String(err.message || err).slice(0, 500), usuario, modo, asunto, remitente, version: VERSION, ultimaVez: FieldValue.serverTimestamp() }, { merge: true }); } catch (x) { /* nada */ }
    res.status(500).json({ ok: false, error: String(err.message || err).slice(0, 300) });
  }
});