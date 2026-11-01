const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

// Uses the complete production HTML/CSS/scripts, with only the Electron bridge
// mocked. Pass a Playwright Browser so an existing local installation can be used.
async function run(browser, root, evidence) {
  const server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage({ viewport: { width: 640, height: 320 }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text()); });
  try {
    await page.addInitScript(() => {
      const listeners = {};
      window.emitNova = (name, value) => (listeners[name] || []).forEach(cb => cb(value));
      const api = new Proxy({}, { get: (_t, key) => {
        if (String(key).startsWith('on')) return cb => (listeners[key] ||= []).push(cb);
        if (['apps', 'shelf', 'downloads', 'system'].includes(key)) return new Proxy({}, { get: (_t, method) => () => Promise.resolve(method === 'list' ? [] : key === 'system' ? { clips: [], weather: null } : {}) });
        if (key === 'features') return () => Promise.resolve({ novaEyes: false, morningBrief: false, reminders: false, water: false, welcomeBack: false, wellbeing: false });
        return () => Promise.resolve(null);
      } });
      window.nova = api;
      const original = window.matchMedia.bind(window);
      const reduce = new EventTarget(); reduce.matches = false;
      reduce.media = '(prefers-reduced-transparency: reduce)';
      window.matchMedia = q => q === reduce.media ? reduce : original(q);
      window.setReducedTransparency = value => { reduce.matches = value; reduce.dispatchEvent(new Event('change')); };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.querySelector('#island').classList.contains('lg-ready'));
    await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 320;
      const ctx = canvas.getContext('2d');
      for (let x = 0; x < 640; x += 16) for (let y = 0; y < 320; y += 16) {
        ctx.fillStyle = (x + y) % 32 ? '#eac065' : '#355875'; ctx.fillRect(x, y, 16, 16);
      }
      ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('FLINT / NOVA 012345', 100, 140);
      window.emitNova('onBackdrop', { width: 640, height: 320, parts: [{ x: 0, y: 0, width: 640, height: 320, url: canvas.toDataURL() }] });
    });
    await page.waitForTimeout(500);
    const results = [];
    const states = [
      ['idle', false, false, 'right'], ['compact', false, false, 'right'],
      ['toast', false, false, 'right'], ['peek', false, false, 'right'],
      ['expanded', false, false, 'right'], ['idle', true, false, 'right'],
      ['reminder', false, false, 'right'], ['scene', false, false, 'right'],
      ['idle', false, true, 'left'], ['idle', false, true, 'right'],
    ];
    await fs.mkdir(evidence, { recursive: true });
    for (const [mode, docked, vertical, side] of states) {
      await page.evaluate(({ mode, docked, vertical, side }) => {
        state.hover = mode === 'expanded'; state.pinned = mode === 'expanded';
        window.emitNova('onAnchor', { x: 320, y: vertical ? 150 : 8, docked, vertical, side });
        island.classList.remove('idle', 'compact', 'toast', 'peek', 'expanded', 'scene', 'reminder');
        island.classList.add(mode); lastMode = mode; window.FlintMotion.panels(island,mode,'idle'); positionIsland(); wake(1000);
      }, { mode, docked, vertical, side });
      await page.waitForTimeout(1100);
      const result = await page.evaluate(() => {
        const r = island.getBoundingClientRect(), c = getComputedStyle(document.querySelector('.clip'));
        const url = document.querySelector('.lg-optics').style.filter;
        const id = url.match(/#([^)"]+)/)?.[1];
        return { width: r.width, height: r.height, radius: c.borderTopLeftRadius, filterWidth: document.getElementById(id)?.getAttribute('width'), filters: document.querySelectorAll('filter').length };
      });
      assert.equal(+result.filterWidth, Math.round(result.width) + 56, JSON.stringify({ mode, result }));
      assert.ok(result.filters <= 48);
      results.push({ mode, docked, vertical, side, ...result });
      await page.screenshot({ path: path.join(evidence, `${mode}-${docked ? 'docked' : vertical ? side : 'floating'}.png`), omitBackground: true });
    }
    await page.evaluate(() => {
      window.emitNova('onAnchor', { x: 320, y: 8, docked: false, vertical: false, side: 'right' });
      state.hover = true; state.pinned = true; render(); wake(1000);
    });
    await page.waitForTimeout(1000);
    await page.locator('.tab[data-tab="timer"]').click();
    await page.waitForTimeout(650);
    const tabs = await page.evaluate(() => {
      const panes = [document.querySelector('.seg'), document.querySelector('.seg-thumb')];
      return panes.map(p => {
        const id = p.style.backdropFilter.match(/#([^)"]+)/)?.[1];
        const filter = document.getElementById(id);
        return { url: p.style.backdropFilter, width: p.clientWidth, mapWidth: +filter?.getAttribute('width'), channels: filter?.querySelectorAll('feDisplacementMap').length };
      });
    });
    for (const pane of tabs) { assert.ok(pane.url.includes('flint-lg')); assert.equal(pane.mapWidth, pane.width + 56); }
    assert.equal(tabs[0].channels, 3); assert.equal(tabs[1].channels, 1);
    assert.ok(await page.locator('#v-timer').evaluate(e => e.classList.contains('active')));
    for (const name of ['system','media','prayer','timer']) await page.locator(`.tab[data-tab="${name}"]`).click({force:true});
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('.view.active').count(),1);
    assert.equal(await page.locator('.view.active').getAttribute('id'),'v-timer');
    assert.ok(await page.locator('.seg-thumb').evaluate(e => {
      const r=e.getBoundingClientRect(),a=document.querySelector('.tab.active').getBoundingClientRect();
      return Math.abs(r.x-a.x)<1 && Math.abs(r.width-a.width)<1;
    }));
    await page.screenshot({ path: path.join(evidence, 'tabs-glass.png'), omitBackground: true });
    const before = await page.locator('#island').boundingBox();
    await page.evaluate(() => window.setReducedTransparency(true));
    assert.equal(await page.locator('.lg-optics').evaluate(e => getComputedStyle(e).visibility), 'hidden');
    assert.equal(await page.locator('.seg').evaluate(e => getComputedStyle(e).backdropFilter), 'none');
    assert.deepEqual(await page.locator('#island').boundingBox(), before);
    await page.evaluate(() => window.setReducedTransparency(false));
    await page.waitForTimeout(300);
    assert.ok(await page.locator('.lg-optics').evaluate(e => e.style.filter.includes('flint-lg')));
    await page.evaluate(() => window.emitNova('onNear', { dx: 12, dy: 4 }));
    assert.ok(await page.locator('.clip').evaluate(e => e.style.getPropertyValue('--gx')));
    await page.evaluate(() => window.emitNova('onNear', null));
    assert.equal(await page.locator('.clip').evaluate(e => e.style.getPropertyValue('--gx')), '');
    const sideMotion=[];
    for(const side of ['left','right']) {
      await page.evaluate(side=>{
        state.timer={total:300,remaining:250,endAt:Date.now()+250000,running:true};drawTimer();
        window.emitNova('onAnchor',{x:side==='left'?0:640,y:160,vertical:true,side,docked:false});
        state.hover=true;state.pinned=true;render();
      },side);
      await page.waitForTimeout(1000);
      const frames=await page.evaluate(()=>new Promise(resolve=>{
        state.hover=false;state.pinned=false;render();const frames=[];const start=performance.now();
        function tick(){const r=island.getBoundingClientRect();frames.push({left:r.left,right:r.right,center:r.top+r.height/2});if(performance.now()-start<850)requestAnimationFrame(tick);else resolve(frames);}requestAnimationFrame(tick);
      }));
      assert.ok(frames.every(r=>Math.abs((side==='left'?r.left:r.right)-(side==='left'?0:640))<1),`${side}: dock edge must stay fixed ${JSON.stringify(frames.filter(r=>Math.abs((side==='left'?r.left:r.right)-(side==='left'?0:640))>=1).slice(0,4))}`);
      assert.ok(frames.every(r=>Math.abs(r.center-160)<1),`${side}: collapse must remain centered vertically`);
      await page.evaluate(()=>window.emitNova('onAnchor',{x:320,y:8,vertical:false,side:'right',docked:false}));
      await page.waitForTimeout(1200);
      const horizontalContent=await page.locator('.l-compact').evaluate(e=>({opacity:getComputedStyle(e).opacity,inert:e.inert,mode:lastMode,hover:state.hover,pinned:state.pinned,vertical:anchor.vertical}));
      assert.ok(+horizontalContent.opacity>.99 && !horizontalContent.inert,JSON.stringify(horizontalContent));
      assert.ok(await page.locator('.activity-time').isVisible());
      sideMotion.push({side,frames:frames.length,edge:'fixed',center:'fixed',horizontalContent:'visible'});
    }
    await page.evaluate(() => {
      state.timer = { total:3900, remaining:3896, endAt:Date.now()+3896000, running:true, phase:'focus' };
      state.pinned=false; state.hover=false; state.toastUntil=0; state.peekUntil=0;
      drawTimer(); render();
    });
    await page.waitForTimeout(1200);
    const pill=await page.locator('#island').boundingBox();
    assert.equal(pill.width,204);assert.equal(pill.height,38);
    assert.equal(await page.locator('.activity-label').textContent(),'Focus');
    const horizontalMotion=await page.evaluate(async()=>{
      async function sample(open){
        state.hover=open;state.pinned=open;render();
        return new Promise(resolve=>{const frames=[],start=performance.now();function tick(){const r=island.getBoundingClientRect();frames.push({center:r.left+r.width/2,top:r.top,width:r.width});if(performance.now()-start<900)requestAnimationFrame(tick);else resolve(frames);}requestAnimationFrame(tick);});
      }
      const opening=await sample(true),closing=await sample(false);return {opening,closing};
    });
    for(const frames of Object.values(horizontalMotion)) {
      assert.ok(frames.every(r=>Math.abs(r.center-320)<1),'horizontal expansion must stay centered');
      assert.ok(frames.every(r=>Math.abs(r.top-8)<1),'horizontal expansion must retain its top anchor');
    }
    assert.ok(horizontalMotion.closing.every((r,i,a)=>i===0 || r.width<=a[i-1].width+.1),'horizontal close must not overshoot');
    await page.screenshot({path:path.join(evidence,'focus-pill.png'),omitBackground:true});
    await page.evaluate(()=>window.emitNova('onPresentation',{active:true,attached:false}));
    await page.waitForTimeout(600);
    assert.ok(await page.locator('.clip').evaluate(e=>parseFloat(getComputedStyle(e).borderTopLeftRadius)>0));
    await page.evaluate(()=>window.emitNova('onPresentation',{active:true,attached:true}));
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.clip').evaluate(e=>parseFloat(getComputedStyle(e).borderTopLeftRadius)),0);
    assert.ok(await page.locator('.clip').evaluate(e=>parseFloat(getComputedStyle(e).borderBottomLeftRadius)>0));
    await page.evaluate(()=>window.emitNova('onPresentation',{active:false,attached:false}));
    await page.locator('.activity-pill').click();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.view.active').getAttribute('id'),'v-timer');
    await page.screenshot({path:path.join(evidence,'timer-readable.png'),omitBackground:true});
    await page.evaluate(()=>{state.pinned=true;window.emitNova('onOutsideClick');});
    await page.waitForTimeout(1200);
    assert.ok(await page.locator('#island').evaluate(e=>e.classList.contains('compact')));
    assert.ok(await page.evaluate(()=>state.timer.running && !state.pinned && !state.hover));
    const timing=await page.evaluate(()=>new Promise(resolve=>{
      const samples=[];let last=performance.now();function tick(now){samples.push(now-last);last=now;if(samples.length<120)requestAnimationFrame(tick);else {samples.sort((a,b)=>a-b);resolve({p75:samples[90],p95:samples[114]});}}requestAnimationFrame(tick);
    }));
    // An entirely transparent input must erase a previous opaque frame, rather
    // than compositing its old pixels into a recursive/ghosted backdrop.
    await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 320;
      window.emitNova('onBackdrop', { width: 640, height: 320, parts: [{ x: 0, y: 0, width: 640, height: 320, url: c.toDataURL() }] });
    });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#bd').evaluate(c => c.getContext('2d').getImageData(0, 0, 1, 1).data[3]), 0);
    assert.deepEqual(errors, []);
    return { results, tabs, sideMotion, horizontalMotion:{openingFrames:horizontalMotion.opening.length,closingFrames:horizontalMotion.closing.length,center:'fixed',close:'monotonic'}, errors, focusPill:'204x38; timer opens on click; outside click collapses without stopping timer', frameTiming:timing, atomicBackdropReplacement: 'passed', reducedTransparency: 'geometry unchanged; filters restored', pointerGlint: 'passed', deviceScaleFactor: 1.5 };
  } finally { await page.close(); await new Promise(resolve => server.close(resolve)); }
}
module.exports = { run };
