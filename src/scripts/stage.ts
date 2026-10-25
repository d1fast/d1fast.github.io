import { gsap } from 'gsap';

/**
 * Сцена главной: страница листается блоками. Колесо, клавиши, свайп, точки навигации и ссылки
 * переносят на соседний блок через переход на холсте поверх страницы: экран закрывается цветом
 * следующего блока, страница под ним мгновенно переезжает, и холст открывает новый блок.
 * У каждого блока свой переход на входе. Если блок выше экрана, сначала прокручивается он сам.
 * Блок получает события block:enter и block:leave и класс is-current.
 */

type Dir = 1 | -1;
type Colors = { bg: string; fg: string; accent: string };
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, p: number, cover: boolean, dir: Dir, c: Colors, s: FxState) => void;
type FxState = { cells?: { x: number; y: number; s: number; o: number; a: boolean }[]; cx?: number; cy?: number };

const COVER = 0.62;
const REVEAL = 0.72;
const html = document.documentElement;
const blocks = () => [...document.querySelectorAll<HTMLElement>('.block[data-block]')];
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outQ = (t: number) => 1 - Math.pow(1 - t, 3);
const inQ = (t: number) => t * t * t;

/* ---------- переходы ---------- */

// волна: цветная полоса проходит через экран, края волнистые, впереди тонкая полоса акцента
function waveFx(layers: number): Draw {
  return (ctx, w, h, p, cover, dir, c) => {
    const amp = Math.min(70, h * 0.07);
    const t = performance.now() / 1000;
    const Y = (s: number) => (dir === 1 ? h + amp - s * (h + 2 * amp) : -amp + s * (h + 2 * amp));
    const cols = layers === 2 ? [c.accent, c.bg] : [c.bg];
    cols.forEach((col, k) => {
      const lag = layers === 2 ? (cover ? (k === 0 ? 0 : 0.16) : (k === 0 ? 0.16 : 0)) : 0;
      const q = inOut(clamp((p - lag) / (1 - (layers === 2 ? 0.16 : 0))));
      const lead = cover ? q : 1;
      const trail = cover ? 0 : q;
      if (lead - trail <= 0.0001) return;
      const bend = Math.sin(Math.PI * q) * amp;
      const edge = (s: number, phase: number) => {
        const pts: [number, number][] = [];
        for (let x = 0; x <= w + 24; x += 24) pts.push([x, Y(s) + bend * Math.sin((x / w) * Math.PI * 2.2 + t * 3 + phase)]);
        return pts;
      };
      const a = edge(lead, 0), b = edge(trail, 1.7).reverse();
      ctx.beginPath();
      a.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      b.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    });
  };
}

// пиксели: экран зарастает квадратами, как в старой игре, и так же рассыпается
const pixelFx: Draw = (ctx, w, h, p, cover, dir, c, s) => {
  if (!s.cells) {
    const size = Math.ceil(Math.max(w, h) / 16);
    const cols = Math.ceil(w / size), rows = Math.ceil(h / size);
    s.cells = [];
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const diag = dir === 1 ? (rows - 1 - r) / rows : r / rows;
      s.cells.push({ x: k * size, y: r * size, s: size, o: 0.86 * (0.55 * Math.random() + 0.45 * diag), a: Math.random() < 0.09 });
    }
  }
  const q = cover ? p : p;
  for (const cell of s.cells) {
    const on = cover ? cell.o < q : cell.o >= q;
    if (!on) continue;
    ctx.fillStyle = cell.a && (cover ? q - cell.o < 0.12 : cell.o - q < 0.12) ? c.accent : c.bg;
    ctx.fillRect(cell.x, cell.y, cell.s + 1, cell.s + 1);
  }
};

// диафрагма: тёмный круг сходится в точку и раскрывается уже на новом блоке
const irisFx: Draw = (ctx, w, h, p, cover, _dir, c, s) => {
  const cx = s.cx ?? w / 2, cy = s.cy ?? h / 2;
  const R = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + 6;
  const r = cover ? R * (1 - inOut(p)) : R * inOut(p);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  if (r > 0.5) ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
  ctx.fillStyle = c.bg;
  ctx.fill('evenodd');
  if (r > 2) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.stroke();
    // засечки по кругу, как на объективе
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + p * 1.5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6)); ctx.lineTo(cx + Math.cos(a) * (r + 16), cy + Math.sin(a) * (r + 16));
      ctx.lineWidth = 1; ctx.stroke();
    }
  }
};

