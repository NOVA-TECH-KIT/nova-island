// Saved custom themes: named copies of the Themes editor's look, kept in custom-themes.json.
// The user's current live colors stay in features (customBg & co) so the island paints exactly
// as before; a named entry is a snapshot someone can come back to by name.
const settings = require('./settings');

const hex = (c, fb) => {
  const s = typeof c === 'string' ? c.trim().toLowerCase() : '';
  return /^#[0-9a-f]{6}$/.test(s) ? s : fb;
};
const clamped = (n, fb) => {
  n = Math.round(Number(n));
  return Number.isFinite(n) ? Math.min(28, Math.max(4, n)) : fb;
};

// shape a stored/live entry the same way whatever it came from (a file, a save, an edit)
function clean(t) {
  return {
    id: /^[a-z0-9]{4,24}$/.test(t.id || '') ? t.id : '',
    name: String(t.name || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    glass: !!t.glass,
    bg: hex(t.bg, '#191921'),
    text: hex(t.text, '#ffffff'),
    accent: hex(t.accent, '#8cc8ff'),
    line: hex(t.line, '#585e6c'),
    radius: clamped(t.radius, 14),
  };
}

// one fresh id for a new entry
const freshId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// accept either keys-style input (features: customBg & co) or an editor draft (bg & co)
function toShape(f = {}) {
  const g = (a, b) => (f[a] !== undefined ? f[a] : f[b]);
  return {
    id: freshId(), // fresh entries always get an id
    name: typeof f.name === 'string' ? f.name : '',
    glass: g('glass', 'customGlass'),
    bg: g('bg', 'customBg'),
    text: g('text', 'customText'),
    accent: g('accent', 'customAccent'),
    line: g('line', 'customLine'),
    radius: g('radius', 'customRadius'),
  };
}

// the editor's current look in the shape clean() expects
function fromFeatures(f = {}) {
  return clean(toShape(f));
}

let themes = settings
  .load('custom-themes.json', [])
  .map(clean)
  .map((t) => (t.id ? t : { ...t, id: fromFeatures({}).id }));
const listeners = [];

function save() {
  settings.save('custom-themes.json', themes);
  listeners.forEach((fn) => fn());
}

function list() {
  return themes.map((t) => ({ ...t }));
}

function getOne(id) {
  const t = themes.find((x) => x.id === id);
  return t ? { ...t } : null;
}

// a saved theme as features keys, to load its look when it's picked
function colors(id) {
  const t = themes.find((x) => x.id === id);
  return t
    ? { customGlass: t.glass, customBg: t.bg, customText: t.text, customAccent: t.accent, customLine: t.line, customRadius: t.radius }
    : {};
}

// "My theme", "My theme 2", ...
function nextName() {
  for (let n = 1; ; n++) {
    const name = n === 1 ? 'My theme' : `My theme ${n}`;
    if (!themes.some((t) => t.name === name)) return name;
  }
}

// save the look: with an id, that exact theme is updated (an empty name keeps its own);
// without one, an existing name (any case) saves over that theme, other names create a new one
function saveTheme(name, from, id) {
  const t = typeof id === 'string' && themes.find((x) => x.id === id);
  if (t) {
    const n = fromFeatures({ ...from, name: String(name || '').trim() || t.name });
    n.id = id;
    Object.assign(t, n);
    save();
    return t;
  }
  name = String(name || '').trim();
  const hit = name && themes.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (hit) {
    const n = fromFeatures({ ...from, name: hit.name });
    n.id = hit.id;
    Object.assign(hit, n);
    save();
    return hit;
  }
  const fresh = fromFeatures({ ...from, name: name || nextName() });
  themes.push(fresh);
  save();
  return fresh;
}

function remove(id) {
  const before = themes.length;
  themes = themes.filter((x) => x.id !== id);
  if (themes.length !== before) save();
}

const onChange = (fn) => listeners.push(fn);

module.exports = { list, getOne, colors, saveTheme, remove, onChange };
