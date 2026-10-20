import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { SplitText } from 'gsap/SplitText';
import { watchBlock, splitLines, wrap, type Player } from '../../scripts/block';

gsap.registerPlugin(DrawSVGPlugin, Draggable, InertiaPlugin, SplitText);

// почерк открывается слева направо; запас по краям, чтобы хвосты букв Caveat не резались
const HIDE = 'inset(-30% 100% -45% -12%)';
const SHOW = 'inset(-30% -12% -45% -12%)';

type Writer = Player & { dur(): number };

/** Рукописная строка: каждая строка текста «пишется» слева направо, следующая после предыдущей. */
function handwrite(el: HTMLElement, speed = 0.034, min = 0.3): Writer {
  let tl: gsap.core.Timeline | undefined;
  SplitText.create(el, {
    type: 'lines', linesClass: 'about__wl', autoSplit: true, aria: 'none',
    onSplit(self) {
      const running = !!tl && !tl.paused();
      tl = gsap.timeline({ paused: true });
      for (const ln of self.lines as HTMLElement[]) {
        const len = (ln.textContent || '').trim().length;
        tl.fromTo(ln, { clipPath: HIDE }, { clipPath: SHOW, duration: Math.max(min, len * speed), ease: 'sine.inOut', immediateRender: true });
      }
      if (running) { const t = tl; gsap.delayedCall(0, () => t.play()); }
      return tl;
    },
  });
  return {
    play: (delay = 0) => { if (tl) { tl.delay(delay); tl.restart(true); } },
    reset: () => { tl?.pause(0); },
    dur: () => tl?.duration() ?? 0.8,
  };
}

/**
 * Штрихи рисуются рукой по очереди. Пока штрих не начат, он скрыт: у круглого конца линии
 * нулевой длины иначе остаётся точка.
 */
function strokes(paths: Element[], duration: number, ease: string, gap: number) {
  const tl = gsap.timeline({ paused: true });
  paths.forEach((p, i) => {
    tl.fromTo(p, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: 'none', immediateRender: true }, i * gap)
      .fromTo(p, { drawSVG: '0%' }, { drawSVG: '100%', duration, ease, immediateRender: true }, i * gap);
  });
  return tl;
}
const idle: Player = { play() {}, reset() {} };
const draw = (paths: Element[], duration = 0.6, ease = 'power2.inOut'): Player =>
  paths.length ? wrap(strokes(paths, duration, ease, duration * 0.85)) : idle;

/** Штрих, чей путь пересчитывается при смене раскладки: после пересчёта он остаётся в том же состоянии. */
type Live = Player & { refresh(): void };
function liveDraw(paths: SVGPathElement[], duration: number, ease = 'power2.inOut', gap = 0): Live {
  let tl: gsap.core.Timeline | null = null;
  let state: 'off' | 'on' | 'done' = 'off';
  let startAt = 0;
  const drawn = () => paths.filter((p) => p.getAttribute('d'));
  const run = (delay: number, progress = 0) => {
    tl?.kill();
    const els = drawn();
    if (!els.length) { tl = null; state = 'done'; return; }
    state = 'on';
    startAt = performance.now() / 1000 + delay;
    tl = strokes(els, duration, ease, gap).eventCallback('onComplete', () => { state = 'done'; });
    tl.progress(progress).delay(delay);
    if (progress) tl.play(); else tl.restart(true);
  };
  const hide = (done: boolean) => gsap.set(paths, { drawSVG: done ? '100%' : '0%', opacity: done ? 1 : 0 });
  return {
    play: (delay = 0) => run(delay),
    reset() { tl?.kill(); tl = null; state = 'off'; hide(false); },
    refresh() {
      if (state === 'on' && tl) {
        // путь поменялся посреди рисования: начинаем заново с того же места
        const wait = startAt - performance.now() / 1000;
        if (wait > 0) run(wait); else run(0, tl.progress());
        return;
      }
      hide(state === 'done');
    },
  };
}

