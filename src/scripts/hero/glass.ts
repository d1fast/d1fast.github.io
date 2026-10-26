import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshPhysicalMaterial, PMREMGenerator, ShaderMaterial, PlaneGeometry,
  TextureLoader, ACESFilmicToneMapping, SRGBColorSpace, NoColorSpace, DirectionalLight, BufferGeometry, FrontSide, BackSide, DoubleSide, Vector2, Vector4,
  SphereGeometry,
  type WebGLProgramParametersWithUniforms, type Texture,
} from 'three';
import { gsap } from 'gsap';
import { Font, type FontData } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import typeface from './unbounded.json';

/**
 * Стекло первого экрана. Фразы набраны объёмными буквами Unbounded и лежат на невидимом вертикальном цилиндре:
 * каждая строка изогнута по его поверхности (изгиб считает вершинный шейдер, поэтому геометрия строится один раз
 * и не перестраивается при смене размера окна). Фраза поворачивается вокруг оси цилиндра: въезжает справа из-за
 * его края, встаёт лицом к зрителю и уезжает влево; у краёв цилиндра буквы мягко гаснут.
 * Материал: физическое стекло (преломление, лак, отражения студии), только чёрное, белое и серое.
 * Позади букв фон-шейдер: глубокий графит, две мягкие полосы света (их видно сквозь стекло изогнутыми)
 * и фото, которое проявляется, как отпечаток в проявителе.
 * Координаты: ось цилиндра = мировая ось Y, камера на +Z смотрит на переднюю образующую.
 */

export interface BeatState {
  /** поворот фразы вокруг оси цилиндра, радианы: > 0 справа (въезжает), < 0 слева (уехала) */
  rot: number;
  /** подлёт к зрителю: доля радиуса, на которую фраза ближе поверхности цилиндра */
  push: number;
  /** общая видимость 0…1 */
  on: number;
}
export interface Backdrop { photo: number; light: number; fade: number }
export interface Glass {
  readonly beat: BeatState[];
  readonly bd: Backdrop;
  /** вертикальный центр текста в px от верха холста; фото стоит в своём месте */
  readonly view: { cy: number };
  /** раскладка: где стоит последняя фраза (место заголовка) и куда встаёт фото */
  layout(final: { cx: number; cy: number; w: number; h: number }): void;
  /** где по высоте стоит фраза k (доля высоты холста) */
  slotY(k: number): number;
  /** полуширина фразы k на цилиндре, радианы: на сколько её повернуть, чтобы она целиком ушла за край */
  span(k: number): number;
  start(): void;
  stop(): void;
  pointer(x: number, y: number, on: boolean): void;
  /** один кадр сразу: прогрев шейдеров и геометрии, пока экран чёрный */
  warm(): void;
  dispose(): void;
}

interface Opts { canvas: HTMLCanvasElement; beats: string[][]; photo: string; calm: boolean; coarse: boolean }

const font = new Font(typeface as unknown as FontData);
const EM = typeface.resolution;
const CAP = typeface.capHeight / EM;
const LH = 1.12; // межстрочный интервал в кеглях
const DEPTH = 0.26; // толщина букв в кеглях
const K = 1.55; // расстояние камеры до передней образующей, в радиусах цилиндра
const R = 10; // радиус цилиндра, мировые единицы
const EDGE = 1.2, SOFT = 0.62; // где буквы гаснут у края цилиндра: угол от передней образующей, радианы

/** ширина строки в кеглях по шагам знаков (так раскладывает TextGeometry) */
const widthEm = (s: string) => [...s].reduce((w, ch) => w + ((typeface.glyphs as Record<string, { ha: number }>)[ch]?.ha ?? 0) / EM, 0);

