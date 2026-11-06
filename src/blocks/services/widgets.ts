import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

gsap.registerPlugin(DrawSVGPlugin);

/**
 * Живые штуки в экранчике окна диалога, по одной на пункт меню. Играет только показанная:
 * play() запускает её с начала, stop() останавливает и возвращает в исходное состояние.
 * DOM-штуки рисуются на «сцене» 360×170 и масштабируются целиком (--k на трубке экрана),
 * 3D-витрина загружается при первом выборе своего пункта.
 *
 * Камера. В каждой сцене работает «оператор»: кадр наезжает на то, что сейчас происходит,
 * держит общий план, затем приближает значимый результат. Общий план вписывает содержимое
 * сцены в экранчик с одним и тем же отступом от рамки (--scr-pad), поэтому все сцены стоят ровно.
 * Сила наезда зависит от того, насколько мелко сцена видна: на телефоне мелкий текст сцены
 * вырастает до 16–26 px, на большом экране камера лишь чуть подаётся к месту действия. В DOM
 * камера двигает слой трансформом без 3D-слоёв (браузер заново рисует текст и пиксели в новом
 * масштабе, без мыла), в canvas меняется сама проекция при рисовании.
 */
export interface View { w: number; h: number; res: number; k: number; pad: number }
export interface Widget {
  dwell: number;
  play(done?: () => void): void;
  stop(): void;
  resize?(v: View): void;
  spin?(): boolean;
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
/** Оставляем время на чтение действия и результата. */
const RATE = 0.95;

/* ---------- камера ---------- */
/** Масштаб общего плана, css-px на единицу сцены: прямоугольник b вписан в видимую часть экранчика
 *  (под «каналами») с отступом pad со всех сторон. */
const fitS = (v: View, b: Box) => Math.min((v.w - 2 * v.pad) / b[2], (v.h - v.res - 2 * v.pad) / b[3]);
/** 0 на телефоне (экранчик уже 400 px), 1 на компьютере (от 520 px), между ними плавно */
const wideF = (w: number) => Math.min(1, Math.max(0, (w - 400) / 120));
/** Общий план остаётся узнаваемым и во время приближения. */
const capS = (s0: number, w: number) => s0 * (1.8 - 0.72 * wideF(w));

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
  go(r: Box, duration = 0.8, ease = 'sine.inOut'): gsap.TweenVars { return { ...this.at(r), duration, ease }; }
  /** твин на общий план */
  home(duration = 0.9): gsap.TweenVars { return this.go(this.b, duration); }
  set(r: Box = this.b) { Object.assign(this.s, this.at(r)); this.apply(); }
  view(v: View) { this.v = v; this.apply(); }
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

/** Сцена проигрывается один раз и держит последний кадр до смены пункта. */
function scene(cam: Cam) {
  return gsap.timeline({ paused: true, onUpdate: cam.apply })
    .set(cam.s, cam.at(cam.b), 0);
}
/** Обёртка для штук на таймлайне GSAP: таймлайн строится при первом показе. rate: во сколько раз сцена идёт
 *  быстрее, чем записана (история та же, смотреть её короче); пункт меню стоит ровно одну сцену. */
function timed(cam: Cam, build: () => gsap.core.Timeline, rate = RATE): Widget {
  let tl: gsap.core.Timeline | undefined, finish: gsap.core.Tween | undefined;
  return {
    get dwell() { return (tl?.duration() || 0) / rate + .65; },
    play(done) {
      finish?.kill(); cam.set();
      tl ??= build().timeScale(rate);
      tl.eventCallback('onComplete', () => { if (done) finish = gsap.delayedCall(.65,done); });
      tl.restart();
    },
    stop() { finish?.kill(); tl?.pause(0); cam.set(); },
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
  const DETAIL: Box = [126, 12, 186, 140];
  return timed(cam, () => scene(cam)
    .set(all, { opacity: 1 }, 0)
    .set([badge, toast, fly], { opacity: 0 }, 0)
    .set([page, thumb], { y: 0 }, 0)
    .set(cta, { y: 0, backgroundColor: C.ac }, 0)
    .fromTo(win, { scaleY: 0.08, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0)
    .fromTo(lights, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: S(1), stagger: 0.06 }, 0.2)
    .fromTo([logo, brand, ...links, cartI], { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.16, ease: S(2), stagger: 0.04 }, 0.28)
    .fromTo(hero, { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 0%', duration: 0.3, ease: S(5) }, 0.36)
    .fromTo(h1, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.32, ease: S(8), stagger: 0.12 }, 0.6)
    .fromTo(sub, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: S(2) }, 0.95)
    .fromTo(cta, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 1.05)
    .fromTo(pic1, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: S(6) }, 0.75)
    .fromTo(sun, { y: 14 }, { y: 0, duration: 0.5, ease: S(6) }, 1.0)
    .fromTo([secT, ...cards.map((c) => c.c)], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.24, ease: S(3), stagger: 0.08 }, 1.2)
    // 1. курсор подходит к «Заказать», кнопка проседает, волна, всплывает «Заявка отправлена»
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
    .to(cam.s, cam.go(DETAIL, 1.2), 3.65)
    // 3. «+» у второй карточки: кнопка проседает, точка летит в корзину, на значке «1»
    .to(cur, { x: plusC.x - 330, y: plusC.y - 180, duration: 0.45, ease: 'power2.inOut' }, 4.45)
    .to(cur, { scale: 0.8, duration: 0.1, ease: S(1), yoyo: true, repeat: 1 }, 4.95)
    .to(cards[1].plus, { y: 2, backgroundColor: C.fg, duration: 0.08, ease: S(1) }, 4.97)
    .to(cards[1].plus, { y: 0, backgroundColor: C.ac, duration: 0.12, ease: S(2) }, 5.15)
    .fromTo(wave2.r, wave2.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.45, ease: S(5), immediateRender: false }, 4.99)
    .fromTo(cards[1].c, { y: 0 }, { y: -3, duration: 0.12, ease: S(2), yoyo: true, repeat: 1, immediateRender: false }, 5.0)
    .fromTo(fly, { x: plusC.x - 3, y: plusC.y - 3, opacity: 1 }, { x: cartC.x + 2, y: cartC.y - 2, duration: 0.55, ease: 'power2.in', immediateRender: false }, 5.05)
    .set(fly, { opacity: 0 }, 5.6)
    .fromTo(badge, { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, 5.6)
    .fromTo(cartI, { y: 0 }, { y: -2, duration: 0.1, ease: S(1), yoyo: true, repeat: 1, immediateRender: false }, 5.6)
    // Курсор уходит, готовая страница остаётся видимой
    .to(cur, { x: 40, y: 30, opacity: 0, duration: 0.5, ease: 'power2.in' }, 5.9)
    );
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
  const CONTENT: Box = [76, 6, 266, 154];
  return timed(cam, () => scene(cam)
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
    .fromTo(band, { y: 48 }, { y: 0, duration: 0.6, ease: 'power3.inOut' }, 0.85)
    .fromTo(nav[0][0], { backgroundColor: C.dim }, { backgroundColor: C.ac, duration: 0.05, ease: S(1) }, 1.4)
    .fromTo(nav[0][1], { color: C.fg }, { color: C.ac, duration: 0.05, ease: S(1) }, 1.4)
    // 2. цифры бегут
    .to(cam.s, cam.go(CONTENT, 1.2), 1.65)
    .to(kv, { a: 84250, b: 1284, c: 3.8, duration: 1.0, ease: 'power2.out', onUpdate: setK }, 1.85)
    .fromTo(ups, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.2, ease: S(2), stagger: 0.1 }, 2.7)
    // 3. график рисуется, столбики растут
    .to(areaW.w, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'none' }, 3.25)
    .fromTo(line, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.9, ease: 'none' }, 3.25)
    .to(dot, { scale: 1, duration: 0.2, ease: 'back.out(3)' }, 4.15)
    .to(wb, { scaleY: 1, duration: 0.35, ease: S(6), stagger: 0.06 }, 3.3)
    // 4. приходит заказ: уведомление крупно, колокольчик дрожит
    .to(toast, { x: 0, duration: 0.45, ease: 'power3.out' }, 4.55)
    .fromTo(bell, { x: 0 }, { x: -1, duration: 0.07, ease: S(1), yoyo: true, repeat: 5 }, 5.0)
    // 5. заказ встаёт первой строкой таблицы со статусом «новый»
    .to(toast, { x: 150, duration: 0.35, ease: 'power2.in' }, 5.6)
    .fromTo(old.map((o) => o.r), { y: 0 }, { y: 12, duration: 0.4, ease: 'power2.inOut' }, 5.85)
    .fromTo(fresh.r, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 6.0)
    // 6. приходит оплата: второе уведомление, статус плавно меняется на «оплачен» с галочкой
    .to(toast2, { x: 0, duration: 0.45, ease: 'power3.out' }, 6.7)
    .fromTo(coin, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 7.0)
    .to(toast2, { x: 150, duration: 0.35, ease: 'power2.in' }, 7.6)
    .to(fresh.p, { opacity: 0, x: -8, duration: 0.25, ease: 'power2.in' }, 7.95)
    .fromTo(paid, { opacity: 0, x: 10 }, { opacity: 1, x: 0, duration: 0.4, ease: 'back.out(2)', immediateRender: false }, 8.1)
    .fromTo(paidTick, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, 8.35)
    // 7. выручка выросла на сумму заказа
    .to(ups[0], { opacity: 0, duration: 0.15 }, 8.9)
    .fromTo(plus, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', immediateRender: false }, 8.95)
    .to(kv, { a: 86650, b: 1285, duration: 0.6, ease: 'power2.out', onUpdate: setK }, 9.0)
    .to(plus, { opacity: 0, duration: 0.25 }, 9.75)
    .to(ups[0], { opacity: 1, duration: 0.2 }, 9.95)
    );
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
  const PHONE: Box = [58, 4, 100, 162];
  return timed(cam, () => {
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
      .to(cam.s, cam.go(PHONE, 1.2), 0.4)
      .fromTo(push, { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.6)', immediateRender: false }, 0.6)
      .fromTo(tapP.r, tapP.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.42, ease: S(5), immediateRender: false }, 1.45)
      .to(push, { scale: 0.96, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 1.45)
      .to(app, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: 'power3.inOut' }, 1.65)
      // 2. карта: курьер едет, время тает, снизу карточка курьера
      .fromTo(eta, { scale: 0 }, { scale: 1, transformOrigin: '0% 50%', duration: 0.3, ease: 'back.out(2.4)' }, 2.0)
      .to(go, { p: 1, duration: 3.2, ease: 'sine.inOut', onUpdate: putCar }, 2.1)
      .to(sheet, { y: 0, duration: 0.45, ease: 'power3.out' }, 2.5)
      // 3. на компьютере тот же заказ едет вместе с курьером
      // 4. доставлено: на телефоне галочка и звёзды, на компьютере статус меняется
      .to(who, { opacity: 0, duration: 0.2 }, 5.25)
      .to(done, { opacity: 1, duration: 0.25 }, 5.35)
      .fromTo(dTick, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 5.4)
      .to(stars, { opacity: 1, scale: 1.2, duration: 0.12, ease: S(1), stagger: 0.12 }, 5.9)
      .to(stars, { scale: 1, duration: 0.15, ease: S(1), stagger: 0.12 }, 6.02)
      .fromTo(tapS.r, tapS.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.4, ease: S(5), immediateRender: false }, 6.38)
      .to(stWay, { opacity: 0, x: -6, duration: 0.2 }, 6.95)
      .fromTo(stDone, { opacity: 0, x: 8 }, { opacity: 1, x: 0, duration: 0.35, ease: 'back.out(2)', immediateRender: false }, 7.05)
      .to(prog, { opacity: 0, duration: 0.15 }, 7.15)
      .to(rated, { opacity: 1, duration: 0.25, ease: S(2) }, 7.25)
      // общий план
      .to(cam.s, cam.home(1.2), 6.6);
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
  const DONE: Box = [80, 52, 204, 80];
  return timed(cam, () => scene(cam)
    .set(all, { opacity: 1 }, 0)
    .set(col, { y: 0 }, 0)
    .set(tb, { textContent: '' }, 0)
    .set(ph, { opacity: 1 }, 0)
    .set([st2, wave.r], { opacity: 0 }, 0)
    .set(st1, { opacity: 1 }, 0)
    .fromTo(win, { scaleY: 0.08, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.24, ease: S(4) }, 0)
    .fromTo([me, typing, bot1, ...keys, bot2], { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0)
    // 1. в поле печатается сообщение
    .to(ph, { opacity: 0, duration: 0.05 }, 0.6)
    .fromTo(ty, { n: 0 }, { n: ui.ask.length, duration: 0.85, ease: S(ui.ask.length), immediateRender: false, onUpdate: () => { tb.textContent = ui.ask.slice(0, Math.round(ty.n)); } }, 0.62)
    .to(send, { scale: 0.86, duration: 0.07, ease: S(1), yoyo: true, repeat: 1 }, 1.6)
    // 2. отправили: сообщение появляется в ленте
    .set(tb, { textContent: '' }, 1.72)
    .set(ph, { opacity: 1 }, 1.72)
    .fromTo(me, { scale: 0.4, opacity: 0, transformOrigin: '100% 100%' }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.4)', immediateRender: false }, 1.72)
    // 3. бот печатает и отвечает кнопками со временем
    .to(st1, { opacity: 0, duration: 0.01 }, 2.35)
    .to(st2, { opacity: 1, duration: 0.01 }, 2.35)
    .fromTo(typing, { scale: 0.4, opacity: 0, transformOrigin: '0% 100%' }, { scale: 1, opacity: 1, duration: 0.24, ease: 'back.out(2.4)', immediateRender: false }, 2.4)
    .fromTo(dots, { y: 0 }, { y: -3, duration: 0.14, ease: S(1), stagger: { each: 0.1, repeat: 3, yoyo: true } }, 2.55)
    .to(typing, { opacity: 0, duration: 0.05, ease: S(1) }, 3.25)
    .to(st2, { opacity: 0, duration: 0.01 }, 3.25)
    .to(st1, { opacity: 1, duration: 0.01 }, 3.25)
    .fromTo(bot1, { scale: 0.4, opacity: 0, transformOrigin: '0% 100%' }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.4)', immediateRender: false }, 3.25)
    .fromTo(keys, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: S(3), stagger: 0.1, immediateRender: false }, 3.45)
    // 4. выбирают 18:30
    .fromTo(cur, { x: 0, y: 0, opacity: 0 }, { x: tx0, y: ty0, opacity: 1, duration: 0.6, ease: 'power2.inOut' }, 3.75)
    .to(cur, { scale: 0.78, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 4.4)
    .fromTo(keys[2], { backgroundColor: 'rgba(0,0,0,0)', color: C.fg }, { backgroundColor: C.ac, color: C.s0, duration: 0.05, ease: S(1) }, 4.42)
    .fromTo(wave.r, wave.from, { scaleX: 1, scaleY: 1, opacity: 0, duration: 0.42, ease: S(5), immediateRender: false }, 4.42)
    .to(cur, { x: tx0 + 60, y: ty0 + 70, opacity: 0, duration: 0.6, ease: 'power2.in' }, 4.7)
    // 5. лента сдвигается, бот подтверждает запись
    .to(col, { y: -30, duration: 0.5, ease: 'power2.inOut' }, 4.85)
    .to(cam.s, cam.go(DONE, 1.1), 4.9)
    .fromTo(bot2, { scale: 0.4, opacity: 0, transformOrigin: '0% 100%' }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.4)', immediateRender: false }, 5.15)
    );
}

/* ---------- 5. 3D-витрина: купе с выбором цвета ---------- */
function product(root: HTMLElement): Widget {
  let view: Widget | undefined, pending: Promise<void> | undefined, active = false;
  let size: View | undefined, finish: gsap.core.Tween | undefined;
  root.innerHTML = `<div class="svc-product-fallback" aria-hidden="true"><svg viewBox="0 0 400 220"><ellipse cx="200" cy="173" rx="155" ry="17" fill="#19050e"/><path d="M48 132 72 108 128 100 168 67h91l48 41 42 15 9 33H42Z" fill="#F06A93"/><path d="m144 100 29-26h80l32 30Z" fill="#202a2d"/><path d="M46 143h310v16H46Z" fill="#84334d"/><g fill="#160f15" stroke="#b6c3c0" stroke-width="8"><circle cx="112" cy="155" r="27"/><circle cx="298" cy="155" r="27"/></g><path d="m55 120 24-6-8 12H49m276 4 23 6 3 10h-22" fill="#eaf5d6"/></svg></div>`;
  return {
    dwell: 10.5,
    play(done) {
      finish?.kill();
      if (done) finish = gsap.delayedCall(10.5,done);
      active = true;
      if (view) { view.play(); return; }
      pending ??= import('./product').then(({ createProduct }) => {
        view = createProduct(root);
        if (size) view.resize?.(size);
        if (active) view.play();
      }).catch(() => { /* Изображение машины остаётся при недоступном WebGL. */ });
    },
    stop() { finish?.kill(); active = false; view?.stop(); },
    resize(v) { size = v; view?.resize?.(v); },
    point(x, y, touch) { view?.point?.(x, y, touch); },
  };
}

/* ---------- 6. Игры для акций: всплывающее окно на сайте с колесом скидок. Курсор жмёт «Крутить»,
   колесо останавливается на скидке, выпадает промокод, его копируют. Тап по экрану крутит колесо самому ---------- */
const LAB = ['10', '25', '5', '30', '15', '20'];
const SEC = TAU / 6;

function promo(root: HTMLElement, ui: WidgetUI): Widget {
  const { all, cam } = stage(root, [24, 4, 312, 162]);
  const win = el(all, 'svc-win', [24, 4, 312, 162]); // внутри 308×158, начало в (26, 6)
  const bar = el(win, 'svc-bar', [0, 0, 308, 14]);
  [5, 13, 21].forEach((x) => el(bar, 'svc-sq', [x, 4, 6, 6]));
  el(bar, 'svc-sq', [34, 4, 150, 6]).style.opacity = '.55';
  // Векторное колесо: сектора и цифры одинаково чёткие на общем плане и при наезде.
  const NS = 'http://www.w3.org/2000/svg';
  const wc = document.createElementNS(NS, 'svg');
  wc.classList.add('svc-wheel');
  wc.setAttribute('viewBox', '0 0 96 96');
  Object.assign(wc.style, { left: '12px', top: '18px', width: '128px', height: '128px' });
  win.appendChild(wc);
  const shape = (tag: string, attrs: Record<string, string | number>, parent: SVGElement = wc) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    parent.appendChild(node);
    return node;
  };
  shape('circle', { cx: 48, cy: 48, r: 47, fill: C.s1 });
  const wheel = shape('g', {});
  const sectors = LAB.map((lab, i) => {
    const a = i * SEC - Math.PI / 2, b = a + SEC;
    const xy = (v: number, r: number) => `${48 + Math.cos(v) * r} ${48 + Math.sin(v) * r}`;
    const sector = shape('path', { d: `M48 48 L${xy(a, 41)} A41 41 0 0 1 ${xy(b, 41)} Z`, fill: i % 2 ? C.ac : C.pk, stroke: C.s1, 'stroke-width': 1 }, wheel);
    const label = shape('text', { x: 48, y: 21, 'text-anchor': 'middle', fill: C.s0, transform: `rotate(${(i + .5) * 60} 48 48)`, style: 'font: 10px Tiny5, monospace' }, wheel);
    label.textContent = lab + '%';
    return sector;
  });
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    shape('circle', { cx: 48 + Math.sin(a) * 44, cy: 48 - Math.cos(a) * 44, r: 1.4, fill: i % 2 ? C.ac : C.pk }, wheel);
  }
  shape('circle', { cx: 48, cy: 48, r: 6, fill: C.s1 }, wheel);
  shape('circle', { cx: 48, cy: 48, r: 3, fill: C.ac }, wheel);
  shape('path', { d: 'M43 1 H53 L48 11 Z', fill: C.pk, stroke: C.s0, 'stroke-width': 1.5 });
  const wh = { a: 0, flash: 0, win: 4 };
  const draw = () => {
    wheel.setAttribute('transform', `rotate(${wh.a * 180 / Math.PI} 48 48)`);
    sectors.forEach((sector, i) => sector.setAttribute('fill', wh.flash > .1 && i === wh.win ? C.fg : i % 2 ? C.ac : C.pk));
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
  const PRIZE: Box = [160, 20, 174, 122];
  // кнопка «Крутить»: центр 154+48, 74+13 в окне
  const bx = 26 + 202 - 330, by = 6 + 87 - 186, cpx = 26 + 150 + 40 - 330, cpy = 6 + 20 + 97 - 186;
  const intro = [win, wc, title, ...sub, btn];
  const onTick = () => { cam.apply(); draw(); };
  let auto: gsap.core.Timeline | undefined, user: gsap.core.Timeline | undefined, finish: gsap.core.Tween | undefined;
  let completed: (() => void) | undefined;
  const finishScene = () => { finish?.kill(); if (completed) finish = gsap.delayedCall(.65,completed); };
  const buildAuto = () => gsap.timeline({ paused: true, onUpdate: onTick })
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
    .fromTo(cur, { x: 0, y: 0, opacity: 0 }, { x: bx, y: by, opacity: 1, duration: 0.6, ease: 'power2.inOut' }, 1.85)
    .to(cur, { scale: 0.8, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 2.47)
    .fromTo(btn, { y: 0 }, { y: 2, duration: 0.08, ease: S(1), yoyo: true, repeat: 1, immediateRender: false }, 2.49)
    // 2. колесо крутится и тормозит на общем плане
    .to(cur, { x: bx + 40, y: by + 60, opacity: 0, duration: 0.5, ease: 'power2.in' }, 2.75)
    .call(() => { spinning = true; }, [], 2.7)
    .fromTo(wh, { a: 0 }, { a: target(0, 4, 4), duration: 2.8, ease: 'power3.out', immediateRender: false }, 2.7)
    .call(() => { spinning = false; }, [], 5.45)
    .fromTo(wh, { flash: 0 }, { flash: 1, duration: 0.6, ease: 'none', immediateRender: false }, 5.45)
    // 3. выпадает промокод
    .to(cam.s, cam.go(PRIZE, 1.1), 5.85)
    .fromTo(card, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, 6.0)
    // 4. промокод проявляется в том же кадре, его копируют
    .fromTo(code, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: S(6), immediateRender: false }, 6.75)
    .fromTo(cur, { x: cpx + 30, y: cpy + 50, opacity: 0 }, { x: cpx, y: cpy, opacity: 1, duration: 0.5, ease: 'power2.out', immediateRender: false }, 6.8)
    .to(cur, { scale: 0.8, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 7.35)
    .set(copyA, { opacity: 0 }, 7.4)
    .fromTo(copyB, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, 7.4)
    .to(cur, { x: cpx + 40, y: cpy + 60, opacity: 0, duration: 0.5, ease: 'power2.in' }, 7.65)
    .timeScale(RATE);
  const reset = () => {
    user?.kill(); user = undefined; spinning = false;
    setPrize(4);
    gsap.set(cur, { opacity: 0, scale: 1 });
  };
  return {
    get dwell() { return user ? user.duration() + .65 : (auto?.duration() || 8.15) / RATE + .65; },
    play(done) { finish?.kill(); completed = done; reset(); cam.set(); (auto ??= buildAuto()).eventCallback('onComplete',finishScene).restart(); },
    stop() { finish?.kill(); completed = undefined; reset(); auto?.pause(0); wh.a = 0; cam.set(); },
    resize(v) {
      cam.view(v);
      draw();
    },
    // человек сам крутит колесо: от текущего кадра, без скачков
    spin() {
      if (spinning) return false;
      finish?.kill();
      auto?.pause();
      user?.kill();
      const i = Math.floor(Math.random() * 6);
      setPrize(i);
      wh.a %= TAU;
      spinning = true;
      user = gsap.timeline({ onUpdate: onTick, onComplete: finishScene })
        .set(all, { opacity: 1 }, 0)
        .set(intro, { opacity: 1, scale: 1, scaleY: 1, y: 0 }, 0)
        .set(wh, { flash: 0 }, 0)
        .to(cur, { opacity: 0, duration: 0.15 }, 0)
        .to(card, { opacity: 0, scale: 0.9, duration: 0.15 }, 0)
        .set(copyA, { opacity: 1 }, 0.15)
        .set(copyB, { opacity: 0 }, 0.15)
        .to(btn, { y: 2, duration: 0.08, ease: S(1), yoyo: true, repeat: 1 }, 0)
        .to(cam.s, cam.home(.9), 0.05)
        .to(wh, { a: target(wh.a, i, 4), duration: 2.6, ease: 'power3.out' }, 0.1)
        .call(() => { spinning = false; }, [], 2.7)
        .to(wh, { flash: 1, duration: 0.6, ease: 'none' }, 2.75)
        .to(cam.s, cam.go(PRIZE, 1.1), 3.2)
        .fromTo(card, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, 3.35)
        .fromTo(code, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: S(6) }, 4.15);
      return true;
    },
  };
}

export function buildWidgets(slots: HTMLElement[], ui: WidgetUI): Widget[] {
  const map: Record<string, (r: HTMLElement) => Widget> = {
    sites: (r) => sites(r, ui), dash: (r) => dash(r, ui), devices: (r) => devices(r, ui), bots: (r) => bots(r, ui), product, promo: (r) => promo(r, ui),
  };
  return slots.map((s) => map[s.dataset.svcW || '']?.(s) ?? { dwell: 4, play() {}, stop() {} });
}
