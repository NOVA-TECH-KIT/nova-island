'use strict';

// Exercises the tab-ordering block from renderer.js against a tiny DOM fixture. The block is run
// through vm rather than copied here, so the checks cover the functions the island actually runs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rendererPath = path.join(__dirname, '..', 'renderer.js');
const source = fs.readFileSync(rendererPath, 'utf8');
const start = source.indexOf('// [tab-order:start]');
const end = source.indexOf('// [tab-order:end]', start);
assert.ok(start >= 0, 'renderer.js contains the tab-order start marker');
assert.ok(end > start, 'renderer.js contains the tab-order end marker');
const tabOrderBlock = source.slice(start, end);

const CORE_IDS = ['media', 'apps', 'shelf', 'prayer', 'timer', 'system'];
const DOM_IDS = ['media', 'radio', 'apps', 'shelf', 'downloads', 'prayer', 'timer', 'system'];
const DEFAULT_DOM_ORDER = [...DOM_IDS];

class ClassList {
  constructor(initial = '') {
    this.items = new Set(String(initial).split(/\s+/).filter(Boolean));
  }

  set(value) {
    this.items = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  add(...names) {
    names.forEach((name) => this.items.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.items.delete(name));
  }

  contains(name) {
    return this.items.has(name);
  }

  toggle(name, force) {
    const on = force === undefined ? !this.items.has(name) : !!force;
    if (on) this.items.add(name);
    else this.items.delete(name);
    return on;
  }

  get value() {
    return [...this.items].join(' ');
  }
}

class Element {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.classList = new ClassList();
    this.style = {};
    this.hidden = false;
    this.id = '';
    this.offsetWidth = 40;
  }

  get className() {
    return this.classList.value;
  }

  set className(value) {
    this.classList.set(value);
  }

