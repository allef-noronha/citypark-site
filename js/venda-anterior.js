import { runTransaction } from './transacao-estoque.js';
import { db } from './firebase.js';
import { collection, doc, getDocs, query, where,  serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

export function validatePreviousSale(input) {
  const snapshots = window.CityParkPreviousSaleModel.snapshots(input);
  const condition = window.CityParkPreviousSaleModel.buildCondition(input.condicao || {});
  if (typeof input.referencia !== 'string' || !input.referencia.trim() || input.referencia.length > 300) throw new Error('Preencha a referência documental.');
  if (input.condicoes != null && (typeof input.condicoes !== 'string' || input.condicoes.length > 4000)) throw new Error('Use até 4000 caracteres nas observações do contrato.');
  const date = new Date(input.dataVenda + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataVenda) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== input.dataVenda || input.dataVenda > window.CityParkPaymentPlan.todayInput()) throw new Error('Informe a data original da venda, sem data futura.');
  if (input.confirmado !== true) throw new Error('Confirme a conferência documental da venda comercial.');
  return {...input,...snapshots,condicaoProposta:condition,valorCentavos:condition.totalCalculadoCentavos,condicoes:input.condicoes?.trim() || condition.descricao};
}

export async function registerPreviousSale(data) {
  const input = validatePreviousSale(data);
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
    const unitSnapshot = {unidade:unit.unidade || id,tipologia:unit.tipologia || null,areaM2:Number.isFinite(unit.areaM2) ? unit.areaM2 : null};
    tx.set(proposalRef,{origem:'venda_anterior',statusProposta:'vendida',unidadeId:id,unidadeSnapshot:unitSnapshot,corretorId:null,corretorSnapshot:input.corretorSnapshot,cliente:input.cliente,condicaoProposta:input.condicaoProposta,declaracaoAceita:true,vendaAnterior:sale,adminId:uid,criadoEm:serverTimestamp(),atualizadoEm:serverTimestamp(),vendidoEm:new Date(input.dataVenda+'T12:00:00Z'),expiraEm:null});
    tx.update(unitRef,{propostaAtualId:proposalRef.id,atualizadoEm:serverTimestamp()});
    const history={propostaId:proposalRef.id,unidadeId:id,unidade:unit.unidade || id,corretorId:null,adminId:uid,data:serverTimestamp(),statusAnterior:'vendida',statusNovo:'vendida',acao:'venda anterior cadastrada',observacao:input.referencia.trim(),vendaAnterior:sale};
    tx.set(unitHistory,history); tx.set(proposalHistory,history);
  });
  return proposalRef.id;
}
