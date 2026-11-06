import { gsap } from 'gsap';
import { watchBlock } from './block';
import type { Garden } from './hero-garden';

export function initHero() {
  const root = document.querySelector<HTMLElement>('[data-hero]');
  const host = root?.querySelector<HTMLElement>('[data-hero-garden]');
  if (!root || !host) return;
  let garden: Garden | undefined, pending: Promise<void> | undefined;
  let active = false, visited = false, touched = false;
  let auto: gsap.core.Tween | undefined;
  let mouse: {x:number;y:number} | undefined;
  const load = () => pending ??= import('./hero-garden').then(({createGarden}) => {
    garden = createGarden(host);
    root.classList.add('has-garden');
    if (active && !document.hidden) garden.start(true);
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
    active = true; touched = false; mouse = undefined;
    void load();
    garden?.start(true);
    if (!visited) auto = gsap.delayedCall(12.5,() => {
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
    else { garden?.start(); auto?.resume(); }
  });
}
