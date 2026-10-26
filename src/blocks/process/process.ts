import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { watchBlock, pointerArm } from '../../scripts/block';
import { J1, J2, BENCH, PLATE, MARKS, LENS, LENS_STOPS, MAN, MAN_STOP, MAN_VIEW, THINK_DOTS, type P } from './lamp';

gsap.registerPlugin(DrawSVGPlugin, MorphSVGPlugin, ScrambleTextPlugin);

/**
 * Как я работаю: сборочная линия. Лампа в центре проходит четыре поста:
 * 1 набросок с ошибками и вопросами у них, рядом человечек не знает, что делать; лупа по своему маршруту
 *   встаёт на каждый вопрос, и он становится восклицательным знаком;
 * 2 набросок выпрямляется в чертёж (ошибки исправляются), рисуются размеры;
 * 3 детали прилетают и защёлкиваются; 4 лампа загорается, по ней пробегает блик, ставится галочка.
 * Шаги идут сами (переезд MOVE и DWELL[шаг] секунд стоянки). Наведение, фокус или тап выбирают шаг и ставят на паузу.
 * На собранной лампе плафон смотрит на курсор.
 */
// на четвёртом шаге лампа включается, ему нужно больше времени. Первый шаг стоит не меньше, чем лупа идёт
// первый круг до последнего вопроса (см. lensShow)
const DWELL = [4, 2.8, 2.8, 4];
const MOVE = 0.8;
const N = 4;
const ZOOM = 1.3; // увеличение в лупе
const ZOOM_MAN = 1.45; // над человечком лупа крупнее: в стекле голова, шея и облачко мыслей
const HOLD = 0.3; // столько лупа стоит над вопросом
const MAN_HOLD = 0.85; // над человечком чуть дольше: он успевает выругаться
const WARM = '#FFE7A0';
const DEG = Math.PI / 180;
type Sketch = 'off' | 'scribble' | 'clean' | 'ghost';
const clamp = gsap.utils.clamp;
const smooth = (a: number, b: number, x: number) => { const t = clamp(0, 1, (x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** ручка лупы смотрит вниз-вправо, а у самого стола поворачивается вправо, чтобы не уйти под стол */
const handleAngle = (y: number) => 45 - 35 * smooth(318, 356, y);
const HANDLE = Math.hypot(LENS.hand, LENS.hand); // длина ручки лупы от центра

export function init(root: HTMLElement) {
  const q = gsap.utils.selector(root);
  const one = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T;

  const words = q<HTMLElement>('[data-process-word]');
  const roll = one('[data-process-roll]');
  const says = q<HTMLElement>('[data-process-say]');
  const num = one('.process__num');
  const stage = one('[data-process-stage]');
  const svg = one<SVGSVGElement>('[data-process-svg]');
  const lines = q<SVGPathElement>('[data-process-line]');
  const marks = q<SVGTextElement>('[data-process-mark]');
  const lensMarks = q<SVGTextElement>('[data-process-lens-mark]');
  const allMarks = [...marks, ...lensMarks];
  const axes = q<SVGPathElement>('[data-process-axis]');
  const dims = q<SVGPathElement>('[data-process-dim]');
  const labels = q<SVGTextElement>('[data-process-label]');
  const lamp = one<SVGGElement>('[data-process-lamp]');
  const part = (k: string) => one<SVGGElement>(`[data-part="${k}"]`);
  const pivot1 = one<SVGGElement>('[data-process-pivot1]');
  const pivot2 = one<SVGGElement>('[data-process-pivot2]');
  const nod = one<SVGGElement>('[data-process-nod]');
  const cone = one<SVGPathElement>('[data-process-cone]');
  const glints = q<SVGPathElement>('.pr-glint');
  const shine = one<SVGLinearGradientElement>('[data-process-shine]');
  const SHINE_OFF = { x1: -35, x2: 35 };
  const spring = one<SVGPathElement>('[data-process-spring]');
  const bulb = one<SVGPathElement>('[data-process-bulb]');
  const flash = one<SVGCircleElement>('[data-process-flash]');
  const glow = one<SVGCircleElement>('[data-process-glow]');
  const rays = q<SVGPathElement>('[data-process-ray]');
  const dust = q<SVGCircleElement>('[data-process-dust]');
  const pool = one<SVGPathElement>('[data-process-pool]');
  const ring = one<SVGPathElement>('[data-process-ring]');
  const sparks = q<SVGPathElement>('[data-process-spark]');
  const check = one<SVGGElement>('[data-process-check]');
  const checkC = one<SVGPathElement>('[data-process-check-c]');
  const checkM = one<SVGPathElement>('[data-process-check-m]');
  const snaps = q<SVGGElement>('.pr-snap');
  const lens = one<SVGGElement>('[data-process-lens]');
  const lensView = one<SVGGElement>('[data-process-lens-view]');
  const lensHandle = one<SVGPathElement>('[data-process-lens-handle]');
  const swear = one<SVGGElement>('[data-process-swear]');
  const swearT = one<SVGTextElement>('[data-process-swear-t]');
  const belt = one('[data-process-belt]');
  const rail = one('[data-process-rail]');
  const track = one('.process__track');
  const done = one('[data-process-done]');
  const prog = one('[data-process-prog]');
  const cart = one('[data-process-cart]');
  const gear = one('[data-process-gear]');
  const list = one('[data-process-list]');
  const steps = q<HTMLElement>('[data-process-step]');
  const btns = q<HTMLButtonElement>('[data-process-btn]');
  const nodes = q<HTMLElement>('[data-process-node]');
  const names = q<HTMLElement>('.process__name');

  const cs = getComputedStyle(root);
  const FG = cs.getPropertyValue('--fg').trim() || '#21262B';
  const BG = cs.getPropertyValue('--bg').trim() || '#E9EBEE';
  const man = one<SVGGElement>('[data-process-man]');
  const manArm = one<SVGPathElement>('[data-process-man-arm]');
  const manLines = q<SVGElement>('.pr-man-line');
  const ACC = cs.getPropertyValue('--accent').trim() || '#5F7389';
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const isOn = () => root.classList.contains('is-on');
  const opacityOf = (el: Element) => Number(gsap.getProperty(el, 'opacity'));

  // детали: откуда прилетают. Недалеко и через прозрачность, чтобы край рисунка не резал их
  const KEYS = ['base', 'arm1', 'spring', 'arm2', 'bulb', 'shade', 'j0', 'j1', 'j2'];
  const parts = Object.fromEntries(KEYS.map((k) => [k, part(k)])) as Record<string, SVGGElement>;
  const partEls = KEYS.map((k) => parts[k]);
  const AWAY: Record<string, gsap.TweenVars> = {
    base: { x: -150, y: 0, rotation: 0, scale: 1 },
    arm1: { x: -90, y: -170, rotation: -50, scale: 1 },
    spring: { x: -50, y: -190, rotation: 0, scale: 1 },
    arm2: { x: 170, y: -150, rotation: 40, scale: 1 },
    bulb: { x: 0, y: 0, rotation: 0, scale: 0 },
    shade: { x: 150, y: -190, rotation: -55, scale: 1 },
    j0: { x: 0, y: 0, rotation: -300, scale: 0 },
    j1: { x: 0, y: 0, rotation: -300, scale: 0 },
    j2: { x: 0, y: 0, rotation: -300, scale: 0 },
  };
  gsap.set(partEls, { transformOrigin: '50% 50%' });
  gsap.set(pivot1, { svgOrigin: `${J1[0]} ${J1[1]}` });
  gsap.set(pivot2, { svgOrigin: `${J2[0]} ${J2[1]}` });
  gsap.set(nod, { svgOrigin: `${J2[0]} ${J2[1]}` });
  gsap.set(snaps, { transformOrigin: '50% 50%' });
  gsap.set(allMarks, { transformOrigin: '50% 50%' });
  gsap.set([check, ring], { transformOrigin: '50% 50%' });
  gsap.set(flash, { transformOrigin: '50% 50%' });
  gsap.set(lamp, { svgOrigin: `${PLATE.x + PLATE.w / 2} ${BENCH}` });
  gsap.set(['.pr-blue', '.pr-sketch', '.pr-lens', '.pr-check'].map((s) => one(s)), { opacity: 1 });
  // лампа на ленте качается на заднем по ходу углу подставки, а не тонет в линейке: две обёртки, у каждой свой угол
  const tipL = one<SVGGElement>('[data-process-tip="l"]');
  const tipR = one<SVGGElement>('[data-process-tip="r"]');
  gsap.set(tipL, { svgOrigin: `${PLATE.x} ${BENCH}` });
  gsap.set(tipR, { svgOrigin: `${PLATE.x + PLATE.w} ${BENCH}` });

  /* ---------- анимации шага ----------
   * Всё, что запускает шаг, складывается в live и при смене шага убивается целиком: kill() у самих твинов.
   * gsap.killTweensOf с массивом в GSAP 3.15 не снимает отложенные твины с другими целями (они потом ставили
   * свои начальные значения поверх нового шага), поэтому здесь он с массивами не используется.
   * Новый шаг ведёт каждую группу к своему виду от того места, где она остановилась.
   */
  const live: gsap.core.Animation[] = [];
  const keep = <A extends gsap.core.Animation>(a: A) => { live.push(a); return a; };
  const to = (t: gsap.TweenTarget, v: gsap.TweenVars) => keep(gsap.to(t, v));
  // отложенный fromTo не ставит начальные значения заранее: иначе они видны всю задержку и остаются при отмене
  const fromTo = (t: gsap.TweenTarget, f: gsap.TweenVars, v: gsap.TweenVars) =>
    keep(gsap.fromTo(t, f, { immediateRender: !(Number(v.delay) > 0), ...v }));
  const tl = (v?: gsap.TimelineVars) => keep(gsap.timeline(v));
  const later = (d: number, f: () => void) => keep(gsap.delayedCall(d, f));
  const killScene = () => { live.splice(0).forEach((a) => a.kill()); };
  const killEach = (els: object[]) => els.forEach((e) => gsap.killTweensOf(e));

  /* ---------- 1–2: линии наброска ---------- */
  let sk: Sketch = 'off';
  const clearDash = (el: Element) => { const s = (el as SVGElement).style; s.strokeDasharray = ''; s.strokeDashoffset = ''; };
  function sketch(mode: Sketch, delay = 0) {
    const prev = sk;
    sk = mode;
    if (mode === 'off') { to(lines, { opacity: 0, duration: 0.35, delay, ease: 'power1.out' }); return; }
    const key = mode === 'scribble' ? 'sketch' : 'clean';
    const look = { stroke: mode === 'scribble' ? FG : ACC, strokeWidth: mode === 'scribble' ? 2.2 : 1.6 };
    const op = mode === 'ghost' ? 0.28 : 1;
    // чистый контур заливается фоном: детали перекрывают друг друга, лишние линии под ними не видны
    if (mode !== 'clean') to(lines, { fillOpacity: 0, duration: 0.25, delay });
    if (prev === 'off' && opacityOf(lines[0]) < 0.05) {
      // из пустоты: форма ставится сразу, линии рисуются (подложка просто проявляется)
      lines.forEach((l) => { l.setAttribute('d', l.dataset[key]!); clearDash(l); });
      if (mode === 'ghost') { gsap.set(lines, { ...look, opacity: 0 }); to(lines, { opacity: op, duration: 0.4, delay }); return; }
      gsap.set(lines, { ...look, opacity: 1, drawSVG: '0%', fillOpacity: 0 });
      to(lines, { drawSVG: '100%', duration: mode === 'scribble' ? 0.45 : 0.55, ease: 'power2.inOut', delay, stagger: 0.06, onComplete: () => lines.forEach(clearDash) });
      if (mode === 'clean') to(lines, { fillOpacity: 1, duration: 0.35, delay: delay + 1, stagger: 0.03 });
      return;
    }
    // из другого вида: недорисованное дорисовывается сразу, форма перетекает в нужную
    lines.forEach(clearDash);
    lines.forEach((l, i) => to(l, { morphSVG: l.dataset[key]!, duration: 0.85, ease: 'power3.inOut', delay: delay + i * 0.035 }));
    to(lines, { ...look, opacity: op, duration: 0.5, delay: delay + (mode === 'ghost' ? 0 : 0.2), ease: 'power1.inOut' });
    if (mode === 'clean') to(lines, { fillOpacity: 1, duration: 0.35, delay: delay + 0.95, stagger: 0.03 });
  }

  /* ---------- 1: вопросы. Лупа проходит над вопросом, и он становится восклицательным знаком ---------- */
  const flipped = MARKS.map(() => false);
  const pair = (i: number) => [marks[i], lensMarks[i]];
  function marksShow(delay: number) {
    flipped.fill(false);
    allMarks.forEach((m) => { m.textContent = '?'; m.classList.remove('is-got'); });
    unhideMarks();
    gsap.set(allMarks, { scale: 0, rotation: -35, opacity: 1 });
    MARKS.forEach((_, i) => to(pair(i), { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(3)', delay: delay + i * 0.1 }));
    manShow(delay - 0.3);
  }
  const marksHide = () => { to(allMarks, { scale: 0, opacity: 0, duration: 0.25, ease: 'power2.in' }); manHide(); };
  function flip(i: number) {
    flipped[i] = true;
    pair(i).forEach((m) => { m.textContent = '!'; m.classList.add('is-got'); });
    fromTo(pair(i), { scale: 1.7, rotation: 12 }, { scale: 1, rotation: 0, duration: 0.7, ease: 'elastic.out(1, .4)', overwrite: 'auto' });
    if (i === 2) manGot();
  }

  /* человечек: рисуется, чешет затылок; когда лупа дошла до его вопроса, поднимает руку и подпрыгивает */
  gsap.set(manArm, { svgOrigin: `${MAN.shoulder[0]} ${MAN.shoulder[1]}` });
  function manShow(delay: number) {
    gsap.set(man, { opacity: 1, y: 0 });
    gsap.set(manArm, { rotation: 0, attr: { d: MAN.armR } });
    gsap.set(manLines, { drawSVG: '0%' });
    to(manLines, { drawSVG: '100%', duration: 0.35, ease: 'power2.out', stagger: 0.08, delay: Math.max(0, delay) });
    to(manArm, { rotation: -14, duration: 0.22, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: Math.max(0, delay) + 0.5 });
  }
  function manGot() {
    gsap.killTweensOf(manArm);
    tl().to(manArm, { rotation: 0, morphSVG: MAN.armUp, duration: 0.3, ease: 'back.out(2)' }, 0)
      .to(man, { y: -9, duration: 0.18, ease: 'power2.out' }, 0.05)
      .to(man, { y: 0, duration: 0.4, ease: 'bounce.out' }, 0.23);
  }
  const manHide = () => { gsap.killTweensOf(manArm); to(man, { opacity: 0, duration: 0.25, ease: 'power1.in' }); };
  const unhideMarks = () => marks.forEach((m) => { m.style.fillOpacity = ''; });

  /* лупа: всегда идёт своим маршрутом от вопроса к вопросу по замкнутой кривой и встаёт так, что вопрос в центре стекла */
  const L = { s: 0, k: 0 };
  const SN = LENS_STOPS.length;
  // центростремительная кривая Катмулла — Рома через стоянки: без петель и выбросов за поля рисунка
  const route = (s: number): P => {
    const n = ((Math.floor(s) % SN) + SN) % SN, u = s - Math.floor(s);
    const p = (k: number) => LENS_STOPS[(n + k + SN) % SN];
    const P0 = p(-1), P1 = p(0), P2 = p(1), P3 = p(2);
    const kn = (a: P, b: P) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-3;
    const t1 = kn(P0, P1), t2 = t1 + kn(P1, P2), t3 = t2 + kn(P2, P3);
    const t = t1 + (t2 - t1) * u;
    const lerp = (a: P, b: P, ta: number, tb: number): P => { const w = (t - ta) / (tb - ta); return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]; };
    const A1 = lerp(P0, P1, 0, t1), A2 = lerp(P1, P2, t1, t2), A3 = lerp(P2, P3, t2, t3);
    const B1 = lerp(A1, A2, 0, t2), B2 = lerp(A2, A3, t1, t3);
    return lerp(B1, B2, t1, t2);
  };
  // время перехода зависит от расстояния: короткие шаги не дёргаются, длинные не тянутся
  const SEG = LENS_STOPS.map((p, i) => { const q2 = LENS_STOPS[(i + 1) % SN]; return 0.3 + Math.hypot(q2[0] - p[0], q2[1] - p[1]) / 600; });
  const START: P = [150, -70];
  let lensOn = false;
  function lensRender() {
    const [rx, ry] = route(L.s);
    let x = START[0] + (rx - START[0]) * L.k, y = START[1] + (ry - START[1]) * L.k;
    // кривая между стоянками не выносит стекло за поля рисунка и под стол
    if (L.k > 0.99) { y = clamp(LENS.minY, LENS.maxY, y); x = clamp(LENS.minX, LENS.right - HANDLE * Math.cos(handleAngle(y) * DEG), x); }
    lens.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    lensHandle.setAttribute('transform', `rotate(${(handleAngle(y) - 45).toFixed(1)})`);
    // у человечка увеличение плавно другое, а вид внутри сдвигается к голове: в стекле голова, шея и мысли
    const dm = Math.hypot(x - MAN_STOP[0], y - MAN_STOP[1]);
    const near = smooth(52, 8, dm);
    const z = ZOOM - (ZOOM - ZOOM_MAN) * near;
    const vx = x + (MAN_VIEW[0] - MAN_STOP[0]) * near, vy = y + (MAN_VIEW[1] - MAN_STOP[1]) * near;
    lensView.setAttribute('transform', `scale(${z.toFixed(3)}) translate(${(-vx).toFixed(1)} ${(-vy).toFixed(1)})`);
    // вопрос под стеклом виден только увеличенным в лупе, снаружи он гаснет и не торчит из-под оправы
    const vis = opacityOf(lens);
    MARKS.forEach((m, i) => {
      const d = Math.hypot(m[0] - x, m[1] - y);
      marks[i].style.fillOpacity = (1 - vis * (1 - clamp(0, 1, (d - LENS.r + 8) / 24))).toFixed(2);
      if (i !== MAN_I && lensOn && L.k > 0.85 && !flipped[i] && d < 26) flip(i);
    });
    // лупа над человечком: он ругается; ушла: успокаивается, и над головой появляется «!»
    if (lensOn && L.k > 0.85) { if (!angry && dm < 10) swearOn(); else if (angry && dm > 18) swearOff(); }
  }
  /* человечек ругается: в лупе над головой облачко мыслей, в нём перебираются звёздочки и решётки, кулак трясётся */
  const MAN_I = 2;
  const GRAWLIX = '#@%&*!$?';
  let angry = false, cuss: gsap.core.Tween | null = null;
  // облачко растёт от макушки, откуда идут кружки
  gsap.set(swear, { svgOrigin: `${THINK_DOTS[0][0][0]} ${THINK_DOTS[0][0][1]}`, scale: 0 });
  const curse = () => {
    const a = GRAWLIX.split('');
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    swearT.textContent = a.slice(0, 4).join('') + '!';
  };
  function swearOn() {
    angry = true;
    to(pair(MAN_I), { scale: 0, duration: 0.15, ease: 'power2.in', overwrite: 'auto' });
    curse();
    fromTo(swear, { scale: 0, rotation: -12, opacity: 1 }, { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(2.6)', overwrite: 'auto' });
    cuss?.kill();
    cuss = gsap.to({}, { duration: 0.13, repeat: -1, onRepeat: curse });
    // кулак вверх и трясётся, сам подпрыгивает от злости
    gsap.killTweensOf(manArm);
    tl().to(manArm, { rotation: 0, morphSVG: MAN.armUp, duration: 0.18, ease: 'power2.out' }, 0)
      .to(manArm, { rotation: 16, duration: 0.08, ease: 'sine.inOut', yoyo: true, repeat: 9 }, 0.18)
      .to(man, { y: -4, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 3 }, 0.05);
  }
  function swearOff(quiet = false) {
    const was = angry;
    angry = false;
    cuss?.kill(); cuss = null;
    // смена шага убирает облачко сразу, даже если оно ещё уезжало
    if (quiet) { gsap.killTweensOf(swear); gsap.set(swear, { scale: 0, opacity: 0 }); return; }
    if (!was) return;
    // уход облачка не привязан к шагу: смена шага его не заморозит на полпути
    gsap.to(swear, { scale: 0, opacity: 0, duration: 0.28, ease: 'back.in(1.8)', overwrite: true });
    gsap.killTweensOf(manArm, 'rotation');
    to(manArm, { rotation: 0, duration: 0.2, ease: 'power2.out' });
    // выругался и понял: вопрос над головой становится восклицательным знаком
    if (!flipped[MAN_I]) flip(MAN_I);
    else fromTo(pair(MAN_I), { scale: 0 }, { scale: 1, duration: 0.4, ease: 'back.out(2.5)', overwrite: 'auto' });
  }

  let ticking = false;
  const tick = (on: boolean) => { if (on && !ticking) gsap.ticker.add(lensRender); if (!on && ticking) gsap.ticker.remove(lensRender); ticking = on; };
  const stay = (i: number) => ((i + 1) % SN === MAN_I ? MAN_HOLD : HOLD); // стоянка после перехода i
  /** запускает обход и возвращает, через сколько секунд первый круг дойдёт до последнего вопроса */
  function lensShow(delay: number) {
    lensOn = true;
    L.s = 0; L.k = 0;
    gsap.set(lens, { opacity: 0 });
    lensRender();
    tick(true);
    to(lens, { opacity: 1, duration: 0.3, delay });
    to(L, { k: 1, duration: 0.8, ease: 'power2.inOut', delay });
    // обход: переход с мягким разгоном и торможением, стоянка над вопросом; круг замкнут, повтор без рывка
    const walk = tl({ delay: delay + 0.8 + HOLD, repeat: -1 });
    SEG.forEach((d, i) => { walk.to(L, { s: i + 1, duration: d, ease: 'sine.inOut' }); walk.to({}, { duration: stay(i) }); });
    return delay + 0.8 + HOLD + SEG.slice(0, SN - 2).reduce((a, d, i) => a + d + stay(i), 0) + SEG[SN - 2];
  }
  function lensHide() {
    swearOff(true);
    lensOn = false;
    const off = () => { if (!lensOn) { tick(false); unhideMarks(); } };
    if (opacityOf(lens) > 0.01) to(lens, { opacity: 0, duration: 0.3, ease: 'power1.in', onComplete: off });
    else { gsap.set(lens, { opacity: 0 }); off(); }
  }

  /* ---------- 2: осевые и размеры. На сборке чертёж остаётся бледной подложкой ---------- */
  const ink = [...axes, ...dims, ...labels];
  const finals = labels.map((l) => l.textContent || '');
  const restoreLabels = () => labels.forEach((l, i) => { l.textContent = finals[i]; });
  function blue(mode: 'off' | 'on' | 'ghost', delay = 0) {
    restoreLabels(); // прерванная «рулетка» цифр не оставляет мусор в подписях
    if (mode === 'off') {
      to(dims, { drawSVG: '0%', duration: 0.35, ease: 'power2.in' });
      to([...axes, ...labels], { opacity: 0, duration: 0.25 });
      return;
    }
    if (mode === 'ghost') {
      if (opacityOf(axes[0]) < 0.02) { gsap.set(ink, { opacity: 0 }); gsap.set(dims, { drawSVG: '100%' }); }
      else to(dims, { drawSVG: '100%', duration: 0.4, ease: 'power2.out' });
      to(ink, { opacity: 0.2, duration: 0.6, delay, ease: 'power1.inOut' });
      return;
    }
    gsap.set(axes, { opacity: 0 });
    to(axes, { opacity: 0.9, duration: 0.5, delay, stagger: 0.12 });
    gsap.set(dims, { opacity: 1, drawSVG: '0%' });
    to(dims, { drawSVG: '100%', duration: 0.65, ease: 'power2.inOut', delay: delay + 0.15, stagger: 0.09 });
    gsap.set(labels, { opacity: 0 });
    labels.forEach((l, i) => {
      const at = delay + 0.55 + i * 0.12;
      to(l, { opacity: 1, duration: 0.01, delay: at });
      to(l, { duration: 0.7, delay: at, scrambleText: { text: finals[i], chars: '0123456789', speed: 0.6 } });
    });
  }

  /* ---------- 3: детали. Сборка, разлёт, «уехала по ленте» ---------- */
  let partsOn = false;
  const snap = (k: number, delay: number) => fromTo(snaps[k], { opacity: 1, scale: 0.55 }, { opacity: 0, scale: 1.35, duration: 0.5, ease: 'power2.out', delay });
  function partIn(k: string, at: number, dur: number, ease: string) {
    to(parts[k], { x: 0, y: 0, rotation: 0, scale: 1, duration: dur, ease, delay: at });
    to(parts[k], { opacity: 1, duration: Math.min(0.3, dur * 0.45), ease: 'power1.out', delay: at });
  }
  function assemble(delay: number) {
    partsOn = true;
    // лампа могла не доехать с ленты: возвращается на место
    to(lamp, { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' });
    partIn('base', delay, 0.75, 'power3.out');
    partIn('arm1', delay + 0.22, 0.75, 'back.out(1.5)');
    partIn('j0', delay + 0.85, 0.55, 'back.out(2)');
    snap(0, delay + 0.9);
    gsap.set(parts.spring, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });
    gsap.set(spring, { drawSVG: '0%' });
    to(spring, { drawSVG: '100%', duration: 0.5, ease: 'power2.inOut', delay: delay + 0.95, onComplete: () => clearDash(spring) });
    partIn('arm2', delay + 0.5, 0.75, 'back.out(1.5)');
    partIn('j1', delay + 1.1, 0.55, 'back.out(2)');
    snap(1, delay + 1.18);
    partIn('shade', delay + 0.8, 0.8, 'back.out(1.7)');
    partIn('bulb', delay + 1.25, 0.5, 'back.out(3)');
    partIn('j2', delay + 1.35, 0.55, 'back.out(2)');
    snap(2, delay + 1.45);
  }
  /** лампа уже собрана (или её сборку прервали): всё доводится на место */
  function settle() {
    partEls.forEach((p) => to(p, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'power3.out' }));
    to(spring, { drawSVG: '100%', duration: 0.4, ease: 'power2.out', onComplete: () => clearDash(spring) });
    to(lamp, { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' });
  }
  const stowNow = () => {
    KEYS.forEach((k) => gsap.set(parts[k], { ...AWAY[k], opacity: 0 }));
    gsap.set(lamp, { x: 0, opacity: 1, scaleX: 1, scaleY: 1 });
    gsap.set([tipL, tipR], { rotation: 0 });
  };
  /** деталей на этом шаге нет: если что-то ещё видно (прерванный разлёт или отъезд), гаснет, потом всё на исходные */
  function stow() {
    if (!partEls.some((p) => opacityOf(p) > 0.01)) { stowNow(); return; }
    to(partEls, { opacity: 0, duration: 0.25, ease: 'power1.in' });
    later(0.27, stowNow);
  }
  function scatter() {
    partsOn = false;
    KEYS.forEach((k, i) => {
      to(parts[k], { ...AWAY[k], duration: 0.42, ease: 'power2.in', delay: i * 0.025 });
      to(parts[k], { opacity: 0, duration: 0.3, ease: 'power1.in', delay: i * 0.025 + 0.05 });
    });
  }
  function rideAway() {
    partsOn = false;
    to(lamp, { x: 380, duration: 0.75, ease: 'power2.in' });
    to(lamp, { opacity: 0, duration: 0.4, delay: 0.35, ease: 'power1.in' });
    later(0.78, stowNow);
  }

  /* ---------- 4: лампа включается. Моргает, вспыхивает, светит тёплым, в луче плывут пылинки, в свет падает галочка ---------- */
  const lit = [cone, check, glow, pool, flash, ring, ...glints, ...rays, ...sparks, ...dust];
  function polish(on: boolean, delay = 0) {
    if (!on) {
      to(lit, { opacity: 0, duration: 0.3 });
      to(nod, { rotation: 0, duration: 0.4 });
      to(bulb, { fill: '#fff', duration: 0.3 });
      gsap.set(shine, { attr: SHINE_OFF });
      return;
    }
    gsap.set(lit, { opacity: 0 });
    gsap.set(shine, { attr: SHINE_OFF });
    const t = tl({ delay });
    // щелчок: плафон чуть приседает, лампочка моргает
    t.to(nod, { rotation: 3, duration: 0.22, ease: 'power2.out' }, 0);
    [0.55, 0.05, 0.75, 0.1].forEach((o, i) => {
      t.to(cone, { opacity: o, duration: 0.08, ease: 'none' }, 0.22 + i * 0.11);
      t.to(bulb, { fill: o > 0.3 ? WARM : '#fff', duration: 0.08, ease: 'none' }, 0.22 + i * 0.11);
    });
    // вспышка: свет бьёт кругом, лучи разлетаются, лампа подпрыгивает от толчка
    const B = 0.7;
    t.set([cone, glow], { opacity: 1 }, B)
      .set(bulb, { fill: WARM }, B)
      .fromTo(flash, { opacity: 1, scale: 0.4 }, { opacity: 0, scale: 4.2, duration: 1.1, ease: 'expo.out' }, B)
      .fromTo(rays, { opacity: 1, drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.3, ease: 'power3.out', stagger: 0.012 }, B)
      .to(rays, { drawSVG: '100% 100%', duration: 0.45, ease: 'power2.in', stagger: 0.012 }, B + 0.3)
      .set(rays, { opacity: 0 }, B + 0.95)
      .to(nod, { rotation: -3, duration: 0.7, ease: 'elastic.out(1, .35)' }, B)
      .to(lamp, { scaleY: 0.955, scaleX: 1.025, duration: 0.09, ease: 'power2.out' }, B)
      .to(lamp, { scaleY: 1, scaleX: 1, duration: 0.6, ease: 'elastic.out(1.1, .3)' }, B + 0.09)
      .fromTo(glow, { scale: 0.6, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.6, ease: 'power3.out' }, B)
      .to(pool, { opacity: 1, duration: 0.5, ease: 'power2.out' }, B + 0.05);
    dust.forEach((p, i) => t.to(p, { opacity: 0.55 + (i % 3) * 0.15, duration: 0.6 }, B + 0.25 + i * 0.04));
    // галочка появляется в свете и отпечатывается: кольцо расходится, искры разлетаются
    const C = B + 0.5;
    gsap.set(checkC, { drawSVG: '100%', fillOpacity: 1 });
    t.fromTo(check, { opacity: 1, scale: 0, rotation: -120 }, { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(2.2)' }, C)
      .fromTo(checkM, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.32, ease: 'power3.out' }, C + 0.36)
      .fromTo(ring, { opacity: 0.9, scale: 0.9 }, { opacity: 0, scale: 2.1, duration: 0.8, ease: 'power2.out' }, C + 0.42)
      .fromTo(sparks, { opacity: 1, drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.22, ease: 'power3.out' }, C + 0.42)
      .to(sparks, { drawSVG: '100% 100%', duration: 0.35, ease: 'power2.in' }, C + 0.64)
      .set(sparks, { opacity: 0 }, C + 1)
      .to(check, { scale: 1.12, duration: 0.14, ease: 'power2.out' }, C + 0.42)
      .to(check, { scale: 1, duration: 0.4, ease: 'elastic.out(1, .4)' }, C + 0.56);
    glints.forEach((g, i) => t.to(g, { opacity: 0.6, duration: 0.5 }, B + 0.3 + i * 0.08));
    // потом жизнь: блик бежит по лампе, пылинки плывут в луче, свет дышит, плафон покачивается
    to(shine, { attr: { x1: 525, x2: 595 }, duration: 1.3, ease: 'sine.inOut', delay: delay + B + 0.6, repeat: -1, repeatDelay: 2.2 });
    dust.forEach((p, i) => to(p, { x: gsap.utils.random(-8, 8), y: -gsap.utils.random(10, 26), duration: gsap.utils.random(2.2, 3.6), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: delay + B + (i % 5) * 0.2 }));
    to(glow, { opacity: 0.75, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: delay + B + 1 });
    to(nod, { rotation: -6, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: delay + B + 1.4 });
  }

  /* ---------- лента под лампой едет, собранная лампа качается на заднем углу подставки ---------- */
  const beltP = { v: 0 };
  const wrap60 = gsap.utils.wrap(0, 60);
  function ride(dist: number, dir: 1 | -1) {
    gsap.to(beltP, { v: `+=${dist * dir}`, duration: 1.05, ease: 'power3.inOut', overwrite: true, onUpdate: () => gsap.set(belt, { x: wrap60(beltP.v) - 60 }) });
    const tip = dir > 0 ? tipL : tipR;
    to(dir > 0 ? tipR : tipL, { rotation: 0, duration: 0.3 });
    if (!partsOn) { to(tip, { rotation: 0, duration: 0.3 }); return; }
    // лента тянет подставку, верх отстаёт: лампа встаёт на задний угол и падает обратно без провала в стол
    tl().to(tip, { rotation: -3 * dir, duration: 0.35, ease: 'power2.out' }).to(tip, { rotation: 0, duration: 0.75, ease: 'bounce.out' });
  }

  let lensEnd = 0; // когда лупа на первом шаге дойдёт до последнего вопроса, от начала шага
  function scene(from: number, next: number) {
    const t0 = from < 0 ? 0.25 : 0;
    const had = partsOn;
    if (next < 2) look(null);
    if (next === 0) {
      blue('off'); polish(false);
      if (had) { if (from === N - 1) rideAway(); else scatter(); } else stow();
      const d = t0 + (had ? (from === N - 1 ? 0.8 : 0.45) : 0);
      sketch('scribble', d);
      marksShow(d + 0.55);
      lensEnd = lensShow(d + 0.7);
    } else if (next === 1) {
      lensHide(); marksHide(); polish(false);
      if (had) scatter(); else stow();
      sketch('clean', t0 + (had ? 0.35 : 0.15));
      blue('on', t0 + (had ? 0.7 : 0.8));
    } else if (next === 2) {
      lensHide(); marksHide(); polish(false);
      blue('ghost', t0 + 0.05);
      sketch('ghost', t0 + 0.05);
      if (had) settle(); else assemble(t0 + 0.2);
    } else {
      lensHide(); marksHide(); blue('off');
      if (had) settle(); else assemble(t0 + 0.1);
      sketch('off', t0 + (had ? 0 : 1.6));
      polish(true, t0 + (had ? 0.35 : 1.8));
    }
  }

  /* ---------- линия с постами ---------- */
  const center = (i: number) => {
    const r = rail.getBoundingClientRect(), n = nodes[i].getBoundingClientRect();
    return { x: n.left + n.width / 2 - r.left, y: n.top + n.height / 2 - r.top };
  };
  // размеры линии по раскладке, без transform: на входе линия ещё вытягивается из нуля, а заливку уже надо посчитать
  const trackBox = () => ({ x: track.offsetLeft, w: track.offsetWidth || 1 });
  let cartX = 0;
  function moveCart(i: number, dur: number) {
    const c = center(i), tb = trackBox();
    const dx = c.x - cartX;
    cartX = c.x;
    gsap.to(cart, { x: c.x, y: c.y, duration: dur, ease: 'power3.inOut', overwrite: 'auto' });
    // шестерня катится: поворот = путь / радиус (зубцы по радиусу 29 из 30 единиц рисунка)
    const rad = (cart.offsetWidth / 2) * (29 / 30) || 31;
    if (dur) gsap.to(gear, { rotation: `+=${(dx / rad) * (180 / Math.PI)}`, duration: dur, ease: 'power3.inOut', overwrite: 'auto' });
    gsap.to(done, { scaleX: Math.max(0, (c.x - tb.x) / tb.w), duration: dur, ease: 'power3.inOut', overwrite: 'auto' });
    if (dur) gsap.timeline({ delay: dur * 0.85 }).to(gear, { scale: 1.14, duration: 0.14, ease: 'power2.out' }).to(gear, { scale: 1, duration: 0.26, ease: 'power2.inOut' });
  }
  function progBox(i: number) {
    const tb = trackBox();
    const a = center(i).x - tb.x;
    const b = i < N - 1 ? center(i + 1).x - tb.x : tb.w;
    gsap.set(prog, { left: a, width: Math.max(0, b - a) });
  }

  // пауза автопрокрутки: наведение и фокус на постах, тап, движение мыши над рисунком
  const holds = new Set<string>();
  let timer: gsap.core.Tween | undefined;
  let touchHold: gsap.core.Tween | undefined;
  const hold = (src: string, on: boolean) => {
    if (on) holds.add(src); else holds.delete(src);
    if (holds.size) timer?.pause(); else timer?.resume();
  };
  // человек в этот заход сам выбирал шаг: после последнего шага сцена дальше сама не листает
  let touched = false;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function startTimer(delay: number, dur: number) {
    timer?.kill();
    progBox(cur);
    timer = gsap.fromTo(prog, { scaleX: 0 }, { scaleX: 1, duration: dur, ease: 'none', delay, paused: holds.size > 0,
      onComplete: () => {
        if (!isOn()) return;
        // все четыре шага досмотрели: сцена переходит к контактам
        if (cur === N - 1 && !touched && !calm) { root.dispatchEvent(new CustomEvent('block:done')); return; }
        go(cur + 1);
      } });
  }

  const digits = roll.children.length; // 1 2 3 4 и ещё раз 1 для перехода по кругу
  // подпись шага: старая уходит вверх под маску, новая поднимается снизу, когда старой уже нет
  function swapSay(from: number, next: number) {
    const out = from >= 0 && from !== next;
    says.forEach((s, k) => {
      if (k === next || (out && k === from)) return;
      gsap.killTweensOf(s);
      s.classList.remove('is-on');
      gsap.set(s, { opacity: 0, yPercent: 0 });
    });
    if (out) {
      says[from].classList.remove('is-on');
      gsap.to(says[from], { opacity: 0, yPercent: -60, duration: 0.22, ease: 'power2.in', overwrite: true });
    }
    says[next].classList.add('is-on');
    gsap.fromTo(says[next], { opacity: 0, yPercent: 70 }, { opacity: 1, yPercent: 0, duration: 0.6, ease: 'expo.out', delay: out ? 0.22 : 0, overwrite: true });
  }

  // пост: подпись и aria-pressed сразу, кружок загорается, когда к нему подъехала шестерня
  let hereCall: gsap.core.Tween | undefined;
  function setUI(i: number, from: number, dur: number) {
    steps.forEach((s, k) => {
      s.classList.toggle('is-active', k === i);
      s.classList.remove('is-here');
      s.classList.toggle('is-done', k < i && (from < 0 || k <= from));
    });
    btns.forEach((b, k) => b.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
    hereCall?.kill();
    const arrive = () => steps.forEach((s, k) => { s.classList.toggle('is-here', k === i); s.classList.toggle('is-done', k < i); });
    if (dur) hereCall = gsap.delayedCall(dur * 0.78, arrive); else arrive();
  }

  let cur = -1;
  function go(next: number, byUser = false) {
    const i = ((next % N) + N) % N;
    if (byUser) touched = true;
    if (i === cur) return;
    const from = cur;
    cur = i;
    killScene();
    gsap.set(snaps, { opacity: 0 });
    const dur = from < 0 ? 0 : MOVE;
    setUI(i, from, dur);
    // номер: барабан крутится вперёд, с 4 на 1 через лишнюю единицу
    const loop = from === N - 1 && i === 0 && digits > N;
    gsap.to(roll, { yPercent: (-100 / digits) * (loop ? N : i), duration: 0.8, ease: 'expo.inOut', overwrite: true,
      onComplete: () => { if (loop) gsap.set(roll, { yPercent: 0 }); } });
    swapSay(from, i);
    moveCart(i, dur);
    if (from >= 0) ride(loop ? 240 : 180 * Math.abs(i - from), loop || i > from ? 1 : -1);
    scene(from, i);
    const wait = byUser ? 0.25 : from < 0 ? 1.1 : MOVE;
    // первый шаг не кончается, пока последний вопрос не стал «!» и немного не побыл на виду
    startTimer(wait, i === 0 ? Math.max(DWELL[0], lensEnd + 0.9 - wait) : DWELL[i]);
  }

  /* ---------- управление ---------- */
  let lastPointer = 'mouse';
  // после входа шаги всегда идут с первого; пост выбирает только курсор, который двинулся уже здесь
  const arm = pointerArm();
  list.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
  btns.forEach((b, i) => {
    b.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && isOn() && arm.armed && cur !== i) go(i, true); });
    b.addEventListener('focus', () => { if (isOn()) go(i, true); });
    b.addEventListener('click', () => {
      if (!isOn()) return;
      go(i, true);
      if (lastPointer !== 'mouse') {
        hold('touch', true);
        touchHold?.kill();
        touchHold = gsap.delayedCall(7, () => hold('touch', false));
      }
    });
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const k = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (k < 0) return;
    e.preventDefault();
    btns[(k + (e.key === 'ArrowRight' ? 1 : -1) + N) % N].focus();
  });
  list.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && arm.armed && !holds.has('hover')) hold('hover', true); });
  list.addEventListener('pointerleave', () => hold('hover', false));
  list.addEventListener('focusin', (e) => { if ((e.target as HTMLElement).matches(':focus-visible')) hold('focus', true); });
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget as Node)) hold('focus', false); });

  // мышь над рисунком: на собранной лампе плафон смотрит на курсор
  const toSvg = (e: PointerEvent): P => {
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  // quickTo пересоздаётся при сбросе: killTweensOf убивает его внутренний твин
  let rot1: gsap.QuickToFunc, rot2: gsap.QuickToFunc;
  function makeLook() {
    killEach([pivot1, pivot2]);
    gsap.set([pivot1, pivot2], { rotation: 0 });
    rot1 = gsap.quickTo(pivot1, 'rotation', { duration: 0.8, ease: 'power3' });
    rot2 = gsap.quickTo(pivot2, 'rotation', { duration: 0.6, ease: 'power3' });
  }
  function look(p: P | null) {
    if (!p) { rot1(0); rot2(0); return; }
    const a = Math.atan2(p[1] - J2[1], p[0] - J2[0]) / DEG; // 60 = смотрит вниз-вперёд, как нарисовано
    const d = clamp(-50, 50, a - 60);
    // вверх плафон поднимается немного: иначе луч света уходит за правый край рисунка
    rot1(clamp(-4, 5, d * 0.12));
    rot2(clamp(-9, 20, d * 0.45));
  }
  // на собранной лампе плафон смотрит на курсор; лупа на мышь не реагирует, шаги не останавливаются
  let lastXY = [-1, -1];
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !fine.matches || !isOn() || !partsOn) return;
    if (Math.hypot(e.clientX - lastXY[0], e.clientY - lastXY[1]) < 3) return;
    lastXY = [e.clientX, e.clientY];
    look(toSvg(e));
  });
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') look(null); });

  addEventListener('resize', () => {
    if (cur < 0) return;
    const c = center(cur), tb = trackBox();
    cartX = c.x;
    gsap.set(cart, { x: c.x, y: c.y });
    gsap.set(done, { scaleX: Math.max(0, (c.x - tb.x) / tb.w) });
    progBox(cur);
  }, { passive: true });

  /* ---------- исходное состояние ---------- */
  function reset() {
    killScene();
    timer?.kill(); timer = undefined;
    touchHold?.kill(); hereCall?.kill();
    holds.clear();
    // блок мог открыться потому, что на шаг перешёл фокус с клавиатуры, или курсор уже стоит над линией
    const fe = document.activeElement as HTMLElement | null;
    if (fe && list.contains(fe) && fe.matches(':focus-visible')) holds.add('focus');
    arm.reset();
    tick(false);
    lensOn = false; partsOn = false; sk = 'off'; cur = -1;
    killEach([...lines, ...allMarks, ...ink, ...partEls, spring, lamp, tipL, tipR, nod, ...lit, bulb, shine, checkC, checkM, ...snaps, lens, L, beltP, belt, roll, ...says, cart, done, prog]);
    gsap.killTweensOf(gear, 'rotation,scale');
    lines.forEach((l) => { l.setAttribute('d', l.dataset.sketch!); clearDash(l); });
    gsap.set(lines, { opacity: 0, stroke: FG, strokeWidth: 2.2 });
    allMarks.forEach((m) => { m.textContent = '?'; m.classList.remove('is-got'); });
    unhideMarks();
    gsap.set(allMarks, { scale: 0, opacity: 0 });
    gsap.set(lens, { opacity: 0 });
    Object.assign(L, { s: 0, k: 0 });
    killEach([man, manArm, ...manLines, swear]);
    angry = false; cuss?.kill(); cuss = null;
    gsap.set(swear, { scale: 0, opacity: 0 });
    gsap.set(man, { opacity: 0, y: 0 });
    gsap.set(manArm, { rotation: 0, attr: { d: MAN.armR } });
    gsap.set(lines, { fill: BG, fillOpacity: 0 });
    lastXY = [-1, -1];
    restoreLabels();
    gsap.set(dims, { drawSVG: '0%' });
    gsap.set([...axes, ...labels], { opacity: 0 });
    stowNow();
    clearDash(spring);
    gsap.set(nod, { rotation: 0 });
    makeLook();
    gsap.set(lit, { opacity: 0 });
    gsap.set(dust, { x: 0, y: 0 });
    gsap.set(bulb, { fill: '#fff' });
    gsap.set(shine, { attr: SHINE_OFF });
    gsap.set(snaps, { opacity: 0 });
    beltP.v = 0; gsap.set(belt, { x: -60 });
    gsap.set(roll, { yPercent: 0 });
    // подписи спрятаны: первая поднимается вместе с первым шагом, без мигания на входе
    says.forEach((s) => { s.classList.remove('is-on'); gsap.set(s, { opacity: 0, yPercent: 0, y: 0 }); });
    steps.forEach((s, k) => { s.classList.toggle('is-active', k === 0); s.classList.toggle('is-here', k === 0); s.classList.remove('is-done'); });
    btns.forEach((b, k) => b.setAttribute('aria-pressed', k === 0 ? 'true' : 'false'));
    gsap.set(done, { scaleX: 0 });
    gsap.set(prog, { scaleX: 0 });
    gsap.set(gear, { rotation: 0, scale: 1 });
    const c = center(0);
    cartX = c.x;
    gsap.set(cart, { x: c.x, y: c.y });
  }

  /* ---------- вход ---------- */
  const lang = document.documentElement.lang.startsWith('en') ? 'en' : 'ru';
  const CH = lang === 'en' ? 'ABCDEFGHKMNPRSTUVWXYZ0123456789' : 'АБВГДЕЖЗИКЛМНПРСТУФХЦЧШЭЮЯ0123456789';
  const titles = words.map((w) => w.textContent || '');
  const randomOf = (s: string) => Array.from(s, () => CH[Math.floor(Math.random() * CH.length)]).join('');
  const titleIn = () => words.forEach((w, i) => {
    gsap.killTweensOf(w, 'scrambleText');
    w.textContent = randomOf(titles[i]);
    gsap.to(w, { duration: 0.9 + i * 0.15, delay: 0.05 + i * 0.12, ease: 'none', scrambleText: { text: titles[i], chars: CH, speed: 0.7, revealDelay: 0.25 } });
  });

  const intro = gsap.timeline({ paused: true })
    .fromTo(words, { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: 0.08 }, 0)
    .fromTo(num, { clipPath: 'inset(100% 0% 0% 0%)', y: 30 }, { clipPath: 'inset(0% 0% 0% 0%)', y: 0, duration: 0.9, ease: 'expo.out' }, 0.25)
    .fromTo(q('.process__belt'), { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'expo.inOut' }, 0.05)
    .fromTo(track, { scaleX: 0 }, { scaleX: 1, duration: 1, ease: 'expo.inOut' }, 0.15)
    .fromTo(nodes, { scale: 0 }, { scale: 1, duration: 0.55, ease: 'back.out(2.4)', stagger: 0.08, immediateRender: false }, 0.4)
    .fromTo(names, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.06 }, 0.5)
    .fromTo(gear, { y: -46, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'bounce.out', immediateRender: false }, 0.8);

  // фон: циркуль ведёт дугу, линии построения тянутся, угольник прочерчивается
  const bgLines = q<SVGPathElement>('[data-process-bg]');
  const bgIn = gsap.timeline({ paused: true }).fromTo(bgLines, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.4, ease: 'power2.inOut', stagger: 0.03 }, 0.2);

  let first: gsap.core.Tween | undefined;
  watchBlock(root, () => {
    touched = false;
    reset();
    bgIn.restart();
    gsap.set(nodes, { scale: 0 });
    gsap.set(gear, { y: -46, opacity: 0 });
    intro.restart();
    titleIn();
    first?.kill();
    first = gsap.delayedCall(0.3, () => { if (isOn()) go(Math.max(0, btns.indexOf(document.activeElement as HTMLButtonElement))); });
  }, () => {
    first?.kill();
    intro.pause(0);
    bgIn.pause(0);
    words.forEach((w, i) => { gsap.killTweensOf(w, 'scrambleText'); w.textContent = titles[i]; });
    reset();
  });

  reset();
  root.classList.add('is-primed');
}
