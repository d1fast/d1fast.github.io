import { gsap } from 'gsap';
import { watchBlock } from './block';
import type { Garden } from './hero-garden';

export function initHero() {
  const root = document.querySelector<HTMLElement>('[data-hero]');
  const host = root?.querySelector<HTMLElement>('[data-hero-garden]');
  if (!root || !host) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let garden: Garden | undefined, pending: Promise<void> | undefined;
  let active = false, visited = false, touched = false, enteredAt = 0;
  let auto: gsap.core.Tween | undefined;
  let mouse: {x:number;y:number} | undefined;
  const load = () => pending ??= import('./hero-garden').then(({createGarden}) => {
    garden = createGarden(host);
    root.classList.add('has-garden');
    if (reduce.matches) garden.rest(); else if (active && !document.hidden) garden.start(performance.now()-enteredAt < 900);
  }).catch(() => root.classList.add('is-fallback'));
  const cancel = () => { if (!active) return; touched = true; auto?.kill(); auto = undefined; };
  ['pointerdown','wheel','touchstart','keydown','focusin'].forEach((event) => document.addEventListener(event,cancel,{passive:true}));
  document.addEventListener('pointermove',(e) => {
    if (!active || e.pointerType !== 'mouse') return;
    if (Math.hypot(e.movementX,e.movementY)>2 || (mouse && Math.hypot(e.clientX-mouse.x,e.clientY-mouse.y)>12)) cancel();
    mouse ??= {x:e.clientX,y:e.clientY};
  },{passive:true});
  root.addEventListener('pointerdown',(e) => { if (!(e.target as Element).closest('a,button')) garden?.notice(); },{passive:true});
  watchBlock(root,() => {
    active = true; touched = false; mouse = undefined; enteredAt = performance.now();
    void load();
    if (reduce.matches) garden?.rest(); else garden?.start(true);
    if (!visited && !reduce.matches) auto = gsap.delayedCall(12.5,() => {
      if (active && !touched && !document.hidden) root.dispatchEvent(new CustomEvent('block:done'));
    });
    visited = true;
    if (document.hidden) { garden?.stop(); auto?.pause(); }
    gsap.delayedCall(2.5,() => document.dispatchEvent(new CustomEvent('hero:settled')));
    setTimeout(() => { if (!garden) root.classList.add('is-fallback'); },2500);
  },() => { active = false; garden?.stop(); auto?.kill(); });
  document.addEventListener('visibilitychange',() => {
    if (!active) return;
    if (document.hidden) { garden?.stop(); auto?.pause(); }
    else { if (!reduce.matches) { garden?.start(); } auto?.resume(); }
  });
  reduce.addEventListener('change',() => {
    if (reduce.matches) { cancel(); garden?.rest(); }
    else if (active && !document.hidden) garden?.start();
  });
}
