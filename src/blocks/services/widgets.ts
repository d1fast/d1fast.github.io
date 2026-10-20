import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

gsap.registerPlugin(DrawSVGPlugin);

/**
 * Живые штуки в экранчике окна диалога, по одной на пункт меню. Играет только показанная:
 * play() запускает её с начала, stop() останавливает и возвращает в исходное состояние.
 * DOM-штуки рисуются на «сцене» 360×170 и масштабируются целиком (--k на трубке экрана),
 * 3D рисуется в canvas низкого разрешения с крупными пикселями на весь экран.
 *
 * Камера. В каждой сцене работает «оператор»: кадр наезжает на то, что сейчас происходит,
 * переходит к следующему месту и в конце отъезжает на общий план. Общий план вписывает содержимое
 * сцены в экранчик с одним и тем же отступом от рамки (--scr-pad), поэтому все сцены стоят ровно.
 * Сила наезда зависит от того, насколько мелко сцена видна: на телефоне мелкий текст сцены
 * вырастает до 13–20 px, на большом экране камера лишь чуть подаётся к месту действия. В DOM
 * камера двигает слой трансформом без 3D-слоёв (браузер заново рисует текст и пиксели в новом
 * масштабе, без мыла), в canvas меняется сама проекция при рисовании.
 */
export interface View { w: number; h: number; res: number; k: number; pad: number }
export interface Widget {
  dwell: number;
  play(): void;
  stop(): void;
  resize?(v: View): void;
  spin?(): void;
  point?(nx: number, ny: number, touch?: boolean): void;
}
export interface WidgetUI {
  bot: string; online: string; typing: string; msg: string; ask: string; pick: string; slots: string[]; done: string;
  nav: string[]; kpi: string[]; dec: string; sales: string; week: string; toast: string; st: string[]; names: string[];
  tasks: string; todo: string[]; add: string;
  promo: string; spin: string; code: string; copy: string; copied: string;
}

// те же цвета, что в services.css (--s0, --s1, --s2, --pk) и в теме блока
const C = { s0: '#2B0614', s1: '#4B0B23', s2: '#7A1E45', fg: '#C6DBA2', ac: '#EAF5D6', pk: '#F06A93', dim: '#716654', pkDim: '#84334D', pkMid: '#C8476F', fgDark: '#8E9C74', plum: '#A63E6E' };

type Box = [number, number, number, number];
const FULL: Box = [0, 0, 360, 170];
function el(parent: HTMLElement, cls: string, box?: Box, text?: string): HTMLElement {
  const e = document.createElement('div');
  e.className = cls;
  if (box) Object.assign(e.style, { left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px' });
  if (text != null) e.textContent = text;
  parent.appendChild(e);
  return e;
}
function at(e: HTMLElement, x: number, y: number) { e.style.left = x + 'px'; e.style.top = y + 'px'; return e; }
/** строка пиксельным шрифтом: размер в единицах сцены */
function tx(parent: HTMLElement, x: number, y: number, text: string, size = 8, color?: string) {
  const e = at(el(parent, 'svc-t', undefined, text), x, y);
  e.style.fontSize = size + 'px';
  if (color) e.style.color = color;
  return e;
}

/** Пиксельный спрайт в SVG: каждая буква строки = цвет из палитры, точка = пусто. */
function sprite(rows: string[], pal: Record<string, string>, scale = 1, cls = ''): string {
  const w = Math.max(...rows.map((r) => r.length));
  const paths: Record<string, string> = {};
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length;) {
      const c = r[x];
      if (!pal[c]) { x++; continue; }
      let e = x;
      while (e < r.length && r[e] === c) e++;
      paths[c] = (paths[c] || '') + `M${x} ${y}h${e - x}v1h${x - e}z`;
      x = e;
    }
  });
  return `<svg class="${cls}" viewBox="0 0 ${w} ${rows.length}" width="${w * scale}" height="${rows.length * scale}" shape-rendering="crispEdges" aria-hidden="true">${Object.entries(paths).map(([c, d]) => `<path d="${d}" fill="${pal[c]}"/>`).join('')}</svg>`;
}
function pic(parent: HTMLElement, rows: string[], pal: Record<string, string>, x: number, y: number, scale = 1) {
  const e = el(parent, 'svc-pic0', [x, y, Math.max(...rows.map((r) => r.length)) * scale, rows.length * scale]);
  e.innerHTML = sprite(rows, pal, scale);
  return e;
}

const ARROW = ['o.......', 'oo......', 'owo.....', 'owwo....', 'owwwo...', 'owwwwo..', 'owwwwwo.', 'owwwwwwo', 'owwwoooo', 'owoowo..', 'oo..owo.', '....owo.', '.....oo.'];
const MOUNT = ['.....x..................', '....xxx.........x.......', '...xxxxx.......xxx......', '..xxxxxxx.....xxxxx.....', '.xxxxxxxxx...xxxxxxx....', 'xxxxxxxxxxx.xxxxxxxxx...', 'xxxxxxxxxxxxxxxxxxxxxx..', 'xxxxxxxxxxxxxxxxxxxxxxxx'];
const SUN = ['.xxxx.', 'xxxxxx', 'xxxxxx', 'xxxxxx', 'xxxxxx', '.xxxx.'];
const CHECK = ['......x', '.....xx', 'x...xx.', 'xx.xx..', '.xxx...', '..x....'];
const UP = ['..x..', '.xxx.', 'xxxxx'];
const BELL = ['...x...', '..xxx..', '.xxxxx.', '.xxxxx.', 'xxxxxxx', '.......', '...x...'];
const SEND = ['x....', 'xxx..', 'xxxxx', 'xxx..', 'x....'];
const CLOUD = ['....xxxx....', '..xxxxxxxx..', '.xxxxxxxxxx.', 'xxxxxxxxxxxx', 'xxxxxxxxxxxx', '.xxxxxxxxxx.'];

function cursor(parent: HTMLElement, x: number, y: number) {
  const c = el(parent, 'svc-cur');
  c.innerHTML = sprite(ARROW, { o: C.s0, w: C.ac });
  return at(c, x, y);
}

// мигание выделения: 0,1,0,1…
const blink = (n: number) => (p: number) => (p >= 1 ? 1 : Math.floor(p * n) % 2);
const S = (n: number) => `steps(${n})`;
const TAU = Math.PI * 2;

/* ---------- камера ---------- */
/** Масштаб общего плана, css-px на единицу сцены: прямоугольник b вписан в видимую часть экранчика
 *  (под «каналами») с отступом pad со всех сторон. */
const fitS = (v: View, b: Box) => Math.min((v.w - 2 * v.pad) / b[2], (v.h - v.res - 2 * v.pad) / b[3]);
/** Предел наезда. Маленький экранчик (уже 400 px, то есть телефон): до 2 px на единицу сцены, строка
 *  в 8 единиц вырастает до 16 px. Широкий (от 520 px, компьютер): камера только на 12 % подаётся
 *  к месту действия, общий план остаётся. Между ними предел меняется плавно. */
const capS = (s0: number, w: number) => {
  const near = Math.max(s0 * 1.12, Math.min(2, s0 * 3));
  const f = Math.min(1, Math.max(0, (w - 400) / 120));
  return near + (s0 * 1.12 - near) * f;
};

class Cam {
  // кадр: центр и логарифм размеров прямоугольника сцены, который надо показать
  s = { x: 180, y: 85, lw: Math.log(360), lh: Math.log(170) };
  v: View = { w: 0, h: 0, res: 0, k: 0, pad: 0 };
  private last = '';
  /** b: содержимое сцены, оно же общий план */
  constructor(private layer: HTMLElement, readonly b: Box = FULL) {}
  at(r: Box) { return { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, lw: Math.log(r[2]), lh: Math.log(r[3]) }; }
  /** твин камеры на кадр r: плавный переезд с разгоном и торможением */
  go(r: Box, duration = 0.8, ease = 'power2.inOut'): gsap.TweenVars { return { ...this.at(r), duration, ease }; }
  /** твин на общий план */
  home(duration = 0.9): gsap.TweenVars { return this.go(this.b, duration); }
  set(r: Box = this.b) { Object.assign(this.s, this.at(r)); this.apply(); }
  view(v: View) { this.v = v; this.apply(); }
  /** самый крупный масштаб, до которого доедет камера (для разрешения canvas) */
  get smax() { return this.v.w ? capS(fitS(this.v, this.b), this.v.w) : 2; }
  apply = () => {
    const { w: W, h, res, k: K, pad } = this.v;
    const H = h - res;
    if (!W || !K || H <= 2 * pad) return;
    // кадр вписан в видимую часть с тем же отступом, что и общий план; не мельче общего плана и не крупнее предела
    const s0 = fitS(this.v, this.b);
    let s = Math.min((W - 2 * pad) / Math.exp(this.s.lw), (H - 2 * pad) / Math.exp(this.s.lh));
    s = Math.min(capS(s0, W), Math.max(s0, s));
    // центр кадра не уводит камеру дальше содержимого с отступом
    const [bx, by, bw, bh] = this.b, m = pad / s;
    const c = (p: number, span: number, a: number, len: number) => (span >= len ? a + len / 2 : Math.min(a + len - span / 2, Math.max(a + span / 2, p)));
    const cx = c(this.s.x, W / s, bx - m, bw + 2 * m), cy = c(this.s.y, H / s, by - m, bh + 2 * m);
    // слой лежит в сцене 360×170, которую CSS уже увеличил в K раз вокруг центра
    const z = s / K;
    const t = `translate(${(180 - z * cx).toFixed(2)}px,${(85 - z * cy).toFixed(2)}px) scale(${z.toFixed(4)})`;
    if (t !== this.last) { this.last = t; this.layer.style.transform = t; }
  };
}

