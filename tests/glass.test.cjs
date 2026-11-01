const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { displacement, filterGraph, MATERIAL, SMALL } = require('../liquid-glass');
const { capturePart } = require('../capture-geometry');

test('capture intersections preserve coordinates on negative-origin mixed-DPI displays', () => {
  const window = { x: -100, y: 50, width: 640, height: 320 };
  const left = capturePart(window, { x: -1920, y: 0, width: 1920, height: 1080 }, { width: 2880, height: 1620 });
  const right = capturePart(window, { x: 0, y: 0, width: 2560, height: 1440 }, { width: 2560, height: 1440 });
  assert.deepEqual(left.crop, { x: 2730, y: 75, width: 150, height: 480 });
  assert.deepEqual([left.x, left.y, left.width, left.height], [0, 0, 100, 320]);
  assert.deepEqual(right.crop, { x: 0, y: 50, width: 540, height: 320 });
  assert.equal(right.x, 100);
  assert.equal(capturePart(window, { x: 2560, y: 0, width: 1920, height: 1080 }, { width: 960, height: 540 }), null);
});

test('fractional thumbnail scales never crop outside their bitmap', () => {
  const bounds = { x: -1536, y: -200, width: 1536, height: 864 };
  for (let x = -1600; x < 100; x += 17) {
    const part = capturePart({ x, y: -230, width: 640, height: 320 }, bounds, { width: 1001, height: 563 });
    if (!part) continue;
    assert.ok(part.crop.x >= 0 && part.crop.y >= 0);
    assert.ok(part.crop.x + part.crop.width <= 1001);
    assert.ok(part.crop.y + part.crop.height <= 563);
  }
});

test('docked square corners change the map while preserving a neutral exterior', () => {
  const a = displacement(236, 32, [16, 16, 16, 16], MATERIAL, 26);
  const b = displacement(236, 32, [0, 0, 16, 16], MATERIAL, 26);
  assert.notDeepEqual(a.pixels, b.pixels);
  assert.deepEqual([...b.pixels.slice(0, 4)], [128, 128, 128, 255]);
});

test('chromatic graph preserves Flint channel scales and frost', () => {
  const graph = filterGraph(548, 232, 64);
  assert.equal((graph.match(/<feDisplacementMap/g) || []).length, 3);
  for (const value of [60.16, 64, 69.12]) assert.ok(graph.includes(`scale="${value}"`));
  assert.ok(graph.includes('stdDeviation="3.2"'));
  assert.ok(graph.includes('type="saturate" values="1.6"'));
});

test('active tab lens uses the reference small material without chromatic splitting', () => {
  const graph = filterGraph(82, 26, 26, SMALL);
  assert.equal((graph.match(/<feDisplacementMap/g) || []).length, 1);
  assert.ok(graph.includes('stdDeviation="4.5"'));
  assert.ok(graph.includes('type="saturate" values="1.7"'));
});

test('map pixels exactly match the actual Flint source for uniform corners', { skip: !process.env.FLINT_REFERENCE }, async () => {
  const source = fs.readFileSync(process.env.FLINT_REFERENCE, 'utf8');
  const begin = source.indexOf('function displacementMap(');
  const end = source.indexOf('\ninterface Filter', begin);
  assert.ok(begin >= 0 && end > begin);
  const fn = source.slice(begin, end)
    .replace(/function displacementMap\([^\n]+/, 'function displacementMap(w, h, r, m, scale) {')
    .replace("getContext('2d')!", "getContext('2d')")
    .replace(/let (dist|nx|ny): number;/g, 'let $1;');
  for (const [w, h, r] of [[236, 32, 16], [400, 78, 28], [548, 232, 34], [44, 244, 22], [1200, 650, 34]]) {
    let actual;
    const ctx = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: img => { actual = img.data; } };
    const sandbox = { PAD: 28, document: { createElement: () => ({ getContext: () => ctx, toBlob: cb => cb(null), toDataURL: () => '' }) } };
    vm.createContext(sandbox);
    vm.runInContext(fn + '\nthis.referenceMap = displacementMap;', sandbox);
    const scale = Math.round(Math.min(Math.max(Math.min(w, h) * .55, 26), 64));
    await sandbox.referenceMap(w, h, r, MATERIAL, scale);
    const port = displacement(w, h, [r, r, r, r], MATERIAL, scale);
    assert.deepEqual(port.pixels, actual, `map parity ${w}x${h}`);
  }
});
