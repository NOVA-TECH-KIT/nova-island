const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const api = window.prefs;

let features = {};

// ---- saved hint ----
let savedTimer = null;
function saved(text = 'Saved') {
  $('#saved').textContent = text;
  $('#saved').classList.add('on');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $('#saved').classList.remove('on'), 1300);
}

function nope(el) {
  el.classList.remove('nope');
  void el.offsetWidth;
  el.classList.add('nope');
}

// ---- themes: a gallery of live previews (colors from ../themes.css) ----
const THEMES = [
  ['original', 'Original Nova', 'Liquid glass'],
  ['bakka', 'Bakka', 'Deep green and gold'],
  ['outline', 'Outline', 'Glass with a clean line'],
  ['midnight', 'Midnight', 'Pure black'],
  ['forest', 'Forest', 'Pine green'],
  ['snow', 'Snow', 'Winter glass'],
  ['cat', 'Cat', 'Little ears, paws for eyes'],
  ['galaxy', 'Galaxy', 'Violet sky and stars'],
  ['aurora', 'Aurora', 'Northern lights'],
  ['ocean', 'Ocean', 'Deep blue waves'],
  ['nody', 'Nody', 'Sakura pink, flowers for eyes'],
  ['lava', 'Lava', 'Glowing embers'],
  ['retro', 'Retro', 'Pixel green'],
];
const GLASS_THEMES = ['original', 'outline', 'snow'];
$('#themes').innerHTML = THEMES.map(([id, name, desc]) => `
  <button class="th-card" role="radio" data-theme="${id}" aria-checked="false">
    <span class="th-stage">
      <span class="th-pill"><i class="th-ear l"></i><i class="th-ear r"></i><b>9:41</b><span>☀ 24°</span></span>
      <span class="th-pill wide"><i class="th-ear l"></i><i class="th-ear r"></i><i class="th-art"></i><span class="th-song">Golden Hour</span><i class="th-eq"><i></i><i></i><i></i><i></i></i></span>
      <i class="th-check" aria-hidden="true"></i>
    </span>
    <span class="th-meta"><b>${name}</b><small>${desc}</small>${GLASS_THEMES.includes(id) ? '' : '<em>Lighter</em>'}</span>
  </button>`).join('');
$('#themes').addEventListener('click', async (e) => {
  const ed = e.target.closest('.th-edit'); // the pencil on a saved square opens its editor
  if (ed) {
    openPopout(customList.find((t) => t.id === ed.dataset.edit) || null);
    return;
  }
  const del = e.target.closest('.th-del'); // delete icon next to edit
  if (del) {
    const id = del.dataset.del;
    await api.deleteCustom(id);
    saved('Deleted');
    if (features.customTheme === id) features.customTheme = '';
    // refresh list
    const list = await api.custom();
    customList = list || [];
    renderCustomSquares();
    return;
  }
  const card = e.target.closest('.th-card');
  if (!card || card.getAttribute('aria-checked') === 'true') return;
  $$('.th-card').forEach((c) => c.setAttribute('aria-checked', String(c === card)));
  if (card.dataset.ct) { // a saved custom theme's square: apply it by id
    api.setFeatures({ theme: 'custom', customTheme: card.dataset.ct });
    saved(`${card.querySelector('.th-meta b').textContent} applied`);
    return;
  }
  api.setFeatures({ theme: card.dataset.theme });
  saved(`${card.querySelector('b').textContent} theme`);
});

// ---- custom themes: squares in the gallery, an editor popout creates and edits them ----
const CUSTOM_DEFAULTS = { glass: false, bg: '#191921', text: '#ffffff', accent: '#8cc8ff', line: '#585e6c', radius: 14 };
const CUSTOM_STEPS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
let customList = [];
let draft = { ...CUSTOM_DEFAULTS };
let editingId = null;

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
// a theme's look as CSS vars, for its gallery square and the popout's live stage
function paletteVars(t) {
  const rn = Number(t.radius) || 14;
  return {
    '--th-prev': t.bg,
    '--th-bg': t.glass ? hexA(t.bg, .55) : t.bg,
    '--th-text': t.text,
    '--th-soft': hexA(t.text, .7),
    '--th-hi': t.accent,
    '--th-line': hexA(t.line, .45),
    '--th-line-w': '1px',
    '--th-rn': rn,
    '--th-radius': `${Math.round(23 * Math.min(1.5, rn / 14))}px`,
  };
}

