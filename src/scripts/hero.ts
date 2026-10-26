import { gsap } from 'gsap';
import type { Glass } from './hero/glass';

/**
 * Первый экран, чёрно-белый. При входе на сайт секунду чёрный экран, потом проявляется маленький знак «d1fast ©»
 * и гаснет. Дальше фразы стеклянными буквами по очереди въезжают по цилиндру справа, подлетают к зрителю,
 * стоят, пока их читают, и быстро и плавно уезжают влево (hero/glass.ts). С третьей фразой («Я Сава») за стеклом
 * проявляется фото. Последняя фраза остаётся заголовком по центру, под ней строка обо мне и кнопки.
 * Досмотрели до конца и ничего не трогали: через несколько секунд сцена сама переходит к следующему блоку.
 * При возвращении на экран короткий вход: сразу последняя фраза. Без WebGL тот же рассказ обычным текстом не идёт:
 * знак, потом заголовок, строка и кнопки. «Уменьшить движение»: без поворотов и подлёта, только проявление.
 */

// сколько фраза стоит перед зрителем, с; вторую («кому доверить?») читают дольше
const HOLD = [1.25, 2.3, 1.9];
const IN = 1.15; // въезд
const OUT = 0.72; // уезд
const AUTO = 6.5; // столько финал стоит перед тем, как сцена сама перейдёт дальше, с

