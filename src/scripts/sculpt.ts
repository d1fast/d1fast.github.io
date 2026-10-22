import * as THREE from 'three';

/**
 * Скульптура из знаков кода. Несколько тысяч символов ({ } < / > ; 0 1 …) в объёме складываются в предмет
 * и покачиваются: окно сайта, панель сервиса с графиком, телефон, бумажный самолётик, узел 3D, колесо призов.
 * Каждые несколько секунд знаки срываются вихрем и перетекают в следующий предмет. Курсор расталкивает
 * знаки, тап пускает по ним волну.
 *
 * Всё движение считает видеокарта: у каждой точки есть «откуда» и «куда», шейдер смешивает их со своим
 * запаздыванием и завихрением. Процессор только подменяет массив «куда» при смене предмета.
 */

const GLYPHS = '{}<>/=+*#01;()[]&%$@~^:|'.split('');
const COLS = 6;
const CELL = 64;

type V3 = [number, number, number];
/** часть предмета: вес (доля точек), генератор точки и доля «горячих» (акцентных) точек */
type Part = { w: number; at: (r: () => number) => V3; hot?: number };

const VERT = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec2 aHot;  // горячая точка в прошлом и в следующем предмете
attribute vec4 aRnd;  // x: запаздывание, y: знак, z: размер и фаза, w: вторая фаза
uniform float uT;
uniform float uSwirl;
uniform float uTime;
uniform float uSize;
uniform float uPR;
uniform float uCamZ;
uniform float uCount;
uniform vec3 uPointer;
uniform float uPointerOn;
uniform vec4 uPulse; // xyz: центр волны, w: время с начала
uniform float uScan; // высота полосы «сборки», которая пробегает по предмету снизу вверх
varying float vGlyph;
varying float vAlpha;
varying float vHot;
varying float vScan;
float ease(float x) { return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
void main() {
  // у каждой точки своё запаздывание: предмет перетекает волной, а не прыгает целиком
  float k = clamp((uT - aRnd.x * 0.42) / 0.58, 0.0, 1.0);
  float e = ease(k);
  float fly = sin(k * 3.14159);
  vec3 p = mix(aFrom, aTo, e);
  float scan = exp(-pow((p.y - uScan) * 7.0, 2.0)) * (1.0 - fly);
  vScan = scan;
  // вихрь на лету: точки закручиваются вокруг вертикальной оси и возвращаются
  p = rotY(p, fly * uSwirl * (0.55 + aRnd.z * 0.9));
  float ph = aRnd.w * 6.2831;
  // и разлетаются оболочкой, а не сбиваются в ком посередине
  float th = aRnd.z * 6.2831 + aRnd.x * 2.0, cp = aRnd.w * 2.0 - 1.0, sp = sqrt(1.0 - cp * cp);
  p += vec3(sp * cos(th), cp * 0.75, sp * sin(th) * 0.6) * fly * 0.85;
  vec3 n = vec3(sin(p.y * 2.3 + uTime * 0.9 + ph), sin(p.z * 1.9 + uTime * 1.1 + ph * 1.3), sin(p.x * 2.1 + uTime * 0.8 + ph * 0.7));
  p += n * (fly * 0.5 + 0.012);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  // курсор расталкивает знаки
  vec2 d = wp.xy - uPointer.xy;
  wp.xy += normalize(d + 1e-4) * uPointerOn * smoothstep(0.9, 0.0, length(d)) * 0.36;
  // волна от тапа
  if (uPulse.w >= 0.0) {
    vec3 q = wp.xyz - uPulse.xyz;
    float r = length(q);
    float ring = exp(-pow((r - uPulse.w * 3.4) * 2.6, 2.0)) * exp(-uPulse.w * 1.4);
    wp.xyz += normalize(q + 1e-4) * ring * 0.5;
  }
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float depth = -mv.z;
  gl_PointSize = uSize * uPR * (0.7 + aRnd.z * 0.6) * (uCamZ / depth);
  // часть знаков меняется на лету, как бегущий код
  float g = aRnd.y;
  if (aRnd.w > 0.84 || scan > 0.35) g = mod(g + floor(uTime * (0.8 + aRnd.z * 2.2 + scan * 9.0)), uCount);
  vGlyph = g;
  vHot = mix(aHot.x, aHot.y, e);
  // дальние знаки тусклее, ближние ярче: объём читается и без света
  float tw = 0.86 + 0.14 * sin(uTime * 2.1 + ph * 3.0);
  vAlpha = clamp(0.82 - (depth - uCamZ) * 0.34, 0.22, 1.0) * tw;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uFade;
varying float vGlyph;
varying float vAlpha;
varying float vHot;
varying float vScan;
void main() {
  vec2 cell = vec2(mod(vGlyph, uGrid.x), floor(vGlyph / uGrid.x));
  float a = texture2D(uAtlas, (cell + gl_PointCoord) / uGrid).a * vAlpha * uFade;
  if (a < 0.03) discard;
  a = min(1.0, a * (1.0 + vHot * 0.35 + vScan * 0.9));
  gl_FragColor = vec4(mix(uColor, uHot, max(vHot, vScan * 0.55)) * a, a);
}`;

function atlas(font: string) {
  const rows = Math.ceil(GLYPHS.length / COLS);
  const c = document.createElement('canvas');
  c.width = COLS * CELL; c.height = rows * CELL;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${CELL * 0.74}px ${font}`;
  GLYPHS.forEach((ch, i) => g.fillText(ch, (i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL * 0.54));
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return { tex, rows };
}

/* ---------- предметы: части с весами, точки берутся пропорционально весу ---------- */
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const line = (a: V3, b: V3, w = 1, hot = 0): Part => ({ w, hot, at: (r) => lerp(a, b, r()) });
/** контур скруглённого прямоугольника в плоскости z */
function rrect(cx: number, cy: number, w: number, h: number, rad: number, z: number, wt: number, hot = 0): Part {
  const sx = w - 2 * rad, sy = h - 2 * rad, arc = (Math.PI / 2) * rad, per = 2 * sx + 2 * sy + 4 * arc;
  const seg: [number, (u: number) => [number, number]][] = [
    [sx, (u) => [cx - sx / 2 + u, cy + h / 2]], [arc, (u) => { const a = Math.PI / 2 - u / rad; return [cx + sx / 2 + Math.cos(a) * rad, cy + sy / 2 + Math.sin(a) * rad]; }],
    [sy, (u) => [cx + w / 2, cy + sy / 2 - u]], [arc, (u) => { const a = -u / rad; return [cx + sx / 2 + Math.cos(a) * rad, cy - sy / 2 + Math.sin(a) * rad]; }],
    [sx, (u) => [cx + sx / 2 - u, cy - h / 2]], [arc, (u) => { const a = -Math.PI / 2 - u / rad; return [cx - sx / 2 + Math.cos(a) * rad, cy - sy / 2 + Math.sin(a) * rad]; }],
    [sy, (u) => [cx - w / 2, cy - sy / 2 + u]], [arc, (u) => { const a = Math.PI - u / rad; return [cx - sx / 2 + Math.cos(a) * rad, cy + sy / 2 + Math.sin(a) * rad]; }],
  ];
  return { w: wt, hot, at: (r) => {
    let s = r() * per;
    for (const [len, f] of seg) { if (s <= len) { const [x, y] = f(s); return [x, y, z]; } s -= len; }
    return [cx, cy, z];
  } };
}
const fill = (x0: number, y0: number, w: number, h: number, z: number, wt: number, hot = 0): Part => ({ w: wt, hot, at: (r) => [x0 + r() * w, y0 + r() * h, z] });
const ring = (cx: number, cy: number, rad: number, z: number, wt: number, hot = 0): Part => ({ w: wt, hot, at: (r) => { const a = r() * Math.PI * 2; return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, z]; } });
const disc = (cx: number, cy: number, rad: number, z: number, wt: number, hot = 0): Part => ({ w: wt, hot, at: (r) => { const a = r() * Math.PI * 2, q = Math.sqrt(r()) * rad; return [cx + Math.cos(a) * q, cy + Math.sin(a) * q, z]; } });
function tri(a: V3, b: V3, c: V3, wt: number, hot = 0): Part {
  return { w: wt, hot, at: (r) => { let u = r(), v = r(); if (u + v > 1) { u = 1 - u; v = 1 - v; } return [a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v]; } };
}
/** брусок: рёбра чётче граней, так объём читается и в профиль */
function box(x: number, y: number, z: number, w: number, h: number, d: number, wt: number, hot = 0): Part[] {
  const X = [x - w / 2, x + w / 2], Y = [y, y + h], Z = [z - d / 2, z + d / 2];
  const edges: Part[] = [];
  for (const a of X) for (const b of Z) edges.push(line([a, Y[0], b], [a, Y[1], b], h, hot));
  for (const a of Y) for (const b of Z) edges.push(line([X[0], a, b], [X[1], a, b], w, hot));
  for (const a of X) for (const b of Y) edges.push(line([a, b, Z[0]], [a, b, Z[1]], d, hot));
  const el = 4 * (w + h + d);
  edges.forEach((e) => (e.w = (e.w / el) * wt * 0.62));
  const face: Part = { w: wt * 0.38, hot, at: (r) => {
    const f = Math.floor(r() * 3), u = r(), v = r(), s = r() < 0.5 ? 0 : 1;
    if (f === 0) return [X[0] + u * w, Y[0] + v * h, Z[s]];
    if (f === 1) return [X[s], Y[0] + v * h, Z[0] + u * d];
    return [X[0] + u * w, Y[s], Z[0] + v * d];
  } };
  return [...edges, face];
}

function browser(): Part[] {
  const W = 3.1, H = 2.05, T = 0.09, top = H / 2 - 0.3, z = T * 0.6;
  return [
    rrect(0, 0, W, H, 0.12, T, 5), rrect(0, 0, W, H, 0.12, -T, 2),
    line([-W / 2, top, T], [W / 2, top, T], 1.2),
    ring(-W / 2 + 0.2, H / 2 - 0.15, 0.045, T, 0.25), ring(-W / 2 + 0.36, H / 2 - 0.15, 0.045, T, 0.25), ring(-W / 2 + 0.52, H / 2 - 0.15, 0.045, T, 0.25),
    rrect(0.55, H / 2 - 0.15, 1.5, 0.13, 0.06, T, 0.6),
    // первый экран страницы: заголовок, подзаголовок, кнопка и картинка с горами
    fill(-1.35, 0.18, 1.25, 0.2, z, 1.4), fill(-1.35, -0.12, 1.0, 0.07, z, 0.6), fill(-1.35, -0.26, 0.85, 0.07, z, 0.5),
    fill(-1.33, -0.71, 0.7, 0.22, z, 0.9, 1),
    rrect(0.75, -0.05, 1.15, 0.95, 0.05, z, 1.5),
    line([0.2, -0.45, z], [0.55, -0.05, z], 0.5), line([0.55, -0.05, z], [0.8, -0.3, z], 0.4), line([0.8, -0.3, z], [1.05, 0.12, z], 0.45), line([1.05, 0.12, z], [1.32, -0.45, z], 0.5),
    disc(1.05, 0.27, 0.07, z, 0.25, 1),
  ];
}
function dashboard(): Part[] {
  // панель сервиса: столбики на полу, над ними линия тренда, сзади подложка с делениями
  const H = [0.55, 0.95, 0.75, 1.35, 1.1, 1.75], base = -0.95, parts: Part[] = [];
  H.forEach((h, i) => parts.push(...box(-1.25 + i * 0.5, base, 0, 0.3, h, 0.3, 1.2 + h)));
  const tops: V3[] = H.map((h, i) => [-1.25 + i * 0.5, base + h + 0.28, 0]);
  for (let i = 0; i < tops.length - 1; i++) parts.push(line(tops[i], tops[i + 1], 0.55, 1));
  tops.forEach((p) => parts.push(disc(p[0], p[1], 0.06, 0, 0.12, 1)));
  parts.push(
    line([-1.6, base, 0.35], [1.6, base, 0.35], 0.7), line([-1.6, base, -0.35], [1.6, base, -0.35], 0.7),
    line([-1.6, base, -0.35], [-1.6, base, 0.35], 0.15), line([1.6, base, -0.35], [1.6, base, 0.35], 0.15),
    line([-1.6, base, -0.35], [-1.6, 1.15, -0.35], 0.6),
    ...[0.2, 0.75, 1.3].map((y) => line([-1.6, base + y, -0.35], [1.6, base + y, -0.35], 0.35)),
  );
  return parts;
}
function phone(): Part[] {
  const W = 1.3, H = 2.6, T = 0.1, z = T * 0.7;
  return [
    rrect(0, 0, W, H, 0.2, T, 5), rrect(0, 0, W, H, 0.2, -T, 2.2), rrect(0, 0, W - 0.14, H - 0.14, 0.15, T, 1.5),
    rrect(0, H / 2 - 0.2, 0.36, 0.08, 0.04, T, 0.4),
    // переписка на экране: пузыри слева и справа, поле ввода, полоска «домой»
    rrect(-0.18, 0.7, 0.75, 0.24, 0.1, z, 1), rrect(0.2, 0.32, 0.72, 0.24, 0.1, z, 1), fill(-0.06, 0.25, 0.42, 0.08, z, 0.35),
    rrect(-0.15, -0.1, 0.8, 0.34, 0.1, z, 1.1), rrect(0.15, -0.55, 0.68, 0.24, 0.1, z, 0.9),
    rrect(0, -0.98, 1.0, 0.18, 0.09, z, 0.8), disc(0.4, -0.98, 0.06, z, 0.15, 1),
    line([-0.2, -H / 2 + 0.12, T], [0.2, -H / 2 + 0.12, T], 0.25),
    // уведомление в углу
    disc(W / 2 - 0.06, H / 2 - 0.06, 0.13, T + 0.03, 0.5, 1),
    // боковая грань: видна, когда телефон поворачивается
    { w: 1.2, at: (r) => { const p = rrect(0, 0, W, H, 0.2, 0, 1).at(r); return [p[0], p[1], (r() * 2 - 1) * T]; } },
  ];
}
function plane(): Part[] {
  const N: V3 = [1.6, 0.35, 0], L: V3 = [-1.25, 0.6, 1.05], R: V3 = [-1.25, 0.6, -1.05], C: V3 = [-1.25, 0.45, 0], K: V3 = [-1.05, -0.35, 0];
  return [
    tri(N, L, C, 2.6), tri(N, R, C, 2.6), tri(N, C, K, 1.5),
    line(N, L, 1.4), line(N, R, 1.4), line(N, K, 1.1), line(L, C, 0.5), line(R, C, 0.5), line(C, K, 0.4),
    // след за самолётиком
    { w: 1, hot: 1, at: (r) => { const t = r(); return [-1.35 - t * 0.55 + Math.cos(t * 7) * 0.2 * t, -0.15 - t * 1.0, Math.sin(t * 7) * 0.35 * t]; } },
  ];
}
function knot(): Part[] {
  const p = 2, q = 3, R = 0.95, rr = 0.42, tube = 0.26;
  const at = (t: number): V3 => { const r = R + rr * Math.cos(q * t); return [r * Math.cos(p * t), r * Math.sin(p * t), rr * Math.sin(q * t)]; };
  const surf = (t: number, a: number): V3 => {
    const c = at(t), n = at(t + 0.001);
    const tg: V3 = [n[0] - c[0], n[1] - c[1], n[2] - c[2]];
    const tl = Math.hypot(...tg); tg[0] /= tl; tg[1] /= tl; tg[2] /= tl;
    // нормаль к трубке: от оси тора, без касательной составляющей; бинормаль: их векторное произведение
    let nx = c[0], ny = c[1], nz = 0; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const d = nx * tg[0] + ny * tg[1] + nz * tg[2]; nx -= d * tg[0]; ny -= d * tg[1]; nz -= d * tg[2];
    const ml = Math.hypot(nx, ny, nz) || 1; nx /= ml; ny /= ml; nz /= ml;
    const bx = tg[1] * nz - tg[2] * ny, by = tg[2] * nx - tg[0] * nz, bz = tg[0] * ny - tg[1] * nx;
    return [c[0] + tube * (Math.cos(a) * nx + Math.sin(a) * bx), c[1] + tube * (Math.cos(a) * ny + Math.sin(a) * by), c[2] + tube * (Math.cos(a) * nz + Math.sin(a) * bz)];
  };
  // трубка и по ней спираль из горячих знаков
  return [
    { w: 1, at: (r) => surf(r() * Math.PI * 2, r() * Math.PI * 2) },
    { w: 0.1, hot: 1, at: (r) => { const t = r() * Math.PI * 2; return surf(t, t * 14 + (r() - 0.5) * 0.35); } },
  ];
}
function wheel(): Part[] {
  const R = 1.45, T = 0.08, parts: Part[] = [ring(0, 0, R, T, 4), ring(0, 0, R, -T, 2), ring(0, 0, R * 0.9, T, 1.5), ring(0, 0, 0.18, T, 0.6), disc(0, 0, 0.1, T, 0.3)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    parts.push(line([Math.cos(a) * 0.18, Math.sin(a) * 0.18, T], [Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, T], 0.7));
    // через сектор приз: плотная горячая точка у обода
    if (i % 2 === 0) { const b = a + Math.PI / 8; parts.push(disc(Math.cos(b) * 0.92, Math.sin(b) * 0.92, 0.14, T, 0.5, 1)); }
  }
  // лампочки по ободу
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; parts.push(disc(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, 0.035, T, 0.08)); }
  // указатель сверху и подставка
  parts.push(tri([-0.17, R + 0.3, T], [0.17, R + 0.3, T], [0, R - 0.1, T], 0.6, 1));
  parts.push(line([0, -R, 0], [0, -R - 0.3, 0], 0.3), line([-0.5, -R - 0.3, 0], [0.5, -R - 0.3, 0], 0.5));
  return parts;
}
/** порядок совпадает с разделами «Что делаю» */
const SHAPES = [browser, dashboard, phone, plane, knot, wheel];
export const SHAPE_COUNT = SHAPES.length;

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** n точек предмета: части по весам, порядок перемешан, чтобы соседние знаки летели в разные места */
function sample(parts: Part[], n: number, seed: number) {
  const r = rng(seed), pos = new Float32Array(n * 3), hot = new Float32Array(n);
  const total = parts.reduce((s, p) => s + p.w, 0);
  let i = 0;
  parts.forEach((p, k) => {
    const cnt = k === parts.length - 1 ? n - i : Math.round((p.w / total) * n);
    for (let j = 0; j < cnt && i < n; j++, i++) {
      const v = p.at(r), jit = () => (r() + r() + r() - 1.5) * 0.034;
      pos.set([v[0] + jit(), v[1] + jit(), v[2] + jit()], i * 3);
      hot[i] = p.hot && r() < p.hot ? 1 : 0;
    }
  });
  for (let k = n - 1; k > 0; k--) {
    const m = Math.floor(r() * (k + 1));
    for (let c = 0; c < 3; c++) { const t = pos[k * 3 + c]; pos[k * 3 + c] = pos[m * 3 + c]; pos[m * 3 + c] = t; }
    const h = hot[k]; hot[k] = hot[m]; hot[m] = h;
  }
  return { pos, hot };
}

