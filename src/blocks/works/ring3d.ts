import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, CylinderGeometry, ShaderMaterial, TextureLoader, VideoTexture,
  NoColorSpace, LinearSRGBColorSpace, LinearFilter, LineLoop, BufferGeometry, Float32BufferAttribute, LineDashedMaterial, type Texture,
} from 'three';
import { gsap } from 'gsap';

/**
 * Цилиндр работ. Панели стоят на поверхности цилиндра и изогнуты вместе с ним; на каждой постер работы,
 * на передней её видео. Соседние панели видны по краям и приглушены, сверху и снизу пунктир окружностей.
 * Если работ меньше шести, они повторяются по кругу (цилиндр из шести панелей), иначе панель на работу.
 * pos: положение цилиндра в панелях (дробное во время жеста); передняя работа = round(pos) по модулю числа работ.
 * Кадр рисуется, только пока цилиндр движется или идёт видео.
 */
export interface Ring {
  layout(): void;
  start(): void;
  stop(): void;
  readonly pos: number;
  set(pos: number): void;
  spin(to: number, dur?: number, ease?: string): gsap.core.Tween;
  /** работа k показывает видео на передней панели (null: везде постеры) */
  live(k: number | null): void;
  dispose(): void;
}

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// скруглённые углы и светлая кромка считаются по uv с поправкой на 16:9; боковые панели темнее
const FRAG = /* glsl */ `
uniform sampler2D map; uniform float uDim; uniform float uHas; varying vec2 vUv;
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 asp = vec2(16.0 / 9.0, 1.0);
  vec2 p = (vUv - 0.5) * asp;
  float d = rbox(p, asp * 0.5, 0.035);
  float fw = fwidth(d);
  float a = 1.0 - smoothstep(-fw, fw, d);
  vec3 c = uHas > 0.5 ? texture2D(map, vUv).rgb : vec3(0.02);
  c *= mix(1.0, 0.34, uDim);
  c += vec3(0.9) * (1.0 - smoothstep(0.0, fw * 1.5, abs(d + fw))) * mix(0.16, 0.08, uDim);
  gl_FragColor = vec4(c, a);
}`;

