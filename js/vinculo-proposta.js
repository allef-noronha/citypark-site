import { runTransaction } from './transacao-estoque.js';
import { db } from './firebase.js';
import { collection, doc, getDocs, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

export async function linkExistingSale({ id, proposalId, uid, reason, reference, confirmed }) {
  if (!proposalId || confirmed !== true) throw new Error('Selecione a proposta e confirme a conferência dos documentos.');
  if (!reason?.trim() || reason.length > 2000 || !reference?.trim() || reference.length > 300) throw new Error('Informe motivo e referência documental.');
  const existing = await getDocs(query(collection(db, 'propostas'), where('unidadeId', '==', id)));
  const unitRef = doc(db, 'unidades', id);
  const proposalRef = doc(db, 'propostas', proposalId);
  const unitHistory = doc(collection(db, 'historico_unidades'));
  const proposalHistory = doc(db, 'historico_propostas', unitHistory.id);
  await runTransaction(db, async tx => {
    const [us, ps, ...others] = await Promise.all([
      tx.get(unitRef), tx.get(proposalRef), ...existing.docs.filter(item => item.id !== proposalId).map(item => tx.get(item.ref))
    ]);
    if (!us.exists() || !ps.exists()) throw new Error('Unidade ou proposta não encontrada. Atualize o Mapa.');
    const unit = us.data(), proposal = ps.data();
    if (unit.propostaAtualId || unit.propostaId) throw new Error('A unidade já possui proposta vinculada. Reabra a unidade.');
    if (unit.status !== 'vendida' || !['venda', 'nao_classificada'].includes(unit.destinacao || 'nao_classificada')) throw new Error('O vínculo exige uma unidade comercial vendida.');
    if (proposal.unidadeId !== id || proposal.statusProposta !== 'vendida') throw new Error('Selecione uma proposta vendida desta mesma unidade.');
    const inactive = ['recusada', 'cancelada', 'expirada', 'distratada', 'teste_invalidado'];
    if (others.some(item => item.exists() && !inactive.includes(item.data().statusProposta))) throw new Error('Há outra proposta ativa ou legada pendente nesta unidade. Confira os registros antes de vincular.');
    tx.update(unitRef, { propostaAtualId: proposalId, atualizadoEm: serverTimestamp(), vinculoHistoricoId: unitHistory.id });
    const history = { unidadeId: id, unidade: unit.unidade || id, propostaId: proposalId,
      acao: 'proposta vinculada a unidade vendida', statusAnterior: 'vendida', statusNovo: 'vendida',
      adminId: uid, corretorId: proposal.corretorId || null, observacao: reason.trim(), referencia: reference.trim(), data: serverTimestamp() };
    tx.set(unitHistory, history);
    tx.set(proposalHistory, history);
  });
  return proposalId;
}