// жалюзи: горизонтальные планки заезжают с разных сторон и уезжают
const blindsFx: Draw = (ctx, w, h, p, cover, dir, c) => {
  const n = 7, sh = h / n, spread = 0.3;
  for (let i = 0; i < n; i++) {
    const order = dir === 1 ? i : n - 1 - i;
    const q = inOut(clamp((p - (order / (n - 1)) * spread) / (1 - spread)));
    const fromLeft = i % 2 === 0;
    let x0: number, x1: number;
    if (cover) { x0 = fromLeft ? 0 : w * (1 - q); x1 = fromLeft ? w * q : w; }
    else { x0 = fromLeft ? w * q : 0; x1 = fromLeft ? w : w * (1 - q); }
    if (x1 - x0 < 0.5) continue;
    ctx.fillStyle = c.bg;
    ctx.fillRect(x0, i * sh - 0.5, x1 - x0, sh + 1);
    const edgeX = cover ? (fromLeft ? x1 : x0) : (fromLeft ? x0 : x1);
    ctx.fillStyle = c.accent;
    ctx.fillRect(edgeX - 1.5, i * sh, 3, sh);
  }
};

// самолётик тянет за собой новый экран по диагонали
const planeFx: Draw = (ctx, w, h, p, cover, dir, c) => {
  const E = (w + h) / (2 * Math.SQRT2) + 40;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(dir === 1 ? -Math.PI / 4 : (3 * Math.PI) / 4);
  const q = inOut(p);
  const lead = cover ? -E + q * 2 * E : E + 10;
  const trail = cover ? -E - 10 : -E + q * 2 * E;
  const L = w + h;
  if (lead > trail) {
    ctx.fillStyle = c.bg;
    ctx.fillRect(trail, -L, lead - trail, 2 * L);
    ctx.fillStyle = c.accent;
    ctx.fillRect((cover ? lead : trail) - 2, -L, 4, 2 * L);
  }
  if (cover) {
    // самолётик летит чуть впереди края и покачивается
    const px = lead + 70, py = Math.sin(p * Math.PI * 3) * 26;
    ctx.translate(px, py);
    ctx.rotate(Math.cos(p * Math.PI * 3) * 0.25);
    ctx.scale(2.2, 2.2);
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-14, -11); ctx.lineTo(-8, 0); ctx.lineTo(-14, 11); ctx.closePath();
    ctx.fillStyle = c.accent; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(16, 0); ctx.strokeStyle = c.bg; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
};

const EFFECTS: Record<string, Draw> = {
  hero: waveFx(2),
  services: pixelFx,
  works: irisFx,
  process: blindsFx,
  contacts: planeFx,
};

/* ---------- сцена ---------- */

let bound = false;
export type StageHooks = { prepare?: (block: HTMLElement) => Promise<unknown> | void; onArrive?: (block: HTMLElement) => void };