function stage(root: HTMLElement, bounds?: Box) {
  const st = el(root, 'svc-st');
  const layer = el(st, 'svc-cam');
  const all = el(layer, 'svc-all');
  return { all, cam: new Cam(layer, bounds) };
}

/** Таймлайн сцены: по кругу, камера обновляется на каждом кадре. */
function scene(cam: Cam, repeatDelay = 0.25) {
  return gsap.timeline({ paused: true, repeat: -1, repeatDelay, onUpdate: cam.apply })
    .set(cam.s, cam.at(cam.b), 0);
}
/** Обёртка для штук на таймлайне GSAP: таймлайн строится при первом показе. */
function timed(dwell: number, cam: Cam, build: () => gsap.core.Timeline): Widget {
  let tl: gsap.core.Timeline | undefined;
  return {
    dwell,
    play() { cam.set(); (tl ??= build()).restart(); },
    stop() { tl?.pause(0); cam.set(); },
    resize(v) { cam.view(v); },
  };
}
/** волна от нажатия: рамка по форме кнопки расходится и гаснет */
function ring(parent: HTMLElement, b: Box, pad = 6) {
  const r = el(parent, 'svc-ring', [b[0] - pad, b[1] - pad, b[2] + pad * 2, b[3] + pad * 2]);
  return { r, from: { scaleX: b[2] / (b[2] + pad * 2), scaleY: b[3] / (b[3] + pad * 2), opacity: 1 } };
}
/** несколько надписей на одном месте, видна одна */
function swap(tl: gsap.core.Timeline, els: HTMLElement[], i: number, t: number) {
  tl.set(els, { opacity: (k: number) => (k === i ? 1 : 0) }, t);
}

/* ---------- 1. Сайты: окно браузера, страница собирается, курсор жмёт кнопку и листает ---------- */
function sites(root: HTMLElement): Widget {
  const { all, cam } = stage(root, [48, 4, 264, 162]);
  const win = el(all, 'svc-win', [48, 4, 264, 162]);
  const bar = el(win, 'svc-bar', [0, 0, 260, 14]);
  const lights = [5, 13, 21].map((x) => el(bar, 'svc-sq', [x, 4, 6, 6]));
  el(bar, 'svc-sq', [34, 4, 150, 6]).style.opacity = '.55';
  const view = el(win, 'svc-view', [0, 14, 260, 144]);
  const page = el(view, '', [0, 0, 250, 300]);
  const thumb = el(view, 'svc-dim', [253, 3, 4, 64]);
  const nav = [el(page, 'svc-ac', [8, 6, 14, 6]), ...[172, 194, 216].map((x) => el(page, 'svc-dim', [x, 7, 16, 3]))];
  const hero = el(page, 'svc-s2', [8, 18, 234, 70]);
  const hl = [el(hero, 'svc-ac', [10, 12, 104, 8]), el(hero, 'svc-ac', [10, 24, 76, 8])];
  const sub = [el(hero, 'svc-dim', [10, 38, 92, 3]), el(hero, 'svc-dim', [10, 44, 70, 3])];
  const cta = el(hero, 'svc-pk', [10, 54, 36, 10]);
  const pic1 = el(hero, 'svc-pic', [148, 8, 78, 54]);
  const sun = el(pic1, '', [56, 6, 12, 12]); sun.innerHTML = sprite(SUN, { x: C.pk }, 2);
  const mnt = el(pic1, '', [3, 30, 72, 24]); mnt.innerHTML = sprite(MOUNT, { x: C.fg }, 3);
  const lines = [[98, 226], [105, 196], [112, 140]].map(([y, w]) => el(page, 'svc-dim', [8, y, w, 3]));
  const cards = [8, 89, 170].map((x) => {
    const c = el(page, 'svc-card', [x, 124, 72, 56]);
    el(c, 'svc-s2', [4, 4, 64, 28]); el(c, 'svc-dim', [4, 38, 48, 3]); el(c, 'svc-dim2', [4, 45, 34, 3]);
    return c;
  });
  const s2 = [el(page, 'svc-ac', [8, 196, 120, 8]), ...[[212, 220], [219, 180], [226, 200]].map(([y, w]) => el(page, 'svc-dim', [8, y, w, 3]))];
  const big = el(page, 'svc-s2', [8, 238, 234, 50]);
  const bigM = el(big, '', [8, 18, 96, 32]); bigM.innerHTML = sprite(MOUNT, { x: C.fg }, 4);
  const bigS = el(big, '', [196, 8, 18, 18]); bigS.innerHTML = sprite(SUN, { x: C.ac }, 3);
  el(page, 'svc-dim2', [8, 294, 234, 4]);
  const cur = cursor(all, 330, 180);
  // кадры: первый экран, кнопка, всё окно, галерея после прокрутки
  const HERO: Box = [52, 24, 246, 92], CTA: Box = [56, 64, 120, 52], WIN: Box = [46, 2, 268, 166], BIG: Box = [52, 94, 250, 72];
  return timed(6.5, cam, () => scene(cam)
    .set(all, { opacity: 1 }, 0)
    .fromTo(win, { scaleY: 0.08, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0)
    .fromTo(lights, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: S(1), stagger: 0.06 }, 0.2)
    .fromTo(nav, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.16, ease: S(2), stagger: 0.04 }, 0.3)
    .fromTo(hero, { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 0%', duration: 0.3, ease: S(5) }, 0.4)
    .to(cam.s, cam.go(HERO), 0.45)
    .fromTo(hl, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: 0.3, ease: S(6), stagger: 0.12 }, 0.7)
    .fromTo(sub, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: 0.24, ease: S(5), stagger: 0.08 }, 0.95)
    .fromTo(cta, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 1.1)
    .fromTo(pic1, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: S(6) }, 0.8)
    .fromTo(sun, { y: 14 }, { y: 0, duration: 0.5, ease: S(6) }, 1.05)
    .fromTo(lines, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: 0.3, ease: S(8), stagger: 0.1 }, 1.25)
    .fromTo(cards, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: S(3), stagger: 0.1 }, 1.45)
    // курсор подходит к кнопке первого экрана и жмёт её, камера смотрит на кнопку
    .to(cam.s, cam.go(CTA, 0.75), 1.75)
    .fromTo(cur, { x: 0, y: 0, opacity: 0 }, { x: -244, y: -83, opacity: 1, duration: 0.7, ease: 'power2.inOut' }, 1.9)
    .to(cur, { scale: 0.8, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 2.65)
    .to(cta, { backgroundColor: C.ac, duration: 0.08, ease: S(1), yoyo: true, repeat: 1, repeatDelay: 0.12 }, 2.67)
    // отъезд на всё окно, страница прокручивается вниз
    .to(cam.s, cam.go(WIN), 2.9)
    .to(cur, { x: -150, y: -70, duration: 0.4, ease: 'power2.inOut' }, 3.0)
    .fromTo([page, thumb], { y: 0 }, { y: (i) => (i === 0 ? -156 : 72), duration: 1.0, ease: 'power2.inOut' }, 3.35)
    .fromTo(s2, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: 0.3, ease: S(8), stagger: 0.08 }, 3.7)
    // галерея внизу страницы
    .to(cam.s, cam.go(BIG, 0.75), 3.95)
    .fromTo(big, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: S(8) }, 3.9)
    .to(cur, { x: -160, y: -40, duration: 0.4, ease: 'power2.inOut' }, 4.4)
    .to(cur, { scale: 0.8, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 4.85)
    .fromTo([bigM, bigS], { y: 0 }, { y: -4, duration: 0.16, ease: S(2), yoyo: true, repeat: 1, stagger: 0.06 }, 4.9)
    // общий план, страница возвращается наверх
    .to(cam.s, cam.home(), 5.15)
    .to([page, thumb], { y: 0, duration: 0.6, ease: 'power2.inOut' }, 5.15)
    .to(cur, { x: 40, y: 30, opacity: 0, duration: 0.5, ease: 'power2.in' }, 5.15)
    .to(all, { opacity: 0, duration: 0.24, ease: S(3) }, 6.05));
}

