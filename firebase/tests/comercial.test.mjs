import {wrapInventoryTransaction} from './inventory-wrapper.mjs';
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
    runTransaction: (database,callback)=>firestore.runTransaction(database,tx=>callback(wrapInventoryTransaction({get:ref=>tx.get(ref),update:(ref,data)=>tx.update(ref,localObject(data)),set:(ref,data)=>tx.set(ref,localObject(data))},database))),
    window:{location:{search:'?id=p1',hash:'',pathname:'/detalhes-proposta.html'},confirm:()=>true,CityParkPaymentPlan:require('../../js/condicao-venda.js'),CityParkPreviousSaleModel:require('../../js/venda-anterior-modelo.js')},
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
      batch.set(doc(context.firestore(),'disponibilidade_publica','estoque'),{schemaVersao:2,unidades:{},ultimaUnidade:'',atualizadoEm:new Date()});
      await batch.commit();
    });
    return screen(db,proposal,unit);
  }
  const proposal=async()=> (await getDoc(doc(db,'propostas','p1'))).data();
  const unit=async()=> (await getDoc(doc(db,'unidades','u1'))).data();
  try {
    await t.test('venda anterior mantém status, preserva dados e impede duplicação',async()=>{
      const ui=await seed('vendida',null);
      await env.withSecurityRulesDisabled(async context=>{
        await firestore.deleteDoc(doc(context.firestore(),'propostas','p1'));
        await updateDoc(doc(context.firestore(),'unidades','u1'),{tipologia:'Loft',areaM2:56.9});
      });
      ui.run(readFileSync(new URL('../../js/venda-anterior.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''));
      const input=require('../../tests/previous-sale-fixture.cjs')();
      const command=`registerPreviousSale(${JSON.stringify(input)})`;
      await ui.run(command);
      const saved=(await getDoc(doc(db,'propostas','venda-anterior-u1'))).data();
      assert.equal(saved.statusProposta,'vendida');assert.equal(saved.vendaAnterior.valorCentavos,12345678);
      assert.equal(saved.vendaAnterior.dataVenda,'2025-10-10');assert.equal(saved.corretorId,null);
      assert.equal(saved.cliente.nomeCompleto,'Cliente anterior');
      assert.equal(saved.corretorSnapshot.nome,'Corretor anterior');
      assert.equal(saved.corretorSnapshot.creci,'12345-F');
      assert.equal(saved.cliente.cpf,'52998224725');
      assert.equal(saved.condicaoProposta.totalCalculadoCentavos,12345678);
      assert.equal(saved.condicaoProposta.componentes.parcelas.grupo01.vencimentos.length,10);
      assert.equal(saved.condicaoProposta.componentes.parcelas.grupo01.primeiroVencimento.toDate().getFullYear(),2025);
      assert.equal(saved.vendaAnterior.condicoes,input.condicoes);
      assert.equal(saved.vendaAnterior.referencia,input.referencia);
      assert.equal(saved.vendaAnterior.conferidoPor,'admin-test');
      assert.deepEqual(saved.unidadeSnapshot,{unidade:'2208 A',tipologia:'Loft',areaM2:56.9});
      assert.equal((await unit()).status,'vendida');assert.equal((await unit()).propostaAtualId,'venda-anterior-u1');
      assert.deepEqual((await getDoc(doc(db,'historico_unidades','venda-anterior-u1'))).data().vendaAnterior,saved.vendaAnterior);
      assert.equal((await getDocs(collection(db,'historico_propostas'))).size,1);
      await assert.rejects(ui.run(command),/Já existe/);
      assert.equal((await getDocs(collection(db,'propostas'))).size,1);
    });
    await t.test('venda anterior PJ aceita 12 grupos ativos e observa as mesmas validações de soma',async()=>{
      const ui=await seed('vendida',null);
      await env.withSecurityRulesDisabled(context=>firestore.deleteDoc(doc(context.firestore(),'propostas','p1')));
      ui.run(readFileSync(new URL('../../js/venda-anterior.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''));
      const input=require('../../tests/previous-sale-fixture.cjs')({cliente:{tipoCliente:'PJ',razaoSocial:'Empresa histórica',cnpj:'12345678000190',telefoneComercial:'1133334444',emailComercial:'empresa@example.test'}});
      input.condicao.parcelas=Array.from({length:12},(_,index)=>({periodicidade:['mensal','semestral','anual','outra'][index%4],quantidade:index%4===3?1:2,valorUnitarioCentavos:100000,mes:'2024-02',dia:30,descricao:'Parcela contratual'}));
      await ui.run(`registerPreviousSale(${JSON.stringify(input)})`);
      const saved=(await getDoc(doc(db,'propostas','venda-anterior-u1'))).data();
      assert.equal(saved.cliente.cnpj,input.cliente.cnpj);
      assert.equal(saved.cliente.cpf,null);
      assert.equal(Object.values(saved.condicaoProposta.componentes.parcelas).filter(part=>part.ativo).length,12);
      assert.equal(saved.condicaoProposta.totalCalculadoCentavos,13445678);
    });
    await t.test('regras recusam parcelas adulteradas em ambas as metades, total incoerente e corretor incompleto',async()=>{
      for (const corrupt of ["c.componentes.parcelas.grupo01.totalCentavos++", "c.componentes.parcelas.grupo12.quantidade=1", "c.totalCalculadoCentavos++", "c.diferencaCentavos++"]) {
        const ui=await seed('vendida',null);
        await env.withSecurityRulesDisabled(context=>firestore.deleteDoc(doc(context.firestore(),'propostas','p1')));
        ui.run(readFileSync(new URL('../../js/venda-anterior.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''));
        ui.run(`const baseModel=window.CityParkPreviousSaleModel;window.CityParkPreviousSaleModel={...baseModel,buildCondition(input){const c=baseModel.buildCondition(input);${corrupt};return c;}};`);
        await assertFails(ui.run(`registerPreviousSale(${JSON.stringify(require('../../tests/previous-sale-fixture.cjs')())})`));
        assert.equal((await getDoc(doc(db,'propostas','venda-anterior-u1'))).exists(),false);
        assert.equal((await unit()).propostaAtualId,null);
        assert.equal((await getDocs(collection(db,'historico_unidades'))).size,0);
      }
      const ui=await seed('vendida',null);
      await env.withSecurityRulesDisabled(context=>firestore.deleteDoc(doc(context.firestore(),'propostas','p1')));
      ui.run(readFileSync(new URL('../../js/venda-anterior.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''));
      ui.run('const baseModel=window.CityParkPreviousSaleModel;window.CityParkPreviousSaleModel={...baseModel,snapshots(input){const s=baseModel.snapshots(input);s.corretorSnapshot.creci="";return s;}};');
      await assertFails(ui.run(`registerPreviousSale(${JSON.stringify(require('../../tests/previous-sale-fixture.cjs')())})`));
    });
    await t.test('venda anterior recusa unidade livre, vínculo, legado e destinação especial',async()=>{
      for(const scenario of ['disponivel','vinculo','legado','administracao','permuta']) {
        const ui=await seed(scenario==='disponivel'?'disponivel':'vendida',scenario==='vinculo'?'p1':null);
        await env.withSecurityRulesDisabled(async context=>{
          if(scenario!=='legado')await firestore.deleteDoc(doc(context.firestore(),'propostas','p1'));
          if(['administracao','permuta'].includes(scenario))await updateDoc(doc(context.firestore(),'unidades','u1'),{destinacao:scenario});
        });
        ui.run(readFileSync(new URL('../../js/venda-anterior.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''));
        await assert.rejects(ui.run(`registerPreviousSale(${JSON.stringify(require('../../tests/previous-sale-fixture.cjs')())})`),/Use apenas|Já existe|ativa ou legada/);
        assert.equal((await getDoc(doc(db,'propostas','venda-anterior-u1'))).exists(),false);
      }
    });
    await t.test('regras negam cadastro de venda anterior sem histórico e por corretor',async()=>{
      await seed('vendida',null);
      const data={origem:'venda_anterior',statusProposta:'vendida',unidadeId:'u1',adminId:'admin-test',corretorId:null};
      await assertFails(firestore.setDoc(doc(db,'propostas','venda-anterior-u1'),data));
      await assertFails(firestore.setDoc(doc(env.authenticatedContext('broker-test').firestore(),'propostas','venda-anterior-u1'),data));
    });
    await t.test('vincular proposta vendida preserva condições e cria históricos iguais',async()=>{
      const ui=await seed('vendida',null);
      ui.run(readFileSync(new URL('../../js/vinculo-proposta.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''));
      const before=await proposal();
      await ui.run(`linkExistingSale({id:'u1',proposalId:'p1',uid:'admin-test',reason:'Conferência cadastral',reference:'Contrato 123',confirmed:true})`);
      assert.deepEqual(await proposal(),before);
      const linked=await unit();
      assert.equal(linked.propostaAtualId,'p1');assert.equal(linked.status,'vendida');
      assert.deepEqual((await getDoc(doc(db,'historico_unidades',linked.vinculoHistoricoId))).data(),(await getDoc(doc(db,'historico_propostas',linked.vinculoHistoricoId))).data());
      await assert.rejects(ui.run(`linkExistingSale({id:'u1',proposalId:'p1',uid:'admin-test',reason:'Repetido',reference:'123',confirmed:true})`),/já possui/);
    });
    await t.test('regras recusam novo vínculo sem histórico e para proposta de outra unidade',async()=>{
      await seed('vendida',null);
      const batch=writeBatch(db);
      batch.update(doc(db,'unidades','u1'),{propostaAtualId:'p1',vinculoHistoricoId:'missing',atualizadoEm:firestore.serverTimestamp()});
      batch.update(doc(db,'disponibilidade_publica','estoque'),{'unidades.u1':{unidade:'2208 A',status:'vendida'},ultimaUnidade:'u1',atualizadoEm:firestore.serverTimestamp()});
      await assertFails(batch.commit());
      const ui=await seed('vendida',null,{unidadeId:'u2'});
      ui.run(readFileSync(new URL('../../js/vinculo-proposta.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''));
      await assert.rejects(ui.run(`linkExistingSale({id:'u1',proposalId:'p1',uid:'admin-test',reason:'X',reference:'Y',confirmed:true})`),/mesma unidade/);
      assert.equal((await unit()).propostaAtualId,null);
    });
    await t.test('teste invalidado preserva proposta e bloqueia unidade atomicamente',async()=>{
      const ui=await seed('vendida','p1',{teste:true,vendidoEm:'venda-de-teste'});
      const before=(await proposal()).condicaoProposta;
      await ui.run('invalidateTestProposal("Teste confirmado")');
      assert.equal((await proposal()).statusProposta,'teste_invalidado');
      assert.deepEqual((await proposal()).condicaoProposta,before);
      assert.equal((await proposal()).vendidoEm,'venda-de-teste');
      assert.equal((await unit()).status,'bloqueada');
      assert.equal((await getDocs(collection(db,'historico_unidades'))).size,1);
      await assert.rejects(ui.run('invalidateTestProposal("Repetido")'));
    });
    await t.test('ajuste administrativo exige histórico e respeita destinação e propostas legadas',async()=>{
      const ui=await seed('vendida',null);
      await env.withSecurityRulesDisabled(async context=>{
        await firestore.deleteDoc(doc(context.firestore(),'propostas','p1'));
      });
      for(const file of ['estoque.js','ajuste-unidade.js']) ui.run(readFileSync(new URL('../../js/'+file,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''));
      await assertFails(updateDoc(doc(db,'unidades','u1'),{destinacao:'administracao',status:'bloqueada'}));
      await ui.run(`adjustUnit({id:'u1',expectedStatus:'vendida',expectedDestination:'nao_classificada',nextStatus:'bloqueada',nextDestination:'administracao',reason:'Patrimônio da Administração',reference:'Lista confirmada',uid:'admin-test'})`);
      assert.equal((await unit()).destinacao,'administracao');
      assert.equal((await unit()).status,'bloqueada');
      assert.equal((await getDocs(collection(db,'historico_unidades'))).size,1);
      await assertFails(updateDoc(doc(db,'unidades','u1'),{status:'disponivel'}));
      await assert.rejects(ui.run(`adjustUnit({id:'u1',expectedStatus:'vendida',expectedDestination:'nao_classificada',nextStatus:'disponivel',nextDestination:'venda',reason:'X',reference:'Y',uid:'admin-test'})`),/outra sessão/);
      const broker=env.authenticatedContext('broker-test').firestore();
      await assertFails(updateDoc(doc(broker,'unidades','u1'),{status:'reservada',propostaAtualId:'p2'}));
      await env.withSecurityRulesDisabled(async context=>{
        await firestore.setDoc(doc(context.firestore(),'propostas','legada'),{unidadeId:'u1',statusProposta:'pendente_correcao'});
      });
      await assert.rejects(ui.run(`adjustUnit({id:'u1',expectedStatus:'bloqueada',expectedDestination:'administracao',nextStatus:'disponivel',nextDestination:'venda',reason:'X',reference:'Y',uid:'admin-test'})`),/legada/);
    });
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
    await t.test('edição de venda anterior mantém contrato original, vínculo e status, com revisão e histórico',async()=>{
      const condition=require('../../js/venda-anterior-modelo.js').buildCondition(require('../../tests/previous-sale-fixture.cjs')().condicao);
      await seed('vendida','p1',{origem:'venda_anterior',vendaAnterior:{dataVenda:'2025-10-10',valorCentavos:12345678,referencia:'Contrato 123',condicoes:condition.descricao},condicaoProposta:condition,vendidoEm:firestore.Timestamp.fromMillis(1000)});
      const before=await proposal(), unitBefore=await unit();
      const ui=screen(db,before,unitBefore);
      await ui.run('saveProposalCondition({...state.proposal.condicaoProposta,totalCalculadoCentavos:13345678,diferencaCentavos:1654322,componentes:{...state.proposal.condicaoProposta.componentes,parcelas:{...state.proposal.condicaoProposta.componentes.parcelas,grupo01:{...state.proposal.condicaoProposta.componentes.parcelas.grupo01,valorUnitarioCentavos:200000,totalCentavos:2000000}}}})');
      const result=await proposal();
      assert.equal(result.statusProposta,'vendida');
      assert.deepEqual(await unit(),unitBefore);
      assert.deepEqual(result.vendaAnterior,before.vendaAnterior);
      assert.deepEqual(result.condicaoOriginal,before.condicaoProposta);
      assert.equal(result.condicaoProposta.totalCalculadoCentavos,13345678);
      assert.equal(result.financeiroRevisao,1);
      assert.deepEqual(result.vendidoEm,before.vendidoEm);
      const events=(await getDocs(collection(db,'historico_propostas'))).docs;
      assert.equal(events.length,1);
      assert.deepEqual(events[0].data().condicaoAnterior,before.condicaoProposta);
      assert.deepEqual(events[0].data().condicaoNova,result.condicaoProposta);
      await assert.rejects(ui.run('saveProposalCondition(state.proposal.condicaoProposta)'),/outra sessão/);
      await ui.run('distractSoldProposal("Distrato do contrato 123")');
      const ended=screen(db,await proposal(),await unit());
      await assert.rejects(ended.run('saveProposalCondition(state.proposal.condicaoProposta)'),/vinculada|edição/);
      assert.deepEqual((await proposal()).condicaoOriginal,before.condicaoProposta);
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
    await t.test('distrato mantém proposta, valores e histórico; nova reserva não reabre venda antiga', async()=>{
      const ui=await seed('vendida','p1',{vendidoEm:firestore.Timestamp.fromMillis(1000)});
      const before=await proposal();
      await ui.run('distractSoldProposal("Distrato formal 123")');
      const old=await proposal();
      assert.equal(old.statusProposta,'distratada');
      assert.deepEqual(old.condicaoProposta,before.condicaoProposta);
      assert.equal(old.vendidoEm.toMillis(),1000);
      assert.equal((await unit()).status,'disponivel');
      await assertFails(firestore.deleteDoc(doc(db,'propostas','p1')));
      const event=(await getDocs(collection(db,'historico_propostas'))).docs[0];
      await assertFails(firestore.deleteDoc(event.ref));
      await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),'unidades','u1'),{status:'reservada',propostaAtualId:'p2'}));
      await assert.rejects(ui.run('distractSoldProposal("Repetido")'));
      assert.equal((await unit()).propostaAtualId,'p2');
    });
    await t.test('estoque público: transições imediatas, destinações e acesso mínimo',async()=>{
      await seed('reservada');
      const publicDb=env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(publicDb,'unidades','u1')));
      await assertFails(getDocs(collection(publicDb,'unidades')));
      const publicRef=doc(db,'disponibilidade_publica','estoque');
      await assertFails(updateDoc(publicRef,{'unidades.u1':{unidade:'2208 A',status:'disponivel'},ultimaUnidade:'u1',atualizadoEm:firestore.serverTimestamp()}));
      await assertFails(updateDoc(doc(db,'unidades','u1'),{status:'vendida',atualizadoEm:firestore.serverTimestamp()}));
      for (const [destinacao,status,expected] of [['venda','aprovada','aprovada'],['venda','vendida','vendida'],['venda','disponivel','disponivel'],['administracao','bloqueada','vendida'],['permuta','bloqueada','vendida'],['venda','bloqueada','bloqueada']]) {
        await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),'unidades','u1'),{destinacao}));
        await firestore.runTransaction(db,async raw=>{
          const tx=wrapInventoryTransaction(raw,db), ref=doc(db,'unidades','u1');
          await tx.get(ref); tx.update(ref,{status,atualizadoEm:firestore.serverTimestamp()});
        });
        const data=(await getDoc(doc(publicDb,'disponibilidade_publica','estoque'))).data();
        assert.deepEqual(data.unidades.u1,{unidade:'2208 A',status:expected});
        assert.equal((await unit()).destinacao,destinacao);
        assert.equal((await unit()).status,status);
      }
    });
    await t.test('resumo público pode ser lido mas não alterado por clientes',async()=>{
      await env.withSecurityRulesDisabled(async context=>{await firestore.setDoc(doc(context.firestore(),'disponibilidade_publica','atual'),{schemaVersao:1,unidades:{u1:'vendida'}});});
      const publicDb=env.unauthenticatedContext().firestore();
      assert.equal((await getDoc(doc(publicDb,'disponibilidade_publica','atual'))).exists(),true);
      await assertFails(firestore.setDoc(doc(db,'disponibilidade_publica','atual'),{unidades:{u1:'disponivel'}}));
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
