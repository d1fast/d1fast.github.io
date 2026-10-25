import {
  WebGLRenderer, LinearSRGBColorSpace, Scene, PerspectiveCamera, Group, Mesh, ExtrudeGeometry, PlaneGeometry, ShaderMaterial, Vector3, MathUtils,
  type BufferGeometry, type Material,
} from 'three';
import { Font, type FontData } from 'three/examples/jsm/loaders/FontLoader.js';
import { gsap } from 'gsap';
import data from './geologica-800.json';
import type { Palette } from './palettes';

/**
 * Объёмные слова первого экрана: БОТ, САЙТ, ЗАПИСЬ, ИГРА (на английском BOT, SITE, APP, GAME).
 * Каждое слово выходит по-своему: бот «печатает», сайт выезжает, как страница при прокрутке, запись
 * перелистывается табло, игра крутится барабанами. На сомнении слова падают в шаткую башню, на ответе
 * встают ровной стопкой. Буквы целые, из шрифта Geologica 800 (scripts/hero-type.mjs), без частиц и знаков.
 * Свет считается без источников: лицо буквы залито цветом палитры, бока темнее. Одна буква = один меш,
 * всего около 20 вызовов отрисовки; кадр рисуется, только пока что-то движется. Размеры в пикселях холста.
 */
export type Act = 'type' | 'scroll' | 'flip' | 'reels';
export interface Type3D {
  /** холст поменял размер: слова встают на места заново */
  layout(): void;
  start(): void;
  stop(): void;
  /** слово i выходит одно, прежнее уходит вниз */
  enter(i: number): gsap.core.Timeline;
  /** сомнение: слова падают друг на друга и шатаются */
  pile(): gsap.core.Timeline;
  /** ответ: стопка. gather собирает слова с мест, drop роняет сверху, snap ставит сразу */
  stack(how: 'gather' | 'drop' | 'snap'): gsap.core.Timeline;
  /** цвета слов: одна палитра всем или лица по словам */
  tone(p: Palette, dur: number, faces?: string[]): void;
  /** короткое действие слова в покое */
  act(i: number): void;
  /** точка экрана (относительно холста), откуда разливается новый цвет */
  origin(): { x: number; y: number };
  pointer(nx: number, ny: number, on: boolean): void;
  /** высота строки вопроса от верха холста, px (null: слово по середине места) */
  aim(px: number | null): void;
  /** убрать все слова (перед коротким входом) */
  hide(): void;
  /** отрисовать один кадр (покой без движения) */
  draw(): void;
  dispose(): void;
}

const font = new Font(data as unknown as FontData);
const CAP = (data as { capHeight?: number }).capHeight || 1400;
const UPM = (data as { resolution: number }).resolution;
const DEPTH = 0.34; // глубина букв в высотах заглавной
const LIGHT = new Vector3(-0.45, 0.75, 0.5).normalize();

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

