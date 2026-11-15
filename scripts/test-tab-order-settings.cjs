'use strict';

// Standalone checks for the persisted tab order in features.js.
// Runs under plain Node; the Electron-backed settings module is faked in memory.

const assert = require('node:assert/strict');
const Module = require('node:module');

const FEATURES_PATH = require.resolve('../features.js');
const SETTINGS_PATH = require.resolve('../settings.js');
const DEFAULT_ORDER = ['media', 'apps', 'shelf', 'prayer', 'timer', 'system'];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createSettings(initial) {
  let store = initial === undefined ? null : clone(initial);
  const saves = [];
  return {
    saves,
    load(name, fallback) {
      if (name === 'features.json' && store !== null) return clone(store);
      return fallback;
    },
    save(name, data) {
      const saved = clone(data);
      saves.push({ name, data: saved });
      store = saved;
    },
    store() {
      return clone(store);
    },
  };
}

function loadFeatures(settings) {
  const fake = new Module(SETTINGS_PATH, module);
  fake.filename = SETTINGS_PATH;
  fake.loaded = true;
  fake.exports = settings;
  require.cache[SETTINGS_PATH] = fake;
  delete require.cache[FEATURES_PATH];
  return require(FEATURES_PATH);
}

function assertOrder(actual, expected) {
  assert.ok(Array.isArray(actual), 'tab order should be an array');
  assert.deepStrictEqual(actual, expected);
}

