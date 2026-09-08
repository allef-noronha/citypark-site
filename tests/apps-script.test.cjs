const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function script(rows, statuses, formula = '') {
  let written;
  const target = { getFormulas: () => rows.slice(1).map(() => [formula]), setValues: data => { written = JSON.parse(JSON.stringify(data)); } };
  const sheet = { getDataRange: () => ({ getValues: () => rows }), getRange: (row, col, count, width) => {
    assert.deepEqual([row,col,count,width], [2,3,rows.length-1,1]); return target;
  } };
  const context = vm.createContext({ console, SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush() {} } });
  vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8') + '\n' + fs.readFileSync('apps-script/Disponibilidade.gs','utf8'), context);
  context.statuses = statuses;
  vm.runInContext('lerDisponibilidadeFirebase_ = () => statuses', context);
  return { run: () => vm.runInContext('atualizarDisponibilidadeSheets_()', context), written: () => written, context };
}
test('Sheets recebe disponibilidade sem alterar preços e sinaliza unidade desconhecida', () => {
  const rows = [['UNIDADE','PREÇO À VISTA','STATUS'],['2208 A',100,'Disponível'],['101-A',200,'Vendido'],['999A',300,'Disponível']];
  const h = script(rows, {'2208A':'aprovada','101A':'disponivel'});
  h.run();
  assert.deepEqual(h.written(), [['Reservado'],['Disponível'],['A confirmar']]);
  assert.equal(rows[1][1],100);
});
test('Sheets recusa fórmulas e identificações duplicadas antes de gravar', () => {
  for (const h of [script([['UNIDADE','PREÇO À VISTA','STATUS'],['1A',100,'']],{'1A':'vendida'},'=A1'),script([['UNIDADE','PREÇO À VISTA','STATUS'],['1 A',100,''],['1-A',100,'']],{'1A':'vendida'})]) {
    assert.throws(h.run);
    assert.equal(h.written(),undefined);
  }
});
test('publicação de preços aponta apenas para coleções comerciais', () => {
  const h = script([['UNIDADE','PREÇO À VISTA','STATUS'],['1A',100,'']],{});
  const writes=[];
  h.context.capture = data => { writes.push(...JSON.parse(JSON.stringify(data))); return data.length; };
  vm.runInContext(`getConditions_=()=>({quantidades:{mensais:39,intercaladas:5},tipologias:{Loft:{}}}); getTabelaVendas_=()=>[{UNIDADE:'1A',STATUS:'Vendido','PREÇO À VISTA':100}]; Utilities={formatDate:()=> 'v1'}; Session={getScriptTimeZone:()=> 'America/Sao_Paulo'}; Logger={log(){}}; executarBatchWrites_=capture; publicarTodasUnidadesFirebaseTeste();`,h.context);
  assert.equal(writes.length,2);
  assert.match(writes[0].update.name,/site_conditions_test\/current$/);
  assert.match(writes[1].update.name,/site_units_test\/1A$/);
  assert.equal(writes[1].update.fields.status,undefined);
});

test('resumo gratuito grava somente identificação/status e expiração', () => {
  const h = script([], {'2208A':'vendida','101A':'disponivel','999A':'invalido'});
  let writes;
  h.context.capture = data => { writes=JSON.parse(JSON.stringify(data)); return data.length; };
  vm.runInContext('executarBatchWrites_=capture; publicarResumoDisponibilidade_()',h.context);
  assert.equal(writes.length,1);
  assert.match(writes[0].update.name,/disponibilidade_publica\/atual$/);
  const fields=writes[0].update.fields;
  assert.equal(fields.unidades.mapValue.fields['2208A'].stringValue,'vendida');
  assert.equal(fields.unidades.mapValue.fields['999A'].stringValue,'desconhecida');
  assert.equal(Date.parse(fields.validoAte.timestampValue)-Date.parse(fields.atualizadoEm.timestampValue),75*60000);
  assert.equal(fields.fonte.stringValue,'apps-script-periodico');
});
