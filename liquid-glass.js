/* Flint/PANE material port. Reference: pane/src/ui/glass.ts and
 * pane/src/styles/app.css (local reference inspected 2026-11-01).
 * Keep the reference SDF, optical constants and SVG channel graph together.
 * Nova supplies captured desktop pixels instead of a DOM backdrop.
 */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const PAD = 28;
  const MATERIAL = Object.freeze({ frost: 3.2, band: 30, mag: 0.035, sat: 1.6, strength: 1, aberrate: true });
  const SMALL = Object.freeze({ frost: 4.5, band: 18, mag: 0.03, sat: 1.7, strength: .9, aberrate: false });
  const CARD = Object.freeze({ frost: 5.5, band: 26, mag: .012, sat: 1.7, strength: .9, aberrate: false });
  let filterSequence = 0;
  const scriptUrl=typeof document!=='undefined'?document.currentScript?.src:null;
  let worker=null,workerFailed=false,workerSequence=0;
  const requests=new Map();
  async function workerMap(w,h,radii,material,scale){
    if(workerFailed || typeof Worker==='undefined')return displacement(w,h,radii,material,scale);
    try {
      if(!worker){
        worker=new Worker(new URL('glass-worker.js',scriptUrl));
        worker.onmessage=({data})=>{
          if(data.ready){console.debug('[glass-worker] ready');return;}
          const request=requests.get(data.id);if(!request)return;requests.delete(data.id);
          if(data.error)request.reject(new Error(data.error));else request.resolve(data);
        };
        worker.onerror=()=>{console.warn('[glass-worker] unavailable; using fallback');workerFailed=true;worker.terminate();worker=null;requests.forEach(r=>r.reject(new Error('glass worker failed')));requests.clear();};
      }
      const id=++workerSequence;
      return await new Promise((resolve,reject)=>{requests.set(id,{resolve,reject});worker.postMessage({id,w,h,radii,material,scale});});
    } catch(error){return displacement(w,h,radii,material,scale);}
  }

  // Rounded rectangle signed distance, extended to independent docked corners.
  function displacement(w, h, radii, m, scale) {
    const W = w + PAD * 2, H = h + PAD * 2;
    const k = Math.min(1, Math.sqrt(3e5 / (W * H)));
    const cw = Math.max(8, Math.round(W * k)), ch = Math.max(8, Math.round(H * k));
    const pixels = new Uint8ClampedArray(cw * ch * 4);
    const band = Math.min(m.band, h * .5, w * .5);
    const lens = m.mag * Math.min(w, h);
    for (let j = 0; j < ch; j++) {
      const y = (j + .5) / k - PAD;
      for (let i = 0; i < cw; i++) {
        const x = (i + .5) / k - PAD, o = (j * cw + i) * 4;
        const dx = x - w / 2, dy = y - h / 2;
        const r = radii[dy < 0 ? (dx < 0 ? 0 : 1) : (dx < 0 ? 3 : 2)];
        const qx = Math.abs(dx) - (w / 2 - r), qy = Math.abs(dy) - (h / 2 - r);
        let dist, nx, ny;
        if (qx > 0 && qy > 0) {
          const len = Math.hypot(qx, qy);
          dist = len - r; nx = qx / len * Math.sign(dx); ny = qy / len * Math.sign(dy);
        } else if (qx > qy) {
          dist = qx - r; nx = Math.sign(dx); ny = 0;
        } else {
          dist = qy - r; nx = 0; ny = Math.sign(dy);
        }
        pixels[o + 2] = 128; pixels[o + 3] = 255;
        if (dist >= 0) { pixels[o] = 128; pixels[o + 1] = 128; continue; }
        let sx = -dx / Math.max(1, Math.min(w, h) / 2) * lens;
        let sy = -dy / Math.max(1, Math.min(w, h) / 2) * lens;
        const depth = -dist;
        if (depth < band) {
          const bend = (1 - depth / band) ** 2.2 * Math.min(depth / 1.2, 1) * m.strength * scale * .5;
          sx += nx * bend; sy += ny * bend;
        }
        pixels[o] = Math.max(0, Math.min(255, 128 + sx / scale * 254));
        pixels[o + 1] = Math.max(0, Math.min(255, 128 + sy / scale * 254));
      }
    }
    return { width: cw, height: ch, pixels };
  }

  function filterGraph(w, h, scale, material = MATERIAL) {
    const displace = (s, out) => `<feDisplacementMap in="SourceGraphic" in2="map" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="${out}"/>`;
    const channel = (c) => [0, 1, 2].map(row => [0, 1, 2, 3, 4].map(col => +(row === c && col === c)).join(' ')).join('  ') + '  0 0 0 1 0';
    return `<feImage result="map" preserveAspectRatio="none" x="-${PAD}" y="-${PAD}" width="${w + PAD * 2}" height="${h + PAD * 2}"/>` +
      (material.aberrate ? `${displace(scale * .94, 'dr')}<feColorMatrix in="dr" type="matrix" values="${channel(0)}" result="r"/>` +
      `${displace(scale, 'dg')}<feColorMatrix in="dg" type="matrix" values="${channel(1)}" result="g"/>` +
      `${displace(scale * 1.08, 'db')}<feColorMatrix in="db" type="matrix" values="${channel(2)}" result="b"/>` +
      '<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen" result="bent"/>' : displace(scale, 'bent')) +
      `<feGaussianBlur in="bent" stdDeviation="${material.frost}" result="frost"/><feColorMatrix in="frost" type="saturate" values="${material.sat}"/>`;
  }

  function create(island, surface, wake, options = {}) {
    const clip = options.pane || island.querySelector('.clip');
    const material = options.kind === 'small' ? SMALL : options.kind === 'card' ? CARD : MATERIAL;
    const property = options.backdrop ? 'backdrop-filter' : 'filter';
    const limit = options.cacheLimit || 24;
    const reduced = matchMedia('(prefers-reduced-transparency: reduce)');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden';
    const defs = document.createElementNS(NS, 'defs');
    svg.append(defs); document.body.prepend(svg);
    const cache = new Map();
    let current = '', desired = '', pending = false, lastBuild = -Infinity, disposed = false;
    function preferences() {
      island.classList.toggle('lg-solid', reduced.matches);
      if (reduced.matches) surface.style.removeProperty(property);
      else { current = ''; wake(); }
    }
    reduced.addEventListener('change', preferences); preferences();

    function trim() {
      while (cache.size > limit) {
        const key = [...cache.keys()].find(key => key !== current);
        const entry = cache.get(key);
        entry.filter.remove(); URL.revokeObjectURL(entry.url); cache.delete(key);
      }
    }
    function apply(key, entry) {
      if (disposed || reduced.matches) return;
      current = key; cache.delete(key); cache.set(key, entry);
      surface.style.setProperty(property, `url(#${entry.filter.id})`);
      island.classList.add('lg-ready'); trim();
    }
    function update() {
      if (disposed || reduced.matches) return;
      const geometry = options.geometryPane || clip;
      const w = Math.round(geometry.clientWidth), h = Math.round(geometry.clientHeight);
      if (w < 12 || h < 12) return;
      const css = getComputedStyle(geometry);
      const radii = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
        .map(name => Math.round(Math.min(parseFloat(css[name]) || 0, w / 2, h / 2)));
      const key = `${w}x${h}:${radii.join(',')}`;
      desired = key;
      if (key === current) return;
      if (cache.has(key)) { apply(key, cache.get(key)); return; }
      // One encoding in flight, at most 20 maps/s during a morph. Final geometry
      // is refreshed by Nova's existing wake loop; no permanent animation loop.
      if (pending || performance.now() - lastBuild < 50) return;
      pending = true; lastBuild = performance.now();
      const scale = Math.round(Math.min(Math.max(Math.min(w, h) * .55, 26), material.aberrate ? 64 : 52));
      (async()=>{
      const map = options.asyncMap ? await workerMap(w,h,radii,material,scale) : displacement(w, h, radii, material, scale);
      if(disposed || (options.asyncMap && !clip.getClientRects().length)){pending=false;return;}
      const canvas = document.createElement('canvas');
      canvas.width = map.width; canvas.height = map.height;
      canvas.getContext('2d').putImageData(new ImageData(map.pixels, map.width, map.height), 0, 0);
      canvas.toBlob(async blob => {
        if (!blob || disposed) { pending=false; return; }
        const url = URL.createObjectURL(blob);
        // Decode before replacing the stable CSS material with the SVG graph.
        // Otherwise feImage can briefly paint without its displacement input.
        const decoded=await new Promise(resolve=>{
          const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=url;
        });
        pending=false;
        if(!decoded || disposed){URL.revokeObjectURL(url);return;}
        const filter = document.createElementNS(NS, 'filter');
        filter.id = `flint-lg-${++filterSequence}`;
        for (const [a, v] of Object.entries({ filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB', x: -PAD, y: -PAD, width: w + PAD * 2, height: h + PAD * 2 })) filter.setAttribute(a, String(v));
        filter.innerHTML = filterGraph(w, h, scale, material);
        filter.querySelector('feImage').setAttribute('href', url);
        defs.append(filter);
        const entry = { filter, url }; cache.set(key, entry);
        if (key === desired) apply(key, entry);
        trim(); wake(150);
      }, 'image/png');
      })().catch(error=>{pending=false;console.warn('[glass-map]',error.message);});
    }
    // Local events work while interactive; near IPC also works during click-through.
    function point(x, y) {
      clip.style.setProperty('--gx', `${Math.round(x)}px`);
      clip.style.setProperty('--gy', `${Math.round(y)}px`);
    }
    function clear() { clip.style.removeProperty('--gx'); clip.style.removeProperty('--gy'); }
    clip.addEventListener('pointermove', e => {
      const r = clip.getBoundingClientRect(); point(e.clientX - r.left, e.clientY - r.top);
    }, { passive: true });
    clip.addEventListener('pointerleave', clear);
    window.nova?.onNear(n => {
      if (!n) { clear(); return; }
      const root = island.getBoundingClientRect(), pane = clip.getBoundingClientRect();
      point(root.left + root.width / 2 + n.dx - pane.left, root.top + root.height / 2 + n.dy - pane.top);
    });
    window.addEventListener('pagehide', () => {
      disposed = true; reduced.removeEventListener('change', preferences);
      cache.forEach(entry => URL.revokeObjectURL(entry.url)); cache.clear(); svg.remove();
    }, { once: true });
    return { update };
  }
  // Expose only the renderer adapter. CommonJS export permits numeric parity tests.
  if (typeof module !== 'undefined' && module.exports) module.exports = { displacement, filterGraph, MATERIAL, SMALL, PAD };
  else if(typeof window!=='undefined')window.FlintGlass = { create };
  else self.FlintGlassMath = { displacement };
})();
