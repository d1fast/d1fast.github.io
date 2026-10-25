import { gsap } from 'gsap';
import type { Palette } from './palettes';

/**
 * Пространство первого экрана: система координат, по кривым которой пролетают вопросы.
 * Вопрос быстро выезжает, у точки чтения замедляется и снова быстро уходит; за ним тянется лента его цвета,
 * рядом летит его картинка. Пройденные кривые остаются тонкими следами. В сомнении кривые путаются в клубок,
 * в ответе распутываются и сходятся в одну точку, «адрес», где стоят оси и подпись d1fast; дальше по лентам
 * бегут бусины, цель пульсирует.
 * Кривые и оси рисует 2D-холст, вопросы и картинки — обычные элементы с 3D-переносом в той же перспективе.
 * Координаты камеры: x вправо, y вверх, z к зрителю; единица = половина меньшей стороны блока.
 */

type V3 = [number, number, number];
interface Path { story: V3[]; final: V3[]; dwell: number }

/* Опорные точки. story: в долях экрана от точки чтения (u по ширине, v по высоте, z глубина), кривая проходит
   точку чтения в опорной точке dwell. final: в долях места цели, кривая кончается у кольца цели. */
const PATHS: Path[] = [
  // чёрная дуга: слева из глубины, уходит вправо вниз в глубину
  { dwell: 3,
    story: [[-2.4, -0.55, -1.4], [-1.5, -0.18, -0.4], [-0.62, 0, 0.12], [0, 0, 0], [0.6, -0.04, -0.12], [1.25, -0.3, -0.8], [1.95, -0.75, -1.8], [2.7, -1.3, -3]],
    final: [[-1.12, -0.32, -0.3], [-0.98, 0.16, -0.15], [-0.72, 0.5, 0], [-0.4, 0.64, 0.08], [-0.14, 0.52, 0.08], [-0.02, 0.34, 0.04], [-0.03, 0.2, 0], [-0.04, 0.11, 0]] },
  // красная: косо вверх снизу слева, после точки чтения петля и вылет вправо вверх
  { dwell: 3,
    story: [[-1.9, -1.7, 0.5], [-1.15, -0.85, 0.3], [-0.5, -0.12, 0.08], [0, 0, 0], [0.5, 0.1, -0.08], [0.95, 0.42, -0.4], [0.82, 0.86, -0.8], [0.48, 0.62, -0.7], [0.82, 0.4, -0.6], [2.3, 1.6, -2]],
    final: [[-1.02, -1.05, 0.2], [-0.74, -0.78, 0.15], [-0.47, -0.52, 0.1], [-0.24, -0.42, 0.05], [-0.06, -0.5, 0], [-0.03, -0.7, -0.05], [-0.22, -0.74, -0.05], [-0.32, -0.56, 0], [-0.19, -0.3, 0], [-0.08, -0.08, 0]] },
  // жёлтая: сверху из глубины вниз, завиток, потом ровно через точку чтения и вверх вправо
  { dwell: 7,
    story: [[-2.2, 1.5, -2.4], [-1.4, 0.55, -1], [-0.75, -0.25, -0.2], [-0.62, -0.62, 0.1], [-0.9, -0.6, 0.15], [-0.85, -0.3, 0.1], [-0.45, -0.05, 0.04], [0, 0, 0], [0.55, 0.08, -0.1], [2.3, 1.4, -2.2]],
    final: [[0.52, 1.12, -0.4], [0.62, 0.82, -0.25], [0.52, 0.56, -0.1], [0.32, 0.6, 0], [0.3, 0.8, 0.05], [0.46, 0.82, 0.05], [0.52, 0.62, 0.02], [0.4, 0.38, 0], [0.21, 0.2, 0], [0.08, 0.07, 0]] },
  // синяя: падает сверху, отскакивает, точка чтения на вершине первого отскока
  { dwell: 3,
    story: [[-1.2, 2.2, -0.8], [-0.75, 0.7, -0.2], [-0.5, -0.42, 0.08], [0, 0, 0], [0.5, -0.42, 0], [0.85, -0.14, -0.2], [1.15, -0.42, -0.45], [2.4, 0.25, -1.6]],
    final: [[1.3, 0.62, -0.3], [1.08, -0.08, -0.1], [0.86, 0.14, 0], [0.64, -0.06, 0], [0.46, 0.06, 0], [0.3, -0.03, 0], [0.19, 0.01, 0], [0.11, 0, 0]] },
];

/** Путь картинки: начало кривой вопроса, отражённое по горизонтали (картинка въезжает с другой стороны),
    точка рядом с вопросом и уход вверх в глубину, чтобы не пересечь вопрос */
const CARD: V3[][] = PATHS.map((p) => [
  ...p.story.slice(0, p.dwell).map(([x, y, z]) => [-x, y, z] as V3),
  [0, 0, 0], [0.18, 0.22, -0.9], [0.4, 0.55, -2.4], [0.62, 0.9, -4.6],
]);

