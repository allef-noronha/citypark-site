const { test } = require('node:test');
const assert = require('node:assert/strict');
const { refreshUnit } = require('./availability');

test('resumo relê estado atual, preserva outras unidades e não publica dados pessoais', async () => {
  const docs = {
    'unidades/u1': { unidade: '2208 A', status: 'vendida', cliente: 'privado', propostaAtualId: 'p1' },
    'disponibilidade_publica/atual': { unidades: { '101A': 'disponivel' }, fontes: { '101A': 'u2' } }
  };
  const db = { doc: path => path, runTransaction: fn => fn({
    get: async path => ({ exists: !!docs[path], data: () => docs[path] }),
    set: (path, data) => { docs[path] = data; }
  }) };
  await refreshUnit(db, 'u1', () => 1);
  assert.deepEqual(docs['disponibilidade_publica/atual'].unidades, { '101A': 'disponivel', '2208A': 'vendida' });
  assert.doesNotMatch(JSON.stringify(docs['disponibilidade_publica/atual']), /privado|p1/);
  // Evento antigo chega depois de distrato: lê disponível, não restaura venda.
  docs['unidades/u1'].status = 'disponivel';
  await refreshUnit(db, 'u1', () => 2);
  await refreshUnit(db, 'u1', () => 3);
  assert.equal(docs['disponibilidade_publica/atual'].unidades['2208A'], 'disponivel');
  docs['unidades/u1'].unidade = '2209 A';
  await refreshUnit(db, 'u1', () => 4);
  assert.equal(docs['disponibilidade_publica/atual'].unidades['2208A'], undefined);
  delete docs['unidades/u1'];
  await refreshUnit(db, 'u1', () => 5);
  assert.deepEqual(docs['disponibilidade_publica/atual'].unidades, { '101A': 'disponivel' });
});
