import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, ShaderMaterial, PlaneGeometry, BufferGeometry, Float32BufferAttribute,
  Vector2, Vector3, FrontSide,
} from 'three';
import { gsap } from 'gsap';
import { Font, type FontData } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import typeface from './unbounded.json';

/**
 * Стекло первого экрана. Фразы набраны объёмными буквами Unbounded; посреди экрана светится тонкое кольцо,
 * по нему бежит искра и дорисовывает его, пока идёт рассказ. Кольцо держит взгляд: фразы прилетают к нему
 * с разных сторон, у кольца тормозят, стоят и быстро улетают дальше.
 * Форма фразы считается в вершинном шейдере, геометрия строится один раз: фраза тянется вслед за движением
 * (буквы позади ведущего края отстают, сами буквы вытягиваются, хвост чуть провисает) и выгибается
 * тем сильнее, чем быстрее летит; на месте она почти ровная и только слегка выпуклая.
 * Стекло своё, без отдельного прохода преломления: фон (графит, кольцо, искра) задан формулой, и буква
 * берёт его в точке, куда её грань отклоняет луч. Отражения из той же формулы студии. Поэтому стекло не рябит:
 * нет картинки в половинном размере, нет зерна, которое меняется каждый кадр, блики мягкие.
 * Координаты: 1 единица = 1 css-пиксель на плоскости z = 0, начало в центре кольца, y вверх, z к зрителю.
 */

export interface BeatState {
  /** середина фразы относительно центра кольца, px: x вправо, y вверх, z к зрителю */
  x: number; y: number; z: number;
  /** видимость 0…1 */
  on: number;
  /** буквы по очереди уходят вглубь: последняя дальше первой на столько px (въезд из глубины) */
  deep: number;
  /** поворот букв вокруг своей вертикали, рад: последние повёрнуты сильнее */
  twist: number;
  /** наклон фразы в плоскости экрана, рад */
  roll: number;
  /** сколько растяжения и изгиба от скорости: 1 обычно, 0 без них */
  flex: number;
  /** блик наискось по фразе: от -1,6 (ещё слева) до 1,6 (ушёл вправо) */
  sheen: number;
}
export interface RingState {
  /** нарисованная часть кольца: доля окружности от верха по часовой */
  draw: number;
  /** где искра, доля окружности; больше 1: следующий круг */
  head: number;
  /** яркость искры и хвоста за ней */
  spark: number;
  /** яркость нарисованной части */
  glow: number;
  /** волна от замыкания кольца 0…1 */
  pulse: number;
}
export interface Backdrop { light: number; fade: number }
export interface Glass {
  readonly beat: BeatState[];
  readonly ring: RingState;
  readonly bd: Backdrop;
  /** размер холста, px */
  readonly size: { w: number; h: number };
  /** раскладка: середина кольца и место заголовка (последняя фраза встаёт в него) */
  layout(final: { cx: number; cy: number; w: number; h: number }): void;
  /** полуширина и полувысота фразы k, px */
  half(k: number): { w: number; h: number };
  start(): void;
  stop(): void;
  /** указатель над первым экраном: x, y от -1 до 1 */
  pointer(x: number, y: number, on: boolean): void;
  /** рассказ закончился: искра сама обходит кольцо, на компьютере тянется к курсору */
  idle(on: boolean): void;
  /** один кадр сразу: прогрев шейдеров и геометрии, пока экран чёрный */
  warm(): void;
  dispose(): void;
}

interface Opts { canvas: HTMLCanvasElement; beats: string[][]; calm: boolean; coarse: boolean }
type Glyph = { ha: number; x_min: number; x_max: number };

