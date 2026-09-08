// Isolated browser verification: all Firebase modules are replaced; no production access.
const fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_NODE_PACKAGES || 'C:/Users/Lídia Reges/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=path.resolve(__dirname,'..');
(async()=>{
  const {standard}=await import('../firebase/tests/fixtures.mjs');
  const base={statusProposta:'aprovada',unidadeId:'2208-A',corretorId:'broker-test',criadoEm:'2026-09-07T19:35:00Z',condicaoProposta:standard(),cliente:{tipoCliente:'PF',nomeCompleto:'Cliente de teste',cpf:'00000000000'},corretorSnapshot:{nome:'Corretor de teste',creci:'123',imobiliaria:'Imobiliária de teste'},unidadeSnapshot:{unidade:'2208 A',tipologia:'Loft',areaM2:56.9,valores:{precoAVistaCentavos:108551038}}};
  const mock=`
  const proposal=${JSON.stringify(base)};
  export const db={},auth={};
  const snapshot=(id,data)=>({id,exists:()=>!!data,data:()=>data});
  export function doc(...args){return {path:args.slice(1).join('/')}};
  export function collection(db,name){return {name}};
  export function query(ref,...constraints){return {...ref,constraints}};
  export const where=(...args)=>({type:'where',args}),orderBy=(...args)=>({type:'orderBy',args}),limit=n=>({type:'limit',n}),startAfter=cursor=>({type:'cursor',cursor});
  export async function getDoc(ref){if(ref.path==='configuracoes/comercial')return snapshot('comercial',{descontoMaximoPercentual:15,alertaChavesPercentual:60,prazoReservaDias:7,modoEnvioTeste:false}); if(ref.path.startsWith('admins/'))return snapshot('admin',{ativo:true,tipo:'admin',nome:'Administradora'}); if(ref.path.startsWith('propostas/'))return snapshot('p1',proposal); if(ref.path.startsWith('unidades/'))return snapshot('2208-A',{...proposal.unidadeSnapshot,status:'aprovada',propostaAtualId:'p1'}); throw Error('Unexpected related read: '+ref.path);}
  export async function getCountFromServer(){return {data:()=>({count:30})}};
  export async function getDocs(ref){
    if(ref.name==='corretores')throw Error('Full broker collection read');
    if(ref.name==='historico_propostas')return {docs:[],size:0};
    if(ref.name==='unidades')return {docs:[snapshot('2208-A',{...proposal.unidadeSnapshot,status:'aprovada'})],size:1};
    const constraints=ref.constraints||[]; const max=constraints.find(c=>c.type==='limit')?.n;
    if(!max)throw Error('Unbounded proposal query');
    const offset=constraints.some(c=>c.type==='cursor')?25:0;
    const docs=Array.from({length:Math.min(max,30-offset)},(_,i)=>snapshot('p'+(i+offset+1),{...proposal,statusProposta:'reservada'})); return {docs,size:docs.length};
  }
  export const onAuthStateChanged=(_auth,callback)=>setTimeout(()=>callback({uid:'admin'}),0);
  export async function signOut(){};
  export async function setDoc(){throw Error('Browser verification never writes');}
  export const deleteField=()=>null,serverTimestamp=()=>new Date(),Timestamp={fromDate:date=>date};
  export async function runTransaction(){throw Error('Browser verification never writes');}
  `;
  const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}try{const data=fs.readFileSync(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:'msedge'});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/firebase.js')||url.hostname==='www.gstatic.com'){await route.fulfill({contentType:'text/javascript',body:mock});return;}if(url.hostname!=='127.0.0.1'){await route.abort();return;}await route.continue();});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
    const origin='http://127.0.0.1:'+server.address().port;
    fs.mkdirSync(path.join(root,'tests/artifacts'),{recursive:true});
    for(const file of ['configuracoes-comerciais.html','painel-admin.html','gestao-propostas.html','tabela-admin.html','detalhes-proposta.html?id=p1']){
      await page.goto(origin+'/'+file);await page.waitForSelector('html.page-authorized');
      if(file.startsWith('configuracoes')){await page.waitForSelector('#settingsStatus.ready');assert.equal(await page.locator('#maxDiscount').inputValue(),'15');assert.equal(await page.locator('#testMode').isChecked(),false);}
      if(file.startsWith('gestao')){
        await page.waitForSelector('#proposalRows tr');assert.equal(await page.locator('#proposalRows tr').count(),25);
        await page.getByRole('button',{name:'Carregar mais 25 propostas'}).click();
        await page.waitForFunction(()=>document.querySelectorAll('#proposalRows tr').length===30);
        await page.locator('#proposalSearch').fill('p30');assert.equal(await page.locator('#proposalRows tr').count(),1);
        await page.locator('#proposalSearch').fill('');
      }
      if(file.startsWith('detalhes')){
        await page.waitForSelector('#proposalApp:not([hidden])');
        assert.match(await page.locator('#financeRows').innerText(),/217.102,08/);
        await page.locator('#originalCondition summary').click();
        assert.match(await page.locator('#originalConditionContent').innerText(),/162.826/);
        await page.getByRole('button',{name:'Fazer uma Contraproposta'}).click();
        await page.waitForSelector('#counterproposalForm:not([hidden])');
        await page.locator('[data-counter-date]').last().fill('2029-12-15');
        await page.locator('#saveCounterproposal').click();
        await page.waitForSelector('#counterproposalDisplay:not([hidden])');
        assert.match(await page.locator('#counterproposalDisplay').innerText(),/217.102,08/);
        assert.equal(await page.locator('[data-confirm-counterproposal]').count(),0);
        await page.emulateMedia({media:'print'});
        assert.equal(await page.locator('.proposal-summary').isVisible(),false);
        assert.equal(await page.locator('#counterproposalDisplay').isVisible(),true);
        await page.pdf({path:path.join(root,'tests/artifacts/contraproposta.pdf'),preferCSSPageSize:true});
        await page.emulateMedia({media:'screen'});
        await page.getByRole('button',{name:'Editar proposta',exact:true}).click();
        assert.equal(await page.locator('#saveCounterproposal').innerText(),'Salvar alteração da proposta');
        await page.locator('#cancelCounterproposal').click();
        assert.equal(await page.locator('#commercialStage').inputValue(),'documentos');
      }
      await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0)});
      await page.screenshot({path:path.join(root,'tests/artifacts',file.split('.')[0]+'.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile overflow '+file);
      await page.screenshot({path:path.join(root,'tests/artifacts',file.split('.')[0]+'-mobile.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
    }
    assert.deepEqual(errors,[]);console.log('Four commercial pages: desktop/mobile, pagination, search, original condition and counterproposal UI passed. No Firebase network access.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
