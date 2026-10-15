const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const previousId='P2tOk0jgBIElnge2AW7T';
function navigation({search='',hash='',stored=previousId,proposal={}}={}) {
  const reads=[],nodes=new Map();
  const context=vm.createContext({
    window:{location:{search,hash,pathname:'/detalhes-proposta'}},
    document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}},
    sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>stored=value},
    auth:{},db:{},onAuthStateChanged(){},URLSearchParams,Date,Intl,console,
    doc:(_db,collection,id)=>({collection,id}),
    getDoc:async ref=>{reads.push(ref);return {id:ref.id,exists:()=>true,data:()=>ref.collection==='propostas'?{id:previousId,...proposal}:{} };}
  });
  const source=fs.readFileSync(path.join(__dirname,'../js/detalhes-proposta.js'),'utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'');
  vm.runInContext(source,context);
  vm.runInContext('renderAll=()=>{}; loadHistory=async()=>{}; updateSummaryHeight=()=>{};',context);
  return {...vm.runInContext('({resolveProposalId,loadProposal,proposal:()=>state.proposal})',context),reads};
}

test('detalhamento sem ID explícito não reabre a proposta antiga da sessão',()=>{
  assert.equal(navigation().resolveProposalId(),'');
});

test('ID explícito da URL determina o documento consultado mesmo com outra proposta na sessão',async()=>{
  for(const id of ['proposal-A','proposal-B']){
    const ui=navigation({search:'?id='+id});
    await ui.loadProposal();
    assert.equal(ui.reads[0].id,id);
    assert.equal(ui.reads[0].collection,'propostas');
  }
});

test('ID gravado dentro do documento não substitui a identidade do documento solicitado',async()=>{
  const ui=navigation({search:'?id=proposal-B'});
  await ui.loadProposal();
  assert.equal(ui.proposal().id,'proposal-B');
});

test('redirecionamento que remove a query preserva o ID explícito no fragmento',async()=>{
  const ui=navigation({hash:'#proposta=proposal-B'});
  assert.equal(ui.resolveProposalId(),'proposal-B');
  await ui.loadProposal();
  assert.equal(ui.reads[0].id,'proposal-B');
});
