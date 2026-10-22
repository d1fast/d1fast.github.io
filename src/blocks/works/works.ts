import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { watchBlock, splitChars, rise, wrap, type Player } from '../../scripts/block';

/**
 * Работы: поле экранов. Фон блока = наклонная плоскость из настоящих экранов всех работ, приглушённая.
 * На входе плоскость влетает из глубины, один экран отрывается от неё и встаёт окном с чётким кадром,
 * рядом поднимается экран телефона, потом набирается текст и печатается «Ваш проект».
 * В покое ничего не крутится: плоскость стоит, окно плоское, нет ни одного цикла на rAF.
 * Кадры сменяются сами раз в HOLD секунд (setTimeout, тикер GSAP между сменами засыпает),
 * и при каждой смене плоскость проезжает на один столбец. Пальцем кадры листаются горизонтальным
 * свайпом по окну, с клавиатуры стрелками на точках. Строки других работ переключают проект на месте.
 */
const HOLD = 4.5; // сколько кадр стоит при автопоказе, с (works.css, works-fill)
const PERIOD = 3; // узор плоскости повторяется каждые 3 столбца: на столько полосу можно незаметно отмотать
const ROWS = 6; // рядов в кадре плоскости (кандидатов больше, лишние отсекаются замером)
const VERT = '(max-aspect-ratio: 4/5), (max-width: 760px) and (orientation: portrait)'; // вертикальная раскладка (works.css)
const TYPE_STEP = 0.035; // печать «Ваш проект»: секунд на букву

type Tile = { src: string; portrait: boolean };
type Mode = 'fade' | 'slide';