/* ---------- геометрия: знак строится один раз, строки собираются из копий ---------- */
const glyphCache = new Map<string, BufferGeometry | null>();
function glyph(ch: string, q: { curve: number; bevel: number }): BufferGeometry | null {
  if (glyphCache.has(ch)) return glyphCache.get(ch)!;
  let g: BufferGeometry | null = null;
  if (ch.trim()) {
    const t = new TextGeometry(ch, {
      font, size: 1, depth: DEPTH, curveSegments: q.curve,
      bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.028, bevelOffset: 0, bevelSegments: q.bevel,
    });
    t.deleteAttribute('uv');
    // гладкие фаски, острые рёбра между лицом буквы и боковиной без фаски не размываются
    g = toCreasedNormals(t, 0.75);
    t.dispose();
    // лицо буквы плоское: у треугольников, которые целиком лежат в плоскости лица (и тыла), нормаль строго
    // вперёд (назад). По положению, а не по нормали: у тонких треугольников-щепок нормаль неустойчива и давала полосы
    const P = g.getAttribute('position'), Nn = g.getAttribute('normal');
    let z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < P.count; i++) { const z = P.getZ(i); if (z < z0) z0 = z; if (z > z1) z1 = z; }
    for (let i = 0; i < P.count; i += 3) {
      const a = P.getZ(i), b = P.getZ(i + 1), c = P.getZ(i + 2);
      const side = Math.max(a, b, c) - z1 > -1e-4 && Math.min(a, b, c) - z1 > -1e-4 ? 1 : Math.min(a, b, c) - z0 < 1e-4 && Math.max(a, b, c) - z0 < 1e-4 ? -1 : 0;
      if (side) for (let j = 0; j < 3; j++) Nn.setXYZ(i + j, 0, 0, side);
    }
    g.translate(0, 0, -DEPTH / 2);
  }
  glyphCache.set(ch, g);
  return g;
}
/** фраза: строки по центру, блок по центру высоты прописных; x = длина дуги, y вверх, z от оси наружу */
function phrase(lines: string[], q: { curve: number; bevel: number }): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const n = lines.length;
  lines.forEach((line, i) => {
    const w = widthEm(line);
    let x = -w / 2;
    const y = ((n - 1) / 2 - i) * LH - CAP / 2;
    for (const ch of line) {
      const g = glyph(ch, q);
      if (g) { const c = g.clone(); c.translate(x, y, 0); parts.push(c); }
      x += ((typeface.glyphs as Record<string, { ha: number }>)[ch]?.ha ?? 0) / EM;
    }
  });
  const out = parts.length ? mergeGeometries(parts) : new BufferGeometry();
  parts.forEach((p) => p.dispose());
  return out;
}