type Box = { l: number; t: number; r: number; b: number };
type Pt = [number, number];
const f1 = (n: number) => Math.round(n * 10) / 10;
const pt = (p: Pt) => `${f1(p[0])},${f1(p[1])}`;

type Curve = [Pt, Pt, Pt, Pt];
const bez = ([S, c1, c2, E]: Curve, t: number): Pt => {
  const u = 1 - t;
  return [u * u * u * S[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * E[0], u * u * u * S[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * E[1]];
};
/** Кривая не задевает чужой текст (с запасом в несколько пикселей). */
const clear = (c: Curve, obstacles: Box[], m = 5) => {
  for (let i = 1; i < 24; i++) {
    const [x, y] = bez(c, i / 24);
    if (obstacles.some((o) => x > o.l - m && x < o.r + m && y > o.t - m && y < o.b + m)) return false;
  }
  return true;
};

/**
 * Стрелка от руки между двумя пометками: дугой вбок, если они рядом, вниз, если одна под другой.
 * Берётся первый вариант, который не задевает лид и другие пометки; если чисто провести нельзя, стрелки нет.
 */
function linkPath(A: Box, B: Box, obstacles: Box[]): { line: string; head: string } | null {
  const pad = 7;
  const acx = (A.l + A.r) / 2, bcx = (B.l + B.r) / 2;
  const right = bcx >= acx;
  const vOver = Math.min(A.b, B.b) - Math.max(A.t, B.t);
  const tries: Curve[] = [];
  if (vOver > 0 && (right ? B.l - A.r : A.l - B.r) >= 30) {
    // рядом по горизонтали: дуга над промежутком
    const sx = right ? A.r + pad : A.l - pad, ex = right ? B.l - pad : B.r + pad;
    const sy = A.t + (A.b - A.t) * 0.42, ey = B.t + (B.b - B.t) * 0.5;
    const k = (ex - sx) * 0.42, lift = Math.min(18, Math.abs(ex - sx) * 0.22);
    tries.push([[sx, sy], [sx + k, sy - lift], [ex - k, ey - lift], [ex, ey]]);
  }
  if (B.t - A.b >= 18) {
    // одна под другой: мягкая S-кривая в промежутке
    const sx = right ? A.l + (A.r - A.l) * 0.55 : A.l + Math.min(28, (A.r - A.l) * 0.2);
    const ex0 = right ? B.l + Math.min(40, (B.r - B.l) * 0.3) : B.r - Math.min(48, (B.r - B.l) * 0.3);
    const ex = gsap.utils.clamp(B.l + 14, B.r - 14, ex0);
    const S: Pt = [sx, A.b + pad * 0.5], E: Pt = [ex, B.t - pad * 0.6];
    const dx = E[0] - S[0], dy = E[1] - S[1];
    // плавная дуга: выходит почти вниз и приходит сверху, без петель и крюков
    tries.push([S, [S[0] + dx * 0.15, S[1] + dy * 0.55], [E[0] - dx * 0.1, E[1] - dy * 0.5], E]);
  }
  if (B.r < A.l - 20 || B.l > A.r + 20) {
    // наискосок вниз: выходит из-под пометки вниз и подходит к следующей сбоку, четверть окружности
    const toLeft = B.r < A.l;
    const S: Pt = [toLeft ? A.l + Math.min(30, (A.r - A.l) * 0.25) : A.r - Math.min(30, (A.r - A.l) * 0.25), A.b + pad * 0.5];
    const E: Pt = [toLeft ? B.r + pad : B.l - pad, B.t + (B.b - B.t) * 0.45];
    if (E[1] - S[1] >= 10) tries.push([S, [S[0], S[1] + (E[1] - S[1]) * 0.75], [E[0] + (S[0] - E[0]) * 0.35, E[1]], E]);
  }
  const c = tries.find((t) => Math.hypot(t[3][0] - t[0][0], t[3][1] - t[0][1]) >= 18 && clear(t, obstacles));
  if (!c) return null;
  const [S, c1, c2, E] = c;
  // наконечник по касательной в конце
  let dx = E[0] - c2[0], dy = E[1] - c2[1];
  if (Math.hypot(dx, dy) < 1) { dx = E[0] - c1[0]; dy = E[1] - c1[1]; }
  const a = Math.atan2(dy, dx), h = 10, w = 0.48;
  const h1: Pt = [E[0] - h * Math.cos(a - w), E[1] - h * Math.sin(a - w)];
  const h2: Pt = [E[0] - h * Math.cos(a + w), E[1] - h * Math.sin(a + w)];
  return { line: `M${pt(S)} C${pt(c1)} ${pt(c2)} ${pt(E)}`, head: `M${pt(h1)} L${pt(E)} L${pt(h2)}` };
}

/**
 * Где у курсивной буквы краска: самый тесный наклонный эллипс, в который она целиком входит.
 * Считается по пикселям один раз на шрифт, в долях кегля от начала буквы и базовой линии.
 */
function inkEllipse(ch: string, font: string) {
  const S = 200, W = 420, H = 420, X = 110, Y = 300;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.font = font.replace(/\d+(\.\d+)?px/, `${S}px`);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#000';
  g.fillText(ch, X, Y);
  const m = g.measureText(ch);
  const data = g.getImageData(0, 0, W, H).data;
  const xs: number[] = [], ys: number[] = [];
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (data[(y * W + x) * 4 + 3] > 60) { xs.push(x); ys.push(y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (!xs.length) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // наклон эллипса подбираем по букве: какой угол даёт самое тесное кольцо, в которое входит вся краска
  let best = { tilt: 0, a: 0, b: 0, area: Infinity };
  for (let deg = 0; deg <= 26; deg += 2) {
    const tl = (deg * Math.PI) / 180, cos = Math.cos(tl), sin = Math.sin(tl);
    let a0 = 1, b0 = 1;
    const us: number[] = [], vs: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      const dx = xs[i] - cx, dy = ys[i] - cy;
      const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
      us.push(u); vs.push(v);
      a0 = Math.max(a0, Math.abs(u)); b0 = Math.max(b0, Math.abs(v));
    }
    let k = 1;
    for (let i = 0; i < us.length; i++) k = Math.max(k, Math.hypot(us[i] / a0, vs[i] / b0));
    if (a0 * b0 * k * k < best.area) best = { tilt: tl, a: a0 * k, b: b0 * k, area: a0 * b0 * k * k };
  }
  const fa = (m.fontBoundingBoxAscent ?? S * 1.082) / S, fd = (m.fontBoundingBoxDescent ?? S * 0.251) / S;
  return { cx: (cx - X) / S, cy: (cy - Y) / S, a: best.a / S, b: best.b / S, tilt: best.tilt, fa, fd };
}

/**
 * Обо мне: заголовок поднимается по буквам и первую букву обводит рука, полароид падает на
 * страницу, его прихватывает скотч, снимок проявляется. Лид по строкам, ник подчёркивается,
 * пометки пишутся от руки одна за другой, и стрелка ведёт от каждой к следующей. Наклейки
 * шлёпаются с отскоком, их можно таскать и бросать по блоку, а с клавиатуры двигать стрелками.
 */
export function init(root: HTMLElement) {
  const q = gsap.utils.selector(root);
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const later: gsap.core.Tween[] = [];
  const after = (t: number, fn: () => void) => later.push(gsap.delayedCall(t, fn));
  // анимации от действий пользователя: их гасим при уходе, анимации входа не трогаем
  const fx = new Set<gsap.core.Animation>();
  const own = <T extends gsap.core.Animation>(a: T) => { fx.add(a); a.eventCallback('onComplete', () => fx.delete(a)); return a; };
  let active = false;

  /* ---------- заголовок ---------- */
  const chars = q<HTMLElement>('.about__ch');
  const title = wrap(gsap.fromTo(chars, { yPercent: 118, rotation: 10 }, { yPercent: 0, rotation: 0, duration: 1, ease: 'expo.out', stagger: 0.05, paused: true }));
  let titleDone = false;
  // буквы подпрыгивают под мышью, когда заголовок уже собран
  if (fine.matches) {
    chars.forEach((ch) => ch.addEventListener('pointerenter', () => {
      if (!titleDone || ch.dataset.hop) return;
      ch.dataset.hop = '1';
      own(gsap.timeline({ onComplete: () => { delete ch.dataset.hop; } }))
        .to(ch, { yPercent: -16, rotation: gsap.utils.random(-8, 8), duration: 0.16, ease: 'power2.out' })
        .to(ch, { yPercent: 0, rotation: 0, duration: 0.7, ease: 'elastic.out(1.1, .35)' });
    }));
  }

  // кольцо вокруг первой буквы: эллипс по краске самой буквы, с нахлёстом в конце, как обводят ручкой
  const capbox = q<HTMLElement>('[data-about-capbox]')[0];
  const cap = q<HTMLElement>('[data-about-cap]')[0];
  const ringSvg = capbox?.querySelector<SVGSVGElement>('svg');
  const ringPath = q<SVGPathElement>('[data-about-ring]')[0];
  const ring = liveDraw(ringPath ? [ringPath] : [], 0.8);
  let ink: ReturnType<typeof inkEllipse> = null;
  let inkFont = '';
  const fitRing = () => {
    if (!capbox || !cap || !ringSvg || !ringPath) return;
    const cs = getComputedStyle(cap);
    const fs = parseFloat(cs.fontSize);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    if (!ink || inkFont !== font.replace(/\d+(\.\d+)?px/, '')) {
      if (!document.fonts.check(font, cap.textContent || '')) return;
      ink = inkEllipse(cap.textContent || '', font);
      inkFont = font.replace(/\d+(\.\d+)?px/, '');
    }
    if (!ink) return;
    // начало буквы и базовая линия внутри capbox (без трансформаций анимации)
    const base = cap.offsetTop + (cap.offsetHeight - (ink.fa + ink.fd) * fs) / 2 + ink.fa * fs;
    const pad = fs * 0.1;
    const A = ink.a * fs + pad, B = ink.b * fs + pad;
    const cx = cap.offsetLeft + ink.cx * fs, cy = base + ink.cy * fs;
    const cos = Math.cos(ink.tilt), sin = Math.sin(ink.tilt);
    const hw = Math.hypot(A * cos, B * sin), hh = Math.hypot(A * sin, B * cos);
    const sw = gsap.utils.clamp(1.8, 2.8, fs * 0.024), m = 6 + sw;
    const W = 2 * (hw + m) * 1.08, H = 2 * (hh + m) * 1.08;
    // рукописный эллипс: чуть больше оборота, конец уходит наружу и не ложится на начало
    const N = 84, start = -1.05, turn = Math.PI * 2 * 1.1;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const t = i / N, ang = start - turn * t;
      const r = 1 + 0.03 * Math.sin(t * Math.PI * 2 + 0.8) + (t > 0.86 ? (t - 0.86) * 0.55 : 0) - (t < 0.08 ? (0.08 - t) * 0.5 : 0);
      const u = A * r * Math.cos(ang), v = B * r * Math.sin(ang);
      d += (i ? 'L' : 'M') + f1(W / 2 + u * cos - v * sin) + ',' + f1(H / 2 + u * sin + v * cos);
    }
    Object.assign(ringSvg.style, { left: `${f1(cx - W / 2)}px`, top: `${f1(cy - H / 2)}px`, width: `${f1(W)}px`, height: `${f1(H)}px`, strokeWidth: `${f1(sw)}px` });
    ringSvg.setAttribute('viewBox', `0 0 ${f1(W)} ${f1(H)}`);
    ringPath.setAttribute('d', d);
    // место под кольцо: следующая буква отходит ровно настолько, чтобы её не задело
    const ringR = cx + hw * 1.04 + sw / 2, ringL = cx - hw * 1.04 - sw / 2;
    capbox.style.marginRight = `${f1(Math.max(0, ringR + fs * 0.055 - capbox.offsetWidth))}px`;
    capbox.style.marginLeft = `${f1(Math.max(0, -ringL - Math.min(10, fs * 0.08)))}px`;
    ring.refresh();
  };

  /* ---------- полароид ---------- */
  const drop = q<HTMLElement>('[data-about-drop]')[0];
  const swing = q<HTMLElement>('[data-about-swing]')[0];
  const tape = q('[data-about-tape]');
  const dev = q('[data-about-dev]');
  const photoIn = wrap(gsap.timeline({ paused: true })
    .fromTo(drop, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: 'none', immediateRender: true }, 0)
    .fromTo(drop, { y: -70, scale: 1.18, rotation: -11 }, { y: 0, scale: 1, rotation: 0, duration: 1, ease: 'back.out(1.5)', immediateRender: true }, 0)
    .fromTo(tape, { scaleX: 0 }, { scaleX: 1, duration: 0.32, ease: 'power3.out', immediateRender: true }, 0.62)
    .fromTo(dev, { opacity: 1 }, { opacity: 0, duration: 2.4, ease: 'power2.inOut', immediateRender: true }, 0.7));
  const nameW = handwrite(q<HTMLElement>('[data-about-write]')[0], 0.05);
  const akaW = handwrite(q<HTMLElement>('[data-about-aka]')[0], 0.05);

  /* лист в клетку: ложится под текст, скотч прихватывает углы; за мышью чуть смещается, как нижний слой */
  const sheet = q<HTMLElement>('[data-about-sheet]')[0];
  const sheetIn = wrap(gsap.timeline({ paused: true })
    .fromTo(sheet, { autoAlpha: 0, y: 46, rotation: 2.6 }, { autoAlpha: 1, y: 0, rotation: 0, duration: 0.9, ease: 'expo.out', immediateRender: true }, 0)
    .fromTo(q('[data-about-sheet-tape]'), { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'power3.out', stagger: 0.1, immediateRender: true }, 0.45));
  const marginsEl = q<HTMLElement>('.about__margins')[0];
  // смещение в процентах: не спорит с x/y анимации входа
  const px = [gsap.quickTo(sheet, 'xPercent', { duration: 0.9, ease: 'power3' }), gsap.quickTo(sheet, 'yPercent', { duration: 0.9, ease: 'power3' })];
  const mx = [gsap.quickTo(marginsEl, 'x', { duration: 1.2, ease: 'power3' }), gsap.quickTo(marginsEl, 'y', { duration: 1.2, ease: 'power3' })];
  const depth = (nx: number, ny: number) => { px[0](nx * -0.9); px[1](ny * -0.8); mx[0](nx * 14); mx[1](ny * 10); };

  // пружина: полароид висит на скотче, мышь его раскачивает, потом он успокаивается
  let ang = 0, vel = 0, target = 0, raf = 0, last = 0;
  const K = 52, C = 3.6;
  const tick = (now: number) => {
    const dt = Math.min(0.034, (now - last) / 1000 || 0.016);
    last = now;
    vel += (-K * (ang - target) - C * vel) * dt;
    vel = gsap.utils.clamp(-80, 80, vel);
    ang += vel * dt;
    swing.style.transform = `rotate(${ang.toFixed(3)}deg)`;
    if (Math.abs(ang - target) < 0.004 && Math.abs(vel) < 0.01) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
  };
  const wake = () => { if (!raf && active) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  const kick = (v: number) => { vel += v; wake(); };
  const stopSwing = () => { cancelAnimationFrame(raf); raf = 0; ang = vel = target = 0; swing.style.transform = ''; };
  root.addEventListener('pointermove', (e) => {
    if (!active || e.pointerType !== 'mouse') return;
    const r = swing.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    target = gsap.utils.clamp(-3.5, 3.5, ((e.clientX - cx) / r.width) * 2.6);
    depth(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    // мышь задела снимок: он отходит от неё по ходу движения (курсор справа ведёт влево, снимок уходит влево)
    if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) vel += gsap.utils.clamp(-9, 9, -e.movementX * 0.6);
    wake();
  });
  root.addEventListener('pointerleave', () => { target = 0; wake(); depth(0, 0); });
  let side = 1;
  swing.addEventListener('click', () => { side = -side; kick(side * 70); });

  /* ---------- текст ---------- */
  const leadEl = q<HTMLElement>('[data-about-lead]')[0];
  const lead = splitLines(leadEl, { yPercent: 125, stagger: 0.08, duration: 1 });
  // выделенные слова в лиде подчёркиваются от руки
  const emLine = wrap(gsap.fromTo(leadEl, { '--u': 0 }, { '--u': 1, duration: 0.7, ease: 'power2.inOut', paused: true, immediateRender: true }));

  const noteItems = q<HTMLElement>('[data-about-note-item]');
  const notes = noteItems.map((li) => {
    const text = li.querySelector<HTMLElement>('[data-about-note]')!;
    const w = handwrite(text, 0.022, 0.22);
    const marks = [...li.querySelectorAll<SVGSVGElement>('.about__doodle')];
    const doodle = draw([...li.querySelectorAll('[data-about-doodle]')], 0.5);
    return { li, text, marks, w, doodle };
  });

  // стрелки между пометками: путь по тому, где пометки реально встали на этой ширине
  const linksSvg = q<SVGSVGElement>('.about__links')[0];
  const links = q<SVGGElement>('[data-about-link]').map((g) => {
    const [line, head] = [...g.querySelectorAll<SVGPathElement>('path')];
    return { line, head, draw: liveDraw([line, head], 0.32, 'power1.inOut', 0.26) };
  });
  const layoutLinks = () => {
    if (!linksSvg) return;
    const o = linksSvg.getBoundingClientRect();
    if (!o.width) return;
    const boxes: (Box | null)[] = notes.map((n) => {
      const rs = [n.text, ...n.marks].map((el) => el.getBoundingClientRect()).filter((r) => r.width);
      if (!rs.length) return null;
      return { l: Math.min(...rs.map((r) => r.left)) - o.left, t: Math.min(...rs.map((r) => r.top)) - o.top, r: Math.max(...rs.map((r) => r.right)) - o.left, b: Math.max(...rs.map((r) => r.bottom)) - o.top };
    });
    // лид по строкам самого текста: стрелки обходят его. Высоту строки берём у маски: сама строка
    // во время входа сдвинута вниз
    const rg = document.createRange();
    const lines = [...leadEl.querySelectorAll<HTMLElement>('.ln')];
    const leadBoxes: Box[] = (lines.length ? lines : [leadEl]).map((ln) => {
      rg.selectNodeContents(ln);
      const rs = [...rg.getClientRects()].filter((r) => r.width > 2);
      const m = (lines.length ? ln.parentElement ?? ln : ln).getBoundingClientRect();
      const l = rs.length ? Math.min(...rs.map((r) => r.left)) : m.left, r = rs.length ? Math.max(...rs.map((r) => r.right)) : m.right;
      return { l: l - o.left, t: m.top - o.top, r: r - o.left, b: m.bottom - o.top };
    });
    links.forEach((ln, i) => {
      const others = boxes.filter((b, j): b is Box => !!b && j !== i && j !== i + 1);
      const a = boxes[i], b = boxes[i + 1];
      const p = a && b ? linkPath(a, b, [...leadBoxes, ...others]) : null;
      ln.line.setAttribute('d', p?.line ?? '');
      ln.head.setAttribute('d', p?.head ?? '');
      ln.draw.refresh();
    });
  };

  // наведение на пометку: рука заново обводит её и ведёт стрелку к следующей
  if (fine.matches) notes.forEach((n, i) => n.li.addEventListener('pointerenter', () => {
    if (!titleDone) return;
    n.doodle.play(0);
    links[i]?.draw.play(0.1);
  }));

  const hint = handwrite(q<HTMLElement>('[data-about-hint]')[0], 0.04);
  const hintArrow = draw(q('[data-about-hint-arrow]'), 0.4);

  // раскладку колец и стрелок пересчитываем, когда меняются размеры (ширина окна, догрузка шрифтов)
  let relayoutQueued = 0;
  const relayout = () => {
    if (relayoutQueued) return;
    relayoutQueued = requestAnimationFrame(() => { relayoutQueued = 0; fitRing(); layoutLinks(); });
  };
  const ro = new ResizeObserver(relayout);
  [leadEl, ...noteItems, linksSvg, capbox].forEach((el) => el && ro.observe(el));
  document.fonts.ready.then(relayout);
  document.fonts.addEventListener?.('loadingdone', relayout);
  fitRing();
  layoutLinks();

  /* ---------- наклейки ---------- */
  const desk = q<HTMLElement>('[data-about-desk]')[0];
  const stickers = q<HTMLElement>('[data-about-sticker]');
  const ins = stickers.map((s) => s.querySelector<HTMLElement>('.about__st-in')!);
  const slap = wrap(gsap.timeline({ paused: true })
    .fromTo(ins, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.14, stagger: 0.16, ease: 'none', immediateRender: true }, 0)
    .fromTo(ins, { scale: 1.9, rotation: (i) => [28, -34, -26][i % 3], y: -24 }, { scale: 1, rotation: 0, y: 0, duration: 1.05, stagger: 0.16, ease: 'elastic.out(1, .48)', immediateRender: true }, 0));

  const hops = new WeakMap<HTMLElement, gsap.core.Animation>();
  const hop = (el: HTMLElement) => {
    hops.get(el)?.kill();
    hops.set(el, own(gsap.timeline()
      .to(el, { y: -26, rotation: gsap.utils.random(-16, 16), scale: 1.06, duration: 0.17, ease: 'power2.out' })
      .to(el, { y: 0, rotation: 0, scale: 1, duration: 0.8, ease: 'elastic.out(1.1, .32)' })));
  };

  let z = 10;
  // на сайте свой курсор для мыши: системную руку поверх него не показываем
  const custom = document.documentElement.classList.contains('has-cursor');
  const tilts: ReturnType<typeof gsap.quickTo>[] = [];
  const keyTo = new WeakMap<HTMLElement, { x: number; y: number }>();
  const drags = stickers.map((btn, i) => {
    const inner = ins[i];
    const tilt = gsap.quickTo(inner, 'rotation', { duration: 0.4, ease: 'power3.out' });
    tilts.push(tilt);
    let lift: gsap.core.Tween | undefined;
    const scaleTo = (v: number, dur: number, ease: string) => { lift?.kill(); lift = own(gsap.to(inner, { scale: v, duration: dur, ease })); };
    const lean = () => tilt(gsap.utils.clamp(-24, 24, InertiaPlugin.getVelocity(btn, 'x') / 40));
    const [d] = Draggable.create(btn, {
      type: 'x,y', bounds: desk, inertia: true, dragClickables: true, edgeResistance: 0.85, minimumMovement: 4, zIndexBoost: false,
      cursor: custom ? 'none' : 'grab', activeCursor: custom ? 'none' : 'grabbing',
      onPress() {
        this.applyBounds(desk);
        btn.style.zIndex = String(++z);
        btn.classList.add('is-lifted');
        hops.get(inner)?.kill();
        keyTo.delete(btn);
        scaleTo(1.1, 0.25, 'power3.out');
      },
      onDrag: lean,
      onThrowUpdate: lean,
      onRelease() {
        btn.classList.remove('is-lifted');
        scaleTo(1, 0.7, 'elastic.out(1, .45)');
        if (!this.isThrowing) tilt(0);
      },
      onThrowComplete() { tilt(0); },
      onClick() { hop(inner); },
    });
    // с клавиатуры: Enter и пробел подбрасывают, стрелки двигают по полю блока
    btn.addEventListener('click', (e) => { if (e.detail === 0) hop(inner); });
    btn.addEventListener('keydown', (e) => {
      const v = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
      if (!v) return;
      e.preventDefault();
      const step = e.shiftKey ? 96 : 32;
      const x = gsap.getProperty(btn, 'x') as number, y = gsap.getProperty(btn, 'y') as number;
      const b = btn.getBoundingClientRect(), k = desk.getBoundingClientRect();
      // где наклейка стоит без сдвига, и сколько ей можно уйти в каждую сторону
      const ox = b.left - x, oy = b.top - y;
      const from = keyTo.get(btn) ?? { x, y };
      const to = {
        x: gsap.utils.clamp(k.left - ox, k.right - (ox + b.width), from.x + v[0] * step),
        y: gsap.utils.clamp(k.top - oy, k.bottom - (oy + b.height), from.y + v[1] * step),
      };
      keyTo.set(btn, to);
      btn.style.zIndex = String(++z);
      own(gsap.to(btn, { x: to.x, y: to.y, duration: 0.42, ease: 'power3.out', overwrite: 'auto', onUpdate: () => d.update(), onComplete: () => { d.update(); keyTo.delete(btn); } }));
      tilt(v[0] * 14 || v[1] * 6);
      gsap.delayedCall(0.18, () => tilt(0));
    });
    return d;
  });
  // перетаскивание с инерцией всё время следит за скоростью наклеек и держит тикер GSAP на всём сайте:
  // включаем его, только пока блок открыт
  drags.forEach((d) => d.disable());
  const homeStickers = () => {
    drags.forEach((d, i) => {
      gsap.killTweensOf(stickers[i]);
      gsap.set(stickers[i], { x: 0, y: 0 });
      stickers[i].style.zIndex = '';
      stickers[i].classList.remove('is-lifted');
      keyTo.delete(stickers[i]);
      d.update();
    });
  };
  let lastW = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; homeStickers(); } }, { passive: true });

  const all: Player[] = [title, ring, photoIn, nameW, akaW, sheetIn, lead, emLine, slap, hint, hintArrow, ...notes.flatMap((n) => [n.w, n.doodle]), ...links.map((l) => l.draw)];
  all.forEach((p) => p.reset());

  // пометки на полях: карандаш дорисовывает их по одной, когда основное уже на месте
  const margins = q<SVGPathElement>('[data-about-mg]');
  const stain = q<SVGSVGElement>('[data-about-stain]')[0];
  const marginTl = gsap.timeline({ paused: true })
    .fromTo(stain, { opacity: 0, scale: 0.9, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 1.2, ease: 'power2.out' }, 0)
    .fromTo(margins, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.7, ease: 'power1.inOut', stagger: 0.16 }, 0.3);
  const marginsIn = wrap(marginTl);

  watchBlock(root, () => {
    active = true;
    drags.forEach((d) => d.enable());
    marginsIn.play(1.1);
    titleDone = false;
    fitRing();
    layoutLinks();
    sheetIn.play(0);
    title.play(0.12);
    ring.play(0.65);
    photoIn.play(0.05);
    after(0.62, () => kick(-45));
    lead.play(0.4);
    emLine.play(1.3);
    nameW.play(1.25);
    akaW.play(1.25 + nameW.dur() + 0.1);
    // пометки пишутся по очереди; закончив одну, рука ведёт стрелку к следующей
    let t = 0.8;
    notes.forEach((n, i) => {
      n.w.play(t);
      const end = t + n.w.dur();
      n.doodle.play(end - 0.08);
      links[i]?.draw.play(end - 0.02);
      t = end + (links[i]?.line.getAttribute('d') ? 0.2 : 0.08);
    });
    slap.play(1.35);
    hint.play(2.05);
    hintArrow.play(2.05 + hint.dur());
    after(2.2, () => { titleDone = true; });
  }, () => {
    active = false;
    titleDone = false;
    later.splice(0).forEach((c) => c.kill());
    stopSwing();
    drags.forEach((d) => d.disable());
    gsap.set(sheet, { xPercent: 0, yPercent: 0 });
    gsap.set(marginsEl, { x: 0, y: 0 });
    homeStickers();
    fx.forEach((a) => a.kill());
    fx.clear();
    tilts.forEach((t) => t.tween.pause());
    chars.forEach((ch) => { delete ch.dataset.hop; });
    all.forEach((p) => p.reset());
    marginsIn.reset();
  });
}
