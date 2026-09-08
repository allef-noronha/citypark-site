// Executar uma vez após publicar o gatilho, com credenciais administrativas locais.
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { refreshUnit } = require('./availability');
const projectId = process.argv[2];
if (!projectId) throw new Error('Informe o projectId explicitamente.');
initializeApp({ projectId });
(async () => {
  const db = getFirestore();
  const units = await db.collection('unidades').get();
  for (const unit of units.docs) await refreshUnit(db, unit.id, () => FieldValue.serverTimestamp());
  console.log(`Resumo inicializado: ${units.size} unidades.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