// one gallery square per saved theme, painted with its own colors
function renderCustomSquares() {
  $$('#themes .th-card[data-ct]').forEach((el) => el.remove());
  const grid = $('#themes');
  if (!grid) return;
  for (const t of (customList || [])) {
    const b = document.createElement('button');
    b.className = 'th-card';
    b.dataset.ct = t.id;
    b.dataset.theme = 'custom';
    b.setAttribute('role', 'radio');
    b.innerHTML = `
      <span class="th-stage">
        <span class="th-pill"><b>9:41</b><span>☀ 24°</span></span>
        <span class="th-pill wide"><i class="th-art"></i><span class="th-song"></span><i class="th-eq"><i></i><i></i><i></i><i></i></i></span>
        <i class="th-check" aria-hidden="true"></i>
        <i class="th-edit" data-edit="${t.id}" role="button" title="Edit this theme">&#9998;</i>
        <i class="th-del" data-del="${t.id}" role="button" title="Delete this theme"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events:none;"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg></i>
      </span>
      <span class="th-meta"><b></b><small>Custom theme${t.glass ? '' : ' · solid'}</small></span>`;
    b.querySelector('.th-pill .th-song').textContent = 'Golden Hour';
    b.querySelector('.th-meta b').textContent = t.name;
    for (const [k, v] of Object.entries(paletteVars(t))) b.style.setProperty(k, v);
    grid.appendChild(b);
  }
  showCustomState();
}

// which theme is applied: squares highlight
function showCustomState() {
  const applied = (features.theme || 'original') === 'custom' && (features.customTheme || '');
  $$('#themes .th-card').forEach((c) => {
    if (c.dataset.ct) c.setAttribute('aria-checked', String(c.dataset.ct === applied));
  });
}

if (api?.custom) {
  api.custom().then((list) => { customList = list || []; renderCustomSquares(); }).catch(console.error);
  api.onCustom?.((list) => { customList = list || []; renderCustomSquares(); });
}

// ---- the popout: edit the draft with a live showcase of the pill ----
function paintDraft() {
  const stage = document.querySelector('.ovl-stage');
  for (const [k, v] of Object.entries(paletteVars(draft))) stage.style.setProperty(k, v);
  $('#ct-corner output').textContent = `${draft.radius} px`;
  $('#ct-corner [data-dir="-1"]').disabled = draft.radius <= CUSTOM_STEPS[0];
  $('#ct-corner [data-dir="1"]').disabled = draft.radius >= CUSTOM_STEPS[CUSTOM_STEPS.length - 1];
}
function openPopout(t = null) {
  editingId = t ? t.id : null;
  draft = t
    ? { glass: t.glass, bg: t.bg, text: t.text, accent: t.accent, line: t.line, radius: t.radius }
    : { ...CUSTOM_DEFAULTS };
  $('#ct-title').textContent = t ? `Edit “${t.name}”` : 'New custom theme';
  $('#ct-name').value = t ? t.name : '';
  $('#ct-name').placeholder = t ? 'Rename it — a new name saves a copy' : 'Name it — an existing name saves over it';
  $('#ct-glass').checked = draft.glass;
  $$('#ct-ovl [data-ct-c]').forEach((el) => { el.value = draft[el.dataset.ctC]; });
  paintDraft();
  $('#ct-ovl').classList.remove('off');
}
function closePopout() { $('#ct-ovl').classList.add('off'); }
$$('#ct-ovl [data-ct-c]').forEach((el) => el.addEventListener('input', () => {
  draft[el.dataset.ctC] = el.value;
  paintDraft();
}));
$('#ct-glass').addEventListener('change', () => {
  draft.glass = $('#ct-glass').checked;
  paintDraft();
});
$('#ct-corner').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const i = CUSTOM_STEPS.indexOf(draft.radius);
  const next = b.dataset.dir === '1' ? CUSTOM_STEPS[Math.min(CUSTOM_STEPS.length - 1, i + 1)] : CUSTOM_STEPS[Math.max(0, i - 1)];
  if (next === draft.radius) return;
  draft.radius = next;
  paintDraft();
});
$('#ct-apply').addEventListener('click', async () => {
  const t = await api.saveCustom($('#ct-name').value, editingId || '', draft); // the draft, not the island's current look
  api.setFeatures({ theme: 'custom', customTheme: t.id }); // main loads the look onto the island
  saved(`Saved ${t.name}`);
  closePopout();
});
$('#ct-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ct-apply').click(); });
$('#ct-close').addEventListener('click', closePopout);
$('#ct-ovl').addEventListener('click', (e) => { if (e.target === $('#ct-ovl')) closePopout(); });
$('#ct-new').addEventListener('click', () => openPopout());