  get children() {
    return this.childNodes.filter((node) => node instanceof Element);
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  get nextElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  get offsetLeft() {
    if (!this.parentNode) return 0;
    return this.parentNode.children.indexOf(this) * 52;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  append(...nodes) {
    nodes.forEach((node) => this.insertBefore(node, null));
  }

  insertBefore(node, reference) {
    if (!(node instanceof Element)) throw new TypeError('appendChild expects an Element');
    if (node.parentNode) {
      const old = node.parentNode.childNodes;
      const oldIndex = old.indexOf(node);
      if (oldIndex >= 0) old.splice(oldIndex, 1);
    }
    const index = reference == null ? this.childNodes.length : this.childNodes.indexOf(reference);
    if (index < 0) throw new Error('insertBefore reference is not a child');
    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    this.ownerDocument.moves++;
    return node;
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  click() {
    const event = { type: 'click', target: this, currentTarget: this };
    for (const listener of this.listeners.get('click') || []) listener.call(this, event);
  }

  descendants() {
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child instanceof Element) {
          out.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.descendants().filter((element) => element.matches(selector));
  }

  matches(selector) {
    return selector.split(',').some((part) => this.matchesOne(part.trim()));
  }

  matchesOne(selector) {
    const attributes = [...selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)];
    let rest = selector.replace(/\[[^\]]*\]/g, '');
    const id = rest.match(/#([\w-]+)/);
    if (id && this.id !== id[1]) return false;
    rest = rest.replace(/#[\w-]+/g, '');
    for (const className of [...rest.matchAll(/\.([\w-]+)/g)].map((match) => match[1])) {
      if (!this.classList.contains(className)) return false;
    }
    rest = rest.replace(/\.[\w-]+/g, '').trim();
    if (rest && this.tagName !== rest.toUpperCase()) return false;
    for (const [, name, value] of attributes) {
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        if (String(this.dataset[key] ?? '') !== String(value ?? '')) return false;
      } else if (this.getAttribute(name) !== (value ?? '')) {
        return false;
      }
    }
    return true;
  }
}

class Document {
  constructor() {
    this.childNodes = [];
    this.moves = 0;
  }

  createElement(tagName) {
    return new Element(this, tagName);
  }

  append(...nodes) {
    nodes.forEach((node) => {
      if (node.parentNode) {
        const old = node.parentNode.childNodes;
        const index = old.indexOf(node);
        if (index >= 0) old.splice(index, 1);
      }
      this.childNodes.push(node);
      node.parentNode = this;
    });
  }

  descendants() {
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child instanceof Element) {
          out.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.descendants().filter((element) => element.matches(selector));
  }
}

function appendText(parent, data = '\n') {
  const text = { nodeType: 3, data, parentNode: parent };
  parent.childNodes.push(text);
  return text;
}

function createHarness({ tabOrder, radioTab = false, downloadTab = false } = {}) {
  const document = new Document();
  const seg = document.createElement('nav');
  seg.className = 'seg';
  document.append(seg);

  const thumb = document.createElement('span');
  thumb.className = 'seg-thumb';
  seg.append(thumb);
  appendText(seg);

  const tabs = new Map();
  for (const id of DOM_IDS) {
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.dataset.tab = id;
    tab.setAttribute('role', 'tab');
    tab.hidden = id === 'radio' ? !radioTab : id === 'downloads' ? !downloadTab : false;
    tab.offsetWidth = 36 + (id.length % 5) * 4;
    seg.append(tab);
    appendText(seg);
    tabs.set(id, tab);
  }

  const views = new Map();
  for (const id of DOM_IDS) {
    const view = document.createElement('section');
    view.id = `v-${id}`;
    view.className = 'view';
    document.append(view);
    views.set(id, view);
  }

  const state = {
    tab: 'media',
    dl: { tab: downloadTab },
    radioTab,
    features: tabOrder === undefined ? {} : { tabOrder },
  };
  const context = vm.createContext({
    $: (selector) => document.querySelector(selector),
    $$: (selector) => document.querySelectorAll(selector),
    state,
    feat: (key) => state.features[key] !== false,
    console,
  });
  vm.runInContext(tabOrderBlock, context, { filename: 'renderer.js (tab-order block)' });
  document.moves = 0;

  const order = () => seg.children
    .filter((element) => element.classList.contains('tab'))
    .map((element) => element.dataset.tab);

  return {
    document,
    seg,
    thumb,
    tabs,
    views,
    state,
    context,
    order,
    indexOf: (id) => order().indexOf(id),
    select: (id) => context.selectTab(id),
    placeThumb: () => context.placeSegThumb(),
    refresh: () => context.refreshTabs(),
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}

test('normalizes missing and malformed orders to the default', () => {
  const h = createHarness();
  const normalize = (value) => Array.from(h.context.normalizeTabOrder(value));
  for (const value of [undefined, null, 'media', 42, {}, new Set(['media']), []]) {
    assert.deepEqual(normalize(value), CORE_IDS);
  }
  assert.deepEqual(
    normalize(['system', 'bogus', 'system', 'media', null, 7, 'apps', 'media']),
    ['system', 'media', 'apps', 'shelf', 'prayer', 'timer'],
  );
  assert.deepEqual(
    normalize(['system', 'prayer', 'media', 'timer', 'apps', 'shelf']),
    ['system', 'prayer', 'media', 'timer', 'apps', 'shelf'],
  );
  const input = ['timer', 'bogus'];
  const result = h.context.normalizeTabOrder(input);
  assert.notEqual(result, input, 'returns a fresh array');
  assert.deepEqual(input, ['timer', 'bogus'], 'does not mutate the saved order');
});

test('keeps the default order and existing nodes/listeners on refresh', () => {
  const h = createHarness();
  h.select('media');
  h.placeThumb();
  const nodes = new Map(h.tabs);
  h.thumb.style.transform = 'stationary';
  h.document.moves = 0;

  h.refresh();

  assert.deepEqual(h.order(), DEFAULT_DOM_ORDER);
  assert.equal(h.document.moves, 0, 'no DOM moves when the order already matches');
  assert.equal(h.thumb.style.transform, 'stationary', 'no needless highlight layout');
  assert.equal(h.seg.children[0], h.thumb, 'keeps .seg-thumb first');
  for (const [id, tab] of nodes) assert.equal(h.seg.querySelector(`.tab[data-tab="${id}"]`), tab, `${id} keeps node identity`);
  assert.equal(h.state.tab, 'media');
  assert.equal(h.tabs.get('media').classList.contains('active'), true);
  assert.equal(h.views.get('media').classList.contains('active'), true);

  h.tabs.get('apps').click();
  assert.equal(h.state.tab, 'apps', 'click listener still works after refresh');
  assert.equal(h.views.get('apps').classList.contains('active'), true);
});

test('reorders existing nodes, keeps the selected view and moves the highlight', () => {
  const h = createHarness({
    tabOrder: ['system', 'shelf', 'media', 'timer', 'apps', 'prayer'],
    radioTab: true,
    downloadTab: true,
  });
  h.select('apps');
  h.placeThumb();
  const nodes = new Map(h.tabs);
  h.document.moves = 0;

  h.refresh();

  assert.deepEqual(h.order(), ['system', 'shelf', 'downloads', 'media', 'radio', 'timer', 'apps', 'prayer']);
  assert.ok(h.document.moves > 0, 'moved existing buttons into the saved order');
  assert.equal(h.seg.children[0], h.thumb, 'keeps .seg-thumb first');
  for (const [id, tab] of nodes) assert.equal(h.seg.querySelector(`.tab[data-tab="${id}"]`), tab, `${id} keeps node identity`);
  assert.equal(h.state.tab, 'apps');
  assert.equal(h.tabs.get('apps').classList.contains('active'), true);
  assert.equal(h.views.get('apps').classList.contains('active'), true);
  assert.equal([...h.views.values()].filter((view) => view.classList.contains('active')).length, 1);
  assert.equal(h.thumb.style.width, `${h.tabs.get('apps').offsetWidth}px`);
  assert.equal(h.thumb.style.transform, `translateX(${h.tabs.get('apps').offsetLeft}px)`);

  h.tabs.get('media').click();
  assert.equal(h.state.tab, 'media', 'click listener survives the move');
  assert.equal(h.views.get('media').classList.contains('active'), true);
  assert.equal(h.views.get('apps').classList.contains('active'), false);
});

test('invalid orders fall back to the default without losing the selection', () => {
  const h = createHarness({ tabOrder: ['system', 'shelf', 'media', 'timer', 'apps', 'prayer'] });
  h.select('shelf');
  h.placeThumb();
  h.refresh();
  const shelf = h.tabs.get('shelf');

  h.state.features.tabOrder = ['bogus', 'media', 'media', 42, 'apps'];
  h.refresh();

  assert.deepEqual(h.order(), DEFAULT_DOM_ORDER);
  assert.equal(h.state.tab, 'shelf');
  assert.equal(shelf.classList.contains('active'), true);
  assert.equal(h.views.get('shelf').classList.contains('active'), true);

  h.state.features.tabOrder = 'not-an-array';
  h.refresh();
  assert.deepEqual(h.order(), DEFAULT_DOM_ORDER);
  assert.equal(h.state.tab, 'shelf');
});

test('disabled tabs keep their saved positions and a hidden active tab falls back in order', () => {
  const h = createHarness({ tabOrder: ['timer', 'system', 'media', 'apps', 'shelf', 'prayer'] });
  h.select('media');
  h.placeThumb();

  h.state.features.tabMedia = false;
  h.refresh();

  const expected = ['timer', 'system', 'media', 'radio', 'apps', 'shelf', 'downloads', 'prayer'];
  assert.deepEqual(h.order(), expected);
  assert.equal(h.tabs.get('media').hidden, true);
  assert.equal(h.indexOf('media'), 2, 'disabled Media keeps its saved position');
  assert.equal(h.state.tab, 'timer', 'falls back to the first visible tab in saved order');
  assert.equal(h.tabs.get('timer').classList.contains('active'), true);
  assert.equal(h.views.get('timer').classList.contains('active'), true);
  assert.equal(h.views.get('media').classList.contains('active'), false);
  assert.equal(h.thumb.style.transform, `translateX(${h.tabs.get('timer').offsetLeft}px)`);

  h.thumb.style.transform = 'stationary';
  h.document.moves = 0;
  h.refresh();
  assert.equal(h.document.moves, 0);
  assert.equal(h.thumb.style.transform, 'stationary');
  assert.equal(h.indexOf('media'), 2);
  assert.equal(h.state.tab, 'timer');

  h.state.features.tabMedia = true;
  h.refresh();
  assert.equal(h.tabs.get('media').hidden, false);
  assert.equal(h.indexOf('media'), 2, 're-enabled Media returns to its saved position');
  assert.equal(h.state.tab, 'timer', 're-enabling a tab does not steal the selection');
});

test('Radio follows Media and Downloads follows Shelf through reorders', () => {
  const h = createHarness({
    tabOrder: ['shelf', 'prayer', 'media', 'timer', 'apps', 'system'],
    radioTab: true,
    downloadTab: true,
  });
  h.select('media');
  h.placeThumb();

  h.refresh();

  const expected = ['shelf', 'downloads', 'prayer', 'media', 'radio', 'timer', 'apps', 'system'];
  assert.deepEqual(h.order(), expected);
  assert.equal(h.indexOf('downloads'), h.indexOf('shelf') + 1);
  assert.equal(h.indexOf('radio'), h.indexOf('media') + 1);

  h.thumb.style.transform = 'stationary';
  h.document.moves = 0;
  h.state.radioTab = false;
  h.state.dl.tab = false;
  h.refresh();

  assert.equal(h.tabs.get('radio').hidden, true);
  assert.equal(h.tabs.get('downloads').hidden, true);
  assert.deepEqual(h.order(), expected, 'hidden special tabs keep their anchor position');
  assert.equal(h.document.moves, 0, 'visibility-only refresh does not move nodes');
  assert.equal(h.thumb.style.transform, `translateX(${h.tabs.get('media').offsetLeft}px)`);
});

test('recalculates the highlight when only the order changes', () => {
  const h = createHarness({ tabOrder: ['media', 'apps', 'shelf', 'prayer', 'timer', 'system'] });
  h.select('media');
  h.placeThumb();
  h.refresh();
  const hiddenBefore = [...h.tabs].map(([id, tab]) => [id, tab.hidden]);
  h.thumb.style.width = 'stale';
  h.thumb.style.transform = 'stale';
  h.document.moves = 0;

  h.state.features.tabOrder = ['system', 'prayer', 'timer', 'shelf', 'apps', 'media'];
  h.refresh();

  const hiddenAfter = [...h.tabs].map(([id, tab]) => [id, tab.hidden]);
  assert.deepEqual(hiddenAfter, hiddenBefore, 'no tab visibility changed');
  assert.ok(h.document.moves > 0);
  assert.equal(h.state.tab, 'media');
  assert.equal(h.thumb.style.width, `${h.tabs.get('media').offsetWidth}px`);
  assert.equal(h.thumb.style.transform, `translateX(${h.tabs.get('media').offsetLeft}px)`);
});

test('unchanged order does no DOM moves or highlight layout on repeated refreshes', () => {
  const h = createHarness({ tabOrder: ['system', 'media', 'shelf', 'apps', 'timer', 'prayer'] });
  h.select('media');
  h.placeThumb();
  h.refresh();
  h.document.moves = 0;
  h.thumb.style.width = 'stationary';
  h.thumb.style.transform = 'stationary';

  for (let i = 0; i < 4; i++) h.refresh();

  assert.equal(h.document.moves, 0);
  assert.equal(h.thumb.style.width, 'stationary');
  assert.equal(h.thumb.style.transform, 'stationary');
  const expected = ['system', 'media', 'radio', 'shelf', 'downloads', 'apps', 'timer', 'prayer'];
  assert.deepEqual(h.order(), expected);

  // A download feature refresh with no visibility change must not move nodes or place the thumb.
  h.state.features = { ...h.state.features, downloads: true, folderDownloads: true };
  h.refresh();
  assert.equal(h.document.moves, 0);
  assert.equal(h.thumb.style.width, 'stationary');
  assert.equal(h.thumb.style.transform, 'stationary');
  assert.deepEqual(h.order(), expected);
});

console.log('Tab order renderer verified');