const font = new Font(typeface as unknown as FontData);
const GLYPHS = typeface.glyphs as unknown as Record<string, Glyph>;
const EM = typeface.resolution;
const CAP = typeface.capHeight / EM;
const LH = 1.1; // межстрочный интервал в кеглях
const DEPTH = 0.3; // толщина букв в кеглях
const TRACK = -0.02; // трекинг, кегли: Unbounded широкий, чуть плотнее читается крупнее
const FILL = 1.4; // на узком экране строки фразы выравниваются по ширине самой длинной, но не крупнее в 1,4 раза
const adv = (ch: string) => (GLYPHS[ch]?.ha ?? 0) / EM + TRACK;
const widthEm = (s: string) => [...s].reduce((w, ch) => w + adv(ch), 0) - TRACK;

/* ---------- геометрия: знак строится один раз, фразы собираются из копий ---------- */
const glyphCache = new Map<string, BufferGeometry | null>();
function glyph(ch: string, q: { curve: number; bevel: number }): BufferGeometry | null {
  if (glyphCache.has(ch)) return glyphCache.get(ch)!;
  let g: BufferGeometry | null = null;
  if (ch.trim()) {
    const t = new TextGeometry(ch, {
      font, size: 1, depth: DEPTH, curveSegments: q.curve,
      bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelOffset: 0, bevelSegments: q.bevel,
    });
    t.deleteAttribute('uv');
    // гладкие фаски, острые рёбра между лицом буквы и боковиной без фаски не размываются
    g = toCreasedNormals(t, 0.75);
    t.dispose();
    // лицо буквы плоское: треугольники, которые целиком лежат в плоскости лица (и тыла), смотрят строго вперёд (назад)
    const P = g.getAttribute('position'), Nn = g.getAttribute('normal');
    let z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < P.count; i++) { const z = P.getZ(i); if (z < z0) z0 = z; if (z > z1) z1 = z; }
    for (let i = 0; i < P.count; i += 3) {
      const a = P.getZ(i), b = P.getZ(i + 1), c = P.getZ(i + 2);
      const side = Math.min(a, b, c) - z1 > -1e-4 ? 1 : Math.max(a, b, c) - z0 < 1e-4 ? -1 : 0;
      if (side) for (let j = 0; j < 3; j++) Nn.setXYZ(i + j, 0, 0, side);
    }
    g.translate(0, 0, -DEPTH / 2);
  }
  glyphCache.set(ch, g);
  return g;
}
/** Фраза: строки по центру, блок по центру между верхом прописных первой строки и базовой линией последней.
 *  У каждой вершины aG: порядок буквы во фразе (0…1) и середина её буквы, кегли. */
function phrase(lines: string[], q: { curve: number; bevel: number }, fill: boolean) {
  const ws = lines.map(widthEm);
  const widest = Math.max(...ws);
  const sc = ws.map((w) => (fill ? Math.min(FILL, widest / w) : 1));
  const base: number[] = [];
  let y = -CAP * sc[0];
  base.push(y);
  for (let i = 1; i < lines.length; i++) { y -= ((LH - CAP) * (sc[i - 1] + sc[i])) / 2 + CAP * sc[i]; base.push(y); }
  const lift = -y / 2;
  const total = lines.reduce((n, l) => n + [...l].filter((ch) => ch.trim()).length, 0);
  const parts: BufferGeometry[] = [];
  let idx = 0;
  lines.forEach((line, i) => {
    const s = sc[i];
    let x = (-ws[i] * s) / 2;
    for (const ch of line) {
      const g = glyph(ch, q);
      if (g) {
        const c = g.clone();
        c.scale(s, s, 1);
        c.translate(x, base[i] + lift, 0);
        const gl = GLYPHS[ch];
        const cx = x + (((gl?.x_min ?? 0) + (gl?.x_max ?? 0)) / 2 / EM) * s, cy = base[i] + lift + (CAP * s) / 2;
        const order = total > 1 ? idx / (total - 1) : 0.5;
        const a = new Float32Array(c.getAttribute('position').count * 3);
        for (let k = 0; k < a.length; k += 3) { a[k] = order; a[k + 1] = cx; a[k + 2] = cy; }
        c.setAttribute('aG', new Float32BufferAttribute(a, 3));
        parts.push(c);
        idx++;
      }
      x += adv(ch) * s;
    }
  });
  const geo = parts.length ? mergeGeometries(parts) : new BufferGeometry();
  parts.forEach((p) => p.dispose());
  return { geo, w: Math.max(...ws.map((w, i) => w * sc[i])), h: -y };
}

