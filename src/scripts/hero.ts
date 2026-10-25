import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import type { Sculpt, ShapeName } from './sculpt';

gsap.registerPlugin(ScrambleTextPlugin);

type Line = { muted: boolean; html: string };
interface States { ask: { lines: Line[]; shape: ShapeName }[]; doubt: Line[]; answer: Line[] }

/**
 * Первый экран-воронка. В трёх строках-прорезях сменяются вопросы («Хотите Telegram-бота с нейросетью?»,
 * «Или эстетичный сайт для кофейни?»…), и рядом знаки кода складываются в то, о чём спросили. Потом
 * сомнение («Но не знаете, кому это доверить?»): знаки разлетаются по экрану и тускнеют. Ответ
 * («Тогда вы попали по адресу.»): знаки схлопываются в оранжевую галочку, поднимаются текст обо мне и кнопки,
 * дальше знаки спокойно перебирают всё, что я делаю. Рассказ можно пропустить кликом или кнопкой.
 * При возвращении на первый экран он короче: сразу ответ и кнопки.
 * Анимируются только transform и opacity; знаки считает видеокарта. Без WebGL остаётся текст.
 */
export function initHero(onDone?: (hero: HTMLElement) => void) {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero || hero.classList.contains('is-bound')) return;
  hero.classList.add('is-bound');
  const states: States = JSON.parse(hero.dataset.states || '{"ask":[],"doubt":[],"answer":[]}');
  const canvas = hero.querySelector<HTMLCanvasElement>('[data-hero-gl]');
  const stage = hero.querySelector<HTMLElement>('[data-hero-stage]');
  const say = hero.querySelector<HTMLElement>('[data-hero-say]')!;
  const slots = [...hero.querySelectorAll<HTMLElement>('[data-hero-ln]')];
  const spans = slots.map((s) => [...s.querySelectorAll<HTMLElement>('.hero__w')]);
  const sub = hero.querySelector<HTMLElement>('[data-hero-sub]');
  const cta = [...hero.querySelectorAll<HTMLElement>('[data-hero-cta] > *')];
  const skip = hero.querySelector<HTMLButtonElement>('[data-hero-skip]');
  const hud = hero.querySelector<HTMLElement>('[data-hero-hud]');
  const idx = hero.querySelector<HTMLElement>('[data-hero-idx]');
  const now = hero.querySelector<HTMLElement>('[data-hero-now]');
  const bar = hero.querySelector<HTMLElement>('[data-hero-bar]');
  const labels: string[] = JSON.parse(hud?.dataset.labels || '[]');
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const staged = () => document.documentElement.classList.contains('stage-on');
  const isOpen = () => !staged() || hero.classList.contains('is-current');
  const endEls = [sub, ...cta].filter(Boolean) as HTMLElement[];
  let sculpt: Sculpt | null = null;
  let seq: gsap.core.Timeline | null = null;
  let played = false, telling = false;
  const front = slots.map(() => 0);

  /* ---------- строки-прорези: старый текст уходит вверх, новый поднимается снизу ---------- */
  const fill = (el: HTMLElement, l: Line | undefined) => { el.innerHTML = l ? l.html : ''; el.classList.toggle('is-m', !!l?.muted); };
  // свои ссылки на твины строк: отложенные (ещё не начавшиеся) надёжно снимаются только так
  let swaps: gsap.core.Tween[] = [];
  const killSwaps = () => { swaps.forEach((t) => t.kill()); swaps = []; };
  function swapTo(lines: Line[], heavy = false) {
    killSwaps();
    slots.forEach((_, i) => {
      const old = spans[i][front[i]], neu = spans[i][1 - front[i]];
      front[i] = 1 - front[i];
      fill(neu, lines[i]);
      const at = i * (heavy ? 0.1 : 0.07);
      // строки стоят плотно, а прорезь шире строки (запас под «й» и «у»): уходящий и входящий текст гаснут,
      // чтобы не мелькать между строк
      const out = heavy ? 0.4 : 0.3;
      swaps.push(
        gsap.to(old, { yPercent: -100, opacity: 0, duration: out, ease: 'power2.in', delay: at, overwrite: true }),
        gsap.fromTo(neu, { yPercent: 100, opacity: 0, rotate: heavy ? 0 : 3 }, { yPercent: 0, opacity: 1, rotate: 0, duration: heavy ? 0.85 : 0.62, ease: 'expo.out', delay: at + out * 0.7, immediateRender: false }),
      );
    });
  }
  /** сразу поставить строки без анимации */
  function setLines(lines: Line[]) {
    killSwaps();
    slots.forEach((_, i) => {
      gsap.killTweensOf(spans[i]);
      front[i] = 0;
      fill(spans[i][0], lines[i]); fill(spans[i][1], undefined);
      gsap.set(spans[i][0], { yPercent: 0, rotate: 0, opacity: 1 });
      gsap.set(spans[i][1], { yPercent: 100, rotate: 0, opacity: 0 });
    });
  }

  /* ---------- кегль: самая длинная строка всех вопросов влезает в колонку, по высоте ограничивает CSS ---------- */
  const all = [...states.ask.flatMap((a) => a.lines), ...states.doubt, ...states.answer];
  function fit() {
    say.style.removeProperty('--fs-say');
    // ширина колонки, а не самого заголовка: пока строки пустые, он схлопывается
    const box = say.parentElement?.clientWidth || 0;
    if (!box) return;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0';
    say.append(probe);
    let max = 0;
    for (const l of all) { probe.innerHTML = l.html; max = Math.max(max, probe.offsetWidth); }
    probe.remove();
    const fs = parseFloat(getComputedStyle(say).fontSize);
    if (max > box * 0.97) say.style.setProperty('--fs-say', `${Math.floor((fs * box * 0.97) / max)}px`);
  }

  /* ---------- текст обо мне, кнопки, «Пропустить», подпись под скульптурой ---------- */
  const endHide = () => { gsap.killTweensOf(endEls); gsap.set(endEls, { opacity: 0, y: 18, visibility: 'hidden' }); };
  const endIn = (delay = 0) => {
    gsap.fromTo(endEls, { opacity: 0, y: 18, visibility: 'visible' }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.08, delay, overwrite: true });
    if (skip && !skip.hidden) gsap.to(skip, { opacity: 0, duration: 0.25, delay, onComplete: () => { skip.hidden = true; } });
  };
  const skipIn = () => { if (!skip) return; skip.hidden = false; gsap.fromTo(skip, { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 0.9 }); };
  let barTween: gsap.core.Tween | null = null;
  const onShape = (i: number, dur: number) => {
    if (i < 0 || i >= labels.length) return;
    if (idx) idx.textContent = String(i + 1).padStart(2, '0');
    if (now && labels[i]) gsap.to(now, { duration: 0.7, scrambleText: { text: labels[i], chars: '{}<>/=+*#01', speed: 0.6 }, overwrite: true });
    barTween?.kill();
    if (bar) barTween = gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: dur, ease: 'none' });
  };
  const hudIn = () => hud && gsap.fromTo(hud, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' });
  const settle = () => {
    telling = false;
    hero.classList.remove('is-telling');
    document.dispatchEvent(new CustomEvent('hero:settled'));
  };

  /* ---------- сценарии ---------- */
  function tell() {
    seq?.kill();
    played = true; telling = true;
    hero!.classList.add('is-telling');
    endHide();
    if (hud) gsap.set(hud, { opacity: 0 });
    skipIn();
    // каждый предмет успевает собраться (0,75 с) и постоять полсекунды; первый слетается из облака чуть дольше
    const ask = states.ask, FIRST = 1.55, Q = 1.3;
    const at = (k: number) => 0.2 + (k > 0 ? FIRST + (k - 1) * Q : 0);
    const tl = gsap.timeline();
    tl.call(() => { sculpt?.mood(1, 0); sculpt?.intro(ask[0]?.shape ?? 'plane', 1.05); }, [], 0);
    ask.forEach((a, k) => {
      const t = at(k);
      if (k > 0) tl.call(() => sculpt?.morphTo(a.shape, 0.75, 1.5), [], t - 0.1);
      tl.call(() => swapTo(a.lines), [], t);
    });
    const tDoubt = at(ask.length), tAns = tDoubt + 1.6;
    // сомнение: знаки разлетаются по экрану, тускнеют и плывут
    tl.call(() => { sculpt?.morphTo('cloud', 1.15, 2.4); sculpt?.mood(0.45, 0.22); sculpt?.pulse(); }, [], tDoubt - 0.1);
    tl.call(() => swapTo(states.doubt, true), [], tDoubt);
    // ответ: знаки схлопываются в галочку, по ней проходит волна
    tl.call(() => { sculpt?.morphTo('check', 0.9, 1.1); sculpt?.mood(1, 0); }, [], tAns - 0.15);
    tl.call(() => swapTo(states.answer), [], tAns);
    tl.call(() => endIn(), [], tAns + 0.45);
    tl.call(() => sculpt?.pulse(), [], tAns + 0.8);
    tl.call(() => { sculpt?.auto('browser'); hudIn(); }, [], tAns + 2.3);
    tl.call(settle, [], tAns + 2.3);
    seq = tl;
  }
  /** короткий вход: сразу ответ, текст и кнопки; знаки слетаются в галочку */
  function brief() {
    seq?.kill();
    telling = false;
    hero!.classList.remove('is-telling');
    if (skip) skip.hidden = true;
    endHide();
    if (hud) gsap.set(hud, { opacity: 0 });
    setLines([]);
    const tl = gsap.timeline();
    tl.call(() => { sculpt?.mood(1, 0); sculpt?.intro('check', 1.3); }, [], 0);
    tl.call(() => swapTo(states.answer), [], 0.08);
    tl.call(() => endIn(), [], 0.35);
    tl.call(() => { sculpt?.auto('browser'); hudIn(); }, [], 2.1);
    tl.call(settle, [], 0.6);
    seq = tl;
  }
  /** пропуск рассказа: сразу ответ, текст и кнопки, знаки идут в галочку и дальше по кругу */
  function finish() {
    if (!telling) return;
    seq?.kill();
    setLines(states.answer);
    endIn();
    sculpt?.mood(1, 0);
    sculpt?.morphTo('check', 0.8, 1.1);
    seq = gsap.timeline().call(() => { sculpt?.auto('browser'); hudIn(); }, [], 1.5);
    settle();
  }
  function still() {
    seq?.kill();
    telling = false;
    setLines(states.answer);
    if (skip) skip.hidden = true;
    gsap.set(endEls, { opacity: 1, y: 0, visibility: 'visible' });
    if (hud) gsap.set(hud, { opacity: 1 });
    sculpt?.mood(1, 0);
    sculpt?.auto('browser');
    settle();
  }
  const play = () => (calm ? still() : played ? brief() : tell());

  /* ---------- место скульптуры: квадрат внутри [data-hero-stage] над подписью ---------- */
  const place = () => {
    if (!sculpt || !stage) return;
    const hr = hero.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const hudH = hud ? hud.offsetHeight + 14 : 0;
    const w = sr.width, h = sr.height - hudH;
    if (w < 10 || h < 10) return;
    sculpt.layout(sr.left - hr.left + w / 2, sr.top - hr.top + h / 2, Math.min(w * 1.04, h * 0.94));
  };

  // до шрифтов и скульптуры: строки пустые, текст и кнопки спрятаны (без скрипта виден ответ)
  setLines([]);
  endHide();
  if (hud) gsap.set(hud, { opacity: 0 });

  (document.fonts?.ready ?? Promise.resolve()).then(async () => {
    fit();
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { fit(); place(); }, 120); }, { passive: true });
    if (canvas && stage) {
      try {
        const mod = await import('./sculpt');
        const cs = getComputedStyle(hero);
        const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';
        try { await document.fonts?.load(`700 46px ${mono}`); } catch { /* знаки нарисуются запасным моноширинным */ }
        sculpt = mod.createSculpt({ canvas, color: cs.getPropertyValue('--fg').trim() || '#F3F0E8', hot: cs.getPropertyValue('--accent').trim() || '#FF6A3D', font: mono, count: isTouch ? 3000 : 5200, calm });
        sculpt.onShape(onShape);
        hero.classList.add('is-gl');
        place();
      } catch { sculpt = null; hero.classList.add('is-flat'); }
    } else hero.classList.add('is-flat');
    const sc = sculpt;
    if (isOpen()) { sc?.start(); play(); }
    else document.dispatchEvent(new CustomEvent('hero:settled'));
    onDone?.(hero);

    // клик или тап по пустому месту: во время рассказа пропускает его, потом пускает волну по знакам
    const local = (e: PointerEvent) => { const r = hero.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    let down = { x: 0, y: 0, t: 0 };
    skip?.addEventListener('click', finish);
    hero.addEventListener('pointerdown', (e) => { const p = local(e); down = { ...p, t: performance.now() }; });
    hero.addEventListener('pointerup', (e) => {
      if ((e.target as Element).closest('a, button')) return;
      const p = local(e);
      if (Math.hypot(p.x - down.x, p.y - down.y) > 10 || performance.now() - down.t > 450) return;
      if (telling) finish(); else sc?.pulse(p.x, p.y);
    });
    if (!sc) return;
    hero.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const p = local(e); sc.pointer(p.x, p.y, true); }, { passive: true });
    hero.addEventListener('pointerleave', () => sc.pointer(0, 0, false));
    // рендер идёт, только пока первый экран открыт
    hero.addEventListener('block:leave', () => { sc.stop(); seq?.kill(); if (telling) settle(); });
    if (!staged()) new IntersectionObserver(([en]) => { if (en.isIntersecting) sc.start(); else sc.stop(); }).observe(hero);
  });

  /** Возвращение на первый экран: если рассказ ещё не видели, он целиком, иначе короткий вход. */
  (hero as HTMLElement & { _reenter?: () => void })._reenter = () => {
    place();
    sculpt?.start();
    play();
  };
}

export function heroReenter(hero: HTMLElement) {
  (hero as HTMLElement & { _reenter?: () => void })._reenter?.();
}
