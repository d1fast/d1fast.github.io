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

const f1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Обо мне: всё появляется по очереди, чтобы глаз шёл за одним действием. Лист в клетку ложится на стол,
 * заголовок поднимается по буквам, рука обводит первую букву, полароид падает и проявляется, лид
 * поднимается по строкам, вырезки с отзывами ложатся на лист, в конце шлёпаются наклейки. Снимок
 * отходит от курсора, наклейки можно таскать и бросать по блоку, а с клавиатуры двигать стрелками.
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

  /* лист в клетку: ложится под текст, скотч прихватывает углы; за мышью чуть смещается, как нижний слой */
  const sheet = q<HTMLElement>('[data-about-sheet]')[0];
  const sheetIn = wrap(gsap.timeline({ paused: true })
    .fromTo(sheet, { autoAlpha: 0, y: 46, rotation: 2.6 }, { autoAlpha: 1, y: 0, rotation: 0, duration: 0.9, ease: 'expo.out', immediateRender: true }, 0)
    .fromTo(q('[data-about-sheet-tape]'), { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'power3.out', stagger: 0.1, immediateRender: true }, 0.45));
  // смещение в процентах: не спорит с x/y анимации входа
  const px = [gsap.quickTo(sheet, 'xPercent', { duration: 0.9, ease: 'power3' }), gsap.quickTo(sheet, 'yPercent', { duration: 0.9, ease: 'power3' })];
  const depth = (nx: number, ny: number) => { px[0](nx * -0.7); px[1](ny * -0.6); };

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

  /* ---------- отзывы ---------- */
  // на широком экране вырезки ложатся на лист по одной; на узком видна одна, остальные сменяют её по очереди
  const reviews = q<HTMLElement>('[data-about-review]');
  const dots = q<HTMLButtonElement>('[data-about-rv-dot]');
  const dotsBox = q<HTMLElement>('.about__rv-dots')[0];
  const single = () => !!dotsBox && getComputedStyle(dotsBox).display !== 'none';
  const reviewsIn = wrap(gsap.timeline({ paused: true })
    .fromTo(reviews, { y: 26, rotation: (i) => [-5, 4, -3][i % 3] }, { y: 0, rotation: 0, duration: 0.7, ease: 'expo.out', stagger: 0.28, immediateRender: true }, 0)
    .fromTo(reviews, { autoAlpha: 0 }, { autoAlpha: (_i, el: HTMLElement) => (!single() || el.classList.contains('is-on') ? 1 : 0), duration: 0.3, ease: 'none', stagger: 0.28, immediateRender: true }, 0));
  let rv = 0;
  let rvTimer: gsap.core.Tween | undefined;
  const showReview = (i: number, user = false) => {
    if (!single()) return;
    const to = (i + reviews.length) % reviews.length;
    if (to === rv) return;
    const from = reviews[rv];
    rv = to;
    reviews.forEach((r, k) => r.classList.toggle('is-on', k === to));
    dots.forEach((dt, k) => dt.classList.toggle('is-on', k === to));
    gsap.killTweensOf([from, reviews[to]]);
    gsap.to(from, { autoAlpha: 0, x: -24, duration: 0.3, ease: 'power2.in' });
    gsap.fromTo(reviews[to], { autoAlpha: 0, x: 28 }, { autoAlpha: 1, x: 0, duration: 0.55, ease: 'expo.out', delay: 0.18 });
    nextReview(user ? 9 : 5.5);
  };
  const nextReview = (wait: number) => { rvTimer?.kill(); if (active && single()) rvTimer = gsap.delayedCall(wait, () => showReview(rv + 1)); };
  dots.forEach((dt, k) => dt.addEventListener('click', () => showReview(k, true)));
  reviews.forEach((r) => r.addEventListener('click', () => showReview(rv + 1, true)));
  const resetReviews = () => {
    rvTimer?.kill();
    rv = 0;
    gsap.killTweensOf(reviews);
    reviews.forEach((r, k) => r.classList.toggle('is-on', k === 0));
    dots.forEach((dt, k) => dt.classList.toggle('is-on', k === 0));
    gsap.set(reviews, { clearProps: 'x' });
  };

  const hint = handwrite(q<HTMLElement>('[data-about-hint]')[0], 0.04);
  const hintArrow = draw(q('[data-about-hint-arrow]'), 0.4);

  // кольцо пересчитываем, когда меняются размеры (ширина окна, догрузка шрифтов)
  let relayoutQueued = 0;
  const relayout = () => {
    if (relayoutQueued) return;
    relayoutQueued = requestAnimationFrame(() => { relayoutQueued = 0; fitRing(); });
  };
  if (capbox) new ResizeObserver(relayout).observe(capbox);
  document.fonts.ready.then(relayout);
  document.fonts.addEventListener?.('loadingdone', relayout);
  fitRing();

  /* ---------- наклейки ---------- */
  const desk = q<HTMLElement>('[data-about-desk]')[0];
  const stickers = q<HTMLElement>('[data-about-sticker]');
  const ins = stickers.map((s) => s.querySelector<HTMLElement>('.about__st-in')!);
  // наклейки шлёпаются по одной, когда всё остальное уже на месте
  const slap = wrap(gsap.timeline({ paused: true })
    .fromTo(ins, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.14, stagger: 0.32, ease: 'none', immediateRender: true }, 0)
    .fromTo(ins, { scale: 1.7, rotation: (i) => [24, -28, -22][i % 3], y: -20 }, { scale: 1, rotation: 0, y: 0, duration: 0.9, stagger: 0.32, ease: 'elastic.out(1, .55)', immediateRender: true }, 0));

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

  const all: Player[] = [title, ring, photoIn, nameW, sheetIn, lead, emLine, reviewsIn, slap, hint, hintArrow];
  all.forEach((p) => p.reset());

  // Вход по очереди, одно за другим: лист, заголовок с кольцом, снимок, текст, отзывы, наклейки, подсказка.
  // Пометки на полях и кофейный круг просто лежат: они фон, а не действие.
  watchBlock(root, () => {
    active = true;
    drags.forEach((d) => d.enable());
    titleDone = false;
    resetReviews();
    fitRing();
    sheetIn.play(0);
    title.play(0.2);
    ring.play(0.85);
    photoIn.play(0.75);
    after(1.3, () => kick(-38));
    nameW.play(1.7);
    lead.play(1.45);
    emLine.play(2.25);
    reviewsIn.play(2.35);
    after(2.35 + 0.28 * reviews.length + 0.6, () => nextReview(5.5));
    slap.play(3.1);
    hint.play(3.9);
    hintArrow.play(3.9 + hint.dur());
    after(2.2, () => { titleDone = true; });
  }, () => {
    active = false;
    titleDone = false;
    later.splice(0).forEach((c) => c.kill());
    stopSwing();
    drags.forEach((d) => d.disable());
    gsap.set(sheet, { xPercent: 0, yPercent: 0 });
    homeStickers();
    fx.forEach((a) => a.kill());
    fx.clear();
    tilts.forEach((t) => t.tween.pause());
    chars.forEach((ch) => { delete ch.dataset.hop; });
    resetReviews();
    all.forEach((p) => p.reset());
  });
}