export function initHero() {
  const found = document.querySelector<HTMLElement>('[data-hero]');
  if (!found || found.classList.contains('is-bound')) return;
  const hero: HTMLElement = found;
  hero.classList.add('is-bound');
  const html = document.documentElement;
  const beats: string[][] = JSON.parse(hero.dataset.beats || '[]');
  const canvas = hero.querySelector<HTMLCanvasElement>('[data-hero-gl]')!;
  const slot = hero.querySelector<HTMLElement>('[data-hero-slot]')!;
  const title = hero.querySelector<HTMLElement>('[data-hero-title]')!;
  const ends = [hero.querySelector<HTMLElement>('[data-hero-sub]'), ...hero.querySelectorAll<HTMLElement>('[data-hero-cta] > *')].filter(Boolean) as HTMLElement[];
  const cta = hero.querySelector<HTMLElement>('[data-hero-cta]');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const staged = () => html.classList.contains('stage');
  const isOpen = () => !staged() || hero.classList.contains('is-current');
  const N = beats.length;

  let glass: Glass | null = null;
  let failed = false;
  let played = false; // полный рассказ уже видели
  let tl: gsap.core.Timeline | null = null;
  let autoT: gsap.core.Tween | null = null;
  let touched = false;

  /* ---------- стекло: модуль с three.js грузится сразу, пока экран чёрный ---------- */
  const glOk = (() => {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    g?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!g;
  })();
  const finalBox = () => {
    const h = hero.getBoundingClientRect(), s = slot.getBoundingClientRect();
    return { cx: s.left - h.left + s.width / 2, cy: s.top - h.top + s.height / 2, w: s.width, h: s.height };
  };
  const ready: Promise<Glass | null> = !glOk ? Promise.resolve(null) : (async () => {
    try {
      const fonts = document.fonts?.ready ?? Promise.resolve();
      await Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]);
      const { createGlass } = await import('./hero/glass');
      const g = await createGlass({ canvas, beats, photo: hero.dataset.photo || '', calm, coarse });
      g.layout(finalBox());
      g.warm();
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); g.stop(); glass = null; failed = true; hero.classList.remove('is-glass'); showFinal(true); }, { once: true });
      glass = g;
      hero.classList.add('is-glass');
      return g;
    } catch { failed = true; return null; }
  })();

  /* ---------- финал: строка и кнопки, шапка и точки ---------- */
  const endHide = () => { gsap.killTweensOf(ends); gsap.set(ends, { opacity: 0, y: 16, visibility: 'hidden' }); };
  const endIn = (delay = 0) => gsap.fromTo(ends, { opacity: 0, y: 16, visibility: 'visible' }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.09, delay, overwrite: true });
  const chrome = (on: boolean) => html.classList.toggle('is-intro', !on);
  const settle = () => { hero.classList.add('is-final'); document.dispatchEvent(new CustomEvent('hero:settled')); };
  /** без стекла: заголовок обычным текстом */
  function showFinal(instant = false) {
    hero.classList.add('is-flat');
    gsap.killTweensOf(title);
    if (instant) gsap.set(title, { opacity: 1, y: 0 });
    else gsap.fromTo(title, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out' });
    endIn(instant ? 0 : 0.35);
    chrome(true);
    settle();
  }

  /* ---------- досмотрели: сцена сама переходит дальше ---------- */
  const arm = () => {
    autoT?.kill();
    if (calm || touched || !staged()) return;
    autoT = gsap.delayedCall(AUTO, () => { if (!touched && hero.classList.contains('is-current')) hero.dispatchEvent(new CustomEvent('block:done')); });
  };
  const touch = () => { touched = true; autoT?.kill(); };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => hero.addEventListener(t, touch, { passive: true }));
  cta?.addEventListener('pointerenter', touch);
  cta?.addEventListener('focusin', touch);

  /* ---------- сценарии ---------- */
  const reset = (g: Glass) => {
    g.beat.forEach((b, k) => Object.assign(b, { rot: g.span(k) + 1.3, push: 0, on: 0 }));
  };
  /** фразы по очереди; withMark: перед ними чёрный экран и знак (вход на сайт) */
  let run = 0;
  async function story(withMark: boolean) {
    const id = ++run;
    tl?.kill(); tl = null;
    played = true;
    hero.classList.remove('is-final');
    endHide();
    chrome(!withMark);
    const t0 = performance.now();
    if (withMark) {
      // секунда темноты, потом знак проявляется из размытия и гаснет. Это CSS-анимация: она идёт плавно,
      // даже если в это время главный поток собирает буквы
      hero.classList.remove('is-marking');
      void hero.offsetWidth;
      hero.classList.add('is-marking');
    }
    // стекло ещё грузится: знак подождёт (на медленной связи), но не бесконечно
    const g = await Promise.race([ready, new Promise<null>((r) => setTimeout(() => r(null), withMark ? 9000 : 3000))]);
    if (id !== run) return;
    if (!g) { hero.classList.remove('is-marking'); showFinal(); return; }
    const left = withMark ? Math.max(0, 3.05 - (performance.now() - t0) / 1000) : 0;
    const t = gsap.timeline({ delay: left });
    tl = t;
    beatsInto(t, 0);
  }
  /** фразы на таймлайн t начиная с момента at (в секундах таймлайна) */
  function beatsInto(t: gsap.core.Timeline, at: number) {
    const g = glass!;
    g.layout(finalBox());
    reset(g);
    // кадры рисуются с началом рассказа, пока идёт знак видеокарта свободна
    t.call(() => g.start(), [], at);
    t.to(g.bd, { fade: 1, light: 1, duration: 1.4, ease: 'power2.out' }, at);
    let s = at + 0.2;
    for (let k = 0; k < N; k++) {
      const b = g.beat[k], last = k === N - 1, photo = k === N - 2;
      const from = g.span(k) + 0.55;
      t.fromTo(b, { rot: calm ? 0 : from, push: calm ? 0 : -0.16, on: 0 }, { rot: 0, push: 0, duration: calm ? 0.01 : IN, ease: 'power3.out', immediateRender: false }, s);
      t.to(b, { on: 1, duration: calm ? 0.8 : 0.55, ease: 'power1.out' }, s);
      t.to(g.view, { cy: g.slotY(k), duration: k ? IN : 0.01, ease: 'power3.inOut' }, k ? s - 0.25 : s);
      if (photo) t.fromTo(g.bd, { photo: 0 }, { photo: 1, duration: 2, ease: 'power2.out', immediateRender: false }, s + 0.05);
      if (last) {
        t.call(() => { endIn(); chrome(true); }, [], s + IN * 0.6);
        t.call(() => { settle(); arm(); }, [], s + IN + 0.4);
        break;
      }
      const hold = HOLD[k] ?? 1.6;
      // пока фразу читают, она медленно подлетает ближе
      if (!calm) t.to(b, { push: 0.045, duration: hold + IN * 0.45, ease: 'sine.inOut' }, s + IN * 0.55);
      const x = s + IN * 0.8 + hold;
      // уезжает быстро и плавно: разгон без рывка, гаснет у края цилиндра
      t.to(b, { rot: calm ? 0 : -(g.span(k) + 0.5), push: calm ? 0 : -0.08, duration: OUT, ease: 'power2.in' }, x);
      t.to(b, { on: 0, duration: calm ? 0.5 : OUT * 0.75, ease: 'power1.in' }, x + (calm ? 0 : OUT * 0.25));
      if (photo) t.to(g.bd, { photo: 0, duration: 0.9, ease: 'power2.in' }, x - 0.05);
      s = x + (calm ? 0.55 : OUT * 0.5);
    }
  }
  /** короткий вход при возвращении: сразу последняя фраза */
  async function brief() {
    const id = ++run;
    tl?.kill(); tl = null;
    // стекло ещё собирается (вернулись сразу после загрузки): немного подождать, иначе заголовок текстом
    const g = glass ?? await Promise.race([ready, new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
    if (id !== run) return;
    if (!g) { showFinal(true); return; }
    hero.classList.remove('is-final');
    endHide();
    chrome(true);
    g.layout(finalBox());
    reset(g);
    g.start();
    const k = N - 1, b = g.beat[k];
    const t = gsap.timeline();
    tl = t;
    t.set(g.view, { cy: g.slotY(k) }, 0);
    t.to(g.bd, { fade: 1, light: 1, photo: 0, duration: 0.6, ease: 'power2.out' }, 0);
    t.fromTo(b, { rot: calm ? 0 : g.span(k) + 0.55, push: calm ? 0 : -0.16, on: 0 }, { rot: 0, push: 0, duration: calm ? 0.01 : IN, ease: 'power3.out' }, 0.15);
    t.to(b, { on: 1, duration: 0.55, ease: 'power1.out' }, 0.15);
    t.call(() => endIn(), [], 0.15 + IN * 0.55);
    t.call(settle, [], 0.15 + IN);
  }
  /** финал сразу, без анимации: блок открыт не первым */
  function still() {
    run++;
    tl?.kill();
    chrome(true);
    hero.classList.remove('is-marking');
    gsap.set(ends, { opacity: 1, y: 0, visibility: 'visible' });
    hero.classList.add('is-final');
    ready.then((g) => {
      if (!g) { if (failed || !glOk) showFinal(true); return; }
      reset(g);
      const k = N - 1;
      Object.assign(g.beat[k], { rot: 0, push: 0, on: 1 });
      Object.assign(g.bd, { fade: 1, light: 1, photo: 0 });
      g.view.cy = g.slotY(k);
    });
  }

  // до запуска сцены всё спрятано (без скрипта видно заголовок, строку и кнопки)
  endHide();

  /* ---------- уход и возвращение ---------- */
  hero.addEventListener('block:leave', () => {
    run++;
    tl?.kill(); tl = null;
    autoT?.kill();
    glass?.stop();
    hero.classList.remove('is-marking');
    chrome(true);
    if (!hero.classList.contains('is-final')) settle();
  });
  (hero as HTMLElement & { _reenter?: () => void })._reenter = () => {
    touched = true; // вернулись сами: дальше сцена сама не листает
    if (!played && glass) { story(false); return; }
    void brief();
  };

  /* ---------- мышь: цилиндр чуть поворачивается за курсором ---------- */
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !glass) return;
    const r = hero.getBoundingClientRect();
    glass.pointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1, true);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => glass?.pointer(0, 0, false));

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      if (!glass) return;
      glass.layout(finalBox());
      // фраза, которая сейчас стоит, остаётся на своей высоте
      const k = glass.beat.findIndex((b) => b.on > 0.5 && Math.abs(b.rot) < 0.2);
      if (k >= 0 && !gsap.isTweening(glass.view)) glass.view.cy = glass.slotY(k);
    }, 120);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!glass || !isOpen()) return;
    if (document.hidden) { glass.stop(); tl?.pause(); } else { glass.start(); tl?.resume(); }
  });

  // для проверки скриншотами: перемотка рассказа на нужную секунду (только в режиме разработки)
  if (import.meta.env.DEV) (window as unknown as { __hero: object }).__hero = { seek: (s: number) => { tl?.pause(); tl?.seek(s, false); }, time: () => tl?.time() ?? -1, dur: () => tl?.duration() ?? -1 };

  /* ---------- запуск: после того, как сцена отметила текущий блок (initStage идёт следом) ---------- */
  queueMicrotask(() => {
    if (isOpen()) {
      if (!glOk) {
        chrome(false);
        hero.classList.add('is-marking');
        gsap.delayedCall(3.05, () => { played = true; showFinal(); arm(); });
      } else void story(true);
    } else {
      still();
      document.dispatchEvent(new CustomEvent('hero:settled'));
    }
  });
}

export function heroReenter(hero: HTMLElement) {
  (hero as HTMLElement & { _reenter?: () => void })._reenter?.();
}
