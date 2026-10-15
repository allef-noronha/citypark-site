const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/venda-anterior-modelo.js');
const fixture = require('./previous-sale-fixture.cjs');

test('contrato histórico monta o mesmo schema e soma sinal, parcelas e financiamento em centavos', () => {
  const c = model.buildCondition(fixture().condicao);
  assert.equal(c.schemaVersao, 3);
  assert.equal(c.totalCalculadoCentavos, 12345678);
  assert.equal(c.diferencaCentavos, 2654322);
  assert.equal(Object.keys(c.componentes.parcelas).length, 12);
  assert.equal(c.componentes.parcelas.grupo01.vencimentos.length, 10);
  assert.equal(c.componentes.parcelas.grupo01.vencimentos[3].getDate(), 28);
  assert.equal(c.componentes.parcelas.grupo01.vencimentos[4].getDate(), 30);
  assert.equal(c.componentes.chaves.primeiroVencimento, null);
});

test('calendário conserva dia 30 após fevereiro, inclusive bissexto, para todas as periodicidades', () => {
  for (const [periodicidade, count, month] of [['mensal',3,'2024-01'],['semestral',3,'2023-08'],['anual',3,'2024-02'],['outra',1,'2024-02']]) {
    const c = model.buildCondition({valorTabelaCentavos:100000, parcelas:[{periodicidade, quantidade:count, valorUnitarioCentavos:100, mes:month, dia:30, descricao:'Parcela contratual'}]});
    const dates = c.componentes.parcelas.grupo01.vencimentos;
    assert.equal(dates.length, count);
    assert.ok(dates.every(date => date.getDate() === (date.getMonth() === 1 ? (date.getFullYear() % 4 === 0 ? 29 : 28) : 30)));
  }
});

test('normaliza snapshots completos PF/PJ sem transportar dados da outra modalidade', () => {
  const pf = model.snapshots(fixture());
  assert.equal(pf.cliente.cpf, '52998224725');
  assert.equal(pf.cliente.cnpj, null);
  assert.equal(pf.corretorSnapshot.creci, '12345-F');
  const pj = model.snapshots(fixture({cliente:{tipoCliente:'PJ',razaoSocial:'Empresa',cnpj:'12.345.678/0001-90',telefoneComercial:'(11) 3333-4444',emailComercial:'EMPRESA@example.test'}}));
  assert.equal(pj.cliente.nomeCompleto, 'Empresa');
  assert.equal(pj.cliente.cnpj, '12345678000190');
  assert.equal(pj.cliente.cpf, null);
  assert.equal(pj.cliente.emailComercial, 'empresa@example.test');
  assert.throws(() => model.snapshots(fixture({cliente:{...fixture().cliente,cpf:'11111111111'}})), /CPF/);
  assert.throws(() => model.snapshots(fixture({corretorSnapshot:{...fixture().corretorSnapshot,creci:''}})), /CRECI/);
});

test('rejeita parcelas incompletas, quantidades fora dos limites e valores fracionários/negativos', () => {
  const base = fixture().condicao;
  for (const alteration of [{quantidade:241},{quantidade:1.5},{valorUnitarioCentavos:-1},{valorUnitarioCentavos:1.5},{mes:''},{dia:31},{periodicidade:'outra',quantidade:2}]) {
    assert.throws(() => model.buildCondition({...base, parcelas:[{...base.parcelas[0],...alteration}]}));
  }
  assert.throws(() => model.buildCondition({...base,parcelas:Array(13).fill(base.parcelas[0])}), /12/);
  assert.throws(() => model.buildCondition({valorTabelaCentavos:100,parcelas:[]}), /total/);
  const c = model.buildCondition({...base,sinal:{quantidade:0,valorUnitarioCentavos:0},parcelas:[],financiamentoCentavos:100});
  assert.equal(c.totalCalculadoCentavos, 100);
  assert.equal(c.componentes.sinal.ativo, false);
});
