import { db } from './firebase.js';
import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
import { validateAdjustment } from './estoque.js';

export async function adjustUnit({ id, expectedStatus, expectedDestination, nextStatus, nextDestination, reason, reference, uid }) {
  const proposals = await getDocs(query(collection(db, 'propostas'), where('unidadeId', '==', id)));
  const unitRef = doc(db, 'unidades', id);
  const historyRef = doc(collection(db, 'historico_unidades'));
  await runTransaction(db, async tx => {
    const unitSnapshot = await tx.get(unitRef);
    const proposalSnapshots = await Promise.all(proposals.docs.map(item => tx.get(item.ref)));
    if (!unitSnapshot.exists()) throw new Error('Unidade não encontrada.');
    const unit = unitSnapshot.data();
    if (unit.status !== expectedStatus || (unit.destinacao || 'nao_classificada') !== expectedDestination) throw new Error('Unidade alterada por outra sessão. Reabra a unidade.');
    validateAdjustment(unit, proposalSnapshots.filter(item => item.exists()).map(item => item.data()), nextStatus, nextDestination, reason, reference);
    tx.update(unitRef, { status: nextStatus, destinacao: nextDestination, atualizadoEm: serverTimestamp(),
      ajusteHistoricoId: historyRef.id, expiraEm: null,
      ...(nextStatus === 'vendida' && unit.status !== 'vendida' ? {vendidoEm:serverTimestamp()} : {}),
      ...(nextStatus !== 'vendida' ? {vendidoEm:null} : {}) });
    tx.set(historyRef, { unidadeId:id, unidade:unit.unidade || id, acao:'ajuste administrativo',
      statusAnterior:unit.status, statusNovo:nextStatus, destinacaoAnterior:unit.destinacao || 'nao_classificada', destinacaoNova:nextDestination,
      vendidoEmAnterior:unit.vendidoEm || null, propostaId:null, corretorId:null, adminId:uid,
      observacao:reason.trim(), referencia:reference.trim(), data:serverTimestamp() });
  });
}