/* ---------- шейдеры ---------- */
// изгиб по цилиндру и затухание у его краёв поверх физического материала three.js
function bend(shader: WebGLProgramParametersWithUniforms, u: { uSize: { value: number }; uR: { value: number }; uOn: { value: number } }) {
  Object.assign(shader.uniforms, u, { uEdge: { value: EDGE }, uSoft: { value: SOFT }, uRim: { value: 0.9 } });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uSize;\nuniform float uR;\nvarying vec3 vBendW;')
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float bPhi = position.x * uSize / uR;
      float bC = cos(bPhi), bS = sin(bPhi);
      objectNormal = vec3(objectNormal.x * bC + objectNormal.z * bS, objectNormal.y, -objectNormal.x * bS + objectNormal.z * bC);`)
    .replace('#include <begin_vertex>', `vec3 transformed = position * uSize;
      float bRad = uR + transformed.z;
      transformed = vec3(bRad * bS, transformed.y, bRad * bC);`)
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBendW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uEdge;\nuniform float uSoft;\nuniform float uOn;\nuniform float uRim;\nvarying vec3 vBendW;')
    .replace('#include <opaque_fragment>', `// кромка стекла светится под скользящим углом: буквы читаются на тёмном
      float bRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
      outgoingLight += vec3(uRim) * bRim;
      #include <opaque_fragment>
      gl_FragColor.a *= uOn * smoothstep(uEdge, uEdge - uSoft, abs(atan(vBendW.x, vBendW.z)));`);
}

const BG_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BG_FRAG = /* glsl */ `
uniform vec2 uRes; uniform float uTime; uniform sampler2D uPhoto; uniform float uHas; uniform float uDev; uniform vec4 uRect;
uniform float uLight; uniform float uFade; uniform float uBand; varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  vec2 c = (px - 0.5 * uRes) / uRes.y;
  float asp = uRes.x / uRes.y;
  // графит, за текстом мягкий свет студии (значения в яркостях экрана, в линейные переводятся в конце).
  // На экране стоя всё уже: полосы у краёв и тоньше, иначе светлый фон съедает буквы
  float por = step(asp, 0.9);
  float r = length(c * vec2(mix(0.75, 2.2, por), 1.0));
  vec3 col = vec3(0.027) + vec3(0.075) * exp(-r * r * 3.0) * uLight;
  // две вертикальные полосы света позади букв: сквозь стекло они видны изогнутыми
  float sx = mix(min(0.36 * asp, 0.62), 0.5 * asp - 0.035, por);
  float w1 = mix(0.05, 0.02, por), w2 = mix(0.075, 0.026, por), si = mix(1.0, 0.6, por);
  float s1 = exp(-pow((c.x + sx + 0.035 * sin(uTime * 0.23) * (1.0 - por)) / w1, 2.0)) * smoothstep(0.62, 0.05, abs(c.y + 0.02));
  float s2 = exp(-pow((c.x - sx * mix(0.9, 1.0, por) + 0.04 * sin(uTime * 0.19 + 1.7) * (1.0 - por)) / w2, 2.0)) * smoothstep(0.66, 0.0, abs(c.y - 0.03));
  col += (vec3(0.30) * s1 + vec3(0.2) * s2) * uLight * si;
  // мягкая светлая полоса за строками: сквозь стекло она видна преломлённой, буквы читаются
  float by = (px.y - uBand) / uRes.y;
  col += vec3(mix(0.2, 0.12, por)) * exp(-by * by * 30.0) * smoothstep(0.95 * asp, 0.1, abs(c.x)) * uLight;
  // фото проявляется, как отпечаток: сначала светлые места и мягко, потом полутона и резче
  if (uHas > 0.5 && uDev > 0.002) {
    vec2 pu = (px - uRect.xy) / uRect.zw;
    if (pu.x > 0.0 && pu.x < 1.0 && pu.y > 0.0 && pu.y < 1.0) {
      // фото в sRGB как есть (без перевода в линейные): яркости как на снимке
      float L = texture2D(uPhoto, vec2(pu.x, 1.0 - pu.y), (1.0 - uDev) * 3.5).r;
      float th = 1.05 - 1.25 * uDev;
      float v = L * smoothstep(th, th + 0.45, L);
      float m = smoothstep(0.0, 0.26, pu.x) * smoothstep(1.0, 0.74, pu.x) * smoothstep(0.0, 0.1, pu.y) * smoothstep(1.0, 0.7, pu.y);
      col = mix(col, vec3(v) * 0.78, m * smoothstep(0.0, 0.35, uDev));
    }
  }
  // плёночное зерно и виньетка по углам
  col += (hash(px * 0.73 + fract(uTime * 7.13) * 97.0) - 0.5) * 0.03;
  col *= mix(1.0, smoothstep(1.35, 0.25, length(c * vec2(0.9, 1.1))), 0.6);
  // пока фон не проявился, он того же цвета, что страница (#070707)
  col = mix(vec3(0.027), max(col, 0.0), uFade);
  // в линейные яркости точно по sRGB: у самого чёрного там прямой участок, степень его бы утопила
  gl_FragColor = vec4(mix(col / 12.92, pow((col + 0.055) / 1.055, vec3(2.4)), step(0.04045, col)), 1.0);
  #include <colorspace_fragment>
}`;

/** Студия для отражений: тёмный пол, светлеющий к верху свод и несколько мягких софтбоксов. Без резких рёбер,
 *  поэтому на гранях букв только плавные блики (стандартная «комната» three.js давала на лицах букв линии коробок). */
function studio() {
  const room = new Scene();
  const dome = new Mesh(new SphereGeometry(40, 32, 16), new ShaderMaterial({
    side: BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; void main() { float y = vP.y; vec3 c = mix(vec3(0.012), vec3(0.09), smoothstep(-0.35, 0.9, y)); gl_FragColor = vec4(c, 1.0); }',
  }));
  room.add(dome);
  // софтбокс: прямоугольник света с мягкими краями
  const box = (w: number, h: number, power: number, x: number, y: number, z: number) => {
    const m = new Mesh(new PlaneGeometry(w, h), new ShaderMaterial({
      side: DoubleSide, uniforms: { uP: { value: power } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uP; varying vec2 vUv; void main() { vec2 d = abs(vUv - 0.5) * 2.0; float e = (1.0 - smoothstep(0.55, 1.0, d.x)) * (1.0 - smoothstep(0.55, 1.0, d.y)); gl_FragColor = vec4(vec3(uP * e), 1.0); }',
    }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  box(14, 5, 3.2, -6, 9, 6); // сверху слева спереди: главный блик на верхних гранях
  box(3, 14, 2.2, 11, 1, 2); // справа узкая полоса: светлые кромки
  box(3, 12, 1.4, -11, -1, -1); // слева, слабее
  box(18, 7, 0.45, 0, 1, 16); // за камерой: лица букв чуть светятся
  return room;
}

export async function createGlass(o: Opts): Promise<Glass> {
  const t0 = performance.now();
  const { canvas, beats, calm, coarse } = o;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x070707, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // преломление считается по картинке позади стекла в половинном размере: мягче и дешевле
  renderer.transmissionResolutionScale = 0.5;
  let dprCap = coarse ? 1.6 : 2;
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = studio();
  scene.environment = pmrem.fromScene(room, 0.02).texture;
  room.traverse((m) => { if (m instanceof Mesh) { m.geometry.dispose(); (m.material as ShaderMaterial).dispose(); } });
  pmrem.dispose();
  scene.environmentIntensity = 1.6;
  // свет из студии сверху слева: блики на фасках
  const key = new DirectionalLight(0xffffff, 3);
  key.position.set(-4, 6, 8);
  scene.add(key);
  const camera = new PerspectiveCamera(30, 1, 0.5, 200);

  /* ---------- фон ---------- */
  const bdU = {
    uRes: { value: new Vector2(1, 1) }, uTime: { value: 0 }, uPhoto: { value: null as Texture | null }, uHas: { value: 0 },
    uDev: { value: 0 }, uRect: { value: new Vector4(0, 0, 1, 1) }, uLight: { value: 0 }, uFade: { value: 0 }, uBand: { value: 0 },
  };
  const bg = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: bdU, depthWrite: false, depthTest: false }));
  bg.frustumCulled = false;
  bg.renderOrder = -1;
  scene.add(bg);
  new TextureLoader().load(o.photo, (t) => { t.colorSpace = NoColorSpace; t.anisotropy = 4; bdU.uPhoto.value = t; bdU.uHas.value = 1; });

  /* ---------- фразы ---------- */
  const q = coarse ? { curve: 5, bevel: 3 } : { curve: 7, bevel: 4 };
  const drum = new Group();
  scene.add(drum);
  const beat: BeatState[] = beats.map(() => ({ rot: 1.6, push: 0, on: 0 }));
  type Item = { mesh: Mesh; mat: MeshPhysicalMaterial; u: { uSize: { value: number }; uR: { value: number }; uOn: { value: number } }; wide: string[]; narrow: string[]; geo: { wide?: BufferGeometry; narrow?: BufferGeometry } };
  const items: Item[] = beats.map((lines) => {
    const u = { uSize: { value: 1 }, uR: { value: R }, uOn: { value: 0 } };
    const mat = new MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 1, thickness: 0.5, ior: 1.5,
      clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1, envMapIntensity: 1.6,
      attenuationColor: 0xffffff, attenuationDistance: 3, transparent: true, side: FrontSide,
    });
    mat.onBeforeCompile = (s) => bend(s, u);
    mat.customProgramCacheKey = () => 'hero-bend';
    const mesh = new Mesh(new BufferGeometry(), mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    drum.add(mesh);
    return { mesh, mat, u, wide: lines.map((l) => l.replace(/\|/g, ' ')), narrow: lines.flatMap((l) => l.split('|')), geo: {} };
  });

  /* ---------- раскладка ---------- */
  let W = 1, H = 1, narrow = false, f = 1000;
  const view = { cy: 0.5 };
  let cyPx = 0;
  // где стоит фраза k по высоте (px): все по центру экрана, третья ниже лица на фото, последняя в месте заголовка
  const slots: number[] = beats.map(() => 0);
  const sizes: number[] = beats.map(() => 1);
  const spans: number[] = beats.map(() => 0.3);
  /** проекция: полуширина дуги и высота блока строк в px при кегле s */
  const halfW = (wEm: number, s: number) => { const a = Math.min(1.45, (wEm * s) / 2 / R); return (f * Math.sin(a)) / (K + 1 - Math.cos(a)); };
  const fit = (lines: string[], maxW: number, maxH: number, maxCap: number) => {
    const wEm = Math.max(...lines.map(widthEm));
    const hEm = CAP + (lines.length - 1) * LH;
    let lo = 0.05, hi = 40;
    for (let i = 0; i < 32; i++) {
      const s = (lo + hi) / 2;
      const ok = 2 * halfW(wEm, s) <= maxW && (f * hEm * s) / (K * R) <= maxH && (f * CAP * s) / (K * R) <= maxCap;
      if (ok) lo = s; else hi = s;
    }
    return lo;
  };
  function useGeometry(it: Item) {
    const key = narrow ? 'narrow' : 'wide';
    const geo = (it.geo[key] ??= phrase(narrow ? it.narrow : it.wide, q));
    if (it.mesh.geometry !== geo) it.mesh.geometry = geo;
    return narrow ? it.narrow : it.wide;
  }
  function layout(fin: { cx: number; cy: number; w: number; h: number }) {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    narrow = W < H * 0.9;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(W, H, false);
    // фокус подбирается так, что самая широкая строка занимает дугу ±A у передней образующей и 86 % ширины
    const A = narrow ? 0.5 : 0.56;
    f = (0.43 * W * (K + 1 - Math.cos(A))) / Math.sin(A);
    camera.fov = (2 * Math.atan(H / 2 / f) * 180) / Math.PI;
    camera.aspect = W / H;
    camera.position.set(0, 0, R * (1 + K));
    camera.lookAt(0, 0, R);
    bdU.uRes.value.set(W, H);
    // фото: на компьютере во всю высоту по центру, на телефоне сверху во всю ширину
    const pa = 800 / 840;
    if (narrow) { const w = W * 1.12, h = w / pa; bdU.uRect.value.set((W - w) / 2, H * 0.06, w, h); }
    else { const h = H * 1.04, w = h * pa; bdU.uRect.value.set((W - w) / 2, -H * 0.02, w, h); }
    const rect = bdU.uRect.value;
    items.forEach((it, k) => {
      const lines = useGeometry(it);
      const last = k === items.length - 1;
      const photoBeat = k === items.length - 2;
      let maxW = W * 0.86, maxH = H * (narrow ? 0.42 : 0.5), maxCap = H * (narrow ? 0.085 : 0.2);
      let cy = H / 2;
      if (last) { maxW = Math.min(maxW, fin.w); maxH = Math.min(maxH, fin.h); cy = fin.cy; }
      if (photoBeat) maxCap = H * (narrow ? 0.09 : 0.16);
      sizes[k] = fit(lines, maxW, maxH, maxCap);
      if (photoBeat) {
        // строки встают под подбородком (на фото он примерно на 47 % высоты), но не ниже 80 % экрана
        const blockH = (f * (CAP + (lines.length - 1) * LH) * sizes[k]) / (K * R);
        cy = Math.min(H * 0.8, rect.y + rect.w / pa * 0.47 + blockH / 2 + H * 0.03);
      }
      slots[k] = cy;
      spans[k] = (Math.max(...lines.map(widthEm)) * sizes[k]) / 2 / R;
      it.u.uSize.value = sizes[k];
      it.mat.thickness = DEPTH * sizes[k] * 2.4;
      it.mat.attenuationDistance = sizes[k] * 4;
    });
    cyPx = view.cy * H;
  }

  /* ---------- кадр ---------- */
  let running = false, time = 0, last = 0;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  let slow = 0, frames = 0;
  const apply = () => {
    // параллакс за мышью: цилиндр чуть поворачивается, лёгкое покачивание в покое
    ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05;
    drum.rotation.y = ptr.x * 0.07 + (calm ? 0 : Math.sin(time * 0.31) * 0.012);
    drum.rotation.x = ptr.y * 0.045 + (calm ? 0 : Math.sin(time * 0.23) * 0.006);
    items.forEach((it, k) => {
      const b = beat[k];
      const vis = b.on > 0.002 && Math.abs(b.rot) - spans[k] < EDGE;
      it.mesh.visible = vis;
      if (!vis) return;
      it.mesh.rotation.y = b.rot;
      it.mesh.scale.setScalar(1 + b.push);
      it.u.uOn.value = b.on;
    });
    const cy = view.cy * H;
    if (Math.abs(cy - cyPx) > 0.01 || camera.view === null) { cyPx = cy; camera.setViewOffset(W, H, 0, H / 2 - cy, W, H); camera.updateProjectionMatrix(); }
    bdU.uTime.value = time;
    bdU.uBand.value = cy;
    bdU.uDev.value = o.calm ? Math.round(bdRef.photo) : bdRef.photo;
    bdU.uLight.value = bdRef.light;
    bdU.uFade.value = bdRef.fade;
  };
  const bdRef: Backdrop = { photo: 0, light: 0, fade: 0 };
  const tick = () => {
    const now = performance.now();
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    time += dt;
    // качество: если кадры долгие, плотность пикселей снижается (не ниже 1)
    if (frames < 240) {
      frames++;
      if (frames > 20 && dt > 0.03) slow++;
      if (slow > 18 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.4); slow = 0; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap)); renderer.setSize(W, H, false); }
    }
    apply();
    renderer.render(scene, camera);
  };
  // геометрия фраз строится по одной с паузами (главный поток не стоит), шейдеры компилируются параллельно
  const pause = () => new Promise((r) => setTimeout(r, 0));
  const portrait = canvas.clientWidth < canvas.clientHeight * 0.9;
  for (const it of items) { it.geo[portrait ? 'narrow' : 'wide'] ??= phrase(portrait ? it.narrow : it.wide, q); await pause(); }
  const t1 = performance.now();
  items.forEach((it) => { it.mesh.geometry = it.geo[portrait ? 'narrow' : 'wide']!; it.mesh.visible = true; });
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  items.forEach((it) => { it.mesh.visible = false; });
  if (import.meta.env.DEV) (window as unknown as { __glass: object }).__glass = { build: Math.round(t1 - t0), compile: Math.round(performance.now() - t1) };

  return {
    beat, bd: bdRef, view,
    layout,
    slotY: (k) => slots[k] / H,
    span: (k) => spans[k],
    start() { if (running) return; running = true; last = 0; gsap.ticker.add(tick); },
    stop() { if (!running) return; running = false; gsap.ticker.remove(tick); },
    pointer(x, y, on) { if (calm) return; ptr.tx = on ? x : 0; ptr.ty = on ? y : 0; },
    warm() {
      // все фразы один раз видимы за кадром: шейдер и геометрия уходят в видеокарту до начала рассказа
      const keep = beat.map((b) => ({ ...b }));
      beat.forEach((b) => { b.rot = 0; b.on = 0.003; });
      apply();
      items.forEach((it) => { it.mesh.visible = true; });
      renderer.render(scene, camera);
      beat.forEach((b, k) => Object.assign(b, keep[k]));
      apply();
      renderer.render(scene, camera);
    },
    dispose() {
      gsap.ticker.remove(tick);
      items.forEach((it) => { it.mat.dispose(); it.geo.wide?.dispose(); it.geo.narrow?.dispose(); });
      bg.geometry.dispose(); (bg.material as ShaderMaterial).dispose();
      bdU.uPhoto.value?.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