export function init(root: HTMLElement) {
  const q = gsap.utils.selector(root);
  const one = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T;
  const win = one('[data-works-win]');
  if (!win) return;
  const drift = one('[data-works-drift]');
  const plane = one('[data-works-plane]');
  const spin = one('[data-works-spin]');
  const strip = one('[data-works-strip]');
  const title = one('[data-works-title]');
  const card = one('[data-works-card]');
  const list = one('[data-works-list]');
  const stage = one('[data-works-stage]');
  const desk = one<HTMLAnchorElement>('[data-works-desk]');
  const phone = one('[data-works-phone]');
  const ghost = one('[data-works-ghost]');
  const caret = one('[data-works-caret]');
  const rows = q<HTMLElement>('[data-works-row]');
  const vert = matchMedia(VERT);
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const slugs: string[] = JSON.parse(root.dataset.worksSlugs || '[]');
  const accents: string[] = JSON.parse(root.dataset.worksAccents || '[]');

  // работы: карточка, кадры окна, кадры телефона, точки
  const P = q<HTMLElement>('[data-works-proj]').map((el, k) => {
    const name = el.querySelector<HTMLElement>('[data-works-name]')!;
    return {
      el, name,
      rest: [...el.querySelectorAll<HTMLElement>('[data-works-sub], [data-works-meta], [data-works-open]')],
      href: el.querySelector('[data-works-open]')!.getAttribute('href') || '',
      label: el.querySelector<HTMLAnchorElement>('[data-works-open] span')!.textContent + ': ' + name.textContent,
      shots: q<HTMLImageElement>(`[data-works-shot="${k}"]`),
      phones: q<HTMLImageElement>(`[data-works-pshot="${k}"]`),
      box: one(`[data-works-ticks="${k}"]`),
      ticks: q<HTMLButtonElement>(`[data-works-ticks="${k}"] [data-works-tick]`),
      slug: slugs[k] || '', accent: accents[k] || '',
    };
  });

  /* ---------- плоскость ---------- */
  const tiles: Tile[] = JSON.parse(plane.dataset.worksTiles || '[]');
  const deskT = tiles.filter((t) => !t.portrait), phoneT = tiles.filter((t) => t.portrait);
  let step = 0; // ширина столбца с зазором, px
  let sx = 0; // сдвиг полосы, держится в [-PERIOD*step, 0]
  let builtV = vert.matches, builtW = 0, built = false;

  /**
   * Собирает тайлы плоскости. Тип и картинка тайла зависят только от (c % 3, r), поэтому столбец c+3
   * повторяет столбец c и полосу можно отмотать на период незаметно. Сначала раскладывается щедрая сетка
   * пустых рамок, потом остаются только те, что видны в позе покоя (при сдвиге 0 и -3 столбца) или в начале
   * входа: так плоскость покрывает экран любой формы, а узлов и картинок столько, сколько видно.
   */
  const build = () => {
    const v = vert.matches, W = root.clientWidth || innerWidth;
    builtV = v; builtW = W;
    const tw = Math.round(v ? gsap.utils.clamp(130, W > 600 ? 250 : 170, W * 0.4) : gsap.utils.clamp(240, 380, W * 0.23));
    const g = Math.round(tw * 0.06);
    step = tw + g;
    const box = v ? 7 : 9; // коробка плоскости в столбцах: задаёт кадр, сами тайлы могут выходить за неё
    plane.style.setProperty('--pw', `${box * step - g}px`);
    plane.style.setProperty('--ph', `${Math.round(6 * (0.69 * tw + g) - g)}px`);
    const deskH = Math.round((tw * 9) / 16), phoneW = Math.round(tw * 0.5), phoneH = Math.round(phoneW / 0.4621);
    const all: { el: HTMLElement; src: string }[] = [];
    const frag = document.createDocumentFragment();
    for (let c = -PERIOD; c < box + PERIOD + 2; c++) {
      const k = ((c % PERIOD) + PERIOD) % PERIOD;
      const top = Math.round((1 - k) * 0.33 * tw);
      const put = (r: number, y: number) => {
        const tall = phoneT.length > 0 && (((k + r) % 4) + 4) % 4 === 1;
        const t = tall ? phoneT[(((k + r) % phoneT.length) + phoneT.length) % phoneT.length] : deskT[(((k * 3 + r) % deskT.length) + deskT.length) % deskT.length];
        const h = tall ? phoneH : deskH;
        if (t) {
          const el = document.createElement('span');
          el.className = 'works__tile';
          el.style.cssText = `left:${c * step + (tall && k % 2 ? tw - phoneW : 0)}px;top:${y}px;width:${tall ? phoneW : tw}px;height:${h}px`;
          frag.append(el);
          all.push({ el, src: t.src });
        }
        return h;
      };
      for (let r = 0, y = top; r < ROWS; r++) y += put(r, y) + g;
      for (let r = -1, y = top; r >= -2; r--) { const tall = phoneT.length > 0 && (((k + r) % 4) + 4) % 4 === 1; y -= (tall ? phoneH : deskH) + g; put(r, y); }
    }
    strip.replaceChildren(frag);
    // замер: поза покоя при сдвиге 0 и -3 столбца и поза в начале входа (плоскость дальше и видна шире)
    const keep = new Set<HTMLElement>();
    const saved = [plane.style.transform, spin.style.transform, strip.style.transform];
    const r0 = root.getBoundingClientRect(), m = 28;
    const look = (pt: string, st: string, sx0: number) => {
      plane.style.transform = pt; spin.style.transform = st; strip.style.transform = `translateX(${sx0}px)`;
      for (const { el } of all) {
        if (keep.has(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > r0.left - m && r.left < r0.right + m && r.bottom > r0.top - m && r.top < r0.bottom + m) keep.add(el);
      }
    };
    look('rotateX(56deg)', 'rotate(-24deg)', 0);
    look('rotateX(56deg)', 'rotate(-24deg)', -PERIOD * step);
    [plane.style.transform, spin.style.transform, strip.style.transform] = saved;
    for (const { el, src } of all) {
      if (!keep.has(el)) { el.remove(); continue; }
      const img = document.createElement('img');
      img.alt = ''; img.decoding = 'async'; img.draggable = false; img.src = src;
      el.append(img);
    }
    strip.dataset.step = String(step);
    sx = 0;
    gsap.set(strip, { x: 0 });
    built = true;
  };

  let ride: gsap.core.Tween | null = null;
  /** Плоскость проезжает на один столбец (dir 1 дальше, -1 назад). Перед шагом полоса незаметно отматывается на период. */
  const stepPlane = (dir: number) => {
    if (!step) return;
    ride?.progress(1);
    if (dir > 0 && sx - step < -PERIOD * step - 0.5) sx += PERIOD * step;
    if (dir < 0 && sx + step > 0.5) sx -= PERIOD * step;
    gsap.set(strip, { x: sx });
    sx -= dir * step;
    ride = gsap.to(strip, { x: sx, duration: 0.9, ease: 'power2.inOut', onComplete: () => { ride = null; } });
  };

  /* ---------- название: широкий гротеск, слово никогда не переносится ---------- */
  const names: Player[] = [];
  const nameOf = (k: number) => (names[k] ??= splitChars(P[k].name, { yPercent: 110, duration: 0.7, stagger: 0.022 }));
  /** Сужает ширину шрифта шагами по 5% до 100%, потом уменьшает кегль, пока самое длинное слово
   *  (если название стоит в одну строку без переноса, то вся строка) не влезет в свою коробку.
   *  С какой ширины начинать и до какого кегля можно уменьшать, задаёт works.css (--name-st, --name-min). */
  const fitName = () => {
    const el = P[pi].name;
    if (!el.offsetWidth) return;
    el.style.fontStretch = ''; el.style.fontSize = '';
    const cs = getComputedStyle(el);
    const line = cs.whiteSpace === 'nowrap';
    const words = [...el.querySelectorAll<HTMLElement>('.wd-mask')];
    const box = el.clientWidth;
    const wide = () => (line || !words.length ? el.scrollWidth > box + 1 : words.some((w) => w.offsetWidth > box + 1));
    let s = parseFloat(cs.getPropertyValue('--name-st')) || 151;
    while (wide() && s > 100) { s = Math.max(100, s - 5); el.style.fontStretch = `${s}%`; }
    let fs = parseFloat(cs.fontSize);
    const min = parseFloat(cs.getPropertyValue('--name-min')) || 24;
    while (wide() && fs > min) { fs -= 1; el.style.fontSize = `${fs}px`; }
  };

  /* ---------- «Ваш проект»: подсказка в пустом поле с курсором ---------- */
  const gchars = SplitText.create(ghost, { type: 'chars', charsClass: 'works__gc', aria: 'none' }).chars as HTMLElement[];
  gchars.forEach((c, i) => c.style.setProperty('--i', String(i)));
  let offs: number[] = [], gw = 0;
  // курсор стоит в потоке после текста; печать двигает его только transform: x = правый край буквы минус ширина строки
  const measureType = () => {
    const r = ghost.getBoundingClientRect();
    gw = r.width;
    offs = gchars.map((c) => c.getBoundingClientRect().right - r.right);
  };

  /* ---------- состояние ---------- */
  let pi = 0; // активная работа
  let cur = 0; // активный кадр
  let active = false; // блок на экране
  let auto = false; // автопоказ запущен (после входа)
  let ready = false; // вход доигран, работает параллакс
  let first = true; // вход по прямой ссылке, без перехода сцены
  let timer = 0, runRaf = 0;
  let swap: gsap.core.Timeline | null = null;
  let flip: gsap.core.Timeline | null = null;
  const holds = new Set<string>(); // причины паузы автопоказа: фокус с клавиатуры и палец на экране

  const proj = () => P[pi];
  const stopTimer = () => { clearTimeout(timer); timer = 0; cancelAnimationFrame(runRaf); runRaf = 0; };
  /** Перезапускает показ кадра: полный HOLD и заполнение точки с нуля. На паузе таймер снят, точка замирает. */
  const arm = () => {
    stopTimer();
    const p = proj();
    const t = p.ticks[cur];
    p.ticks.forEach((b) => b !== t && b.classList.remove('is-run'));
    const paused = !auto || !active || holds.size > 0 || document.hidden || !!flip;
    root.classList.toggle('is-paused', paused);
    if (paused || p.shots.length < 2 || !t) return;
    t.classList.remove('is-run');
    // класс снимается и ставится в следующем кадре, чтобы CSS-анимация началась заново
    runRaf = requestAnimationFrame(() => { runRaf = 0; t.classList.add('is-run'); });
    timer = window.setTimeout(() => show(cur + 1), HOLD * 1000);
  };
  const hold = (why: string, on: boolean) => { if (on) holds.add(why); else holds.delete(why); arm(); };

  const markTicks = () => proj().ticks.forEach((b, j) => {
    const on = j === cur;
    b.setAttribute('aria-current', String(on));
    b.tabIndex = on ? 0 : -1;
    if (!on) b.classList.remove('is-run');
  });
  const markShots = () => proj().shots.forEach((s, j) => (j === cur ? s.removeAttribute('aria-hidden') : s.setAttribute('aria-hidden', 'true')));

  /** Мгновенно ставит первые кадры активной работы. */
  const showFirst = () => {
    const p = proj();
    cur = 0;
    gsap.killTweensOf([...p.shots, ...p.phones]);
    p.shots.forEach((s, j) => gsap.set(s, { opacity: j ? 0 : 1, zIndex: j ? 0 : 1, clearProps: 'transform,willChange' }));
    p.phones.forEach((s, j) => gsap.set(s, { opacity: j ? 0 : 1, zIndex: j ? 0 : 1, clearProps: 'transform,willChange' }));
    markTicks();
    markShots();
  };

  // на время смены кадр получает свой слой: прозрачность и масштаб считает композитор, картинка не перерисовывается каждый кадр
  const LAYER = 'opacity, transform';
  /** Проявление кадра поверх прежнего (таймер, точки, клавиши). */
  const fadeIn = (tl: gsap.core.Timeline, from: HTMLElement, to: HTMLElement, at: number) => {
    gsap.set(to, { zIndex: 2, willChange: LAYER });
    tl.fromTo(to, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, at)
      .fromTo(to, { scale: 1.035 }, { scale: 1, duration: 0.8, ease: 'expo.out', clearProps: 'transform' }, at)
      .add(() => { gsap.set(from, { opacity: 0, zIndex: 0, clearProps: 'transform,willChange' }); gsap.set(to, { zIndex: 1, clearProps: 'willChange' }); }, at + 0.8);
  };

  /** Смена кадра. mode slide: свайп, кадр уезжает в сторону жеста (dir 1 дальше, -1 назад). */
  const show = (i: number, mode: Mode = 'fade', dir = 1) => {
    const p = proj();
    const n = p.shots.length;
    if (n < 2 || flip) return;
    i = ((i % n) + n) % n;
    if (i === cur) return;
    swap?.progress(1);
    const from = p.shots[cur], to = p.shots[i];
    const tl = gsap.timeline({ onComplete: () => { if (swap === tl) swap = null; } });
    swap = tl;
    if (mode === 'fade') fadeIn(tl, from, to, 0);
    else {
      const w = desk.clientWidth;
      gsap.set(to, { zIndex: 2, willChange: LAYER });
      gsap.set(from, { willChange: LAYER });
      tl.fromTo(to, { x: dir * 0.12 * w, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: 'expo.out', clearProps: 'transform' }, 0)
        .to(from, { x: -dir * 0.12 * w, opacity: 0, duration: 0.3, ease: 'power2.in' }, 0)
        .add(() => { gsap.set(from, { opacity: 0, zIndex: 0, clearProps: 'transform,willChange' }); gsap.set(to, { zIndex: 1, clearProps: 'willChange' }); }, 0.45);
    }
    // телефон: кадр i % число телефонных кадров
    const np = p.phones.length;
    if (np > 1 && cur % np !== i % np) fadeIn(tl, p.phones[cur % np], p.phones[i % np], 0.08);
    cur = i;
    markTicks();
    markShots();
    stepPlane(dir);
    arm();
  };

  /* ---------- вход ---------- */
  const tracks = P[0].ticks.map((b) => b.firstElementChild as HTMLElement);
  const entry = gsap.timeline({ paused: true });
  entry
    .fromTo(plane, { rotationX: 74, z: -700 }, { rotationX: 56, z: 0, duration: 1.1, ease: 'expo.out' }, 0)
    .fromTo(spin, { rotation: -8 }, { rotation: -24, duration: 1.1, ease: 'expo.out' }, 0)
    .fromTo(plane, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 0)
    .fromTo(title, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, 0.05)
    // отрыв: экран в позе плоскости встаёт в плоскость экрана и становится окном
    .fromTo(win, { rotationX: 56, rotation: -24, scale: 0.42, yPercent: 18, transformPerspective: () => (vert.matches ? 700 : 1100) },
      { rotationX: 0, rotation: 0, scale: 1, yPercent: 0, duration: 1, ease: 'expo.inOut',
        onStart: () => { win.style.willChange = 'transform'; },
        onComplete: () => gsap.set(win, { clearProps: 'transform,willChange' }) }, 0.35)
    .fromTo(win, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' }, 0.35)
    .to(plane, { opacity: () => (vert.matches ? 0.38 : 0.34), duration: 0.6, ease: 'power2.inOut' }, 0.75)
    .fromTo(phone, { yPercent: 14, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }, 1.1)
    .fromTo(tracks, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power3.out', stagger: 0.04 }, 1.15)
    .call(measureType, [], 1.25);
  // «Ваш проект» печатается по букве, курсор идёт за последней буквой
  gchars.forEach((c, k) => entry.call(() => { gsap.set(c, { opacity: 1 }); gsap.set(caret, { x: offs[k] ?? 0 }); }, [], 1.25 + (k + 1) * TYPE_STEP));
  entry
    .call(() => { ready = true; auto = true; arm(); }, [], 1.6)
    .call(() => caret.classList.add('is-blink'), [], 1.3 + gchars.length * TYPE_STEP);
  const intro = wrap(entry);
  const restIn = rise([...P[0].rest, list], { y: 16, stagger: 0.06, duration: 0.5, ease: 'expo.out' });

  /* ---------- параллакс за мышью: сдвиг поля без поворота, плоскость не перерисовывается ---------- */
  const px = gsap.quickTo(drift, 'x', { duration: 0.9, ease: 'power3.out' });
  const py = gsap.quickTo(drift, 'y', { duration: 0.9, ease: 'power3.out' });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !ready || !fine.matches) return;
    px(-(e.clientX / innerWidth * 2 - 1) * 24);
    py(-(e.clientY / innerHeight * 2 - 1) * 16);
  }, { passive: true });
  root.addEventListener('pointerleave', () => { if (ready) { px(0); py(0); } });

  /* ---------- окно и телефон рядом: мышь, палец, клик. Жесты слушает общая обёртка, поэтому телефон, свисающий
     ниже окна, тоже листает кадры и открывает кейс ---------- */
  // курсор над окном показ не останавливает и кнопку не подсвечивает: кадры идут сами, как и без мыши
  // пауза только для фокуса с клавиатуры: клик мышью по точке не останавливает показ насовсем
  stage.addEventListener('focusin', (e) => { if ((e.target as Element).matches(':focus-visible')) hold('focus', true); });
  stage.addEventListener('focusout', (e) => { if (!stage.contains(e.relatedTarget as Node)) hold('focus', false); });

  let down: { x: number; y: number } | null = null; // мышь: клик после смещения отменяется
  let drag: { id: number; x: number; y: number; dx: number; dy: number; on: boolean; off: boolean } | null = null;
  let caught = false; // жест забрало окно: сцена не листает блок, клик не открывает кейс
  win.addEventListener('dragstart', (e) => e.preventDefault());
  win.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { down = { x: e.clientX, y: e.clientY }; return; }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, on: false, off: false };
    caught = false;
    hold('touch', true);
  });
  win.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d || e.pointerId !== d.id || d.off || flip) return;
    d.dx = e.clientX - d.x; d.dy = e.clientY - d.y;
    if (!d.on) {
      const ax = Math.abs(d.dx), ay = Math.abs(d.dy);
      // вертикальный жест остаётся у сцены и листает блоки
      if (ay > 8 && ay >= ax) { d.off = true; return; }
      if (ax <= 8) return;
      d.on = caught = true;
      swap?.progress(1);
      gsap.killTweensOf(proj().shots[cur]);
      gsap.set(proj().shots[cur], { willChange: LAYER });
      try { win.setPointerCapture(e.pointerId); } catch { /* палец уже отпущен */ }
    }
    const w = desk.clientWidth || 1;
    gsap.set(proj().shots[cur], { x: d.dx * 0.6, opacity: 1 - Math.min(1, Math.abs(d.dx) / w) * 0.5 });
  });
  const release = (e: PointerEvent, cancel: boolean) => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    drag = null;
    if (d.on) {
      const dir = d.dx < 0 ? 1 : -1;
      if (!cancel && Math.abs(d.dx) > 40 && Math.abs(d.dx) > 1.2 * Math.abs(d.dy) && proj().shots.length > 1) show(cur + dir, 'slide', dir);
      else gsap.to(proj().shots[cur], { x: 0, opacity: 1, duration: 0.4, ease: 'expo.out', clearProps: 'transform,willChange' });
    }
    hold('touch', false);
  };
  win.addEventListener('pointerup', (e) => release(e, false));
  win.addEventListener('pointercancel', (e) => release(e, true));
  win.addEventListener('touchend', (e) => { if (caught) e.stopPropagation(); });
  win.addEventListener('click', (e) => {
    const moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8;
    const skip = caught || moved;
    caught = false; down = null;
    if (skip) { e.preventDefault(); return; }
    // клик по телефону передаётся ссылке окна (у неё же view-transition и адрес активной работы)
    if (!desk.contains(e.target as Node)) desk.click();
  });

  /* ---------- точки: клик, Enter и Space выбирают кадр; ←/→ переводят фокус и выбирают (одна точка в Tab) ---------- */
  stage.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-works-tick]');
    if (!b) return;
    const i = proj().ticks.indexOf(b);
    if (i >= 0 && i !== cur) show(i, 'fade', i > cur ? 1 : -1);
  });
  stage.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !(e.target as Element).closest?.('[data-works-tick]')) return;
    e.preventDefault();
    const p = proj(), n = p.ticks.length, dir = e.key === 'ArrowRight' ? 1 : -1;
    const i = (cur + dir + n) % n;
    show(i, 'fade', dir);
    p.ticks[i].focus();
  });

  /* ---------- другие работы: строка переключает проект на месте ---------- */
  const markRows = () => rows.filter((r) => !r.hidden).forEach((r, j) => r.classList.toggle('is-extra', j >= 2));
  /** Ставит работу k без анимации: карточка, кадры, точки, ссылка окна, акцент. */
  const setProject = (k: number) => {
    const a = proj(), b = P[k];
    if (a !== b) {
      a.el.hidden = true; b.el.hidden = false;
      a.shots.forEach((s) => (s.hidden = true)); b.shots.forEach((s) => (s.hidden = false));
      a.phones.forEach((s) => (s.hidden = true)); b.phones.forEach((s) => (s.hidden = false));
      a.box.hidden = true; b.box.hidden = false;
      a.ticks.forEach((t) => t.classList.remove('is-run'));
      rows.forEach((r) => (r.hidden = Number(r.dataset.worksRow) === k));
    }
    pi = k;
    phone.hidden = !b.phones.length;
    desk.href = b.href;
    desk.setAttribute('aria-label', b.label);
    desk.style.setProperty('view-transition-name', `work-${b.slug}`);
    if (b.accent) root.style.setProperty('--accent', b.accent); else root.style.removeProperty('--accent');
    markRows();
    showFirst();
    fitName();
  };
  const pick = (k: number) => {
    if (k === pi || flip) return;
    const a = proj();
    const refocus = list.contains(document.activeElement);
    swap?.progress(1);
    stopTimer();
    const tl = gsap.timeline({ onComplete: () => { flip = null; arm(); } });
    flip = tl;
    root.classList.add('is-paused');
    tl.to(a.name.querySelectorAll('.ch'), { yPercent: -110, duration: 0.25, ease: 'power2.in', stagger: 0.008 }, 0)
      .to(a.rest, { opacity: 0, y: -8, duration: 0.25, ease: 'power2.in' }, 0)
      .to(proj().shots[cur], { opacity: 0, duration: 0.25, ease: 'power2.in' }, 0)
      .add(() => {
        names[pi]?.reset();
        gsap.set(a.rest, { clearProps: 'opacity,transform' });
        setProject(k);
        const b = proj();
        nameOf(k).play(0);
        // новые кадры проявляются в окне, текст поднимается
        tl.fromTo(b.shots[0], { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.3)
          .fromTo(b.shots[0], { scale: 1.035 }, { scale: 1, duration: 0.8, ease: 'expo.out', clearProps: 'transform' }, 0.3)
          .fromTo(b.rest, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.06, clearProps: 'transform' }, 0.3);
        if (refocus) b.rest[b.rest.length - 1]?.focus({ preventScroll: true });
        stepPlane(1);
      }, 0.27)
      .set({}, {}, 1.1); // длина смены, пока внутри добавляются твины новой работы
  };
  list.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-works-pick]');
    if (b) pick(Number(b.dataset.worksPick) || 0);
  });
  markRows();

  /* ---------- сброс в позу до входа (идемпотентный) ---------- */
  const prime = () => {
    ready = false; auto = false;
    // палец, ушедший вместе с блоком (вертикальный свайп по окну), не держит автопоказ на паузе после возвращения
    drag = null; caught = false; holds.delete('touch');
    stopTimer();
    swap?.kill(); swap = null;
    flip?.kill(); flip = null;
    ride?.kill(); ride = null;
    intro.reset(); restIn.reset();
    names.forEach((n) => n?.reset());
    if (pi !== 0) { gsap.set(proj().rest, { clearProps: 'opacity,transform' }); setProject(0); }
    else showFirst();
    gsap.set(P[0].shots[0], { opacity: 1 });
    sx = 0;
    gsap.set(strip, { x: 0 });
    gsap.set(gchars, { opacity: 0 });
    caret.classList.remove('is-blink');
    gsap.set(caret, { x: 0, opacity: 0 });
    px.tween.pause(); py.tween.pause();
    gsap.set(drift, { x: 0, y: 0 });
    root.classList.add('is-paused');
  };

  /* ---------- перестройка плоскости: смена раскладки или ширина изменилась больше чем на 10% ---------- */
  let rt = 0, pending = false;
  const rebuild = () => {
    if (entry.isActive()) { pending = true; return; }
    pending = false;
    if (vert.matches === builtV && Math.abs(root.clientWidth - builtW) <= builtW * 0.1) return;
    ride?.kill(); ride = null;
    build();
    entry.invalidate();
    if (entry.progress() === 1) gsap.set(plane, { opacity: vert.matches ? 0.38 : 0.34 });
  };
  entry.eventCallback('onComplete', () => { if (pending) rebuild(); });
  new ResizeObserver(() => {
    fitName();
    clearTimeout(rt);
    rt = window.setTimeout(rebuild, 150);
  }).observe(root);
  document.fonts?.addEventListener?.('loadingdone', () => fitName());

  /* ---------- жизненный цикл ---------- */
  nameOf(0);
  fitName();
  prime();
  root.classList.add('is-primed');

  // Блок открылся переходом сцены: ирис ещё ~0,4 с раскрывается поверх, вход ждёт. Слушатель стоит раньше watchBlock.
  root.addEventListener('block:enter', (e) => { first = !!(e as CustomEvent<{ first?: boolean }>).detail?.first; });
  watchBlock(root, () => {
    const S = first ? 0.1 : 0.25;
    first = true;
    active = true;
    if (!built) build();
    prime();
    measureType();
    gsap.set(caret, { x: -gw, opacity: 1 });
    intro.play(S);
    nameOf(0).play(S + 0.5);
    restIn.play(S + 0.75);
  }, () => {
    active = false;
    prime();
  });
  document.addEventListener('visibilitychange', () => { if (active) arm(); });

  // Плоскость собирается отдельной задачей, чтобы не складывать её с остальной настройкой в одну длинную.
  // Сцена ждёт, пока первые кадры окна и телефона и файлы плоскости декодируются, но не дольше 350 мс.
  const decoded = (list: (HTMLImageElement | undefined)[]) => {
    const seen = new Set<string>();
    return Promise.all(list.filter((im): im is HTMLImageElement => !!im && !seen.has(im.src) && !!seen.add(im.src)).map((im) => im.decode().catch(() => {})));
  };
  return Promise.race([
    new Promise((r) => setTimeout(r)).then(() => {
      if (!built) build();
      return decoded([P[0].shots[0], P[0].phones[0], ...strip.querySelectorAll('img')]);
    }),
    new Promise((r) => setTimeout(r, 350)),
  ]).then(() => {});
}
