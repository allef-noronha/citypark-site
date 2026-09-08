const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { refreshUnit } = require('./availability');
initializeApp();
exports.atualizarDisponibilidade = onDocumentWritten({ document: 'unidades/{unitId}', retry: true }, async event => {
  await refreshUnit(getFirestore(), event.params.unitId, () => FieldValue.serverTimestamp());
});