export interface SculptOpts { canvas: HTMLCanvasElement; color: string; hot: string; font: string; count: number; calm?: boolean }

export function createSculpt(o: SculptOpts) {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, alpha: true, antialias: false, powerPreference: 'high-performance', premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const FOV = 30, R = 1.85;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  const group = new THREE.Group();
  scene.add(group);

  const N = o.count;
  const shapes = SHAPES.map((f, i) => sample(f(), N, 17 + i * 31));
  const r = rng(5);
  // разлёт для появления: знаки в широком облаке по всему экрану
  const cloud = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const a = r() * Math.PI * 2, b = Math.acos(r() * 2 - 1), d = 2.6 + r() * 4.5; cloud.set([Math.sin(b) * Math.cos(a) * d * 1.5, Math.cos(b) * d * 0.75, Math.sin(b) * Math.sin(a) * d * 0.6], i * 3); }
  const rnd = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) rnd.set([r(), Math.floor(r() * GLYPHS.length), r(), r()], i * 4);

  const geo = new THREE.BufferGeometry();
  const from = new THREE.BufferAttribute(cloud.slice(), 3), to = new THREE.BufferAttribute(shapes[0].pos.slice(), 3);
  const hot = new THREE.BufferAttribute(new Float32Array(N * 2), 2);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aFrom', from);
  geo.setAttribute('aTo', to);
  geo.setAttribute('aHot', hot);
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);

  const { tex, rows } = atlas(o.font);
  const uni = {
    uT: { value: 0 }, uSwirl: { value: 2.4 }, uTime: { value: 0 }, uSize: { value: 10 }, uPR: { value: 1 }, uFade: { value: 1 }, uCamZ: { value: 8 }, uCount: { value: GLYPHS.length },
    uScan: { value: -9 }, uPointer: { value: new THREE.Vector3(99, 99, 0) }, uPointerOn: { value: 0 }, uPulse: { value: new THREE.Vector4(0, 0, 0, -1) },
    uAtlas: { value: tex }, uGrid: { value: new THREE.Vector2(COLS, rows) },
    // цвета как есть, без перевода в линейное пространство: шейдер пишет их прямо на экран
    uColor: { value: new THREE.Color().setStyle(o.color, THREE.LinearSRGBColorSpace) }, uHot: { value: new THREE.Color().setStyle(o.hot, THREE.LinearSRGBColorSpace) },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uni, transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending, premultipliedAlpha: true });
  group.add(new THREE.Points(geo, mat));

  let cur = 0, phase: 'intro' | 'hold' | 'morph' = 'intro', tPhase = 0, running = false, raf = 0, last = 0, time = 0;
  const HOLD = o.calm ? 5 : 3.2, MORPH = o.calm ? 1.6 : 2.2, INTRO = 2.6;
  let onShape: ((i: number, dur: number) => void) | null = null;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0, on: 0, ton: 0 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  let frameBox = { cx: 0, cy: 0, s: 0 };

  function setTarget(i: number, start: Float32Array, startHot: Float32Array | null) {
    (from.array as Float32Array).set(start); from.needsUpdate = true;
    (to.array as Float32Array).set(shapes[i].pos); to.needsUpdate = true;
    const h = hot.array as Float32Array, nh = shapes[i].hot;
    for (let k = 0; k < N; k++) { h[k * 2] = startHot ? startHot[k] : 0; h[k * 2 + 1] = nh[k]; }
    hot.needsUpdate = true;
  }
  function size() {
    const w = o.canvas.clientWidth, h = o.canvas.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    // предмет радиусом R помещается в квадрат со стороной s с центром в cx, cy (пиксели холста)
    const b = frameBox.s ? frameBox : { cx: w / 2, cy: h / 2, s: Math.min(w, h) * 0.7 };
    const s = Math.max(80, b.s), tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const z = (R * h) / (s * tan);
    camera.position.set(0, 0, z);
    camera.aspect = w / h;
    camera.setViewOffset(w, h, w / 2 - b.cx, h / 2 - b.cy, w, h);
    camera.updateProjectionMatrix();
    uni.uPR.value = pr;
    uni.uCamZ.value = z;
    // знак примерно 1/46 размера предмета: на телефоне мельче, но не меньше 7 пикселей
    uni.uSize.value = Math.max(7, Math.min(15, s / 46));
  }
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    time += dt; tPhase += dt;
    uni.uTime.value = time;
    if (phase === 'intro' || phase === 'morph') {
      const dur = phase === 'intro' ? INTRO : MORPH;
      uni.uT.value = Math.min(1, tPhase / dur);
      if (tPhase >= dur) { phase = 'hold'; tPhase = 0; uni.uT.value = 1; }
    } else if (tPhase < HOLD) {
      // через полсекунды после сборки по предмету снизу вверх проходит полоса
      const k = (tPhase - 0.5) / 1.7;
      uni.uScan.value = k > 0 && k < 1 && !o.calm ? -2.1 + k * 4.4 : -9;
    } else {
      uni.uScan.value = -9;
      const prev = cur;
      cur = (cur + 1) % shapes.length;
      setTarget(cur, shapes[prev].pos, shapes[prev].hot);
      phase = 'morph'; tPhase = 0; uni.uT.value = 0; uni.uSwirl.value = o.calm ? 0.4 : 1.7;
      onShape?.(cur, MORPH + HOLD);
    }
    // покачивание и наклон к курсору: плоские предметы читаются, объёмные показывают глубину
    tilt.x += (tilt.tx - tilt.x) * 0.05; tilt.y += (tilt.ty - tilt.y) * 0.05; tilt.on += (tilt.ton - tilt.on) * 0.08;
    const sway = o.calm ? 0.12 : 1;
    group.rotation.y = (Math.sin(time * 0.42) * 0.52 + Math.sin(time * 0.17) * 0.18) * sway + tilt.y;
    group.rotation.x = 0.1 + Math.sin(time * 0.31) * 0.09 * sway + tilt.x;
    uni.uPointerOn.value = tilt.on;
    const pu = uni.uPulse.value;
    if (pu.w >= 0) { pu.w += dt; if (pu.w > 2.6) pu.w = -1; }
    renderer.render(scene, camera);
  }

  return {
    /** место предмета на холсте: центр и сторона квадрата в пикселях */
    layout(cx: number, cy: number, s: number) { frameBox = { cx, cy, s }; size(); },
    resize: size,
    start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); raf = 0; },
    /** появление: знаки слетаются из облака в первый предмет */
    intro() {
      cur = 0; phase = 'intro'; tPhase = 0; uni.uT.value = 0; uni.uScan.value = -9; uni.uSwirl.value = o.calm ? 0.4 : 2.6;
      setTarget(0, cloud, null);
      onShape?.(0, INTRO + HOLD);
    },
    onShape(f: (i: number, dur: number) => void) { onShape = f; },
    /** курсор в пикселях холста; on: курсор над первым экраном */
    pointer(x: number, y: number, on: boolean) {
      const w = o.canvas.clientWidth || 1, h = o.canvas.clientHeight || 1;
      tilt.tx = on ? ((y - frameBox.cy) / h) * 0.5 : 0; tilt.ty = on ? ((x - frameBox.cx) / w) * 0.9 : 0; tilt.ton = on ? 1 : 0;
      ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane0, hit)) uni.uPointer.value.copy(hit);
    },
    pulse(x: number, y: number) {
      const w = o.canvas.clientWidth || 1, h = o.canvas.clientHeight || 1;
      ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane0, hit)) uni.uPulse.value.set(hit.x, hit.y, 0, 0);
    },
  };
}
export type Sculpt = ReturnType<typeof createSculpt>;