/* ---------- 2. Веб-приложения: панель с меню, цифрами, графиком, таблицей и уведомлением ---------- */
function dash(root: HTMLElement, ui: WidgetUI): Widget {
  const { all, cam } = stage(root, [8, 4, 344, 162]);
  const win = el(all, 'svc-win', [8, 4, 344, 162]); // внутри 340×158, начало в (10, 6) сцены
  // боковое меню
  const side = el(win, 'svc-s0', [0, 0, 64, 158]);
  const logo = el(side, 'svc-ac', [8, 9, 10, 10]);
  el(logo, 'svc-s0', [3, 3, 4, 4]);
  const brand = el(side, 'svc-dim', [22, 12, 30, 4]);
  const band = el(side, 'svc-s2', [4, 28, 56, 14]);
  const nav = ui.nav.map((t, i) => { const y = 28 + i * 16; return [el(side, 'svc-dim', [9, y + 4, 6, 6]), tx(side, 19, y + 3, t)]; });
  const me = [el(side, 'svc-dim2', [8, 140, 10, 10]), el(side, 'svc-dim2', [22, 143, 30, 4])];
  // цифры
  const sep = ui.dec;
  const int = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const nums: HTMLElement[] = [], ups: HTMLElement[] = [];
  const kpis = ui.kpi.map((t, i) => {
    const c = el(win, 'svc-s0', [72 + i * 88, 8, 84, 36]);
    tx(c, 6, 5, t);
    const n = el(c, 'svc-arc', [6, 19, 76, 10], '0');
    Object.assign(n.style, { fontSize: '10px', color: C.ac });
    nums.push(n);
    const u = el(c, '', [58, 5, 24, 8]);
    pic(u, UP, { x: C.pk }, 0, 1, 1);
    tx(u, 7, 0, ['12%', '4%', '0,3'][i].replace(',', sep), 8, C.pk);
    ups.push(u);
    return c;
  });
  const kv = { a: 0, b: 0, c: 0 };
  const setK = () => { nums[0].textContent = int(kv.a); nums[1].textContent = int(kv.b); nums[2].textContent = kv.c.toFixed(1).replace('.', sep) + '%'; };
  // график продаж: ступенчатая линия, под ней заливка
  const ch = el(win, 'svc-s0', [72, 50, 172, 58]);
  tx(ch, 6, 5, ui.sales);
  const ys = [30, 28, 29, 24, 25, 21, 22, 18, 19, 15, 16, 12, 13, 9, 10, 6];
  let d = `M0 ${ys[0]}`;
  ys.forEach((v, i) => { if (i) d += `V${v}`; d += `H${(i + 1) * 10}`; });
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (box: Box, paths: [string, Record<string, string>][]) => {
    const w = el(ch, '', box);
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${box[2]} ${box[3]}`); s.setAttribute('width', String(box[2])); s.setAttribute('height', String(box[3])); s.setAttribute('shape-rendering', 'crispEdges');
    const out = paths.map(([pd, at]) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', pd); Object.entries(at).forEach(([k, v]) => p.setAttribute(k, v)); s.appendChild(p); return p; });
    w.appendChild(s);
    return { w, out };
  };
  const areaW = mk([6, 17, 160, 36], [[d + 'V35H0Z', { fill: C.s2 }], ['M0 35H160', { stroke: C.dim, 'stroke-width': '2', fill: 'none' }]]);
  const line = mk([6, 17, 160, 36], [[d, { stroke: C.ac, 'stroke-width': '2', fill: 'none' }]]).out[0];
  const dot = el(ch, 'svc-pk', [6 + 160 - 3, 17 + 6 - 3, 6, 6]);
  // неделя: столбики
  const wk = el(win, 'svc-s0', [248, 50, 84, 58]);
  tx(wk, 6, 5, ui.week);
  const wb = [14, 20, 17, 26, 22, 30, 34].map((h, i) => el(wk, i === 6 ? 'svc-ac' : 'svc-fg', [6 + i * 11, 52 - h, 7, h]));
  // таблица заказов
  const table = el(win, 'svc-tbl', [72, 114, 260, 38]);
  const rws = el(table, '', [0, 0, 260, 50]);
  const pills = ['svc-pk', 'svc-ac', 'svc-fg'];
  const row = (y: number, n: number, name: string, sum: string, st: number, time: string) => {
    const r = el(rws, '', [0, y, 260, 12]);
    tx(r, 6, 2, '#' + n, 8, C.fgDark);
    tx(r, 34, 2, name);
    tx(r, 64, 2, sum, 8, C.ac);
    const p = el(r, 'svc-pill ' + pills[st], [96, 2, 46, 9], ui.st[st]);
    tx(r, 232, 2, time, 8, C.fgDark);
    return { r, p };
  };
  const old = [row(1, 1041, ui.names[1], '1 900', 1, '13:47'), row(13, 1040, ui.names[2], '3 250', 2, '12:15'), row(25, 1039, ui.names[3], '990', 1, '11:02')];
  const fresh = row(1, 1042, ui.names[0], '2 400', 0, '14:05');
  const paid = el(fresh.r, 'svc-pill svc-ac', [96, 2, 46, 9], ui.st[1]);
  // уведомление
  const toast = el(win, 'svc-toast', [212, 6, 120, 22]);
  const bell = pic(toast, BELL, { x: C.pk }, 5, 5);
  tx(toast, 16, 2, ui.toast, 8, C.ac);
  tx(toast, 16, 10, `#1042 · 2 400`);
  // кадры (координаты сцены = координаты окна + (10, 6))
  const SIDE: Box = [6, 28, 76, 74], KPI: Box = [78, 8, 184, 48], CHART: Box = [78, 52, 180, 66], TOAST: Box = [214, 4, 138, 42], TABLE: Box = [78, 114, 172, 50];
  return timed(8.7, cam, () => scene(cam)
    .set(all, { opacity: 1 }, 0)
    .set(kv, { a: 0, b: 0, c: 0, onComplete: setK }, 0)
    .fromTo(win, { scaleX: 0.06, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0)
    .fromTo([logo, brand, ...nav.flat(), ...me], { opacity: 0 }, { opacity: 1, duration: 0.08, ease: S(1), stagger: 0.03 }, 0.2)
    .fromTo([...kpis, ch, wk, table], { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.2, ease: S(3), stagger: 0.06 }, 0.3)
    .fromTo(ups, { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0)
    .fromTo(areaW.w, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 100% 0% 0%)', duration: 0.01 }, 0)
    .fromTo(dot, { scale: 0 }, { scale: 0, duration: 0.01 }, 0)
    .fromTo(wb, { scaleY: 0 }, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.01 }, 0)
    .fromTo(toast, { x: 140 }, { x: 140, duration: 0.01 }, 0)
    .fromTo(fresh.r, { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0)
    .fromTo(paid, { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0)
    // 1. меню: выделение съезжает на первый пункт
    .to(cam.s, cam.go(SIDE), 0.55)
    .fromTo(band, { y: 48 }, { y: 0, duration: 0.6, ease: 'power3.inOut' }, 0.95)
    .fromTo(nav[0][0], { backgroundColor: C.dim }, { backgroundColor: C.ac, duration: 0.05, ease: S(1) }, 1.5)
    .fromTo(nav[0][1], { color: C.fg }, { color: C.ac, duration: 0.05, ease: S(1) }, 1.5)
    // 2. цифры бегут
    .to(cam.s, cam.go(KPI), 1.8)
    .to(kv, { a: 84250, b: 1284, c: 3.8, duration: 1.1, ease: 'power2.out', onUpdate: setK }, 2.0)
    .fromTo(ups, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.2, ease: S(2), stagger: 0.1 }, 2.95)
    // 3. график рисуется, столбики растут
    .to(cam.s, cam.go(CHART), 3.25)
    .to(areaW.w, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.0, ease: 'none' }, 3.5)
    .fromTo(line, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.0, ease: 'none' }, 3.5)
    .to(dot, { scale: 1, duration: 0.2, ease: 'back.out(3)' }, 4.5)
    .fromTo(dot, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: blink(6), immediateRender: false }, 4.7)
    .to(wb, { scaleY: 1, duration: 0.35, ease: S(6), stagger: 0.06 }, 3.55)
    // 4. приходит заказ
    .to(toast, { x: 0, duration: 0.4, ease: 'power3.out' }, 4.75)
    .to(cam.s, cam.go(TOAST), 4.65)
    .fromTo(bell, { x: 0 }, { x: -1, duration: 0.07, ease: S(1), yoyo: true, repeat: 5 }, 5.15)
    // 5. он появляется в таблице и оплачивается
    .to(cam.s, cam.go(TABLE), 5.6)
    .fromTo(old.map((o) => o.r), { y: 0 }, { y: 12, duration: 0.4, ease: 'power2.inOut' }, 5.9)
    .fromTo(fresh.r, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 6.05)
    .to(toast, { x: 140, duration: 0.3, ease: 'power2.in' }, 6.2)
    .to(paid, { opacity: 1, duration: 0.36, ease: blink(5) }, 6.7)
    .to(fresh.p, { opacity: 0, duration: 0.01 }, 7.06)
    // 6. общий план, цифры дописываются
    .to(cam.s, cam.home(), 7.0)
    .to(kv, { a: 86650, b: 1285, duration: 0.6, ease: 'power2.out', onUpdate: setK }, 7.4)
    .to(all, { opacity: 0, duration: 0.24, ease: S(3) }, 8.35));
}

