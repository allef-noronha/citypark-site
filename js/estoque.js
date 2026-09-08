// Classificação centralizada. As sugestões só viram dados após confirmação administrativa.
export const ADMINISTRATION_UNITS = ['709A', '909A', '910A', '1005B', '1006B', '1105B', '1106B', '1108B', '1306B'];
export const unitCode = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const destination = unit => unit.destinacao || 'nao_classificada';
export const destinationLabel = value => ({venda:'Venda comercial',administracao:'Administração',permuta:'Permuta',nao_classificada:'Não classificada'})[value] || 'Não classificada';
export function inInventoryScope(unit, scope) {
  if (scope === 'comercial') return destination(unit) !== 'administracao';
  if (scope === 'vendas') return destination(unit) === 'venda';
  if (scope === 'administracao' || scope === 'permuta') return destination(unit) === scope;
  return true;
}
export function validateAdjustment(unit, proposals, nextStatus, nextDestination, reason, reference) {
  if (!reason?.trim() || reason.length > 2000 || !reference?.trim() || reference.length > 300) throw new Error('Informe motivo (até 2000 caracteres) e referência (até 300).');
  if (!['venda','administracao','permuta'].includes(nextDestination)) throw new Error('Destinação inválida.');
  if (!['disponivel','reservada','vendida','bloqueada'].includes(nextStatus)) throw new Error('Status inválido.');
  if (nextDestination === 'administracao' && nextStatus !== 'bloqueada') throw new Error('Unidades da Administração devem ficar bloqueadas.');
  if (nextDestination === 'permuta' && !['bloqueada','vendida'].includes(nextStatus)) throw new Error('Permuta deve ficar bloqueada ou concluída como vendida.');
  if (unit.propostaAtualId || unit.propostaId) throw new Error('Existe vínculo com proposta. Use o fluxo da proposta ou confira o vínculo.');
  const inactive = ['recusada','cancelada','expirada','distratada','teste_invalidado'];
  if (proposals.some(item => !inactive.includes(item.statusProposta))) throw new Error('Existe proposta ativa ou legada sem encerramento confirmado. Confira as propostas antes de ajustar.');
}
