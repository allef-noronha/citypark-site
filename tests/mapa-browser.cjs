// Executes real map, linking, previous-sale and detail modules with isolated Firebase data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const packages=process.env.CODEX_NODE_PACKAGES || path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(require.resolve('playwright',{paths:[packages]}));
const root=path.resolve(__dirname,'..');
(async()=>{
  const {standard}=await import('../firebase/tests/fixtures.mjs');
  const condition=standard();
  const mock=`
    export const db={},auth={};
    const mode=new URL(location.href).searchParams.get('scenario') || 'reserved';
    const unit={unidade:'204 A',tipologia:'2 Quartos',areaM2:78.83,status:mode==='reserved'?'reservada':'vendida',destinacao:'venda',propostaAtualId:['reserved','sold'].includes(mode)?'p1':null};
    const proposal={unidadeId:'204-A',unidadeSnapshot:{unidade:'204 A',tipologia:'2 Quartos'},cliente:{nomeCompleto:'Cliente original'},corretorId:null,corretorSnapshot:{nome:'Corretor original'},statusProposta:unit.status,condicaoProposta:${JSON.stringify(condition)},criadoEm:'2026-09-01T12:00:00Z'};
    const initial={'admins/admin-test':{ativo:true,tipo:'admin'},'unidades/204-A':unit,'configuracoes/comercial':{descontoMaximoPercentual:15,alertaChavesPercentual:60,prazoReservaDias:7,modoEnvioTeste:false},'disponibilidade_publica/estoque':{unidades:{}}};
    if(!['new','new-pj'].includes(mode))initial['propostas/p1']=proposal;
    initial['propostas/P2tOk0jgBIElnge2AW7T']={...proposal,unidadeId:'old-unit',cliente:{nomeCompleto:'Proposta antiga da sessão'}};
    if(mode==='sequence'){
      delete initial['propostas/p1'];
      initial['unidades/204-A']={...unit,id:'stored-unit-id',status:'vendida',propostaAtualId:'proposal-A'};
      initial['unidades/205-B']={...unit,id:'stored-unit-id',unidade:'205 B',status:'reservada',propostaAtualId:'proposal-B'};
      initial['propostas/proposal-A']={...proposal,id:'P2tOk0jgBIElnge2AW7T',statusProposta:'vendida',cliente:{nomeCompleto:'Cliente A'}};
      initial['propostas/proposal-B']={...proposal,id:'P2tOk0jgBIElnge2AW7T',unidadeId:'205-B',statusProposta:'reservada',unidadeSnapshot:{unidade:'205 B'},cliente:{nomeCompleto:'Cliente B'}};
    }
    const store=window.mapTestStore ||= JSON.parse(sessionStorage.getItem('mapStore') || JSON.stringify(initial));
    sessionStorage.setItem('mapStore',JSON.stringify(store));
    const listeners=window.mapListeners ||= [];
    let seq=0;
    export function collection(_db,name){return {name};}
    export function doc(base,name,id){const col=base.name || name;const key=base.name?'h'+(++seq):id;return {path:col+'/'+key,id:key,parent:{id:col}};}
    const snapshot=ref=>({id:ref.id,ref,exists:()=>!!store[ref.path],data:()=>store[ref.path]});
    export const where=(...args)=>({args});
    export const query=(ref,...filters)=>({...ref,filters});
    export async function getDoc(ref){return snapshot(ref);}
    export async function getDocs(ref){const docs=Object.keys(store).filter(key=>key.startsWith(ref.name+'/') && (!ref.filters || ref.filters.every(f=>store[key][f.args[0]]===f.args[2]))).map(key=>snapshot({path:key,id:key.split('/')[1],parent:{id:ref.name}}));return {docs,size:docs.length};}
    export function onSnapshot(ref,callback){listeners.push([ref,callback]);getDocs(ref).then(callback);return ()=>{};}
    export const onAuthStateChanged=(_auth,callback)=>setTimeout(()=>callback({uid:'admin-test'}),0);
    export const serverTimestamp=()=>new Date().toISOString(),Timestamp={fromDate:d=>d};
    export const deleteField=()=>null;
    export async function signOut(){};
    export async function runTransaction(_db,callback){
      const pending=[];
      await callback({get:async ref=>snapshot(ref),set:(ref,data)=>pending.push([ref.path,data]),update:(ref,data)=>pending.push([ref.path,{...store[ref.path],...data}])});
      pending.forEach(([key,data])=>store[key]=data);
      sessionStorage.setItem('mapStore',JSON.stringify(store));
      for(const [ref,cb] of listeners)cb(await getDocs(ref));
    }
  `;
  const server=http.createServer((req,res)=>{
    const requestUrl=new URL(req.url,'http://localhost');
    // Reproduce the user's clean-URL server: .html redirect drops the query string.
    if(requestUrl.pathname==='/detalhes-proposta.html'){res.writeHead(302,{Location:'/detalhes-proposta'}).end();return;}
    const pathname=requestUrl.pathname==='/detalhes-proposta'?'/detalhes-proposta.html':requestUrl.pathname;
    const file=path.resolve(root,'.'+decodeURIComponent(pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{const data=fs.readFileSync(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:'msedge'});
    for(const scenario of ['reserved','sold','existing','new','new-pj','sequence']){
      const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
      await context.addInitScript(()=>sessionStorage.setItem('cityparkAdminProposalId','P2tOk0jgBIElnge2AW7T'));
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.pathname.endsWith('/firebase.js')||url.hostname==='www.gstatic.com'){await route.fulfill({contentType:'text/javascript',body:mock});return;}
        if(url.hostname!=='127.0.0.1'){await route.abort();return;}
        await route.continue();
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      const origin='http://127.0.0.1:'+server.address().port;
      if(scenario==='sequence'){
        for(const [unitId,proposalId,client,unitLabel] of [['204-A','proposal-A','Cliente A','204 A'],['205-B','proposal-B','Cliente B','205 B'],['204-A','proposal-A','Cliente A','204 A']]){
          await page.goto(origin+'/tabela-admin.html?scenario=sequence');
          await page.locator('[data-unit-id="'+unitId+'"]').click();
          await page.getByRole('link',{name:'Abrir proposta vinculada',exact:true}).click();
          await page.locator('#proposalApp:not([hidden])').waitFor();
          assert.equal(new URL(page.url()).pathname,'/detalhes-proposta');
          assert.equal(new URL(page.url()).searchParams.get('id'),proposalId);
          assert.equal(await page.locator('#summaryProposalId').innerText(),proposalId);
          assert.equal(await page.locator('#summaryClient').innerText(),client);
          assert.equal(await page.locator('#summaryUnit').innerText(),unitLabel);
          await page.locator('.anchor-sidebar a').first().click();
          await page.reload();
          await page.locator('#proposalApp:not([hidden])').waitFor();
          assert.equal(await page.locator('#summaryProposalId').innerText(),proposalId);
        }
        assert.deepEqual(errors,[],scenario);
        await context.close();
        continue;
      }
      await page.goto('http://127.0.0.1:'+server.address().port+'/tabela-admin.html?scenario='+scenario);
      await page.locator('[data-unit-id="204-A"]').click();
      if(['reserved','sold'].includes(scenario)){
        await page.getByRole('link',{name:'Abrir proposta vinculada',exact:true}).waitFor();
        assert.equal(await page.locator('#previousSaleForm').isVisible(),false);
      }else if(scenario==='existing'){
        await page.locator('#linkProposalForm:not([hidden])').waitFor();
        await page.locator('#linkProposalSelect').selectOption('p1');
        assert.equal(await page.locator('#linkProposalPreview').getAttribute('href'),'detalhes-proposta.html?id=p1#proposta=p1');
        await page.locator('#linkProposalReason').fill('Conferência cadastral');
        await page.locator('#linkProposalReference').fill('Contrato 123');
        await page.locator('#linkProposalChecked').check();
        const before=await page.evaluate(()=>JSON.stringify(window.mapTestStore['propostas/p1']));
        await page.locator('#linkProposalSubmit').click();
        await page.getByRole('link',{name:'Abrir proposta vinculada',exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>JSON.stringify(window.mapTestStore['propostas/p1'])),before);
        assert.equal(await page.evaluate(()=>window.mapTestStore['unidades/204-A'].propostaAtualId),'p1');
      }else{
        await page.locator('#previousSaleForm:not([hidden])').waitFor();
        assert.equal(await page.locator('#linkProposalSubmit').isDisabled(),true);
        if(scenario==='new-pj') {
          await page.locator('#previousClientType').selectOption('PJ');
          await page.locator('#previousCompany').fill('Empresa da venda anterior');
          await page.locator('#previousCnpj').fill('12.345.678/0001-90');
          await page.locator('#previousCompanyPhone').fill('(11) 3333-4444');
          await page.locator('#previousCompanyEmail').fill('empresa@example.test');
          assert.equal(await page.locator('#previousClient').isDisabled(),true);
        } else {
          await page.locator('#previousClient').fill('Cliente da venda anterior');
          await page.locator('#previousCpf').fill('52998224725');
          await page.locator('#previousClientPhone').fill('(11) 99999-9999');
          await page.locator('#previousClientEmail').fill('cliente@example.test');
          assert.equal(await page.locator('#previousCompany').isDisabled(),true);
        }
        await page.locator('#previousBroker').fill('Corretor da época');
        await page.locator('#previousDate').fill('2025-10-10');
        await page.locator('#previousCreci').fill('12345-F');
        await page.locator('#previousBrokerPhone').fill('(11) 98888-8888');
        await page.locator('#previousBrokerEmail').fill('corretor@example.test');
        await page.locator('#previousRealEstate').fill('Imobiliária da época');
        await page.locator('#previousTableValue').fill('15000000');
        await page.locator('#previousSignal [data-field=quantidade]').fill('1');
        await page.locator('#previousSignal [data-field=valor]').fill('2000000');
        await page.locator('#previousSignal [data-field=mes]').fill('2025-10');
        await page.locator('#previousAddPayment').click();
        await page.locator('#previousPayments [data-field=quantidade]').fill('10');
        await page.locator('#previousPayments [data-field=valor]').fill('100000');
        await page.locator('#previousPayments [data-field=mes]').fill('2025-11');
        await page.locator('#previousPayments [data-field=dia]').selectOption('30');
        await page.locator('#previousFinancing').fill('9345678');
        assert.match(await page.locator('#previousValue').inputValue(),/123.456,78/);
        assert.equal(await page.locator('#previousValue').getAttribute('readonly'),'');
        assert.match(await page.locator('#previousPayments [data-subtotal]').inputValue(),/10.000,00/);
        assert.equal(await page.locator('#previousPayments [data-share]').inputValue(),'8,10%');
        assert.equal(await page.locator('#previousFinancingShare').inputValue(),'75,70%');
        // Editing and clearing currency uses the same cents mask as the proposal form.
        await page.locator('#previousSignal [data-field=valor]').fill('');
        await page.locator('#previousSignal [data-field=valor]').fill('2000000');
        assert.match(await page.locator('#previousSignal [data-field=valor]').inputValue(),/R\$.*20.000,00/);
        await page.locator('#previousAddPayment').click();
        await page.locator('#previousPayments fieldset').last().locator('[data-field=periodicidade]').selectOption('outra');
        assert.equal(await page.locator('#previousPayments fieldset').last().locator('[data-field=quantidade]').getAttribute('readonly'),'');
        await page.locator('#previousPayments fieldset').last().locator('[data-remove]').click();
        const oldProposal=await page.evaluate(()=>JSON.stringify(window.mapTestStore['propostas/P2tOk0jgBIElnge2AW7T']));
        await page.locator('#previousConditions').fill('Entrada e saldo conforme contrato original');
        await page.locator('#previousReference').fill('Contrato 456');
        await page.locator('#previousChecked').check();
        if(scenario==='new') {
          await page.locator('#previousCpf').fill('11111111111');
          await page.locator('#previousSubmit').click();
          await page.locator('#previousError').filter({hasText:'CPF válido'}).waitFor();
          assert.equal(await page.evaluate(()=>!!window.mapTestStore['propostas/venda-anterior-204-A']),false);
          await page.locator('#previousCpf').fill('52998224725');
        }
        await page.locator('#previousSubmit').click();
        await page.locator('#proposalApp:not([hidden])').waitFor();
        const saved=await page.evaluate(()=>window.mapTestStore['propostas/venda-anterior-204-A']);
        assert.equal(saved.cliente.nomeCompleto,scenario==='new-pj'?'Empresa da venda anterior':'Cliente da venda anterior');
        assert.equal(saved.cliente.tipoCliente,scenario==='new-pj'?'PJ':'PF');
        assert.equal(saved.corretorSnapshot.creci,'12345-F');
        assert.equal(saved.condicaoProposta.totalCalculadoCentavos,12345678);
        assert.equal(saved.condicaoProposta.componentes.parcelas.grupo01.vencimentos.length,10);
        assert.equal(await page.evaluate(()=>JSON.stringify(window.mapTestStore['propostas/P2tOk0jgBIElnge2AW7T'])),oldProposal);
        assert.equal(saved.corretorSnapshot.nome,'Corretor da época');
        assert.equal(saved.vendaAnterior.valorCentavos,12345678);
        assert.equal(saved.unidadeSnapshot.tipologia,'2 Quartos');
        assert.equal(saved.unidadeSnapshot.areaM2,78.83);
        assert.equal(saved.vendaAnterior.dataVenda,'2025-10-10');
        assert.equal(saved.vendaAnterior.condicoes,'Entrada e saldo conforme contrato original');
        assert.equal(saved.vendaAnterior.referencia,'Contrato 456');
        assert.equal(await page.evaluate(()=>window.mapTestStore['unidades/204-A'].status),'vendida');
      }
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      fs.mkdirSync(path.join(root,'tests/artifacts'),{recursive:true});
      await page.screenshot({path:path.join(root,'tests/artifacts/mapa-'+scenario+'.png')});
      if(!['new','new-pj'].includes(scenario))await page.getByRole('link',{name:'Abrir proposta vinculada',exact:true}).click();
      await page.locator('#proposalApp:not([hidden])').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('id'),['new','new-pj'].includes(scenario)?'venda-anterior-204-A':'p1');
      assert.equal(await page.locator('#summaryProposalId').innerText(),['new','new-pj'].includes(scenario)?'venda-anterior-204-A':'p1');
      if(['new','new-pj'].includes(scenario)){
        assert.equal(await page.locator('#summaryClient').innerText(),scenario==='new-pj'?'Empresa da venda anterior':'Cliente da venda anterior');
        assert.equal(await page.locator('#summaryBroker').innerText(),'Corretor da época');
        assert.equal(await page.locator('#condicao-proposta').isVisible(),true);
        assert.equal(await page.locator('#currentProposalFinance').isVisible(),true);
        assert.match(await page.locator('#financeRows').innerText(),/10.000,00/);
        assert.match(await page.locator('#financeRows').innerText(),/8,10%/);
        assert.match(await page.locator('#financeRows').innerText(),/30\/11\/2025/);
        assert.equal(await page.locator('#originalCondition').isVisible(),false);
        assert.equal(await page.locator('#openCounterproposal').isVisible(),false);
        assert.match(await page.locator('[data-previous-sale-value]').innerText(),/123.456,78/);
        assert.equal(await page.locator('[data-previous-sale-date]').innerText(),'10/10/2025');
        assert.equal(await page.locator('[data-previous-sale-reference]').innerText(),'Contrato 456');
        assert.equal(await page.locator('[data-previous-sale-conditions]').innerText(),'Entrada e saldo conforme contrato original');
        assert.match(await page.locator('#historyTimeline').innerText(),/venda anterior cadastrada/);
        await page.locator('#condicao-proposta').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(root,'tests/artifacts/venda-anterior-detalhes.png')});
      }
      assert.deepEqual(errors,[],scenario);
      await context.close();
    }
    console.log('Mapa: 5 fluxos (incluindo cadastro completo PF/PJ) e sequência de unidades diferentes, redirecionamento sem query, sessão antiga e recarregamento. Desktop/mobile. Firebase isolado.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
