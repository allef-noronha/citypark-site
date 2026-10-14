import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,serverTimestamp} from 'firebase/firestore';
import assert from 'node:assert/strict';

test('cadastro preventivo compatível com regras; aprovação e administradores preservados',async t=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(localhost|127\.0\.0\.1):8080$/);
 const env=await initializeTestEnvironment({projectId:'demo-citypark-cadastro',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
 const db=env.authenticatedContext('broker',{email:'broker@example.com'}).firestore();
 const perfil={nome:'Corretor',cpf:'12345678901',creci:'123',telefone:'82999999999',imobiliaria:'Empresa',email:'broker@example.com',aprovado:false,criadoEm:serverTimestamp()};
 try {
  await env.clearFirestore();
  await t.test('perfil próprio pendente pode ser criado',()=>assertSucceeds(setDoc(doc(db,'corretores','broker'),perfil)));
  await t.test('autoaprovação é recusada',()=>assertFails(setDoc(doc(db,'corretores','broker'),{...perfil,aprovado:true})));
  await t.test('UID diferente é recusado',()=>assertFails(setDoc(doc(db,'corretores','other'),perfil)));
  await t.test('e-mail diferente é recusado',async()=>{
   const other=env.authenticatedContext('other',{email:'other@example.com'}).firestore();
   await assertFails(setDoc(doc(other,'corretores','other'),perfil));
  });
  await t.test('escrita sem sessão é recusada',()=>assertFails(setDoc(doc(env.unauthenticatedContext().firestore(),'corretores','anonymous'),perfil)));
  await env.withSecurityRulesDisabled(async ctx=>{
   await setDoc(doc(ctx.firestore(),'corretores','approved'),{...perfil,email:'approved@example.com',aprovado:true});
   await setDoc(doc(ctx.firestore(),'admins','admin'),{tipo:'admin',ativo:true});
  });
  await t.test('aprovação existente não pode ser rebaixada pelo corretor',()=>assertFails(setDoc(doc(env.authenticatedContext('approved',{email:'approved@example.com'}).firestore(),'corretores','approved'),{...perfil,email:'approved@example.com'})));
  await t.test('administrador continua autorizado a aprovar',()=>assertSucceeds(setDoc(doc(env.authenticatedContext('admin').firestore(),'corretores','broker'),{...perfil,aprovado:true})));
  assert.equal((await getDoc(doc(db,'corretores','broker'))).data().aprovado,true);
 } finally {await env.cleanup();}
});
