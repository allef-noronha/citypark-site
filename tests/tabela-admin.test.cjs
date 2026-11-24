const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function tableLogic(overrides = {}) {
  const nodes = new Map();
  const navigations = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, value:'', checked:false, open:true, attributes:{},
      reset(){this.value=''; for (const field of this.querySelectorAll()) {field.value='';field.checked=false;}},
      querySelectorAll(){return id === 'previousSaleForm' ? ['previousClient','previousBroker'].map(node) : id === 'saveUnitAdjustment' ? ['adjustReason','adjustReference','adjustChecked'].map(node) : id === 'linkProposalForm' ? ['linkProposalSelect','linkProposalReason','linkProposalReference','linkProposalChecked'].map(node) : [];},
      setAttribute(key,value){this.attributes[key]=value;}, removeAttribute(){}, showModal(){this.open=true;}, close(){this.open=false;}, classList: { add() {}, remove() {}, toggle() {} } });
    return nodes.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: node, documentElement: { classList: { add() {} } } },
    window: { alert() {}, confirm:()=>true, location: {assign: url => navigations.push(url)} }, location: { replace() {} }, auth: {}, db: {}, console,
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
  return {...vm.runInContext("({ sortUnits, unitNumber, unitTower, renderUnit, openUnit, savePreviousSale, saveExistingSaleLink, saveUnitAdjustment, selectUnitAction, trackUnitDraft, discardUnitAction, closeUnit, proposalHref })", context), node, context, navigations};
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

test('venda com proposta existente prioriza vínculo e seleciona apenas propostas vendidas da unidade', async () => {
  const ui = unitScreen({status:'vendida'},[
    snapshot('sold',{unidadeId:'u1',statusProposta:'vendida',cliente:{razaoSocial:'Empresa'}}),
    snapshot('reserved',{unidadeId:'u1',statusProposta:'reservada'}),
    snapshot('other',{unidadeId:'u2',statusProposta:'vendida'})
  ]);
  await ui.openUnit('u1');
  assert.equal(ui.node('previousSaleForm').hidden,true);
  assert.equal(ui.node('linkProposalForm').hidden,false);
  assert.match(ui.node('linkProposalSelect').innerHTML,/value="sold"/);
  assert.doesNotMatch(ui.node('linkProposalSelect').innerHTML,/value="reserved"|value="other"/);
});

test('venda sem proposta abre o cadastro e mantém o ajuste em uma ação separada', async () => {
  const ui=unitScreen({status:'vendida',destinacao:'venda'});
  await ui.openUnit('u1');
  assert.equal(ui.node('previousSaleForm').hidden,false);
  assert.equal(ui.node('linkProposalForm').hidden,true);
  assert.equal(ui.node('saveUnitAdjustment').hidden,true);
  assert.equal(ui.node('choosePreviousSale').attributes['aria-pressed'],'true');
  assert.equal(ui.node('chooseExistingProposal').disabled,true);
});

test('trocar de ação preserva a venda preenchida e bloqueia o salvamento indevido do ajuste', async () => {
  let adjustments=0;
  const ui=unitScreen({status:'vendida',destinacao:'venda'},[],null,{adjustUnit:async()=>{adjustments++;}});
  await ui.openUnit('u1');
  ui.node('previousClient').value='Cliente preenchido';
  ui.trackUnitDraft('previousSaleForm');
  ui.selectUnitAction('adjust');
  ui.node('adjustStatus').value='disponivel';ui.node('adjustChecked').checked=true;
  await ui.saveUnitAdjustment({preventDefault(){}});
  assert.equal(adjustments,0);
  assert.match(ui.node('adjustError').textContent,/cadastro da venda anterior/);
  ui.selectUnitAction('previous');
  assert.equal(ui.node('previousClient').value,'Cliente preenchido');
  assert.equal(ui.node('previousSaleForm').hidden,false);
  assert.equal(ui.node('saveUnitAdjustment').hidden,true);
});

test('fechar ou abrir outra unidade exige descarte e cancelar preserva os dados', async () => {
  const ui=unitScreen({status:'vendida',destinacao:'venda'});
  await ui.openUnit('u1');
  ui.node('previousClient').value='Cliente preenchido';ui.trackUnitDraft('previousSaleForm');
  ui.context.window.confirm=()=>false;
  ui.closeUnit();await ui.openUnit('u2');
  assert.equal(ui.node('unitDialog').open,true);
  assert.equal(ui.node('previousClient').value,'Cliente preenchido');
  assert.equal(vm.runInContext('state.selectedUnit.id',ui.context),'u1');
  ui.context.window.confirm=()=>true;
  ui.discardUnitAction();
  assert.equal(ui.node('previousClient').value,'');
  assert.equal(ui.node('unitDraftNotice').hidden,true);
  ui.closeUnit();
  assert.equal(ui.node('unitDialog').open,false);
});

