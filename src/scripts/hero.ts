import { watchBlock } from './block';
import type { Sculpture } from './hero-sculpture';

export function initHero() {
  const root = document.querySelector<HTMLElement>('[data-hero]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-hero-canvas]');
  if (!root || !canvas) return;
  let active = false;
  let sculpture: Sculpture | undefined;
  let pending: Promise<void> | undefined;
  const load = () => pending ??= import('./hero-sculpture').then(({ createSculpture }) => {
    sculpture = createSculpture(canvas);
    if (active) sculpture.start();
    root.classList.add('has-sculpture');
  }).catch(() => { /* Статичный объект остаётся видимым, если WebGL недоступен. */ });
  watchBlock(root, () => {
    active = true;
    void load();
    sculpture?.start();
    document.dispatchEvent(new CustomEvent('hero:settled'));
  }, () => { active = false; sculpture?.stop(); });
  root.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    sculpture?.point((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: true });
  root.addEventListener('pointerleave', () => sculpture?.point(.5, .5));
  root.addEventListener('pointerdown', (e) => {
    if (!(e.target as Element).closest('a,button')) sculpture?.push();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sculpture?.stop(); else if (active) sculpture?.start();
  });
}