export function initStage(hooks: StageHooks = {}) {
  if (bound) return;
  const list = blocks();
  if (!html.classList.contains('stage') || list.length < 2) return;
  bound = true;
  html.classList.add('stage-on');

  const canvas = document.createElement('canvas');
  canvas.className = 'stage-fx';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0;
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();

  const lines = [...document.querySelectorAll<HTMLAnchorElement>('[data-dot]')];
  let current: HTMLElement = list[0];
  let busy = false, moving = false;
  let lastWheel = 0, lastInner = 0;
  let pointer: { x: number; y: number } | null = null;
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });

  const canScroll = (el: Element, dir: Dir) => (dir === 1 ? el.scrollHeight - el.clientHeight - el.scrollTop > 2 : el.scrollTop > 2);
  const colorsOf = (b: HTMLElement): Colors => {
    const cs = getComputedStyle(b);
    return { bg: cs.getPropertyValue('--bg').trim() || '#000', fg: cs.getPropertyValue('--fg').trim() || '#fff', accent: cs.getPropertyValue('--accent').trim() || '#fff' };
  };

  const arrive = (b: HTMLElement, dir: Dir, first = false) => {
    const prev = current;
    if (prev !== b || first) {
      if (prev !== b) { prev.classList.remove('is-current'); prev.dispatchEvent(new CustomEvent('block:leave')); }
    }
    current = b;
    b.scrollTop = dir === -1 && !first ? b.scrollHeight : 0;
    window.scrollTo(0, b.offsetTop);
    html.setAttribute('data-theme', b.dataset.theme || 'hero');
    lines.forEach((l) => { const on = l.dataset.dot === b.id; l.classList.toggle('is-active', on); if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body && !b.contains(a) && !a.closest('.site-header, .dots')) a.blur();
    const hash = b.dataset.block === 'hero' ? '' : '#' + b.id;
    if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
    // переключатель языка ведёт в тот же блок другой версии
    document.querySelectorAll<HTMLAnchorElement>('.site-header__lang').forEach((l) => { l.hash = hash; });
    b.classList.add('is-current');
    hooks.onArrive?.(b);
    b.dispatchEvent(new CustomEvent('block:enter', { detail: { dir, first } }));
  };

  const run = (draw: Draw, colors: Colors, dir: Dir, cover: boolean, dur: number, st: FxState) =>
    new Promise<void>((resolve) => {
      const o = { p: 0 };
      gsap.to(o, { p: 1, duration: dur, ease: 'none', onUpdate: () => { ctx.clearRect(0, 0, W, H); draw(ctx, W, H, o.p, cover, dir, colors, st); }, onComplete: () => resolve() });
    });

  const release = () => { if (performance.now() - lastWheel > 240) busy = false; else setTimeout(release, 80); };

  /** Фокус в начало блока (заголовок): следующий Tab идёт по этому блоку, а не возвращает назад. */
  const focusBlock = (b: HTMLElement) => {
    const h = b.querySelector<HTMLElement>('h1, h2') || b;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  };

  const goTo = async (b: HTMLElement, dirIn?: Dir, focus = false) => {
    if (busy || b === current) { if (focus && b === current) focusBlock(b); return; }
    const all = blocks();
    const dir: Dir = dirIn ?? (all.indexOf(b) > all.indexOf(current) ? 1 : -1);
    busy = true; moving = true;
    canvas.classList.add('is-on');
    const draw = EFFECTS[b.dataset.block || ''] || waveFx(1);
    const colors = colorsOf(b);
    const st: FxState = pointer ? { cx: pointer.x, cy: pointer.y } : {};
    const prep = Promise.resolve(hooks.prepare?.(b)).catch(() => {});
    await run(draw, colors, dir, true, COVER, st);
    await Promise.race([prep, new Promise((r) => setTimeout(r, 400))]);
    ctx.clearRect(0, 0, W, H);
    draw(ctx, W, H, 1, true, dir, colors, st);
    arrive(b, dir);
    if (focus) focusBlock(b);
    await run(draw, colors, dir, false, REVEAL, st);
    ctx.clearRect(0, 0, W, H);
    canvas.classList.remove('is-on');
    moving = false;
    release();
  };
  const step = (dir: Dir) => {
    const all = blocks();
    const next = all[all.indexOf(current) + dir];
    if (next) goTo(next, dir);
  };

  // колесо и тачпад. Жест копит прокрутку и листает блок, когда набралось WHEEL_STEP пикселей: тачпад присылает
  // мелкие порции (1–30 px), колесо мыши сразу 100. Остаток жеста и хвост инерции дальше не листают.
  // Новый жест: пауза, смена направления или новый разгон посреди затухающей инерции.
  const WHEEL_STEP = 40;
  let gAcc = 0, gDone = false, gDir = 0, gPrev = 0, gLast = 0;
  addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    const dy = e.deltaY * unit, dx = e.deltaX * unit;
    if (Math.abs(dy) < Math.abs(dx)) return;
    const now = performance.now();
    const dir: Dir = dy > 0 ? 1 : -1, mag = Math.abs(dy);
    const fresh = now - gLast > 180 || dir !== gDir || (mag > gPrev * 1.7 && mag > 10);
    gLast = now; gPrev = mag;
    if (fresh) { gAcc = 0; gDone = false; gDir = dir; }
    if (busy) {
      e.preventDefault();
      // переход идёт или это хвост того же жеста: ждём тишины
      if (moving || !fresh) { gDone = true; lastWheel = now; return; }
      busy = false;
    }
    lastWheel = now;
    const t = e.target as Element;
    const inner = t.closest?.('textarea, [data-scroll-inside]');
    if (inner && canScroll(inner, dir)) return;
    if (canScroll(current, dir)) { lastInner = now; gDone = true; return; }
    e.preventDefault();
    // инерция докрутила блок до края: хвост жеста не листает дальше
    if (now - lastInner < 260) { lastInner = now; gDone = true; return; }
    if (gDone) return;
    gAcc += mag;
    if (gAcc < WHEEL_STEP) return;
    gDone = true;
    step(dir);
  }, { passive: false });

  // свайпы
  let ty = 0, tStartEdge: Record<number, boolean> = {}, tNav = false, tDy = 0, tSkip = false;
  addEventListener('touchstart', (e) => {
    ty = e.touches[0].clientY; tDy = 0; tNav = false;
    // жесты на перетаскиваемых штуках и мини-играх принадлежат им
    tSkip = !!(e.target as Element).closest?.('[data-drag]');
    tStartEdge = { 1: !canScroll(current, 1), [-1]: !canScroll(current, -1) };
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 || tSkip) return;
    tDy = ty - e.touches[0].clientY;
    if (busy) { if (e.cancelable) e.preventDefault(); return; }
    if (Math.abs(tDy) < 4) return;
    const dir: Dir = tDy > 0 ? 1 : -1;
    const t = e.target as Element;
    const inner = t.closest?.('textarea, [data-scroll-inside]');
    if (inner && canScroll(inner, dir)) return;
    if (canScroll(current, dir)) return;
    if (e.cancelable) e.preventDefault();
    if (tStartEdge[dir]) tNav = true;
  }, { passive: false });
  addEventListener('touchend', () => {
    if (tNav && !tSkip && !busy && Math.abs(tDy) > 46) step(tDy > 0 ? 1 : -1);
    tNav = false;
  }, { passive: true });

  // клавиши
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    const k = e.key;
    // меню и наклейки забирают себе стрелки и Home/End, PageUp/PageDown всегда листают блоки
    if (t.closest?.('[data-keys]') && /^(Arrow(Up|Down|Left|Right)|Home|End)$/.test(k)) return;
    if (k === ' ' && t.closest?.('button, a, [role="button"], label, summary')) return;
    const all = blocks();
    if (k === 'Home') { e.preventDefault(); goTo(all[0], -1); return; }
    if (k === 'End') { e.preventDefault(); goTo(all[all.length - 1], 1); return; }
    const down = k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey);
    const up = k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey);
    if (!down && !up) return;
    e.preventDefault();
    const dir: Dir = down ? 1 : -1;
    if (canScroll(current, dir)) current.scrollBy({ top: dir * current.clientHeight * 0.8, behavior: 'smooth' });
    else if (!busy) step(dir);
  });

  // ссылки на блоки этой страницы: точки, меню, кнопки первого экрана, логотип
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if (!a || a.target === '_blank') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname) return;
    const id = url.hash.slice(1);
    // ссылка «К содержимому»: фокус в текущий блок, страница не прыгает
    if (id === 'main') { e.preventDefault(); focusBlock(current); return; }
    const b = id ? document.getElementById(id)?.closest<HTMLElement>('.block[data-block]') : blocks()[0];
    if (!b) return;
    e.preventDefault();
    // с клавиатуры (Enter по ссылке) фокус переезжает в блок вместе со сценой
    goTo(b, undefined, e.detail === 0);
  });

  // фокус с клавиатуры ушёл в другой блок: сцена переезжает туда же без перехода
  document.addEventListener('focusin', (e) => {
    if (busy) return;
    const t = e.target as HTMLElement;
    const b = t.closest?.<HTMLElement>('.block[data-block]');
    if (b && b !== current) {
      arrive(b, 1);
      // вход блока начинается с прозрачности: элемент в фокусе показывается сразу, вместе с рамкой фокуса
      requestAnimationFrame(() => { if (document.activeElement === t) { gsap.killTweensOf(t); gsap.set(t, { clearProps: 'opacity,visibility,transform' }); } });
    }
  });

  // страница не должна стоять между блоками (например, после фокуса на элементе вне блоков)
  addEventListener('scroll', () => { if (!busy && Math.abs(scrollY - current.offsetTop) > 2) window.scrollTo(0, current.offsetTop); }, { passive: true });

  addEventListener('resize', () => { size(); window.scrollTo(0, current.offsetTop); }, { passive: true });

  // старт: блок из адреса или первый экран
  const fromHash = location.hash && document.getElementById(location.hash.slice(1))?.closest<HTMLElement>('.block[data-block]');
  const start = fromHash || list[0];
  current = start;
  arrive(start, 1, true);
  // браузер может восстановить старую прокрутку после загрузки
  requestAnimationFrame(() => window.scrollTo(0, current.offsetTop));
  addEventListener('load', () => window.scrollTo(0, current.offsetTop));
}
