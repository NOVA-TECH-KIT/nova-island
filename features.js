// Which parts of the island are on. Edited in the Settings window, applied live by the island.
const settings = require('./settings');

const DEFAULTS = {
  // expanded tabs
  tabMedia: true,
  tabApps: true,
  tabShelf: true,
  tabPrayer: true,
  tabTimer: true,
  tabSystem: true,
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
  batterySaver: false, // force the performance cuts on when the battery runs low
  batterySaverAt: 20, // ...at this percent (10–100)
  prayerAlerts: true,
  asrHanafi: false, // Asr by the Hanafi shadow rule
  hijriAdjust: 0, // days added to the Hijri date (local moon sighting)
  // IDM Nova
  downloads: true,
  dlToasts: true,
  // window
  hideFullscreen: true,
  autoUpdate: true, // download new versions from GitHub and offer a restart on the island
  addrIsland: true, // take the right third of the browser's address bar
  // low-end PCs: the two cuts below; the island's background work slows down while either is on
  noBlur: false, // solid panel instead of the live glass — no screen captures
  noAnimations: false, // no decorative motion
  glassFreeze: false, // the glass only refreshes while the island is open or changing
  // System tab
  clipboardHistory: true,
  // copied image / screenshot -> toast with "Add to Shelf"
  screenshotToast: true,
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
  focusMin: [5, 120], breakMin: [1, 60], longBreakMin: [5, 60], hijriAdjust: [-2, 2], waterEvery: [15, 240], waterGoal: [4, 16],
  batterySaverAt: [10, 100],
};

let values = { ...DEFAULTS, ...pick(settings.load('features.json', {})) };
const listeners = [];

// keep only known keys with values of the right type (numbers clamped to their range)
function pick(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (!(k in DEFAULTS)) continue;
    if (RANGES[k]) {
      if (Number.isFinite(v)) out[k] = Math.min(Math.max(Math.round(v), RANGES[k][0]), RANGES[k][1]);
    } else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

// Battery saver layers the performance cuts on top while the battery runs low; the saved
// switches stay untouched, so they come back by themselves once the battery recovers.
const SAVER_CUTS = { noBlur: true, noAnimations: true, glassFreeze: true };
let saver = false;
function get() {
  return saver ? { ...values, ...SAVER_CUTS } : { ...values };
}

function setSaver(on) {
  on = !!on;
  if (on === saver) return;
  saver = on;
  listeners.forEach((fn) => fn(get()));
}

function set(patch) {
  const clean = pick(patch);
  if (!Object.keys(clean).length) return values;
  values = { ...values, ...clean };
  settings.save('features.json', values);
  listeners.forEach((fn) => fn(get()));
  return get();
}

function reset() {
  values = { ...DEFAULTS };
  settings.save('features.json', values);
  listeners.forEach((fn) => fn(get()));
}

const onChange = (fn) => listeners.push(fn);

module.exports = { get, set, setSaver, reset, onChange, DEFAULTS };