/* ---------- шейдеры ---------- */
// фон, общий для подложки и для стекла: стекло берёт его в точке, куда отклонился луч
const SCENE = /* glsl */ `
uniform vec2 uRes; uniform float uDpr; uniform vec3 uRing;
uniform float uLight; uniform float uFade; uniform float uDraw; uniform float uHead; uniform float uSpark; uniform float uGlow; uniform float uPulse;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// px: css-пиксели от левого верхнего угла; soft: 1 для взгляда сквозь стекло, линия кольца мягче
vec3 scene(vec2 px, float soft) {
  float H = uRes.y;
  // графит: к середине чуть светлее, по краям темнее
  vec2 cv = (px - 0.5 * uRes) / H;
  vec3 col = vec3(0.028 + 0.022 * exp(-dot(cv, cv) * 2.4) * uLight);
  vec2 d = px - uRing.xy;
  float r = length(d), R = uRing.z;
  // внутри кольца мягкий свет: стеклу есть что преломлять
  col += vec3(0.035) * exp(-(r * r) / (R * R) * 1.6) * uLight;
  float f = fract(atan(d.x, -d.y) / 6.2831853 + 1.0); // 0 сверху, по часовой
  float dr = r - R;
  // края нарисованной дуги и хвоста мягкие, и чем дальше от линии, тем мягче: ореол не режется клином
  float ea = (2.5 + abs(dr) * 0.9) / (6.2831853 * max(r, 1.0));
  float fs = f > 0.5 + 0.5 * uDraw ? f - 1.0 : f;
  float drawn = uDraw >= 0.999 ? 1.0 : smoothstep(-ea, ea, fs) * smoothstep(-ea, ea, uDraw - fs) * step(0.0004, uDraw);
  float hd = fract(uHead - f + 0.5) - 0.5; // > 0 позади искры, < 0 впереди
  float tail = hd >= 0.0 ? exp(-hd * 7.0) : exp(hd / ea);
  float w = 0.75 + soft * 2.2;
  float core = exp(-(dr * dr) / (w * w));
  float halo = exp(-abs(dr) / (R * (dr > 0.0 ? 0.11 : 0.05)));
  float lit = drawn * (uGlow * (0.75 + 0.25 * tail) + 1.3 * uSpark * tail);
  // бледный след всего кольца: глаз видит круг ещё до того, как он нарисован
  float ring = (core * 0.9 + halo * 0.3) * lit + (core * 0.06 + halo * 0.02);
  // искра: яркая точка, ореол и тонкий горизонтальный луч, как блик в объективе
  float ha = uHead * 6.2831853;
  vec2 ds = px - (uRing.xy + R * vec2(sin(ha), -cos(ha)));
  float sd = length(ds);
  float spark = uSpark * (exp(-(sd * sd) / (R * R * 0.0007 + 3.0)) * 1.4 + exp(-sd / (R * 0.075)) * 0.45
    + exp(-abs(ds.y) / (1.3 + soft) - abs(ds.x) / (R * 0.85)) * 0.3);
  // волна от замыкания кольца
  float pr = R * (1.0 + 0.85 * uPulse), pw = 2.0 + 34.0 * uPulse;
  float pulse = step(0.001, uPulse) * (1.0 - uPulse) * (1.0 - uPulse) * exp(-((r - pr) * (r - pr)) / (pw * pw));
  col += vec3(ring + spark + pulse * 0.7) * uLight;
  // виньетка
  vec2 v = (px / uRes - 0.5) * 2.0;
  col *= 1.0 - 0.32 * smoothstep(0.7, 1.7, length(v * vec2(0.85, 1.0)));
  // неподвижный шум в долю ступени яркости: убирает полосы в тёмных переходах и не мерцает
  col += (hash12(floor(px * uDpr)) - 0.5) / 255.0;
  // пока фон не проявился, он того же цвета, что страница (#070707)
  return mix(vec3(0.027), col, uFade);
}`;