// ---- feature switches ----
function showFeatures(f) {
  features = f;
  $$('.th-card').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.theme === (f.theme || 'original'))));
  showCustomState(); // squares highlight the applied one; 'Edit theme' shows for a saved pick
  $$('[data-feature]').forEach((el) => { el.checked = !!f[el.dataset.feature]; });
  // child settings show only while every switch they depend on is on ("!key": while it is off)
  $$('[data-needs]').forEach((el) => el.classList.toggle('off', !el.dataset.needs.split(' ').every((k) => (k[0] === '!' ? !f[k.slice(1)] : f[k]))));
  // in the browser: the address bar, or stay in place with clicks passing through
  $$('[data-browser]').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.browser === 'addr') === !!f.addrIsland)));
  $('#browser-hint').textContent = f.addrIsland
    ? 'Moves into the address bar, from its default place at the top'
    : 'Stays where it is; clicks go to the tabs below';
  showSteppers();
}
$$('[data-browser]').forEach((b) => b.addEventListener('click', () => {
  api.setFeatures({ addrIsland: b.dataset.browser === 'addr' });
  saved();
}));

$$('[data-feature]').forEach((el) => el.addEventListener('change', () => {
  const key = el.dataset.feature;
  // at least one reminder kind stays on
  if (el.hasAttribute('data-kind') && !el.checked && ![...$$('[data-kind]')].some((k) => k.checked)) {
    el.checked = true;
    nope(el);
    return;
  }
  if (el.hasAttribute('data-tab') && !el.checked && ![...$$('[data-tab]')].some((t) => t.checked)) {
    el.checked = true;
    nope(el.closest('.chip'));
    $('#tabs-warn').hidden = false;
    setTimeout(() => { $('#tabs-warn').hidden = true; }, 2600);
    return;
  }
  api.setFeatures({ [key]: el.checked });
  saved();
}));

