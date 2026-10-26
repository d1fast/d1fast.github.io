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
  brand: string; links: string[]; siteTitle: string[]; siteSub: string; order: string; sent: string; popular: string; goods: string[]; prices: string[];
  bot: string; online: string; typing: string; msg: string; ask: string; pick: string; slots: string[]; done: string;
  nav: string[]; kpi: string[]; dec: string; sales: string; week: string; toast: string; payIn: string; st: string[]; names: string[];
  pushT: string; pushL: string; min: string; courier: string; call: string; delivered: string; rate: string; orders: string; way: string; done2: string;
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

function cursor(parent: HTMLElement, x: number, y: number) {
  const c = el(parent, 'svc-cur');
  c.innerHTML = sprite(ARROW, { o: C.s0, w: C.ac });
  return at(c, x, y);
}

const S = (n: number) => `steps(${n})`;
const TAU = Math.PI * 2;

/* ---------- камера ---------- */
/** Масштаб общего плана, css-px на единицу сцены: прямоугольник b вписан в видимую часть экранчика
 *  (под «каналами») с отступом pad со всех сторон. */
const fitS = (v: View, b: Box) => Math.min((v.w - 2 * v.pad) / b[2], (v.h - v.res - 2 * v.pad) / b[3]);
/** Предел наезда. Маленький экранчик (уже 400 px, то есть телефон): до 2,9 px на единицу сцены, строка
 *  в 8 единиц вырастает до 23 px, видно только то, что сейчас происходит. Широкий (от 520 px, компьютер):
 *  камера наезжает в 2,3 раза, место действия занимает почти весь экранчик. Между ними предел меняется плавно. */
const capS = (s0: number, w: number) => {
  const near = Math.max(s0 * 2.3, Math.min(2.9, s0 * 4.2));
  const f = Math.min(1, Math.max(0, (w - 400) / 120));
  return near + (s0 * 2.3 - near) * f;
};