const BG_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BG_FRAG = /* glsl */ `${SCENE}
varying vec2 vUv;
void main() { gl_FragColor = vec4(scene(vec2(vUv.x, 1.0 - vUv.y) * uRes, 0.0), 1.0); }`;

const GL_VERT = /* glsl */ `
attribute vec3 aG;
uniform float uSize; uniform vec3 uPos; uniform vec2 uDir; uniform float uK; uniform float uExt; uniform vec2 uWhip;
uniform vec2 uBend; uniform vec2 uBC; uniform float uArch; uniform float uDeep; uniform float uTwist; uniform float uRoll;
uniform vec2 uBlock;
varying vec3 vW; varying vec3 vN; varying vec2 vB; varying vec2 vL;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
void main() {
  vec3 n = normal;
  // место точки во фразе: -1…1 по ширине и высоте блока строк (для перелива и блика)
  vB = position.xy / uBlock;
  vec2 c = aG.yz * uSize;
  vec3 d = position * uSize - vec3(c, 0.0);
  // точка относительно середины своей буквы, px: буква работает как линза
  vL = d.xy;
  // буква поворачивается вокруг своей вертикали
  float tw = uTwist * (0.35 + 0.65 * aG.x);
  d = rotY(d, tw); n = rotY(n, tw);
  // растяжение по движению: ведущий край на месте, буквы позади отстают, сама буква вытягивается
  float behind = max(0.0, uExt - dot(c, uDir));
  float t = behind / max(1.0, 2.0 * uExt);
  vec2 cc = c - uDir * behind * uK + uWhip * t * t;
  float kS = sqrt(max(0.2, 1.0 + uK)) - 1.0;
  d.xy += uDir * dot(d.xy, uDir) * kS;
  n.xy -= uDir * dot(n.xy, uDir) * (kS / (1.0 + kS));
  vec3 q = vec3(cc, -uDeep * aG.x) + d;
  // дуга в плоскости экрана: концы строк отстают при движении вверх или вниз
  float ax = q.x;
  q.y -= uArch * ax * ax;
  n = vec3(n.x + 2.0 * uArch * ax * n.y, n.y, n.z);
  float cr = cos(uRoll), sr = sin(uRoll);
  q.xy = vec2(cr * q.x - sr * q.y, sr * q.x + cr * q.y);
  n.xy = vec2(cr * n.x - sr * n.y, sr * n.x + cr * n.y);
  // изгиб вокруг вертикали и горизонтали через середину растянутой фразы (uBC): выпуклый, края уходят вглубь
  if (abs(uBend.x) > 1e-7) {
    float R = 1.0 / uBend.x, a = (q.x - uBC.x) * uBend.x, rr = R + q.z;
    q = vec3(uBC.x + rr * sin(a), q.y, rr * cos(a) - R);
    n = rotY(n, a);
  }
  if (abs(uBend.y) > 1e-7) {
    float R = 1.0 / uBend.y, b = (q.y - uBC.y) * uBend.y, rr = R + q.z;
    q = vec3(q.x, uBC.y + rr * sin(b), rr * cos(b) - R);
    n = rotX(n, -b);
  }
  vec4 w = modelMatrix * vec4(q + uPos, 1.0);
  vW = w.xyz;
  vN = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const GL_FRAG = /* glsl */ `${SCENE}