// ---- number steppers (fixed list of sensible values) ----
const TIME_STEPS = Array.from({ length: 48 }, (_, i) => i * 30);
const stepsOf = (st) => (st.dataset.steps === 'time' ? TIME_STEPS : st.dataset.steps.split(',').map(Number));
function unitText(n, unit) {
  if (unit === 'glass') return `${n} glasses`;
  if (unit === 'day') return n === 0 ? 'None' : `${n > 0 ? '+' : '−'}${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'}`;
  if (unit === 'time') {
    const d = new Date(2000, 0, 1, Math.floor(n / 60), n % 60);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (unit === 'min') return n >= 60 && n % 60 === 0 ? `${n / 60} h` : `${n} min`;
  if (unit === '%') return `${n}%`;
  if (unit === 'px') return `${n} px`;
  return `${n} s`;
}
function showSteppers() {
  $$('.stepper[data-num]').forEach((st) => {
    const v = features[st.dataset.num];
    st.querySelector('output').textContent = unitText(v, st.dataset.unit);
    const steps = stepsOf(st);
    const wraps = st.dataset.steps === 'time';
    st.querySelector('[data-dir="-1"]').disabled = !wraps && v <= steps[0];
    st.querySelector('[data-dir="1"]').disabled = !wraps && v >= steps[steps.length - 1];
  });
}
$$('.stepper[data-num]').forEach((st) => st.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const steps = stepsOf(st);
  const v = features[st.dataset.num];
  let next = b.dataset.dir === '1' ? steps.find((s) => s > v) : [...steps].reverse().find((s) => s < v);
  // clock times go round the day
  if (next == null && st.dataset.steps === 'time') next = b.dataset.dir === '1' ? steps[0] : steps[steps.length - 1];
  if (next == null) return;
  features[st.dataset.num] = next;
  showSteppers();
  api.setFeatures({ [st.dataset.num]: next });
  saved();
}));
$('#rm-preview').addEventListener('click', () => api.previewReminder());

// ---- general (lives in the main process) ----
function showGeneral(g) {
  $$('[data-general]').forEach((el) => { el.checked = !!g[el.dataset.general]; });
  $$('[data-orient]').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.orient === 'v') === !!g.vertical)));
  if (g.version) $('#version').textContent = `Version ${g.version}`;
  // the Store version: Windows runs the startup entry and the Store installs updates
  $('#startup-row').hidden = $('#update-row').hidden = !!g.store;
  $('#startup-store-row').hidden = !g.store;
  // battery saver: off on a PC without a battery; says when it is on right now
  const noBattery = g.battery < 0;
  $('#saver-row input').disabled = noBattery;
  $('#saver-row').classList.toggle('disabled', noBattery);
  $('#saver-note').textContent = noBattery ? 'No battery'
    : g.saver ? `On now · battery ${g.battery}%` : 'Turns all three on when the battery runs low';
}
$$('[data-support]').forEach((b) => b.addEventListener('click', () => api.openSupport(b.dataset.support)));
$$('[data-general]').forEach((el) => el.addEventListener('change', () => {
  api.setGeneral(el.dataset.general, el.checked);
  saved();
}));
$$('[data-orient]').forEach((b) => b.addEventListener('click', () => {
  api.setGeneral('vertical', b.dataset.orient === 'v');
  saved();
}));
$$('[data-general-action]').forEach((b) => b.addEventListener('click', () => {
  api.setGeneral(b.dataset.generalAction, true);
  saved('Done');
}));

