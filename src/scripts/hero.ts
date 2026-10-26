import { gsap } from 'gsap';
import type { Glass } from './hero/glass';

/**
 * Первый экран, чёрно-белый. При входе на сайт полсекунды темноты, проявляется маленький знак «d1fast ©»
 * и гаснет. Посреди экрана загорается искра и начинает рисовать тонкое светящееся кольцо (hero/glass.ts).
 * Фразы стеклянными буквами прилетают к кольцу каждая со своей стороны: «Есть идея?» справа, «Но не знаете,
 * кому её доверить?» снизу. Влетают быстро, у кольца тормозят, стоят, пока их читают, и быстро улетают;
 * на скорости фраза тянется и гнётся. Искра идёт в том же ритме. Последняя фраза («Создаю цифровые продукты»)
 * приходит из глубины, кольцо замыкается и вспыхивает, фраза остаётся заголовком, под ней строка и кнопки.
 * Досмотрели до конца и ничего не трогали: через несколько секунд сцена сама переходит к следующему блоку.
 * При возвращении короткий вход: сразу последняя фраза. Без WebGL: знак, потом заголовок, строка и кнопки.
 * «Уменьшить движение»: фразы только проявляются и гаснут на месте, кольцо загорается целиком.
 */

const IN = 0.6; // влёт: быстро, с долгим торможением
const OUT = 0.4; // улёт: разгон
const HOLD = [1.05, 1.85]; // сколько фраза стоит у кольца; вторую читают дольше
const MARK = 2.2; // темнота и знак до начала рассказа, с
const AUTO = 4.5; // столько финал стоит перед тем, как сцена сама перейдёт дальше, с

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
  let breathe: gsap.core.Tween | null = null;
  let gleam: gsap.core.Tween | null = null;
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
      const g = await createGlass({ canvas, beats, calm, coarse });
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
  const endIn = (delay = 0) => gsap.fromTo(ends, { opacity: 0, y: 16, visibility: 'visible' }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay, overwrite: true });
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
    g.beat.forEach((b) => Object.assign(b, { x: 0, y: 0, z: 0, on: 0, deep: 0, twist: 0, roll: 0, flex: 1, sheen: -3 }));
    Object.assign(g.ring, { draw: 0, head: 0, spark: 0, glow: 0, pulse: 0 });
    g.idle(false);
    breathe?.kill(); breathe = null;
    gleam?.kill(); gleam = null;
  };
  /** финальная фраза дышит: чуть подаётся к зрителю и обратно, изредка по ней проходит блик */
  const breatheOn = (g: Glass) => {
    breathe?.kill(); gleam?.kill();
    if (calm) return;
    breathe = gsap.to(g.beat[N - 1], { z: 14, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gleam = gsap.fromTo(g.beat[N - 1], { sheen: -1.8 }, { sheen: 1.8, duration: 1.4, ease: 'power1.inOut', repeat: -1, repeatDelay: 5, delay: 3 });
  };
  /** фразы по очереди; withMark: перед ними темнота и знак (вход на сайт) */
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
      // темнота, потом знак проявляется из размытия и гаснет. Это CSS-анимация: она идёт плавно,
      // даже если в это время главный поток собирает буквы
      hero.classList.remove('is-marking');
      void hero.offsetWidth;
      hero.classList.add('is-marking');
    }
    // стекло ещё грузится: знак подождёт (на медленной связи), но не бесконечно
    const g = await Promise.race([ready, new Promise<null>((r) => setTimeout(() => r(null), withMark ? 9000 : 3000))]);
    if (id !== run) return;
    if (!g) { hero.classList.remove('is-marking'); showFinal(); return; }
    const left = withMark ? Math.max(0, MARK - (performance.now() - t0) / 1000) : 0;
    const t = gsap.timeline({ delay: left });
    tl = t;
    beatsInto(t, 0);
  }
  /** фразы на таймлайн t начиная с момента at (в секундах таймлайна) */
  function beatsInto(t: gsap.core.Timeline, at: number) {
    const g = glass!;
    g.layout(finalBox());
    reset(g);
    const { w: W, h: H } = g.size;
    const R = g.ring;
    t.call(() => g.start(), [], at);
    t.to(g.bd, { fade: 1, light: 1, duration: 0.9, ease: 'power2.out' }, at);
    // искра загорается наверху кольца
    t.to(R, { spark: 1, glow: 0.85, duration: 0.45, ease: 'power2.out' }, at);
    if (calm) {
      // без движения: фразы проявляются и гаснут на месте, кольцо загорается целиком
      let s = at + 0.3;
      t.set(R, { draw: 1, head: 0.12 }, at);
      for (let k = 0; k < N; k++) {
        const b = g.beat[k];
        t.to(b, { on: 1, duration: 0.6, ease: 'power1.out' }, s);
        if (k === N - 1) { t.call(() => { endIn(); chrome(true); }, [], s + 0.3); t.call(() => { settle(); arm(); }, [], s + 0.8); break; }
        t.to(b, { on: 0, duration: 0.5, ease: 'power1.in' }, s + 0.6 + HOLD[k] + 0.4);
        s += 0.6 + HOLD[k] + 0.9;
      }
      return;
    }
    let s = at + 0.25;
    // 1. справа: влетает издалека по дуге, тормозит у кольца, улетает влево и вниз
    const b1 = g.beat[0], h1 = g.half(0);
    const X1 = W / 2 + h1.w * 2.6 + 80;
    t.fromTo(b1, { x: X1, y: H * 0.07, z: -380, roll: -0.06, on: 0 }, { x: 0, y: 0, z: 0, roll: 0, duration: IN, ease: 'expo.out', immediateRender: false }, s);
    t.to(b1, { on: 1, duration: 0.1, ease: 'none' }, s);
    t.to(R, { draw: 0.3, head: 0.3, duration: IN, ease: 'expo.out' }, s);
    // стоит: медленно смещается и подаётся к зрителю, искра почти стоит
    t.to(b1, { x: -W * 0.018, z: 34, duration: HOLD[0] + IN * 0.3, ease: 'sine.inOut' }, s + IN * 0.7);
    t.to(R, { draw: 0.335, head: 0.335, duration: HOLD[0], ease: 'sine.inOut' }, s + IN);
    let x = s + IN * 0.7 + HOLD[0] + IN * 0.3;
    t.to(b1, { x: -X1, y: -H * 0.06, z: -160, roll: 0.05, duration: OUT, ease: 'power3.in' }, x);
    t.to(b1, { on: 0, duration: 0.1, ease: 'none' }, x + OUT - 0.1);
    t.to(R, { draw: 0.4, head: 0.4, duration: OUT, ease: 'power2.in' }, x);

    // 2. снизу: поднимается волной, строки выгибаются дугой; стоит дольше, искра тускнеет (сомнение); улетает вверх
    s = x + OUT * 0.6;
    const b2 = g.beat[1], h2 = g.half(1);
    const Y2 = H / 2 + h2.h * 2.4 + 80;
    t.fromTo(b2, { x: W * 0.04, y: -Y2, z: -300, roll: 0.05, on: 0 }, { x: 0, y: 0, z: 0, roll: 0, duration: IN, ease: 'expo.out', immediateRender: false }, s);
    t.to(b2, { on: 1, duration: 0.1, ease: 'none' }, s);
    t.to(R, { draw: 0.62, head: 0.62, duration: IN, ease: 'expo.out' }, s);
    t.to(b2, { y: H * 0.012, z: 30, duration: HOLD[1] + IN * 0.3, ease: 'sine.inOut' }, s + IN * 0.7);
    t.to(R, { draw: 0.65, head: 0.65, duration: HOLD[1], ease: 'sine.inOut' }, s + IN);
    t.to(R, { spark: 0.45, glow: 0.55, duration: 0.8, ease: 'sine.inOut' }, s + IN * 0.8);
    x = s + IN * 0.7 + HOLD[1] + IN * 0.3;
    t.to(b2, { y: Y2, x: -W * 0.03, z: -140, roll: -0.04, duration: OUT, ease: 'power3.in' }, x);
    t.to(b2, { on: 0, duration: 0.1, ease: 'none' }, x + OUT - 0.1);
    t.to(R, { draw: 0.7, head: 0.7, spark: 1, glow: 0.85, duration: OUT, ease: 'power2.in' }, x);

    // 3. из глубины, из-за кольца: буквы приходят по очереди и разворачиваются к зрителю, кольцо замыкается
    s = x + OUT * 0.55;
    const b3 = g.beat[N - 1];
    t.fromTo(b3, { x: 0, y: -H * 0.02, z: -2600, deep: 1400, twist: 1.25, roll: 0.05, on: 0, flex: 0 },
      { y: 0, z: 0, deep: 0, twist: 0, roll: 0, duration: 1.15, ease: 'expo.out', immediateRender: false }, s);
    t.to(b3, { on: 1, duration: 0.35, ease: 'power1.out' }, s);
    t.to(R, { draw: 1, head: 1, duration: 0.95, ease: 'expo.out' }, s);
    t.fromTo(R, { pulse: 0 }, { pulse: 1, duration: 1.2, ease: 'power2.out', immediateRender: false }, s + 0.38);
    t.to(R, { glow: 1.3, duration: 0.22, ease: 'power2.out' }, s + 0.38);
    t.to(R, { glow: 1, spark: 0.7, duration: 1.1, ease: 'sine.inOut' }, s + 0.62);
    t.fromTo(b3, { sheen: -1.8 }, { sheen: 1.8, duration: 1.2, ease: 'power1.inOut', immediateRender: false }, s + 0.55);
    t.call(() => { endIn(); chrome(true); }, [], s + 0.5);
    t.call(() => { settle(); arm(); g.idle(true); breatheOn(g); }, [], s + 1.2);
  }
  /** короткий вход при возвращении: сразу последняя фраза, кольцо уже целое */
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
    const b = g.beat[N - 1];
    const t = gsap.timeline();
    tl = t;
    t.to(g.bd, { fade: 1, light: 1, duration: 0.6, ease: 'power2.out' }, 0);
    t.fromTo(g.ring, { draw: 1, head: 0.85, glow: 0, spark: 0 }, { glow: 1, spark: 0.7, head: 1, duration: 0.9, ease: 'power2.out' }, 0);
    if (calm) t.to(b, { on: 1, duration: 0.6 }, 0.1);
    else {
      t.fromTo(b, { z: -1500, deep: 700, twist: 0.9, on: 0, flex: 0 }, { z: 0, deep: 0, twist: 0, duration: 0.95, ease: 'expo.out' }, 0.1);
      t.to(b, { on: 1, duration: 0.3, ease: 'power1.out' }, 0.1);
      t.fromTo(g.ring, { pulse: 0 }, { pulse: 1, duration: 1.1, ease: 'power2.out', immediateRender: false }, 0.3);
    }
    t.call(() => endIn(), [], 0.45);
    t.call(() => { settle(); g.idle(true); breatheOn(g); }, [], 1.05);
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
      Object.assign(g.beat[N - 1], { on: 1 });
      Object.assign(g.ring, { draw: 1, head: 1, glow: 1, spark: 0.7 });
      Object.assign(g.bd, { fade: 1, light: 1 });
      g.idle(true);
    });
  }

  // до запуска сцены всё спрятано (без скрипта видно заголовок, строку и кнопки)
  endHide();

  /* ---------- уход и возвращение ---------- */
  hero.addEventListener('block:leave', () => {
    run++;
    tl?.kill(); tl = null;
    breathe?.kill(); breathe = null;
    gleam?.kill(); gleam = null;
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

  /* ---------- указатель: фразы чуть поворачиваются за ним, искра на целом кольце тянется к нему ---------- */
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !glass) return;
    const r = hero.getBoundingClientRect();
    glass.pointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1, true);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => glass?.pointer(0, 0, false));

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => { glass?.layout(finalBox()); }, 120);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!glass || !isOpen()) return;
    if (document.hidden) { glass.stop(); tl?.pause(); breathe?.pause(); gleam?.pause(); } else { glass.start(); tl?.resume(); breathe?.resume(); gleam?.resume(); }
  });

  // для проверки скриншотами: перемотка рассказа на нужную секунду (только в режиме разработки)
  if (import.meta.env.DEV) (window as unknown as { __hero: object }).__hero = { seek: (s: number) => { tl?.pause(); tl?.seek(s, false); }, time: () => tl?.time() ?? -1, dur: () => tl?.duration() ?? -1 };

  /* ---------- запуск: после того, как сцена отметила текущий блок (initStage идёт следом) ---------- */
  queueMicrotask(() => {
    if (isOpen()) {
      if (!glOk) {
        chrome(false);
        hero.classList.add('is-marking');
        gsap.delayedCall(MARK, () => { played = true; showFinal(); arm(); });
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
