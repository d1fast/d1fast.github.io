import { initReveal } from './reveal';
import { initCursor } from './cursor';
import { initMagnetic, initScramble } from './interactions';
import { initForm } from './form';
import { initHero } from './hero';
import { initStage } from './stage';

/* Скрипты блоков главной подгружаются, когда блок первый раз приближается к экрану. */
const BLOCKS: Record<string, () => Promise<{ init: (root: HTMLElement) => void }>> = {
  services: () => import('../blocks/services/services'),
  works: () => import('../blocks/works/works'),
  process: () => import('../blocks/process/process'),
  contacts: () => import('../blocks/contacts/contacts'),
};

const loaded = new WeakMap<HTMLElement, Promise<void>>();
/** Подгружает и запускает скрипт блока один раз. Сцена ждёт его перед тем, как открыть блок. */
function ensureBlock(root: HTMLElement) {
  let p = loaded.get(root);
  if (!p) {
    const load = BLOCKS[root.dataset.block || ''];
    p = load ? load().then((m) => m.init(root)).catch(() => {}) : Promise.resolve();
    loaded.set(root, p);
  }
  return p;
}

function initBlocks() {
  const roots = [...document.querySelectorAll<HTMLElement>('[data-block]:not([data-block="hero"])')];
  if (!roots.length) return;
  // Текущий блок сразу, остальные по одному в свободное время браузера.
  roots.filter((r) => r.classList.contains('is-current')).forEach(ensureBlock);
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 600));
  const queue = () => { let i = 0; const next = () => { if (i < roots.length) ensureBlock(roots[i++]).then(() => idle(next)); }; idle(next); };
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (document.documentElement.classList.contains('stage-on') && hero?.classList.contains('is-current')) {
    let started = false;
    const go = () => { if (!started) { started = true; queue(); } };
    document.addEventListener('hero:settled', go, { once: true });
    setTimeout(go, 20000);
  } else queue();
  if (!document.documentElement.classList.contains('stage-on')) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); ensureBlock(e.target as HTMLElement); }
    }, { rootMargin: '35% 0px 35% 0px' });
    roots.forEach((r) => io.observe(r));
  }
}

function init() {
  initStage({ prepare: (b) => (b.dataset.block === 'hero' ? undefined : ensureBlock(b)) });
  initHero();
  initBlocks();
  initReveal();
  initMagnetic();
  initScramble();
  initForm();
}

initCursor();
init();
