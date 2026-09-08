import { db } from './firebase.js';
import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

export function validatePreviousSale(input) {
  for (const [key, max] of Object.entries({cliente:200,corretor:200,condicoes:4000,referencia:300})) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max) throw new Error('Preencha cliente, corretor, condições e referência documental.');
  }
  if (!Number.isSafeInteger(input.valorCentavos) || input.valorCentavos <= 0 || input.valorCentavos > 100000000000) throw new Error('Informe um valor de venda válido.');
  const date = new Date(input.dataVenda + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataVenda) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== input.dataVenda || input.dataVenda > new Date().toISOString().slice(0,10)) throw new Error('Informe a data original da venda, sem data futura.');
  if (input.confirmado !== true) throw new Error('Confirme a conferência documental da venda comercial.');
}

export async function registerPreviousSale(input) {
  validatePreviousSale(input);
  const {id,uid} = input;
  const existing = await getDocs(query(collection(db,'propostas'),where('unidadeId','==',id)));
  const proposalRef = doc(db,'propostas',`venda-anterior-${id}`);
  const unitRef = doc(db,'unidades',id);
  const unitHistory = doc(db,'historico_unidades',proposalRef.id);
  const proposalHistory = doc(db,'historico_propostas',proposalRef.id);
  await runTransaction(db,async tx => {
    const [us,ps,...previous] = await Promise.all([tx.get(unitRef),tx.get(proposalRef),...existing.docs.map(item=>tx.get(item.ref))]);
    if (!us.exists()) throw new Error('Unidade não encontrada.');
    const unit=us.data();
    if (ps.exists() || unit.propostaAtualId || unit.propostaId) throw new Error('Já existe proposta vinculada ou cadastro anterior. Confira o histórico da unidade.');
    if (unit.status !== 'vendida' || !['venda','nao_classificada'].includes(unit.destinacao || 'nao_classificada')) throw new Error('Use apenas em unidade vendida comercialmente; Administração e permuta não são aceitas.');
    if (previous.some(item=>item.exists() && !['recusada','cancelada','expirada','distratada','teste_invalidado'].includes(item.data().statusProposta))) throw new Error('Há proposta ativa ou legada pendente. Confira o vínculo antes de cadastrar outra venda.');
    const sale = {dataVenda:input.dataVenda,valorCentavos:input.valorCentavos,condicoes:input.condicoes.trim(),referencia:input.referencia.trim(),conferidoPor:uid};
    tx.set(proposalRef,{origem:'venda_anterior',statusProposta:'vendida',unidadeId:id,unidadeSnapshot:{unidade:unit.unidade || id},corretorId:null,corretorSnapshot:{nome:input.corretor.trim()},cliente:{nomeCompleto:input.cliente.trim()},vendaAnterior:sale,adminId:uid,criadoEm:serverTimestamp(),atualizadoEm:serverTimestamp(),vendidoEm:new Date(input.dataVenda+'T12:00:00Z'),expiraEm:null});
    tx.update(unitRef,{propostaAtualId:proposalRef.id,atualizadoEm:serverTimestamp()});
    const history={propostaId:proposalRef.id,unidadeId:id,unidade:unit.unidade || id,corretorId:null,adminId:uid,data:serverTimestamp(),statusAnterior:'vendida',statusNovo:'vendida',acao:'venda anterior cadastrada',observacao:input.referencia.trim(),vendaAnterior:sale};
    tx.set(unitHistory,history); tx.set(proposalHistory,history);
  });
  return proposalRef.id;
}
