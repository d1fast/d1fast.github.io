import { initReveal } from './reveal';
import { initCursor } from './cursor';
import { initMagnetic, initScramble, initActiveItems, initMarquee, initCopy, initTilt } from './interactions';
import { initForm } from './form';
import { initHero, heroReenter } from './hero';
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
  // текущий блок сразу, остальные по одному, когда браузер свободен. Пока на первом экране идёт рассказ,
  // их не трогаем: сборка блоков заняла бы главный поток, и заставка дёргалась бы
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
  initHero();
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  hero?.addEventListener('block:enter', (e) => { if (!(e as CustomEvent).detail?.first) heroReenter(hero); });
  initStage({ prepare: (b) => (b.dataset.block === 'hero' ? undefined : ensureBlock(b)) });
  initBlocks();
  initReveal();
  initMagnetic();
  initScramble();
  initActiveItems();
  initMarquee();
  initCopy();
  initTilt();
  initForm();
}

initCursor();
init();
