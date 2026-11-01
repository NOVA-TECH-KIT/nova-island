// App launcher: Start menu catalog (via `nova-helper apps`), pinned apps, icons, launching.
const path = require('path');
const { spawn } = require('child_process');
const { app, nativeImage } = require('electron');
const settings = require('./settings');

const DEFAULTS = [
  'WhatsApp', 'Telegram', 'Spotify', 'Google Chrome', 'Visual Studio Code', 'Discord',
  'Microsoft Edge', 'File Explorer', 'Calculator', 'Notepad', 'Photos', 'Settings',
];
const MAX_PINNED = 12; // 6 x 2 grid

let catalog = settings.load('apps-cache.json', []);
let pinned = settings.load('apps.json', null);
const iconCache = new Map();
let onChange = () => {};

function scriptPath(name) {
  return path.join(__dirname, name).replace('app.asar', 'app.asar.unpacked');
}

function scanOnce() {
  return new Promise((resolve) => {
    const ps = spawn(scriptPath(path.join('helper', 'nova-helper.exe')), ['apps'], { windowsHide: true });
    let out = '';
    let errOut = '';
    ps.on('error', (err) => {
      console.error(`[apps] spawn failed: ${err.message}`);
      resolve(false);
    });
    ps.stdout.setEncoding('utf8');
    ps.stderr.setEncoding('utf8');
    ps.stdout.on('data', (d) => (out += d));
    ps.stderr.on('data', (d) => (errOut += d));
    ps.on('close', (code) => {
      try {
        const clean = out.replace(/^\uFEFF/, '').trim();
        if (!clean) throw new Error(code === 0 ? 'empty output' : `process exited with code ${code}`);
        const list = JSON.parse(clean);
        const items = (Array.isArray(list) ? list : [list]).filter((a) => a && a.name && a.id);
        if (!items.length) throw new Error('empty list');
        catalog = items.sort((a, b) => a.name.localeCompare(b.name));
        settings.save('apps-cache.json', catalog);
        resolve(true);
      } catch (err) {
        console.error(`[apps] scan failed (exit ${code}): ${err.message}`, errOut.trim().slice(0, 300));
        resolve(false);
      }
    });
  });
}

async function scan() {
  for (let i = 0; i < 3; i++) {
    if (await scanOnce()) return;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

function pickDefaults() {
  const out = [];
  for (const want of DEFAULTS) {
    const hit = catalog.find((a) => a.name.toLowerCase() === want.toLowerCase())
      || catalog.find((a) => a.name.toLowerCase().startsWith(want.toLowerCase()));
    if (hit && !out.includes(hit.id)) out.push(hit.id);
    if (out.length >= MAX_PINNED) break;
  }
  return out;
}

async function iconFor(entry) {
  if (!entry || !entry.icon) return '';
  if (iconCache.has(entry.id)) return iconCache.get(entry.id);
  let url = '';
  try {
    if (entry.kind === 'png') {
      const img = nativeImage.createFromPath(entry.icon);
      if (!img.isEmpty()) url = img.resize({ width: 64, height: 64, quality: 'best' }).toDataURL();
    } else {
      const img = await app.getFileIcon(entry.icon, { size: 'large' });
      if (!img.isEmpty()) url = img.toDataURL();
    }
  } catch {}
  iconCache.set(entry.id, url);
  return url;
}

async function describe(id) {
  const entry = catalog.find((a) => a.id === id);
  if (!entry) return null;
  return { id, name: entry.name, icon: await iconFor(entry) };
}

async function list() {
  const items = await Promise.all((pinned || []).map(describe));
  return items.filter(Boolean);
}

async function all() {
  return Promise.all(catalog.map(async (a) => ({ id: a.id, name: a.name, icon: await iconFor(a) })));
}

function persist() {
  settings.save('apps.json', pinned);
  onChange();
}

function add(id) {
  if (!pinned) pinned = [];
  if (!catalog.some((a) => a.id === id) || pinned.includes(id) || pinned.length >= MAX_PINNED) return;
  pinned.push(id);
  persist();
}

function remove(id) {
  pinned = (pinned || []).filter((p) => p !== id);
  persist();
}

// New order from the renderer; must be the same set of ids.
function reorder(ids) {
  if (!Array.isArray(ids) || !pinned) return;
  const same = ids.length === pinned.length && ids.every((id) => pinned.includes(id));
  if (!same) return;
  pinned = [...ids];
  persist();
}

function launch(id) {
  if (!catalog.some((a) => a.id === id)) return;
  spawn('explorer.exe', [`shell:AppsFolder\\${id}`], { detached: true, stdio: 'ignore' }).unref();
}

async function init(changed) {
  onChange = changed;
  if (catalog.length && pinned) onChange();
  await scan();
  if (!pinned) pinned = pickDefaults();
  pinned = pinned.filter((id) => catalog.some((a) => a.id === id));
  persist();
}

module.exports = { init, list, all, add, remove, reorder, launch, MAX_PINNED };