function check(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

check('defaults are complete and isolated', () => {
  const features = loadFeatures(createSettings(null));
  const state = features.get();

  assertOrder(state.tabOrder, DEFAULT_ORDER);
  assert.notStrictEqual(state.tabOrder, features.DEFAULTS.tabOrder);
  assert.notStrictEqual(state.tabOrder, features.get().tabOrder);

  state.tabOrder.reverse();
  assertOrder(features.get().tabOrder, DEFAULT_ORDER);
  assertOrder(features.DEFAULTS.tabOrder, DEFAULT_ORDER);
});

check('old settings keep their values and gain the default order', () => {
  const settings = createSettings({
    tabMedia: false,
    tabShelf: 'yes',
    theme: 'bogus',
    waterEvery: 90,
    focusMin: 240,
    hijriAdjust: -7,
    unknownKey: 'ignored',
  });
  const features = loadFeatures(settings);
  const state = features.get();

  assert.equal(state.tabMedia, false);
  assert.equal(state.tabShelf, true);
  assert.equal(state.theme, 'original');
  assert.equal(state.waterEvery, 90);
  assert.equal(state.focusMin, 120);
  assert.equal(state.hijriAdjust, -2);
  assert.equal(Object.hasOwn(state, 'unknownKey'), false);
  assertOrder(state.tabOrder, DEFAULT_ORDER);
  assert.equal(settings.saves.length, 0);

  features.set({ tabMedia: true });
  assertOrder(settings.saves.at(-1).data.tabOrder, DEFAULT_ORDER);
});

check('non-array saved orders fall back to defaults', () => {
  for (const bad of ['system', 7, null, {}, true]) {
    const features = loadFeatures(createSettings({ tabOrder: bad, tabMedia: false }));
    assertOrder(features.get().tabOrder, DEFAULT_ORDER);
    assert.equal(features.get().tabMedia, false);
  }
});

check('array input is cleaned, deduplicated and completed', () => {
  const cases = [
    { input: [], expected: DEFAULT_ORDER },
    { input: ['shelf', 'media'], expected: ['shelf', 'media', 'apps', 'prayer', 'timer', 'system'] },
    {
      input: ['timer', 'timer', 'nope', 'media', 42, null, {}, 'apps', 'system', 'media'],
      expected: ['timer', 'media', 'apps', 'system', 'shelf', 'prayer'],
    },
    { input: ['system', 'prayer'], expected: ['system', 'prayer', 'media', 'apps', 'shelf', 'timer'] },
    { input: ['system', 'timer', 'prayer', 'shelf', 'apps', 'media'], expected: [...DEFAULT_ORDER].reverse() },
    { input: ['media', 'media'], expected: DEFAULT_ORDER },
  ];

  for (const { input, expected } of cases) {
    const settings = createSettings(null);
    const features = loadFeatures(settings);
    features.set({ tabOrder: input });

    assertOrder(features.get().tabOrder, expected);
    assert.equal(settings.saves.at(-1).name, 'features.json');
    assertOrder(settings.saves.at(-1).data.tabOrder, expected);
  }

  const features = loadFeatures(createSettings({ tabOrder: ['system', 'system', 'nope'] }));
  assertOrder(features.get().tabOrder, ['system', 'media', 'apps', 'shelf', 'prayer', 'timer']);
});

check('array input and returned snapshots are not retained', () => {
  const features = loadFeatures(createSettings(null));
  const input = ['shelf', 'media'];
  features.set({ tabOrder: input });

  input[0] = 'system';
  input.push('timer');

  const state = features.get();
  const expected = ['shelf', 'media', 'apps', 'prayer', 'timer', 'system'];
  assertOrder(state.tabOrder, expected);
  assert.notStrictEqual(state.tabOrder, features.get().tabOrder);

  state.tabOrder.reverse();
  assertOrder(features.get().tabOrder, expected);
});

check('non-array tab order patches are ignored', () => {
  const settings = createSettings(null);
  const features = loadFeatures(settings);
  features.set({ tabOrder: ['system', 'media'] });

  const expected = ['system', 'media', 'apps', 'shelf', 'prayer', 'timer'];
  const saves = settings.saves.length;
  for (const bad of ['system', 42, null, undefined, {}, true, new Set(['media'])]) {
    features.set({ tabOrder: bad });
    assertOrder(features.get().tabOrder, expected);
  }
  assert.equal(settings.saves.length, saves);

  features.set({ tabOrder: 'system', tabMedia: false });
  assertOrder(features.get().tabOrder, expected);
  assert.equal(features.get().tabMedia, false);

  for (const patch of [null, undefined, 'tabOrder', 42]) {
    const result = features.set(patch);
    assertOrder(result.tabOrder, expected);
    assert.notStrictEqual(result.tabOrder, features.get().tabOrder);
  }
});

check('order is saved and survives a reload', () => {
  const settings = createSettings(null);
  let features = loadFeatures(settings);
  const wanted = ['prayer', 'system', 'media', 'timer', 'apps', 'shelf'];
  features.set({ tabOrder: wanted });

  const save = settings.saves.at(-1);
  assert.equal(save.name, 'features.json');
  assertOrder(save.data.tabOrder, wanted);
  assertOrder(settings.store().tabOrder, wanted);

  features = loadFeatures(settings);
  assertOrder(features.get().tabOrder, wanted);
});

check('listener snapshots and set results are isolated', () => {
  const settings = createSettings(null);
  const features = loadFeatures(settings);
  const snapshots = [];
  const otherSnapshots = [];
  features.onChange((state) => snapshots.push(state));
  features.onChange((state) => otherSnapshots.push(state));

  const first = features.set({ tabOrder: ['timer', 'media'] });
  const second = features.set({ tabMedia: false });
  const expected = ['timer', 'media', 'apps', 'shelf', 'prayer', 'system'];

  assert.equal(snapshots.length, 2);
  assert.equal(otherSnapshots.length, 2);
  assertOrder(first.tabOrder, expected);
  assertOrder(second.tabOrder, expected);
  assertOrder(snapshots[0].tabOrder, expected);
  assertOrder(snapshots[1].tabOrder, expected);
  assert.notStrictEqual(first.tabOrder, snapshots[0].tabOrder);
  assert.notStrictEqual(first.tabOrder, second.tabOrder);
  assert.notStrictEqual(snapshots[0].tabOrder, otherSnapshots[0].tabOrder);
  assert.notStrictEqual(first, snapshots[0]);

  first.tabOrder.reverse();
  second.tabOrder.length = 0;
  snapshots[0].tabOrder.shift();
  snapshots[1].tabOrder.push('bogus');
  assertOrder(features.get().tabOrder, expected);
  assertOrder(otherSnapshots[0].tabOrder, expected);

  const saves = settings.saves.length;
  const noop = features.set({ tabOrder: 'media' });
  assert.equal(settings.saves.length, saves);
  assertOrder(noop.tabOrder, expected);
  assert.notStrictEqual(noop.tabOrder, features.get().tabOrder);
});

check('reset restores and persists an independent default order', () => {
  const settings = createSettings(null);
  const features = loadFeatures(settings);
  features.set({ tabOrder: ['timer', 'media', 'system', 'apps', 'shelf', 'prayer'], tabMedia: false });

  const snapshots = [];
  features.onChange((state) => snapshots.push(state));
  features.reset();

  assert.equal(features.get().tabMedia, true);
  assertOrder(features.get().tabOrder, DEFAULT_ORDER);
  assert.notStrictEqual(features.get().tabOrder, features.DEFAULTS.tabOrder);
  assert.equal(settings.saves.at(-1).name, 'features.json');
  assertOrder(settings.saves.at(-1).data.tabOrder, DEFAULT_ORDER);
  assert.equal(snapshots.length, 1);
  assertOrder(snapshots[0].tabOrder, DEFAULT_ORDER);
  assert.notStrictEqual(snapshots[0].tabOrder, features.get().tabOrder);
  assert.notStrictEqual(snapshots[0].tabOrder, features.DEFAULTS.tabOrder);

  snapshots[0].tabOrder.push('bogus');
  assertOrder(features.get().tabOrder, DEFAULT_ORDER);

  const reloaded = loadFeatures(settings);
  assertOrder(reloaded.get().tabOrder, DEFAULT_ORDER);
});

check('existing boolean, range and choice validation still works', () => {
  const settings = createSettings(null);
  const features = loadFeatures(settings);
  let state = features.set({
    tabMedia: false,
    tabApps: 'off',
    waterEvery: 999,
    waterGoal: 5.6,
    hijriAdjust: -9,
    theme: 'midnight',
    focusMin: 10,
    batterySaverAt: 50,
  });

  assert.equal(state.tabMedia, false);
  assert.equal(state.tabApps, true);
  assert.equal(state.waterEvery, 240);
  assert.equal(state.waterGoal, 6);
  assert.equal(state.hijriAdjust, -2);
  assert.equal(state.theme, 'midnight');
  assert.equal(state.focusMin, 10);
  assert.equal(state.batterySaverAt, 50);

  state = features.set({ theme: 'bogus', unknown: true, quietFrom: 5000, quietTo: -10 });
  assert.equal(state.theme, 'midnight');
  assert.equal(Object.hasOwn(state, 'unknown'), false);
  assert.equal(state.quietFrom, 1439);
  assert.equal(state.quietTo, 0);

  const saves = settings.saves.length;
  features.set({ theme: 'bogus' });
  assert.equal(settings.saves.length, saves);
});

console.log('Tab order settings verified');