/* ---------- 3. Приложения: одно приложение на ноутбуке и телефоне, правка на одном видна на другом ---------- */
function devices(root: HTMLElement, ui: WidgetUI): Widget {
  const { all, cam } = stage(root, [2, 4, 344, 162]);
  const items = [...ui.todo, ui.add];
  type Row = { box: HTMLElement; tick: HTMLElement; lab: HTMLElement; line: HTMLElement; all: HTMLElement[] };
  const row = (p: HTMLElement, x: number, y: number, t: string): Row => {
    const box = el(p, 'svc-box', [x, y + 2, 10, 10]);
    const tick = pic(box, CHECK, { x: C.ac }, 1, 0);
    const lab = tx(p, x + 16, y + 3, t);
    const line = el(p, 'svc-ac', [x + 14, y + 6, t.length * 5 + 2, 1]);
    return { box, tick, lab, line, all: [box, lab, line] };
  };
  // ноутбук
  const lap = el(all, 'svc-win', [12, 10, 196, 124]); // внутри 192×120, начало в (14, 12)
  const deck = el(all, 'svc-fg', [2, 134, 216, 6]);
  el(deck, 'svc-s2', [90, 0, 36, 2]);
  const foot = el(all, 'svc-dim', [8, 140, 204, 2]);
  const lbar = el(lap, 'svc-s0', [0, 0, 192, 14]);
  tx(lbar, 8, 3, ui.tasks);
  const lcnt = ['1/3', '2/3', '2/4'].map((s) => tx(lbar, 168, 3, s, 8, C.ac));
  const lside = el(lap, 'svc-s0', [0, 14, 40, 106]);
  [[6, 8, 24, 'svc-ac'], [6, 18, 18, 'svc-dim'], [6, 28, 26, 'svc-dim']].forEach(([x, y, w, c]) => el(lside, c as string, [x as number, y as number, w as number, 3]));
  const lr = items.map((t, i) => row(lap, 48, 18 + i * 18, t));
  const input = el(lap, 'svc-field', [48, 96, 138, 18]);
  const plus = tx(input, 5, 3, '+', 8, C.fgDark);
  const typed = el(input, 'svc-t svc-typed', [14, 3, 120, 10]);
  const tb = document.createElement('b'); const caret = document.createElement('i'); caret.className = 'svc-caret';
  typed.append(tb, caret);
  const ty = { n: 0 };
  // телефон
  const ph = el(all, 'svc-phone', [258, 4, 88, 162]); // внутри 82×156, начало в (261, 7)
  el(ph, 'svc-fg', [33, 3, 16, 3]);
  const phEls = [tx(ph, 6, 12, ui.tasks), el(ph, 'svc-dim2', [6, 23, 70, 1])];
  const pcnt = ['1/3', '2/3', '2/4'].map((s) => tx(ph, 62, 12, s, 8, C.ac));
  const pr = items.map((t, i) => row(ph, 6, 28 + i * 20, t));
  el(ph, 'svc-dim', [29, 148, 24, 2]);
  // облако синхронизации и путь между устройствами
  const cloud = pic(all, CLOUD, { x: C.fg }, 220, 8, 2);
  const pathW = el(all, '', [0, 0, 360, 170]);
  pathW.innerHTML = `<svg viewBox="0 0 360 170" width="360" height="170" shape-rendering="crispEdges"><path d="M256 64L240 24M224 24L210 58" stroke="${C.dim}" stroke-width="2" stroke-dasharray="2 3" fill="none"/></svg>`;
  const pack = el(all, 'svc-ac', [254, 62, 5, 5]);
  const P = { x: 0, y: 0 }, Cl = { x: 232 - 256, y: 20 - 64 }, L = { x: 208 - 256, y: 60 - 64 };
  const tap = ring(ph, [6, 50, 10, 10], 5);
  // кадры
  const PHONE: Box = [252, 28, 98, 70], SYNC: Box = [192, 0, 96, 78], LAP: Box = [56, 24, 124, 72], INPUT: Box = [56, 66, 152, 66], PHONE2: Box = [252, 52, 98, 72];
  const travel = (tl: gsap.core.Timeline, back: boolean, t: number) => {
    const a = back ? L : P, b = back ? P : L;
    tl.fromTo(pack, { x: a.x, y: a.y, opacity: 1 }, { x: Cl.x, y: Cl.y, duration: 0.4, ease: 'power1.in', immediateRender: false }, t)
      .to(cloud, { opacity: 0.4, duration: 0.2, ease: blink(2), yoyo: true, repeat: 1 }, t + 0.32)
      .to(pack, { x: b.x, y: b.y, duration: 0.4, ease: 'power1.out' }, t + 0.4)
      .to(pack, { opacity: 0, duration: 0.05 }, t + 0.8);
  };
  const check = (tl: gsap.core.Timeline, r: Row, t: number) => tl
    .fromTo(r.tick, { scale: 0 }, { scale: 1, duration: 0.16, ease: 'back.out(3)', immediateRender: false }, t)
    .fromTo(r.line, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: 0.24, ease: 'power2.out', immediateRender: false }, t + 0.08)
    .to(r.lab, { color: C.fgDark, duration: 0.05 }, t + 0.1);
  return timed(8.2, cam, () => {
    const tl = scene(cam)
      .set(all, { opacity: 1 }, 0)
      .set(pack, { opacity: 0 }, 0)
      .set([lr[1].tick, pr[1].tick], { scale: 0 }, 0)
      .set([lr[1].line, pr[1].line], { scaleX: 0 }, 0)
      .set([lr[1].lab, pr[1].lab, lr[3].lab, pr[3].lab], { color: C.fg }, 0)
      .set([lr[0].lab, pr[0].lab], { color: C.fgDark }, 0)
      .set([lr[2].tick, pr[2].tick, lr[3].tick, pr[3].tick], { scale: 0 }, 0)
      .set([lr[2].line, pr[2].line, lr[3].line, pr[3].line], { scaleX: 0 }, 0)
      .set([...lr[3].all, ...pr[3].all], { opacity: 0 }, 0)
      .set(tb, { textContent: '' }, 0)
      .set(plus, { opacity: 1 }, 0)
      .set(tap.r, { opacity: 0 }, 0);
    swap(tl, lcnt, 0, 0); swap(tl, pcnt, 0, 0);
    tl.fromTo(lap, { scaleY: 0.08, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0)
      .fromTo([deck, foot], { opacity: 0 }, { opacity: 1, duration: 0.1, ease: S(1) }, 0.1)
      .fromTo(ph, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' }, 0.12)
      .fromTo([...lr.slice(0, 3).flatMap((r) => [r.box, r.lab]), ...pr.slice(0, 3).flatMap((r) => [r.box, r.lab]), input, ...phEls], { opacity: 0 }, { opacity: 1, duration: 0.08, ease: S(1), stagger: 0.03 }, 0.4)
      .fromTo([lr[0].line, pr[0].line], { opacity: 0 }, { opacity: 1, duration: 0.05 }, 0.85)
      .fromTo([cloud, pathW], { opacity: 0 }, { opacity: 1, duration: 0.2, ease: S(2) }, 0.7)
      // 1. на телефоне отмечают задачу
      .to(cam.s, cam.go(PHONE), 1.0)
      .fromTo(tap.r, tap.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.42, ease: S(5), immediateRender: false }, 1.85);
    check(tl, pr[1], 1.85);
    swap(tl, pcnt, 1, 2.0);
    // 2. правка улетает через облако на ноутбук
    tl.to(cam.s, cam.go(SYNC, 0.6), 2.15);
    travel(tl, false, 2.2);
    tl.to(cam.s, cam.go(LAP, 0.7), 2.75);
    check(tl, lr[1], 3.05);
    swap(tl, lcnt, 1, 3.15);
    // 3. на ноутбуке пишут новую задачу
    tl.to(cam.s, cam.go(INPUT, 0.7), 3.65)
      .to(plus, { opacity: 0, duration: 0.05 }, 3.95)
      .fromTo(ty, { n: 0 }, { n: ui.add.length, duration: 0.5, ease: S(ui.add.length), immediateRender: false, onUpdate: () => { tb.textContent = ui.add.slice(0, Math.round(ty.n)); } }, 4.0)
      .set(tb, { textContent: '' }, 4.7)
      .set(plus, { opacity: 1 }, 4.7)
      .fromTo([lr[3].box, lr[3].lab], { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out', immediateRender: false }, 4.7);
    swap(tl, lcnt, 2, 4.8);
    // 4. и она появляется на телефоне
    tl.to(cam.s, cam.go(SYNC, 0.6), 4.85);
    travel(tl, true, 4.9);
    tl.to(cam.s, cam.go(PHONE2, 0.7), 5.45)
      .fromTo([pr[3].box, pr[3].lab], { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, 5.75);
    swap(tl, pcnt, 2, 5.85);
    // общий план
    tl.to(cam.s, cam.home(), 6.6)
      .to(all, { opacity: 0, duration: 0.24, ease: S(3) }, 7.85);
    return tl;
  });
}

/* ---------- 4. Telegram-бот: пишут «хочу записаться», бот предлагает время, выбирают, запись готова ---------- */
function bots(root: HTMLElement, ui: WidgetUI): Widget {
  const { all, cam } = stage(root, [76, 3, 208, 164]);
  const win = el(all, 'svc-win', [76, 3, 208, 164]); // внутри 204×160, начало в (78, 5)
  // лента сообщений под шапкой: едет вверх, когда приходит новое
  const feed = el(win, 'svc-feed', [0, 26, 204, 108]);
  const col = el(feed, '', [0, 0, 204, 140]);
  const me = el(col, 'svc-bub svc-bub--me', undefined, ui.ask);
  Object.assign(me.style, { right: '8px', top: '6px' });
  const typing = el(col, 'svc-bub svc-bub--bot', [8, 36, 40, 24]);
  const dots = [8, 17, 26].map((x) => el(typing, 'svc-dot', [x, 10, 4, 4]));
  const bot1 = at(el(col, 'svc-bub svc-bub--bot', undefined, ui.pick), 8, 36);
  const keys = ui.slots.map((t, i) => el(col, 'svc-key', [8 + i * 64, 66, 60, 22], t));
  const bot2 = at(el(col, 'svc-bub svc-bub--bot', undefined, ui.done), 8, 94);
  bot2.insertAdjacentHTML('beforeend', sprite(CHECK, { x: C.pk }, 1, 'svc-check'));
  const wave = ring(col, [136, 66, 60, 22], 8);
  // шапка
  const head = el(win, 'svc-head', [0, 0, 204, 26]);
  const ava = el(head, 'svc-ac', [7, 6, 14, 14]);
  el(ava, 'svc-s0', [3, 4, 2, 3]); el(ava, 'svc-s0', [9, 4, 2, 3]); el(ava, 'svc-s0', [4, 9, 6, 2]);
  tx(head, 28, 3, ui.bot, 12, C.ac);
  const st1 = tx(head, 28, 16, ui.online, 8, C.fg);
  const st2 = tx(head, 28, 16, ui.typing, 8, C.pk);
  // поле ввода
  const bar = el(win, 'svc-s0', [0, 134, 204, 26]);
  const field = el(bar, 'svc-field', [6, 4, 162, 18]);
  const ph = tx(field, 6, 3, ui.msg, 10, C.fgDark);
  const typed = el(field, 'svc-t svc-typed', [5, 1, 150, 14]);
  typed.style.fontSize = '12px';
  const tb = document.createElement('b'); const caret = document.createElement('i'); caret.className = 'svc-caret';
  typed.append(tb, caret);
  const ty = { n: 0 };
  const send = el(bar, 'svc-send', [174, 4, 24, 18]);
  pic(send, SEND, { x: C.s0 }, 7, 4, 2);
  const cur = cursor(all, 320, 186);
  // кнопка «18:30» в координатах сцены: окно 78, 5; лента +26; центр кнопки 166, 77
  const tx0 = 78 + 166 - 320, ty0 = 5 + 26 + 77 - 186;
  const INPUT: Box = [80, 128, 172, 40], ME: Box = [150, 28, 132, 50], REPLY: Box = [80, 60, 204, 66], KEY: Box = [196, 84, 92, 48], DONE: Box = [80, 86, 204, 46];
  return timed(7.4, cam, () => scene(cam)
    .set(all, { opacity: 1 }, 0)
    .set(col, { y: 0 }, 0)
    .set(tb, { textContent: '' }, 0)
    .set(ph, { opacity: 1 }, 0)
    .set([st2, wave.r], { opacity: 0 }, 0)
    .set(st1, { opacity: 1 }, 0)
    .fromTo(win, { scaleY: 0.08, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0)
    .fromTo([me, typing, bot1, ...keys, bot2], { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0)
    // 1. в поле печатается сообщение
    .to(cam.s, cam.go(INPUT), 0.3)
    .to(ph, { opacity: 0, duration: 0.05 }, 0.6)
    .fromTo(ty, { n: 0 }, { n: ui.ask.length, duration: 0.85, ease: S(ui.ask.length), immediateRender: false, onUpdate: () => { tb.textContent = ui.ask.slice(0, Math.round(ty.n)); } }, 0.62)
    .to(send, { scale: 0.86, duration: 0.07, ease: S(1), yoyo: true, repeat: 1 }, 1.6)
    // 2. отправили: пузырь вверху, камера за ним
    .set(tb, { textContent: '' }, 1.72)
    .set(ph, { opacity: 1 }, 1.72)
    .fromTo(me, { scale: 0.4, opacity: 0, transformOrigin: '100% 100%' }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.4)', immediateRender: false }, 1.72)
    .to(cam.s, cam.go(ME, 0.7), 1.68)
    // 3. бот печатает и отвечает кнопками со временем
    .to(st1, { opacity: 0, duration: 0.01 }, 2.35)
    .to(st2, { opacity: 1, duration: 0.01 }, 2.35)
    .fromTo(typing, { scale: 0.4, opacity: 0, transformOrigin: '0% 100%' }, { scale: 1, opacity: 1, duration: 0.24, ease: 'back.out(2.4)', immediateRender: false }, 2.4)
    .fromTo(dots, { y: 0 }, { y: -3, duration: 0.14, ease: S(1), stagger: { each: 0.1, repeat: 3, yoyo: true } }, 2.55)
    .to(cam.s, cam.go(REPLY), 2.45)
    .to(typing, { opacity: 0, duration: 0.05, ease: S(1) }, 3.25)
    .to(st2, { opacity: 0, duration: 0.01 }, 3.25)
    .to(st1, { opacity: 1, duration: 0.01 }, 3.25)
    .fromTo(bot1, { scale: 0.4, opacity: 0, transformOrigin: '0% 100%' }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.4)', immediateRender: false }, 3.25)
    .fromTo(keys, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: S(3), stagger: 0.1, immediateRender: false }, 3.45)
    // 4. выбирают 18:30
    .fromTo(cur, { x: 0, y: 0, opacity: 0 }, { x: tx0, y: ty0, opacity: 1, duration: 0.6, ease: 'power2.inOut' }, 3.75)
    .to(cam.s, cam.go(KEY, 0.7), 3.85)
    .to(cur, { scale: 0.78, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 4.4)
    .fromTo(keys[2], { backgroundColor: 'rgba(0,0,0,0)', color: C.fg }, { backgroundColor: C.ac, color: C.s0, duration: 0.05, ease: S(1) }, 4.42)
    .fromTo(wave.r, wave.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.42, ease: S(5), immediateRender: false }, 4.42)
    .to(cur, { x: tx0 + 60, y: ty0 + 70, opacity: 0, duration: 0.6, ease: 'power2.in' }, 4.7)
    // 5. лента сдвигается, бот подтверждает запись
    .to(col, { y: -30, duration: 0.5, ease: 'power2.inOut' }, 4.85)
    .to(cam.s, cam.go(DONE, 0.7), 4.9)
    .fromTo(bot2, { scale: 0.4, opacity: 0, transformOrigin: '0% 100%' }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.4)', immediateRender: false }, 5.15)
    // общий план
    .to(cam.s, cam.home(), 6.05)
    .to(all, { opacity: 0, duration: 0.24, ease: S(3) }, 7.05));
}

/* ---------- canvas с крупными пикселями ---------- */
const rgba = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
const P = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, rgba(v)])) as Record<keyof typeof C, number>;

class Pix {
  cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w = 0; h = 0; img!: ImageData; buf!: Uint32Array;
  rows: (H: number) => number;
  constructor(parent: HTMLElement, rows: (H: number) => number) {
    this.rows = rows;
    this.cv = document.createElement('canvas');
    this.cv.className = 'svc-cv';
    this.cv.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d')!;
  }
  /** ширина в пикселях подстраивается под пропорции экрана, высота постоянная */
  fit() {
    const p = this.cv.parentElement!;
    const W = p.offsetWidth, H = p.offsetHeight;
    if (!W || !H) return;
    const h = Math.round(this.rows(H));
    const w = Math.max(80, Math.round((h * W) / H));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.cv.width = w; this.cv.height = h;
    this.img = this.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }
  clear(c: number) { this.buf.fill(c); }
  px(x: number, y: number, c: number) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.buf[y * this.w + x] = c; }
  rect(x: number, y: number, w: number, h: number, c: number) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) this.buf.fill(c, yy * this.w + x0, yy * this.w + Math.max(x0, x1));
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    // отрезок обрезается по краям буфера (Лианга-Барски): при наезде концы уходят далеко за экран
    const dx0 = x1 - x0, dy0 = y1 - y0;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx0, x0 + 1], [dx0, this.w - x0], [-dy0, y0 + 1], [dy0, this.h - y0]]) {
      if (p === 0) { if (q < 0) return; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return; if (r > t0) t0 = r; } else { if (r < t0) return; if (r < t1) t1 = r; }
    }
    [x0, y0, x1, y1] = [x0 + t0 * dx0, y0 + t0 * dy0, x0 + t1 * dx0, y0 + t1 * dy0];
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, n = 0;
    for (;;) {
      this.px(x0, y0, c);
      if ((x0 === x1 && y0 === y1) || ++n > 2000) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** выпуклый многоугольник построчно; цвет строки задаёт функция (для «перекраски» снизу вверх) */
  poly(pts: number[][], col: (y: number) => number) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const ya = Math.max(0, Math.ceil(y0 - 0.5)), yb = Math.min(this.h - 1, Math.floor(y1 - 0.5));
    for (let y = ya; y <= yb; y++) {
      const sy = y + 0.5;
      let xl = Infinity, xr = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          const x = a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
          if (x < xl) xl = x;
          if (x > xr) xr = x;
        }
      }
      const x0 = Math.max(0, Math.round(xl)), x1 = Math.min(this.w, Math.round(xr));
      if (x1 > x0) this.buf.fill(col(y), y * this.w + x0, y * this.w + x1);
    }
  }
  sprite(rows: string[], x: number, y: number, pal: Record<string, number>, s = 1) {
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const c = pal[rows[j][i]]; if (c) this.rect(x + i * s, y + j * s, s, s, c); }
  }
  flush() { if (this.w) this.ctx.putImageData(this.img, 0, 0); }
}