class Cam {
  // кадр: центр и логарифм размеров прямоугольника сцены, который надо показать
  s = { x: 180, y: 85, lw: Math.log(360), lh: Math.log(170) };
  v: View = { w: 0, h: 0, res: 0, k: 0, pad: 0 };
  private last = '';
  private lastF = '';
  private host: HTMLElement | null = null;
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
    // насколько камера наехала: по этому углы экранчика мягко темнеют
    const cap = capS(s0, W);
    const f = cap > s0 * 1.01 ? Math.max(0, Math.min(1, (s - s0) / (cap - s0))).toFixed(2) : '0';
    if (!this.layer.closest('.svc-w.is-shown')) return;
    this.host ??= this.layer.closest<HTMLElement>('[data-services-screen]');
    if (f !== this.lastF) { this.lastF = f; this.host?.style.setProperty('--focus', f); }
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

/* ---------- 1. Сайты: окно браузера, страница собирается. Курсор жмёт подписанную кнопку «Заказать»,
   кнопка проседает, от неё расходится волна и выскакивает «Заявка отправлена». Потом страница листается
   к товарам, курсор жмёт «+» у карточки, точка летит в корзину, на значке корзины появляется «1» ---------- */
const CART = ['x.......', '.xxxxxxx', '.x.....x', '..x...x.', '..xxxxx.', '........', '..x..x..'];
const CUP = ['..x.x...', '.x.x....', '........', 'xxxxxx..', 'x....xxx', 'x....x.x', 'x....xxx', '.xxxx...', 'xxxxxxx.'];
function sites(root: HTMLElement, ui: WidgetUI): Widget {
  const { all, cam } = stage(root, [42, 3, 276, 164]);
  const win = el(all, 'svc-win', [42, 3, 276, 164]); // внутри 272×160, начало в (44, 5)
  const bar = el(win, 'svc-bar', [0, 0, 272, 14]);
  const lights = [5, 13, 21].map((x) => el(bar, 'svc-sq', [x, 4, 6, 6]));
  el(bar, 'svc-sq', [34, 4, 150, 6]).style.opacity = '.55';
  const view = el(win, 'svc-view', [0, 14, 272, 146]);
  // шапка сайта стоит на месте, под ней листается страница
  const navbar = el(view, 'svc-s0', [0, 0, 272, 16]);
  const logo = el(navbar, 'svc-ac', [7, 4, 8, 8]);
  const brand = tx(navbar, 19, 4, ui.brand, 8, C.ac);
  const links = ui.links.map((t, i) => tx(navbar, 132 + i * 46, 4, t, 8, C.fg));
  const cartI = pic(navbar, CART, { x: C.fg }, 240, 4, 1);
  const badge = el(navbar, 'svc-badge', [247, 1, 10, 10], '1');
  const area = el(view, 'svc-view', [0, 16, 272, 130]);
  const page = el(area, '', [0, 0, 272, 250]);
  const thumb = el(area, 'svc-dim', [266, 3, 3, 48]);
  // первый экран сайта: заголовок, подзаголовок, кнопка «Заказать» и картинка
  const hero = el(page, 'svc-s2', [6, 4, 260, 84]);
  const h1 = [tx(hero, 10, 10, ui.siteTitle[0], 12, C.ac), tx(hero, 10, 25, ui.siteTitle[1], 12, C.ac)];
  const sub = tx(hero, 10, 42, ui.siteSub, 8, C.fg);
  const cta = el(hero, 'svc-cta', [10, 56, 62, 16], ui.order);
  const pic1 = el(hero, 'svc-pic', [158, 8, 94, 68]);
  const sun = el(pic1, '', [70, 6, 12, 12]); sun.innerHTML = sprite(SUN, { x: C.pk }, 2);
  const mnt = el(pic1, '', [4, 36, 72, 32]); mnt.innerHTML = sprite(MOUNT, { x: C.fg }, 3);
  // товары
  const secT = tx(page, 8, 96, ui.popular, 10, C.ac);
  const cards = ui.goods.map((g, i) => {
    const c = el(page, 'svc-card', [8 + i * 86, 112, 80, 76]);
    const p = el(c, 'svc-s2', [4, 4, 72, 34]);
    pic(p, CUP, { x: C.fg }, 25, 6, 3);
    tx(c, 5, 44, g, 8, C.ac);
    tx(c, 5, 58, ui.prices[i], 8, C.fg);
    const plus = el(c, 'svc-cta svc-cta--sm', [56, 54, 18, 16], '+');
    return { c, plus };
  });
  el(page, 'svc-dim2', [8, 200, 256, 3]); el(page, 'svc-dim2', [8, 208, 180, 3]);
  // отклик: волна от нажатия, всплывашка «Заявка отправлена», точка летит в корзину
  const wave1 = ring(page, [16, 60, 62, 16], 5);
  const toast = el(all, 'svc-toast', [130, 70, 150, 26]);
  const tick = pic(toast, CHECK, { x: C.ac }, 7, 9, 1);
  tx(toast, 18, 8, ui.sent, 8, C.ac);
  const wave2 = ring(page, [150, 166, 18, 16], 4);
  const fly = el(all, 'svc-pk svc-dot2', [0, 0, 6, 6]);
  const cur = cursor(all, 330, 180);
  // точки сцены: середина «Заказать» (окно 44,5 + вид 14 + шапка 16 = начало страницы 44,35), «+» второй карточки после прокрутки на 100
  const P0 = { x: 44, y: 35 };
  const ctaC = { x: P0.x + 16 + 31, y: P0.y + 60 + 8 };
  const plusC = { x: P0.x + 94 + 56 + 9, y: P0.y + 112 + 54 + 8 - 100 };
  const cartC = { x: 44 + 240 + 4, y: 5 + 14 + 6 };
  const HERO: Box = [46, 34, 268, 92], CTA: Box = [52, 60, 236, 60], CARDS: Box = [46, 40, 268, 92], NAV: Box = [196, 14, 120, 66];
  return timed(7.6, cam, () => scene(cam)
    .set(all, { opacity: 1 }, 0)
    .set([badge, toast, fly], { opacity: 0 }, 0)
    .set([page, thumb], { y: 0 }, 0)
    .set(cta, { y: 0, backgroundColor: C.ac }, 0)
    .fromTo(win, { scaleY: 0.08, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0)
    .fromTo(lights, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: S(1), stagger: 0.06 }, 0.2)
    .fromTo([logo, brand, ...links, cartI], { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.16, ease: S(2), stagger: 0.04 }, 0.28)
    .fromTo(hero, { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 0%', duration: 0.3, ease: S(5) }, 0.36)
    .to(cam.s, cam.go(HERO), 0.4)
    .fromTo(h1, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.32, ease: S(8), stagger: 0.12 }, 0.6)
    .fromTo(sub, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: S(2) }, 0.95)
    .fromTo(cta, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 1.05)
    .fromTo(pic1, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: S(6) }, 0.75)
    .fromTo(sun, { y: 14 }, { y: 0, duration: 0.5, ease: S(6) }, 1.0)
    .fromTo([secT, ...cards.map((c) => c.c)], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.24, ease: S(3), stagger: 0.08 }, 1.2)
    // 1. курсор подходит к «Заказать», кнопка проседает, волна, всплывает «Заявка отправлена»
    .to(cam.s, cam.go(CTA, 0.8), 1.45)
    .fromTo(cur, { x: 0, y: 0, opacity: 0 }, { x: ctaC.x - 330, y: ctaC.y - 180, opacity: 1, duration: 0.75, ease: 'power2.inOut' }, 1.5)
    .to(cur, { scale: 0.8, duration: 0.1, ease: S(1), yoyo: true, repeat: 1 }, 2.3)
    .to(cta, { y: 2, backgroundColor: C.fg, duration: 0.08, ease: S(1) }, 2.32)
    .to(cta, { y: 0, backgroundColor: C.ac, duration: 0.12, ease: S(2) }, 2.52)
    .fromTo(wave1.r, wave1.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.5, ease: S(5), immediateRender: false }, 2.34)
    .fromTo(toast, { opacity: 0, y: 8, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(2.2)', immediateRender: false }, 2.5)
    .fromTo(tick, { scale: 0 }, { scale: 1, duration: 0.25, ease: 'back.out(3)', immediateRender: false }, 2.7)
    .to(toast, { opacity: 0, y: -6, duration: 0.25, ease: 'power2.in' }, 3.55)
    // 2. страница листается к товарам
    .to(cur, { x: plusC.x - 330 + 30, y: plusC.y - 180 + 30, duration: 0.5, ease: 'power2.inOut' }, 3.5)
    .to([page, thumb], { y: (i) => (i === 0 ? -100 : 66), duration: 0.8, ease: 'power2.inOut' }, 3.65)
    .to(cam.s, cam.go(CARDS, 0.8), 3.65)
    // 3. «+» у второй карточки: кнопка проседает, точка летит в корзину, на значке «1»
    .to(cur, { x: plusC.x - 330, y: plusC.y - 180, duration: 0.45, ease: 'power2.inOut' }, 4.45)
    .to(cur, { scale: 0.8, duration: 0.1, ease: S(1), yoyo: true, repeat: 1 }, 4.95)
    .to(cards[1].plus, { y: 2, backgroundColor: C.fg, duration: 0.08, ease: S(1) }, 4.97)
    .to(cards[1].plus, { y: 0, backgroundColor: C.ac, duration: 0.12, ease: S(2) }, 5.15)
    .fromTo(wave2.r, wave2.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.45, ease: S(5), immediateRender: false }, 4.99)
    .fromTo(cards[1].c, { y: 0 }, { y: -3, duration: 0.12, ease: S(2), yoyo: true, repeat: 1, immediateRender: false }, 5.0)
    .to(cam.s, cam.go(NAV, 0.7), 5.05)
    .fromTo(fly, { x: plusC.x - 3, y: plusC.y - 3, opacity: 1 }, { x: cartC.x + 2, y: cartC.y - 2, duration: 0.55, ease: 'power2.in', immediateRender: false }, 5.05)
    .set(fly, { opacity: 0 }, 5.6)
    .fromTo(badge, { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, 5.6)
    .fromTo(cartI, { y: 0 }, { y: -2, duration: 0.1, ease: S(1), yoyo: true, repeat: 1, immediateRender: false }, 5.6)
    // общий план, страница наверх, курсор уходит
    .to(cur, { x: 40, y: 30, opacity: 0, duration: 0.5, ease: 'power2.in' }, 5.9)
    .to(cam.s, cam.home(), 6.15)
    .to([page, thumb], { y: 0, duration: 0.6, ease: 'power2.inOut' }, 6.2)
    .to(all, { opacity: 0, duration: 0.24, ease: S(3) }, 7.25));
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
  const paidTick = pic(fresh.r, CHECK, { x: C.ac }, 146, 2, 1);
  // уведомления: новый заказ, потом оплата (на одном месте, справа сверху)
  const note = (title: string, line: string, icon: string[], col: string) => {
    const t = el(win, 'svc-toast', [196, 6, 138, 26]);
    const i = pic(t, icon, { x: col }, 6, 7);
    tx(t, 18, 4, title, 8, C.ac);
    tx(t, 18, 14, line);
    return { t, i };
  };
  const { t: toast, i: bell } = note(ui.toast, '#1042 · 2 400', BELL, C.pk);
  const { t: toast2, i: coin } = note(ui.payIn, '#1042 · 2 400', CHECK, C.ac);
  // выручка подросла: «+2 400» всплывает на месте процента роста
  const plus = tx(kpis[0], 50, 5, '+2 400', 8, C.ac);
  // кадры (координаты сцены = координаты окна + (10, 6))
  const SIDE: Box = [6, 28, 76, 74], KPI: Box = [78, 8, 184, 48], CHART: Box = [78, 52, 180, 66], TOAST: Box = [202, 8, 146, 34], TABLE: Box = [78, 114, 172, 50], ROW: Box = [80, 118, 172, 22], KPI1: Box = [80, 10, 92, 40];
  return timed(10.6, cam, () => scene(cam)
    .set(all, { opacity: 1 }, 0)
    .set(kv, { a: 0, b: 0, c: 0, onComplete: setK }, 0)
    .fromTo(win, { scaleX: 0.06, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0)
    .fromTo([logo, brand, ...nav.flat(), ...me], { opacity: 0 }, { opacity: 1, duration: 0.08, ease: S(1), stagger: 0.03 }, 0.2)
    .fromTo([...kpis, ch, wk, table], { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.2, ease: S(3), stagger: 0.06 }, 0.3)
    .fromTo(ups, { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0)
    .fromTo(areaW.w, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 100% 0% 0%)', duration: 0.01 }, 0)
    .fromTo(dot, { scale: 0 }, { scale: 0, duration: 0.01 }, 0)
    .fromTo(wb, { scaleY: 0 }, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.01 }, 0)
    .fromTo([toast, toast2], { x: 150 }, { x: 150, duration: 0.01 }, 0)
    .fromTo(fresh.r, { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0)
    .fromTo([paid, paidTick, plus], { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0)
    .fromTo(fresh.p, { opacity: 1, x: 0 }, { opacity: 1, x: 0, duration: 0.01 }, 0)
    // 1. меню: выделение съезжает на первый пункт
    .to(cam.s, cam.go(SIDE), 0.5)
    .fromTo(band, { y: 48 }, { y: 0, duration: 0.6, ease: 'power3.inOut' }, 0.85)
    .fromTo(nav[0][0], { backgroundColor: C.dim }, { backgroundColor: C.ac, duration: 0.05, ease: S(1) }, 1.4)
    .fromTo(nav[0][1], { color: C.fg }, { color: C.ac, duration: 0.05, ease: S(1) }, 1.4)
    // 2. цифры бегут
    .to(cam.s, cam.go(KPI), 1.65)
    .to(kv, { a: 84250, b: 1284, c: 3.8, duration: 1.0, ease: 'power2.out', onUpdate: setK }, 1.85)
    .fromTo(ups, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.2, ease: S(2), stagger: 0.1 }, 2.7)
    // 3. график рисуется, столбики растут
    .to(cam.s, cam.go(CHART), 3.0)
    .to(areaW.w, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'none' }, 3.25)
    .fromTo(line, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.9, ease: 'none' }, 3.25)
    .to(dot, { scale: 1, duration: 0.2, ease: 'back.out(3)' }, 4.15)
    .to(wb, { scaleY: 1, duration: 0.35, ease: S(6), stagger: 0.06 }, 3.3)
    // 4. приходит заказ: уведомление крупно, колокольчик дрожит
    .to(cam.s, cam.go(TOAST), 4.4)
    .to(toast, { x: 0, duration: 0.45, ease: 'power3.out' }, 4.55)
    .fromTo(bell, { x: 0 }, { x: -1, duration: 0.07, ease: S(1), yoyo: true, repeat: 5 }, 5.0)
    // 5. заказ встаёт первой строкой таблицы со статусом «новый»
    .to(cam.s, cam.go(TABLE), 5.55)
    .to(toast, { x: 150, duration: 0.35, ease: 'power2.in' }, 5.6)
    .fromTo(old.map((o) => o.r), { y: 0 }, { y: 12, duration: 0.4, ease: 'power2.inOut' }, 5.85)
    .fromTo(fresh.r, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 6.0)
    // 6. приходит оплата: второе уведомление, статус плавно меняется на «оплачен» с галочкой
    .to(cam.s, cam.go(TOAST), 6.55)
    .to(toast2, { x: 0, duration: 0.45, ease: 'power3.out' }, 6.7)
    .fromTo(coin, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 7.0)
    .to(cam.s, cam.go(ROW), 7.55)
    .to(toast2, { x: 150, duration: 0.35, ease: 'power2.in' }, 7.6)
    .to(fresh.p, { opacity: 0, x: -8, duration: 0.25, ease: 'power2.in' }, 7.95)
    .fromTo(paid, { opacity: 0, x: 10 }, { opacity: 1, x: 0, duration: 0.4, ease: 'back.out(2)', immediateRender: false }, 8.1)
    .fromTo(paidTick, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, 8.35)
    // 7. выручка выросла на сумму заказа
    .to(cam.s, cam.go(KPI1), 8.7)
    .to(ups[0], { opacity: 0, duration: 0.15 }, 8.9)
    .fromTo(plus, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', immediateRender: false }, 8.95)
    .to(kv, { a: 86650, b: 1285, duration: 0.6, ease: 'power2.out', onUpdate: setK }, 9.0)
    .to(plus, { opacity: 0, duration: 0.25 }, 9.75)
    .to(ups[0], { opacity: 1, duration: 0.2 }, 9.95)
    // общий план
    .to(cam.s, cam.home(), 9.6)
    .to(all, { opacity: 0, duration: 0.24, ease: S(3) }, 10.3));
}

/* ---------- 3. Приложения: на телефоне приходит пуш «Курьер выехал», по нажатию открывается приложение
   с картой, курьер едет по маршруту, время прибытия тает, снизу выезжает карточка курьера. Заказ доставлен,
   ставят пять звёзд. Рядом то же приложение на компьютере: статус и оценка меняются там одновременно ---------- */
const STAR = ['..x..', '.xxx.', 'xxxxx', '.xxx.', '.x.x.'];
const PIN = ['.xxx.', 'xxxxx', 'xx.xx', 'xxxxx', '.xxx.', '..x..'];
function devices(root: HTMLElement, ui: WidgetUI): Widget {
  const { all, cam } = stage(root, [14, 2, 336, 166]);
  // телефон в середине кадра, справа окно того же приложения на компьютере
  const ph = el(all, 'svc-phone', [60, 2, 96, 166]); // внутри 90×160, начало в (63, 5)
  el(ph, 'svc-fg', [37, 3, 16, 3]);
  const scr = el(ph, '', [3, 9, 84, 148]);
  scr.style.overflow = 'hidden';
  // экран блокировки: время и пуш
  const lock = el(scr, 'svc-s1', [0, 0, 84, 148]);
  const clock = tx(lock, 0, 26, '12:30', 16, C.ac);
  Object.assign(clock.style, { width: '84px', textAlign: 'center' });
  const push = el(lock, 'svc-toast', [4, 50, 76, 26]);
  pic(push, BELL, { x: C.pk }, 4, 4);
  tx(push, 14, 3, ui.pushT, 8, C.ac);
  tx(push, 4, 14, ui.pushL);
  const tapP = ring(lock, [4, 50, 76, 26], 4);
  // приложение: карта с маршрутом
  const app = el(scr, 'svc-s0', [0, 0, 84, 148]);
  const map = el(app, 'svc-s1', [0, 0, 84, 148]);
  [[0, 30, 84, 4], [0, 74, 84, 5], [0, 112, 84, 4], [22, 0, 4, 148], [58, 0, 5, 148]].forEach(([x, y, w, h]) => el(map, 'svc-dim2', [x, y, w, h]));
  [[4, 6, 14, 18], [30, 6, 22, 18], [66, 6, 14, 18], [4, 40, 14, 28], [30, 40, 22, 28], [66, 40, 14, 28], [30, 84, 22, 22], [66, 84, 14, 22]].forEach(([x, y, w, h]) => el(map, 'svc-s0', [x, y, w, h]));
  const route: [number, number][] = [[24, 140], [24, 76], [60, 76], [60, 32], [74, 32]];
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 84 148'); svg.setAttribute('width', '84'); svg.setAttribute('height', '148');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M' + route.map((p) => p.join(' ')).join('L'));
  Object.entries({ fill: 'none', stroke: C.ac, 'stroke-width': '2', 'stroke-dasharray': '3 2' }).forEach(([k, v]) => path.setAttribute(k, v));
  svg.appendChild(path);
  const routeW = el(map, '', [0, 0, 84, 148]);
  routeW.appendChild(svg);
  pic(map, PIN, { x: C.ac }, 71, 22, 1); // метка адреса в конце маршрута
  const car = el(map, 'svc-courier', [0, 0, 8, 8]);
  // время до прибытия
  const eta = el(app, 'svc-eta', [4, 4, 40, 14]);
  const etaN = tx(eta, 5, 3, '8', 8, C.s0);
  tx(eta, 16, 3, ui.min, 8, C.s0);
  // карточка курьера снизу, потом «Доставлено» и звёзды
  const sheet = el(app, 'svc-sheet', [0, 92, 84, 56]);
  el(sheet, 'svc-dim', [36, 3, 12, 2]);
  const who = el(sheet, '', [0, 0, 84, 56]);
  const ava = el(who, 'svc-ac', [6, 10, 14, 14]);
  el(ava, 'svc-s0', [3, 4, 2, 3]); el(ava, 'svc-s0', [9, 4, 2, 3]); el(ava, 'svc-s0', [4, 9, 6, 2]);
  tx(who, 24, 10, ui.courier, 8, C.ac);
  tx(who, 24, 19, '4.9', 8, C.fg);
  const call = el(who, 'svc-cta', [6, 32, 72, 16], ui.call);
  const done = el(sheet, '', [0, 0, 84, 56]);
  const dTick = pic(done, CHECK, { x: C.ac }, 6, 11, 1);
  tx(done, 16, 9, ui.delivered, 8, C.ac);
  tx(done, 6, 22, ui.rate, 8, C.fg);
  const stars = [0, 1, 2, 3, 4].map((i) => pic(done, STAR, { x: C.pk }, 8 + i * 14, 34, 2));
  const tapS = ring(done, [64, 32, 14, 14], 3);
  // компьютер: то же приложение, список заказов
  const pc = el(all, 'svc-win', [184, 28, 166, 112]); // внутри 162×108, начало в (186, 30)
  const pbar = el(pc, 'svc-bar', [0, 0, 162, 12]);
  [5, 12, 19].forEach((x) => el(pbar, 'svc-sq', [x, 3, 5, 5]));
  tx(pc, 8, 18, ui.orders, 12, C.ac);
  const rowA = el(pc, 'svc-s0', [8, 38, 146, 28]);
  tx(rowA, 6, 4, '#18', 8, C.fgDark);
  tx(rowA, 30, 4, ui.names[0], 8, C.fg);
  const stWay = el(rowA, 'svc-pill svc-pk', [96, 3, 44, 9], ui.way);
  const stDone = el(rowA, 'svc-pill svc-ac', [96, 3, 44, 9], ui.done2);
  const prog = el(rowA, 'svc-dim2', [6, 18, 134, 4]);
  const progF = el(prog, 'svc-ac', [0, 0, 134, 4]);
  const rated = el(rowA, '', [6, 15, 80, 12]);
  stars.forEach((_, i) => pic(rated, STAR, { x: C.pk }, i * 8, 0, 1));
  [[8, 74, 146, 12], [8, 90, 146, 12]].forEach(([x, y, w, h]) => { const r = el(pc, 'svc-s0', [x, y, w, h]); el(r, 'svc-dim2', [6, 4, 60, 3]); el(r, 'svc-dim2', [100, 4, 30, 3]); });
  // курьер едет по маршруту: доля пути → точка ломаной
  const seg = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1]));
  const len = seg.reduce((a, b) => a + b, 0);
  const go = { p: 0 };
  const putCar = () => {
    let d = go.p * len, i = 0;
    while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const a = route[i], b = route[i + 1], f = Math.min(1, d / seg[i]);
    gsap.set(car, { x: a[0] + (b[0] - a[0]) * f - 4, y: a[1] + (b[1] - a[1]) * f - 4 });
    gsap.set(progF, { scaleX: go.p });
    etaN.textContent = String(Math.max(1, Math.ceil(8 * (1 - go.p))));
  };
  // кадры: верх телефона (пуш), экран телефона, окно компьютера, карточка снизу
  const PUSH: Box = [64, 36, 90, 56], PHONE: Box = [58, 4, 100, 162], SHEET: Box = [62, 96, 92, 64], PC: Box = [184, 30, 166, 96];
  return timed(8.8, cam, () => {
    const tl = scene(cam)
      .set(all, { opacity: 1 }, 0)
      .set(app, { clipPath: 'inset(50% 50% 50% 50%)' }, 0)
      .set([push, tapP.r, tapS.r, stDone, rated, done], { opacity: 0 }, 0)
      .set([stWay, prog, who], { opacity: 1 }, 0)
      .set(sheet, { y: 60 }, 0)
      .set(stars, { opacity: 0.35, scale: 1 }, 0)
      .set(go, { p: 0, onComplete: putCar }, 0)
      .fromTo(ph, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' }, 0)
      .fromTo(pc, { scaleY: 0.08, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0.15)
      // 1. пуш на экране блокировки, его нажимают, приложение раскрывается из уведомления
      .to(cam.s, cam.go(PUSH), 0.35)
      .fromTo(push, { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.6)', immediateRender: false }, 0.6)
      .fromTo(tapP.r, tapP.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.42, ease: S(5), immediateRender: false }, 1.45)
      .to(push, { scale: 0.96, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 1.45)
      .to(app, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: 'power3.inOut' }, 1.65)
      // 2. карта: курьер едет, время тает, снизу карточка курьера
      .to(cam.s, cam.go(PHONE, 0.7), 1.75)
      .fromTo(eta, { scale: 0 }, { scale: 1, transformOrigin: '0% 50%', duration: 0.3, ease: 'back.out(2.4)' }, 2.0)
      .to(go, { p: 1, duration: 3.2, ease: 'sine.inOut', onUpdate: putCar }, 2.1)
      .to(sheet, { y: 0, duration: 0.45, ease: 'power3.out' }, 2.5)
      // 3. на компьютере тот же заказ едет вместе с курьером
      .to(cam.s, cam.go(PC, 0.7), 3.3)
      // 4. доставлено: на телефоне галочка и звёзды, на компьютере статус меняется
      .to(cam.s, cam.go(SHEET, 0.7), 4.6)
      .to(who, { opacity: 0, duration: 0.2 }, 5.25)
      .to(done, { opacity: 1, duration: 0.25 }, 5.35)
      .fromTo(dTick, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 5.4)
      .to(stars, { opacity: 1, scale: 1.2, duration: 0.12, ease: S(1), stagger: 0.12 }, 5.9)
      .to(stars, { scale: 1, duration: 0.15, ease: S(1), stagger: 0.12 }, 6.02)
      .fromTo(tapS.r, tapS.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.4, ease: S(5), immediateRender: false }, 6.38)
      .to(cam.s, cam.go(PC, 0.7), 6.6)
      .to(stWay, { opacity: 0, x: -6, duration: 0.2 }, 6.95)
      .fromTo(stDone, { opacity: 0, x: 8 }, { opacity: 1, x: 0, duration: 0.35, ease: 'back.out(2)', immediateRender: false }, 7.05)
      .to(prog, { opacity: 0, duration: 0.15 }, 7.15)
      .to(rated, { opacity: 1, duration: 0.25, ease: S(2) }, 7.25)
      // общий план
      .to(cam.s, cam.home(), 7.6)
      .to(all, { opacity: 0, duration: 0.24, ease: S(3) }, 8.45);
    void call;
    return tl;
  });
}

