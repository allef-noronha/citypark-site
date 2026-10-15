const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function tableLogic(overrides = {}) {
  const nodes = new Map();
  const navigations = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value:'', open:true, reset(){this.value='';}, removeAttribute(){}, showModal(){this.open=true;}, classList: { add() {}, remove() {}, toggle() {} } });
    return nodes.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: node, documentElement: { classList: { add() {} } } },
    window: { alert() {}, location: {assign: url => navigations.push(url)} }, location: { replace() {} }, auth: {}, db: {}, console,
    onAuthStateChanged() {}, Intl, Date, setTimeout, clearTimeout,
    destination: unit => unit.destinacao || 'nao_classificada', destinationLabel: value => value,
    doc: (_db, collection, id) => ({collection,id}), collection: (_db,name) => name,
    query: (name,...filters) => ({name,filters}), where: (...values) => values,
    ...overrides
  });
  const source = fs.readFileSync(path.join(__dirname, "../js/tabela-admin.js"), "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "");
  vm.runInContext(source, context);
  vm.runInContext('state.previousSaleEditor={read:()=>({}),reset(){}};',context);
  return {...vm.runInContext("({ sortUnits, unitNumber, unitTower, renderUnit, openUnit, savePreviousSale, saveExistingSaleLink, proposalHref })", context), node, context, navigations};
}

test("ordena as unidades do menor número para o maior em cada torre", () => {
  const { sortUnits } = tableLogic();
  const units = ["1204 A", "101 A", "904 A", "203 A", "1102 A", "203 B"]
    .map((unidade, index) => ({ id:`unit-${index}`, unidade }));
  units.sort(sortUnits);
  assert.deepEqual(units.map(unit => unit.unidade), ["101 A", "203 A", "203 B", "904 A", "1102 A", "1204 A"]);
});

test("desempata unidades do mesmo número em ordem natural", () => {
  const { sortUnits } = tableLogic();
  const units = [{ unidade:"804 B", id:"b" }, { unidade:"804 A", id:"a" }].sort(sortUnits);
  assert.deepEqual(units.map(unit => unit.unidade), ["804 A", "804 B"]);
});

const snapshot = (id,data) => ({id,exists:()=>!!data,data:()=>data});
function unitScreen(unit, proposals = [], explicit = null, overrides = {}) {
  return tableLogic({getDoc: async ref => ref.collection === 'unidades' ? snapshot('u1',unit) : explicit || snapshot(ref.id,null),
    getDocs: async ref => ({docs: ref.name === 'propostas' ? proposals : []}), ...overrides});
}

test('unidades vendidas e reservadas oferecem acesso direto à proposta vinculada', async () => {
  for (const status of ['vendida','reservada','aprovada']) {
    const ui = unitScreen({status,propostaAtualId:'p/1'},[snapshot('p/1',{unidadeId:'u1',statusProposta:status,cliente:{nomeCompleto:'Cliente <teste>'}})]);
    await ui.openUnit('u1');
    assert.match(ui.node('unitDialogBody').innerHTML,/Abrir proposta vinculada/);
    assert.match(ui.node('unitDialogBody').innerHTML,/detalhes-proposta.html\?id=p%2F1/);
    assert.match(ui.node('unitDialogBody').innerHTML,/Cliente &lt;teste&gt;/);
    assert.equal(ui.node('previousSaleForm').hidden,true);
    assert.equal(ui.node('linkProposalForm').hidden,true);
  }
});

test('resolve referência legada pelo ID e não inventa link para documento ausente', async () => {
  let ui = unitScreen({status:'vendida',propostaId:'legacy'},[],snapshot('legacy',{statusProposta:'vendida',unidadeId:'u1'}));
  await ui.openUnit('u1');
  assert.match(ui.node('unitDialogBody').innerHTML,/Abrir proposta vinculada/);
  ui = unitScreen({status:'vendida',propostaAtualId:'missing'});
  await ui.openUnit('u1');
  assert.doesNotMatch(ui.node('unitDialogBody').innerHTML,/Abrir proposta vinculada/);
  assert.match(ui.node('unitDialogBody').innerHTML,/não foi encontrada/);
  assert.equal(ui.node('linkProposalForm').hidden,true);
});

test('venda sem vínculo oferece os dois fluxos e seleciona apenas propostas vendidas da unidade', async () => {
  const ui = unitScreen({status:'vendida'},[
    snapshot('sold',{unidadeId:'u1',statusProposta:'vendida',cliente:{razaoSocial:'Empresa'}}),
    snapshot('reserved',{unidadeId:'u1',statusProposta:'reservada'}),
    snapshot('other',{unidadeId:'u2',statusProposta:'vendida'})
  ]);
  await ui.openUnit('u1');
  assert.equal(ui.node('previousSaleForm').hidden,false);
  assert.equal(ui.node('linkProposalForm').hidden,false);
  assert.match(ui.node('linkProposalSelect').innerHTML,/value="sold"/);
  assert.doesNotMatch(ui.node('linkProposalSelect').innerHTML,/value="reserved"|value="other"/);
});

test('cadastro anterior abre o detalhamento com o ID retornado após salvar', async () => {
  let unit = {status:'vendida'}, proposals = [];
  const ui = tableLogic({getDoc: async () => snapshot('u1',unit),getDocs: async ref => ({docs:ref.name==='propostas'?proposals:[]}),
    registerPreviousSale: async input => {assert.equal(input.id,'u1');unit={...unit,propostaAtualId:'venda-anterior-u1'};proposals=[snapshot('venda-anterior-u1',{statusProposta:'vendida',unidadeId:'u1'})];return 'venda-anterior-u1';},setTimeout:()=>0});
  await ui.openUnit('u1');
  ui.node('previousValue').value='100';
  await ui.savePreviousSale({preventDefault(){}});
  assert.deepEqual(ui.navigations,['detalhes-proposta.html?id=venda-anterior-u1#proposta=venda-anterior-u1']);
});

test('falha ao cadastrar mantém o formulário e não navega para proposta inexistente', async () => {
  const ui=unitScreen({status:'vendida'},[],null,{registerPreviousSale:async()=>{throw Error('Falha na gravação');}});
  await ui.openUnit('u1');
  ui.node('previousClient').value='Cliente preenchido';
  await ui.savePreviousSale({preventDefault(){}});
  assert.deepEqual(ui.navigations,[]);
  assert.equal(ui.node('previousClient').value,'Cliente preenchido');
  assert.equal(ui.node('previousError').textContent,'Falha na gravação');
  assert.equal(ui.node('previousSubmit').disabled,false);
});
