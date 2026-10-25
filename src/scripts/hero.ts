import { gsap } from 'gsap';
import { ASK, DOUBT, ANSWER, STACK_FACES, paint, unpaint, pin, type Palette } from './hero/palettes';
import type { Type3D } from './hero/type3d';

type Line = { muted: boolean; html: string };
interface States { ask: { lines: Line[]; word: string }[]; doubt: Line[]; answer: Line[] }

/**
 * Первый экран-воронка. Слева в трёх строках-прорезях сменяются вопросы («Хотите Telegram-бота с нейросетью?»,
 * «Или эстетичный сайт для кофейни?»…), справа объёмное слово того, о чём спросили, и у каждого вопроса
 * своя палитра: новый цвет разливается кругом от слова. Сомнение («Но не знаете, кому это доверить?»):
 * цвет сереет, слова падают в шаткую башню. Ответ («Тогда вы попали по адресу.»): ультрамарин, слова встают
 * ровной стопкой «бот, сайт, запись, игра», поднимаются текст обо мне и кнопки; дальше слова по очереди
 * показывают своё действие. Рассказ пропускается кликом или кнопкой, при возвращении он короче.
 * Анимируются только transform и opacity, слова рисует видеокарта (hero/type3d.ts). Без WebGL остаются
 * палитры, текст и плоская стопка слов.
 */