function loop(tick: (dt: number, t: number) => void) {
  let raf = 0, last = 0;
  const f = (t: number) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; tick(dt, t / 1000); raf = requestAnimationFrame(f); };
  return {
    start() { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(f); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}

/* ---------- 5. 3D: витрина-конфигуратор. Предмет крутится над сеточным полом, справа палитра
   и формы; курсор выбирает цвет (предмет перекрашивается снизу вверх) и форму (куб тянется в пирамиду) ---------- */
// материалы: светлая, средняя и тёмная грань, рёбра, рамка на гранях
const MATS = [
  [P.pk, P.pkMid, P.pkDim, P.ac],
  [P.ac, P.fg, P.fgDark, P.s1],
  [P.plum, P.s2, P.s1, P.pk],
];
const SW = [P.pk, P.fg, P.plum];
const I_CUBE = ['xxxxx', 'x...x', 'x...x', 'x...x', 'xxxxx'];
const I_PYR = ['..x..', '.x.x.', '.x.x.', 'x...x', 'xxxxx'];

function cube(root: HTMLElement): Widget {
  // пиксель около 3 css-px на ПК и около 2 на телефоне
  const pc = new Pix(root, (H) => Math.min(130, Math.max(64, H / (H > 260 ? 3.2 : 2.2))));
  const V0: number[][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V0.push([x, y, z]);
  // грани обходом по периметру; у пирамиды верхние 4 вершины стянуты в одну
  const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const TOP = new Set([0, 1, 4, 5]);
  const L = (() => { const v = [-0.45, -0.8, -0.4]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
  let ay = 0.6, tx = 0, ty = 0, cx = 0, cy = 0, spin = 0, phase = 0, time = 0, K = 1, Wc = 360;
  // состояние, которым управляет таймлайн: камера, перекраска, форма, нажатие
  const st = { u: 0.5, v: 0.5, q: 0, wipe: 0, morph: 0, tap: 0, sel: 0, ui: 0 };
  let mat = 0, next = 1, shape = 0, shapeTo = 1, tapAt = 0;
  const draw = (dt: number) => {
    time += dt; phase = (phase + dt * 1.1) % 1;
    spin *= Math.exp(-2.2 * dt);
    ay += dt * (0.75 + spin);
    cx += (tx - cx) * Math.min(1, dt * 4); cy += (ty - cy) * Math.min(1, dt * 4);
    const W = pc.w, H = pc.h; if (!W) return;
    // камера: наезд и центр кадра, кадр не выходит за края мира
    const z = 1 + st.q * (Math.min(2.2, capS(K, Wc) / K) - 1);
    const hw = W / 2 / z, hh = H / 2 / z;
    const ox = Math.min(W - hw, Math.max(hw, st.u * W)), oy = Math.min(H - hh, Math.max(hh, st.v * H));
    const X = (x: number) => (x - ox) * z + W / 2, Y = (y: number) => (y - oy) * z + H / 2;
    const f = H * 0.95, hor = Math.round(H * 0.47), zObj = 4.6, floorY = 1.75;
    const mx = W * 0.44;
    pc.clear(P.s0);
    // солнце на горизонте, полосами
    const sr = H * 0.2, sxc = W * 0.7;
    const r = sr * z;
    for (let y = -Math.round(r); y <= 0; y++) {
      const half = Math.sqrt(r * r - y * y);
      const yy = Math.round(Y(hor)) + y;
      if (y > -r * 0.55 && (y + 40) % 3 === 0) continue;
      pc.rect(X(sxc) - half, yy, half * 2 + 1, 1, y < -r * 0.5 ? P.pk : P.pkDim);
    }
    // пол: линии бегут к зрителю; у горизонта сплошная дымка, чтобы дальние линии не рябили
    const sy = (zz: number) => hor + (floorY * f) / zz;
    const fog = Math.max(3, Math.round(H * 0.07));
    const zFar = (floorY * f) / fog;
    for (let k = 0; k < 9; k++) {
      const zz = 2.2 + (k + 1 - phase) * 1.5;
      if (zz < zFar) pc.rect(0, Y(sy(zz)), W, 1, zz < 6 ? P.pk : P.pkDim);
    }
    for (let x = -14; x <= 14; x += 2) pc.line(X(mx + (x * f) / 2.2), Y(sy(2.2)), X(mx + (x * f) / zFar), Y(hor + fog), P.pkDim);
    pc.rect(0, Y(hor), W, fog * z, P.s1);
    pc.rect(0, Y(hor), W, 1, P.pkDim);
    // подиум: тень и кольцо
    const shy = sy(zObj), shw = (f * 1.25) / zObj;
    for (let j = -3; j <= 3; j++) { const w = shw * Math.sqrt(1 - (j * j) / 16) * z; pc.rect(X(mx) - w, Y(shy) + j * z, w * 2, Math.max(1, z), j === -3 || j === 3 ? P.s2 : P.s1); }
    // предмет: вершины куба, верх тянется в вершину пирамиды
    const m = shape + (shapeTo - shape) * st.morph;
    const V = V0.map((v, i) => (TOP.has(i) ? [v[0] * (1 - m), -1 - 0.25 * m, v[2] * (1 - m)] : v));
    const ry = ay + cx, rx = 0.42 + Math.sin(time * 0.7) * 0.08 + cy;
    const cyc = Math.cos(ry), syn = Math.sin(ry), cxc = Math.cos(rx), sxn = Math.sin(rx);
    const bob = Math.sin(time * 1.6) * 0.08 - 0.35, s = 0.95;
    const view = V.map((v) => {
      const x1 = v[0] * s * cyc + v[2] * s * syn, z1 = -v[0] * s * syn + v[2] * s * cyc;
      const y1 = v[1] * s * cxc - z1 * sxn, z2 = v[1] * s * sxn + z1 * cxc;
      return [x1, y1 + bob, zObj + z2];
    });
    const scr = view.map((p) => [X(mx + (p[0] * f) / p[2]), Y(hor - H * 0.05 + (p[1] * f) / p[2])]);
    let top = Infinity, bot = -Infinity;
    for (const p of scr) { if (p[1] < top) top = p[1]; if (p[1] > bot) bot = p[1]; }
    const wy = bot - (bot - top + 2) * st.wipe;
    const A = MATS[mat], B = MATS[next];
    const cen = view.reduce((a, p) => [a[0] + p[0] / 8, a[1] + p[1] / 8, a[2] + p[2] / 8], [0, 0, 0]);
    const lerp = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const edges: number[][][] = [];
    for (const fc of F) {
      const q = fc.map((i) => view[i]);
      const fcen = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
      // нормаль по диагоналям: работает и для вырожденной грани пирамиды
      const d1 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]], d2 = [q[3][0] - q[1][0], q[3][1] - q[1][1], q[3][2] - q[1][2]];
      let n = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
      const nl = Math.hypot(n[0], n[1], n[2]);
      if (nl < 1e-4) continue;
      n = n.map((a) => a / nl);
      if (n[0] * (fcen[0] - cen[0]) + n[1] * (fcen[1] - cen[1]) + n[2] * (fcen[2] - cen[2]) < 0) n = n.map((a) => -a);
      if (n[0] * fcen[0] + n[1] * fcen[1] + n[2] * fcen[2] >= 0) continue; // грань смотрит от камеры
      const b = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
      const sh = b > 0.5 ? 0 : b > 0 ? 1 : 2;
      const pts = fc.map((i) => scr[i]);
      pc.poly(pts, (y) => (y >= wy ? B : A)[sh]);
      // рамка на грани: внутренний четырёхугольник на тон темнее
      const inn = [[0.22, 0.22], [0.78, 0.22], [0.78, 0.78], [0.22, 0.78]].map(([u, v]) => lerp(lerp(pts[0], pts[1], u), lerp(pts[3], pts[2], u), v));
      const area = Math.abs((pts[2][0] - pts[0][0]) * (pts[3][1] - pts[1][1]) - (pts[3][0] - pts[1][0]) * (pts[2][1] - pts[0][1])) / 2;
      if (area > 40) pc.poly(inn, (y) => (y >= wy ? B : A)[Math.min(2, sh + 1)]);
      edges.push(pts);
    }
    for (const pts of edges) for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      pc.line(a[0], a[1], b[0], b[1], (Math.max(a[1], b[1]) >= wy ? B : A)[3]);
    }
    // луч перекраски
    if (st.wipe > 0 && st.wipe < 1) {
      let l = Infinity, rr = -Infinity;
      for (const p of scr) { if (p[0] < l) l = p[0]; if (p[0] > rr) rr = p[0]; }
      pc.rect(l - 3 * z, wy, rr - l + 6 * z, 1, P.ac);
    }
    // палитра справа: три цвета и две формы, выбранное в рамке
    const pz = Math.max(1, Math.round(z));
    const px0 = W - 13, py0 = Math.round(H * 0.2);
    const slots = [0, 1, 2, 3.6, 4.6].map((k) => py0 + Math.round(k * 9));
    pc.rect(X(px0 - 3), Y(py0 - 4), 14 * z, (slots[4] + 11 - py0 + 4) * z, P.s1);
    slots.forEach((yy, k) => {
      const xx = X(px0), y0 = Y(yy);
      if (k < 3) pc.rect(xx, y0, 6 * z, 6 * z, SW[k]);
      else pc.sprite(k === 3 ? I_CUBE : I_PYR, xx + 0.5 * z, y0 + 0.5 * z, { x: P.fg }, z);
    });
    const selC = st.sel, selS = 3 + (st.ui ? 1 : 0);
    for (const k of [selC, selS]) {
      const xx = X(px0 - 2), y0 = Y(slots[k] - 2), w = 10 * z;
      pc.rect(xx, y0, w, pz, P.ac); pc.rect(xx, y0 + w - pz, w, pz, P.ac); pc.rect(xx, y0, pz, w, P.ac); pc.rect(xx + w - pz, y0, pz, w, P.ac);
    }
    // нажатие: квадрат расходится от выбранной ячейки
    if (st.tap > 0 && st.tap < 1) {
      const e = (2 + st.tap * 6) * z, xx = X(px0 + 3), y0 = Y(slots[tapAt] + 3);
      const c = st.tap < 0.5 ? P.ac : P.fg;
      pc.rect(xx - e, y0 - e, e * 2, pz, c); pc.rect(xx - e, y0 + e, e * 2 + pz, pz, c); pc.rect(xx - e, y0 - e, pz, e * 2, c); pc.rect(xx + e, y0 - e, pz, e * 2, c);
    }
    pc.flush();
  };
  const lp = loop((dt) => draw(dt));
  // кадры: общий, палитра, предмет
  const shot = (u: number, v: number, q: number, d = 0.8) => ({ u, v, q, duration: d, ease: 'power2.inOut' });
  const PANEL = () => shot((pc.w - 8) / Math.max(1, pc.w), 0.42, 1, 0.75);
  const OBJ = () => shot(0.44, 0.36, 0.45);
  let tl: gsap.core.Timeline | undefined;
  const press = (k: number) => { tapAt = k; };
  const build = () => {
    const t = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.1 })
      .set(st, { u: 0.5, v: 0.5, q: 0, wipe: 0, morph: 0, tap: 0 }, 0)
      // цвет
      .to(st, PANEL(), 0.7)
      .call(() => { next = (mat + 1) % 3; press(next); }, [], 1.45)
      .fromTo(st, { tap: 0 }, { tap: 1, duration: 0.4, ease: 'none', immediateRender: false }, 1.45)
      .call(() => { st.sel = next; }, [], 1.5)
      .to(st, OBJ(), 1.75)
      .fromTo(st, { wipe: 0 }, { wipe: 1, duration: 0.8, ease: 'power1.inOut', immediateRender: false }, 2.15)
      .call(() => { mat = next; st.wipe = 0; }, [], 2.96)
      // форма
      .to(st, PANEL(), 3.4)
      .call(() => { shapeTo = 1 - shape; press(3 + shapeTo); }, [], 4.1)
      .fromTo(st, { tap: 0 }, { tap: 1, duration: 0.4, ease: 'none', immediateRender: false }, 4.1)
      .call(() => { st.ui = shapeTo; }, [], 4.15)
      .to(st, OBJ(), 4.4)
      .fromTo(st, { morph: 0 }, { morph: 1, duration: 0.9, ease: 'back.inOut(1.6)', immediateRender: false }, 4.85)
      .call(() => { shape = shapeTo; st.morph = 0; }, [], 5.76)
      // общий план
      .to(st, shot(0.5, 0.5, 0, 0.9), 6.0);
    return t;
  };
  return {
    dwell: 7.4,
    play() {
      pc.fit(); time = 0; spin = 1.6;
      mat = 0; next = 1; shape = 0; shapeTo = 1; Object.assign(st, { sel: 0, ui: 0 });
      (tl ??= build()).invalidate().restart();
      lp.start();
    },
    stop() { lp.stop(); tl?.pause(0); tx = ty = cx = cy = 0; },
    resize(v) { K = v.k; Wc = v.w; pc.fit(); },
    point(nx, ny, touch) { tx = (nx - 0.5) * 1.3; ty = (ny - 0.5) * 0.9; if (touch) spin += 3; },
  };
}

