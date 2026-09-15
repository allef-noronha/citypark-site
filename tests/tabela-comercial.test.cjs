const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/tabela-comercial.js','utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
const table={schemaVersao:1,versaoTabela:'v1',quantidades:{mensais:39},unidades:[{unidade:'804 A',precoVista:1101497.9}]};
function setup(store=new Map(),fetcher=async()=>({exists:()=>true,data:()=>structuredClone(table)})) {
 let reads=0;
 const api=vm.runInNewContext(source+';({loadCommercialTable,commercialRows})',{
  db:{},doc:()=>({}),getDocFromServer:async()=>{reads++;return fetcher();},
  sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},Date,JSON
 });
 return {api,reads:()=>reads};
}
test('preços e quantidades compartilham leitura e cache entre páginas',async()=>{
 const store=new Map(),a=setup(store);
 const [x,y]=await Promise.all([a.api.loadCommercialTable(),a.api.loadCommercialTable()]);
 assert.equal(a.reads(),1);assert.equal(x,y);
 assert.equal(a.api.commercialRows(x)[0]['PREÇO À VISTA'],1101497.9);
 assert.equal(y.quantidades.mensais,39);
 const b=setup(store);await b.api.loadCommercialTable();assert.equal(b.reads(),0);
});
test('cache vencido não serve preços antigos se servidor falhar; permite nova tentativa',async()=>{
 const store=new Map([['citypark:tabela-consolidada:v1',JSON.stringify({savedAt:Date.now()-130000,data:table})]]);
 const a=setup(store,async()=>{throw Error('offline');});
 await assert.rejects(a.api.loadCommercialTable(),/offline/);
 await assert.rejects(a.api.loadCommercialTable(),/offline/);assert.equal(a.reads(),2);
});
test('publicação ausente gera erro explícito',async()=>{
 const a=setup(new Map(),async()=>({exists:()=>false}));
 await assert.rejects(a.api.loadCommercialTable(),/não publicada/);
});
test('publicador consolida apenas após publicar unidades individuais',()=>{
 const script=fs.readFileSync('apps-script/script_sheets_completo.txt','utf8');
 const fn=script.slice(script.indexOf('function publicarTodasUnidadesFirebaseTeste()'),script.indexOf('// BATCH WRITE'));
 const writes=[];
 vm.runInNewContext(fn+';publicarTodasUnidadesFirebaseTeste();',{
  Date,Utilities:{formatDate:()=> 'v1'},Session:{getScriptTimeZone:()=> 'America/Sao_Paulo'},
  getConditions_:()=>({quantidades:{mensais:39,intercaladas:6},tipologias:{}}),
  getTabelaVendas_:()=>[{UNIDADE:'804 A','PREÇO À VISTA':123,STATUS:'Vendido'}],
  normalizeUnitId_:()=> '804-A',numberOrNull_:v=>v??null,roundMoney_:v=>v??null,
  buildFirestoreWrite_:(path,data)=>({path,data}),executarBatchWrites_:batch=>{writes.push(batch);return batch.length;},Logger:{log:()=>{}}
 });
 assert.equal(writes.length,2);assert.equal(writes[1][0].path,'tabela_comercial/atual');
 assert.equal(writes[1][0].data.unidades[0].precoVista,123);
 assert.equal(writes[1][0].data.unidades[0].status,undefined);
});
