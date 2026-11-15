'use strict';

// Run with Node after npm ci and Electron's install script. Uses the real pages,
// preload bridges and settings store in a temporary profile, without starting
// the desktop helper or touching the user's Nova Island configuration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const DEFAULT = ['media', 'apps', 'shelf', 'prayer', 'timer', 'system'];

function checkStructure() {
  new vm.Script(fs.readFileSync(path.join(ROOT, 'prefs/prefs.js'), 'utf8'));
  const html = fs.readFileSync(path.join(ROOT, 'prefs/index.html'), 'utf8');
  const ids = [...html.matchAll(/data-tab-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, DEFAULT, 'each configurable tab has one stable card id');
  for (const id of DEFAULT) {
    assert.ok(html.includes(`data-reorder-tab="${id}"`), `${id} has a keyboard-accessible handle`);
  }
  for (const label of html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)) {
    assert.ok(!label[0].includes('data-reorder-tab'), 'drag handles must be outside checkbox labels');
  }
  for (const id of ['tab-order', 'reset-tab-order', 'tab-order-hint', 'tab-order-status']) {
    assert.ok(html.includes(`id="${id}"`), `${id} is present`);
  }
}

if (process.argv.includes('--syntax')) {
  checkStructure();
  console.log('Tab order UI structure verified');
} else if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-tab-order-test-'));
  env.NOVA_TAB_ORDER_TEST_PROFILE = profile;
  try {
    const result = spawnSync(require('electron'), [__filename], {
      cwd: ROOT, env, stdio: 'inherit', windowsHide: true, timeout: 90000,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    // Electron must exit before Windows releases its profile files. Dependencies
    // and downloaded binaries are deliberately retained for subsequent runs.
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith('nova-tab-order-test-'));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
} else {
  run().catch((error) => {
    console.error(error.stack || error);
    require('electron').app.exit(1);
  });
}

async function run() {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const progress = (message) => { if (process.env.NOVA_TAB_ORDER_TEST_DEBUG) console.log(message); };
  progress('Electron test main started');
  const profile = process.env.NOVA_TAB_ORDER_TEST_PROFILE;
  assert.ok(profile, 'run this test with Node to create its isolated profile');
  app.setPath('userData', profile);
  app.disableHardwareAcceleration();
  const windows = new Set();
  const errors = [];
  const patches = [];
  const windowRequests = [];
  let features;
  let prefs;
  let island;
  const evaluate = (win, code) => win.webContents.executeJavaScript(code, true);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(check, description) {
    const end = Date.now() + 5000;
    do {
      if (await check()) return;
      await delay(20);
    } while (Date.now() < end);
    throw new Error(`Timed out: ${description}`);
  }
  const cardOrder = () => evaluate(prefs,
    "[...document.querySelectorAll('#tab-order .chip')].map(el => el.dataset.tabId)");
  const islandOrder = () => evaluate(island,
    "[...document.querySelectorAll('.tab')].map(el => el.dataset.tab).filter(id => !['radio','downloads'].includes(id))");
  const orderWrites = () => patches.filter((patch) => Object.hasOwn(patch, 'tabOrder')).length;
  const tabFlags = () => Object.fromEntries(Object.entries(features.get()).filter(([key]) => /^tab[A-Z]/.test(key) && key !== 'tabOrder'));

  function subscribe() {
    features.onChange((f) => {
      for (const win of windows) {
        if (!win.isDestroyed()) win.webContents.send('features', f);
      }
    });
  }
  async function makeWindow(kind) {
    progress(`Creating ${kind} window`);
    const win = new BrowserWindow({
      width: kind === 'prefs' ? 760 : 1000, height: 560, show: false,
      frame: false, webPreferences: {
        preload: path.join(ROOT, kind === 'prefs' ? 'prefs/preload.js' : 'preload.js'),
        sandbox: true, contextIsolation: true, backgroundThrottling: false,
        partition: `tab-order-test-${process.pid}`,
      },
    });
    windows.add(win);
    win.once('closed', () => windows.delete(win));
    win.webContents.on('preload-error', (_event, _file, error) => errors.push(error.message));
    win.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason));
    win.webContents.on('console-message', (details, level, message) => {
      if (details.level === 'error' || level === 3) errors.push(details.message || message);
    });
    win.webContents.debugger.attach('1.3');
    win.webContents.debugger.on('message', (_event, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        errors.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text);
      }
    });
    progress(`Loading ${kind} page`);
    await win.loadFile(path.join(ROOT, kind === 'prefs' ? 'prefs/index.html' : 'index.html'));
    await win.webContents.debugger.sendCommand('Runtime.enable');
    if (kind === 'prefs') {
      await evaluate(win, "document.querySelector('.side a[data-page=island]').click()");
    }
    progress(`${kind} page loaded`);
    return win;
  }
  async function synced(expected) {
    await until(async () => JSON.stringify(await cardOrder()) === JSON.stringify(expected)
      && JSON.stringify(await islandOrder()) === JSON.stringify(expected), 'settings and Island order agree');
    assert.deepEqual(features.get().tabOrder, expected, 'backend receives the same order');
  }
  async function rect(selector) {
    return evaluate(prefs, `(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`);
  }
  async function mouse(type, x, y, down = false) {
    await prefs.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type, x, y, button: type === 'mouseMoved' && !down ? 'none' : 'left',
      buttons: down ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1,
    });
  }
  async function key(name, selector) {
    if (selector) await evaluate(prefs, `document.querySelector(${JSON.stringify(selector)}).focus()`);
    const codes = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, Escape: 27 };
    for (const type of ['keyDown', 'keyUp']) {
      await prefs.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type, key: name, code: name, windowsVirtualKeyCode: codes[name],
      });
    }
  }
  async function beginDrag(id, target) {
    const from = await rect(`[data-reorder-tab="${id}"]`);
    const to = await rect(`.chip[data-tab-id="${target}"]`);
    const sx = from.x + from.width / 2;
    const sy = from.y + from.height / 2;
    const tx = to.x + to.width / 4;
    const ty = to.y + to.height / 2;
    await evaluate(prefs, "document.addEventListener('pointerdown', e => window.__testPointerId = e.pointerId, {once:true, capture:true})");
    await mouse('mouseMoved', sx, sy);
    await mouse('mousePressed', sx, sy, true);
    await mouse('mouseMoved', sx + 8, sy, true);
    await mouse('mouseMoved', tx, ty, true);
    return { x: tx, y: ty };
  }
  async function click(selector) {
    const r = await rect(selector);
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y, true);
    await mouse('mouseReleased', x, y);
  }

  try {
    await app.whenReady();
    progress('Electron app ready');
    checkStructure();
    features = require('../features');
    features.set({ noAnimations: true, noBlur: true });
    subscribe();
    for (const channel of ['features-get', 'island-features']) ipcMain.handle(channel, () => features.get());
    ipcMain.on('features-set', (_event, patch) => { patches.push(patch); features.set(patch); });
    ipcMain.on('features-reset', () => features.reset());
    ipcMain.on('prefs-window', (_event, action) => windowRequests.push(action));
    const snapshots = {
      'general-get': { shown: true, vertical: false, battery: -1, version: 'test' },
      'loc-get': { mode: 'auto' }, 'cal-get': { events: [], updated: 0 },
      'dl-folders': [], 'bridge-status': { state: 'ok' },
      'plugins-list': { plugins: [], error: '' }, 'plugins-active': [],
      'apps-list': [], 'apps-all': [], 'apps-running': [], 'shelf-list': [],
      'system-snapshot': { clips: [], weather: null }, 'prayer-snapshot': null,
      'dl-snapshot': { online: false, items: [] }, 'net-get': null,
    };
    for (const [channel, value] of Object.entries(snapshots)) ipcMain.handle(channel, () => value);
    prefs = await makeWindow('prefs');
    island = await makeWindow('island');
    await synced(DEFAULT);
    progress('Default settings and Island ready');
    await evaluate(island, "window.__testTabs = [...document.querySelectorAll('.tab')]; selectTab('prayer')");
    island.webContents.send('toggle');

    const flags = tabFlags();
    let writes = orderWrites();
    let drop = await beginDrag('apps', 'media');
    assert.equal(await evaluate(prefs, "document.querySelector('#tab-order').hasPointerCapture(window.__testPointerId)"), true,
      'moving the card preserves pointer capture on the grid');
    assert.equal(orderWrites(), writes, 'pointer movement does not persist intermediate orders');
    await mouse('mouseReleased', drop.x, drop.y);
    const appsFirst = ['apps', 'media', 'shelf', 'prayer', 'timer', 'system'];
    await synced(appsFirst);
    progress('First pointer drag verified');
    assert.equal(orderWrites(), writes + 1, 'one save per completed drag');
    assert.deepEqual(tabFlags(), flags, 'dragging cannot toggle visibility');
    assert.equal(await evaluate(island, 'state.tab'), 'prayer', 'reorder preserves the selected view');
    assert.equal(await evaluate(island,
      "window.__testTabs.every(el => document.querySelector(`.tab[data-tab=\"${el.dataset.tab}\"]`) === el)"), true);

    // Moving the last item across rows must insert before its destination.
    drop = await beginDrag('system', 'media');
    await mouse('mouseReleased', drop.x, drop.y);
    const crossRow = ['apps', 'system', 'media', 'shelf', 'prayer', 'timer'];
    await synced(crossRow);
    const handle = '[data-reorder-tab="system"]';
    await key('Home', handle);
    await synced(['system', 'apps', 'media', 'shelf', 'prayer', 'timer']);
    await key('End', handle);
    await synced(['apps', 'media', 'shelf', 'prayer', 'timer', 'system']);
    await key('ArrowUp', handle);
    await synced(['apps', 'media', 'shelf', 'prayer', 'system', 'timer']);
    await key('ArrowRight', handle);
    await synced(appsFirst);
    assert.equal(await evaluate(prefs, 'document.activeElement.dataset.reorderTab'), 'system');
    assert.match(await evaluate(prefs, "document.querySelector('#tab-order-status').textContent"), /System.*6/i);

    // Cancellation must restore the previous order, without saving or closing Settings.
    for (const cancellation of ['Escape', 'pointercancel', 'lostpointercapture']) {
      writes = orderWrites();
      const closes = windowRequests.length;
      drop = await beginDrag('system', 'apps');
      if (cancellation === 'Escape') await key('Escape');
      else if (cancellation === 'pointercancel') {
        await evaluate(prefs, "document.querySelector('[data-reorder-tab=system]').dispatchEvent(new PointerEvent('pointercancel', {bubbles:true, pointerId:window.__testPointerId}))");
      } else {
        await evaluate(prefs, "document.querySelector('#tab-order').releasePointerCapture(window.__testPointerId)");
      }
      await mouse('mouseReleased', drop.x, drop.y);
      await synced(appsFirst);
      assert.equal(orderWrites(), writes, `${cancellation} does not save`);
      assert.equal(windowRequests.length, closes, `${cancellation} does not close Settings`);
    }

    // Hide/show preserves the position. Reset only changes order, not feature flags.
    await click('[data-tab-id="apps"] label');
    await until(() => !features.get().tabApps, 'Apps disabled');
    assert.equal(await evaluate(island, "document.querySelector('.tab[data-tab=apps]').hidden"), true);
    await key('End', '[data-reorder-tab="apps"]');
    await synced(['media', 'shelf', 'prayer', 'timer', 'system', 'apps']);
    const disabledFlags = tabFlags();
    await click('#reset-tab-order');
    await synced(DEFAULT);
    assert.deepEqual(tabFlags(), disabledFlags, 'reset order leaves visibility settings alone');
    await click('[data-tab-id="apps"] label');
    await until(() => features.get().tabApps, 'Apps reenabled');

    // Filtered settings cannot reorder hidden cards or overwrite the complete order.
    writes = orderWrites();
    await evaluate(prefs, "const find = document.querySelector('#find'); find.value='Apps'; find.dispatchEvent(new Event('input', {bubbles:true}))");
    assert.equal(await evaluate(prefs,
      "[...document.querySelectorAll('[data-reorder-tab]')].every(el => el.disabled)"), true);
    await key('End', '[data-reorder-tab="apps"]');
    assert.equal(orderWrites(), writes);
    await evaluate(prefs, "document.querySelector('#find').value=''; document.querySelector('#find').dispatchEvent(new Event('input', {bubbles:true}))");
    await synced(DEFAULT);
    await key('Home', '[data-reorder-tab="apps"]');
    await synced(appsFirst);

    // A new module instance and new window read the actual saved JSON file.
    const disk = JSON.parse(fs.readFileSync(path.join(profile, 'features.json'), 'utf8'));
    assert.deepEqual(disk.tabOrder, appsFirst);
    delete require.cache[require.resolve('../features')];
    features = require('../features');
    subscribe();
    prefs.destroy();
    prefs = await makeWindow('prefs');
    await synced(appsFirst);

    features.set({ tabPrayer: false });
    await until(() => evaluate(island, "state.tab === 'apps'"), 'disabled selection falls back to first configured tab');
    features.set(Object.fromEntries(DEFAULT.map((id) => [`tab${id[0].toUpperCase()}${id.slice(1)}`, id === 'apps'])));
    await click('[data-tab-id="apps"] label');
    assert.equal(features.get().tabApps, true, 'the final visible tab cannot be turned off');
    assert.equal(await evaluate(prefs, "document.querySelector('#tabs-warn').hidden"), false);
    features.set(Object.fromEntries(DEFAULT.map((id) => [`tab${id[0].toUpperCase()}${id.slice(1)}`, true])));
    await synced(appsFirst);

    // Both contextual tabs keep their activity/plugin rules and their anchors.
    await evaluate(island, 'state.radioTab=true; state.dl.tab=true; refreshTabs()');
    const all = await evaluate(island, "[...document.querySelectorAll('.tab')].map(el => el.dataset.tab)");
    assert.equal(all.indexOf('radio'), all.indexOf('media') + 1);
    assert.equal(all.indexOf('downloads'), all.indexOf('shelf') + 1);
    assert.equal(await evaluate(island,
      "!document.querySelector('.tab[data-tab=radio]').hidden && !document.querySelector('.tab[data-tab=downloads]').hidden"), true);
    await evaluate(island, 'state.radioTab=false; state.dl.tab=false; refreshTabs(); selectTab("apps"); placeSegThumb()');
    assert.equal(await evaluate(island,
      "document.querySelector('.tab[data-tab=radio]').hidden && document.querySelector('.tab[data-tab=downloads]').hidden"), true);
    assert.equal(await evaluate(island,
      "document.querySelector('.seg-thumb').style.transform === `translateX(${document.querySelector('.tab.active').offsetLeft}px)`"), true);

    // Exercise the normal animated path as well as the no-animation checks above.
    features.set({ noAnimations: false });
    await until(() => evaluate(prefs, 'features.noAnimations === false'), 'animations enabled');
    drop = await beginDrag('system', 'apps');
    await mouse('mouseReleased', drop.x, drop.y);
    const systemFirst = ['system', 'apps', 'media', 'shelf', 'prayer', 'timer'];
    await synced(systemFirst);
    writes = orderWrites();
    drop = await beginDrag('timer', 'system');
    await key('Escape');
    await mouse('mouseReleased', drop.x, drop.y);
    await synced(systemFirst);
    assert.equal(orderWrites(), writes, 'animated cancellation does not save');
    await until(() => evaluate(prefs, "!document.querySelector('#tab-order').classList.contains('reordering')"), 'cancel animation settled');
    await key('End', '[data-reorder-tab="system"]');
    await synced(appsFirst);
    await prefs.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    assert.equal(await evaluate(prefs, 'canAnimate()'), false, 'system reduced motion is respected');

    await until(() => evaluate(prefs, "document.querySelector('#tabs-warn').hidden"), 'minimum-tab warning dismissed');

    const evidence = path.join(ROOT, '.unlazy/tab-order/evidence');
    fs.mkdirSync(evidence, { recursive: true });
    for (const [width, height] of [[760, 560], [640, 480]]) {
      prefs.setContentSize(width, height);
      await until(() => evaluate(prefs, `window.innerWidth === ${width}`), 'settings window resized');
      const overflow = await evaluate(prefs, `(() => {
        const grid = document.querySelector('#tab-order');
        return [...grid.querySelectorAll('.chip')].filter(el => {
          const r = el.getBoundingClientRect(), g = grid.getBoundingClientRect();
          return r.left < g.left - 1 || r.right > g.right + 1 || el.scrollWidth > el.clientWidth + 1;
        }).map(el => ({ id:el.dataset.tabId, width:el.clientWidth, scroll:el.scrollWidth, x:el.getBoundingClientRect().x,
          gridWidth:grid.clientWidth, columns:getComputedStyle(grid).gridTemplateColumns }));
      })()`);
      fs.writeFileSync(path.join(evidence, `settings-${width}.png`), (await prefs.webContents.capturePage()).toPNG());
      assert.deepEqual(overflow, [], `tab controls fit at ${width}px: ${JSON.stringify(overflow)}`);
    }
    assert.deepEqual(errors, [], 'both pages run without renderer/preload exceptions');
    console.log('Tab order integration verified');
  } finally {
    for (const win of windows) win.destroy();
  }
  app.exit(0);
}
