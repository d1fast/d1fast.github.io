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
 * При возвращении короткий вход: сразу последняя фраза. Без WebGL (выключено ускорение, старая видеокарта) тот же
 * рассказ идёт обычным текстом: фразы летят теми же путями и тянутся на скорости, кольцо рисуется линией SVG.
 * Движение одно для всех: системная настройка «уменьшить движение» его не выключает (так решил владелец сайта).
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
  let flatOnly = false; // рассказ пошёл обычным текстом: стекло, даже если догрузится, не включается

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
      const g = await createGlass({ canvas, beats, coarse });
      g.layout(finalBox());
      g.warm();
      // стекло пришло, когда рассказ уже идёт обычным текстом (медленная связь): остаётся текст
      if (flatOnly) { g.dispose(); return null; }
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); g.stop(); glass = null; failed = true; hero.classList.remove('is-glass'); showFinal(true); }, { once: true });
      glass = g;
      hero.classList.add('is-glass');
      return g;
    } catch { failed = true; return null; }
  })();

  /** стекло: готовое сразу, иначе ждать не дольше ms; нет, если оно сломалось или рассказ уже идёт текстом */
  const glassIn = (ms: number): Promise<Glass | null> => glass ? Promise.resolve(glass) : failed || flatOnly ? Promise.resolve(null)
    : Promise.race([ready, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

  /* ---------- финал: строка и кнопки, шапка и точки ---------- */
  const endHide = () => { gsap.killTweensOf(ends); gsap.set(ends, { opacity: 0, y: 16, visibility: 'hidden' }); };
  const endIn = (delay = 0) => gsap.fromTo(ends, { opacity: 0, y: 16, visibility: 'visible' }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay, overwrite: true });
  const chrome = (on: boolean) => html.classList.toggle('is-intro', !on);
  const settle = () => { hero.classList.add('is-final'); document.dispatchEvent(new CustomEvent('hero:settled')); };
  /* ---------- без WebGL: тот же рассказ обычным текстом. Фразы летят теми же путями, на скорости тянутся
     и выгибаются дугой по буквам; кольцо рисуется линией SVG, искра бежит по нему ---------- */
  const ringBox = hero.querySelector<SVGSVGElement>('[data-hero-ring]');
  const ringLine = hero.querySelector<SVGCircleElement>('[data-hero-line]');
  const pulseC = hero.querySelector<SVGCircleElement>('[data-hero-pulse]');
  const orbit = hero.querySelector<HTMLElement>('[data-hero-orbit]');
  const ring = { d: 1 }; // нарисованная доля кольца
  let ringLen = 0;
  const paintRing = () => {
    if (ringLine) ringLine.style.strokeDashoffset = String(ringLen * (1 - ring.d));
    if (orbit) gsap.set(orbit, { rotation: ring.d * 360 });
  };
  /** кольцо в пикселях экрана: длина и толщина линии одинаковы во всех браузерах */
  const fitRing = () => {
    const S = ringBox?.getBoundingClientRect().width ?? 0;
    if (!ringBox || !ringLine || S < 2) return;
    const c = S / 2, r = c - 1;
    ringBox.setAttribute('viewBox', `0 0 ${S} ${S}`);
    ringBox.querySelectorAll('circle').forEach((el) => { el.setAttribute('cx', String(c)); el.setAttribute('cy', String(c)); el.setAttribute('r', String(r)); });
    ringLine.setAttribute('transform', `rotate(-90 ${c} ${c})`);
    ringLen = 2 * Math.PI * r;
    ringLine.style.strokeDasharray = `${ringLen} ${ringLen}`;
    paintRing();
  };
  let orbitSpin: gsap.core.Tween | null = null;
  /** кольцо целое, искра сама обходит его */
  const flatIdle = () => {
    orbitSpin?.kill(); orbitSpin = null;
    fitRing();
    ring.d = 1; paintRing();
    if (ringBox) gsap.set(ringBox, { opacity: 1 });
    if (!orbit) return;
    gsap.set(orbit, { autoAlpha: 1 });
    if (isOpen()) orbitSpin = gsap.to(orbit, { rotation: '+=360', duration: 11, ease: 'none', repeat: -1 });
  };
  /** строки фразы → слова (не рвутся) → буквы; у каждой буквы место по ширине фразы: от −1 (левый край) до 1 */
  const U = new WeakMap<Element, number>();
  const split = (p: HTMLElement) => {
    const cs: HTMLElement[] = [];
    for (const line of [...p.children]) {
      const words = (line.textContent ?? '').split(' ');
      line.textContent = '';
      words.forEach((wd, i) => {
        if (i) line.append(' ');
        const w = document.createElement('span');
        w.className = 'hero__w';
        for (const ch of wd) {
          const c = document.createElement('span');
          c.className = 'hero__ch';
          c.textContent = ch;
          w.append(c);
          cs.push(c);
        }
        line.append(w);
      });
    }
    const hw = p.offsetWidth / 2 || 1;
    cs.forEach((c) => U.set(c, Math.max(-1, Math.min(1, (c.offsetLeft + c.offsetWidth / 2 - hw) / hw))));
    return cs;
  };
  /** изгиб дугой: k > 0 — середина фразы выше краёв на k px, k < 0 — ниже; буквы повёрнуты по касательной */
  const archY = (k: number) => (_: number, el: Element) => { const u = U.get(el) ?? 0; return -k * (1 - u * u); };
  const archR = (k: number, hw: number) => (_: number, el: Element) => (Math.atan2(2 * k * (U.get(el) ?? 0), hw) * 180) / Math.PI;
  let flat: { beats: HTMLElement[]; chars: HTMLElement[][]; title: HTMLElement[] } | null = null;
  const makeFlat = () => {
    if (flat) return flat;
    const s = slot.getBoundingClientRect();
    const narrow = innerWidth < innerHeight * 0.9 || s.width < s.height * 1.7; // как у стекла: узко — фразы по словам в строки
    const bs = beats.slice(0, -1).map((lines) => {
      const p = document.createElement('p');
      p.className = 'hero__beat';
      p.setAttribute('aria-hidden', 'true');
      (narrow ? lines.flatMap((l) => l.split('|')) : lines.map((l) => l.replace(/\|/g, ' '))).forEach((l) => {
        const sp = document.createElement('span');
        sp.textContent = l;
        p.append(sp);
      });
      slot.append(p);
      return p;
    });
    flat = { beats: bs, chars: bs.map(split), title: split(title) };
    return flat;
  };
  /** рассказ обычным текстом на таймлайн t, в том же ритме, что и стекло */
  function flatInto(t: gsap.core.Timeline) {
    flatOnly = true;
    hero.classList.add('is-flat');
    const W = innerWidth, H = innerHeight;
    const { beats: [b1, b2], chars: [c1 = [], c2 = []], title: c3 } = makeFlat();
    orbitSpin?.kill(); orbitSpin = null;
    fitRing();
    ring.d = 0; paintRing();
    gsap.set(title, { opacity: 0 });
    if (pulseC) gsap.set(pulseC, { opacity: 0, scale: 1, transformOrigin: '50% 50%' });
    const R = { onUpdate: paintRing };
    if (ringBox) t.fromTo(ringBox, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0);
    if (orbit) t.fromTo(orbit, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'power2.out' }, 0);
    let s = 0.25;
    // 1. справа: влетает вытянутой и выгнутой дугой, у кольца тормозит и распрямляется, стоит;
    //    улетает влево, снова тянется и выгибается в другую сторону
    const hw1 = (b1?.offsetWidth ?? 2) / 2, A1 = Math.min(H * 0.12, hw1 * 0.5);
    if (b1) {
      t.fromTo(b1, { x: W * 0.8, y: H * 0.06, scaleX: 2.3, scaleY: 0.85, skewX: -10, opacity: 0, transformOrigin: '0% 50%' },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, skewX: 0, opacity: 1, duration: IN, ease: 'expo.out', immediateRender: false }, s);
      t.fromTo(c1, { y: archY(A1), rotation: archR(A1, hw1) }, { y: 0, rotation: 0, duration: IN + 0.2, ease: 'expo.out', stagger: 0.012, immediateRender: false }, s);
      t.to(b1, { x: -W * 0.018, scale: 1.04, duration: HOLD[0] + IN * 0.3, ease: 'sine.inOut' }, s + IN * 0.7);
    }
    t.to(ring, { d: 0.3, duration: IN, ease: 'expo.out', ...R }, s);
    t.to(ring, { d: 0.335, duration: HOLD[0], ease: 'sine.inOut', ...R }, s + IN);
    let x = s + IN * 0.7 + HOLD[0] + IN * 0.3;
    if (b1) {
      t.to(b1, { x: -W * 0.8, y: -H * 0.05, scaleX: 2.3, scaleY: 0.85, skewX: 10, opacity: 0, duration: OUT, ease: 'power3.in' }, x);
      t.to(c1, { y: archY(-A1), rotation: archR(-A1, hw1), duration: OUT, ease: 'power3.in', stagger: 0.01 }, x);
    }
    t.to(ring, { d: 0.4, duration: OUT, ease: 'power2.in', ...R }, x);
    // 2. снизу: поднимается вытянутой, нижние строки догоняют верхние, середина строк прогибается парусом;
    //    стоит дольше, искра тускнеет (сомнение); улетает вверх
    s = x + OUT * 0.6;
    const hw2 = (b2?.offsetWidth ?? 2) / 2, A2 = Math.min(H * 0.08, hw2 * 0.35);
    const ls = b2 ? [...b2.children] : [];
    if (b2) {
      t.fromTo(b2, { x: W * 0.03, y: H * 0.75, scaleY: 2.1, scaleX: 0.9, rotationX: -40, opacity: 0, transformOrigin: '50% 0%' },
        { x: 0, y: 0, scaleY: 1, scaleX: 1, rotationX: 0, opacity: 1, duration: IN, ease: 'expo.out', immediateRender: false }, s);
      t.fromTo(ls, { y: (i: number) => i * H * 0.1 }, { y: 0, duration: IN + 0.15, ease: 'expo.out', immediateRender: false }, s);
      t.fromTo(c2, { y: archY(-A2), rotation: archR(-A2, hw2) }, { y: 0, rotation: 0, duration: IN + 0.25, ease: 'expo.out', immediateRender: false }, s);
      t.to(b2, { y: -H * 0.012, scale: 1.04, duration: HOLD[1] + IN * 0.3, ease: 'sine.inOut' }, s + IN * 0.7);
    }
    t.to(ring, { d: 0.62, duration: IN, ease: 'expo.out', ...R }, s);
    t.to(ring, { d: 0.65, duration: HOLD[1], ease: 'sine.inOut', ...R }, s + IN);
    if (orbit) t.to(orbit, { opacity: 0.45, duration: 0.8, ease: 'sine.inOut' }, s + IN * 0.8);
    x = s + IN * 0.7 + HOLD[1] + IN * 0.3;
    if (b2) {
      t.to(b2, { y: -H * 0.75, x: -W * 0.03, scaleY: 2.1, scaleX: 0.9, rotationX: 40, opacity: 0, duration: OUT, ease: 'power3.in' }, x);
      t.to(ls, { y: (i: number) => i * H * 0.08, duration: OUT, ease: 'power3.in' }, x);
      t.to(c2, { y: archY(-A2), rotation: archR(-A2, hw2), duration: OUT, ease: 'power3.in' }, x);
    }
    t.to(ring, { d: 0.7, duration: OUT, ease: 'power2.in', ...R }, x);
    if (orbit) t.to(orbit, { opacity: 1, duration: OUT }, x);
    // 3. из глубины: заголовок подлетает из-за кольца, буквы по очереди разворачиваются к зрителю;
    //    кольцо замыкается и вспыхивает волной
    s = x + OUT * 0.55;
    t.fromTo(title, { scale: 0.25, rotationX: 35, y: -H * 0.02, opacity: 0 },
      { scale: 1, rotationX: 0, y: 0, opacity: 1, duration: 1.15, ease: 'expo.out', immediateRender: false }, s);
    t.fromTo(c3, { rotationY: -100, opacity: 0, transformPerspective: 500 },
      { rotationY: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: 0.028, clearProps: 'transform', immediateRender: false }, s);
    t.to(ring, { d: 1, duration: 0.95, ease: 'expo.out', ...R }, s);
    if (pulseC) t.fromTo(pulseC, { scale: 1, opacity: 0.9 }, { scale: 1.85, opacity: 0, duration: 1.2, ease: 'power2.out', immediateRender: false }, s + 0.38);
    t.call(() => { endIn(); chrome(true); }, [], s + 0.5);
    t.call(() => { settle(); arm(); flatIdle(); }, [], s + 1.2);
  }
  /** короткий вход обычным текстом при возвращении */
  function flatBrief() {
    flatOnly = true;
    hero.classList.add('is-flat');
    hero.classList.remove('is-final');
    endHide();
    chrome(true);
    const f = makeFlat();
    f.beats.forEach((b) => gsap.set(b, { opacity: 0 }));
    flatIdle();
    const t = gsap.timeline();
    tl = t;
    t.fromTo(title, { scale: 0.4, rotationX: 25, y: 0, opacity: 0 }, { scale: 1, rotationX: 0, opacity: 1, duration: 0.95, ease: 'expo.out' }, 0.1);
    t.fromTo(f.title, { rotationY: -90, opacity: 0, transformPerspective: 500 }, { rotationY: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.02, clearProps: 'transform' }, 0.1);
    if (pulseC) t.fromTo(pulseC, { scale: 1, opacity: 0.8, transformOrigin: '50% 50%' }, { scale: 1.7, opacity: 0, duration: 1.1, ease: 'power2.out', immediateRender: false }, 0.3);
    t.call(() => endIn(), [], 0.45);
    t.call(settle, [], 1.05);
  }
  /** заголовок обычным текстом сразу (стекло пропало посреди показа или блок открыт не первым) */
  function showFinal(instant = false) {
    hero.classList.add('is-flat');
    gsap.killTweensOf(title);
    if (flat) {
      gsap.killTweensOf(flat.title);
      gsap.set(flat.title, { clearProps: 'transform,opacity' });
      flat.beats.forEach((b) => gsap.set(b, { opacity: 0 }));
    }
    gsap.set(title, { scale: 1, rotationX: 0 });
    if (instant) gsap.set(title, { opacity: 1, y: 0 });
    else gsap.fromTo(title, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out' });
    endIn(instant ? 0 : 0.35);
    chrome(true);
    settle();
    flatIdle();
  }

  /* ---------- досмотрели: сцена сама переходит дальше ---------- */
  const arm = () => {
    autoT?.kill();
    if (touched || !staged()) return;
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
    const g = await glassIn(withMark ? 9000 : 3000);
    if (id !== run) return;
    if (!g) {
      // WebGL нет: тот же рассказ обычным текстом, после знака. Буквы меряются по своему шрифту
      await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]);
      if (id !== run) return;
      const t = gsap.timeline({ delay: withMark ? Math.max(0, MARK - (performance.now() - t0) / 1000) : 0 });
      tl = t;
      flatInto(t);
      return;
    }
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
    const g = await glassIn(2500);
    if (id !== run) return;
    if (!g) { flatBrief(); return; }
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
    t.fromTo(b, { z: -1500, deep: 700, twist: 0.9, on: 0, flex: 0 }, { z: 0, deep: 0, twist: 0, duration: 0.95, ease: 'expo.out' }, 0.1);
    t.to(b, { on: 1, duration: 0.3, ease: 'power1.out' }, 0.1);
    t.fromTo(g.ring, { pulse: 0 }, { pulse: 1, duration: 1.1, ease: 'power2.out', immediateRender: false }, 0.3);
    t.call(() => endIn(), [], 0.45);
    t.call(() => { settle(); g.idle(true); breatheOn(g); }, [], 1.05);
  }
  /** финал сразу, без анимации: блок открыт не первым */
  function still() {
    const id = ++run;
    tl?.kill();
    chrome(true);
    hero.classList.remove('is-marking');
    gsap.set(ends, { opacity: 1, y: 0, visibility: 'visible' });
    hero.classList.add('is-final');
    ready.then((g) => {
      if (id !== run) return; // пока стекло грузилось, на блок уже вернулись
      if (!g) { showFinal(true); return; }
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
    orbitSpin?.kill(); orbitSpin = null;
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
    rt = window.setTimeout(() => { glass?.layout(finalBox()); if (hero.classList.contains('is-flat')) fitRing(); }, 120);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!glass || !isOpen()) return;
    if (document.hidden) { glass.stop(); tl?.pause(); breathe?.pause(); gleam?.pause(); } else { glass.start(); tl?.resume(); breathe?.resume(); gleam?.resume(); }
  });

  // для проверки скриншотами: перемотка рассказа на нужную секунду (только в режиме разработки)
  if (import.meta.env.DEV) (window as unknown as { __hero: object }).__hero = { seek: (s: number) => { tl?.pause(); tl?.seek(s, false); }, time: () => tl?.time() ?? -1, dur: () => tl?.duration() ?? -1 };

  /* ---------- запуск: после того, как сцена отметила текущий блок (initStage идёт следом) ---------- */
  queueMicrotask(() => {
    if (isOpen()) void story(true);
    else {
      still();
      document.dispatchEvent(new CustomEvent('hero:settled'));
    }
  });
}

export function heroReenter(hero: HTMLElement) {
  (hero as HTMLElement & { _reenter?: () => void })._reenter?.();
}
