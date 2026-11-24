const {test}=require('node:test');
const assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs'), path=require('node:path');

// Availability now comes from the atomic inventory (schema 2). Legacy TTLs
// must neither replace it nor release a reserved/sold unit in the browser.
test('estoque atômico preserva reservas e vendas; resumo legado e cache falham fechados',()=>{
 let next,fail,result,stopped=0;
 const context=vm.createContext({db:{},doc:()=> 'inventory',console:{error(){}},
 onSnapshot(ref,options,callback,error){assert.equal(ref,'inventory');next=callback;fail=error;return ()=>stopped++;}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/disponibilidade.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),context);
 const stop=context.watchAvailability(value=>result=JSON.parse(JSON.stringify(value)));
 const emit=(data,fromCache=false)=>next({exists:()=>!!data,metadata:{fromCache},data:()=>data});
 emit({schemaVersao:1,validoAte:'2099-01-01',unidades:{'1A':'disponivel'}});assert.deepEqual(result,{});
 for(const status of ['reservada','aprovada','vendida']) {
   emit({schemaVersao:2,validoAte:'2000-01-01',unidades:{'1-A':{unidade:'1 A',status}}});
   assert.equal(result['1A'],status);
 }
 emit({schemaVersao:1,unidades:{'1A':'disponivel'}});assert.deepEqual(result,{});
 emit({schemaVersao:2,unidades:{'1-A':{unidade:'1 A',status:'disponivel'}}},true);assert.deepEqual(result,{});
 emit(null);assert.deepEqual(result,{});
 fail(new Error('offline'));assert.deepEqual(result,{});
 stop();assert.equal(stopped,1);
});
