// backfill_uids.js — Corre UNA SOLA VEZ para rellenar retroactivamente
// recepcionOperadorUid / validadoPor en verificaciones_cfdi_resultado
// (ADREMATASA Interno), para los embarques que ya pasaron sus checkpoints
// ANTES del deploy de 2026-09-14 (cuando index.js empezó a reflejar esos
// uids).
//
// No reimplementa la lógica de espejo: solo "toca" cada documento de
// repositorio_mccain (le agrega/actualiza el campo backfillTouch) para que
// el trigger onDocumentWritten de procesarCambioRepositorioMccain —que ya
// está desplegado con la lógica nueva— lo vuelva a procesar él solo. Es
// seguro correrlo aunque un embarque no tenga nada que actualizar: la
// función ya trae sus propios "if" para cada caso.
//
// Uso (desde alanis-app-v2/functions/, donde ya está instalado
// firebase-admin como dependencia de las Cloud Functions):
//   node backfill_uids.js
//
// Usa ../serviceAccountKey.json (la misma credencial que ya vive en
// alanis-app-v2/) para autenticarse contra el proyecto alanis-operadores.

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('repositorio_mccain').get();
  console.log(`Encontrados ${snap.size} embarques en repositorio_mccain.`);

  let tocados = 0;
  for (const doc of snap.docs) {
    await doc.ref.update({
      backfillTouch: admin.firestore.FieldValue.serverTimestamp(),
    });
    tocados++;
    if (tocados % 20 === 0) console.log(`  ${tocados}/${snap.size}...`);
  }

  console.log(`Listo. Se tocaron ${tocados} embarques.`);
  console.log('Dale unos 10-20 segundos a las Cloud Functions para reprocesarlos antes de revisar ADREMATASA.');
}

main().catch((err) => {
  console.error('Error en el backfill:', err);
  process.exit(1);
});