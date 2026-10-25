import { gsap } from 'gsap';
import { ASK, DOUBT, ANSWER, paint, unpaint, type Palette } from './hero/palettes';
import { createSpace, IN, DWELL, FLY, type Space } from './hero/space';

type Line = { muted: boolean; html: string };
interface States { ask: { lines: Line[]; word: string }[]; doubt: Line[]; answer: Line[] }

/**
 * Первый экран-воронка. Вопросы («Хотите Telegram-бота с нейросетью?», «Или эстетичный сайт для кофейни?»…)
 * по очереди пролетают по кривым системы координат: быстро выезжают, у точки чтения замедляются и быстро уходят,
 * за каждым тянется лента его цвета, рядом летит картинка, новый цвет разливается кругом от точки чтения.
 * Сомнение («Но не знаете, кому это доверить?»): цвет сереет, кривые путаются в клубок. Ответ («Тогда вы попали
 * по адресу.»): подсолнечный фон, кривые распутываются и сходятся в цель d1fast, поднимаются текст обо мне и
 * кнопки; дальше по лентам бегут бусины. Рассказ пропускается кликом или кнопкой, при возвращении он короче.
 * При «уменьшить движение» рассказ идёт так же, без покачивания, наклона за мышью и конфетти.
 */
export function initHero(onDone?: (hero: HTMLElement) => void) {
  const found = document.querySelector<HTMLElement>('[data-hero]');
  if (!found || found.classList.contains('is-bound')) return;
  const hero: HTMLElement = found;
  hero.classList.add('is-bound');
  const states: States = JSON.parse(hero.dataset.states || '{"ask":[],"doubt":[],"answer":[]}');
  const words: string[] = JSON.parse(hero.dataset.words || '[]');
  const canvas = hero.querySelector<HTMLCanvasElement>('[data-hero-gl]')!;
  const spaceEl = hero.querySelector<HTMLElement>('[data-hero-space]')!;
  const aimEl = hero.querySelector<HTMLElement>('[data-hero-aim]')!;
  const qs = [...hero.querySelectorAll<HTMLElement>('[data-hero-q]')];
  const cards = [...hero.querySelectorAll<HTMLElement>('[data-hero-card]')];
  const doubtEl = hero.querySelector<HTMLElement>('[data-hero-doubt]');
  const say = hero.querySelector<HTMLElement>('[data-hero-say]')!;
  const ws = [...say.querySelectorAll<HTMLElement>('.hero__w')];
  const sub = hero.querySelector<HTMLElement>('[data-hero-sub]');
  const cta = [...hero.querySelectorAll<HTMLElement>('[data-hero-cta] > *')];
  const skip = hero.querySelector<HTMLButtonElement>('[data-hero-skip]');
  const disc = hero.querySelector<HTMLElement>('[data-hero-flood]');
  const html = document.documentElement;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // класс stage стоит в разметке, stage-on ставит сцена позже: первый экран судит по первому, иначе при открытии
  // страницы на другом блоке он счёл бы себя открытым и перекрасил шапку
  const staged = () => html.classList.contains('stage');
  const isOpen = () => !staged() || hero.classList.contains('is-current');
  const endEls = [sub, ...cta].filter(Boolean) as HTMLElement[];
  let sp: Space | null = null;
  let seq: gsap.core.Timeline | null = null;
  let played = false, telling = false;

  /* ---------- палитра: блок, а пока он открыт, и шапка, точки, курсор ---------- */
  const chrome = () => [...document.querySelectorAll<HTMLElement>('.site-header, .dots, .cursor')];
  const unchrome = () => chrome().forEach((el) => unpaint(el));
  let pal: Palette = ASK[0];
  const setPal = (p: Palette) => {
    pal = p;
    paint(hero, p);
    sp?.tone(p);
    if (isOpen()) chrome().forEach((el) => paint(el, p));
  };
  setPal(pal);
  let flooding: gsap.core.Tween | null = null;
  /** Новый цвет разливается кругом из точки (x, y) блока; без точки проявляется по всему блоку (сомнение). */
  function flood(p: Palette, at: { x: number; y: number } | null, dur = 0.75) {
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
      // переменные меняются, когда круг закрыл почти всё; вопросы и картинки держат цвета своей палитры сами
      onUpdate: () => { if (!swapped && t.progress() > (at ? 0.3 : 0.5)) { swapped = true; setPal(p); } },
      onComplete: () => { if (!swapped) setPal(p); gsap.set(disc, { visibility: 'hidden', scale: 0.01 }); if (flooding === t) flooding = null; },
    });
  }

  /* ---------- кегль: вопрос влезает в своё место, ответ в колонку ---------- */
  function fit() {
    const r = hero.getBoundingClientRect();
    const portrait = r.height > r.width * 1.05;
    // примерка в том же шрифте, что и летящие вопросы: строка в невидимом .hero__q кеглем 100px
    const tryout = document.createElement('p');
    tryout.className = 'hero__q';
    tryout.style.cssText = 'font-size:100px;transform:none';
    const probe = document.createElement('span');
    probe.className = 'hero__ql';
    tryout.append(probe);
    spaceEl.append(tryout);
    let max = 0;
    for (const l of [...states.ask.flatMap((a) => a.lines), ...states.doubt]) {
      probe.classList.toggle('is-m', l.muted);
      probe.innerHTML = l.html;
      max = Math.max(max, probe.offsetWidth);
    }
    tryout.remove();
    const gut = parseFloat(getComputedStyle(hero).getPropertyValue('--gutter')) || 16;
    const room = portrait ? r.width - gut * 2.5 : r.width * 0.44;
    const cap = portrait ? Math.min(r.height * 0.052, 64) : Math.min(r.height * 0.088, 84);
    spaceEl.style.setProperty('--fs-q', `${Math.max(18, Math.floor(Math.min((room / Math.max(1, max)) * 100, cap)))}px`);
    // ответ: самая длинная строка не шире колонки
    say.style.removeProperty('--fs-say');
    const box = say.parentElement?.clientWidth || 0;
    if (!box) return;
    let wide = 0;
    ws.forEach((w) => { wide = Math.max(wide, w.offsetWidth); });
    const fs = parseFloat(getComputedStyle(say).fontSize);
    if (wide > box * 0.98) say.style.setProperty('--fs-say', `${Math.floor((fs * box * 0.98) / wide)}px`);
  }

  /* ---------- ответ, текст обо мне, кнопки, «Пропустить» ---------- */
  const linesHide = () => { gsap.killTweensOf(ws); gsap.set(ws, { yPercent: 115, rotate: 0, opacity: 0 }); };
  const linesIn = (delay = 0) => gsap.fromTo(ws, { yPercent: 115, rotate: 4, opacity: 1 }, { yPercent: 0, rotate: 0, opacity: 1, duration: 0.95, ease: 'expo.out', stagger: 0.09, delay, overwrite: true });
  const linesSet = () => { gsap.killTweensOf(ws); gsap.set(ws, { yPercent: 0, rotate: 0, opacity: 1 }); };
  const endHide = () => { gsap.killTweensOf(endEls); gsap.set(endEls, { opacity: 0, y: 18, visibility: 'hidden' }); };
  const endIn = (delay = 0) => {
    gsap.fromTo(endEls, { opacity: 0, y: 18, visibility: 'visible' }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.08, delay, overwrite: true });
    // «Пропустить» стоит там же, где поднимаются кнопки: исчезает сразу, чтобы они не наложились
    if (skip && !skip.hidden) { gsap.killTweensOf(skip); skip.hidden = true; }
  };
  const skipIn = () => { if (!skip) return; skip.hidden = false; gsap.fromTo(skip, { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 0.9 }); };
  const answered = (on: boolean) => hero.classList.toggle('is-answered', on);
  const settle = () => {
    telling = false;
    hero.classList.remove('is-telling');
    document.dispatchEvent(new CustomEvent('hero:settled'));
  };

  /* ---------- состояние пространства ---------- */
  const killSpace = () => { if (!sp) return; gsap.killTweensOf([sp.st, ...sp.curves, ...sp.fly]); };
  /** финал сразу: кривые сошлись в цель, всё нарисовано */
  const spaceFinal = () => {
    if (!sp) return;
    killSpace();
    sp.fly.forEach((f) => { f.v = -1; });
    Object.assign(sp.st, { m: 1, tangle: 0, axes: 1, fin: 1, dz: -5, dy: 0, dop: 0 });
    sp.curves.forEach((c) => { c.drawn = 1; c.vis = 1; });
  };

  /* ---------- сценарии ---------- */
  /** где сейчас рассказ: номер вопроса, сомнение или ответ */
  let beat: number | 'doubt' | 'answer' | null = null;
  const GAP = IN + DWELL + 0.12;
  function tell() {
    if (!sp) return;
    const s = sp;
    seq?.kill(); killSpace();
    flooding?.progress(1);
    played = true; telling = true;
    hero.classList.add('is-telling');
    answered(false);
    endHide(); linesHide(); skipIn();
    setPal(ASK[0]);
    s.fly.forEach((f) => { f.v = -1; });
    Object.assign(s.st, { m: 0, tangle: 0, axes: 0, fin: 0, dz: -5, dy: 0, dop: 0 });
    s.curves.forEach((c) => { c.drawn = 0; c.vis = 0; });
    const tl = gsap.timeline();
    states.ask.forEach((_, k) => {
      const t = 0.3 + k * GAP;
      tl.set(s.curves[k], { vis: 1 }, t);
      tl.fromTo(s.fly[k], { v: 0 }, { v: 1, duration: FLY, ease: 'none', immediateRender: false }, t);
      tl.call(() => { beat = k; if (k > 0) flood(ASK[k % ASK.length], s.anchor(k)); }, [], t + IN * 0.45);
      tl.call(() => s.burst(k), [], t + IN);
      // пройденная лента становится тонким следом
      tl.to(s.curves[k], { vis: 0, duration: 0.7, ease: 'power1.inOut' }, t + FLY - 0.1);
    });
    // сомнение: цвет сереет по всему экрану, кривые путаются, вопрос выплывает из глубины и дрожит
    const tD = 0.3 + (states.ask.length - 1) * GAP + IN + DWELL + 0.1;
    tl.call(() => { beat = 'doubt'; flood(DOUBT, null, 0.9); }, [], tD);
    tl.to(s.curves, { vis: 0, duration: 0.5, ease: 'power1.in', overwrite: 'auto' }, tD);
    tl.to(s.st, { tangle: 1, duration: 1.1, ease: 'sine.inOut' }, tD);
    tl.fromTo(s.st, { dz: -5, dy: 0, dop: 0 }, { dz: 0, dop: 1, duration: 1, ease: 'expo.out', immediateRender: false }, tD + 0.15);
    // ответ: жёлтый разливается из цели, кривые распутываются и сходятся, оси уезжают к цели
    const tA = tD + 2.2;
    tl.call(() => { beat = 'answer'; flood(ANSWER, s.target(), 0.9); answered(true); }, [], tA);
    tl.to(s.st, { dz: -1.6, dy: -1.1, dop: 0, duration: 0.6, ease: 'power2.in' }, tA);
    tl.to(s.st, { tangle: 0, duration: 1.3, ease: 'power2.inOut' }, tA);
    tl.to(s.st, { m: 1, axes: 1, duration: 1.5, ease: 'power3.inOut' }, tA);
    tl.to(s.curves, { vis: 1, duration: 0.7, stagger: 0.08, ease: 'power1.out' }, tA + 0.2);
    tl.to(s.st, { fin: 1, duration: 0.6, ease: 'power1.out' }, tA + 1.25);
    tl.call(() => s.burst('target'), [], tA + 1.35);
    tl.call(() => linesIn(), [], tA + 0.3);
    tl.call(() => endIn(), [], tA + 0.95);
    tl.call(settle, [], tA + 1.6);
    seq = tl;
  }
  /** короткий вход при возвращении: сразу ответ, ленты заново дорисовываются в цель */
  function brief() {
    if (!sp) return;
    const s = sp;
    seq?.kill(); killSpace();
    flooding?.progress(1);
    telling = false;
    hero.classList.remove('is-telling');
    if (skip) skip.hidden = true;
    endHide(); linesHide();
    setPal(ANSWER);
    answered(true);
    beat = 'answer';
    s.fly.forEach((f) => { f.v = -1; });
    Object.assign(s.st, { m: 1, tangle: 0, axes: 1, fin: 0, dz: -5, dy: 0, dop: 0 });
    s.curves.forEach((c) => { c.drawn = 0; c.vis = 1; });
    const tl = gsap.timeline();
    tl.to(s.curves, { drawn: 1, duration: 1.1, stagger: 0.1, ease: 'power2.out' }, 0.25);
    tl.to(s.st, { fin: 1, duration: 0.5, ease: 'power1.out' }, 1.1);
    tl.call(() => s.burst('target'), [], 1.2);
    tl.call(() => linesIn(), [], 0.1);
    tl.call(() => endIn(), [], 0.35);
    tl.call(settle, [], 0.6);
    seq = tl;
  }
  /** пропуск рассказа: жёлтый, ответ, текст и кнопки, кривые сходятся в цель */
  function finish() {
    if (!telling || !sp) return;
    const s = sp;
    seq?.kill(); killSpace();
    const focused = document.activeElement === skip;
    s.fly.forEach((f) => { f.v = -1; });
    gsap.to(s.st, { dop: 0, duration: 0.25 });
    gsap.to(s.curves, { drawn: 1, vis: 1, duration: 0.6, ease: 'power2.out' });
    gsap.to(s.st, { tangle: 0, m: 1, axes: 1, duration: 1, ease: 'power3.inOut' });
    gsap.to(s.st, { fin: 1, duration: 0.5, delay: 0.7 });
    flood(ANSWER, s.target(), 0.6);
    beat = 'answer';
    answered(true);
    linesIn();
    endIn();
    // фокус был на «Пропустить», которая исчезла: он переходит на главную кнопку, а не на начало страницы
    if (focused) cta[0]?.focus({ preventScroll: true });
    settle();
  }
  /** финал без анимации: блок открыт не первым, рассказ покажется, когда до него дойдут */
  function still() {
    seq?.kill();
    telling = false;
    spaceFinal();
    setPal(ANSWER);
    linesSet();
    if (skip) skip.hidden = true;
    gsap.set(endEls, { opacity: 1, y: 0, visibility: 'visible' });
    answered(true);
    beat = 'answer';
    sp?.draw();
  }
  const play = () => (played ? brief() : tell());

  // до шрифтов ничего не видно: ответ, текст и кнопки спрятаны (без скрипта виден ответ)
  linesHide();
  endHide();

  /* ---------- уход и возвращение ---------- */
  let leftT = 0;
  hero.addEventListener('block:leave', () => {
    sp?.stop(); seq?.kill();
    flooding?.progress(1);
    unchrome();
    if (telling) settle();
    // когда волна перехода закроет экран, блок ждёт возвращения уже в цветах ответа (короткий вход)
    clearTimeout(leftT);
    leftT = window.setTimeout(() => { if (played && !hero.classList.contains('is-current')) { pal = ANSWER; paint(hero, ANSWER); sp?.tone(ANSWER); } }, 1200);
  });

  /* ---------- мышь и касание ---------- */
  // клик или тап по пустому месту: во время рассказа пропускает его, потом цель вспыхивает конфетти
  let down = { x: 0, y: 0, t: 0 };
  skip?.addEventListener('click', finish);
  hero.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  hero.addEventListener('pointerup', (e) => {
    if ((e.target as Element).closest('a, button')) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || performance.now() - down.t > 450) return;
    if (telling) finish(); else sp?.poke();
  });
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !sp) return;
    const r = hero.getBoundingClientRect();
    sp.pointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1, true);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => sp?.pointer(0, 0, false));

  /* ---------- запуск: после шрифтов (от них зависят размеры), но не дольше 1,2 с ---------- */
  const fonts = document.fonts?.ready ?? Promise.resolve();
  Promise.race([fonts, new Promise((r) => setTimeout(r, 1200))]).then(() => {
    fit();
    sp = createSpace({
      canvas, space: spaceEl, aim: aimEl, questions: qs, cards, doubt: doubtEl,
      palettes: ASK, words, nick: hero.dataset.nick || 'd1fast', calm,
    });
    sp.tone(pal);
    sp.layout();
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { fit(); sp?.layout(); sp?.draw(); }, 120); }, { passive: true });
    // шрифт мог догрузиться позже: размеры вопросов пересчитываются
    fonts.then(() => { fit(); sp?.layout(); });
    if (!staged()) new IntersectionObserver(([en]) => { if (en.isIntersecting) sp?.start(); else sp?.stop(); }).observe(hero);
    if (isOpen()) { sp.start(); play(); }
    else { still(); document.dispatchEvent(new CustomEvent('hero:settled')); }
    onDone?.(hero);
  });

  /** Возвращение на первый экран: если рассказ ещё не видели, он целиком, иначе короткий вход. */
  (hero as HTMLElement & { _reenter?: () => void })._reenter = () => {
    clearTimeout(leftT);
    chrome().forEach((el) => paint(el, pal));
    sp?.layout();
    sp?.start();
    play();
  };
}

export function heroReenter(hero: HTMLElement) {
  (hero as HTMLElement & { _reenter?: () => void })._reenter?.();
}
