import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {initializeTestEnvironment, assertFails} from '@firebase/rules-unit-testing';
import * as firestore from 'firebase/firestore';
import {standard} from './fixtures.mjs';
const require = createRequire(import.meta.url);
const {doc,getDoc,getDocs,collection,writeBatch,updateDoc} = firestore;
const PROJECT='demo-citypark-comercial';

function screen(db, proposal, unit, uid='admin-test') {
  // Convert plain VM objects into the SDK realm; preserve Timestamp/FieldValue instances.
  const localObject = value => Array.isArray(value) ? Array.from(value, localObject)
    : value && Object.getPrototypeOf(value)?.constructor?.name === 'Object'
      ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key,localObject(item)])) : value;
  const nodes=new Map();
  const node=id=> { if(!nodes.has(id)) nodes.set(id,{value:'',checked:false,hidden:false,disabled:false,options:[],classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],querySelector:()=>({disabled:false}),focus(){}}); return nodes.get(id); };
  const context=vm.createContext({...firestore, db, auth:{}, onAuthStateChanged(){},
    runTransaction: (database,callback)=>firestore.runTransaction(database,tx=>callback({get:ref=>tx.get(ref),update:(ref,data)=>tx.update(ref,localObject(data)),set:(ref,data)=>tx.set(ref,localObject(data))})),
    window:{location:{search:'?id=p1',hash:'',pathname:'/detalhes-proposta.html'},confirm:()=>true,CityParkPaymentPlan:require('../../js/condicao-venda.js')},
    document:{getElementById:node,body:{classList:{remove(){}}}},sessionStorage:{getItem:()=>null}, URLSearchParams, Date, Intl, console:{error(){}}
  });
  vm.runInContext(readFileSync(new URL('../../js/detalhes-proposta.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,''),context);
  context.seedProposal=proposal; context.seedUnit=unit; context.seedUid=uid;
  vm.runInContext('state.editingFinancialRevision=seedProposal.financeiroRevisao || 0; state.editingFinancialUpdatedAt=dateValue(seedProposal.atualizadoEm); state.proposal=seedProposal; state.unit=seedUnit; state.adminUser={uid:seedUid}; showToast=()=>{}; loadProposal=async()=>{};',context);
  return {node, run:(code)=>vm.runInContext(code,context)};
}

test('ações comerciais executam o código da página com regras reais no emulador',async t=>{
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '',/^(127\.0\.0\.1|localhost):8080$/);
  const env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:8080,rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
  const db=env.authenticatedContext('admin-test').firestore();
  const original=standard();
  async function seed(status='reservada', link='p1', extras={}) {
    await env.clearFirestore();
    const proposal={unidadeId:'u1',corretorId:'broker-test',statusProposta:status,condicaoProposta:original,...extras};
    const unit={unidade:'2208 A',status,propostaAtualId:link};
    await env.withSecurityRulesDisabled(async context=>{
      const batch=writeBatch(context.firestore());
      batch.set(doc(context.firestore(),'admins','admin-test'),{ativo:true,tipo:'admin'});
      batch.set(doc(context.firestore(),'propostas','p1'),proposal);
      batch.set(doc(context.firestore(),'unidades','u1'),unit);
      await batch.commit();
    });
    return screen(db,proposal,unit);
  }
  const proposal=async()=> (await getDoc(doc(db,'propostas','p1'))).data();
  const unit=async()=> (await getDoc(doc(db,'unidades','u1'))).data();
  try {
    await t.test('aprovação e recusa mantêm proposta, unidade e históricos consistentes',async()=>{
      let ui=await seed(); await ui.run('approveProposal()');
      assert.equal((await proposal()).statusProposta,'aprovada'); assert.equal((await unit()).status,'aprovada');
      assert.equal((await getDocs(collection(db,'historico_propostas'))).size,1);
      assert.equal((await getDocs(collection(db,'historico_unidades'))).size,1);
      ui=await seed(); await ui.run('rejectProposal("Cliente desistiu")');
      assert.equal((await proposal()).statusProposta,'recusada'); assert.equal((await unit()).status,'disponivel');
    });
    await t.test('reserva de outra proposta não pode ser liberada nem aprovada',async()=>{
      const ui=await seed('reservada','outra');
      await assert.rejects(ui.run('approveProposal()'),/vinculada/);
      await assert.rejects(ui.run('rejectProposal("Motivo")'),/vinculada/);
      assert.equal((await unit()).propostaAtualId,'outra');
      assert.equal((await getDocs(collection(db,'historico_propostas'))).size,0);
    });
    await t.test('edição salva proposta e preserva original e histórico imutável',async()=>{
      const ui=await seed();
      await ui.run('saveProposalCondition({...state.proposal.condicaoProposta, tipo:"personalizada"})');
      const result=await proposal();
      assert.equal(result.condicaoProposta.tipo,'personalizada');
      assert.equal(result.condicaoOriginal.tipo,original.tipo);
      assert.equal(result.financeiroRevisao,1);
      assert.equal(result.statusProposta,'reservada');
      const history=(await getDocs(collection(db,'historico_propostas'))).docs[0];
      assert.equal(history.data().condicaoNova.tipo,'personalizada');
      await assertFails(updateDoc(history.ref,{observacao:'reescrita'}));
    });
    await t.test('edição desatualizada não sobrescreve outra sessão',async()=>{
      const ui=await seed();
      await updateDoc(doc(db,'propostas','p1'),{financeiroRevisao:1});
      await assert.rejects(ui.run('saveProposalCondition(state.proposal.condicaoProposta)'),/outra sessão/);
      assert.equal((await getDocs(collection(db,'historico_propostas'))).size,0);
    });
    await t.test('etapas sequenciais terminam em venda com unidade e histórico atômicos',async()=>{
      await seed('aprovada');
      for(const target of ['documentos','assinatura','sienge','concluida']) {
        const ui=screen(db,await proposal(),await unit());
        ui.node('commercialStage').value=target; ui.node('commercialStageNote').value='Conferido: protocolo teste 123'; ui.node('commercialStageChecked').checked=true;
        await ui.run('saveCommercialStage({preventDefault(){}})');
        assert.equal(ui.node('commercialStageError').hidden,true,ui.node('commercialStageError').textContent);
        assert.equal((await proposal()).etapaComercial,target);
      }
      assert.equal((await unit()).status,'vendida'); assert.equal((await proposal()).statusProposta,'vendida');
      assert.equal((await getDocs(collection(db,'historico_propostas'))).size,4);
      assert.equal((await getDocs(collection(db,'historico_unidades'))).size,1);
    });
    await t.test('não permite pular etapa',async()=>{
      const ui=await seed('aprovada');
      ui.node('commercialStage').value='concluida'; ui.node('commercialStageNote').value='Teste'; ui.node('commercialStageChecked').checked=true;
      await ui.run('saveCommercialStage({preventDefault(){}})');
      assert.equal(ui.node('commercialStageError').hidden,false);
      assert.equal((await proposal()).etapaComercial,undefined);
    });
    await t.test('corretor não pode executar uma aprovação administrativa',async()=>{
      await seed();
      const unauthorized=screen(env.authenticatedContext('broker-test').firestore(),await proposal(),await unit(),'broker-test');
      await assert.rejects(unauthorized.run('approveProposal()'));
      assert.equal((await unit()).status,'reservada');
    });
  } finally {await env.cleanup();}
});
