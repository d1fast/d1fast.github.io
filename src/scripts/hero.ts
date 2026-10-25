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
  // класс stage стоит в разметке, stage-on ставит сцена позже: первый экран судит по первому, иначе при открытии
  // страницы на другом блоке он счёл бы себя открытым и перекрасил шапку
  const staged = () => html.classList.contains('stage');
  const isOpen = () => !staged() || hero.classList.contains('is-current');
  const endEls = [sub, ...cta].filter(Boolean) as HTMLElement[];
  let type: Type3D | null = null;
  let seq: gsap.core.Timeline | null = null;
  let played = false, telling = false;
  const front = slots.map(() => 0);

  /* ---------- палитра: блок, а пока он открыт, и шапка, точки, курсор ---------- */
  // переменные пишутся на эти элементы, а не на <html>: смена на <html> пересчитывала бы стили всей страницы
  const chrome = () => [...document.querySelectorAll<HTMLElement>('.site-header, .dots, .cursor')];
  const unchrome = () => chrome().forEach((el) => unpaint(el));
  let pal: Palette = calm ? ANSWER : ASK[0];
  const setPal = (p: Palette) => {
    pal = p;
    paint(hero, p);
    if (isOpen()) chrome().forEach((el) => paint(el, p));
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
    // «Пропустить» стоит там же, где поднимаются кнопки: исчезает сразу, чтобы они не наложились
    if (skip && !skip.hidden) { gsap.killTweensOf(skip); skip.hidden = true; }
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
  /** где сейчас рассказ: номер вопроса, сомнение или ответ (слова, загрузившиеся позже, встают сюда же) */
  let beat: number | 'doubt' | 'answer' | null = null;
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
        beat = k;
        type?.enter(k);
        if (k > 0) { flood(p, spot()); type?.tone(p, 0.3); }
      }, [], t - 0.08);
      tl.call(() => swapTo(a.lines), [], t);
    });
    // сомнение: цвет сереет по всему экрану, слова падают в шаткую башню
    const tDoubt = at(ask.length) + 0.15, tAns = tDoubt + 1.8;
    tl.call(() => { beat = 'doubt'; flood(DOUBT, spot(), 0.8); type?.tone(DOUBT, 0.6); type?.pile(); }, [], tDoubt - 0.1);
    tl.call(() => swapTo(states.doubt, true), [], tDoubt);
    // ответ: ультрамарин разливается из середины, слова встают стопкой
    tl.call(() => { beat = 'answer'; type?.stack('gather'); flood(ANSWER, spot(), 0.8); type?.tone(ANSWER, 0.5, STACK_FACES); answered(true); }, [], tAns - 0.12);
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
    beat = 'answer';
    type?.hide();
    // стопка падает, когда волна перехода уже открыла экран
    const tl = gsap.timeline();
    tl.call(() => type?.stack('drop'), [], 0.32);
    tl.call(() => swapTo(states.answer), [], 0.08);
    tl.call(() => endIn(), [], 0.35);
    tl.call(settle, [], 0.6);
    tl.call(() => idleStart(1.6), [], 0.6);
    seq = tl;
  }
  /** пропуск рассказа: ультрамарин, ответ, текст и кнопки, слова собираются в стопку */
  function finish() {
    if (!telling) return;
    seq?.kill();
    const focused = document.activeElement === skip;
    setLines(states.answer);
    endIn();
    // фокус был на «Пропустить», которая исчезла: он переходит на главную кнопку, а не на начало страницы
    if (focused) cta[0]?.focus({ preventScroll: true });
    beat = 'answer';
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
    beat = 'answer';
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

  /* ---------- уход и возвращение ---------- */
  // слушатель ставится сразу, а не после загрузки слов: уйти можно и раньше
  let leftT = 0;
  hero.addEventListener('block:leave', () => {
    type?.stop(); seq?.kill(); idleStop();
    flooding?.progress(1);
    unchrome();
    if (telling) settle();
    // когда волна перехода закроет экран, блок ждёт возвращения уже в цветах ответа (короткий вход)
    clearTimeout(leftT);
    leftT = window.setTimeout(() => { if (played && !hero.classList.contains('is-current')) { pal = ANSWER; paint(hero, ANSWER); } }, 1200);
  });

  /* ---------- мышь и касание ---------- */
  // клик или тап по пустому месту: во время рассказа пропускает его, потом слово стопки показывает действие
  let down = { x: 0, y: 0, t: 0 };
  skip?.addEventListener('click', finish);
  hero.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  hero.addEventListener('pointerup', (e) => {
    if ((e.target as Element).closest('a, button')) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || performance.now() - down.t > 450) return;
    if (telling) finish(); else if (!calm) type?.act(nextAct++ % states.ask.length);
  });
  if (!calm) {
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !type) return;
      const r = hero.getBoundingClientRect();
      type.pointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1, true);
    }, { passive: true });
    hero.addEventListener('pointerleave', () => type?.pointer(0, 0, false));
  }

  /* ---------- объёмные слова ---------- */
  /** одиночное слово на компьютере стоит на высоте вопроса; стоя (телефон) место над текстом, слово по его середине */
  const aim = () => {
    if (!type || !canvas) return;
    if (matchMedia('(orientation: portrait)').matches) { type.aim(null); return; }
    const cr = canvas.getBoundingClientRect(), sr = say.getBoundingClientRect();
    type.aim(sr.top + sr.height / 2 - cr.top);
  };
  const flat = () => { type = null; hero.classList.remove('is-gl'); hero.classList.add('is-flat'); };
  /** слова подключаются, когда модуль загрузился, и встают туда, где сейчас рассказ */
  const attach = (mod: typeof import('./hero/type3d') | null) => {
    if (!mod || !canvas) { flat(); return; }
    try {
      const lite = isTouch && ((navigator.hardwareConcurrency || 8) <= 4 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4);
      type = mod.createType3D({ canvas, words: states.ask.map((a) => a.word), lite });
    } catch { flat(); return; }
    const t3 = type;
    hero.classList.remove('is-flat');
    hero.classList.add('is-gl');
    t3.layout();
    aim();
    // потеря контекста (драйвер, нехватка памяти): остаются палитры, текст и плоская стопка
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); t3.stop(); if (type === t3) flat(); }, { once: true });
    if (!staged()) new IntersectionObserver(([en]) => { if (en.isIntersecting) t3.start(); else t3.stop(); }).observe(hero);
    if (isOpen()) t3.start();
    if (typeof beat === 'number') { t3.tone(ASK[beat % ASK.length], 0); t3.enter(beat); }
    else if (beat === 'doubt') { t3.tone(DOUBT, 0); t3.pile(); }
    else if (beat === 'answer') {
      t3.tone(ANSWER, 0, STACK_FACES);
      t3.stack(calm ? 'snap' : 'drop');
      if (calm) t3.draw(); else if (!telling) idleStart(1.4);
    }
  };

  // До шрифтов строки пустые, текст и кнопки спрятаны (без скрипта виден ответ). Модуль слов (three.js)
  // грузится одновременно со шрифтами; рассказ ждёт его не дольше 0,9 с, слова, пришедшие позже, догоняют рассказ.
  // Есть ли WebGL, проверяется до загрузки: без него модуль не нужен вовсе
  setLines([]);
  endHide();
  const glOk = (() => {
    if (!canvas) return false;
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    g?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!g;
  })();
  const typeMod = glOk ? import('./hero/type3d').catch(() => null) : Promise.resolve(null);
  (document.fonts?.ready ?? Promise.resolve()).then(async () => {
    fit();
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { fit(); type?.layout(); aim(); if (calm) type?.draw(); }, 120); }, { passive: true });
    let late = false;
    const mod = await Promise.race([typeMod, new Promise<'late'>((r) => setTimeout(() => r('late'), 900))]);
    if (mod === 'late') { late = true; hero.classList.add('is-flat'); }
    else attach(mod);
    if (isOpen()) play();
    else document.dispatchEvent(new CustomEvent('hero:settled'));
    if (late) typeMod.then(attach);
    onDone?.(hero);
  });

  /** Возвращение на первый экран: если рассказ ещё не видели, он целиком, иначе короткий вход. */
  (hero as HTMLElement & { _reenter?: () => void })._reenter = () => {
    clearTimeout(leftT);
    chrome().forEach((el) => paint(el, pal));
    type?.layout();
    aim();
    type?.start();
    play();
  };
}

export function heroReenter(hero: HTMLElement) {
  (hero as HTMLElement & { _reenter?: () => void })._reenter?.();
}
