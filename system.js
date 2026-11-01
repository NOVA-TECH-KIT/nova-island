// System status: CPU / RAM, clipboard history (memory only), weather.
const os = require('os');
const { clipboard } = require('electron');
const features = require('./features');
const settings = require('./settings');
const smartclip = require('./smartclip');

let send = () => {};

// ---- CPU / RAM ----
function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const k of Object.keys(c.times)) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}
let lastCpu = cpuTimes();
function tickStats() {
  const now = cpuTimes();
  const dTotal = now.total - lastCpu.total;
  const cpu = dTotal > 0 ? 1 - (now.idle - lastCpu.idle) / dTotal : 0;
  lastCpu = now;
  const total = os.totalmem();
  const used = total - os.freemem();
  send('stats', { cpu, ram: used / total, ramUsed: used, ramTotal: total });
}

// ---- clipboard (kept in memory only; may contain sensitive text) ----
// Read only when Windows reports a new copy (the helper's clipboard sequence). The helper also
// says whether a password manager marked the copy as private; those are never read.
const MAX_CLIPS = 8;
let clips = [];
let lastClip = '';
clipboard.readText().then((t) => { lastClip = t || ''; }).catch(() => {});
async function clipboardChanged(isPrivate) {
  if (isPrivate) return;
  let text = '';
  try { text = await clipboard.readText(); } catch { return; }
  if (typeof text !== 'string' || !text || text === lastClip) return;
  lastClip = text;
  if (!text.trim()) return;
  if (features.get().smartClipboard) {
    smart = smartclip.classify(text);
    if (smart) send('clip-smart', smart);
  }
  if (!features.get().clipboardHistory) return;
  clips = [text, ...clips.filter((c) => c !== text)].slice(0, MAX_CLIPS);
  send('clipboard', clips.map((c) => c.slice(0, 300)));
}
let smart = null; // what the last copy was recognised as (acted on by nova.js)
const lastSmart = () => smart;
// writing to the clipboard ourselves must not be announced again
function writeQuiet(text) {
  lastClip = text;
  clipboard.writeText(text).catch(() => {});
}

function copyClip(i) {
  const text = clips[i];
  if (typeof text !== 'string') return;
  lastClip = text;
  clipboard.writeText(text).catch(() => {});
  clips = [text, ...clips.filter((c) => c !== text)];
  send('clipboard', clips.map((c) => c.slice(0, 300)));
}
function clearClips() {
  clips = [];
  send('clipboard', []);
}

// ---- weather (Open-Meteo, location from IP) ----
let weather = null;

// IP geolocation with fallbacks (free services rate-limit often)
async function locate() {
  const services = [
    ['https://ipwho.is/', (j) => j.success !== false && { lat: j.latitude, lon: j.longitude, city: j.city }],
    ['https://get.geojs.io/v1/ip/geo.json', (j) => ({ lat: Number(j.latitude), lon: Number(j.longitude), city: j.city })],
    ['https://ipapi.co/json/', (j) => ({ lat: j.latitude, lon: j.longitude, city: j.city })],
  ];
  for (const [url, pick] of services) {
    try {
      const loc = pick(await (await fetch(url, { signal: AbortSignal.timeout(10000) })).json());
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) return loc;
    } catch {}
  }
  throw new Error('no location');
}

// A city picked in Settings wins; otherwise the IP location, looked up again once a day
// (a laptop travels). Shared with the prayer times.
const DAY = 24 * 60 * 60 * 1000;
let manual = settings.load('location.json', null);
let location = null;
let locatedAt = 0;
const changed = [];

async function getLocation() {
  if (manual) return { lat: manual.lat, lon: manual.lon, city: manual.name, timezone: manual.timezone };
  if (!location || Date.now() - locatedAt > DAY) {
    location = await locate();
    locatedAt = Date.now();
  }
  return location;
}

function locationInfo() {
  return manual ? { mode: 'manual', ...manual } : { mode: 'auto', name: location?.city || '' };
}

// city search for Settings (Open-Meteo geocoding, no key)
async function searchCity(query) {
  const q = String(query || '').trim().slice(0, 80);
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=6&language=ar&format=json&name=${encodeURIComponent(q)}`;
  const j = await (await fetch(url, { signal: AbortSignal.timeout(10000) })).json();
  return (j.results || []).map((r) => ({
    name: r.name, country: r.country || '', admin: r.admin1 || '', lat: r.latitude, lon: r.longitude, timezone: r.timezone || '',
  }));
}

// null = back to automatic
function setLocation(loc) {
  const ok = loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon) && typeof loc.name === 'string';
  manual = ok
    ? { name: loc.name.slice(0, 80), country: String(loc.country || '').slice(0, 80), lat: loc.lat, lon: loc.lon, timezone: String(loc.timezone || '').slice(0, 60) }
    : null;
  settings.save('location.json', manual);
  location = null;
  fetchWeather();
  changed.forEach((fn) => fn(locationInfo()));
}
const onLocationChange = (fn) => changed.push(fn);

let weatherTimer = null;
async function fetchWeather() {
  clearTimeout(weatherTimer);
  try {
    const { lat, lon, city } = await getLocation();
    const loc = { latitude: lat, longitude: lon, city };
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
    const w = await (await fetch(url, { signal: AbortSignal.timeout(10000) })).json();
    weather = {
      city: loc.city || '',
      temp: Math.round(w.current.temperature_2m),
      code: w.current.weather_code,
      isDay: !!w.current.is_day,
      hi: Math.round(w.daily.temperature_2m_max[0]),
      lo: Math.round(w.daily.temperature_2m_min[0]),
    };
    send('weather', weather);
    weatherTimer = setTimeout(fetchWeather, 20 * 60 * 1000);
  } catch (err) {
    console.error('[weather]', err.message);
    weatherTimer = setTimeout(fetchWeather, 2 * 60 * 1000);
  }
}

function snapshot() {
  return { clips: clips.map((c) => c.slice(0, 300)), weather };
}

function start(sender) {
  send = sender;
  // CPU sampling slows down while any performance cut is on.
  const light = () => features.get().noBlur || features.get().noAnimations || features.get().glassFreeze;
  function statsLoop() {
    tickStats();
    setTimeout(statsLoop, light() ? 5000 : 2000);
  }
  setTimeout(statsLoop, light() ? 5000 : 2000);
  fetchWeather();
}

module.exports = { start, copyClip, clearClips, snapshot, getLocation, locationInfo, searchCity, setLocation, onLocationChange, lastSmart, writeQuiet, clipboardChanged };
