const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('escuta pública usa um documento; venda nunca regride para resumo antigo',()=>{
  let next,fail,reads=0,last;
  const scope=vm.createContext({db:{},doc:(...args)=>args,onSnapshot:(ref,options,callback,error)=>{
    reads++; assert.equal(ref.at(-1),'estoque'); next=callback; fail=error;return ()=>{};
  },console:{error(){}},receive:value=>{last=JSON.parse(JSON.stringify(value));}});
  vm.runInContext(source('js/disponibilidade.js').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),scope);
  vm.runInContext('watchAvailability(receive)',scope);
  const emit=(status,cache=false)=>next({exists:()=>true,metadata:{fromCache:cache},data:()=>({schemaVersao:2,unidades:{u1:{unidade:'2208 A',status}}})});
  emit('reservada');assert.equal(last['2208A'],'reservada');
  emit('vendida');assert.equal(last['2208A'],'vendida');
  emit('disponivel',true);assert.deepEqual(last,{});
  fail(new Error('offline'));assert.deepEqual(last,{});assert.equal(reads,1);
});

test('reconciliação publica somente unidade/status e preserva falhas',()=>{
  const calls=[];
  let invalid=false;
  const scope=vm.createContext({console,Logger:{log(){}},ScriptApp:{getOAuthToken:()=>''},UrlFetchApp:{fetch:(url,options)=>{
    const payload=JSON.parse(options.payload);calls.push({url,payload});
    const entries=[{transaction:'transaction-test'},...['administracao','permuta','venda'].map((dest,i)=>({document:{name:'projects/test/databases/(default)/documents/unidades/u'+i,fields:{unidade:{stringValue:(i+1)+' A'},destinacao:{stringValue:dest},status:{stringValue:invalid?'erro':'bloqueada'}}}}))];
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.endsWith(':runQuery')?entries:{})};
  }}});
  vm.runInContext(source('apps-script/script_sheets_completo.txt'),scope);
  vm.runInContext('publicarResumoDisponibilidade_()',scope);
  assert.deepEqual(calls[0].payload.newTransaction,{readWrite:{}});
  const commit=calls.find(c=>c.url.endsWith(':commit')).payload;
  assert.equal(commit.transaction,'transaction-test');
  const units=commit.writes[0].update.fields.unidades.mapValue.fields;
  assert.equal(units.u0.mapValue.fields.status.stringValue,'vendida');
  assert.equal(units.u1.mapValue.fields.status.stringValue,'vendida');
  assert.equal(units.u2.mapValue.fields.status.stringValue,'bloqueada');
  assert.deepEqual(Object.keys(units.u0.mapValue.fields).sort(),['status','unidade']);
  const sheets=JSON.parse(JSON.stringify(vm.runInContext('lerDisponibilidadeFirebase_()',scope)));
  assert.deepEqual(sheets,{'1A':'vendida','2A':'vendida','3A':'bloqueada'});
  invalid=true;calls.length=0;
  assert.throws(()=>vm.runInContext('publicarResumoDisponibilidade_()',scope),/Status inválido/);
  assert.equal(calls.some(c=>c.url.endsWith(':commit')),false);
  assert.equal(calls.at(-1).url.endsWith(':rollback'),true);
});

test('filtros internos continuam distinguindo Administração e Permuta',()=>{
  const scope=vm.createContext({});vm.runInContext(source('js/estoque.js').replace(/export /g,''),scope);
  assert.equal(vm.runInContext("inInventoryScope({destinacao:'administracao'},'comercial')",scope),false);
  assert.equal(vm.runInContext("inInventoryScope({destinacao:'permuta'},'comercial')",scope),true);
  assert.equal(vm.runInContext("inInventoryScope({destinacao:'permuta'},'vendas')",scope),false);
  assert.equal(vm.runInContext("inInventoryScope({destinacao:'administracao'},'all')",scope),true);
});