// ---- location ----
function showLocation(info) {
  const manual = info?.mode === 'manual';
  $('#loc-now').textContent = manual
    ? `${info.name}${info.country ? `, ${info.country}` : ''}`
    : `Auto${info?.name ? ` · ${info.name}` : ''}`;
  $('#loc-auto').hidden = !manual;
}
async function searchCity() {
  const q = $('#loc-q').value.trim();
  const box = $('#loc-results');
  if (q.length < 2) return;
  box.hidden = false;
  box.innerHTML = '<div class="none">Searching…</div>';
  const res = await api.searchCity(q);
  if (!res) {
    box.innerHTML = '<div class="none">Search failed. Check your connection.</div>';
    return;
  }
  if (!res.length) {
    box.innerHTML = '<div class="none">No results</div>';
    return;
  }
  box.innerHTML = '';
  res.forEach((r) => {
    const b = document.createElement('button');
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = r.name;
    b.querySelector('span').textContent = [r.admin, r.country].filter(Boolean).join(', ');
    b.addEventListener('click', () => {
      api.setLocation(r);
      box.hidden = true;
      $('#loc-q').value = '';
      saved();
    });
    box.append(b);
  });
}
$('#loc-go').addEventListener('click', searchCity);
$('#loc-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchCity(); });
$('#loc-auto').addEventListener('click', () => {
  api.setLocation(null);
  saved();
});
api.onLocation(showLocation);
api.location().then(showLocation);

// ---- calendar ----
function showCalendar(c) {
  const el = $('#cal-status');
  if (!c?.hasUrl && !c?.updated && !c?.error) {
    el.textContent = 'Not linked';
    return;
  }
  if (c.error) {
    el.textContent = `Can't read it (${c.error})`;
    return;
  }
  const next = c.events?.find((e) => e.end > Date.now());
  el.textContent = next
    ? `Linked · next: ${next.title} ${new Date(next.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : 'Linked · nothing in the next 24 h';
}
$('#cal-save').addEventListener('click', async () => {
  const res = await api.setCalendar($('#cal-url').value);
  if (!res?.ok) {
    $('#cal-status').textContent = 'Use an https:// or webcal:// link';
    return;
  }
  $('#cal-url').value = '';
  $('#cal-status').textContent = 'Connecting…';
  saved();
});
api.onCalendar((c) => showCalendar({ ...c, hasUrl: true }));
api.calendar().then(showCalendar);

// ---- download folders (browser downloads) ----
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function showFolders(list) {
  $('#dl-folders').innerHTML = (list || []).map((f) => `<div class="row folder"><small class="path" title="${esc(f.path)}">${esc(f.path)}</small>${f.fixed
    ? '<small class="val">Windows Downloads</small>'
    : `<button class="btn" data-folder="${esc(f.path)}" aria-label="Remove folder">✕</button>`}</div>`).join('');
}
$('#dl-folders').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-folder]');
  if (!b) return;
  showFolders(await api.removeDownloadFolder(b.dataset.folder));
  saved();
});
$('#dl-folder-add').addEventListener('click', async () => {
  showFolders(await api.addDownloadFolder());
});
api.downloadFolders().then(showFolders);

// ---- media bridge health ----
async function showBridge() {
  const s = await api.bridgeStatus();
  const el = $('#bridge-state');
  el.className = `status ${s.state}`;
  el.textContent = s.state === 'ok' ? 'Running' : s.state === 'starting' ? 'Starting…' : 'Stopped';
  const detail = $('#bridge-detail');
  detail.hidden = s.state !== 'failed';
  detail.textContent = 'Allow Nova Island in your antivirus, then restart it';
}
showBridge();
setInterval(showBridge, 4000);

$('#open-log').addEventListener('click', () => api.openLog());
$('#copy-report').addEventListener('click', async () => {
  await api.copyReport();
  saved('Report copied');
});

$('#reset-all').addEventListener('click', () => {
  api.resetFeatures();
  saved('Reset to defaults');
});

// ---- window buttons ----
$$('[data-win]').forEach((b) => b.addEventListener('click', () => api.window(b.dataset.win)));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#ct-ovl').classList.contains('off')) { closePopout(); return; } // the popout comes first
  if ($('#find').value) clearSearch();
  else api.window('close');
});

// ---- pages: one at a time, the last one opened is remembered ----
const PAGE_KEY = 'prefs-page';
function remembered() {
  try { return localStorage.getItem(PAGE_KEY) || 'general'; } catch { return 'general'; }
}
const links = [...$$('.side a')];
function showPage(id) {
  if (!document.getElementById(id)) id = 'general';
  $$('.page').forEach((p) => p.classList.toggle('on', p.id === id));
  links.forEach((a) => a.classList.toggle('on', a.dataset.page === id));
  $('#content').scrollTop = 0;
  try { localStorage.setItem(PAGE_KEY, id); } catch {}
}
links.forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  clearSearch();
  showPage(a.dataset.page);
}));
showPage(remembered());

// ---- search: rows from every page whose title matches ----
// rows without a title (the city and calendar link fields) stay on their own page
const items = [...$$('.row, .chip, .th-card')];
const title = (el) => el.querySelector('b')?.textContent.toLowerCase() || '';
function search(q) {
  q = q.trim().toLowerCase();
  document.body.classList.toggle('searching', !!q);
  links.forEach((a) => a.classList.toggle('on', !q && a.dataset.page === remembered()));
  if (!q) {
    $$('.miss, .empty').forEach((el) => el.classList.remove('miss', 'empty'));
    $('#no-results').hidden = true;
    showPage(remembered());
    return;
  }
  for (const el of items) el.classList.toggle('miss', !title(el).includes(q));
  // a group's own heading matches too
  $$('.group').forEach((g) => {
    const head = g.querySelector('h2')?.textContent.toLowerCase().includes(q);
    if (head) g.querySelectorAll('.miss').forEach((el) => { if (title(el)) el.classList.remove('miss'); });
    g.classList.toggle('empty', !g.querySelector('.row:not(.miss):not(.off), .chip:not(.miss), .th-card:not(.miss)'));
  });
  let any = false;
  $$('.page').forEach((p) => {
    const empty = !p.querySelector('.group:not(.empty)');
    p.classList.toggle('empty', empty);
    any ||= !empty;
  });
  $('#no-results').hidden = any;
}
function clearSearch() {
  if (!$('#find').value) return;
  $('#find').value = '';
  search('');
}
$('#find').addEventListener('input', (e) => search(e.target.value));

// ---- plugins ----
let plugFilter = 'all';
let plugData = { plugins: [], error: '' };
const plugProgress = {}; // id -> 0..1 while installing
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const PLUG_ICON = '<svg viewBox="0 0 24 24"><path d="M4 9.5 18 4M3 9h18v11H3z"/><circle cx="8" cy="14.5" r="2.5"/><path d="M14 13h4M14 16h4"/></svg>';

function plugSettings(p) {
  return (p.settings || []).map((s) => {
    const v = p.values?.[s.key];
    if (s.type === 'bool') {
      return `<label class="row sub"><div class="txt"><b>${esc(s.label)}</b>${s.hint ? `<small>${esc(s.hint)}</small>` : ''}</div><input type="checkbox" class="sw" data-pset="${esc(s.key)}" ${v ? 'checked' : ''}></label>`;
    }
    if (s.type === 'station') {
      const opts = (p.stations || []).map((st) => `<option value="${esc(st.id)}" ${st.id === v ? 'selected' : ''}>${esc(st.name)}</option>`).join('');
      return `<div class="row sub"><b>${esc(s.label)}</b><select class="select" dir="auto" data-pset="${esc(s.key)}">${opts}</select></div>`;
    }
    return `<div class="row sub"><b>${esc(s.label)}</b><div class="stepper" data-prange="${esc(s.key)}" data-min="${s.min}" data-max="${s.max}" data-step="${s.step}"><button data-dir="-1" aria-label="Less">−</button><output>${v}%</output><button data-dir="1" aria-label="More">+</button></div></div>`;
  }).join('');
}

function showPlugins(data = plugData) {
  plugData = data;
  const rows = data.plugins.filter((p) => plugFilter === 'all' || p.installed);
  const box = $('#plug-list');
  if (!rows.length) {
    const why = plugFilter === 'installed' ? 'No plugins installed yet'
      : data.error === 'offline' ? "Can't reach the plugin list. Check your connection." : data.error ? "Can't read the plugin list right now" : 'Loading…';
    box.innerHTML = `<div class="row"><small class="val">${why}</small></div>`;
    return;
  }
  box.innerHTML = rows.map((p) => {
    const pct = plugProgress[p.id];
    const meta = [p.installs != null ? `⬇ ${p.installs.toLocaleString('en-US')} installs` : '', `v${p.installed || p.version}`, p.size ? fmtSize(p.size) : ''].filter(Boolean).join(' · ');
    const action = pct != null || p.busy ? '<button class="btn" disabled>Installing…</button>'
      : !p.installed ? `<button class="btn accent" data-plug-install="${esc(p.id)}">Install</button>`
      : `${p.update ? `<button class="btn accent" data-plug-install="${esc(p.id)}">Update</button>` : ''}<input type="checkbox" class="sw" data-plug-enable="${esc(p.id)}" ${p.enabled ? 'checked' : ''} aria-label="On"><button class="btn danger" data-plug-remove="${esc(p.id)}">Remove</button>`;
    return `<div class="plug" data-plug="${esc(p.id)}">
      <div class="row"><span class="plug-ico">${PLUG_ICON}</span><div class="txt"><b>${esc(p.name)} <i class="badge free">Free</i></b><small>${esc(p.description)}</small><small class="meta">${esc(meta)}</small></div><div class="btns">${action}</div></div>
      ${pct != null ? `<div class="plug-bar-line"><b data-pct="${Math.round(pct * 100)}"></b></div>` : ''}
      ${p.installed && p.enabled ? plugSettings(p) : ''}
    </div>`;
  }).join('');
  // widths from script: the page's security policy blocks style="" in markup
  box.querySelectorAll('[data-pct]').forEach((b) => { b.style.width = `${b.dataset.pct}%`; });
}

$('#plug-list').addEventListener('click', async (e) => {
  const ins = e.target.closest('[data-plug-install]');
  const rem = e.target.closest('[data-plug-remove]');
  const step = e.target.closest('[data-prange] button');
  if (ins) {
    const id = ins.dataset.plugInstall;
    plugProgress[id] = 0;
    showPlugins();
    const ok = await api.installPlugin(id);
    if (!ok) {
      delete plugProgress[id];
      showPlugins();
      saved('Install failed');
    }
  } else if (rem) {
    api.removePlugin(rem.dataset.plugRemove);
    saved('Removed');
  } else if (step) {
    const st = step.closest('[data-prange]');
    const id = st.closest('[data-plug]').dataset.plug;
    const p = plugData.plugins.find((x) => x.id === id);
    const key = st.dataset.prange;
    const v = Math.min(Number(st.dataset.max), Math.max(Number(st.dataset.min), (p.values[key] ?? 0) + Number(step.dataset.dir) * Number(st.dataset.step)));
    p.values[key] = v;
    st.querySelector('output').textContent = `${v}%`;
    api.pluginSet(id, key, v);
    saved();
  }
});
$('#plug-list').addEventListener('change', (e) => {
  const id = e.target.closest('[data-plug]')?.dataset.plug;
  if (!id) return;
  if (e.target.dataset.plugEnable) api.enablePlugin(id, e.target.checked);
  else if (e.target.dataset.pset) api.pluginSet(id, e.target.dataset.pset, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  saved();
});
$$('[data-plug-filter]').forEach((b) => b.addEventListener('click', () => {
  plugFilter = b.dataset.plugFilter;
  $$('[data-plug-filter]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  showPlugins();
}));
$('#plug-file').addEventListener('click', async () => {
  const r = await api.installPluginFile();
  if (!r) return;
  const note = $('#plug-note');
  note.hidden = r.ok;
  note.textContent = r.error || '';
  note.classList.toggle('warn', !r.ok);
  if (r.ok) saved('Installed');
});
api.onPluginProgress((p) => {
  if (p.done || p.error) delete plugProgress[p.id];
  else plugProgress[p.id] = p.pct;
  if (p.done) saved(`${p.name} installed`);
  showPlugins();
});
api.onPlugins(showPlugins);
api.plugins().then(showPlugins);

// a news link or the island opens a page (plugins:<id> also points at that plugin)
api.onShowPage((page) => {
  const [id, plug] = String(page).split(':');
  clearSearch();
  showPage(id);
  if (plug) setTimeout(() => document.querySelector(`[data-plug="${CSS.escape(plug)}"]`)?.scrollIntoView({ block: 'center' }), 300);
});

api.onFeatures(showFeatures);
api.onGeneral(showGeneral);
api.features().then(showFeatures);
api.general().then(showGeneral);
