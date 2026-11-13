// Which parts of the island are on. Edited in the Settings window, applied live by the island.
const settings = require('./settings');

// the six island tabs, in their default left-to-right order
const TAB_IDS = ['media', 'apps', 'shelf', 'prayer', 'timer', 'system'];

const DEFAULTS = {
  // expanded tabs
  tabMedia: true,
  tabApps: true,
  tabShelf: true,
  tabPrayer: true,
  tabTimer: true,
  tabSystem: true,
  tabOrder: TAB_IDS.slice(),
  // idle pill slides
  slideClock: true,
  slideStats: true,
  slidePrayer: true,
  // live activities
  mediaPill: true,
  mediaTitle: true,
  trackPeek: true,
  // notifications
  kbdToast: true,
  capsToast: true,
  hudVolume: true,
  hudBrightness: true,
  battery: true,
  prayerAlerts: true,
  asrHanafi: false, // Asr by the Hanafi shadow rule
  hijriAdjust: 0, // days added to the Hijri date (local moon sighting)
  // IDM Nova
  downloads: true,
  dlToasts: true,
  folderDownloads: true, // browser downloads, seen in the download folders
  // window
  hideFullscreen: true,
  autoUpdate: true, // download new versions from GitHub and offer a restart on the island
  addrIsland: true, // take the right third of the browser's address bar; off: stay in place, clicks pass through
  // performance (the battery saver turns all three on while the battery is low)
  noBlur: false, // solid island, no screen capture at all
  noAnimations: false,
  glassFreeze: false, // capture the screen only while the island is open
  batterySaver: false,
  batterySaverAt: 20, // percent
  news: true, // plugins, updates and news from the Nova team (news.json on GitHub)
  theme: 'original', // the island's look (themes.css)
  // System tab
  clipboardHistory: true,
  // copied image / screenshot -> toast; on the Shelf by itself for a while, or "Add to Shelf"
  screenshotToast: true,
  shotAutoShelf: true,
  shotShelfMinutes: 20,
  // mic / camera in use
  privacyDots: true,
  // companion
  netToasts: true,
  welcomeBack: true,
  morningBrief: true,
  wellbeing: true,
  smartClipboard: true,
  novaEyes: true,
  novaPrayer: true, // Nova in her prayer cap at the adhan
  novaFocus: true, // Nova with her headband at focus start / end
  water: true, // the Drop reminds you to drink
  waterEvery: 60, // minutes at the computer between glasses
  waterGoal: 8, // glasses a day (~2 L)
  celebrate: true,
  // upcoming meetings (iCal link in calendar.json)
  meetings: true,
  // reminders: dhikr, du'a, Qur'an
  reminders: true,
  remindAyah: true,
  remindDhikr: true,
  remindDua: true,
  remindEvery: 5, // minutes
  remindFor: 30, // seconds on screen
  // quiet hours for reminders (minutes after midnight; may wrap past midnight)
  quietHours: false,
  quietFrom: 23 * 60,
  quietTo: 7 * 60,
  // focus sessions (Pomodoro)
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
};

// number settings and their allowed range
const RANGES = {
  remindEvery: [1, 240], remindFor: [5, 300], quietFrom: [0, 1439], quietTo: [0, 1439],
  focusMin: [5, 120], breakMin: [1, 60], longBreakMin: [5, 60], hijriAdjust: [-2, 2], waterEvery: [15, 240], waterGoal: [4, 16], shotShelfMinutes: [5, 1440],
  batterySaverAt: [10, 100],
};

// settings that are one of a fixed list
const CHOICES = {
  theme: ['original', 'bakka', 'outline', 'midnight', 'forest', 'snow', 'cat', 'galaxy', 'aurora', 'ocean', 'nody', 'lava', 'retro'],
};
// themes without glass: no screen capture behind them
const SOLID_THEMES = ['bakka', 'midnight', 'forest', 'cat', 'galaxy', 'aurora', 'ocean', 'nody', 'lava', 'retro'];

function defaultValues() {
  return { ...DEFAULTS, tabOrder: DEFAULTS.tabOrder.slice() };
}

let values = { ...defaultValues(), ...pick(settings.load('features.json', {})) };
const listeners = [];

// keep the six known tab ids once each, then append missing ids in default order
function normalizeTabOrder(order) {
  const out = [];
  for (const id of order) {
    if (TAB_IDS.includes(id) && !out.includes(id)) out.push(id);
  }
  for (const id of TAB_IDS) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// keep only known keys with values of the right type (numbers clamped to their range)
function pick(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (!(k in DEFAULTS)) continue;
    if (CHOICES[k]) {
      if (CHOICES[k].includes(v)) out[k] = v;
    } else if (RANGES[k]) {
      if (Number.isFinite(v)) out[k] = Math.min(Math.max(Math.round(v), RANGES[k][0]), RANGES[k][1]);
    } else if (k === 'tabOrder') {
      if (Array.isArray(v)) out[k] = normalizeTabOrder(v);
    } else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

function get() {
  return { ...values, tabOrder: values.tabOrder.slice() };
}

function set(patch) {
  const clean = pick(patch);
  if (!Object.keys(clean).length) return get();
  values = { ...values, ...clean };
  settings.save('features.json', values);
  listeners.forEach((fn) => fn(get()));
  return get();
}

function reset() {
  values = defaultValues();
  settings.save('features.json', values);
  listeners.forEach((fn) => fn(get()));
}

const onChange = (fn) => listeners.push(fn);

module.exports = { get, set, reset, onChange, DEFAULTS, SOLID_THEMES };
