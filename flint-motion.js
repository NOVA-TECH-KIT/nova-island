// Choreography ported from Flint/PANE ui/components.ts, motion.ts and press.ts.
(() => {
  const gsap = window.gsap;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rects = new WeakMap();
  const running = new WeakMap();
  const animatedTargets = new WeakMap();
  const dur = n => reduced.matches ? 0 : n;
  function lensMove(lens, track, target, animate = true, axis = 'x', radius = 999) {
    if (!target || !target.offsetWidth) { gsap.set(lens, { opacity: 0 }); rects.delete(lens); return; }
    const x = target.offsetLeft, y = target.offsetTop, w = target.offsetWidth, h = target.offsetHeight;
    const prev = rects.get(lens);
    rects.set(lens, [x, y, w, h]);
    gsap.killTweensOf(lens);
    Object.assign(lens.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${radius >= 999 ? Math.min(w, h) / 2 : radius}px`, clipPath: 'none' });
    if (!animate || reduced.matches || !prev || Number(gsap.getProperty(lens, 'opacity')) === 0) {
      gsap.set(lens, { x, y, scaleX: 1, scaleY: 1, opacity: 1, transformOrigin: '50% 50%' }); return;
    }
    const [px, py, pw, ph] = prev;
    if (px === x && py === y && pw === w && ph === h) { gsap.set(lens, { x, y, scaleX: 1, scaleY: 1, opacity: 1 }); return; }
    const cx = px + pw / 2 - w / 2, cy = py + ph / 2 - h / 2;
    const travel = axis === 'x' ? Math.abs(x - px) / w : Math.abs(y - py) / h;
    const squash = Math.min(.5, .16 + travel * .14), sx = pw / w, sy = ph / h;
    const stretch = axis === 'x' ? { scaleX: sx * (1 + squash), scaleY: sy * (1 - squash * .45) } : { scaleX: sx * (1 - squash * .45), scaleY: sy * (1 + squash) };
    gsap.set(lens, { opacity: 1, transformOrigin: '50% 50%' });
    gsap.fromTo(lens, { x: cx, y: cy }, { x, y, duration: .62, ease: 'back.out(1.35)' });
    gsap.fromTo(lens, { scaleX: sx, scaleY: sy }, { keyframes: [
      { ...stretch, duration: .16, ease: 'power2.out' },
      { scaleX: 1, scaleY: 1, duration: .85, ease: 'elastic.out(1.1, 0.38)' },
    ] });
  }
  function insetClip(el, frac, grow = 0) {
    const w = el.offsetWidth, h = el.offsetHeight;
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    return `inset(${h / 2 * frac - grow}px ${w / 2 * frac - grow}px round ${Math.max(0, Math.min(r + grow, Math.min(w, h) / 2))}px)`;
  }
  function clear(el) {
    running.get(el)?.kill(); running.delete(el);
    const nodes = animatedTargets.get(el) || [el,...el.children];
    animatedTargets.delete(el);gsap.killTweensOf(nodes);
    gsap.set(nodes, { clearProps: 'transform,clipPath,opacity' });
  }
  function enter(els, { y = 26, stagger = .07, delay = 0, from = .72, kids = true } = {}) {
    const tl = gsap.timeline({ delay: dur(delay) });
    // Read geometry as a batch before GSAP starts writing inline styles.
    // Interleaving these reads/writes forces layout again for every card.
    els.forEach(clear);
    const clips=els.map(el=>({from:insetClip(el,from),to:insetClip(el,0,60)}));
    els.forEach((el, i) => {
      running.set(el, tl);
      animatedTargets.set(el,kids?[el,...el.children]:[el]);
      const at = i * dur(stagger);
      tl.fromTo(el, { y, scale: .97, clipPath: clips[i].from },
        { y: 0, scale: 1, clipPath: clips[i].to, duration: dur(.9), ease: 'expo.out', clearProps: 'transform,clipPath' }, at);
      const children = kids ? [...el.children].filter(c => !c.hidden) : [];
      if (children.length) tl.fromTo(children, { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: dur(.55), ease: 'power3.out', stagger: dur(.035), clearProps: 'transform,opacity' }, at + dur(.14));
    });
    return tl;
  }
  function press(root = document) {
    root.addEventListener('pointerdown', e => {
      if (reduced.matches || e.button > 0 || e.target.closest('input,textarea,select,[contenteditable]')) return;
      const el = e.target.closest('button,.side a,.chip');
      if (!el || el.disabled) return;
      gsap.fromTo(el, { scaleX: 1, scaleY: 1 }, { keyframes: [
        { scaleX: 1.07, scaleY: .9, duration: .11, ease: 'power2.out' },
        { scaleX: 1, scaleY: 1, duration: .7, ease: 'elastic.out(1.15,.32)' },
      ], clearProps: 'transform' });
      const r = el.getBoundingClientRect(), wrap = document.createElement('span'), dot = document.createElement('span');
      wrap.className = 'flint-ripple-wrap'; dot.className = 'flint-ripple'; wrap.setAttribute('aria-hidden', 'true'); wrap.append(dot); el.append(wrap);
      const reach = Math.hypot(Math.max(e.clientX - r.left, r.right - e.clientX), Math.max(e.clientY - r.top, r.bottom - e.clientY)) * 2.2 / 20;
      gsap.set(dot, { x: e.clientX - r.left, y: e.clientY - r.top });
      gsap.fromTo(dot, { scale: .2, opacity: .9 }, { scale: Math.min(reach, 30), opacity: 0, duration: .75, ease: 'power2.out', onComplete: () => wrap.remove() });
    }, { passive: true });
  }
  function settingsIn(page) {
    document.body.classList.add('settings-in-motion');
    // Flint animates each glass .sgroup itself, not a backdrop-root ancestor.
    const groups = [...page.querySelectorAll('.card,.chip')];
    const tl = enter(groups, { stagger: .06, y: 30, delay: .12, kids: false });
    const heading = page.querySelector('h1');
    if (heading) {
      if (!heading.dataset.split) {
        const text = heading.textContent;
        heading.setAttribute('aria-label', text); heading.textContent = '';
        [...text].forEach(char => { const wrap=document.createElement('span'),ch=document.createElement('span');wrap.className='flint-char-wrap';ch.className='flint-char';ch.textContent=char;ch.setAttribute('aria-hidden','true');wrap.append(ch);heading.append(wrap); });
        heading.dataset.split='true';
      }
      tl.fromTo(heading.querySelectorAll('.flint-char'), { yPercent:115,rotation:6 }, { yPercent:0,rotation:0,duration:dur(.85),ease:'power4.out',stagger:dur(.022),clearProps:'transform' }, 0);
    }
    const rows = [...page.querySelectorAll('.row,.chip,.stepper')].filter(el => el.getBoundingClientRect().top < innerHeight);
    if (rows.length) tl.fromTo(rows, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: dur(.55), ease: 'power3.out', stagger: dur(.025), clearProps: 'transform,opacity' }, dur(.4));
    const walls = [...page.querySelectorAll('.wall-choice')];
    if (walls.length) tl.fromTo(walls, { opacity: 0, y: 40, rotation: i => i % 2 ? 3 : -3, scale: .94 }, { opacity: 1, y: 0, rotation: 0, scale: 1, duration: dur(.8), ease: 'back.out(1.4)', stagger: dur(.05), clearProps: 'transform,opacity' }, dur(.5));
    running.set(page, tl);
    animatedTargets.set(page,[...groups,...rows,...walls,...(heading?heading.querySelectorAll('.flint-char'):[])]);
    tl.eventCallback('onComplete',()=>document.body.classList.remove('settings-in-motion'));
    return tl;
  }
  const shapes = new WeakMap();
  function morph(el, from, mode) {
    const css = getComputedStyle(el);
    const width = parseFloat(css.getPropertyValue('--w')), height = parseFloat(css.getPropertyValue('--h'));
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    const clip=el.querySelector('.clip');
    let shape=shapes.get(el);
    if (!shape) { shape={w:from.width,h:from.height}; shapes.set(el,shape); }
    gsap.killTweensOf(shape);
    const W=Math.max(from.width,width),H=Math.max(from.height,height);
    const corners=['--tl','--tr','--br','--bl'].map(k=>parseFloat(css.getPropertyValue(k))||0);
    Object.assign(clip.style,{width:`${W}px`,height:`${H}px`,right:'auto',bottom:'auto'});
    function paint() {
      const w=Math.max(12,Math.min(shape.w,W)),h=Math.max(3,Math.min(shape.h,H)),side=(W-w)/2;
      const vertical=el.classList.contains('vertical'),top=(H-h)/2;
      el.style.width=`${w}px`;el.style.height=`${h}px`;clip.style.left=`${-side}px`;clip.style.top=`${-top}px`;
      if(vertical) {
        el.style.left=`${el.classList.contains('side-right') ? innerWidth-w : 0}px`;
        const anchorY=parseFloat(el.style.getPropertyValue('--dock-y')) || innerHeight/2;
        el.style.top=`${Math.min(Math.max(anchorY-h/2,4),innerHeight-h-4)}px`;
      } else {
        const anchorX=parseFloat(el.style.getPropertyValue('--dock-x')) || innerWidth/2;
        const anchorY=parseFloat(el.style.getPropertyValue('--dock-y')) || 0;
        el.style.left=`${Math.min(Math.max(anchorX-w/2,4),innerWidth-w-4)}px`;
        el.style.top=`${el.classList.contains('docked') ? 0 : Math.min(Math.max(anchorY,0),innerHeight-h-6)}px`;
        if(mode==='scene') {
          el.style.left=el.style.getPropertyValue('--x');
          el.style.top=el.style.getPropertyValue('--y');
        }
      }
      const radii=corners.map(r=>Math.min(r,w/2,h/2));
      clip.style.clipPath=`inset(${top}px ${side}px ${H-h-top}px ${side}px round ${radii.map(r=>r+'px').join(' ')})`;
      clip.style.setProperty('--shape-top',`${top}px`);clip.style.setProperty('--shape-left',`${side}px`);clip.style.setProperty('--shape-w',`${w}px`);clip.style.setProperty('--shape-h',`${h}px`);clip.style.setProperty('--shape-radius',radii.map(r=>r+'px').join(' '));
    }
    function finish() {
      gsap.set(el,{clearProps:'width,height,left,top'});
      for(const p of ['width','height','right','bottom','left','top','clip-path','--shape-top','--shape-left','--shape-w','--shape-h','--shape-radius']) clip.style.removeProperty(p);
    }
    if (reduced.matches) { shape.w=width;shape.h=height;finish();return; }
    shape.w=from.width;shape.h=from.height;paint();
    const sideCollapse=mode!=='expanded' && (width<from.width || height<from.height);
    gsap.to(shape, {
      w:width,h:height,duration: sideCollapse ? .55 : mode === 'expanded' ? .8 : .7,
      ease: sideCollapse ? 'power3.inOut' : mode === 'compact' ? 'back.out(1.6)' : 'elastic.out(1,.72)',
      onUpdate:paint,onComplete:finish,
    });
  }
  function panels(el,mode,prev) {
    const vertical=el.classList.contains('vertical');
    const selected=mode==='idle'?(vertical?'.l-vinfo':'.l-info'):mode==='compact'?(vertical?'.l-vcompact':'.l-compact'):mode==='toast'?(vertical?'.l-vtoast':'.l-toast'):mode==='expanded'?'.l-expanded':mode==='peek'?'.l-peek':mode==='reminder'?'.l-reminder':mode==='scene'?'.l-scene':null;
    const selectors=['.l-info','.l-vinfo','.l-compact','.l-vcompact','.l-toast','.l-vtoast','.l-expanded','.l-peek','.l-reminder','.l-scene'];
    for(const selector of selectors) {
      const pane=el.querySelector(selector);if(!pane)continue;
      const on=selector===selected;pane.inert=!on;gsap.killTweensOf(pane);
      if(on)gsap.fromTo(pane,{opacity:0,scale:.9},{opacity:1,scale:1,duration:dur(.42),delay:dur(prev ? .16 : .12),ease:'power3.out',transformOrigin:'50% 0%'});
      else gsap.to(pane,{opacity:0,scale:.94,duration:dur(.14),ease:'power2.in',transformOrigin:'50% 0%'});
    }
  }
  function move(el,x,y,compact=false,from=null) {
    // Position and size must share the same geometric anchor. A separate left
    // tween runs at another speed and makes a centered expansion slide sideways.
    gsap.killTweensOf(el,'left,top');
    gsap.set(el,{clearProps:'left,top'});
  }
  window.FlintMotion = { lensMove, enter, settingsIn, morph, panels, move, clear, press, reduced };
})();
