// Exercita páginas reais; todas as requisições externas são interceptadas.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_NODE_PACKAGES] }));
const root = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    try { res.setHeader('Content-Type', {'.js':'text/javascript','.html':'text/html','.css':'text/css'}[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => { window._user = {uid:'test'}; window.corretorPodePropor = () => true; });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth.js')) return route.fulfill({ contentType:'text/javascript', body:'' });
      if (url.pathname.endsWith('/firebase.js') || url.hostname === 'www.gstatic.com') return route.fulfill({ contentType:'text/javascript', body:`
        export const db={},auth={}; export const doc=()=>({}); export const collection=()=>({reservations:true}); export const query=r=>r; export const where=()=>({});
        export const onAuthStateChanged=(_auth,callback)=>callback({uid:'test'});
        export async function getDoc(){return {exists:()=>true,data:()=>({aprovado:true,quantidades:{mensais:39,intercaladas:5}})}};
        export function onSnapshot(ref,options,callback,error){
          if(ref.reservations){window.changeReservation=status=>callback({metadata:{fromCache:false},docs:status?[{id:'2208A',data:()=>({status})}]:[]});window.changeReservation(null);return ()=>{};}
          window.changeStatus=(status,cache=false)=>callback({exists:()=>true,metadata:{fromCache:cache},data:()=>({schemaVersao:1,unidades:{'2208A':status}})});
          window.failStatus=()=>error(new Error('offline-test'));
          window.changeStatus('vendida'); return ()=>{};
        }` });
      if (url.hostname === 'script.google.com') return route.fulfill({ contentType:'application/json', body:JSON.stringify([{UNIDADE:'2208 A',TIPOLOGIA:'Loft','PREÇO À VISTA':100000,STATUS:'Disponível',SINAL:10000}]) });
      if (url.hostname !== '127.0.0.1') return route.fulfill({body:''});
      return route.continue();
    });
    const page = await context.newPage(), errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    const origin = 'http://127.0.0.1:' + server.address().port;
    for (const file of ['vendas.html','tabela.html']) {
      await page.goto(origin+'/'+file);
      const status = page.locator(file === 'vendas.html' ? '.unidade-status .status-texto' : '#tvBody .status');
      await status.waitFor();
      assert.equal(await status.innerText(),'Vendido');
      await page.evaluate(()=>window.changeStatus('aprovada'));
      assert.equal(await status.innerText(),'Reservado');
      await page.evaluate(()=>window.changeStatus('disponivel'));
      assert.equal(await status.innerText(),'Disponível');
      await page.evaluate(()=>window.changeReservation('reservada'));
      assert.equal(await status.innerText(),'Reservado');
      await page.evaluate(()=>window.changeStatus('disponivel'));
      assert.equal(await status.innerText(),'Reservado');
      await page.evaluate(()=>window.changeReservation(null));
      await page.evaluate(()=>window.changeStatus('bloqueada'));
      assert.equal(await status.innerText(),'Indisponível');
      await page.evaluate(()=>window.changeStatus('disponivel',true));
      assert.equal(await status.innerText(),'A confirmar');
      await page.evaluate(()=>window.changeStatus('vendida'));
      assert.equal(await status.innerText(),'Vendido');
      if(file==='vendas.html') {
        // O cache comercial contém Disponível; recarregar precisa continuar Vendido.
        await page.reload(); await status.waitFor();
        assert.equal(await status.innerText(),'Vendido');
      }
    }
    assert.deepEqual(errors,[]);
    console.log('Cards e tabela: status Firebase, aprovação, liberação, cache e falha segura validados.');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
