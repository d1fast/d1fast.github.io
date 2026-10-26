import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, CylinderGeometry, ShaderMaterial, TextureLoader, Texture,
  NoColorSpace, LinearSRGBColorSpace, LinearFilter,
} from 'three';
import { gsap } from 'gsap';

/**
 * Цилиндр работ. Панели стоят на поверхности цилиндра и изогнуты вместе с ним; на каждой постер работы,
 * на передней её видео. Цилиндр широкий (девять панелей по кругу, у работ меньше девяти они повторяются),
 * поэтому соседние панели видны по краям почти в лицо. Передняя панель самая крупная, соседние чуть мельче
 * и приглушены. Пока цилиндр поворачивается, камера немного отъезжает и возвращается: поворот ощущается
 * как движение настоящего барабана, а не смена слайдов.
 * pos: положение цилиндра в панелях (дробное во время жеста); передняя работа = round(pos) по модулю числа работ.
 * Кадр видео в текстуру переносится, когда у ролика сменилось время (не только по requestVideoFrameCallback:
 * Safari не зовёт его у ролика, который сам на странице не виден). Кадр рисуется, только пока что-то движется.
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
  const S = N >= 9 ? N : N * Math.ceil(9 / N);
  const STEP = (Math.PI * 2) / S, PHI = STEP * 0.9, R = 1, H = (R * PHI * 9) / 16;
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
  const videoTex = videos.map((v) => prep(new Texture(v)));
  const ready = videos.map(() => false);
  const shot = videos.map(() => -1); // время кадра, который уже в текстуре
  videos.forEach((v, k) => v.addEventListener('playing', () => { ready[k] = true; dirty = true; }));

  /* ---------- панели ---------- */
  const panels = Array.from({ length: S }, (_, i) => {
    const a = i * STEP;
    const mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, uniforms: { map: { value: posterTex[i % N] }, uDim: { value: 1 }, uHas: { value: 1 } } });
    const mesh = new Mesh(new CylinderGeometry(R, R, H, 64, 1, true, a - PHI / 2, PHI), mat);
    ring.add(mesh);
    return { mesh, mat, k: i % N, cx: R * Math.sin(a), cz: R * Math.cos(a) };
  });
  /* ---------- кадр: передняя панель вписана в место .works__ring ---------- */
  let W = 1, Hc = 1, dist = 3, lift = 0.3;
  /** камера: back — доля отъезда (0 в покое, 1 посреди поворота) */
  const place = (back: number) => {
    const d = dist * (1 + 0.16 * back);
    camera.position.set(0, lift * (1 + 0.3 * back), R + d);
    camera.lookAt(0, 0, R);
  };
  const layout = () => {
    const r = canvas.getBoundingClientRect(), a = area.getBoundingClientRect();
    W = Math.max(1, r.width); Hc = Math.max(1, r.height);
    renderer.setSize(W, Hc, false);
    camera.aspect = W / Hc;
    const chord = 2 * R * Math.sin(PHI / 2);
    // пикселей на единицу у передней панели: на компьютере до 74 % ширины места, на телефоне 82 %; соседние видны по краям
    const wide = a.width > a.height * 0.9;
    const ppu = Math.min((a.width * (wide ? 0.74 : 0.82)) / chord, (a.height * (wide ? 0.72 : 0.7)) / H);
    dist = Hc / (2 * Math.tan((camera.fov * Math.PI) / 360) * ppu);
    lift = dist * 0.12;
    place(0);
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
      // передняя самая крупная, соседние чуть мельче: панель сжимается к своей середине на поверхности цилиндра
      const sc = 1 - 0.1 * Math.min(1, off);
      p.mesh.scale.setScalar(sc);
      p.mesh.position.set(p.cx * (1 - sc), 0, p.cz * (1 - sc));
      const vid = i === front && liveK === p.k && ready[p.k];
      p.mat.uniforms.map.value = vid ? videoTex[p.k] : posterTex[p.k];
    });
    // посреди поворота камера чуть отъезжает: барабан поворачивается, а не листается
    const frac = Math.abs(st.pos - Math.round(st.pos));
    place(Math.sin(Math.min(1, frac * 2) * Math.PI / 2));
    dirty = true;
  };
  apply();

  let running = false;
  const render = () => {
    const v = liveK != null ? videos[liveK] : null;
    // ролик идёт, даже если событие playing потерялось: кадр есть и время меняется
    if (v && liveK != null && !ready[liveK] && !v.paused && v.readyState >= 2) { ready[liveK] = true; apply(); }
    const playing = !!v && liveK != null && ready[liveK] && !v.paused;
    // новый кадр ролика переносится в текстуру, только когда у ролика сменилось время
    if (playing && v.currentTime !== shot[liveK!]) { shot[liveK!] = v.currentTime; videoTex[liveK!].needsUpdate = true; dirty = true; }
    if (!(dirty || gsap.isTweening(st))) return;
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
    spin(to, dur = 1.6, ease = 'power2.inOut') {
      spinning?.kill();
      spinning = gsap.to(st, { pos: to, duration: dur, ease, onUpdate: apply, onComplete: apply });
      return spinning;
    },
    live(k) { liveK = k; if (k != null) ready[k] = ready[k] && !videos[k].paused; apply(); },
    dispose() {
      gsap.ticker.remove(render);
      spinning?.kill();
      panels.forEach((p) => { p.mesh.geometry.dispose(); p.mat.dispose(); });
      [...posterTex, ...videoTex].forEach((t) => t.dispose());
      renderer.dispose();
    },
  };
}