/** Ход вопроса по времени: быстрый въезд, медленный проход точки чтения, быстрый вылет (секунды) */
export const IN = 0.62, DWELL = 1.45, OUT = 0.72, FLY = IN + DWELL + OUT;
/** картинка летит за вопросом с этой задержкой, с */
const LAG = 0.12;
const F = 3; // фокус камеры, единиц
const INK = '#121110';
const SEG = 18; // отрезков на пролёт между опорными точками

export interface SpaceState {
  /** 0: кривые рассказа, 1: сошлись в цель */
  m: number;
  /** 0…1: клубок сомнения */
  tangle: number;
  /** 0: оси посреди экрана, 1: в цели */
  axes: number;
  /** 0…1: стрелки, цель, подписи и бусины финала */
  fin: number;
  /** вопрос сомнения: глубина, подъём, видимость */
  dz: number; dy: number; dop: number;
}
export interface CurveState { drawn: number; vis: number }

export interface Space {
  st: SpaceState;
  curves: CurveState[];
  /** ход каждого вопроса 0…1 (объекты, чтобы их вёл GSAP); вне этого отрезка вопрос и картинка спрятаны */
  fly: { v: number }[];
  layout(): void;
  start(): void;
  stop(): void;
  tone(p: Palette): void;
  burst(k: number | 'target'): void;
  /** точка чтения вопроса и цель в координатах блока: отсюда разливается новый цвет */
  anchor(k?: number): { x: number; y: number };
  target(): { x: number; y: number };
  pointer(x: number, y: number, on: boolean): void;
  poke(): void;
  draw(): void;
}

interface Opts {
  canvas: HTMLCanvasElement;
  space: HTMLElement;
  aim: HTMLElement;
  questions: HTMLElement[];
  cards: HTMLElement[];
  doubt: HTMLElement | null;
  palettes: Palette[];
  words: string[];
  nick: string;
  calm: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const frac = (v: number) => v - Math.floor(v);

/** Кривая Катмулла-Рома (центростремительная): проходит через все опорные точки без петель на неровном шаге */
function catmull(ctrl: V3[], out: V3[]) {
  const n = ctrl.length;
  const P = (i: number): V3 => {
    if (i < 0) return [2 * ctrl[0][0] - ctrl[1][0], 2 * ctrl[0][1] - ctrl[1][1], 2 * ctrl[0][2] - ctrl[1][2]];
    if (i >= n) return [2 * ctrl[n - 1][0] - ctrl[n - 2][0], 2 * ctrl[n - 1][1] - ctrl[n - 2][1], 2 * ctrl[n - 1][2] - ctrl[n - 2][2]];
    return ctrl[i];
  };
  const tj = (a: V3, b: V3) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
  let o = 0;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let j = 0; j < SEG; j++) {
      const t = t1 + ((t2 - t1) * j) / SEG;
      const q = out[o++];
      for (let c = 0; c < 3; c++) {
        const a1 = ((t1 - t) / t1) * p0[c] + (t / t1) * p1[c];
        const a2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
        const a3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
        const b1 = ((t2 - t) / t2) * a1 + (t / t2) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        q[c] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
      }
    }
  }
  const last = out[o];
  last[0] = ctrl[n - 1][0]; last[1] = ctrl[n - 1][1]; last[2] = ctrl[n - 1][2];
}

/** Эрмитов кусок: значения и скорости на концах (скорости в единицах на весь отрезок) */
const herm = (t: number, p0: number, p1: number, m0: number, m1: number) => {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
};
/** ход по кривой: доля пути s по доле времени u; у точки чтения sc скорость падает, на краях высокая */
function slowmo(u: number, sc: number, ds: number) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const u1 = IN / FLY, u2 = 1 - OUT / FLY;
  const s1 = Math.max(0.02, sc - ds), s2 = Math.min(0.98, sc + ds);
  const mid = (s2 - s1) / (u2 - u1);
  if (u < u1) return herm(u / u1, 0, s1, 2.4 * s1, mid * u1);
  if (u <= u2) return s1 + (u - u1) * mid;
  const h = 1 - u2;
  return herm((u - u2) / h, s2, 1, mid * h, 2.4 * (1 - s2));
}