/* ---------- 6. Игры для акций: всплывающее окно на сайте с колесом скидок. Курсор жмёт «Крутить»,
   колесо останавливается на скидке, выпадает промокод, его копируют. Тап по экрану крутит колесо самому ---------- */
// цифры 3×5 для подписей на колесе
const F35: Record<string, string[]> = {
  '0': ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'], '1': ['.x.', 'xx.', '.x.', '.x.', 'xxx'], '2': ['xxx', '..x', 'xxx', 'x..', 'xxx'],
  '3': ['xxx', '..x', '.xx', '..x', 'xxx'], '5': ['xxx', 'x..', 'xxx', '..x', 'xxx'], '%': ['x.x', '..x', '.x.', 'x..', 'x.x'],
};
const LAB = ['10', '25', '5', '30', '15', '20'];
const PTR = ['ooooooo', 'opppppo', '.opppo.', '.opppo.', '..opo..', '..opo..', '...o...'];
const SEC = TAU / 6;

function promo(root: HTMLElement, ui: WidgetUI): Widget {
  const { all, cam } = stage(root, [24, 4, 312, 162]);
  const win = el(all, 'svc-win', [24, 4, 312, 162]); // внутри 308×158, начало в (26, 6)
  const bar = el(win, 'svc-bar', [0, 0, 308, 14]);
  [5, 13, 21].forEach((x) => el(bar, 'svc-sq', [x, 4, 6, 6]));
  el(bar, 'svc-sq', [34, 4, 150, 6]).style.opacity = '.55';
  // колесо: 64×64 логических пикселя на 128×128 единиц сцены. Пиксели колеса рисуются заново на
  // каждом кадре и переносятся в canvas своего экранного размера ближайшим соседом, без размытия
  const wc = document.createElement('canvas');
  wc.className = 'svc-wheel';
  Object.assign(wc.style, { left: '12px', top: '18px', width: '128px', height: '128px' });
  win.appendChild(wc);
  const wctx = wc.getContext('2d')!;
  const off = document.createElement('canvas');
  off.width = off.height = 64;
  const octx = off.getContext('2d')!;
  const img = octx.createImageData(64, 64);
  const buf = new Uint32Array(img.data.buffer);
  const wh = { a: 0, flash: 0, win: 4 };
  const draw = () => {
    const on = Math.floor(performance.now() / 250) % 2;
    const lit = wh.flash > 0 && wh.flash < 1 && Math.floor(wh.flash * 6) % 2 === 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const dx = x + 0.5 - 32, dy = y + 0.5 - 32, r = Math.hypot(dx, dy);
      let c = 0;
      if (r < 31.6) {
        let ph = (Math.atan2(dx, -dy) - wh.a) % TAU;
        if (ph < 0) ph += TAU;
        if (r >= 27.6) {
          // обод с лампочками
          c = P.s1;
          if (r >= 28.4 && r < 30.9) { const j = Math.round(ph / (TAU / 12)); if (Math.abs(ph - (j * TAU) / 12) * r < 1.3) c = (j + on) % 2 ? P.ac : P.pk; }
        } else if (r < 4.6) c = r < 2.6 ? P.ac : P.s1;
        else {
          const i = Math.floor(ph / SEC) % 6;
          const rel = ph - (i + 0.5) * SEC;
          const hot = lit && i === wh.win;
          c = Math.abs(Math.abs(rel) - SEC / 2) * r < 0.6 ? P.s1 : hot ? P.s0 : i % 2 ? P.ac : P.pk;
          // подпись поперёк радиуса: у сектора под стрелкой читается прямо
          const s = LAB[i] + '%', tw = s.length * 4 - 1;
          const gx = Math.floor(r * Math.sin(rel) + tw / 2), gy = Math.floor(24.5 - r * Math.cos(rel));
          if (gx >= 0 && gx < tw && gy >= 0 && gy < 5 && gx % 4 < 3 && F35[s[gx >> 2]][gy][gx % 4] === 'x') c = hot ? P.ac : P.s0;
        }
      }
      buf[y * 64 + x] = c;
    }
    // стрелка сверху вздрагивает, когда мимо идёт лампочка
    const kick = (wh.a / (TAU / 12)) % 1 < 0.3 && spinning ? 1 : 0;
    for (let j = 0; j < PTR.length; j++) for (let i = 0; i < 7; i++) {
      const ch = PTR[j][i];
      if (ch !== '.') buf[j * 64 + 28 + i - kick] = ch === 'o' ? P.s0 : P.pk;
    }
    octx.putImageData(img, 0, 0);
    wctx.clearRect(0, 0, wc.width, wc.height);
    wctx.drawImage(off, 0, 0, wc.width, wc.height);
  };
  let spinning = false;
  // панель справа
  const title = tx(win, 154, 26, ui.promo, 16, C.ac);
  const sub = [el(win, 'svc-dim', [154, 50, 124, 3]), el(win, 'svc-dim', [154, 57, 92, 3])];
  const btn = el(win, 'svc-btn', [154, 74, 96, 26], ui.spin);
  // карточка с промокодом
  const card = el(win, 'svc-prize', [150, 20, 150, 112]);
  tx(card, 10, 9, ui.code, 10, C.fg);
  const big = el(card, 'svc-arc', [10, 26, 130, 24], '−15%');
  Object.assign(big.style, { fontSize: '24px', color: C.pk });
  const codeBox = el(card, 'svc-code', [10, 58, 128, 26]);
  const code = el(codeBox, 'svc-t svc-code__t', [0, 0, 124, 22], 'SALE15');
  code.style.fontSize = '16px';
  const copyA = tx(card, 10, 92, ui.copy, 10, C.fg);
  const copyB = tx(card, 10, 92, ui.copied, 10, C.ac);
  copyB.insertAdjacentHTML('beforeend', sprite(CHECK, { x: C.ac }, 1, 'svc-check'));
  const cur = cursor(all, 330, 186);
  const setPrize = (i: number) => { wh.win = i; big.textContent = `−${LAB[i]}%`; code.textContent = `SALE${LAB[i]}`; };
  const target = (from: number, i: number, turns: number) => { const t = -(i + 0.5) * SEC; return from + turns * TAU + ((((t - from) % TAU) + TAU) % TAU); };
  // кадры (сцена = окно + (26, 6))
  const BTN: Box = [172, 26, 150, 88], WHEEL: Box = [34, 20, 136, 136], PTRB: Box = [72, 18, 60, 46], CARD: Box = [168, 22, 166, 62], CODE: Box = [172, 80, 158, 64];
  // кнопка «Крутить»: центр 154+48, 74+13 в окне
  const bx = 26 + 202 - 330, by = 6 + 87 - 186, cpx = 26 + 150 + 40 - 330, cpy = 6 + 20 + 97 - 186;
  const intro = [win, wc, title, ...sub, btn];
  const onTick = () => { cam.apply(); draw(); };
  let auto: gsap.core.Timeline | undefined, user: gsap.core.Timeline | undefined;
  const buildAuto = () => gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.25, onUpdate: onTick })
    .set(cam.s, cam.at(cam.b), 0)
    .set(all, { opacity: 1 }, 0)
    .set(wh, { a: 0, flash: 0 }, 0)
    .set(card, { opacity: 0 }, 0)
    .set(code, { clipPath: 'inset(0% 100% 0% 0%)' }, 0)
    .set(copyB, { opacity: 0 }, 0)
    .set(copyA, { opacity: 1 }, 0)
    .fromTo(win, { scaleY: 0.08, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0)
    .fromTo(wc, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, 0.25)
    .fromTo([title, ...sub, btn], { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.16, ease: S(2), stagger: 0.07 }, 0.35)
    // 1. курсор жмёт «Крутить»
    .to(cam.s, cam.go(BTN, 0.7), 0.9)
    .fromTo(cur, { x: 0, y: 0, opacity: 0 }, { x: bx, y: by, opacity: 1, duration: 0.6, ease: 'power2.inOut' }, 1.0)
    .to(cur, { scale: 0.8, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 1.62)
    .fromTo(btn, { y: 0 }, { y: 2, duration: 0.08, ease: S(1), yoyo: true, repeat: 1, immediateRender: false }, 1.64)
    // 2. колесо крутится и тормозит, камера смотрит на стрелку
    .to(cam.s, cam.go(WHEEL), 1.8)
    .to(cur, { x: bx + 40, y: by + 60, opacity: 0, duration: 0.5, ease: 'power2.in' }, 1.9)
    .call(() => { spinning = true; }, [], 1.85)
    .fromTo(wh, { a: 0 }, { a: target(0, 4, 4), duration: 2.8, ease: 'power3.out', immediateRender: false }, 1.85)
    .call(() => { spinning = false; }, [], 4.6)
    .to(cam.s, cam.go(PTRB), 3.7)
    .fromTo(wh, { flash: 0 }, { flash: 1, duration: 0.6, ease: 'none', immediateRender: false }, 4.6)
    // 3. выпадает промокод
    .to(cam.s, cam.go(CARD), 5.0)
    .fromTo(card, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, 5.15)
    // 4. камера опускается к коду, он проявляется, его копируют
    .to(cam.s, cam.go(CODE, 0.6), 5.8)
    .fromTo(code, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: S(6), immediateRender: false }, 5.9)
    .fromTo(cur, { x: cpx + 30, y: cpy + 50, opacity: 0 }, { x: cpx, y: cpy, opacity: 1, duration: 0.5, ease: 'power2.out', immediateRender: false }, 5.95)
    .to(cur, { scale: 0.8, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 6.5)
    .set(copyA, { opacity: 0 }, 6.55)
    .fromTo(copyB, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: blink(4), immediateRender: false }, 6.55)
    .to(cur, { x: cpx + 40, y: cpy + 60, opacity: 0, duration: 0.5, ease: 'power2.in' }, 6.8)
    // общий план
    .to(cam.s, cam.home(), 6.9)
    .to(all, { opacity: 0, duration: 0.24, ease: S(3) }, 7.85);
  const reset = () => {
    user?.kill(); user = undefined; spinning = false;
    setPrize(4);
    gsap.set(cur, { opacity: 0, scale: 1 });
  };
  return {
    dwell: 8.3,
    play() { reset(); cam.set(); (auto ??= buildAuto()).restart(); },
    stop() { reset(); auto?.pause(0); wh.a = 0; cam.set(); },
    resize(v) {
      cam.view(v);
      // размер canvas = экранный размер колеса при самом сильном наезде, кратный 64
      const s = Math.max(2, Math.min(14, Math.ceil((128 * cam.smax * (window.devicePixelRatio || 1)) / 64)));
      if (wc.width !== 64 * s) { wc.width = wc.height = 64 * s; wctx.imageSmoothingEnabled = false; }
      draw();
    },
    // человек сам крутит колесо: от текущего кадра, без скачков
    spin() {
      if (spinning) return;
      auto?.pause();
      user?.kill();
      const i = Math.floor(Math.random() * 6);
      setPrize(i);
      wh.a %= TAU;
      spinning = true;
      user = gsap.timeline({ onUpdate: onTick })
        .set(all, { opacity: 1 }, 0)
        .set(intro, { opacity: 1, scale: 1, scaleY: 1, y: 0 }, 0)
        .set(wh, { flash: 0 }, 0)
        .to(cur, { opacity: 0, duration: 0.15 }, 0)
        .to(card, { opacity: 0, scale: 0.9, duration: 0.15 }, 0)
        .set(copyA, { opacity: 1 }, 0.15)
        .set(copyB, { opacity: 0 }, 0.15)
        .to(btn, { y: 2, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 0)
        .to(cam.s, cam.go(WHEEL, 0.7), 0.05)
        .to(wh, { a: target(wh.a, i, 4), duration: 2.6, ease: 'power3.out' }, 0.1)
        .call(() => { spinning = false; }, [], 2.7)
        .to(cam.s, cam.go(PTRB), 1.95)
        .to(wh, { flash: 1, duration: 0.6, ease: 'none' }, 2.75)
        .to(cam.s, cam.go(CARD), 3.2)
        .fromTo(card, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, 3.35)
        .to(cam.s, cam.go(CODE, 0.6), 4.0)
        .fromTo(code, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: S(6) }, 4.15)
        .to(cam.s, cam.home(), 5.2);
    },
  };
}

export function buildWidgets(slots: HTMLElement[], ui: WidgetUI): Widget[] {
  const map: Record<string, (r: HTMLElement) => Widget> = {
    sites, dash: (r) => dash(r, ui), devices: (r) => devices(r, ui), bots: (r) => bots(r, ui), cube, promo: (r) => promo(r, ui),
  };
  return slots.map((s) => map[s.dataset.svcW || '']?.(s) ?? { dwell: 4, play() {}, stop() {} });
}