uniform float uOn; uniform vec2 uDev; uniform float uRefr; uniform float uSheen;
varying vec3 vW; varying vec3 vN; varying vec2 vB; varying vec2 vL;
// студия для отражений: тёмный пол, светлеющий свод, мягкие софтбоксы без резких краёв
float box(vec3 d, vec3 c, float s) { return 1.0 - smoothstep(s * 0.45, s, acos(clamp(dot(d, normalize(c)), -1.0, 1.0))); }
vec3 studio(vec3 d) {
  float v = mix(0.012, 0.11, smoothstep(-0.45, 0.85, d.y));
  v += box(d, vec3(-0.55, 0.75, 0.45), 0.55) * 1.7;
  v += box(d, vec3(0.95, 0.05, 0.25), 0.3) * 1.1;
  v += box(d, vec3(-0.9, -0.15, 0.2), 0.32) * 0.45;
  v += box(d, vec3(0.0, 0.1, 1.0), 0.75) * 0.22;
  return vec3(v);
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float NdV = dot(N, V);
  if (NdV < 0.0) { N = -N; NdV = -NdV; }
  vec2 px = vec2(gl_FragCoord.x, uDev.y - gl_FragCoord.y) / uDpr;
  // луч, отклонённый гранью: на лице буквы почти прямо, на фасках сильно
  vec3 T = refract(-V, N, 0.69);
  // толща буквы как у линзы: фон за ней виден чуть увеличенным к её середине
  vec2 off = (T.xy + V.xy) * uRefr - vL * 0.22;
  vec3 behind = scene(px + vec2(off.x, -off.y), 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  // тело стекла молочное: фон сквозь него виден приглушённым, само стекло светлое, буквы читаются и на чёрном;
  // сверху вниз мягкий перелив, как у стекла под софтбоксом
  float gy = clamp(vB.y, -1.0, 1.0) * 0.5 + 0.5;
  vec3 body = behind * 0.55 + vec3(0.3 + 0.26 * gy + 0.05 * N.y);
  vec3 col = mix(body, studio(reflect(-V, N)), clamp(0.12 + F * 1.6, 0.0, 1.0));
  vec3 Hh = normalize(normalize(vec3(-0.45, 0.75, 0.6)) + V);
  col += 0.65 * pow(max(dot(N, Hh), 0.0), 36.0);
  col += 0.32 * pow(1.0 - NdV, 3.0);
  // блик проходит по фразе наискось
  float sh = vB.x * 0.8 + vB.y * 0.35 - uSheen;
  col += vec3(0.42) * exp(-sh * sh * 28.0) * (0.55 + 0.45 * (1.0 - NdV));
  gl_FragColor = vec4(col, uOn);
}`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export async function createGlass(o: Opts): Promise<Glass> {
  const t0 = performance.now();
  const { canvas, beats, calm, coarse } = o;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x070707, 1);
  // своё стекло дешёвое: плотность пикселей как у экрана (до 2), на слабом железе снижается сама
  let dprCap = 2;
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 10, 20000);

  /* ---------- общие параметры фона ---------- */
  const U = {
    uRes: { value: new Vector2(1, 1) }, uDev: { value: new Vector2(1, 1) }, uDpr: { value: 1 },
    uRing: { value: new Vector3(0, 0, 100) }, uLight: { value: 0 }, uFade: { value: 0 },
    uDraw: { value: 0 }, uHead: { value: 0 }, uSpark: { value: 0 }, uGlow: { value: 0 }, uPulse: { value: 0 },
  };
  const bg = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: U, depthWrite: false, depthTest: false }));
  bg.frustumCulled = false;
  bg.renderOrder = -1;
  scene.add(bg);

  /* ---------- фразы ---------- */
  const q = coarse ? { curve: 6, bevel: 3 } : { curve: 8, bevel: 4 };
  const drum = new Group();
  scene.add(drum);
  const beat: BeatState[] = beats.map(() => ({ x: 0, y: 0, z: 0, on: 0, deep: 0, twist: 0, roll: 0, flex: 1, sheen: -3 }));
  type Uni = { uSize: { value: number }; uPos: { value: Vector3 }; uDir: { value: Vector2 }; uK: { value: number }; uExt: { value: number };
    uWhip: { value: Vector2 }; uBend: { value: Vector2 }; uBC: { value: Vector2 }; uArch: { value: number }; uDeep: { value: number }; uTwist: { value: number };
    uRoll: { value: number }; uOn: { value: number }; uRefr: { value: number }; uBlock: { value: Vector2 }; uSheen: { value: number } };
  type Geo = { geo: BufferGeometry; w: number; h: number };
  type Item = { mesh: Mesh; mat: ShaderMaterial; u: Uni; wide: string[]; narrow: string[]; geo: { wide?: Geo; narrow?: Geo }; hw: number; hh: number;
    // скорость и пружина растяжения
    m: { px: number; py: number; vx: number; vy: number; dx: number; dy: number; k: number; kv: number; init: boolean } };
  const items: Item[] = beats.map((lines) => {
    const u: Uni = {
      uSize: { value: 1 }, uPos: { value: new Vector3() }, uDir: { value: new Vector2(-1, 0) }, uK: { value: 0 }, uExt: { value: 1 },
      uWhip: { value: new Vector2() }, uBend: { value: new Vector2() }, uBC: { value: new Vector2() }, uArch: { value: 0 }, uDeep: { value: 0 }, uTwist: { value: 0 },
      uRoll: { value: 0 }, uOn: { value: 0 }, uRefr: { value: 30 }, uBlock: { value: new Vector2(1, 1) }, uSheen: { value: -3 },
    };
    const mat = new ShaderMaterial({ vertexShader: GL_VERT, fragmentShader: GL_FRAG, uniforms: { ...U, ...u }, transparent: true, side: FrontSide });
    const mesh = new Mesh(new BufferGeometry(), mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    drum.add(mesh);
    return {
      mesh, mat, u, wide: lines.map((l) => l.replace(/\|/g, ' ')), narrow: lines.flatMap((l) => l.split('|')), geo: {}, hw: 1, hh: 1,
      m: { px: 0, py: 0, vx: 0, vy: 0, dx: -1, dy: 0, k: 0, kv: 0, init: false },
    };
  });

  /* ---------- раскладка ---------- */
  let W = 1, H = 1, narrow = false;
  const size = { w: 1, h: 1 };
  const ring: RingState = { draw: 0, head: 0, spark: 0, glow: 0, pulse: 0 };
  const bd: Backdrop = { light: 0, fade: 0 };
  function useGeometry(it: Item): Geo {
    const key = narrow ? 'narrow' : 'wide';
    const g = (it.geo[key] ??= phrase(narrow ? it.narrow : it.wide, q, narrow));
    if (it.mesh.geometry !== g.geo) it.mesh.geometry = g.geo;
    return g;
  }
  function layout(fin: { cx: number; cy: number; w: number; h: number }) {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    size.w = W; size.h = H;
    // узкая раскладка (строки фразы переносятся и выравниваются по ширине): телефон стоя или узкое место заголовка
    // (телефон боком: кольцо с заголовком слева, строка и кнопки справа)
    const tall = W < H * 0.9;
    narrow = tall || fin.w < fin.h * 1.7;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(W, H, false);
    const dpr = renderer.getPixelRatio();
    U.uRes.value.set(W, H);
    U.uDpr.value = dpr;
    renderer.getDrawingBufferSize(U.uDev.value);
    // камера: на плоскости z = 0 одна единица равна css-пикселю, центр перспективы в центре кольца
    const f = H / 2 / Math.tan((camera.fov * Math.PI) / 360);
    camera.aspect = W / H;
    camera.position.set(0, 0, f);
    camera.lookAt(0, 0, 0);
    camera.near = Math.max(10, f * 0.05);
    camera.far = f + 8000;
    camera.setViewOffset(W, H, W / 2 - fin.cx, H / 2 - fin.cy, W, H);
    camera.updateProjectionMatrix();
    // кольцо: на телефоне почти во всю ширину места заголовка, на компьютере по его высоте (как у кольца без WebGL в CSS)
    const R = narrow ? Math.min(fin.w * 0.47, fin.h * 0.5) : Math.min(fin.h * 0.52, H * 0.3, W * 0.2);
    U.uRing.value.set(fin.cx, fin.cy, Math.max(40, R));
    items.forEach((it, k) => {
      const g = useGeometry(it);
      const last = k === items.length - 1;
      let maxW = W * (narrow ? 0.94 : 0.8), maxH = H * (tall ? 0.56 : narrow ? 0.7 : 0.5);
      const maxCap = H * (tall ? 0.1 : narrow ? 0.15 : 0.13);
      if (last) { maxW = Math.min(maxW, fin.w); maxH = Math.min(maxH, fin.h); }
      const em = Math.max(8, Math.min(maxW / g.w, maxH / g.h, maxCap / CAP));
      it.u.uSize.value = em;
      it.hw = (g.w * em) / 2; it.hh = (g.h * em) / 2;
      it.u.uBlock.value.set(g.w / 2, g.h / 2);
      // преломление сильнее у крупных букв
      it.u.uRefr.value = em * 0.55;
    });
  }

  /* ---------- кадр ---------- */
  let running = false, time = 0, last = 0, idling = false;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0, on: false };
  let slow = 0, frames = 0;
  const L = () => Math.max(W, H);
  const apply = (dt: number) => {
    // параллакс за мышью: фразы чуть поворачиваются, лёгкое покачивание в покое
    const e = 1 - Math.exp(-dt * 3.5);
    ptr.x += (ptr.tx - ptr.x) * e; ptr.y += (ptr.ty - ptr.y) * e;
    drum.rotation.y = ptr.x * 0.1 + (calm ? 0 : Math.sin(time * 0.31) * 0.014);
    drum.rotation.x = ptr.y * 0.07 + (calm ? 0 : Math.sin(time * 0.23) * 0.008);
    items.forEach((it, k) => {
      const b = beat[k], m = it.m, u = it.u;
      // скорость фразы по экрану, сглаженная
      if (m.init && dt > 0) {
        const a = 1 - Math.exp(-dt * 28);
        m.vx += ((b.x - m.px) / dt - m.vx) * a;
        m.vy += ((b.y - m.py) / dt - m.vy) * a;
      }
      m.px = b.x; m.py = b.y; m.init = true;
      const vis = b.on > 0.002;
      it.mesh.visible = vis;
      if (!vis) { m.k = 0; m.kv = 0; m.vx = 0; m.vy = 0; return; }
      const sp = Math.hypot(m.vx, m.vy);
      if (sp > 2) { m.dx = m.vx / sp; m.dy = m.vy / sp; }
      // растяжение от скорости (в экранах в секунду) через пружину: на торможении фраза чуть сжимается и выпрямляется
      const tgt = calm ? 0 : 1.45 * Math.pow(clamp01((sp / L() - 0.2) / 3.2), 0.7) * b.flex;
      m.kv += (240 * (tgt - m.k) - 19 * m.kv) * dt;
      m.k += m.kv * dt;
      const kk = Math.max(-0.18, Math.min(1.8, m.k));
      const hx = Math.abs(m.dx), vy = Math.abs(m.dy);
      u.uDir.value.set(m.dx, m.dy);
      u.uK.value = kk;
      u.uExt.value = hx * it.hw * 0.9 + vy * it.hh * 0.8;
      const pos = Math.max(0, kk);
      // хвост провисает, когда фраза летит вбок
      u.uWhip.value.set(0, -0.55 * it.hh * pos * hx);
      // изгиб: на месте фраза слегка выпуклая, на скорости гнётся сильно (до 0,9 рад у краёв растянутой фразы);
      // вертикальный полёт ещё и выгибает строки дугой: концы отстают
      const ext = u.uExt.value * kk;
      u.uBC.value.set(-m.dx * ext, -m.dy * ext);
      u.uBend.value.set((0.18 + 0.5 * pos * hx) / (it.hw + ext * hx), (0.45 * pos * vy) / (it.hh + ext * vy));
      u.uArch.value = (0.3 * pos * vy * Math.sign(m.dy || 1)) / it.hw;
      u.uPos.value.set(b.x, b.y, b.z);
      u.uDeep.value = b.deep;
      u.uTwist.value = b.twist;
      u.uRoll.value = b.roll;
      u.uOn.value = b.on;
      u.uSheen.value = b.sheen;
    });
    // искра сама обходит кольцо; на компьютере тянется к курсору
    if (idling && !calm) {
      if (ptr.on) {
        const c = U.uRing.value;
        const tgt = Math.atan2(((ptr.tx + 1) / 2) * W - c.x, c.y - ((ptr.ty + 1) / 2) * H) / (Math.PI * 2);
        let dh = tgt - (ring.head % 1);
        dh -= Math.round(dh);
        ring.head += dh * (1 - Math.exp(-dt * 2.2));
      } else ring.head += dt / 11;
    }
    U.uDraw.value = ring.draw;
    U.uHead.value = ring.head;
    U.uSpark.value = ring.spark;
    U.uGlow.value = ring.glow;
    U.uPulse.value = ring.pulse;
    U.uLight.value = bd.light;
    U.uFade.value = bd.fade;
  };
  const tick = () => {
    const now = performance.now();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    time += dt;
    // качество: если кадры долгие, плотность пикселей снижается (не ниже 1)
    if (frames < 300) {
      frames++;
      if (frames > 20 && dt > 0.028) slow++;
      if (slow > 16 && dprCap > 1) {
        dprCap = Math.max(1, dprCap - 0.5); slow = 0;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap)); renderer.setSize(W, H, false);
        U.uDpr.value = renderer.getPixelRatio(); renderer.getDrawingBufferSize(U.uDev.value);
      }
    }
    apply(dt);
    renderer.render(scene, camera);
  };
  // геометрия фраз строится по одной с паузами (главный поток не стоит), шейдеры компилируются параллельно
  const pause = () => new Promise((r) => setTimeout(r, 0));
  const portrait = canvas.clientWidth < canvas.clientHeight * 0.9;
  narrow = portrait;
  for (const it of items) { useGeometry(it); await pause(); }
  const t1 = performance.now();
  items.forEach((it) => { it.mesh.visible = true; });
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  items.forEach((it) => { it.mesh.visible = false; });
  if (import.meta.env.DEV) (window as unknown as { __glass: object }).__glass = { build: Math.round(t1 - t0), compile: Math.round(performance.now() - t1), beat, ring, bd };

  return {
    beat, ring, bd, size,
    layout,
    half: (k) => ({ w: items[k].hw, h: items[k].hh }),
    start() { if (running) return; running = true; last = 0; gsap.ticker.add(tick); },
    stop() { if (!running) return; running = false; gsap.ticker.remove(tick); },
    pointer(x, y, on) { if (calm) return; ptr.on = on; ptr.tx = on ? x : 0; ptr.ty = on ? y : 0; },
    idle(on) { idling = on; },
    warm() {
      // все фразы один раз видимы: шейдер и геометрия уходят в видеокарту до начала рассказа
      const keep = beat.map((b) => ({ ...b }));
      beat.forEach((b) => { b.on = 0.003; });
      apply(0);
      items.forEach((it) => { it.mesh.visible = true; });
      renderer.render(scene, camera);
      beat.forEach((b, k) => Object.assign(b, keep[k]));
      apply(0);
      renderer.render(scene, camera);
    },
    dispose() {
      gsap.ticker.remove(tick);
      items.forEach((it) => { it.mat.dispose(); it.geo.wide?.geo.dispose(); it.geo.narrow?.geo.dispose(); });
      bg.geometry.dispose(); (bg.material as ShaderMaterial).dispose();
      renderer.dispose();
    },
  };
}
