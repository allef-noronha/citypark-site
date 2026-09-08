const {test}=require('node:test');
const assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs');
test('reservas prevalecem sobre resumo, cache falha fechado e expiração preserva reservas',()=>{
 const callbacks={}, failures={}; let timeout,result,stopped=0;
 const context=vm.createContext({db:{},doc:()=> 'summary',collection:()=> 'reservations',query:r=>r,where(){},console:{error(){}},Date,Number,
 setTimeout(fn){timeout=fn;return 1;},clearTimeout(){},
 onSnapshot(ref,options,callback,error){callbacks[ref]=callback;failures[ref]=error;return ()=>stopped++;}});
 vm.runInContext(fs.readFileSync('js/disponibilidade.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),context);
 const stop=context.watchAvailability(value=>result=JSON.parse(JSON.stringify(value)));
 const summary=expires=>callbacks.summary({exists:()=>true,metadata:{fromCache:false},data:()=>({schemaVersao:1,fonte:'apps-script-periodico',validoAte:{toMillis:()=>expires},unidades:{'1A':'disponivel'}})});
 const reserves=(status,cache=false)=>callbacks.reservations({metadata:{fromCache:cache},docs:status?[{id:'1A',data:()=>({status})}]:[]});
 summary(Date.now()+10000);assert.deepEqual(result,{});
 reserves(null);assert.equal(result['1A'],'disponivel');
 reserves('reservada');assert.equal(result['1A'],'reservada');
 summary(Date.now()+10000);assert.equal(result['1A'],'reservada');
 timeout();assert.equal(result['1A'],'reservada');
 reserves(null);assert.deepEqual(result,{});
 summary(Date.now()-1);assert.deepEqual(result,{});
 summary(Date.now()+10000);reserves('reservada',true);assert.deepEqual(result,{});
 reserves('aprovada');assert.equal(result['1A'],'aprovada');
 failures.reservations(new Error('offline'));assert.deepEqual(result,{});
 stop();assert.equal(stopped,2);
});