test('ajuste sem mudança real não grava histórico nem simula cadastro de proposta', async () => {
  let adjustments=0;
  const ui=unitScreen({status:'vendida',destinacao:'venda'},[],null,{adjustUnit:async()=>{adjustments++;}});
  await ui.openUnit('u1');ui.selectUnitAction('adjust');ui.node('adjustChecked').checked=true;
  await ui.saveUnitAdjustment({preventDefault(){}});
  assert.equal(adjustments,0);
  assert.match(ui.node('adjustError').textContent,/já estão assim/);
});

test('ajuste válido mantém o fluxo existente e falha preserva os campos para nova tentativa', async () => {
  let unit={status:'vendida',destinacao:'venda'},fail=true,calls=0;
  const ui=tableLogic({getDoc:async()=>snapshot('u1',unit),getDocs:async()=>({docs:[]}),adjustUnit:async data=>{
    calls++;if(fail)throw Error('Falha de conexão');
    assert.equal(data.expectedStatus,'vendida');assert.equal(data.reason,'Distrato confirmado');
    unit={...unit,status:data.nextStatus};
  }});
  await ui.openUnit('u1');ui.selectUnitAction('adjust');
  ui.node('adjustStatus').value='disponivel';ui.node('adjustReason').value='Distrato confirmado';ui.node('adjustReference').value='Contrato 123';ui.node('adjustChecked').checked=true;
  ui.trackUnitDraft('saveUnitAdjustment');
  await ui.saveUnitAdjustment({preventDefault(){}});
  assert.equal(ui.node('adjustReason').value,'Distrato confirmado');
  assert.equal(ui.node('adjustError').textContent,'Falha de conexão');
  assert.equal(ui.node('closeUnitDialog').disabled,false);
  fail=false;await ui.saveUnitAdjustment({preventDefault(){}});
  assert.equal(calls,2);assert.equal(unit.status,'disponivel');
  assert.equal(ui.node('unitDraftNotice').hidden,true);
  assert.match(ui.node('adminToast').textContent,/Situação e destinação salvas/);
});

test('durante gravação impede fechamento, troca de ação e envio duplicado', async () => {
  let finish,calls=0;
  const ui=unitScreen({status:'vendida',destinacao:'venda'},[],null,{registerPreviousSale:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  await ui.openUnit('u1');
  const saving=ui.savePreviousSale({preventDefault(){}});
  ui.closeUnit();ui.selectUnitAction('adjust');await ui.savePreviousSale({preventDefault(){}});
  assert.equal(calls,1);assert.equal(ui.node('unitDialog').open,true);
  assert.equal(ui.node('previousSaleForm').hidden,false);
  assert.equal(ui.node('previousSaleForm').inert,true);
  finish('venda-anterior-u1');await saving;
  assert.deepEqual(ui.navigations,['detalhes-proposta.html?id=venda-anterior-u1#proposta=venda-anterior-u1']);
  assert.equal(vm.runInContext('state.saving',ui.context),false);
});

test('detecta campos alterados antes de salvar mesmo sem evento e limpa o aviso ao reverter', async () => {
  const ui=unitScreen({status:'vendida',destinacao:'venda'});
  await ui.openUnit('u1');
  ui.node('previousClient').value='Campo preenchido por autofill';
  ui.context.window.confirm=()=>false;ui.closeUnit();
  assert.equal(ui.node('unitDialog').open,true);
  assert.equal(ui.node('unitDraftNotice').hidden,false);
  ui.node('previousClient').value='';ui.closeUnit();
  assert.equal(ui.node('unitDialog').open,false);
});

test('unidades sem vínculo mantêm ajuste, Administração/Permuta e criação de proposta disponível', async () => {
  for (const unit of [{status:'disponivel',destinacao:'venda'},{status:'bloqueada',destinacao:'administracao'},{status:'vendida',destinacao:'permuta'}]) {
    const ui=unitScreen(unit);await ui.openUnit('u1');
    assert.equal(ui.node('unitActionChooser').hidden,true);
    assert.equal(ui.node('saveUnitAdjustment').hidden,false);
    assert.equal(ui.node('adjustDestination').value,unit.destinacao);
    assert.equal(ui.node('adjustStatus').value,unit.status);
    if(unit.status==='disponivel')assert.match(ui.node('unitDialogBody').innerHTML,/Criar nova proposta/);
  }
});

test('legado pendente mantém consulta e bloqueia cadastro, ajuste e criação de proposta conflitante', async () => {
  for (const status of ['vendida','disponivel']) {
    const ui=unitScreen({status,destinacao:'venda'},[snapshot('legacy',{unidadeId:'u1',statusProposta:'pendente_correcao'})]);
    await ui.openUnit('u1');
    assert.equal(ui.node('previousSaleForm').hidden,true);
    assert.equal(ui.node('saveUnitAdjustment').hidden,true);
    assert.equal(ui.node('unitDialogHistory').open,true);
    assert.match(ui.node('unitHistoryContent').innerHTML,/legacy/);
    assert.doesNotMatch(ui.node('unitDialogBody').innerHTML,/Criar nova proposta/);
  }
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
