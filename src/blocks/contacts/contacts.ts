import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { watchBlock, splitLines, rise, wrap } from '../../scripts/block';

gsap.registerPlugin(SplitText, DrawSVGPlugin, MorphSVGPlugin);

type Pt = [number, number];
interface Box { l: number; t: number; r: number; b: number; w: number; h: number }
interface Route { el: SVGPathElement; len: number }

const NS = 'http://www.w3.org/2000/svg';

/** Плавная кривая через точки (Catmull-Rom в кубические Безье). */
function smooth(pts: Pt[]) {
  const f = (n: number) => n.toFixed(1);
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${f(c1[0])} ${f(c1[1])}, ${f(c2[0])} ${f(c2[1])}, ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
const rectD = (x: number, y: number, w: number, h: number) => `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;

/**
 * Контакты, письмо авиапочтой.
 * Вход: бумажный самолётик пролетает по строкам заголовка, и надпись проявляется за его хвостом,
 * потом под ней дорисовывается росчерк. Справа ложится конверт: сургучная печать трескается, клапан
 * откидывается и показывает подкладку, конверт стягивается вниз, а письмо, сложенное втрое, раскрывается:
 * сначала верхняя треть, потом нижняя, на бумаге остаются и расходятся сгибы, наклеивается марка, ставится штемпель.
 * Дальше самолётик кружит по экрану с тонким следом, ныряет за письмо и уворачивается от курсора.
 * После отправки письмо складывается в самолётик и улетает.
 */
export function init(root: HTMLElement) {
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T;
  const sky = q<SVGSVGElement>('[data-sky]');
  const trail = q<SVGPathElement>('[data-trail]');
  const plane = q<SVGGElement>('[data-plane]');
  const title = q('[data-title]');
  const head = q('[data-head]');
  const leadEl = q('[data-lead]');
  const letter = q('[data-letter]');
  const form = q<HTMLFormElement>('[data-form]');
  const postmark = q('[data-postmark]');
  const postInk = [...postmark.querySelectorAll<SVGGeometryElement>('circle, path')];
  const stampEl = q('.contacts__stamp');
  // конверт и сложенное письмо
  const envBack = q('[data-env-back]');
  const pocket = q<SVGSVGElement>('[data-env-pocket]');
  const flap = q('[data-env-flap]');
  const flapSvg = q<SVGSVGElement>('[data-env-flap-svg]');
  const wax = q('[data-wax]');
  const halves = [...root.querySelectorAll<HTMLElement>('[data-wax-half]')];
  const [foldTop, foldBot] = [...root.querySelectorAll<HTMLElement>('[data-fold]')];
  const faces = [...root.querySelectorAll<HTMLElement>('[data-fold-face]')];
  const creases = [...root.querySelectorAll<HTMLElement>('[data-crease]')];
  const status = q('[data-form-status]');
  const send = q<SVGSVGElement>('[data-send]');
  const sendG = q<SVGGElement>('[data-send-g]');
  const sheet = q<SVGPathElement>('[data-send-sheet]');
  const fold = q<SVGPathElement>('[data-send-fold]');
  const sendTrail = q<SVGPathElement>('[data-send-trail]');
  const swash = root.querySelectorAll<SVGPathElement>('[data-swash]');
  const footer = q('.site-footer');
  const items = [...form.querySelectorAll<HTMLElement>(':scope > :not(.field--hp)')];
  const fine = matchMedia('(hover: hover) and (pointer: fine)');

  // невидимые пути маршрутов: по ним меряем длину и берём точки
  const mk = () => { const p = document.createElementNS(NS, 'path'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'none'); sky.appendChild(p); return p; };
  const routes: Record<'write' | 'idle', Route> = { write: { el: mk(), len: 0 }, idle: { el: mk(), len: 0 } };
  const ruler = mk();

  // ---------- заголовок по строкам ----------
  let lines: HTMLElement[] = [];
  let written = false;
  const reveal: number[] = [];
  let spans: [number, number][] = []; // на каком отрезке пути (в пикселях длины) пишется строка
  let lineLeft: number[] = []; // левый край строк в координатах блока, меряется при раскладке

  // ---------- раскладка в координатах блока ----------
  let W = 0, H = 0;
  // положение по раскладке, без учёта transform: во время входа элементы ещё сдвинуты анимацией
  const box = (el: HTMLElement): Box => {
    let l = 0, t = 0, n: HTMLElement | null = el;
    while (n && n !== root) { l += n.offsetLeft; t += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
    const w = el.offsetWidth, h = el.offsetHeight;
    return { l, t, r: l + w, b: t + h, w, h };
  };
  const setRoute = (r: Route, pts: Pt[]) => { r.el.setAttribute('d', smooth(pts)); r.len = r.el.getTotalLength(); };

  const build = () => {
    W = root.clientWidth; H = root.clientHeight;
    if (!W || !H || !lines.length) return;
    sky.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const narrow = W < 961;
    const top = 56 + 24; // ниже фиксированной шапки

    // путь письма: один спокойный пролёт слева направо под последней строкой, все строки проявляются
    // за хвостом по мере того, как самолётик проходит над ними; в конце мягкий уход вверх-вправо
    const lb = lines.map(box);
    const fs = parseFloat(getComputedStyle(title).fontSize);
    const last = lb[lb.length - 1];
    const x0 = Math.min(...lb.map((b) => b.l)) + fs * 0.12, x1 = Math.max(...lb.map((b) => b.r)) - fs * 0.3;
    const y = last.t + last.h * 0.8;
    // одна плавная линия: подлёт снизу слева по дуге, ровно вдоль строки, уход вправо-вверх по широкой дуге.
    // Касательные на стыках совпадают (горизонталь), поэтому самолётик нигде не дёргается и не делает резкий поворот.
    const S: Pt = [-70, y + fs * 0.55], A: Pt = [x0, y], B: Pt = [x1, y];
    const E: Pt = [W + 140, Math.max(top + 20, y - fs * 1.4)];
    const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const entry = `M ${f(S)} C ${f([S[0] + (A[0] - S[0]) * 0.55, S[1]])}, ${f([A[0] - Math.min(180, (A[0] - S[0]) * 0.45), A[1]])}, ${f(A)}`;
    const dx = E[0] - B[0];
    const d = `${entry} L ${f(B)} C ${f([B[0] + dx * 0.4, B[1]])}, ${f([B[0] + dx * 0.72, E[1] + (B[1] - E[1]) * 0.12])}, ${f(E)}`;
    ruler.setAttribute('d', entry);
    const a0 = ruler.getTotalLength();
    spans = lb.map(() => [a0, a0 + (x1 - x0)] as [number, number]);
    routes.write.el.setAttribute('d', d);
    routes.write.len = routes.write.el.getTotalLength();
    lineLeft = lb.map((b) => b.l);

    // дальше самолётик изредка спокойно пересекает небо по свободной полосе: над содержимым,
    // под ним или (на телефоне) в просвете между подписью и письмом. Без петель и резких виражей.
    const F = box(letter), Hd = box(head), Ld = box(leadEl);
    const footTop = box(footer).t;
    const contentTop = Math.min(Hd.t, F.t), contentBot = Math.max(Hd.b, F.b);
    let lane: number | null = null;
    if (!narrow) {
      if (contentTop - top > 70) lane = (top + contentTop) / 2;
      else if (footTop - contentBot > 70) lane = (contentBot + footTop) / 2;
    } else if (F.t - Ld.b > 26) lane = (Ld.b + F.t) / 2;
    idleOn = lane !== null;
    const ly = lane ?? 0, a = narrow ? 3 : Math.min(14, H * 0.015);
    const ip: Pt[] = [[-90, ly + a]];
    for (let k = 1; k <= 3; k++) ip.push([(W * k) / 4, ly + (k % 2 ? -a : a)]);
    ip.push([W + 90, ly - a]);
    setRoute(routes.idle, ip);
    if (flight && cur) trail.setAttribute('d', cur.el.getAttribute('d') || '');
    draw();
  };
  let idleOn = true;
  let raf = 0;
  const queueBuild = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(build); };
  addEventListener('resize', queueBuild, { passive: true });
  SplitText.create(title, { type: 'lines', linesClass: 'tl', autoSplit: true, onSplit(self) {
    lines = self.lines as HTMLElement[];
    lines.forEach((l, i) => { reveal[i] = written ? 1e4 : 0; l.style.setProperty('--w', `${reveal[i]}px`); });
    queueBuild();
  } });
  document.fonts?.ready.then(queueBuild);

  // ---------- полёт ----------
  const fly = { p: 0 };
  let cur: Route | null = null;
  let flight: gsap.core.Tween | null = null;
  let later: gsap.core.Tween | null = null;
  let lastA = 0, bank = 0;
  const mouse = { x: -1e4, y: -1e4 };
  const dodge = { x: 0, y: 0 };
  const TAIL = 260;

  const draw = () => {
    if (!cur || !cur.len) return;
    const L = cur.len, at = fly.p * L;
    const pt = cur.el.getPointAtLength(at);
    const a1 = cur.el.getPointAtLength(Math.min(L, at + 3)), a0 = cur.el.getPointAtLength(Math.max(0, at - 3));
    const ang = Math.atan2(a1.y - a0.y, a1.x - a0.x) * 180 / Math.PI;
    let da = ang - lastA; if (da > 180) da -= 360; if (da < -180) da += 360;
    lastA = ang;
    bank += (Math.min(0.55, Math.abs(da) * 0.09) - bank) * 0.2; // на вираже самолётик заваливается на крыло
    // уворачивается от курсора
    let tx = 0, ty = 0;
    if (cur === routes.idle) {
      const dx = pt.x - mouse.x, dy = pt.y - mouse.y, dist = Math.hypot(dx, dy);
      if (dist < 120 && dist > 0.1) { const k = (120 - dist) / 120 * 34; tx = dx / dist * k; ty = dy / dist * k; }
    }
    dodge.x += (tx - dodge.x) * 0.06; dodge.y += (ty - dodge.y) * 0.06;
    const s = W < 761 ? (cur === routes.idle ? 0.62 : 0.85) : (cur === routes.idle ? 0.8 : 1);
    plane.setAttribute('transform', `translate(${(pt.x + dodge.x).toFixed(1)} ${(pt.y + dodge.y).toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${s} ${(s * (1 - bank)).toFixed(3)})`);
    const from = Math.max(0, at - TAIL) / L * 100, to = fly.p * 100;
    gsap.set(trail, { drawSVG: `${from}% ${to}%` });
    if (cur === routes.write) inkTitle(at, pt.x);
  };

  // строка проявляется до хвоста самолётика
  const inkTitle = (at: number, x: number) => {
    lines.forEach((l, i) => {
      const sp = spans[i]; if (!sp) return;
      let w = reveal[i] || 0;
      if (at >= sp[1]) w = 1e4;
      else if (at > sp[0]) w = Math.max(w, x - (lineLeft[i] || 0) - 4);
      if (w !== reveal[i]) { reveal[i] = w; l.style.setProperty('--w', `${w.toFixed(0)}px`); }
    });
    // росчерк сразу после последней буквы, за ним открывается письмо (самолётик ещё улетает за край)
    if (!swashed && spans.length && at >= spans[spans.length - 1][1]) { swashed = true; swashIn.play(0.05); openSoon(); }
    // подзаголовок поднимается, когда заголовок написан на треть
    if (!leadOn && spans.length && at >= spans[0][0] + (spans[spans.length - 1][1] - spans[0][0]) * 0.3) { leadOn = true; lead.play(0); }
  };
  let swashed = false, leadOn = false;
  let opened: (() => void) | null = null, openCall: gsap.core.Tween | null = null;
  const openSoon = (delay = 0.45) => { const f = opened; opened = null; if (f) openCall = gsap.delayedCall(delay, f); };
  const setTitle = (on: boolean) => {
    written = on;
    if (!on) { swashed = false; leadOn = false; }
    title.classList.toggle('is-written', on);
    lines.forEach((l, i) => { reveal[i] = on ? 1e4 : 0; l.style.setProperty('--w', `${reveal[i]}px`); });
  };

  const stopFlight = () => { flight?.kill(); flight = null; later?.kill(); later = null; };
  const takeOff = (r: Route, duration: number, ease: string, done: () => void) => {
    stopFlight();
    cur = r; fly.p = 0; bank = 0; dodge.x = dodge.y = 0;
    const a0 = r.el.getPointAtLength(0), a1 = r.el.getPointAtLength(4);
    lastA = Math.atan2(a1.y - a0.y, a1.x - a0.x) * 180 / Math.PI;
    trail.setAttribute('d', r.el.getAttribute('d') || '');
    gsap.set(plane, { opacity: 1 });
    draw();
    flight = gsap.to(fly, { p: 1, duration, ease, onUpdate: draw, onComplete: () => {
      gsap.to(trail, { drawSVG: '100% 100%', duration: 0.6, ease: 'power2.in' });
      gsap.set(plane, { opacity: 0 });
      done();
    } });
  };
  const idle = () => {
    if (!routes.idle.len || !idleOn) { later = gsap.delayedCall(2, idle); return; }
    // медленно, с паузами между пролётами: фон, а не главное действие
    takeOff(routes.idle, routes.idle.len / (W < 761 ? 70 : 110), 'none', () => { later = gsap.delayedCall(4.5, idle); });
  };
  /** Самолётик пишет заголовок, вместе с ним проявляется «Расскажите…», потом росчерк, и только после этого
   *  открывается письмо (opened). */
  const write = (then: () => void) => {
    opened = then;
    if (!routes.write.len) { setTitle(true); leadOn = true; lead.play(0); swashed = true; swashIn.play(0); openSoon(0.3); later = gsap.delayedCall(1, idle); return; }
    // спокойно, с мягким стартом и уходом: видно, что самолётик пишет заголовок
    const dur = gsap.utils.clamp(2.2, 3.8, routes.write.len / 360);
    takeOff(routes.write, dur, 'sine.inOut', () => {
      setTitle(true);
      if (!leadOn) { leadOn = true; lead.play(0); }
      if (!swashed) { swashed = true; swashIn.play(0); }
      openSoon(0);
      later = gsap.delayedCall(1.1, idle);
    });
  };

  root.addEventListener('pointermove', (e) => {
    if (!fine.matches) return;
    const R = root.getBoundingClientRect();
    mouse.x = e.clientX - R.left; mouse.y = e.clientY - R.top + root.scrollTop;
  });
  root.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });

  // ---------- вход ----------
  // росчерк открывается маской слева направо: у линии non-scaling-stroke, drawSVG с ней врёт
  const hid = 'inset(-20px 100% -20px 0px)', shown = 'inset(-20px -20px -20px -20px)';
  // росчерк ведётся рукой: первая линия медленно и ровно, вторая подхватывает её на середине, обе проявляются мягко
  const swashIn = wrap(gsap.timeline({ paused: true })
    .fromTo(swash[0], { clipPath: hid, opacity: 0 }, { clipPath: shown, opacity: 1, duration: 1.1, ease: 'sine.inOut', immediateRender: true })
    .fromTo(swash[1], { clipPath: hid, opacity: 0 }, { clipPath: shown, opacity: 1, duration: 0.9, ease: 'sine.inOut', immediateRender: true }, 0.55));
  const lead = splitLines(q('[data-lead]'), { duration: 1.4, stagger: 0.2 });
  // явные конечные значения: у .btn есть CSS-переход transform, from() с ним путается
  const foot = rise(footer, { y: 0, duration: 0.8 });

  // ---------- конверт ----------
  const envPaper = q<SVGPathElement>('[data-env-paper]'), envUnder = q<SVGPathElement>('[data-env-under]'), envEdge = q<SVGPathElement>('[data-env-edge]');
  const envAir = [...root.querySelectorAll<SVGPathElement>('[data-env-air]')];
  const flapAir = [...root.querySelectorAll<SVGPathElement>('[data-env-flap-air]')], flapEdge = q<SVGPathElement>('[data-env-flap-edge]');
  // копия формы для створок: те же значения полей, без id, имён и data-атрибутов, по которым её искали бы скрипты
  const cloneForm = () => {
    const c = form.cloneNode(true) as HTMLElement;
    c.removeAttribute('style'); // у самой формы на время раскрытия срезка по средней трети и сдвиг
    const src = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    const dst = c.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    src.forEach((el, i) => {
      const to = dst[i]; if (!to) return;
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) (to as HTMLInputElement).checked = el.checked;
      else to.value = el.value;
    });
    [c, ...c.querySelectorAll('*')].forEach((el) => [...el.attributes].forEach(({ name }) => {
      if (name === 'id' || name === 'name' || name === 'for' || (name.startsWith('aria-') && name !== 'aria-invalid')
        || (name.startsWith('data-') && name !== 'data-via' && name !== 'data-kind')) el.removeAttribute(name);
    }));
    return c;
  };
  /** перед раскрытием: размеры конверта по письму, контуры кармана и клапана в пикселях (штрихи канта не тянутся),
   *  в створки ложится копия формы */
  const pack = () => {
    const w = form.offsetWidth, h = form.offsetHeight;
    if (!w || !h) return;
    // конверт чуть шире письма; по высоте в нём лежит средняя треть письма с запасом, пропорции как у настоящего
    const ew = w * 1.04, inner = h / 3;
    const eh = Math.max(inner + 20, Math.min(inner + 2 * Math.max(16, inner * 0.24), ew / 1.55));
    const fh = eh * 0.56; // клапан закрывает карман чуть ниже середины
    letter.style.setProperty('--env-top', `${(h / 2 - eh / 2).toFixed(1)}px`);
    letter.style.setProperty('--env-h', `${eh.toFixed(1)}px`);
    letter.style.setProperty('--flap-h', `${fh.toFixed(1)}px`);
    const f = (n: number) => n.toFixed(1);
    const mouth = eh * 0.5, under = eh * 0.6, cx = ew / 2;
    pocket.setAttribute('viewBox', `0 0 ${f(ew)} ${f(eh)}`);
    envPaper.setAttribute('d', `M0 0 L${f(cx)} ${f(mouth)} L${f(ew)} 0 V${f(eh)} H0 Z`);
    envUnder.setAttribute('d', `M0 ${f(eh)} L${f(cx)} ${f(under)} L${f(ew)} ${f(eh)} Z`);
    envAir.forEach((p) => p.setAttribute('d', `M4.5 0 V${f(eh - 4.5)} H${f(ew - 4.5)} V0`));
    envEdge.setAttribute('d', `M0 0 L${f(cx)} ${f(mouth)} L${f(ew)} 0 M0 ${f(eh)} L${f(cx)} ${f(under)} L${f(ew)} ${f(eh)} M0 0 V${f(eh)} H${f(ew)} V0`);
    flapSvg.setAttribute('viewBox', `0 0 ${f(ew)} ${f(fh)}`);
    [...flapAir, flapEdge].forEach((p) => p.setAttribute('d', `M0 0 L${f(cx)} ${f(fh)} L${f(ew)} 0`));
    faces.forEach((face) => face.replaceChildren(cloneForm()));
  };

  /* Раскрытие, секунды:
     0      конверт ложится на стол
     0.7    печать прижимается и трескается, половинки падают
     0.95   клапан откидывается на петле, изнутри голубая подкладка; открытый уходит за письмо
     1.85   конверт стягивается вниз и гаснет, письмо чуть приподнимается и опускается
     2.45   верхняя треть письма раскрывается к себе, 3.05 нижняя
     3.75   марка, 4.2 штемпель, бумага вздрагивает; сгибы расходятся до 5.5 */
  const T = { wax: 0.7, flap: 0.95, pull: 1.85, top: 2.45, bot: 3.05, stamp: 3.75, post: 4.2 };
  const UNFOLD = 0.7;
  const FULL = 'inset(0% -10% 0% -10%)';
  const envTl = gsap.timeline({ paused: true });
  const packet = [form, foldTop, foldBot];
  envTl
    // конверт ложится: подлетает снизу с лёгким поворотом и выравнивается
    .fromTo(letter, { y: 46, rotation: -5, scale: 0.96, opacity: 0 }, { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 1, ease: 'power3.out', immediateRender: true }, 0)
    // печать: прижали, по ней пошла трещина, половинки расходятся и падают
    .fromTo(wax, { opacity: 1, scale: 1 }, { scale: 0.9, duration: 0.14, ease: 'power2.out', immediateRender: true }, T.wax)
    .to(wax, { scale: 1, duration: 0.2, ease: 'power2.out' }, T.wax + 0.14)
    .fromTo(halves, { x: 0, y: 0, rotation: 0, opacity: 1 }, { x: (i) => (i ? 4 : -4), rotation: (i) => (i ? 9 : -9), duration: 0.18, ease: 'power2.out', immediateRender: true, transformOrigin: '50% 100%' }, T.wax + 0.14)
    .to(halves, { y: 64, x: (i) => (i ? 16 : -16), rotation: (i) => (i ? 48 : -40), opacity: 0, duration: 0.55, ease: 'power2.in', stagger: 0.05 }, T.wax + 0.3)
    // клапан откидывается к себе и назад; когда лёг плашмя над конвертом, уходит за письмо
    .fromTo(flap, { rotationX: 0, opacity: 1, zIndex: 8 }, { rotationX: -180, duration: 0.9, ease: 'power2.inOut', immediateRender: true }, T.flap)
    .set(flap, { zIndex: 0 }, T.pull)
    // конверт стягивают вниз на свою высоту (клапан ниже конверта в 0,56 раза, ему путь в процентах больше),
    // письмо в руке чуть поднимается и ложится обратно
    .fromTo([envBack, pocket], { yPercent: 0, opacity: 1 }, { yPercent: 105, duration: 0.9, ease: 'power2.inOut', immediateRender: true }, T.pull)
    .fromTo(flap, { yPercent: 0 }, { yPercent: 105 / 0.56, duration: 0.9, ease: 'power2.inOut', immediateRender: true }, T.pull)
    // клапан гаснет раньше: иначе его кончик торчит из-за письма «крышей»
    // гасим стороны клапана, а не сам клапан: прозрачность на нём сплющила бы 3D, и вместо подкладки мелькнула бы изнанка
    .to(flap.children, { opacity: 0, duration: 0.35, ease: 'power1.in' }, T.pull + 0.1)
    .to([envBack, pocket], { opacity: 0, duration: 0.5, ease: 'power1.in' }, T.pull + 0.4)
    // погасший конверт возвращается на место: сдвинутый вниз, он растягивал бы прокрутку блока
    .set([envBack, pocket, flap], { yPercent: 0, visibility: 'hidden' }, T.pull + 0.95)
    .to(packet, { keyframes: [{ y: -12, duration: 0.45, ease: 'power2.out' }, { y: 0, duration: 0.55, ease: 'power2.inOut' }] }, T.pull)
    // письмо раскрывается: верхняя треть к себе и вверх, потом нижняя к себе и вниз
    .fromTo(form, { clipPath: 'inset(33.333% -10% 33.333% -10%)' }, { clipPath: 'inset(0% -10% 33.333% -10%)', duration: 0.01, immediateRender: true }, T.top + UNFOLD)
    .fromTo(foldTop, { rotationX: -180, visibility: 'visible' }, { rotationX: 0, duration: UNFOLD, ease: 'power2.inOut', immediateRender: true }, T.top)
    .set(foldTop, { visibility: 'hidden' }, T.top + UNFOLD)
    // нижняя створка лежит под верхней; показываем её, когда верхняя пошла вверх (иначе по краю пачки мелькал бы её кант)
    .fromTo(foldBot, { rotationX: 180, visibility: 'hidden', zIndex: 4 }, { visibility: 'visible', duration: 0.01, immediateRender: true }, T.top)
    .to(foldBot, { rotationX: 0, duration: UNFOLD, ease: 'power2.inOut' }, T.bot)
    // нижняя створка идёт к зрителю: она поверх уже раскрытой верхней
    .set(foldBot, { zIndex: 6 }, T.bot)
    .to(form, { clipPath: FULL, duration: 0.01 }, T.bot + UNFOLD)
    .set(form, { clipPath: 'none' }, T.bot + UNFOLD + 0.02)
    .set(foldBot, { visibility: 'hidden' }, T.bot + UNFOLD)
    // сгибы видны сразу после раскрытия и медленно расходятся
    .fromTo(creases[0], { opacity: 0 }, { opacity: 1, duration: 0.12, immediateRender: true }, T.top + UNFOLD - 0.06)
    .fromTo(creases[1], { opacity: 0 }, { opacity: 1, duration: 0.12, immediateRender: true }, T.bot + UNFOLD - 0.06)
    .to(creases, { opacity: 0, duration: 1.6, ease: 'sine.inOut' }, T.bot + UNFOLD + 0.5)
    // марку прижимают к углу, штемпель отпечатывается на своём месте, бумага вздрагивает
    .fromTo(stampEl, { scale: 1.45, rotation: 18, y: -14, opacity: 0 }, { scale: 1, rotation: 4, y: 0, opacity: 1, duration: 0.55, ease: 'power3.out', immediateRender: true }, T.stamp)
    .fromTo(postInk, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.34, ease: 'power2.out', stagger: 0.04, immediateRender: true }, T.post)
    .to(letter, { keyframes: { y: [0, 2.5, 0] }, duration: 0.24, ease: 'none' }, T.post);
  // какой стороной створка смотрит на зрителя, решает угол, а не backface-visibility: Safari её иногда теряет,
  // и на обороте проступала зеркальная копия формы. Оборот всегда чистая бумага
  const sides = (fold: HTMLElement) => {
    const [face, back] = [...fold.children] as HTMLElement[];
    return () => {
      const r = Math.abs(Number(gsap.getProperty(fold, 'rotationX')) || 0) % 360;
      const away = r > 90 && r < 270;
      face.style.visibility = away ? 'hidden' : '';
      back.style.visibility = away ? '' : 'hidden';
    };
  };
  const sideTop = sides(foldTop), sideBot = sides(foldBot);
  envTl.eventCallback('onUpdate', () => { sideTop(); sideBot(); });
  sideTop(); sideBot();
  const envelope = wrap(envTl);
  // нажали на письмо или перешли в него с клавиатуры, пока оно раскрывается: досматривать не заставляем
  const hurry = () => { if (envTl.isActive() && envTl.timeScale() === 1) envTl.timeScale(3.5); };
  letter.addEventListener('pointerdown', hurry);
  letter.addEventListener('focusin', hurry);
  if (import.meta.env.DEV) (window as unknown as { __contacts: object }).__contacts = { env: envTl, pack };

  // ---------- отправка: письмо складывается в самолётик и улетает ----------
  let sending: gsap.core.Timeline | null = null;
  const restoreLetter = () => {
    gsap.set(send, { visibility: 'hidden' });
    gsap.set(form, { opacity: 1 });
    gsap.set(items, { clearProps: 'opacity,transform' });
  };
  const sendOff = () => {
    sending?.kill();
    stopFlight(); gsap.set(plane, { opacity: 0 }); gsap.set(trail, { drawSVG: '0% 0%' });
    const F = box(form), w = F.w, h = F.h, cx = w / 2, cy = h / 2;
    send.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const envW = Math.min(180, w * 0.5), envH = envW * 0.62;
    const env = rectD(cx - envW / 2, cy - envH / 2, envW, envH);
    const envFold = `M${cx - envW / 2} ${cy - envH / 2} L${cx} ${cy + envH * 0.08} L${cx + envW / 2} ${cy - envH / 2}`;
    const pl = 1.9; // самолётик из письма крупнее летающего
    const planeD = `M${cx + 18 * pl} ${cy} L${cx - 17 * pl} ${cy - 12 * pl} L${cx - 7 * pl} ${cy + 1 * pl} L${cx - 12 * pl} ${cy + 12 * pl} Z`;
    // контур и сгиб самолётика винной линией, как у летающего
    const planeFold = `M${cx + 18 * pl} ${cy} L${cx - 17 * pl} ${cy - 12 * pl} L${cx - 7 * pl} ${cy + 1 * pl} L${cx - 12 * pl} ${cy + 12 * pl} Z M${cx + 18 * pl} ${cy} L${cx - 7 * pl} ${cy + 1 * pl}`;
    // траектория отлёта в координатах письма: вправо-вверх за край экрана
    const Rw = root.clientWidth - F.l;
    const topY = root.scrollTop + 110 - F.t; // верх видимой части блока в координатах письма
    const fp: Pt[] = [[cx, cy], [cx + w * 0.3, cy - h * 0.04], [Math.max(cx + w * 0.55, Rw * 0.82), (cy + topY) / 2], [Rw + 160, topY]];
    sendTrail.setAttribute('d', smooth(fp));
    const tl2 = sendTrail.getTotalLength();
    const fl = { p: 0 };
    gsap.set(sheet, { attr: { d: rectD(0, 0, w, h) }, strokeWidth: 16 });
    gsap.set(fold, { attr: { d: envFold }, drawSVG: '0%', opacity: 1 });
    gsap.set(sendG, { x: 0, y: 0, rotation: 0, scale: 1, svgOrigin: `${cx} ${cy}` });
    gsap.set(sendTrail, { drawSVG: '0% 0%' });
    sending = gsap.timeline({ onComplete: () => { sending = null; later = gsap.delayedCall(0.8, idle); } })
      .to(items, { opacity: 0, y: -10, duration: 0.25, stagger: 0.02, ease: 'power2.in' })
      .set(send, { visibility: 'visible' })
      .set(form, { opacity: 0 })
      .to(sheet, { morphSVG: env, strokeWidth: 9, duration: 0.5, ease: 'power3.inOut' })
      .to(fold, { drawSVG: '100%', duration: 0.3, ease: 'power2.out' }, '-=0.1')
      .to(fold, { opacity: 0, duration: 0.15 }, '+=0.1')
      .set(fold, { attr: { d: planeFold }, drawSVG: '0%', opacity: 1 })
      .to(sheet, { morphSVG: planeD, strokeWidth: 0, duration: 0.45, ease: 'back.out(1.4)' }, '<')
      .to(fold, { drawSVG: '100%', duration: 0.35, ease: 'power1.inOut' }, '-=0.2')
      .to(sendG, { rotation: -10, duration: 0.25, ease: 'power2.out' })
      .to(fl, { p: 1, duration: 1.1, ease: 'power2.in', onUpdate: () => {
        const at = fl.p * tl2;
        const p = sendTrail.getPointAtLength(at), a = sendTrail.getPointAtLength(Math.min(tl2, at + 3)), b = sendTrail.getPointAtLength(Math.max(0, at - 3));
        gsap.set(sendG, { x: p.x - cx, y: p.y - cy, rotation: Math.atan2(a.y - b.y, a.x - b.x) * 180 / Math.PI, scale: 1 - fl.p * 0.45 });
        gsap.set(sendTrail, { drawSVG: `${Math.max(0, at - 320) / tl2 * 100}% ${fl.p * 100}%` });
      } })
      .to(sendTrail, { drawSVG: '100% 100%', duration: 0.4 })
      .add(restoreLetter)
      .fromTo(letter, { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', immediateRender: false })
      .fromTo(items, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.04, ease: 'expo.out', clearProps: 'opacity,transform', immediateRender: false }, '<0.2');
  };
  // ошибка формы снимается, как только её исправили: появился текст или стоит галочка
  const msgField = form.querySelector<HTMLTextAreaElement>('[name="message"]');
  const consentBox = form.querySelector<HTMLInputElement>('[name="consent"]');
  const clearErr = (el: HTMLElement | null, ok: boolean) => {
    if (!el || !ok || el.getAttribute('aria-invalid') !== 'true') return;
    el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby');
    if (status.dataset.kind === 'err') { status.textContent = ''; status.dataset.kind = ''; }
  };
  msgField?.addEventListener('input', () => clearErr(msgField, msgField.value.trim().length >= 3));

  // куда ответить: отмеченный способ открывает свою строку, остальные прячутся
  const via = [...form.querySelectorAll<HTMLInputElement>('input[name="via"]')];
  const viaLine = (b: HTMLInputElement) => form.querySelector<HTMLElement>(`[data-via="${b.value}"]`);
  const syncVia = (b: HTMLInputElement, animate: boolean) => {
    const line = viaLine(b); if (!line) return;
    const input = line.querySelector('input');
    if (b.checked === !line.hidden) return;
    if (b.checked) {
      line.hidden = false;
      if (animate) { gsap.fromTo(line, { height: 0, opacity: 0, y: -6 }, { height: 'auto', opacity: 1, y: 0, duration: 0.35, ease: 'power3.out', clearProps: 'height,opacity,transform' }); input?.focus({ preventScroll: true }); }
    } else line.hidden = true; // старая строка уходит сразу: письмо не прыгает по высоте
    if (input) input.removeAttribute('aria-invalid');
  };
  via.forEach((b) => b.addEventListener('change', () => { via.forEach((o) => syncVia(o, true)); clearErr(b, b.checked); }));
  // после отправки форма сбрасывается: строки возвращаются к отметкам по умолчанию
  form.addEventListener('reset', () => setTimeout(() => via.forEach((b) => syncVia(b, false))));
  form.querySelectorAll<HTMLInputElement>('.reply__line input').forEach((inp) => inp.addEventListener('input', () => clearErr(inp, inp.value.trim().length > 0)));
  consentBox?.addEventListener('change', () => clearErr(consentBox, consentBox.checked));

  // черта под полем: одна линия на каждое поле. При фокусе (и при ошибке) она сама изгибается волной,
  // волна бежит слева направо; при уходе линия выпрямляется справа налево. Так у имени, контакта и письма.
  form.querySelectorAll<SVGSVGElement>('.field__line').forEach((svg) => {
    const host = svg.parentElement!;
    const path = svg.querySelector('path')!;
    const field = host.querySelector<HTMLElement>('input, textarea');
    if (!field) return;
    const st = { p: 0 };
    let w = 0, tw: gsap.core.Tween | null = null, on = false;
    const RAMP = 90, AMP = 2.2, WAVE = 22, MID = 5;
    const draw = () => {
      if (!w) return;
      const front = st.p * (w + RAMP);
      let d = `M0 ${MID}`;
      for (let x = 3; x <= w + 2.9; x += 3) {
        const xx = Math.min(x, w);
        const k = Math.min(1, Math.max(0, (front - xx) / RAMP)), e = k * k * (3 - 2 * k);
        d += ` L${xx.toFixed(1)} ${(MID + Math.sin((xx / WAVE) * Math.PI * 2) * AMP * e).toFixed(2)}`;
      }
      path.setAttribute('d', d);
    };
    new ResizeObserver(() => {
      const nw = Math.round(host.clientWidth);
      if (!nw || nw === w) return;
      w = nw; svg.setAttribute('viewBox', `0 0 ${w} 10`); draw();
    }).observe(host);
    const sync = () => {
      const bad = field.getAttribute('aria-invalid') === 'true';
      const want = host.contains(document.activeElement) || bad;
      svg.classList.toggle('is-on', want && !bad);
      svg.classList.toggle('is-bad', bad);
      if (want === on) return;
      on = want;
      tw?.kill();
      tw = gsap.to(st, { p: on ? 1 : 0, duration: on ? 0.75 : 0.5, ease: on ? 'power2.out' : 'power2.inOut', onUpdate: draw });
    };
    host.addEventListener('focusin', sync);
    host.addEventListener('focusout', () => requestAnimationFrame(sync));
    new MutationObserver(sync).observe(field, { attributes: true, attributeFilter: ['aria-invalid'] });
  });

  new MutationObserver(() => {
    const kind = status.dataset.kind;
    if (kind === 'ok' && root.classList.contains('is-on') && !sending) sendOff();
    else if (kind === 'err') gsap.fromTo(letter, { x: 0 }, { keyframes: { x: [-9, 8, -6, 4, -2, 0] }, duration: 0.45, ease: 'none' });
  }).observe(status, { attributes: true, attributeFilter: ['data-kind'], childList: true });

  watchBlock(root, () => {
    build();
    setTitle(false);
    gsap.set(plane, { opacity: 0 });
    // при переходе между блоками экран ещё открывается: самолётик стартует, когда шторка ушла
    const veiled = !!document.querySelector('.stage-fx.is-on');
    // письмо открывается, когда заголовок дописан, а росчерк пошёл
    later = gsap.delayedCall(veiled ? 0.62 : 0.15, () => write(() => { pack(); envTl.timeScale(1); envelope.play(0.25); foot.play(1.2); }));
  }, () => {
    stopFlight();
    opened = null; openCall?.kill(); openCall = null;
    sending?.kill(); sending = null; restoreLetter();
    // при следующем входе письмо снова чистое: строка статуса не держит блок выше экрана
    if (status.dataset.kind) { status.textContent = ''; status.dataset.kind = ''; }
    gsap.set(plane, { opacity: 0 });
    gsap.set(trail, { drawSVG: '0% 0%' });
    gsap.set(sendTrail, { drawSVG: '0% 0%' });
    setTitle(false);
    [swashIn, lead, foot, envelope].forEach((p) => p.reset());
  });
}
