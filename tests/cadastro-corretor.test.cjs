const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/auth.js','utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function screen(options={}) {
 const nodes=new Map(),calls=[],messages=[],events=[];
 function node(id){
  if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',style:{},dataset:{},listeners:{},disabled:false,
   classList:{add(){},remove(){},toggle(){},contains(){return true;}},
   addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},removeAttribute(){},toggleAttribute(){}});
  return nodes.get(id);
 }
 for(const [id,value] of Object.entries({registerNome:'Luciano',registerCpf:'12345678901',registerCreci:'123',registerTelefone:'82999999999',registerImobiliaria:'Empresa',registerEmail:'user@example.com',registerPassword:'abcdef'}))node(id).value=value;
 const user={uid:'new-user',email:'user@example.com'},auth={currentUser:user};
 const context=vm.createContext({auth,db:{},console:{error(){},warn(){}},
  document:{getElementById:node,addEventListener(){},querySelectorAll:()=>[],body:{dataset:{}}},
  window:{dispatchEvent:e=>events.push(e),location:{}},CustomEvent:class {constructor(type,{detail}){this.type=type;this.detail=detail;}},
  alert:m=>messages.push(m),setTimeout(){},serverTimestamp:()=> 'server-time',doc:(_,collection,uid)=>({collection,uid}),
  onAuthStateChanged:(_,fn)=>{context.observe=fn;},
  createUserWithEmailAndPassword:async()=>{calls.push('auth');if(options.authError)throw {code:options.authError};return {user};},
  setDoc:async(ref,data)=>{calls.push({write:ref,data});if(options.writeWait)await options.writeWait.promise;if(options.writeError)throw {code:'permission-denied'};},
  updateProfile:async()=>{calls.push('name');if(options.nameError)throw {code:'auth/network-request-failed'};},
  getDoc:async ref=> options.read?options.read(ref):({exists:()=>false,data:()=>null}),
  signInWithEmailAndPassword:async()=>{},sendPasswordResetEmail:async()=>{},signOut:async()=>{}
 });
 vm.runInContext(source,context);
 return {context,node,calls,messages,events,submit:()=>node('registerForm').listeners.submit({preventDefault(){}})};
}
test('salva perfil pelo UID/e-mail do Authentication antes do nome e atualiza UI pendente',async()=>{
 const s=screen();s.node('registerEmail').value='different@example.com';await s.submit();
 assert.equal(s.calls[0],'auth');assert.equal(s.calls[1].write.uid,'new-user');
 assert.equal(s.calls[1].data.email,'user@example.com');assert.equal(s.calls[1].data.aprovado,false);
 assert.equal(s.calls[2],'name');assert.equal(s.node('alertAprovacaoPendente').style.display,'block');
 assert.equal(s.context.window.dadosCorretor().nome,'Luciano');assert.equal(s.context.window.corretorPodePropor(),false);
 assert.equal(s.node('btnCadastrar').disabled,false);
});
test('falha do nome preserva cadastro salvo e sucesso com aviso específico',async()=>{
 const s=screen({nameError:true});await s.submit();
 assert.equal(s.node('alertAprovacaoPendente').style.display,'block');assert.match(s.messages[0],/Cadastro salvo/);
});
test('falha Firestore preserva conta, não atualiza nome nem mostra sucesso',async()=>{
 const s=screen({writeError:true});await s.submit();
 assert.equal(s.calls.includes('name'),false);assert.equal(s.node('alertAprovacaoPendente').style.display,'none');
 assert.match(s.messages[0],/cadastro não foi concluído/);assert.equal(s.context.auth.currentUser.uid,'new-user');
 assert.equal(s.node('btnCadastrar').disabled,false);
});
test('erro Authentication não grava perfil e informa duplicidade',async()=>{
 const s=screen({authError:'auth/email-already-in-use'});await s.submit();
 assert.equal(s.calls.length,1);assert.match(s.messages[0],/já está em uso/);
});
test('duplo envio é bloqueado e sucesso espera confirmação da escrita',async()=>{
 const wait=deferred(),s=screen({writeWait:wait});const first=s.submit();
 await Promise.resolve();await s.submit();
 assert.equal(s.calls.filter(x=>x==='auth').length,1);assert.equal(s.node('btnCadastrar').disabled,true);
 assert.equal(s.node('alertAprovacaoPendente').style.display,'none');wait.resolve();await first;
 assert.equal(s.node('btnCadastrar').disabled,false);
});
test('consulta anterior ao cadastro não sobrescreve estado após gravação',async()=>{
 const wait=deferred();let reads=0;
 const s=screen({read:async()=>{if(++reads<=2)await wait.promise;return {exists:()=>false,data:()=>null};}});
 const old=s.context.observe(s.context.auth.currentUser);await s.submit();wait.resolve();await old;
 assert.equal(s.context.window.dadosCorretor().nome,'Luciano');assert.equal(s.context.window.corretorPodePropor(),false);
});
test('troca de sessão durante cadastro não atribui perfil ao usuário errado',async()=>{
 const wait=deferred(),s=screen({writeWait:wait});const first=s.submit();await Promise.resolve();
 s.context.auth.currentUser={uid:'another-user',email:'another@example.com'};
 await s.context.observe(s.context.auth.currentUser);wait.resolve();await first;
 assert.equal(s.context.window.dadosCorretor(),null);
});
test('falha de leitura da UI usa perfil confirmado sem conceder aprovação',async()=>{
 const s=screen({read:async()=>{throw Error('offline');}});await s.submit();
 assert.equal(s.context.window.dadosCorretor().nome,'Luciano');
 assert.equal(s.context.window.corretorPodePropor(),false);
});
