(() => {
  const wall = document.createElement('div'); wall.id = 'flint-wall'; wall.innerHTML = window.FlintWall('prefs-wall'); document.body.prepend(wall);
  const side = document.querySelector('.side'), nav = document.createElement('i'); nav.className = 'nav-lens'; nav.setAttribute('aria-hidden', 'true'); side.prepend(nav);
  const surfaces = new Map();
  let active = false;
  const dirty=new Set();
  let navGeometry='';
  function schedule(){if(!active && !document.hidden && dirty.size){active=true;requestAnimationFrame(frame);}}
  const resize=new ResizeObserver(entries=>{entries.forEach(e=>dirty.add(e.target));schedule();});
  function wake() {for(const pane of surfaces.keys())if(pane.getClientRects().length)dirty.add(pane);schedule();}
  function frame() {
    if(document.hidden){active=false;return;}
    let n=0;
    for(const pane of dirty){dirty.delete(pane);surfaces.get(pane)?.update();if(++n>=2)break;}
    if(dirty.size)requestAnimationFrame(frame);else active=false;
  }
  function refresh() {
    document.querySelectorAll('.titlebar,.side,.page.on .card,.page.on .chip').forEach(pane => {
      if (!surfaces.has(pane)) {
        surfaces.set(pane, window.FlintGlass.create(document.body, pane, wake, { pane, backdrop: true, asyncMap: true, kind: pane.matches('.card,.chip') ? 'card' : 'chrome', cacheLimit: 3 }));
        resize.observe(pane);
      }
    });
    const target=side.querySelector('a.on');
    const key=target?`${target.offsetLeft},${target.offsetTop},${target.offsetWidth},${target.offsetHeight}`:'';
    if(key!==navGeometry){navGeometry=key;window.FlintMotion.lensMove(nav, side, target, true, 'y', 18);}
    wake();
  }
  document.querySelectorAll('.seg').forEach(seg => {
    const lens = document.createElement('i'); lens.className = 'prefs-lens'; lens.setAttribute('aria-hidden', 'true'); seg.prepend(lens);
  });
  function controls() {
    document.querySelectorAll('.seg').forEach(seg => window.FlintMotion.lensMove(seg.querySelector('.prefs-lens'), seg, seg.querySelector('button[aria-checked="true"]')));
    refresh();
  }
  const names = ['ash','sand','sage','aurora','smoke','tide','bloom','ember','grove','dusk'];
  const options = document.querySelector('#wall-options');
  names.forEach((name,i) => {
    const b = document.createElement('button'); b.className = 'wall-choice'; b.dataset.wall = name; b.dataset.appearance = 'wall'; b.dataset.value = name;
    b.setAttribute('aria-label', name); b.innerHTML = window.FlintWall(`choice-${i}`) + `<span>${name[0].toUpperCase()+name.slice(1)}</span>`;
    options.append(b);
  });
  window.addEventListener('resize', controls);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)wake();});
  window.addEventListener('pagehide',()=>resize.disconnect(),{once:true});
  window.FlintMotion.press();
  window.PrefsGlass = { refresh, controls };
})();