export function createSpace(o: Opts): Space {
  const { canvas, space, aim, questions, cards, doubt, palettes, words, nick, calm } = o;
  const ctx = canvas.getContext('2d')!;
  const st: SpaceState = { m: 0, tangle: 0, axes: 0, fin: 0, dz: -5, dy: 0, dop: 0 };
  const curves: CurveState[] = PATHS.map(() => ({ drawn: 0, vis: 0 }));
  const fly = PATHS.map(() => ({ v: -1 }));

  let W = 1, H = 1, k = 1, ax = 1, ay = 1, vy = 1, dpr = 1, portrait = false;
  /** точка чтения каждого вопроса (доли экрана), место его картинки (доли экрана с поправкой на глубину) и сомнения */
  const A: [number, number][] = PATHS.map(() => [0, 0]);
  const C: V3[] = PATHS.map(() => [0, 0, 0]);
  let AD: [number, number] = [0, 0];
  let T: [number, number] = [0, 0];
  let aimR = 0.5;
  let fg = INK, bg = '#FFD43B';
  /** половина ширины и высоты вопросов в единицах камеры: лента кончается у края вопроса */
  let qHalf = PATHS.map(() => 0.5), qTall = PATHS.map(() => 0.2);

  /* ---------- раскладка ---------- */
  function layout() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    k = Math.min(W, H) / 2; ax = W / 2 / k; ay = H / 2 / k;
    // по высоте кривые вопросов растягиваются не больше чем в 1,35 раза: на телефоне стоя они иначе слишком крутые
    vy = Math.min(ay, 1.35);
    portrait = H > W * 1.05;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    space.style.setProperty('--persp', `${(F * k).toFixed(1)}px`);
    const a = aim.getBoundingClientRect();
    const aw = a.width > 20 && a.height > 20;
    const tx = aw ? a.left - r.left + a.width / 2 : W * 0.72, ty = aw ? a.top - r.top + a.height / 2 : H * 0.5;
    T = [(tx - W / 2) / (W / 2), (H / 2 - ty) / (H / 2)];
    aimR = Math.max(0.25, (Math.min(aw ? a.width : W * 0.4, aw ? a.height : H * 0.6) / 2 / k) * (portrait ? 0.68 : 0.8));
    questions.forEach((q, i) => { qHalf[i] = q.offsetWidth / 2 / k; qTall[i] = q.offsetHeight / k; });
    // вопрос и картинка стоят парой посередине: на компьютере рядом, стоя картинка над вопросом
    const CZ = -0.35, cs = F / (F - CZ);
    PATHS.forEach((_, i) => {
      const tw = qHalf[i] * 2 * k, th = qTall[i] * k;
      const cw = (cards[i]?.offsetWidth || 0) * cs, ch = (cards[i]?.offsetHeight || 0) * cs;
      let tx = W / 2, ty = H / 2, cx = W / 2, cyy = H / 2;
      if (portrait) {
        const gap = Math.max(30, H * 0.045), top = H * 0.52 - (ch + gap + th) / 2;
        cyy = top + ch / 2; ty = top + ch + gap + th / 2;
      } else {
        const gap = Math.max(36, W * 0.035), left = (W - (tw + gap + cw)) / 2;
        tx = left + tw / 2; cx = left + tw + gap + cw / 2;
        ty = cyy = H * 0.52;
      }
      A[i] = [(tx - W / 2) / (W / 2), (H / 2 - ty) / (H / 2)];
      C[i] = [(cx - W / 2) / (k * cs * ax), (H / 2 - cyy) / (k * cs * ay), CZ];
    });
    AD = [0, portrait ? -0.05 : -0.04];
    dirty = true;
  }

  /* ---------- поворот мира: лёгкое покачивание и наклон за мышью ---------- */
  const view = { yaw: 0, pitch: 0, ty: 0, tp: 0 };
  let cy = 1, sy = 0, cp = 1, sp = 0;
  const PIV = -0.4;
  const rot = (p: V3, out: V3 = [0, 0, 0]): V3 => {
    const z = p[2] - PIV;
    const x1 = p[0] * cy + z * sy, z1 = -p[0] * sy + z * cy;
    out[0] = x1; out[1] = p[1] * cp - z1 * sp; out[2] = p[1] * sp + z1 * cp + PIV;
    return out;
  };
  const proj = (p: V3) => { const s = F / Math.max(0.2, F - p[2]); return { x: W / 2 + p[0] * k * s, y: H / 2 - p[1] * k * s, s }; };

  /* ---------- кривые: опорные точки → выборка точек и длины ---------- */
  const N = PATHS.map((p) => (p.story.length - 1) * SEG + 1);
  const samp = PATHS.map((_, c) => Array.from({ length: N[c] }, () => [0, 0, 0] as V3));
  const lens = PATHS.map((_, c) => new Float32Array(N[c]));
  const scr = PATHS.map((_, c) => ({ x: new Float32Array(N[c]), y: new Float32Array(N[c]), s: new Float32Array(N[c]) }));
  const ctrl = PATHS.map((p) => p.story.map(() => [0, 0, 0] as V3));
  const seed = PATHS.map((p) => p.story.map(() => [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28, 0.7 + Math.random() * 0.8]));
  const CN = CARD.map((p) => (p.length - 1) * SEG + 1);
  const cSamp = CARD.map((_, c) => Array.from({ length: CN[c] }, () => [0, 0, 0] as V3));
  const cLens = CARD.map((_, c) => new Float32Array(CN[c]));
  const cCtrl = CARD.map((p) => p.map(() => [0, 0, 0] as V3));
  let time = 0;
  function build() {
    CARD.forEach((p, c) => {
      if (!(fly[c].v > 0 && fly[c].v < 1)) return;
      p.forEach((v, i) => { const q = cCtrl[c][i]; q[0] = (C[c][0] + v[0]) * ax; q[1] = C[c][1] * ay + v[1] * vy; q[2] = C[c][2] + v[2]; rot(q, q); });
      catmull(cCtrl[c], cSamp[c]);
      const L = cLens[c], S = cSamp[c];
      L[0] = 0;
      for (let i = 1; i < CN[c]; i++) L[i] = L[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1], S[i][2] - S[i - 1][2]);
    });
    const cen: V3 = [0, portrait ? 0.15 * ay : 0.05, -0.3];
    const amp = 0.42 * Math.min(ax, ay);
    PATHS.forEach((p, c) => {
      p.story.forEach((s, i) => {
        const f = p.final[i];
        const q = ctrl[c][i];
        q[0] = lerp((A[c][0] + s[0]) * ax, T[0] * ax + f[0] * aimR, st.m);
        q[1] = lerp(A[c][1] * ay + s[1] * vy, T[1] * ay + f[1] * aimR, st.m);
        q[2] = lerp(s[2], f[2] * aimR, st.m);
        if (st.tangle > 0) {
          // клубок: точки стягиваются к середине и дрожат каждая в своём ритме
          const g = st.tangle, sd = seed[c][i], w = sd[3];
          q[0] = lerp(q[0], cen[0], g * 0.62) + g * amp * Math.sin(time * 1.3 * w + sd[0]);
          q[1] = lerp(q[1], cen[1], g * 0.62) + g * amp * Math.sin(time * 1.1 * w + sd[1]);
          q[2] = lerp(q[2], cen[2], g * 0.62) + g * 0.5 * Math.sin(time * 0.9 * w + sd[2]);
        }
        rot(q, q);
      });
      catmull(ctrl[c], samp[c]);
      const L = lens[c], S = samp[c], P = scr[c];
      L[0] = 0;
      for (let i = 0; i < N[c]; i++) {
        if (i) L[i] = L[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1], S[i][2] - S[i - 1][2]);
        const pr = proj(S[i]);
        P.x[i] = pr.x; P.y[i] = pr.y; P.s[i] = pr.s;
      }
    });
  }
  /** точка кривой c на доле пути s: положение (камера) и касательная */
  const tmpA: V3 = [0, 0, 0], tmpT: V3 = [0, 0, 0];
  const at = (c: number, s: number) => along(samp[c], lens[c], N[c], s);
  function along(S: V3[], L: Float32Array, n: number, s: number) {
    const total = L[n - 1];
    const d = clamp(s, 0, 1) * total;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid] < d) lo = mid; else hi = mid; }
    const f = (d - L[lo]) / Math.max(1e-6, L[hi] - L[lo]);
    for (let i = 0; i < 3; i++) { tmpA[i] = lerp(S[lo][i], S[hi][i], f); tmpT[i] = S[hi][i] - S[lo][i]; }
    return { p: tmpA, t: tmpT, idx: lo, f };
  }
  /** доля пути у точки чтения и полуширина замедления */
  const dwellS = (c: number) => lens[c][PATHS[c].dwell * SEG] / lens[c][N[c] - 1];
  const dwellD = (c: number) => 0.1 / lens[c][N[c] - 1];
  const sOf = (c: number, uu: number) => slowmo(uu, dwellS(c), dwellD(c));

  /* ---------- вопросы и картинки ---------- */
  const shown = new Map<HTMLElement, boolean>();
  const show = (el: HTMLElement, on: boolean) => { if (shown.get(el) !== on) { shown.set(el, on); el.style.visibility = on ? 'visible' : 'hidden'; } };
  const prev = PATHS.map(() => ({ x: 0, y: 0, t: 0, lean: 0, spd: 1 }));
  const place = (el: HTMLElement, p: V3, rz: number, ry: number, extra = '', op = 1) => {
    el.style.transform = `translate3d(${(W / 2 + p[0] * k).toFixed(1)}px,${(H / 2 - p[1] * k).toFixed(1)}px,${(p[2] * k).toFixed(1)}px) rotateZ(${rz.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)${extra} translate(-50%,-50%)`;
    el.style.opacity = op.toFixed(3);
  };
  /** наклон по касательной: вдоль кривой в плоскости экрана и поворот, когда кривая уходит в глубину */
  const bank = (t: V3, kz = 1) => {
    const len = Math.hypot(t[0], t[1], t[2]) || 1;
    // экранный поворот по часовой: кривая, идущая вверх, поворачивает вопрос против часовой
    const rz = -clamp(((Math.atan2(t[1], Math.abs(t[0]) + 1e-6) * 180) / Math.PI) * 0.32, -18, 18);
    const ry = clamp((-t[2] / len) * 38 * kz, -38, 38);
    return { rz, ry };
  };
  function fliers(dt: number) {
    PATHS.forEach((_, c) => {
      const q = questions[c], card = cards[c], uu = fly[c].v;
      const live = uu > 0 && uu < 1;
      show(q, live);
      if (!live) {
        if (card) show(card, false);
        if (uu >= 1) curves[c].drawn = 1;
        prev[c].lean = 0; prev[c].t = 0; prev[c].spd = 1;
        return;
      }
      const s = sOf(c, uu);
      const { p, t } = at(c, s);
      const pos: V3 = [p[0], p[1], p[2]];
      const b = bank(t);
      // скорость на экране: на быстрых участках вопрос клонится вперёд и чуть вытягивается
      const pr = proj(pos), pv = prev[c];
      const v = dt > 0 && pv.t ? (pr.x - pv.x) / dt : 0;
      const vv = dt > 0 && pv.t ? Math.hypot(pr.x - pv.x, pr.y - pv.y) / dt : 0;
      pv.x = pr.x; pv.y = pr.y; pv.t = 1;
      const lean = calm ? 0 : clamp(Math.abs(v) / (2600 * (k / 450)), 0, 1);
      pv.lean = lerp(pv.lean, lean, 0.35);
      // у точки чтения вопрос почти ровный: крен по кривой растёт со скоростью
      pv.spd = lerp(pv.spd, clamp(vv / (1400 * (k / 450)), 0, 1), 0.3);
      const sk = -pv.lean * 14 * Math.sign(v || 1);
      const fade = clamp(uu / 0.04, 0, 1) * clamp((1 - uu) / 0.06, 0, 1);
      const tilt = 0.2 + 0.8 * pv.spd;
      place(q, pos, b.rz * tilt, b.ry * tilt, ` skewX(${sk.toFixed(2)}deg) scaleX(${(1 + pv.lean * 0.08).toFixed(3)})`, fade);
      // лента тянется за вопросом и кончается у его заднего края
      curves[c].drawn = clamp(s - (qHalf[c] * 0.92) / lens[c][N[c] - 1], 0, 1);
      if (card) {
        const uc = uu - LAG / FLY;
        if (uc <= 0 || uc >= 1) { show(card, false); return; }
        show(card, true);
        const L = cLens[c], tot = L[CN[c] - 1];
        const cd = L[PATHS[c].dwell * SEG] / tot, cds = 0.06 / tot;
        const sc = slowmo(uc, cd, cds);
        // скорость по пути (1 = средняя): у точки чтения картинка почти не кренится
        const cv = (slowmo(uc + 0.004, cd, cds) - sc) / 0.004;
        const g = along(cSamp[c], L, CN[c], sc);
        const cp: V3 = [g.p[0], g.p[1], g.p[2]];
        const tb = bank(g.t, 1.3), ct = 0.15 + 0.85 * clamp(cv / 1.6, 0, 1);
        const cb = { rz: tb.rz * ct, ry: tb.ry * ct };
        const wob = calm ? 0 : Math.sin(time * 1.7 + c) * 2.2;
        const cf = clamp(uc / 0.05, 0, 1) * clamp((1 - uc) / 0.06, 0, 1);
        place(card, cp, cb.rz * 0.7 + wob * 0.4, cb.ry + wob, '', cf);
      }
    });
    // сомнение: выплывает из глубины в точку чтения и подрагивает
    if (doubt) {
      const on = st.dop > 0.01;
      show(doubt, on);
      if (on) {
        const sh = calm ? 0 : st.tangle;
        const jx = sh * 0.006 * Math.sin(time * 23), jy = sh * 0.005 * Math.sin(time * 19 + 1);
        const p: V3 = [AD[0] * ax + jx, AD[1] * ay + st.dy + jy, st.dz];
        place(doubt, p, sh * 2.6 * Math.sin(time * 5.3), sh * 7 * Math.sin(time * 3.1), '', st.dop);
      }
    }
  }

  /* ---------- конфетти ---------- */
  interface Bit { x: number; y: number; vx: number; vy: number; r: number; vr: number; size: number; shape: number; color: string; life: number; max: number }
  const bits: Bit[] = [];
  function burst(which: number | 'target') {
    if (calm) return;
    let cx: number, cyy: number, rw: number, rh: number, cols: string[];
    if (which === 'target') {
      const t = target();
      cx = t.x; cyy = t.y; rw = 10; rh = 10;
      cols = palettes.map((p) => p.line);
    } else {
      const a = anchor(which);
      cx = a.x; cyy = a.y; rw = qHalf[which] * k; rh = (qTall[which] * k) / 2;
      const p = palettes[which];
      cols = [p.line, p.accent, p.fg, p.side];
    }
    const sc = k / 450;
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const ex = Math.cos(ang), ey = Math.sin(ang);
      const sp = (380 + Math.random() * 520) * Math.max(0.55, sc);
      bits.push({
        x: cx + ex * rw * (0.7 + Math.random() * 0.4), y: cyy + ey * rh * (0.7 + Math.random() * 0.4),
        vx: ex * sp, vy: ey * sp - 160 * sc, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12,
        size: (5 + Math.random() * 9) * Math.max(0.6, sc), shape: i % 5, color: cols[i % cols.length], life: 0, max: 1 + Math.random() * 0.6,
      });
    }
  }
  function drawBits(dt: number) {
    const g = 1500 * (k / 450);
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life += dt;
      if (b.life >= b.max) { bits.splice(i, 1); continue; }
      b.vx *= 1 - 1.8 * dt; b.vy = b.vy * (1 - 1.8 * dt) + g * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
      ctx.save();
      ctx.globalAlpha = 1 - (b.life / b.max) ** 2;
      ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.color; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      const s = b.size;
      ctx.beginPath();
      if (b.shape === 0) ctx.arc(0, 0, s / 2, 0, 6.283);
      else if (b.shape === 1) ctx.rect(-s / 2, -s / 2, s, s);
      else if (b.shape === 2) { ctx.moveTo(0, -s / 1.6); ctx.lineTo(s / 1.8, s / 2.4); ctx.lineTo(-s / 1.8, s / 2.4); ctx.closePath(); }
      else if (b.shape === 3) ctx.rect(-s, -s / 6, s * 2, s / 3);
      else { ctx.arc(0, 0, s / 2, 0, 6.283); ctx.lineWidth = s / 4; ctx.strokeStyle = b.color; ctx.stroke(); ctx.restore(); continue; }
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- рисование ---------- */
  const alpha = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
  };
  /** лента кривой: тёмная обводка, цветная середина, блик; толщина по глубине, кусками */
  function tube(c: number, from: number, to: number, wf: number) {
    const P = scr[c], n = N[c], L = lens[c], total = L[n - 1];
    const e = to * total, b0 = from * total;
    let end = 0;
    while (end < n - 1 && L[end + 1] <= e) end++;
    if (end < 1 && e <= 0) return null;
    const f = end < n - 1 ? (e - L[end]) / Math.max(1e-6, L[end + 1] - L[end]) : 0;
    const ex = end < n - 1 ? lerp(P.x[end], P.x[end + 1], f) : P.x[end];
    const ey = end < n - 1 ? lerp(P.y[end], P.y[end + 1], f) : P.y[end];
    let start = 0;
    while (start < end && L[start + 1] <= b0) start++;
    const base = clamp(k * 0.026, 4.5, 13);
    const col = palettes[c].line;
    const CH = 9;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 3; pass++) {
      for (let i = start; i < end || (i === end && f > 0); i += CH) {
        const j = Math.min(end, i + CH);
        const sMid = P.s[Math.min(n - 1, (i + j) >> 1)];
        const w = base * sMid * wf;
        ctx.beginPath();
        ctx.moveTo(P.x[i], P.y[i]);
        for (let q = i + 1; q <= j; q++) ctx.lineTo(P.x[q], P.y[q]);
        if (j === end && f > 0) ctx.lineTo(ex, ey);
        if (pass === 0) { ctx.strokeStyle = INK; ctx.lineWidth = w + 3.2 * Math.min(1, wf * 2); }
        else if (pass === 1) { ctx.strokeStyle = col; ctx.lineWidth = w; }
        else { ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = Math.max(0.6, w * 0.26); ctx.translate(-w * 0.12, -w * 0.18); }
        ctx.stroke();
        if (pass === 2) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (j === end) break;
      }
    }
    return { x: ex, y: ey, w: base * P.s[end] * wf };
  }
  /** тонкий след пройденной кривой в цвете текста палитры */
  function ghost(c: number, a: number) {
    const P = scr[c], n = N[c];
    ctx.beginPath();
    ctx.moveTo(P.x[0], P.y[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(P.x[i], P.y[i]);
    ctx.strokeStyle = alpha(fg, 0.3 * a); ctx.lineWidth = 1.6; ctx.setLineDash([]);
    ctx.stroke();
  }
  function arrow(x: number, y: number, dx: number, dy: number, w: number, color: string, a: number) {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, s = Math.max(9, w * 2.4);
    ctx.beginPath();
    ctx.moveTo(x + ux * s * 0.55, y + uy * s * 0.55);
    ctx.lineTo(x - ux * s * 0.6 - uy * s * 0.55, y - uy * s * 0.6 + ux * s * 0.55);
    ctx.lineTo(x - ux * s * 0.6 + uy * s * 0.55, y - uy * s * 0.6 - ux * s * 0.55);
    ctx.closePath();
    ctx.fillStyle = alpha(color, a); ctx.fill();
    ctx.strokeStyle = alpha(INK, a); ctx.lineWidth = 2; ctx.stroke();
  }
  /** оси: в рассказе большие и бледные посреди экрана, в финале у цели */
  function axes() {
    const g = st.axes;
    const cen: V3 = [lerp(0.05 * ax, T[0] * ax, g), lerp(portrait ? 0.12 * ay : 0, T[1] * ay, g), lerp(-0.9, 0, g)];
    const L = lerp(1.3 * Math.min(ax, ay), aimR * 1.02, g);
    const yaw = -0.62 + (calm ? 0 : Math.sin(time * 0.35) * 0.06), pit = 0.32;
    const c1 = Math.cos(yaw), s1 = Math.sin(yaw), c2 = Math.cos(pit), s2 = Math.sin(pit);
    const dir = (v: V3): V3 => { const x = v[0] * c1 + v[2] * s1, z = -v[0] * s1 + v[2] * c1; return [x, v[1] * c2 - z * s2, v[1] * s2 + z * c2]; };
    const O = rot(cen);
    const po = proj(O);
    const a = lerp(0.24, 0.5, g);
    ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    const names = ['x', 'y', 'z'];
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((e, i) => {
      const d = dir(e as V3), len = L * (i === 0 ? 1 : 0.85);
      const end = rot([cen[0] + d[0] * len, cen[1] + d[1] * len, cen[2] + d[2] * len]);
      const neg = rot([cen[0] - d[0] * len * 0.4, cen[1] - d[1] * len * 0.4, cen[2] - d[2] * len * 0.4]);
      const pe = proj(end), pn = proj(neg);
      ctx.strokeStyle = alpha(fg, a);
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(po.x, po.y); ctx.lineTo(pe.x, pe.y); ctx.stroke();
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(po.x, po.y); ctx.lineTo(pn.x, pn.y); ctx.stroke();
      ctx.setLineDash([]);
      // засечки
      const dx = pe.x - po.x, dy = pe.y - po.y, dl = Math.hypot(dx, dy) || 1;
      const nx = -dy / dl, ny = dx / dl;
      for (let q = 1; q < 5; q++) {
        const mx = po.x + (dx * q) / 5, my = po.y + (dy * q) / 5;
        ctx.beginPath(); ctx.moveTo(mx - nx * 4, my - ny * 4); ctx.lineTo(mx + nx * 4, my + ny * 4); ctx.stroke();
      }
      // стрелка и имя оси
      const ux = dx / dl, uy = dy / dl;
      ctx.beginPath();
      ctx.moveTo(pe.x + ux * 2, pe.y + uy * 2);
      ctx.lineTo(pe.x - ux * 9 + nx * 4.5, pe.y - uy * 9 + ny * 4.5);
      ctx.lineTo(pe.x - ux * 9 - nx * 4.5, pe.y - uy * 9 - ny * 4.5);
      ctx.closePath(); ctx.fillStyle = alpha(fg, a); ctx.fill();
      ctx.font = '500 13px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = alpha(fg, Math.min(1, a * 1.5));
      ctx.fillText(names[i], pe.x + ux * 14, pe.y + uy * 14);
    });
  }
  /** цель: кольцо, точка, волна и подпись-адрес */
  function aimMark() {
    const a = st.fin;
    if (a <= 0.01) return;
    const t = target();
    const r0 = Math.max(10, clamp(k * 0.026, 4.5, 13) * 1.9);
    ctx.setLineDash([]);
    const ph = calm ? 0.35 : frac(time / 2.4);
    ctx.strokeStyle = alpha(INK, a * (1 - ph) * 0.55); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, r0 * (1 + ph * 2.2), 0, 6.283); ctx.stroke();
    ctx.fillStyle = alpha(bg, a); ctx.strokeStyle = alpha(INK, a); ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(t.x, t.y, r0, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = alpha(INK, a);
    ctx.beginPath(); ctx.arc(t.x, t.y, r0 * 0.38, 0, 6.283); ctx.fill();
    // подпись: короткая выноска вправо вниз, где нет лент
    const lx = t.x + r0 * 0.75, ly = t.y + r0 * 0.75, ex = lx + r0 * 1.5, ey = ly + r0 * 1.5;
    ctx.strokeStyle = alpha(INK, a); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(ex, ey); ctx.lineTo(ex + 10, ey); ctx.stroke();
    ctx.font = `600 ${Math.round(clamp(k * 0.034, 12, 16))}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = alpha(INK, a);
    ctx.fillText(nick, ex + 15, ey);
  }
  /** бусины бегут по лентам к цели; подписи у начала лент */
  function beads(c: number, a: number) {
    const P = scr[c], n = N[c];
    const r = Math.max(3.2, clamp(k * 0.026, 4.5, 13) * 0.5);
    for (let j = 0; j < 3; j++) {
      const s = calm ? (j + 0.5) / 3 : frac(time / 3.6 + j / 3 + c * 0.21);
      const { idx, f } = at(c, s);
      const i2 = Math.min(n - 1, idx + 1);
      const x = lerp(P.x[idx], P.x[i2], f), y = lerp(P.y[idx], P.y[i2], f);
      const fade = clamp(s / 0.08, 0, 1) * clamp((1 - s) / 0.12, 0, 1);
      ctx.fillStyle = alpha('#FFFFFF', a * fade); ctx.strokeStyle = alpha(INK, a * fade); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, r * P.s[idx], 0, 6.283); ctx.fill(); ctx.stroke();
    }
    const t = target();
    const dx = P.x[0] - t.x, dy = P.y[0] - t.y, dl = Math.hypot(dx, dy) || 1;
    ctx.font = `500 ${Math.round(clamp(k * 0.03, 11, 14))}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    // подпись у начала ленты, целиком внутри блока
    const word = words[c] || '', tw = ctx.measureText(word).width;
    const al = dx < -dl * 0.3 ? 1 : dx > dl * 0.3 ? 0 : 0.5; // доля ширины слева от точки
    const lx = clamp(P.x[0] + (dx / dl) * 16 - tw * al, 8, W - 8 - tw), ly = clamp(P.y[0] + (dy / dl) * 16, 12, H - 12);
    ctx.textAlign = 'left';
    ctx.fillStyle = alpha(fg, a * 0.85);
    ctx.fillText(word, lx, ly);
  }

  let dirty = true;
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    axes();
    PATHS.forEach((_, c) => {
      const cv = curves[c];
      if (cv.drawn <= 0.001) return;
      const full = cv.drawn >= 0.999;
      if (cv.vis < 1 && full) ghost(c, 1 - cv.vis);
      if (cv.vis > 0.01) {
        const head = tube(c, 0, cv.drawn, cv.vis);
        // стрелка на конце ленты в финале
        if (head && full && st.fin > 0.01) {
          const P = scr[c], n = N[c];
          const w = clamp(k * 0.026, 4.5, 13) * P.s[n - 1];
          arrow(P.x[n - 1], P.y[n - 1], P.x[n - 1] - P.x[n - 4], P.y[n - 1] - P.y[n - 4], w, palettes[c].line, st.fin * cv.vis);
        }
      }
    });
    // полосы скорости за летящими вопросами
    if (!calm) PATHS.forEach((_, c) => {
      const uu = fly[c].v, ln = prev[c].lean;
      if (!(uu > 0 && uu < 1) || ln < 0.12) return;
      const s = sOf(c, uu), total = lens[c][N[c] - 1];
      const P = scr[c];
      const h = (qTall[c] * k) / 2;
      ctx.strokeStyle = alpha(palettes[c].line, 0.6 * ln); ctx.lineWidth = 1.5;
      [-0.7, -0.25, 0.2, 0.6].forEach((o, i) => {
        const a1 = at(c, s - (qHalf[c] * 1.05) / total), x1 = lerp(P.x[a1.idx], P.x[Math.min(N[c] - 1, a1.idx + 1)], a1.f), y1 = lerp(P.y[a1.idx], P.y[Math.min(N[c] - 1, a1.idx + 1)], a1.f);
        const a2 = at(c, s - (qHalf[c] * 1.05 + 0.25 + i * 0.07) / total), x2 = lerp(P.x[a2.idx], P.x[Math.min(N[c] - 1, a2.idx + 1)], a2.f), y2 = lerp(P.y[a2.idx], P.y[Math.min(N[c] - 1, a2.idx + 1)], a2.f);
        const dx = x1 - x2, dy = y1 - y2, dl = Math.hypot(dx, dy) || 1;
        const nx = -dy / dl, ny = dx / dl;
        ctx.beginPath(); ctx.moveTo(x1 + nx * o * h, y1 + ny * o * h); ctx.lineTo(x2 + nx * o * h, y2 + ny * o * h); ctx.stroke();
      });
    });
    if (st.fin > 0.01) PATHS.forEach((_, c) => { if (curves[c].drawn >= 0.999) beads(c, st.fin * curves[c].vis); });
    aimMark();
    dirty = false;
  }

  /* ---------- цикл ---------- */
  let running = false, last = 0, odd = false;
  const tick = () => {
    const now = performance.now() / 1000;
    const dt = last ? Math.min(0.05, now - last) : 0.016;
    last = now;
    // покачивание и наклон за мышью сглаживаются
    view.yaw = lerp(view.yaw, view.ty + (calm ? 0 : Math.sin(now * 0.31) * 0.035), 0.06);
    view.pitch = lerp(view.pitch, view.tp + (calm ? 0 : Math.sin(now * 0.23) * 0.02), 0.06);
    cy = Math.cos(view.yaw); sy = Math.sin(view.yaw); cp = Math.cos(view.pitch); sp = Math.sin(view.pitch);
    const flying = fly.some((f) => f.v > 0 && f.v < 1) || st.dop > 0.01;
    const busy = flying || bits.length > 0 || gsap.isTweening(st) || curves.some((c) => gsap.isTweening(c)) || st.tangle > 0;
    // в покое (финал) кадр через раз: бусины и волна цели плавные и на 30 кадрах
    odd = !odd;
    if (!busy && !dirty && odd) return;
    time += busy ? dt : dt * 2;
    build();
    fliers(dt);
    draw();
    drawBits(busy ? dt : dt * 2);
  };

  function anchor(c = 0) { const p = proj(rot([A[c][0] * ax, A[c][1] * ay, 0])); return { x: p.x, y: p.y }; }
  function target() { const p = proj(rot([T[0] * ax, T[1] * ay, 0])); return { x: p.x, y: p.y }; }

  return {
    st, curves, fly,
    layout,
    start() { if (running) return; running = true; last = 0; dirty = true; gsap.ticker.add(tick); },
    stop() { if (!running) return; running = false; gsap.ticker.remove(tick); },
    tone(p) { fg = p.fg; bg = p.bg; dirty = true; },
    burst,
    anchor, target,
    pointer(x, y, on) { if (calm) return; view.ty = on ? x * 0.09 : 0; view.tp = on ? -y * 0.06 : 0; },
    poke() {
      burst('target');
      PATHS.forEach((_, c) => gsap.fromTo(curves[c], { vis: 0.35 }, { vis: 1, duration: 0.7, delay: c * 0.07, ease: 'power2.out' }));
    },
    draw() { build(); fliers(0); draw(); },
  };
}
