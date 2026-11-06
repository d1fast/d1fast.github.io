import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { watchBlock, splitChars, pointerArm } from '../../scripts/block';
import { buildWidgets, type WidgetUI, type View } from './widgets';

gsap.registerPlugin(ScrambleTextPlugin);

// мигание: 0,1,0,1… и в конце 1
const blink = (n: number) => (p: number) => (p >= 1 ? 1 : Math.floor(p * n) % 2);

/** Что делаю: сцена закончилась, немного держим результат и открываем следующий пункт.
 * Наведение выбирает пункт, но не останавливает показ. Повторный щелчок запускает сцену заново. */
export function init(root: HTMLElement) {
  const q = gsap.utils.selector(root);
  const one = <T extends HTMLElement = HTMLElement>(s: string) => q<T>(s)[0] as T;
  const items = q<HTMLElement>('[data-services-item]');
  const btns = q<HTMLButtonElement>('[data-services-btn]');
  const rows = q<HTMLElement>('[data-services-row]');
  const inv = one('[data-services-inv]');
  const invItems = [...inv.children] as HTMLElement[];
  const band = one('[data-services-band]');
  const marker = one('[data-services-marker]');
  const mkDrop = one('[data-services-mkdrop]');
  const mkPop = one('[data-services-mkpop]');
  const list = one('[data-services-list]');
  const menu = one('[data-services-menu]');
  const hint = one('[data-services-hint]');
  const dialog = one('[data-services-dialog]');
  const screen = one('[data-services-screen]');
  const power = one('[data-services-power]');
  const tube = one('[data-services-tube]');
  const flash = one('[data-services-flash]');
  const dname = one('[data-services-name]');
  const dtext = one('[data-services-text]');
  const pipsBox = one('[data-services-pips]');
  const pips = q<HTMLElement>('[data-services-pips] i');
  const pipFill = pips.map((p) => p.querySelector('b') as HTMLElement);
  const next = one<HTMLButtonElement>('[data-services-next]');
  const slots = q<HTMLElement>('[data-svc-w]');
  const hit = one<HTMLButtonElement>('[data-svc-hit]');
  const names = items.map((i) => i.querySelector('.services__name')?.textContent || '');
  const texts = items.map((i) => i.querySelector('.services__desc')?.textContent || '');
  const total = items.length;
  let ui: WidgetUI;
  try { ui = JSON.parse(root.dataset.svcUi || '{}'); } catch { ui = {} as WidgetUI; }
  const widgets = buildWidgets(slots, ui);
  const PROMO = slots.findIndex((s) => s.dataset.svcW === 'promo');
  const PRODUCT = slots.findIndex((s) => s.dataset.svcW === 'product');
  const chars = /[а-яё]/i.test(names.join('')) ? 'абвгдежзиклмнопрстуфхцчшэюя' : 'abcdefghijklmnopqrstuvwxyz';

  let current = 0;
  let shown = -1;
  let on = false;
  // человек в этот заход что-то выбирал сам: когда меню дойдёт до конца, сцена сама дальше не листает
  let touched = false;
  let lastSel = 0;
  let intent: ReturnType<typeof setTimeout> | undefined;

  /* ---------- полоса, треугольник и инвертированная копия списка ---------- */
  const pos = { y: 0 };
  let rowH = 0, listH = 0;
  const paint = () => {
    const t = `translate3d(0,${pos.y.toFixed(2)}px,0)`;
    band.style.transform = t;
    marker.style.transform = t;
    inv.style.clipPath = `inset(${pos.y.toFixed(2)}px 0 ${Math.max(0, listH - pos.y - rowH).toFixed(2)}px 0)`;
  };
  const measure = () => { rowH = items[0].offsetHeight; listH = list.offsetHeight; };
  const place = (i: number, instant = false) => {
    const y = items[i].offsetTop;
    gsap.killTweensOf(pos);
    if (instant) { pos.y = y; paint(); return; }
    gsap.to(pos, { y, duration: 0.3, ease: 'power3.out', onUpdate: paint });
  };
  const mark = (i: number) => {
    items.forEach((el, k) => el.classList.toggle('is-active', k === i));
    invItems.forEach((el, k) => el.classList.toggle('is-active', k === i));
    // в меню одна точка табуляции: выбранный пункт, по остальным ходят стрелками
    btns.forEach((b, k) => { b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
    pips.forEach((p, k) => p.classList.toggle('is-on', k === i));
  };

  /* ---------- экранчик ---------- */
  const fit = () => {
    const w = tube.offsetWidth, h = tube.offsetHeight;
    // сверху полоса под «каналы» в углу: сцена сдвинута вниз на половину полосы и не наезжает на них
    const res = pipsBox.offsetTop + pipsBox.offsetHeight;
    if (!w || !h) return;
    const k = Math.min(w / 360, (h - res) / 170);
    tube.style.setProperty('--k', k.toFixed(4));
    tube.style.setProperty('--dy', (res / 2).toFixed(1) + 'px');
    screen.style.setProperty('--res', res.toFixed(1) + 'px');
    // камере сцен нужен размер экранчика и отступ от рамки: по ним она вписывает сцену и решает, насколько наезжать
    const pad = parseFloat(getComputedStyle(screen).getPropertyValue('--scr-pad')) || 8;
    const v: View = { w, h, res, k, pad };
    widgets.forEach((wd) => wd.resize?.(v));
  };
  const show = (i: number) => {
    if (shown === i) return;
    if (shown >= 0) { widgets[shown].stop(); slots[shown].classList.remove('is-shown'); }
    shown = i;
    slots[i].classList.add('is-shown');
    widgets[i].play(() => advance(i));
    arm();
  };
  let sw: gsap.core.Timeline | undefined;
  // Смена канала через короткое затухание. Сцены сами не гасят свой последний кадр.
  const channel = (i: number) => {
    sw?.kill();
    sw = gsap.timeline()
      .to(tube, { opacity: 0, duration: 0.16, ease: 'sine.in' })
      .add(() => show(i))
      .to(tube, { opacity: 1, duration: 0.3, ease: 'sine.out' });
  };

  /* ---------- текст в окне ---------- */
  const sayName = (i: number) => {
    gsap.to(dname, { duration: 0.45, scrambleText: { text: names[i], chars, speed: 0.8, revealDelay: 0.08 }, overwrite: true });
  };
  // печать по буквам своим счётчиком: TextPlugin заменяет неразрывные пробелы обычными
  const typed = { n: 0 };
  const typeText = (i: number, delay = 0) => {
    gsap.killTweensOf(typed);
    dtext.textContent = '';
    const s = texts[i];
    typed.n = 0;
    gsap.to(typed, { n: s.length, duration: Math.min(1.1, 0.25 + s.length * 0.016), ease: 'none', delay, onUpdate: () => { dtext.textContent = s.slice(0, Math.round(typed.n)); } });
  };

  /* ---------- показ до конца, затем следующий пункт ---------- */
  let prog: gsap.core.Tween | undefined;
  let hoverMenu = false;
  let finishedWhileHidden: number | undefined;
  const arm = () => {
    prog?.kill();
    pipFill.forEach((b) => gsap.set(b,{scaleX:0}));
    prog = gsap.to(pipFill[current],{scaleX:1,duration:widgets[current].dwell,ease:'none'});
  };
  const advance = (finished: number) => {
    if (!on || shown !== finished || current !== finished) return;
    if (document.hidden) { finishedWhileHidden = finished; return; }
    if (current === total-1 && !touched) { root.dispatchEvent(new CustomEvent('block:done')); return; }
    select(current+1);
  };

  document.addEventListener('visibilitychange',() => {
    if (!document.hidden && finishedWhileHidden !== undefined) { const i = finishedWhileHidden; finishedWhileHidden = undefined; advance(i); }
  });

  // подтверждение: щелчок по уже выбранному пункту, как кнопка «A»
  const confirm = () => {
    gsap.fromTo([band, inv], { opacity: 1 }, { opacity: 1, duration: 0.3, ease: blink(6) });
    if (shown === current) { const i = current; widgets[i].play(() => advance(i)); arm(); }
  };

  function select(i: number, user = false) {
    i = (i + total) % total;
    if (user) touched = true;
    if (i === current) { if (user && on) confirm(); return; }
    current = i;
    lastSel = performance.now();
    mark(i);
    place(i);
    gsap.fromTo(mkPop, { scaleX: 0.5, scaleY: 1.5 }, { scaleX: 1, scaleY: 1, duration: 0.55, ease: 'elastic.out(1, 0.4)', overwrite: true });
    if (on) channel(i);
    sayName(i);
    typeText(i, 0.12);
  }

  /* ---------- ввод ---------- */
  const mouseArm = pointerArm();
  let aimed = -1;
  btns.forEach((b, i) => {
    // наведение выбирает пункт, если мышь задержалась на нём хоть немного: при косом движении к окну
    // курсор пересекает соседние пункты, и они не должны перехватывать выбор
    // после входа меню всегда начинает с первого пункта: курсор, который просто остался над списком
    // после перелистывания, пункт не выбирает, пока не сдвинется
    const aim = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !on || !mouseArm.armed || i === current || aimed === i) return;
      aimed = i;
      clearTimeout(intent);
      intent = setTimeout(() => { aimed = -1; if (on) select(i, true); }, 90);
    };
    b.addEventListener('pointerenter', aim);
    b.addEventListener('pointermove', aim);
    b.addEventListener('pointerleave', () => { clearTimeout(intent); aimed = -1; });
    b.addEventListener('focus', () => { if (!on) return; if (i !== current) select(i, true); });
    // щелчок по только что выбранному (наведением или фокусом этого же нажатия) не считается подтверждением
    b.addEventListener('click', () => { clearTimeout(intent); if (i === current && performance.now() - lastSel < 350) { return; } select(i, true); });
  });
  menu.addEventListener('keydown', (e) => {
    const k = e.key;
    let to = -1;
    if (k === 'ArrowDown' || k === 'ArrowRight') to = current + 1;
    else if (k === 'ArrowUp' || k === 'ArrowLeft') to = current - 1;
    else if (k === 'Home') to = 0;
    else if (k === 'End') to = total - 1;
    if (to < 0 && k !== 'ArrowUp' && k !== 'ArrowLeft') return;
    e.preventDefault();
    btns[(to + total) % total].focus();
  });
  next.addEventListener('click', () => select(current + 1, true));
  // подсказка «наведите или ↑↓»: пока мышь над меню, стрелки листают пункты, даже если фокус ещё не в меню.
  // Фокус переходит на пункт, дальше клавиши обрабатывает само меню ([data-keys]). Сцена не получает
  // нажатие, потому что оно уже отменено (stage.ts пропускает defaultPrevented).
  document.addEventListener('keydown', (e) => {
    if (!on || !hoverMenu || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (menu.contains(t) || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    const k = e.key;
    let to = -1;
    if (k === 'ArrowDown' || k === 'ArrowRight') to = current + 1;
    else if (k === 'ArrowUp' || k === 'ArrowLeft') to = current - 1 + total;
    else if (k === 'Home') to = 0;
    else if (k === 'End') to = total - 1;
    if (to < 0) return;
    e.preventDefault();
    btns[to % total].focus({ preventScroll: true });
  });

  menu.addEventListener('pointermove',(e) => { if (e.pointerType === 'mouse' && mouseArm.armed) { hoverMenu = true; menu.classList.add('is-hover'); } });
  menu.addEventListener('pointerleave',() => { hoverMenu = false; menu.classList.remove('is-hover'); });

  // колесо скидок: тап, клик, пробел или Enter на фокусе крутят колесо. click, а не pointerdown:
  // свайп по экранчику листает блоки и колесо не трогает
  if (hit && PROMO >= 0) hit.addEventListener('click', () => { if (widgets[PROMO].spin?.()) arm(); touched = true; });
  // 3D смотрит на указатель; на тачскрине тап меняет цвет кузова
  if (PRODUCT >= 0) {
    const pt = (e: PointerEvent) => { const r = screen.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    screen.addEventListener('pointermove', (e) => { if (shown === PRODUCT && e.pointerType === 'mouse') { const [x, y] = pt(e); widgets[PRODUCT].point?.(x, y); } });
    screen.addEventListener('pointerdown', (e) => { if (shown === PRODUCT && e.pointerType !== 'mouse') { const [x, y] = pt(e); widgets[PRODUCT].point?.(x, y, true); touched = true; } });
  }

  const reflow = () => { measure(); place(current, true); };
  mark(current);
  if ('ResizeObserver' in window) {
    new ResizeObserver(fit).observe(screen);
    new ResizeObserver(reflow).observe(list);
  } else {
    addEventListener('resize', () => { fit(); reflow(); }, { passive: true });
  }
  fit();
  reflow();

  /* ---------- вход ---------- */
  // буквы заголовка выскакивают рывками, как спрайты
  const h2 = one('[data-services-title]');
  const title = splitChars(h2, { yPercent: 110, ease: 'steps(4)', duration: 0.42, stagger: { each: 0.045, from: 'random' } });
  const entry = gsap.timeline({ paused: true })
    // пункты печатаются блоками слева направо
    .fromTo(rows, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.36, ease: 'steps(8)', stagger: 0.05 }, 0.1)
    // окно открывается как в RPG: полоска по ширине, потом вниз
    .fromTo(dialog, { scaleX: 0, scaleY: 0.03 }, { scaleX: 1, scaleY: 0.03, duration: 0.2, ease: 'steps(6)' }, 0.15)
    .to(dialog, { scaleY: 1, duration: 0.26, ease: 'steps(6)' }, 0.35)
    // экран включается, как кинескоп
    .fromTo(power, { scaleX: 0, scaleY: 0.012 }, { scaleX: 1, scaleY: 0.012, duration: 0.16, ease: 'steps(4)' }, 0.62)
    .to(power, { scaleY: 1, duration: 0.24, ease: 'steps(5)' }, 0.78)
    .call(() => show(current), [], 1.02)
    // выделение мигает, треугольник падает сверху
    .fromTo([band, inv], { opacity: 0 }, { opacity: 1, duration: 0.42, ease: blink(6) }, 0.5)
    .fromTo(mkDrop, { y: -28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'bounce.out' }, 0.52)
    .fromTo(pips, { scale: 0 }, { scale: 1, duration: 0.18, ease: 'steps(3)', stagger: 0.04 }, 0.95)
    .fromTo([next, hint], { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'steps(3)' }, 1.15)
    .call(() => { sayName(current); typeText(current, 0.1); }, [], 0.9)
    ;

  const enter = () => {
    on = true; touched = false; finishedWhileHidden = undefined;
    // курсор, оставшийся над меню после перелистывания, перебор не останавливает
    mouseArm.reset();
    hoverMenu = false;
    menu.classList.remove('is-hover');
    current = 0;
    mark(0);
    fit();
    reflow();
    gsap.killTweensOf([dname, typed]);
    dname.textContent = ''; dtext.textContent = '';
    title.play(0);
    entry.restart();
  };
  const leave = () => {
    on = false; finishedWhileHidden = undefined;
    clearTimeout(intent);
    title.reset();
    entry.pause(0);
    sw?.kill();
    gsap.set(tube, { opacity: 1, scaleX: 1, scaleY: 1 });
    gsap.set(flash, { opacity: 0 });
    widgets.forEach((w) => w.stop());
    slots.forEach((s) => s.classList.remove('is-shown'));
    shown = -1;
    prog?.kill(); prog = undefined;
    gsap.killTweensOf([dname, typed, mkPop]);
    gsap.set(mkPop, { scaleX: 1, scaleY: 1 });
    pipFill.forEach((b) => gsap.set(b, { scaleX: 0 }));
    current = 0;
    mark(0);
    place(0, true);
  };
  watchBlock(root, enter, leave);
}