/* ---------- 4. Бот: пишут «хочу записаться», бот предлагает время, выбирают, запись готова ---------- */
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
/** смесь двух цветов буфера (ABGR) */
const mixC = (a: number, b: number, t: number) => {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const m = (s: number) => Math.round(((a >>> s) & 255) + ((((b >>> s) & 255) - ((a >>> s) & 255)) * t));
  return ((255 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)) >>> 0;
};

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
    // перекраска: все грани разом плавно переходят из цвета в цвет (раньше цвет полз снизу вверх и грани
    // выглядели недорисованными)
    const A = MATS[mat], B = MATS[next];
    const col = (k: number) => mixC(A[k], B[k], st.wipe);
    const cen = view.reduce((a, p) => [a[0] + p[0] / 8, a[1] + p[1] / 8, a[2] + p[2] / 8], [0, 0, 0]);
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
      const c = col(sh);
      pc.poly(pts, () => c);
      edges.push(pts);
    }
    // рёбра поверх всех граней сразу: швы между гранями закрыты, контур целый на каждом кадре
    const ce = col(3);
    for (const pts of edges) for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      pc.line(a[0], a[1], b[0], b[1], ce);
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
      .fromTo(st, { wipe: 0 }, { wipe: 1, duration: 0.6, ease: 'power1.inOut', immediateRender: false }, 2.15)
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
// цифры 5×7 для подписей на колесе: крупно, читаются уже до того, как колесо закрутят
const F57: Record<string, string[]> = {
  '0': ['.xxx.', 'x...x', 'x..xx', 'x.x.x', 'xx..x', 'x...x', '.xxx.'], '1': ['..x..', '.xx..', '..x..', '..x..', '..x..', '..x..', '.xxx.'],
  '2': ['.xxx.', 'x...x', '....x', '...x.', '..x..', '.x...', 'xxxxx'], '3': ['xxxxx', '...x.', '..x..', '...x.', '....x', 'x...x', '.xxx.'],
  '5': ['xxxxx', 'x....', 'xxxx.', '....x', '....x', 'x...x', '.xxx.'], '%': ['xx..x', 'xx.x.', '...x.', '..x..', '.x...', '.x.xx', 'x..xx'],
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
  // колесо: 96×96 логических пикселей на 128×128 единиц сцены. Пиксели колеса рисуются заново на
  // каждом кадре и переносятся в canvas своего экранного размера ближайшим соседом, без размытия
  const WP = 96, WC = WP / 2;
  const wc = document.createElement('canvas');
  wc.className = 'svc-wheel';
  Object.assign(wc.style, { left: '12px', top: '18px', width: '128px', height: '128px' });
  win.appendChild(wc);
  const wctx = wc.getContext('2d')!;
  const off = document.createElement('canvas');
  off.width = off.height = WP;
  const octx = off.getContext('2d')!;
  const img = octx.createImageData(WP, WP);
  const buf = new Uint32Array(img.data.buffer);
  const wh = { a: 0, flash: 0, win: 4 };
  const RO = 47.4, RR = 41.4, RH = 6.9, RL = 30; // обод, начало обода, ступица, середина подписи
  const draw = () => {
    const on = Math.floor(performance.now() / 250) % 2;
    const lit = wh.flash > 0 && wh.flash < 1 && Math.floor(wh.flash * 6) % 2 === 0;
    for (let y = 0; y < WP; y++) for (let x = 0; x < WP; x++) {
      const dx = x + 0.5 - WC, dy = y + 0.5 - WC, r = Math.hypot(dx, dy);
      let c = 0;
      if (r < RO) {
        let ph = (Math.atan2(dx, -dy) - wh.a) % TAU;
        if (ph < 0) ph += TAU;
        if (r >= RR) {
          // обод с лампочками
          c = P.s1;
          if (r >= RR + 1.2 && r < RO - 1.2) { const j = Math.round(ph / (TAU / 12)); if (Math.abs(ph - (j * TAU) / 12) * r < 1.9) c = (j + on) % 2 ? P.ac : P.pk; }
        } else if (r < RH) c = r < 3.9 ? P.ac : P.s1;
        else {
          const i = Math.floor(ph / SEC) % 6;
          const rel = ph - (i + 0.5) * SEC;
          const hot = lit && i === wh.win;
          c = Math.abs(Math.abs(rel) - SEC / 2) * r < 0.8 ? P.s1 : hot ? P.s0 : i % 2 ? P.ac : P.pk;
          // подпись поперёк радиуса: у сектора под стрелкой читается прямо
          const lab = LAB[i] + '%', tw = lab.length * 6 - 1;
          const gx = Math.floor(r * Math.sin(rel) + tw / 2), gy = Math.floor(RL + 3.5 - r * Math.cos(rel));
          if (gx >= 0 && gx < tw && gy >= 0 && gy < 7 && gx % 6 < 5 && F57[lab[Math.floor(gx / 6)]][gy][gx % 6] === 'x') c = hot ? P.ac : P.s0;
        }
      }
      buf[y * WP + x] = c;
    }
    // стрелка сверху вздрагивает, когда мимо идёт лампочка
    const kick = (wh.a / (TAU / 12)) % 1 < 0.3 && spinning ? 1 : 0;
    for (let j = 0; j < PTR.length; j++) for (let i = 0; i < 7; i++) {
      const ch = PTR[j][i];
      if (ch !== '.') buf[j * WP + WC - 3 + i - kick] = ch === 'o' ? P.s0 : P.pk;
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
    // 0. сначала колесо крупно: видно, какие скидки на секторах
    .to(cam.s, cam.go(WHEEL, 0.7), 0.6)
    // 1. курсор жмёт «Крутить»
    .to(cam.s, cam.go(BTN, 0.7), 1.75)
    .fromTo(cur, { x: 0, y: 0, opacity: 0 }, { x: bx, y: by, opacity: 1, duration: 0.6, ease: 'power2.inOut' }, 1.85)
    .to(cur, { scale: 0.8, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 2.47)
    .fromTo(btn, { y: 0 }, { y: 2, duration: 0.08, ease: S(1), yoyo: true, repeat: 1, immediateRender: false }, 2.49)
    // 2. колесо крутится и тормозит, камера смотрит на стрелку
    .to(cam.s, cam.go(WHEEL), 2.65)
    .to(cur, { x: bx + 40, y: by + 60, opacity: 0, duration: 0.5, ease: 'power2.in' }, 2.75)
    .call(() => { spinning = true; }, [], 2.7)
    .fromTo(wh, { a: 0 }, { a: target(0, 4, 4), duration: 2.8, ease: 'power3.out', immediateRender: false }, 2.7)
    .call(() => { spinning = false; }, [], 5.45)
    .to(cam.s, cam.go(PTRB), 4.55)
    .fromTo(wh, { flash: 0 }, { flash: 1, duration: 0.6, ease: 'none', immediateRender: false }, 5.45)
    // 3. выпадает промокод
    .to(cam.s, cam.go(CARD), 5.85)
    .fromTo(card, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, 6.0)
    // 4. камера опускается к коду, он проявляется, его копируют
    .to(cam.s, cam.go(CODE, 0.6), 6.65)
    .fromTo(code, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: S(6), immediateRender: false }, 6.75)
    .fromTo(cur, { x: cpx + 30, y: cpy + 50, opacity: 0 }, { x: cpx, y: cpy, opacity: 1, duration: 0.5, ease: 'power2.out', immediateRender: false }, 6.8)
    .to(cur, { scale: 0.8, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 7.35)
    .set(copyA, { opacity: 0 }, 7.4)
    .fromTo(copyB, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, 7.4)
    .to(cur, { x: cpx + 40, y: cpy + 60, opacity: 0, duration: 0.5, ease: 'power2.in' }, 7.65)
    // общий план
    .to(cam.s, cam.home(), 7.75)
    .to(all, { opacity: 0, duration: 0.24, ease: S(3) }, 8.7);
  const reset = () => {
    user?.kill(); user = undefined; spinning = false;
    setPrize(4);
    gsap.set(cur, { opacity: 0, scale: 1 });
  };
  return {
    dwell: 9.1,
    play() { reset(); cam.set(); (auto ??= buildAuto()).restart(); },
    stop() { reset(); auto?.pause(0); wh.a = 0; cam.set(); },
    resize(v) {
      cam.view(v);
      // размер canvas = экранный размер колеса при самом сильном наезде, кратный 96
      const s = Math.max(2, Math.min(12, Math.ceil((128 * cam.smax * (window.devicePixelRatio || 1)) / WP)));
      if (wc.width !== WP * s) { wc.width = wc.height = WP * s; wctx.imageSmoothingEnabled = false; }
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
    sites: (r) => sites(r, ui), dash: (r) => dash(r, ui), devices: (r) => devices(r, ui), bots: (r) => bots(r, ui), cube, promo: (r) => promo(r, ui),
  };
  return slots.map((s) => map[s.dataset.svcW || '']?.(s) ?? { dwell: 4, play() {}, stop() {} });
}
