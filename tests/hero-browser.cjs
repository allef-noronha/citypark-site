// Testa o vídeo real e as alternativas, com rede externa bloqueada.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const packages=process.env.CODEX_NODE_PACKAGES || path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(require.resolve('playwright',{paths:[packages]}));
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{const body=fs.readFileSync(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4'})[path.extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:'msedge'});
    for(const mode of ['desktop','mobile','error','blocked','reduced']){
      const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1366,height:768},reducedMotion:mode==='reduced'?'reduce':'no-preference'});
      if(mode==='blocked')await context.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Autoplay bloqueado','NotAllowedError'));});
      let releaseMedia,releaseMain,mediaRequested;
      const mediaGate=new Promise(resolve=>releaseMedia=resolve),mainGate=new Promise(resolve=>releaseMain=resolve),requested=new Promise(resolve=>mediaRequested=resolve);
      const errors=[],requests=[];
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname!=='127.0.0.1'){await route.abort();return;}
        requests.push(url.pathname);
        if(url.pathname==='/media/hero-1080p.mp4'){
          mediaRequested();
          if(mode==='error'){await route.fulfill({status:404,body:''});return;}
          if(['desktop','mobile'].includes(mode))await mediaGate;
        }
        if(url.pathname==='/js/index.js'&&['desktop','mobile'].includes(mode))await mainGate;
        await route.continue();
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'commit'});
      if(['desktop','mobile'].includes(mode)){
        await requested;
        await page.locator('.hero-video').waitFor({state:'attached'});
        assert.equal(await page.locator('.hero-fallback').evaluate(el=>getComputedStyle(el).visibility),'hidden');
        assert.equal(requests.includes('/img/Folder.jpg'),false);
        assert.equal(await page.locator('.hero-video').getAttribute('poster'),null);
        releaseMedia();
        await page.waitForFunction(()=>{const v=document.querySelector('.hero-video');return v&&v.readyState>=2&&!v.paused&&v.currentTime>0;});
        // O vídeo já reproduz antes do script principal e de DOMContentLoaded.
        assert.notEqual(await page.evaluate(()=>document.readyState),'complete');
        assert.equal(await page.locator('.hero').evaluate(el=>el.classList.contains('is-fallback')),false);
        assert.equal(requests.includes('/img/Folder.jpg'),false);
        releaseMain();
        await page.waitForLoadState('domcontentloaded');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      }else{
        await page.locator('.hero.is-fallback').waitFor();
        await page.waitForFunction(()=>document.querySelector('.hero-fallback').naturalWidth>0);
        assert.equal(await page.locator('.hero-fallback').evaluate(el=>getComputedStyle(el).visibility),'visible');
        assert.equal(await page.locator('.hero-video').evaluate(el=>el.paused),true);
      }
      fs.mkdirSync(path.join(root,'tests/artifacts'),{recursive:true});
      await page.screenshot({path:path.join(root,'tests/artifacts/hero-'+mode+'.png')});
      assert.deepEqual(errors,[],mode);
      await context.close();
    }
    console.log('Hero: vídeo real em desktop/mobile antes de DOMContentLoaded, espera sem imagem e fallback por erro, autoplay bloqueado e movimento reduzido.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
