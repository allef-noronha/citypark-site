// Isolated UI preview: real public catalog, simulated identity, no account writes.
// node tests/responsive-preview.mjs; open :5501/vendas.html?role=approved
// Roles: visitor, pending, approved, admin. ?print=1 previews print styles.
// ?motion=reduce simulates a reduced-motion preference in this preview only.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const auth = `
const role = new URL(location.href).searchParams.get('role') || 'visitor';
export const user = role === 'visitor' ? null : {uid:'responsive-test',displayName:'Alexandrinamuitolonga Teste',email:'layout@example.invalid'};
export const getAuth = () => ({currentUser:user});
export const onAuthStateChanged = (auth, callback) => {queueMicrotask(()=>callback(user));return ()=>{};};
const blocked = async () => {throw Error('Preview: account writes disabled');};
export const signInWithEmailAndPassword=blocked,createUserWithEmailAndPassword=blocked,updateProfile=blocked,sendPasswordResetEmail=blocked,signOut=blocked;
`;
const profile = `
const role = new URL(location.href).searchParams.get('role') || 'visitor';
export const doc = (db,...parts) => parts.join('/');
export async function getDoc(ref) {
 const data = ref.startsWith('corretores/') ? {nome:'Alexandrinamuitolonga Teste',aprovado:['approved','admin'].includes(role)} : ref.startsWith('admins/') && role==='admin' ? {ativo:true,tipo:'admin'} : null;
 return {exists:()=>!!data,data:()=>data};
}
export const setDoc = async () => {throw Error('Preview: writes disabled');};
export const serverTimestamp = () => null;
`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4'};
http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://127.0.0.1:5501');
  const route=decodeURIComponent(url.pathname);
  if(req.method!=='GET') {res.writeHead(405).end();return;}
  if(route==='/__test/auth.js'||route==='/__test/profile.js') {res.writeHead(200,{'Content-Type':types['.js']}).end(route.endsWith('auth.js')?auth:profile);return;}
  if(route==='/__test/motion.js') {
   res.writeHead(200,{'Content-Type':types['.js']}).end(`const originalMatchMedia=window.matchMedia.bind(window);window.matchMedia=query=>originalMatchMedia(query.replace('(prefers-reduced-motion: reduce)','(min-width: 0px)').replace('(prefers-reduced-motion: no-preference)','(max-width: 0px)'));`);return;
  }
  if(!/^\/(index|vendas|tabela)\.html$/.test(route)&&!/^\/(css|js|config|img|media)\//.test(route)) {res.writeHead(404).end();return;}
  const file=path.resolve(root,'.'+route);
  if(!file.startsWith(root)) {res.writeHead(403).end();return;}
  const ext=path.extname(file);
  let body=await readFile(file);
  if(['.html','.css','.js'].includes(ext)) {
   body=body.toString();
   if(['/js/firebase.js','/js/auth.js','/js/guard-aprovado.js'].includes(route)) body=body.replaceAll('https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js','/__test/auth.js');
   if(['/js/auth.js','/js/guard-aprovado.js'].includes(route)) body=body.replaceAll('https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js','/__test/profile.js');
   if(url.searchParams.has('print')) {
    body=body.replaceAll('@media print','@media all').replaceAll('@media screen','@media not all');
    if(ext==='.html') body=body.replace(/href="(css\/[^"?]+\.css)"/g,'href="$1?print=1"');
   }
   if(url.searchParams.get('motion')==='reduce') {
    if(ext==='.html') body=body.replace('</head>','<script src="/__test/motion.js"></script></head>').replace(/href="(css\/[^"?]+\.css)"/g,'href="$1?motion=reduce"');
    if(ext==='.css') body=body.replaceAll('(prefers-reduced-motion: reduce)','(min-width: 0px)').replaceAll('(prefers-reduced-motion: no-preference)','(max-width: 0px)');
   }
  }
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
 } catch {res.writeHead(404).end();}
}).listen(5501,'127.0.0.1',()=>console.log('Isolated responsive preview: http://127.0.0.1:5501/vendas.html?role=approved'));
