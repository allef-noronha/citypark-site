const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function scenario({unit={},proposal={},others=[]}={}) {
  const originalUnit={unidade:'204 A',status:'vendida',propostaAtualId:null,...unit};
  const originalProposal={unidadeId:'204-A',statusProposta:'vendida',cliente:{nomeCompleto:'Cliente original'},condicaoProposta:{totalCalculadoCentavos:90000000},...proposal};
  const store=new Map([['unidades/204-A',originalUnit],['propostas/p1',originalProposal],...others.map((data,i)=>[`propostas/other-${i}`,data])]);
  let seq=0;
  const collection=(_db,name)=>({name});
  const doc=(base,name,id)=>typeof name==='string'?{path:`${name}/${id}`,id}:{path:`${base.name}/h${++seq}`,id:`h${seq}`};
  const snap=ref=>({id:ref.id,ref,exists:()=>store.has(ref.path),data:()=>store.get(ref.path)});
  const context=vm.createContext({db:{},collection,doc,query:(ref,...filters)=>({...ref,filters}),where:(...args)=>args,
    serverTimestamp:()=>new Date('2026-10-15T15:00:00Z'),
    getDocs:async()=>({docs:[...store.keys()].filter(key=>key.startsWith('propostas/') && store.get(key).unidadeId==='204-A').map(key=>snap({path:key,id:key.split('/')[1]}))}),
    runTransaction:async(_db,callback)=>{
      const writes=[];
      await callback({get:async ref=>snap(ref),update:(ref,data)=>writes.push([ref.path,{...store.get(ref.path),...data}]),set:(ref,data)=>writes.push([ref.path,data])});
      for(const [key,data] of writes)store.set(key,data);
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/vinculo-proposta.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),context);
  return {store,originalUnit,originalProposal,run:input=>context.linkExistingSale({id:'204-A',proposalId:'p1',uid:'admin',reason:'Conferência cadastral',reference:'Contrato 123',confirmed:true,...input})};
}

test('vínculo preserva a proposta e o status da unidade e grava os dois históricos',async()=>{
  const ui=scenario();
  assert.equal(await ui.run(),'p1');
  assert.equal(ui.store.get('propostas/p1'),ui.originalProposal);
  const unit=ui.store.get('unidades/204-A');
  assert.equal(unit.status,'vendida');assert.equal(unit.propostaAtualId,'p1');
  const history=ui.store.get(`historico_unidades/${unit.vinculoHistoricoId}`);
  assert.deepEqual(history,ui.store.get(`historico_propostas/${unit.vinculoHistoricoId}`));
  assert.equal(history.adminId,'admin');assert.equal(history.propostaId,'p1');assert.equal(history.referencia,'Contrato 123');
  await assert.rejects(ui.run(),/já possui/);
});

test('vínculo rejeita unidade incompatível, proposta de outra unidade e proposta não vendida',async()=>{
  for(const input of [{unit:{status:'reservada'}},{unit:{destinacao:'administracao'}},{unit:{destinacao:'permuta'}},{unit:{propostaAtualId:'p2'}},{unit:{propostaId:'legada'}},{proposal:{unidadeId:'205-B'}},{proposal:{statusProposta:'reservada'}},{proposal:{statusProposta:'pendente_correcao'}}]) {
    const ui=scenario(input);
    await assert.rejects(ui.run());
    assert.equal(ui.store.size,2);assert.equal(ui.store.get('unidades/204-A'),ui.originalUnit);
  }
});

test('vínculo exige conferência, motivo e referência e rejeita disputa com outra proposta ativa',async()=>{
  for(const input of [{confirmed:false},{reason:''},{reference:''},{proposalId:''}])await assert.rejects(scenario().run(input));
  await assert.rejects(scenario({others:[{unidadeId:'204-A',statusProposta:'aprovada'}]}).run(),/outra proposta/);
  await scenario({others:[{unidadeId:'204-A',statusProposta:'distratada'}]}).run();
});