export function createRing(opts: { canvas: HTMLCanvasElement; area: HTMLElement; videos: HTMLVideoElement[]; posters: string[] }): Ring {
  const { canvas, area, videos, posters } = opts;
  const N = Math.max(1, posters.length);
  const S = N >= 6 ? N : N * Math.ceil(6 / N);
  const STEP = (Math.PI * 2) / S, PHI = STEP * 0.86, R = 1, H = (R * PHI * 9) / 16;
  const mod = (a: number, n: number) => ((a % n) + n) % n;

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  // цвета кадров идут как есть, без перевода туда и обратно: видео и постеры выглядят точно как файлы
  renderer.outputColorSpace = LinearSRGBColorSpace;
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.05, 50);
  const ring = new Group();
  scene.add(ring);

  /* ---------- картинки: постеры и видео ---------- */
  const loader = new TextureLoader();
  let dirty = true;
  const prep = <T extends Texture>(t: T) => { t.colorSpace = NoColorSpace; t.minFilter = LinearFilter; t.generateMipmaps = false; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
  const posterTex = posters.map((src) => prep(loader.load(src, () => { dirty = true; })));
  const videoTex = videos.map((v) => prep(new VideoTexture(v)));
  const ready = videos.map(() => false);
  videos.forEach((v, k) => v.addEventListener('playing', () => { ready[k] = true; dirty = true; }));

  /* ---------- панели ---------- */
  const panels = Array.from({ length: S }, (_, i) => {
    const a = i * STEP;
    const mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, uniforms: { map: { value: posterTex[i % N] }, uDim: { value: 1 }, uHas: { value: 1 } } });
    const mesh = new Mesh(new CylinderGeometry(R, R, H, 64, 1, true, a - PHI / 2, PHI), mat);
    ring.add(mesh);
    return { mesh, mat, k: i % N };
  });
  // пунктир окружностей сверху и снизу: цилиндр читается целиком, а не только передней панелью
  const rim = (y: number) => {
    const g = new BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i <= 160; i++) { const t = (i / 160) * Math.PI * 2; pts.push(R * Math.sin(t), y, R * Math.cos(t)); }
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    const l = new LineLoop(g, new LineDashedMaterial({ color: 0xeeece6, transparent: true, opacity: 0.22, dashSize: 0.028, gapSize: 0.03 }));
    l.computeLineDistances();
    ring.add(l);
    return l;
  };
  const rims = [rim(H / 2 + 0.05), rim(-H / 2 - 0.05)];

  /* ---------- кадр: передняя панель вписана в место .works__ring ---------- */
  let W = 1, Hc = 1;
  const layout = () => {
    const r = canvas.getBoundingClientRect(), a = area.getBoundingClientRect();
    W = Math.max(1, r.width); Hc = Math.max(1, r.height);
    renderer.setSize(W, Hc, false);
    camera.aspect = W / Hc;
    const chord = 2 * R * Math.sin(PHI / 2);
    // пикселей на единицу у передней панели: на компьютере не шире 64% места, на телефоне 80%; соседние видны по краям
    const wide = a.width > a.height * 0.9;
    const ppu = Math.min((a.width * (wide ? 0.64 : 0.8)) / chord, (a.height * (wide ? 0.64 : 0.7)) / H);
    const d = Hc / (2 * Math.tan((camera.fov * Math.PI) / 360) * ppu);
    camera.position.set(0, d * 0.16, R + d);
    camera.lookAt(0, 0, R);
    // середина передней панели встаёт в середину места, а не холста
    // на компьютере чуть правее середины: левая соседняя панель не заходит под карточку
    const cx = a.left - r.left + a.width * (wide ? 0.53 : 0.5), cy = a.top - r.top + a.height / 2;
    camera.setViewOffset(W, Hc, W / 2 - cx, Hc / 2 - cy, W, Hc);
    camera.updateProjectionMatrix();
    dirty = true;
  };

  /* ---------- положение ---------- */
  const st = { pos: 0 };
  let liveK: number | null = null;
  const apply = () => {
    ring.rotation.y = -st.pos * STEP;
    const front = mod(Math.round(st.pos), S);
    panels.forEach((p, i) => {
      // насколько панель далеко от передней, в панелях: 0 спереди, 1 у соседей
      const off = Math.abs(mod(i - st.pos + S / 2, S) - S / 2);
      p.mat.uniforms.uDim.value = Math.min(1, off);
      const vid = i === front && liveK === p.k && ready[p.k];
      p.mat.uniforms.map.value = vid ? videoTex[p.k] : posterTex[p.k];
    });
    dirty = true;
  };
  apply();

  let running = false;
  const render = () => {
    const playing = liveK != null && ready[liveK] && !videos[liveK].paused;
    if (!(dirty || playing || gsap.isTweening(st))) return;
    if (gsap.isTweening(st)) apply();
    renderer.render(scene, camera);
    dirty = false;
  };

  let spinning: gsap.core.Tween | null = null;
  return {
    layout,
    get pos() { return st.pos; },
    start() { if (running) return; running = true; dirty = true; gsap.ticker.add(render); },
    stop() { if (!running) return; running = false; gsap.ticker.remove(render); },
    set(pos) { spinning?.kill(); st.pos = pos; apply(); },
    spin(to, dur = 1.1, ease = 'power3.inOut') {
      spinning?.kill();
      spinning = gsap.to(st, { pos: to, duration: dur, ease, onUpdate: apply, onComplete: apply });
      return spinning;
    },
    live(k) { liveK = k; if (k != null) ready[k] = ready[k] && !videos[k].paused; apply(); },
    dispose() {
      gsap.ticker.remove(render);
      spinning?.kill();
      panels.forEach((p) => { p.mesh.geometry.dispose(); p.mat.dispose(); });
      rims.forEach((l) => { l.geometry.dispose(); (l.material as LineDashedMaterial).dispose(); });
      [...posterTex, ...videoTex].forEach((t) => t.dispose());
      renderer.dispose();
    },
  };
}
