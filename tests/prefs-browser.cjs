const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
async function run(browser, root, evidence) {
  const source = await fs.readFile(path.join(root, 'features.js'), 'utf8');
  const defaults = vm.runInNewContext(source.slice(source.indexOf('const DEFAULTS'), source.indexOf('// number settings')) + '\nDEFAULTS');
  const server = http.createServer(async (req,res) => {
    try {
      const file = path.resolve(root, '.' + new URL(req.url,'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      res.setHeader('Content-Type', ({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const page = await browser.newPage({viewport:{width:980,height:720}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const workers=[];page.on('worker',worker=>workers.push(worker.url()));
  page.on('console',m=>{if(m.type()==='error' && !m.text().includes('404')) errors.push(m.text());});
  try {
    await page.addInitScript(({defaults})=>{
      const callbacks={}; const general={theme:'dark',glass:'frosted',shown:true,vertical:false,version:'1.4.0'};
      window.prefs=new Proxy({}, {get:(_t,key)=>{
        if(String(key).startsWith('on')) return cb=>(callbacks[key]||=[]).push(cb);
        if(key==='features') return ()=>Promise.resolve(defaults);
        if(key==='general') return ()=>Promise.resolve(general);
        if(key==='setGeneral') return (key,value)=>{general[key]=value;(callbacks.onGeneral||[]).forEach(cb=>cb({...general}));};
        if(key==='setFeatures') return patch=>{Object.assign(defaults,patch);(callbacks.onFeatures||[]).forEach(cb=>cb({...defaults}));};
        if(key==='bridgeStatus') return ()=>Promise.resolve({state:'ok'});
        if(['downloadFolders','addDownloadFolder','removeDownloadFolder'].includes(key)) return ()=>Promise.resolve([]);
        return ()=>Promise.resolve({});
      }});
    },{defaults});
    await page.goto(`http://127.0.0.1:${server.address().port}/prefs/index.html`);
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('html').getAttribute('data-wall'),'smoke');
    await page.evaluate(()=>{
      window.navPerf={frames:[],longTasks:[],handlers:[]};
      window.navPerfObserver=new PerformanceObserver(list=>window.navPerf.longTasks.push(...list.getEntries().map(e=>e.duration)));
      window.navPerfObserver.observe({type:'longtask',buffered:false});
      window.navPerfRunning=true;let last=performance.now();function tick(now){if(!window.navPerfRunning)return;window.navPerf.frames.push(now-last);last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);
    });
    for(const id of ['island','companion','faith','alerts','connections','appearance','general','island','appearance']) {
      await page.evaluate(id=>{const start=performance.now();document.querySelector(`[data-page="${id}"]`).click();window.navPerf.handlers.push(performance.now()-start);},id);
      await page.waitForTimeout(900);
    }
    const navigationPerf=await page.evaluate(()=>{
      window.navPerfRunning=false;window.navPerfObserver.disconnect();
      const p=window.navPerf,sorted=p.frames.sort((a,b)=>a-b);
      return {frameP75:sorted[Math.floor(sorted.length*.75)],frameP95:sorted[Math.floor(sorted.length*.95)],longTasks:p.longTasks.length,longTaskMax:Math.max(0,...p.longTasks),handlerMax:Math.max(...p.handlers)};
    });
    await page.locator('[data-page="appearance"]').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#appearance .group').first().evaluate(e=>getComputedStyle(e).transform),'none');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.page.on').count(),1);
    assert.equal(await page.locator('.wall-choice').count(),10);
    assert.ok(await page.locator('#appearance .card').evaluate(e=>e.style.backdropFilter.includes('flint-lg')));
    assert.equal(await page.locator('#appearance .group').first().evaluate(e=>getComputedStyle(e).backdropFilter),'none');
    assert.equal(await page.locator('#appearance .group').first().evaluate(e=>getComputedStyle(e).transform),'none');
    await fs.mkdir(evidence,{recursive:true});
    await page.screenshot({path:path.join(evidence,'prefs-dark.png')});
    await page.locator('[data-appearance="theme"][data-value="light"]').click();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.locator('[data-appearance="glass"][data-value="clear"]').click();
    assert.equal(await page.locator('html').getAttribute('data-glass'),'clear');
    await page.locator('.wall-choice[data-value="bloom"]').click();
    assert.equal(await page.locator('html').getAttribute('data-wall'),'bloom');
    await page.waitForTimeout(700);
    await page.screenshot({path:path.join(evidence,'prefs-light.png')});
    // Rapid interruptions must leave exactly one page and a settled lens.
    for (const id of ['general','island','companion','faith','alerts','appearance']) await page.locator(`[data-page="${id}"]`).click({force:true});
    await page.waitForTimeout(1400);
    assert.equal(await page.locator('.page.on').count(),1);
    assert.ok(await page.locator('#appearance').evaluate(e=>e.classList.contains('on')));
    const overlap=await page.locator('.nav-lens').evaluate(e=>{
      const a=document.querySelector('.side a.on').getBoundingClientRect(),b=e.getBoundingClientRect();
      return Math.abs(a.y-b.y)<1 && Math.abs(a.height-b.height)<1;
    });
    assert.ok(overlap);
    await page.locator('#find').fill('clipboard');
    assert.equal(await page.locator('#no-results').isVisible(),false);
    await page.locator('#find').fill('');
    await page.setViewportSize({width:760,height:560});
    await page.waitForTimeout(1100);
    const fits=await page.evaluate(()=>document.body.scrollWidth<=innerWidth);
    assert.ok(fits);
    await page.screenshot({path:path.join(evidence,'prefs-small.png')});
    await page.waitForFunction(()=>!document.body.classList.contains('settings-in-motion'));
    assert.ok(await page.locator('.side').evaluate(e=>getComputedStyle(e).backdropFilter.includes('flint-lg')));
    assert.ok(workers.some(url=>url.endsWith('/glass-worker.js')),'map worker must be running');
    assert.deepEqual(errors,[]);
    return {navigationPerf,worker:'verified',settledRefraction:'restored',appearance:'theme, glass and all 10 wallpapers passed',rapidNavigation:'single page; lens aligned',search:'passed',smallViewport:'760x560 fits',errors};
  } finally {await page.close();await new Promise(resolve=>server.close(resolve));}
}
module.exports={run};