const VERT = /* glsl */ `
varying vec3 vN; varying float vCap; varying float vY;
void main() {
  vCap = normal.z;
  vN = normalize(normalMatrix * normal);
  vY = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// лицо: плоская печать с едва заметным градиентом; бока: глубокая тень, освещённые стороны тянутся к цвету фона
const FRAG = /* glsl */ `
uniform vec3 uFace; uniform vec3 uSide; uniform vec3 uBg; uniform vec3 uL;
varying vec3 vN; varying float vCap; varying float vY;
void main() {
  vec3 n = normalize(vN);
  float cap = smoothstep(0.55, 0.92, vCap);
  float lam = clamp(dot(n, uL), 0.0, 1.0);
  vec3 side = mix(uSide, mix(uSide, uBg, 0.5), lam);
  vec3 face = uFace * (0.93 + 0.07 * clamp(vY + 0.5, 0.0, 1.0)) * (0.84 + 0.16 * clamp(n.z, 0.0, 1.0));
  gl_FragColor = vec4(mix(side, face, cap), 1.0);
}`;
const SH_VERT = /* glsl */ `varying vec2 vU; void main() { vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SH_FRAG = /* glsl */ `uniform vec3 uC; uniform float uA; varying vec2 vU;
void main() { float d = length(vU); gl_FragColor = vec4(uC, uA * (1.0 - smoothstep(0.1, 1.0, d))); }`;

interface Word {
  text: string;
  act: Act;
  root: Group; // место, размер (пикселей на высоту заглавной) и поворот слова
  letters: Mesh[];
  base: number[]; // x букв в слове
  baseY: number[]; // y букв: у всех общая базовая линия
  width: number; // в высотах заглавной
  top: number; bot: number; // верх и низ букв от середины заглавной (у «Й» выше 0,5)
  mat: ShaderMaterial;
  shadow: Mesh;
  col: { face: number[]; side: number[]; bg: number[] };
}

export function createType3D(opts: { canvas: HTMLCanvasElement; words: string[]; lite?: boolean }): Type3D {
  const { canvas, lite = false } = opts;
  // есть ли WebGL, проверяет hero.ts до загрузки этого модуля; 20 вызовов отрисовки не стоят включения дискретной видеокарты
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'default' });
  renderer.outputColorSpace = LinearSRGBColorSpace; // цвета палитры идут в шейдер как есть и выходят точно в hex
  renderer.setClearColor(0x000000, 0);
  const DPRS = [1.5, 1.25, 1];
  let q = DPRS.findIndex((d) => d <= Math.min(window.devicePixelRatio || 1, 1.5));
  if (q < 0) q = 2;
  renderer.setPixelRatio(DPRS[q]);

  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 1, 20000);
  const rig = new Group(); // наклон за курсором
  const pose = new Group(); // поза покоя: слова чуть развёрнуты, видны бока
  pose.rotation.set(0.05, -0.2, 0);
  rig.add(pose);
  scene.add(rig);

  /* ---------- буквы: геометрия на каждый знак одна, общая для всех слов ---------- */
  const geos = new Map<string, { geo: BufferGeometry; cx: number; cy: number }>();
  const glyph = (ch: string) => {
    let g = geos.get(ch);
    if (!g) {
      const geo = new ExtrudeGeometry(font.generateShapes(ch, UPM / CAP), {
        depth: DEPTH, curveSegments: lite ? 3 : 5, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.028, bevelSegments: lite ? 1 : 2,
      });
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
      geo.translate(-cx, -cy, -DEPTH / 2); // ось вращения в центре буквы
      g = { geo, cx, cy };
      geos.set(ch, g);
    }
    return g;
  };
  const glyphs = (data as unknown as { glyphs: Record<string, { ha: number }> }).glyphs;
  const ACTS: Act[] = ['type', 'scroll', 'flip', 'reels'];
  const words: Word[] = [];
  /** слова собираются по одному: первое сразу, остальные в свободное время браузера */
  const build = (i: number) => {
    if (words[i]) return words[i];
    const text = opts.words[i];
    const mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uFace: { value: new Vector3() }, uSide: { value: new Vector3() }, uBg: { value: new Vector3() }, uL: { value: LIGHT } },
    });
    const root = new Group();
    const letters: Mesh[] = [], base: number[] = [], baseY: number[] = [];
    let x = 0;
    for (const ch of text) {
      const adv = (glyphs[ch]?.ha ?? UPM * 0.6) / CAP;
      if (ch.trim()) {
        const g = glyph(ch);
        const m = new Mesh(g.geo, mat);
        m.position.set(x + g.cx, g.cy - 0.5, 0);
        letters.push(m); base.push(x + g.cx); baseY.push(g.cy - 0.5);
        root.add(m);
      }
      x += adv;
    }
    // слово по центру видимых краёв букв, без боковых полей
    const half = (m: Mesh) => (m.geometry.boundingBox!.max.x - m.geometry.boundingBox!.min.x) / 2;
    const left = letters.length ? base[0] - half(letters[0]) : 0;
    const right = letters.length ? base[base.length - 1] + half(letters[letters.length - 1]) : x;
    const width = right - left, mid = (left + right) / 2;
    let top = 0.5, bot = 0.5;
    letters.forEach((m) => { const b = m.geometry.boundingBox!; top = Math.max(top, m.position.y + b.max.y); bot = Math.max(bot, -(m.position.y + b.min.y)); });
    letters.forEach((m, k) => { m.position.x -= mid; base[k] -= mid; });
    const shMat = new ShaderMaterial({ vertexShader: SH_VERT, fragmentShader: SH_FRAG, transparent: true, depthWrite: false, uniforms: { uC: { value: new Vector3() }, uA: { value: 0 } } });
    const shadow = new Mesh(new PlaneGeometry(width * 1.15, 1.1), shMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.06, -0.53, 0);
    shadow.renderOrder = -1;
    root.add(shadow);
    root.visible = false;
    pose.add(root);
    const w: Word = { text, act: ACTS[i % ACTS.length], root, letters, base, baseY, width, top, bot, mat, shadow, col: { face: [1, 1, 1], side: [0, 0, 0], bg: [0, 0, 0] } };
    words[i] = w;
    toTarget(w, i);
    paintWord(w);
    return w;
  };
  const paintWord = (w: Word) => {
    const u = w.mat.uniforms;
    (u.uFace.value as Vector3).fromArray(w.col.face);
    (u.uSide.value as Vector3).fromArray(w.col.side);
    (u.uBg.value as Vector3).fromArray(w.col.bg);
    ((w.shadow.material as ShaderMaterial).uniforms.uC.value as Vector3).fromArray(w.col.side);
  };
  /* ---------- цвет: целевые цвета помнятся, слово, собранное позже, сразу получает их ---------- */
  let target: { p: Palette | null; faces?: string[] } = { p: null };
  const toTarget = (w: Word, i: number) => {
    if (!target.p) return;
    w.col.face = rgb(target.faces?.[i] ?? target.p.accent); w.col.side = rgb(target.p.side); w.col.bg = rgb(target.p.bg);
  };
  build(0);
  // шейдеры компилируются сразу, а не на первом кадре рассказа
  words[0].root.visible = true;
  renderer.compile(scene, camera);
  words[0].root.visible = false;
  {
    let k = 1;
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(cb, { timeout: 600 }) : setTimeout(cb, 60));
    const next = () => { if (k < opts.words.length) { build(k++); idle(next); } };
    idle(next);
  }
  const all = () => opts.words.map((_, i) => build(i));

  /* ---------- размеры ---------- */
  // холст шире места для слов на 6% с каждой стороны и выше на 6% сверху (sections.css .hero__gl):
  // размеры считаются от самого места, а его середина ниже середины холста на 3% высоты места
  const BLEED = 1.12, BLEED_Y = 1.06;
  let W = 1, H = 1;
  const layout = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // на расстоянии D плоскость z=0 видна высотой H: единица = пиксель холста
    const D = H / 2 / Math.tan(MathUtils.degToRad(camera.fov / 2));
    camera.position.set(-0.1 * D, 0.14 * D, D);
    camera.lookAt(0, 0, 0);
    camera.near = D * 0.2; camera.far = D * 4;
    camera.updateProjectionMatrix();
    pose.position.y = -((BLEED_Y - 1) / 2 / BLEED_Y) * H; // середина места, а не холста
    // идущие движения доигрываются сразу: их конечные точки посчитаны под старый размер
    [...live].forEach((t) => t.progress(1));
    relayout();
    dirty = true;
  };
  /** высота одиночного слова: на компьютере на уровне вопроса (aim), иначе середина места */
  let soloY = 0, aimPx: number | null = null;
  const placeSolo = () => {
    soloY = 0;
    if (aimPx != null) soloY = MathUtils.clamp(H / 2 - aimPx - pose.position.y, -0.22 * H, 0.22 * H);
  };
  /** место слова в одиночку: не шире 80% места и не выше 46% */
  const solo = (w: Word) => Math.min((0.8 * W) / BLEED / w.width, (0.46 * H) / BLEED_Y / (w.top + w.bot));
  /** ровная стопка: каждое слово одной ширины. Если холст широкий и низкий, слова идут парами в две строки */
  const stackSlots = () => {
    const ws = all();
    const rows: Word[][] = W / H > 1.45 ? [ws.slice(0, 2), ws.slice(2)] : ws.map((w) => [w]);
    const GAP = 0.32; // между словами в строке, в высотах заглавной
    const maxW = (0.84 * W) / BLEED, maxH = (0.86 * H) / BLEED_Y;
    let Wt = maxW;
    // строка: масштаб под общую ширину, высота по самым высоким и низким буквам строки
    const ext = (r: Word[]) => ({ top: Math.max(...r.map((w) => w.top)), bot: Math.max(...r.map((w) => w.bot)) });
    const scales = () => rows.map((r) => Wt / (r.reduce((a, w) => a + w.width, 0) + GAP * (r.length - 1)));
    const lead = () => Wt * 0.05; // зазор между строками
    const height = () => scales().reduce((a, s, k) => { const e = ext(rows[k]); return a + s * (e.top + e.bot); }, 0) + lead() * (rows.length - 1);
    const total0 = height();
    if (total0 > maxH) Wt *= maxH / total0;
    const ss = scales(), total = height();
    const slots = new Map<Word, { x: number; y: number; s: number }>();
    let y = total / 2;
    rows.forEach((r, k) => {
      const s = ss[k], e = ext(r);
      y -= e.top * s;
      let x = -Wt / 2;
      r.forEach((w) => { slots.set(w, { x: x + (w.width * s) / 2, y, s }); x += (w.width + GAP) * s; });
      y -= e.bot * s + lead();
    });
    return { slots, bottom: rows[rows.length - 1] };
  };
  /** башня сомнения снизу вверх: бот, игра, сайт, запись (самое длинное слово доской сверху) */
  const TOWER = [0, 3, 1, 2];
  const TOWER_OFF = [[0, 0], [0.3, -0.05], [-0.4, 0.06], [0.42, -0.08]];
  const pileSlots = () => {
    const ws = TOWER.map((i) => all()[i]).filter(Boolean);
    const GAP = 0.16; // зазор между словами башни в высотах заглавной: слова не протыкают друг друга
    const tall = ws.reduce((a, w) => a + w.top + w.bot, 0) + GAP * (ws.length - 1);
    const s = Math.min((0.6 * W) / BLEED / Math.max(...ws.map((w) => w.width)), (0.84 * H) / BLEED_Y / tall);
    const slots = new Map<Word, { x: number; y: number; s: number; rz: number }>();
    let y = -(tall * s) / 2;
    ws.forEach((w, k) => { y += w.bot * s; slots.set(w, { x: TOWER_OFF[k][0] * s, y, s, rz: TOWER_OFF[k][1] }); y += (w.top + GAP) * s; });
    return slots;
  };

  /* ---------- состояние и перестановка при смене размера ---------- */
  let mode: 'none' | 'solo' | 'pile' | 'stack' = 'none';
  let cur = -1;
  const lean = { v: 0 }; // крен башни
  const shadowOn = (w: Word, a: number) => { (w.shadow.material as ShaderMaterial).uniforms.uA.value = a; };
  const resetLetters = (w: Word) => w.letters.forEach((m, k) => { m.position.set(w.base[k], w.baseY[k], 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); });
  const relayout = () => {
    placeSolo();
    if (mode === 'solo' && words[cur]) { const w = words[cur]; w.root.position.set(0, soloY, 0); w.root.scale.setScalar(solo(w)); }
    if (mode === 'pile') { pileNow = pileSlots(); pileNow.forEach((p, w) => { w.root.position.set(p.x, p.y, 0); w.root.scale.setScalar(p.s); }); applyLean(); }
    if (mode === 'stack') { const { slots } = stackSlots(); slots.forEach((p, w) => { w.root.position.set(p.x, p.y, 0); w.root.scale.setScalar(p.s); w.root.rotation.set(0, 0, 0); }); }
  };
  let pileNow: ReturnType<typeof pileSlots> | null = null;
  const applyLean = () => {
    if (mode !== 'pile' || !pileNow) return;
    pileNow.forEach((p, w) => { w.root.rotation.z = p.rz + lean.v; w.root.position.x = p.x - lean.v * (p.y + H * 0.4); });
  };

  /* ---------- отрисовка: только пока что-то движется ---------- */
  let running = false, dirty = true, busyUntil = 0;
  const keep = (tl: gsap.core.Timeline | gsap.core.Tween) => { busyUntil = Math.max(busyUntil, performance.now() + tl.totalDuration() * 1000 + 80); return tl; };
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  // качество: по 40 кадрам подряд. Медиана сравнивается с обычным шагом кадров этого экрана (нижний десятый
  // процентиль за всё время): экран с ограничением 30 к/с (энергосбережение) не считается тормозящим.
  // Паузы дольше 100 мс (вкладка была скрыта, главный поток занят) в счёт не идут
  const samples: number[] = [];
  let last = 0, base = Infinity;
  const onVis = () => { last = 0; samples.length = 0; };
  document.addEventListener('visibilitychange', onVis);
  const render = () => {
    const now = performance.now();
    const ty = tilt.ty - rig.rotation.y, tx = tilt.tx - rig.rotation.x;
    const moving = Math.abs(ty) > 1e-3 || Math.abs(tx) > 1e-3;
    if (moving) { rig.rotation.y += ty * 0.08; rig.rotation.x += tx * 0.08; }
    if (!(dirty || moving || now < busyUntil)) { last = 0; return; }
    renderer.render(scene, camera);
    dirty = false;
    if (last && now - last < 100) {
      samples.push(now - last);
      if (samples.length >= 40) {
        samples.sort((a, b) => a - b);
        const med = samples[20];
        base = Math.min(base, samples[4]);
        samples.length = 0;
        if (med > Math.max(20, base * 1.45) && q < DPRS.length - 1) { renderer.setPixelRatio(DPRS[++q]); dirty = true; } // буфер очищен: кадр нужен заново
      }
    }
    last = now;
  };

  /* ---------- выходы слов ---------- */
  const hideOthers = (keepW: Word[]) => words.forEach((w) => { if (w && !keepW.includes(w)) w.root.visible = false; });
  // уходит вглубь и вверх, а не вниз: край холста на телефоне проходит над вопросом и резал бы слово
  const exit = (w: Word, tl: gsap.core.Timeline, at = 0) => {
    tl.to(w.root.position, { z: -H * 1.6, y: `+=${H * 0.12}`, duration: 0.34, ease: 'power2.in' }, at)
      .to(w.root.rotation, { x: -0.5, duration: 0.34, ease: 'power2.in' }, at)
      .set(w.root, { visible: false }, at + 0.34);
  };
  // все таймлайны слов на учёте: ещё не начавшиеся твины внутри них killTweensOf не снимает,
  // и они потом сдвигали буквы уже собранной стопки
  const live = new Set<gsap.core.Timeline>();
  const killAll = () => {
    live.forEach((t) => t.kill());
    live.clear();
    gsap.killTweensOf(lean);
    words.forEach((w) => { if (!w) return; gsap.killTweensOf([w.root, w.root.position, w.root.rotation, w.root.scale]); w.letters.forEach((m) => gsap.killTweensOf([m.position, m.rotation, m.scale])); });
  };
  // отложенные fromTo не ставят начальное значение заранее: слово стоит на месте, пока до него не дошла очередь
  const T = () => {
    const tl: gsap.core.Timeline = gsap.timeline({ defaults: { immediateRender: false }, onComplete: () => { live.delete(tl); } });
    live.add(tl);
    return tl;
  };

  /* ---------- действия слов ---------- */
  /** small: тихий вариант для покоя */
  const play = (w: Word, tl: gsap.core.Timeline, at: number, small = false) => {
    const L = w.letters;
    const k = small ? 0.5 : 1;
    switch (w.act) {
      case 'type': // буквы приезжают справа и подпрыгивают по очереди, как точки «печатает…»
        if (!small) tl.fromTo(L.map((m) => m.position), { x: (i: number) => w.base[i] + 2.4 }, { x: (i: number) => w.base[i], duration: 0.6, ease: 'expo.out', stagger: 0.07 }, at)
          .fromTo(w.root.rotation, { y: -0.5 }, { y: 0, duration: 0.8, ease: 'power3.out' }, at);
        for (let r = 0; r < 2; r++) L.forEach((m, i) => {
          const t = at + (small ? 0 : 0.5) + r * 0.42 + i * 0.1;
          tl.to(m.position, { y: `+=${0.2 * k}`, duration: 0.18, ease: 'sine.out' }, t).to(m.position, { y: `-=${0.2 * k}`, duration: 0.22, ease: 'sine.in' }, t + 0.18);
        });
        break;
      case 'scroll': // выезжает снизу, как страница, и пружинит
        if (!small) tl.fromTo(w.root.position, { y: () => soloY - H * 0.28 }, { y: () => soloY, duration: 0.75, ease: 'back.out(1.5)' }, at)
          .fromTo(w.root.rotation, { x: 1.1 }, { x: 0, duration: 0.75, ease: 'power3.out' }, at)
          .fromTo(L.map((m) => m.position), { y: (i: number) => w.baseY[i] - 0.5 }, { y: (i: number) => w.baseY[i], duration: 0.6, ease: 'expo.out', stagger: 0.05 }, at + 0.05);
        else tl.to(w.root.position, { y: `+=${0.08 * w.root.scale.y}`, duration: 0.22, ease: 'power2.out' }, at)
          .to(w.root.position, { y: `-=${0.08 * w.root.scale.y}`, duration: 0.5, ease: 'back.out(3)' }, at + 0.22);
        tl.fromTo(w.root.scale, { y: () => w.root.scale.x * 1.08 }, { y: () => w.root.scale.x, duration: 0.5, ease: 'elastic.out(1, 0.5)' }, at + (small ? 0.3 : 0.55));
        break;
      case 'flip': // табло: буквы перелистываются по очереди
        tl.fromTo(L.map((m) => m.rotation), { x: small ? -Math.PI * 2 : -Math.PI / 2 }, { x: 0, duration: small ? 0.7 : 0.55, ease: small ? 'power3.inOut' : 'back.out(1.8)', stagger: 0.06 }, at);
        if (!small) tl.fromTo(w.root.position, { x: W * 0.12 }, { x: 0, duration: 0.6, ease: 'expo.out' }, at)
          .fromTo(w.root.rotation, { z: 0.08 }, { z: 0, duration: 0.7, ease: 'elastic.out(1, 0.6)' }, at + 0.45);
        break;
      case 'reels': // барабаны: буквы крутятся и встают одна за другой, потом слово подпрыгивает
        tl.fromTo(L.map((m) => m.rotation), { x: -Math.PI * (small ? 2 : 4) }, { x: 0, duration: small ? 0.75 : 0.85, ease: 'power4.out', stagger: 0.1 }, at);
        if (!small) tl.fromTo(w.root.scale, { x: (_: number) => w.root.scale.x * 0.6, y: (_: number) => w.root.scale.y * 0.6 }, { x: () => solo(w), y: () => solo(w), duration: 0.5, ease: 'back.out(1.6)' }, at);
        {
          const hop = at + (small ? 0.85 : 1.05);
          // прыжок от текущей высоты и обратно ровно на неё
          tl.to(w.root.position, { y: `+=${0.3 * k * (w.root.scale.x || 1)}`, duration: 0.18, ease: 'power2.out' }, hop)
            .to(w.root.position, { y: `-=${0.3 * k * (w.root.scale.x || 1)}`, duration: 0.2, ease: 'power2.in' }, hop + 0.18)
            .fromTo(w.root.scale, { y: () => w.root.scale.x * 0.9 }, { y: () => w.root.scale.x, duration: 0.28, ease: 'back.out(3)' }, hop + 0.38);
        }
        break;
    }
  };

  /* ---------- цвет ---------- */
  let toneTween: gsap.core.Tween | null = null;
  const KEYS = ['face', 'side', 'bg'] as const;
  /** цвета слов: собранные слова плавно, ещё не собранные получат цель при сборке */
  const tone = (p: Palette, dur: number, faces?: string[]) => {
    toneTween?.kill();
    target = { p, faces };
    const ws = words.filter(Boolean);
    const from = ws.map((w) => KEYS.map((k) => [...w.col[k]]));
    const to = ws.map((w) => KEYS.map((k) => (k === 'face' ? rgb(faces?.[words.indexOf(w)] ?? p.accent) : rgb(p[k]))));
    const set = (t: number) => {
      ws.forEach((w, j) => KEYS.forEach((k, n) => { const a = from[j][n], b = to[j][n], c = w.col[k]; c[0] = a[0] + (b[0] - a[0]) * t; c[1] = a[1] + (b[1] - a[1]) * t; c[2] = a[2] + (b[2] - a[2]) * t; }));
      ws.forEach(paintWord);
      dirty = true;
    };
    if (dur <= 0) { set(1); return; }
    const o = { t: 0 };
    toneTween = keep(gsap.to(o, { t: 1, duration: dur, ease: 'power1.inOut', onUpdate: () => set(o.t) })) as gsap.core.Tween;
  };

  /* ---------- сценарии ---------- */
  const enter = (i: number) => {
    const w = build(i);
    const prev = mode === 'solo' && cur >= 0 && cur !== i && words[cur]?.root.visible ? words[cur] : null;
    killAll(); // до нового таймлайна: killAll снимает все таймлайны на учёте
    const tl = T();
    if (prev) exit(prev, tl, 0);
    hideOthers(prev ? [prev] : []);
    mode = 'solo'; cur = i;
    resetLetters(w);
    w.root.position.set(0, soloY, 0);
    w.root.rotation.set(0, 0, 0);
    w.root.scale.setScalar(solo(w));
    shadowOn(w, 0.32);
    // слово показывается в тот же миг, когда начинается его движение: в позе покоя оно не мелькает
    const at = prev ? 0.12 : 0;
    w.root.visible = false;
    tl.set(w.root, { visible: true }, at);
    play(w, tl, at);
    return keep(tl) as gsap.core.Timeline;
  };

  const pile = () => {
    const ws = all();
    const prev = mode === 'solo' && cur >= 0 && words[cur]?.root.visible ? words[cur] : null;
    killAll();
    const tl = T();
    // слово на экране уходит вниз и потом падает в башню сверху, как остальные
    if (prev) exit(prev, tl, 0);
    hideOthers(prev ? [prev] : []);
    mode = 'pile'; cur = -1;
    lean.v = 0;
    const slots = pileNow = pileSlots();
    TOWER.forEach((i, k) => {
      const w = ws[i];
      const p = slots.get(w);
      if (!p) return;
      const at = Math.max(0.18 + k * 0.14, w === prev ? 0.34 : 0);
      tl.call(() => { resetLetters(w); shadowOn(w, k === 0 ? 0.3 : 0); }, [], at)
        .set(w.root, { visible: true }, at)
        .set(w.root.rotation, { x: 0, y: 0, z: p.rz }, at)
        .set(w.root.scale, { x: p.s, y: p.s, z: p.s }, at)
        .fromTo(w.root.position, { x: p.x, y: p.y + H * 0.9, z: 0 }, { y: p.y, duration: 0.38, ease: 'power2.in' }, at)
        .fromTo(w.root.scale, { y: p.s * 0.86 }, { y: p.s, duration: 0.3, ease: 'back.out(3)' }, at + 0.38);
    });
    // башня кренится туда-сюда и замирает с наклоном
    tl.to(lean, { v: 0.06, duration: 0.42, ease: 'sine.inOut', onUpdate: applyLean }, 0.18 + TOWER.length * 0.14 + 0.3)
      .to(lean, { v: -0.045, duration: 0.5, ease: 'sine.inOut', onUpdate: applyLean })
      .to(lean, { v: 0.025, duration: 0.5, ease: 'sine.inOut', onUpdate: applyLean });
    return keep(tl) as gsap.core.Timeline;
  };

  const stack = (how: 'gather' | 'drop' | 'snap') => {
    const ws = all();
    killAll();
    const { slots, bottom } = stackSlots();
    const tl = stackTl = T();
    const fromPile = mode === 'pile';
    mode = 'stack'; cur = -1;
    // снизу вверх: нижнее слово встаёт первым
    [...ws].reverse().forEach((w, k) => {
      const p = slots.get(w)!;
      resetLetters(w);
      shadowOn(w, bottom.includes(w) ? 0.28 : 0);
      if (how === 'snap') { w.root.visible = true; w.root.position.set(p.x, p.y, 0); w.root.rotation.set(0, 0, 0); w.root.scale.setScalar(p.s); return; }
      const at = k * (how === 'drop' ? 0.07 : 0.05);
      if (how === 'drop') {
        w.root.visible = true;
        w.root.position.set(p.x, p.y + H * 0.7, 0);
        w.root.rotation.set(-0.3, 0, (k % 2 ? 1 : -1) * 0.08);
        w.root.scale.setScalar(p.s);
      } else if (!w.root.visible) {
        // слово, которого не было на экране, вырастает на своём месте (не летит сквозь шапку)
        w.root.visible = true;
        w.root.position.set(p.x, p.y, -H * 0.6);
        w.root.rotation.set(-0.8, 0, 0);
        w.root.scale.setScalar(p.s * 0.6);
      }
      const dur = how === 'drop' ? 0.62 : 0.6;
      tl.to(w.root.position, { x: p.x, y: p.y, z: 0, duration: dur, ease: how === 'drop' ? 'back.out(1.25)' : 'expo.out' }, at)
        .to(w.root.rotation, { x: 0, y: 0, z: 0, duration: dur, ease: 'expo.out' }, at)
        .to(w.root.scale, { x: p.s, y: p.s, z: p.s, duration: dur, ease: 'expo.out' }, at);
    });
    if (how !== 'snap') {
      // «щелчок»: стопка садится
      const end = ws.length * 0.06 + (fromPile ? 0.45 : 0.5);
      ws.forEach((w) => { const p = slots.get(w)!; tl.fromTo(w.root.scale, { y: p.s * 0.94 }, { y: p.s, duration: 0.35, ease: 'back.out(2.5)', immediateRender: false }, end); });
    }
    dirty = true;
    return keep(tl) as gsap.core.Timeline;
  };

  // действие в покое: пока стопка собирается или это слово ещё играет, новое не начинается
  // (иначе относительные сдвиги «+=» накладывались бы и сбивали буквы с мест)
  let stackTl: gsap.core.Timeline | null = null;
  const acts = new Map<Word, gsap.core.Timeline>();
  const act = (i: number) => {
    if (mode !== 'stack' || stackTl?.isActive()) return;
    const w = words[i];
    if (!w || acts.get(w)?.isActive()) return;
    const tl = T();
    acts.set(w, tl);
    play(w, tl, 0, true);
    keep(tl);
  };

  const origin = () => {
    // середина холста в позе покоя: туда встаёт одиночное слово и центр стопки
    scene.updateMatrixWorld();
    const v = new Vector3().setFromMatrixPosition(pose.matrixWorld).project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  };

  let alive = true;
  return {
    layout,
    start() { if (running || !alive) return; running = true; dirty = true; last = 0; samples.length = 0; gsap.ticker.add(render); },
    stop() { if (!running) return; running = false; gsap.ticker.remove(render); },
    enter, pile, stack, tone, act, origin,
    pointer(nx, ny, on) { tilt.ty = on ? nx * 0.22 : 0; tilt.tx = on ? ny * 0.12 : 0; },
    aim(px) { aimPx = px; placeSolo(); },
    draw() { dirty = true; renderer.render(scene, camera); },
    hide() { killAll(); words.forEach((w) => { if (w) w.root.visible = false; }); mode = 'none'; cur = -1; dirty = true; },
    dispose() {
      alive = false;
      gsap.ticker.remove(render);
      document.removeEventListener('visibilitychange', onVis);
      killAll();
      words.forEach((w) => { w?.mat.dispose(); (w?.shadow.material as Material | undefined)?.dispose(); w?.shadow.geometry.dispose(); });
      geos.forEach((g) => g.geo.dispose());
      renderer.dispose();
    },
  };
}