export function initHero(onDone?: (hero: HTMLElement) => void) {
  const found = document.querySelector<HTMLElement>('[data-hero]');
  if (!found || found.classList.contains('is-bound')) return;
  const hero: HTMLElement = found;
  hero.classList.add('is-bound');
  const states: States = JSON.parse(hero.dataset.states || '{"ask":[],"doubt":[],"answer":[]}');
  const canvas = hero.querySelector<HTMLCanvasElement>('[data-hero-gl]');
  const say = hero.querySelector<HTMLElement>('[data-hero-say]')!;
  const slots = [...hero.querySelectorAll<HTMLElement>('[data-hero-ln]')];
  const spans = slots.map((s) => [...s.querySelectorAll<HTMLElement>('.hero__w')]);
  const sub = hero.querySelector<HTMLElement>('[data-hero-sub]');
  const cta = [...hero.querySelectorAll<HTMLElement>('[data-hero-cta] > *')];
  const skip = hero.querySelector<HTMLButtonElement>('[data-hero-skip]');
  const disc = hero.querySelector<HTMLElement>('[data-hero-flood]');
  const html = document.documentElement;
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const staged = () => html.classList.contains('stage-on');
  const isOpen = () => !staged() || hero.classList.contains('is-current');
  const endEls = [sub, ...cta].filter(Boolean) as HTMLElement[];
  let type: Type3D | null = null;
  let seq: gsap.core.Timeline | null = null;
  let played = false, telling = false;
  const front = slots.map(() => 0);

  /* ---------- палитра: блок, а пока он открыт, и <html> (шапка, точки, курсор) ---------- */
  let pal: Palette = calm ? ANSWER : ASK[0];
  const setPal = (p: Palette) => {
    pal = p;
    paint(hero, p);
    if (isOpen()) paint(html, p);
  };
  setPal(pal);
  let flooding: gsap.core.Tween | null = null;
  /** Новый цвет разливается кругом из точки (x, y) блока; fade: проявляется по всему блоку (сомнение). */
  function flood(p: Palette, at: { x: number; y: number } | null, dur = 0.7) {
    flooding?.progress(1);
    if (!disc) { setPal(p); return; }
    const r = hero.getBoundingClientRect();
    const o = at ?? { x: r.width / 2, y: r.height / 2 };
    const reach = Math.hypot(Math.max(o.x, r.width - o.x), Math.max(o.y, r.height - o.y));
    const D = 200; // диаметр круга в разметке, px
    gsap.set(disc, { x: o.x - D / 2, y: o.y - D / 2, backgroundColor: p.bg, visibility: 'visible', opacity: at ? 1 : 0, scale: at ? 0.01 : (reach * 2) / D + 0.2 });
    let swapped = false;
    const t = flooding = gsap.to(disc, {
      ...(at ? { scale: (reach * 2) / D + 0.2, ease: 'expo.out' } : { opacity: 1, ease: 'power1.inOut' }), duration: dur,
      // переменные меняются, когда круг уже закрыл почти всё: старые строки гаснут в своих цветах (pin)
      onUpdate: () => { if (!swapped && t.progress() > (at ? 0.3 : 0.5)) { swapped = true; setPal(p); } },
      onComplete: () => { if (!swapped) setPal(p); gsap.set(disc, { visibility: 'hidden', scale: 0.01 }); if (flooding === t) flooding = null; },
    });
  }
  /** точка, откуда разливается цвет: середина места для слов */
  const spot = () => {
    if (!canvas || !type) return null;
    const hr = hero.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    const o = type.origin();
    return { x: cr.left - hr.left + o.x, y: cr.top - hr.top + o.y };
  };

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
      pin(old, pal); // уходящая строка остаётся в цветах своего вопроса
      pin(neu, null);
      fill(neu, lines[i]);
      const at = i * (heavy ? 0.1 : 0.07);
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
      spans[i].forEach((s) => pin(s, null));
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

  /* ---------- текст обо мне, кнопки, «Пропустить» ---------- */
  const endHide = () => { gsap.killTweensOf(endEls); gsap.set(endEls, { opacity: 0, y: 18, visibility: 'hidden' }); };
  const endIn = (delay = 0) => {
    gsap.fromTo(endEls, { opacity: 0, y: 18, visibility: 'visible' }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.08, delay, overwrite: true });
    if (skip && !skip.hidden) gsap.to(skip, { opacity: 0, duration: 0.25, delay, onComplete: () => { skip.hidden = true; } });
  };
  const skipIn = () => { if (!skip) return; skip.hidden = false; gsap.fromTo(skip, { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 0.9 }); };

  /* ---------- покой: слова стопки по очереди показывают своё действие ---------- */
  let idleT = 0, nextAct = 0;
  const idleStop = () => { clearInterval(idleT); idleT = 0; };
  const idleStart = (delay = 1.2) => {
    idleStop();
    if (calm || !type) return;
    idleT = window.setTimeout(() => {
      const tick = () => { if (isOpen() && !document.hidden) type?.act(nextAct++ % states.ask.length); };
      tick();
      idleT = window.setInterval(tick, 3800);
    }, delay * 1000);
  };
  const answered = (on: boolean) => hero.classList.toggle('is-answered', on);
  const settle = () => {
    telling = false;
    hero.classList.remove('is-telling');
    document.dispatchEvent(new CustomEvent('hero:settled'));
  };

  /* ---------- сценарии ---------- */
  // начало каждого вопроса: слово успевает выйти и показать своё действие (около 1,5 с)
  const Q = 1.6, T0 = 0.2;
  function tell() {
    seq?.kill(); idleStop();
    played = true; telling = true;
    hero.classList.add('is-telling');
    answered(false);
    endHide();
    skipIn();
    setPal(ASK[0]);
    type?.tone(ASK[0], 0);
    const ask = states.ask;
    const at = (k: number) => T0 + k * Q;
    const tl = gsap.timeline();
    ask.forEach((a, k) => {
      const t = at(k);
      const p = ASK[k % ASK.length];
      tl.call(() => {
        type?.enter(k);
        if (k > 0) { flood(p, spot()); type?.tone(p, 0.3); }
      }, [], t - 0.08);
      tl.call(() => swapTo(a.lines), [], t);
    });
    // сомнение: цвет сереет по всему экрану, слова падают в шаткую башню
    const tDoubt = at(ask.length) + 0.15, tAns = tDoubt + 1.8;
    tl.call(() => { flood(DOUBT, null, 0.8); type?.tone(DOUBT, 0.7); type?.pile(); }, [], tDoubt - 0.1);
    tl.call(() => swapTo(states.doubt, true), [], tDoubt);
    // ответ: ультрамарин разливается из середины, слова встают стопкой
    tl.call(() => { type?.stack('gather'); flood(ANSWER, spot(), 0.8); type?.tone(ANSWER, 0.5, STACK_FACES); answered(true); }, [], tAns - 0.12);
    tl.call(() => swapTo(states.answer), [], tAns);
    tl.call(() => endIn(), [], tAns + 0.5);
    tl.call(settle, [], tAns + 1.2);
    tl.call(() => idleStart(1), [], tAns + 1.2);
    seq = tl;
  }
  /** короткий вход: сразу ответ, текст и кнопки; слова падают в стопку сверху */
  function brief() {
    seq?.kill(); idleStop();
    flooding?.progress(1);
    telling = false;
    hero.classList.remove('is-telling');
    if (skip) skip.hidden = true;
    endHide();
    setLines([]);
    setPal(ANSWER);
    answered(true);
    type?.tone(ANSWER, 0, STACK_FACES);
    const tl = gsap.timeline();
    tl.call(() => type?.stack('drop'), [], 0);
    tl.call(() => swapTo(states.answer), [], 0.08);
    tl.call(() => endIn(), [], 0.35);
    tl.call(settle, [], 0.6);
    tl.call(() => idleStart(1.4), [], 0.6);
    seq = tl;
  }
  /** пропуск рассказа: ультрамарин, ответ, текст и кнопки, слова собираются в стопку */
  function finish() {
    if (!telling) return;
    seq?.kill();
    setLines(states.answer);
    endIn();
    answered(true);
    type?.stack('gather');
    type?.tone(ANSWER, 0.4, STACK_FACES);
    flood(ANSWER, spot(), 0.5);
    settle();
    idleStart(1.6);
  }
  function still() {
    seq?.kill(); idleStop();
    telling = false;
    setLines(states.answer);
    if (skip) skip.hidden = true;
    gsap.set(endEls, { opacity: 1, y: 0, visibility: 'visible' });
    setPal(ANSWER);
    answered(true);
    type?.tone(ANSWER, 0, STACK_FACES);
    type?.stack('snap');
    type?.draw();
    settle();
  }
  const play = () => (calm ? still() : played ? brief() : tell());

  // до шрифтов: строки пустые, текст и кнопки спрятаны (без скрипта виден ответ)
  setLines([]);
  endHide();

  // модуль слов (three.js) грузится вместе со шрифтами, а не после них
  const typeMod = canvas ? import('./hero/type3d').catch(() => null) : Promise.resolve(null);
  (document.fonts?.ready ?? Promise.resolve()).then(async () => {
    fit();
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { fit(); type?.layout(); if (calm) type?.draw(); }, 120); }, { passive: true });
    if (canvas) {
      try {
        const mod = await typeMod;
        if (!mod) throw new Error('no 3d');
        const lite = isTouch && ((navigator.hardwareConcurrency || 8) <= 4 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4);
        type = mod.createType3D({ canvas, words: states.ask.map((a) => a.word), lite });
        type.layout();
        hero.classList.add('is-gl');
      } catch { type = null; hero.classList.add('is-flat'); }
    } else hero.classList.add('is-flat');
    const t3 = type;
    if (isOpen()) { t3?.start(); play(); }
    else document.dispatchEvent(new CustomEvent('hero:settled'));
    onDone?.(hero);

    // клик или тап по пустому месту: во время рассказа пропускает его, потом слово стопки показывает действие
    let down = { x: 0, y: 0, t: 0 };
    skip?.addEventListener('click', finish);
    hero.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    hero.addEventListener('pointerup', (e) => {
      if ((e.target as Element).closest('a, button')) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || performance.now() - down.t > 450) return;
      if (telling) finish(); else t3?.act(nextAct++ % states.ask.length);
    });
    if (t3) {
      hero.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = hero.getBoundingClientRect();
        t3.pointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1, true);
      }, { passive: true });
      hero.addEventListener('pointerleave', () => t3.pointer(0, 0, false));
    }
    // уход с первого экрана: рендер и покой останавливаются, шапка возвращается к теме следующего блока
    hero.addEventListener('block:leave', () => {
      t3?.stop(); seq?.kill(); idleStop();
      flooding?.progress(1);
      unpaint(html);
      if (telling) settle();
    });
    if (!staged() && t3) new IntersectionObserver(([en]) => { if (en.isIntersecting) t3.start(); else t3.stop(); }).observe(hero);
  });

  /** Возвращение на первый экран: если рассказ ещё не видели, он целиком, иначе короткий вход. */
  (hero as HTMLElement & { _reenter?: () => void })._reenter = () => {
    paint(html, pal);
    type?.layout();
    type?.start();
    play();
  };
}

export function heroReenter(hero: HTMLElement) {
  (hero as HTMLElement & { _reenter?: () => void })._reenter?.();
}
