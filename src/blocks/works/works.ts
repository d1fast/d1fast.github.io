import { gsap } from 'gsap';
import { watchBlock, splitChars, rise, wrap, nn, type Player } from '../../scripts/block';
import type { Ring } from './ring3d';

/**
 * Работы: цилиндр видео. Работы стоят на цилиндре (ring3d.ts), переднее видео играет, после него цилиндр
 * поворачивается к следующей работе. Крутится протаскиванием (мышь, палец), боковым свайпом на тачпаде,
 * стрелками, номерами работ и клавишами ←/→; клик по цилиндру без протаскивания: следующая работа.
 * Фон блока = неподвижная наклонная плоскость из скриншотов всех работ. Без WebGL: плоское окно с видео,
 * переключение теми же стрелками и номерами.
 */
const PERIOD = 3; // узор плоскости повторяется каждые 3 столбца
const ROWS = 6; // рядов в кадре плоскости (лишние отсекаются замером)
const VERT = '(max-aspect-ratio: 4/5), (max-width: 760px) and (orientation: portrait)'; // вертикальная раскладка (works.css)
const STUCK = 9; // видео не запустилось (режим энергосбережения): через столько секунд следующая работа

type Tile = { src: string; portrait: boolean };

export function init(root: HTMLElement) {
  const one = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T;
  const area = one('[data-works-area]');
  if (!area) return;
  const plane = one('[data-works-plane]');
  const spin = one('[data-works-spin]');
  const strip = one('[data-works-strip]');
  const title = one('[data-works-title]');
  const canvas = one<HTMLCanvasElement>('[data-works-gl]');
  const countN = one('[data-works-count-n]');
  const countSr = one('[data-works-count-sr]');
  const countTpl = countSr?.textContent || '';
  const nav = one('[data-works-nav]');
  const yours = one('[data-works-yours]');
  const vert = matchMedia(VERT);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const info: { poster: string; accent: string }[] = JSON.parse(root.dataset.worksRing || '[]');
  const videos = [...root.querySelectorAll<HTMLVideoElement>('[data-works-video]')];
  const dots = [...root.querySelectorAll<HTMLButtonElement>('[data-works-dot]')];
  const P = [...root.querySelectorAll<HTMLElement>('[data-works-proj]')].map((el) => ({
    el, name: el.querySelector<HTMLElement>('[data-works-name]')!, parts: [...el.querySelectorAll<HTMLElement>('[data-works-part]')],
  }));
  const N = P.length;
  if (!N) return;
  const mod = (a: number, n: number) => ((a % n) + n) % n;

  /* ---------- неподвижная плоскость скриншотов ---------- */
  const tiles: Tile[] = JSON.parse(plane.dataset.worksTiles || '[]');
  const deskT = tiles.filter((t) => !t.portrait), phoneT = tiles.filter((t) => t.portrait);
  let builtV = vert.matches, builtW = 0;
  /** Собирает тайлы: щедрая сетка рамок, потом остаются только видимые в позе покоя (узлов и картинок столько, сколько видно). */
  const build = () => {
    const v = vert.matches, W = root.clientWidth || innerWidth;
    builtV = v; builtW = W;
    const tw = Math.round(v ? gsap.utils.clamp(130, W > 600 ? 250 : 170, W * 0.4) : gsap.utils.clamp(240, 380, W * 0.23));
    const g = Math.round(tw * 0.06), step = tw + g;
    const box = v ? 7 : 9;
    plane.style.setProperty('--pw', `${box * step - g}px`);
    plane.style.setProperty('--ph', `${Math.round(6 * (0.69 * tw + g) - g)}px`);
    const deskH = Math.round((tw * 9) / 16), phoneW = Math.round(tw * 0.5), phoneH = Math.round(phoneW / 0.4621);
    const all: { el: HTMLElement; src: string }[] = [];
    const frag = document.createDocumentFragment();
    for (let c = -PERIOD; c < box + 2; c++) {
      const k = ((c % PERIOD) + PERIOD) % PERIOD;
      const top = Math.round((1 - k) * 0.33 * tw);
      const put = (r: number, y: number) => {
        const tall = phoneT.length > 0 && (((k + r) % 4) + 4) % 4 === 1;
        const t = tall ? phoneT[(((k + r + c) % phoneT.length) + phoneT.length) % phoneT.length] : deskT[(((k * 3 + r + c) % deskT.length) + deskT.length) % deskT.length];
        const h = tall ? phoneH : deskH;
        if (t) {
          const el = document.createElement('span');
          el.className = 'works__tile';
          el.style.cssText = `left:${c * step + (tall && k % 2 ? tw - phoneW : 0)}px;top:${y}px;width:${tall ? phoneW : tw}px;height:${h}px`;
          frag.append(el);
          all.push({ el, src: t.src });
        }
        return h;
      };
      for (let r = 0, y = top; r < ROWS; r++) y += put(r, y) + g;
      for (let r = -1, y = top; r >= -2; r--) { const tall = phoneT.length > 0 && (((k + r) % 4) + 4) % 4 === 1; y -= (tall ? phoneH : deskH) + g; put(r, y); }
    }
    strip.replaceChildren(frag);
    const r0 = root.getBoundingClientRect(), m = 28;
    for (const { el, src } of all) {
      const r = el.getBoundingClientRect();
      if (!(r.right > r0.left - m && r.left < r0.right + m && r.bottom > r0.top - m && r.top < r0.bottom + m)) { el.remove(); continue; }
      const img = document.createElement('img');
      img.alt = ''; img.decoding = 'async'; img.draggable = false; img.loading = 'lazy'; img.src = src;
      el.append(img);
    }
  };

  /* ---------- название: слово не переносится, ширина и кегль подгоняются ---------- */
  const names: Player[] = [];
  const nameOf = (k: number) => (names[k] ??= splitChars(P[k].name, { yPercent: 110, duration: 0.7, stagger: 0.022 }));
  const fitName = (k: number) => {
    const el = P[k].name;
    if (!el.offsetWidth) return;
    el.style.fontStretch = ''; el.style.fontSize = '';
    const cs = getComputedStyle(el);
    const line = cs.whiteSpace === 'nowrap';
    const words = [...el.querySelectorAll<HTMLElement>('.wd-mask')];
    const box = el.clientWidth;
    const wide = () => (line || !words.length ? el.scrollWidth > box + 1 : words.some((w) => w.offsetWidth > box + 1));
    let s = parseFloat(cs.getPropertyValue('--name-st')) || 151;
    while (wide() && s > 100) { s = Math.max(100, s - 5); el.style.fontStretch = `${s}%`; }
    let fs = parseFloat(cs.fontSize);
    const min = parseFloat(cs.getPropertyValue('--name-min')) || 22;
    while (wide() && fs > min) { fs -= 1; el.style.fontSize = `${fs}px`; }
  };

  /* ---------- состояние ---------- */
  let ring: Ring | null = null;
  let k = 0; // передняя работа
  let active = false, auto = false;
  let stuckT = 0;
  const holds = new Set<string>(); // причины паузы автопоказа: жест, фокус с клавиатуры
  // сколько роликов досмотрено подряд сами по себе; человек листал сам (touched): сцена дальше сама не идёт
  let watched = 0, touched = false;
  const playBtn = one<HTMLButtonElement>('[data-works-play]');
  /** браузер не дал запустить ролик сам (энергосбережение, строгий автоплей): кнопка на цилиндре */
  const blocked = (on: boolean) => { if (playBtn) playBtn.hidden = !on; };

  /** видео работы j: играет только переднее и только пока блок на экране */
  const playFront = () => {
    clearTimeout(stuckT);
    videos.forEach((v, j) => { if (j !== k) { v.pause(); v.classList.remove('is-on'); } });
    const v = videos[k];
    if (!v) return;
    v.classList.add('is-on');
    if (!active) { v.pause(); return; }
    if (v.preload === 'none') v.preload = 'auto';
    v.play().then(() => blocked(false)).catch(() => blocked(true));
    ring?.live(k);
    // страховка: видео застряло или не грузится
    stuckT = window.setTimeout(() => { if (active && auto && !holds.size && (v.paused || v.readyState < 2)) autoNext(); }, STUCK * 1000);
    // следующее видео заранее узнаёт длительность и первый кадр
    const nv = videos[mod(k + 1, N)];
    if (nv && nv.preload === 'none') nv.preload = 'metadata';
  };

  /** карточка и номера под передней работой. Видна всегда ровно одна работа: прежняя смена сначала
   *  доводится до конца, и только потом ищется, какая карточка сейчас на экране (иначе при быстрых
   *  переключениях оставались видны две и наезжали друг на друга) */
  let swap: gsap.core.Timeline | null = null;
  const setCard = (j: number, animate: boolean, dir = 1) => {
    countN.textContent = nn(j + 1);
    if (countSr) countSr.textContent = countTpl.replace(/\d+/, String(j + 1));
    dots.forEach((d, i) => d.setAttribute('aria-current', String(i === j)));
    if (info[j]?.accent) root.style.setProperty('--accent', info[j].accent);
    swap?.progress(1); swap?.kill(); swap = null;
    const a = P.find((p) => !p.el.hidden), b = P[j];
    if (a === b) { P.forEach((p) => (p.el.hidden = p !== b)); return; }
    if (!animate || !a) {
      P.forEach((p) => { p.el.hidden = p !== b; gsap.set([p.name, ...p.parts], { clearProps: 'opacity,transform' }); });
      nameOf(j); fitName(j);
      return;
    }
    // текст уезжает в сторону поворота цилиндра и приходит с другой стороны, пока барабан поворачивается
    const tl = gsap.timeline();
    swap = tl;
    tl.to([a.name, ...a.parts], { opacity: 0, x: -28 * dir, duration: 0.32, ease: 'power2.in', stagger: 0.03 })
      .add(() => {
        P.forEach((p) => (p.el.hidden = p !== b));
        gsap.set([a.name, ...a.parts], { clearProps: 'opacity,transform' });
        nameOf(j); fitName(j);
        nameOf(j).play(0);
      })
      .fromTo(b.parts, { opacity: 0, x: 28 * dir }, { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out', stagger: 0.07, clearProps: 'transform' }, '+=0.12');
  };

  /** повернуть цилиндр к позиции pos (в панелях); передняя работа = pos по модулю числа работ */
  // куда цилиндр едет сейчас: быстрые нажатия «дальше» складываются, а не теряются посреди поворота
  let tgt = 0;
  const goTo = (pos: number, dur = 1.6) => {
    tgt = pos;
    const j = mod(Math.round(pos), N);
    const changed = j !== k;
    const dir = ring ? Math.sign(pos - ring.pos) || 1 : 1;
    k = j;
    setCard(j, changed && active, dir);
    if (ring) ring.spin(pos, calm ? 0 : dur);
    else videos.forEach((v, i) => v.classList.toggle('is-on', i === j));
    if (changed || videos[k]?.paused) { videos[k].currentTime = 0; playFront(); }
  };
  const step = (dir: number) => goTo(Math.round(ring ? tgt : k) + dir);
  /** ролик досмотрели: следующая работа, а после последней, если человек ничего не трогал, следующий блок */
  const autoNext = () => {
    watched++;
    if (watched >= N && !touched && !calm) { root.dispatchEvent(new CustomEvent('block:done')); return; }
    step(1);
  };
  /** человек сам листает: досмотр не считается, автопоказ дальше идёт, но блок сам не уходит */
  const user = () => { touched = true; };
  /** к работе j кратчайшим путём */
  const pick = (j: number) => { const now = ring ? Math.round(tgt) : k; let d = mod(j - mod(now, N), N); if (d > N / 2) d -= N; goTo(now + d); };

  /* ---------- жесты: протаскивание мышью и пальцем, боковой свайп тачпада ---------- */
  let drag: { id: number; x: number; y: number; p0: number; on: boolean; off: boolean; t: number; v: number } | null = null;
  let dragged = false; // жест закончился протаскиванием: следующий клик не листает
  const unit = () => Math.max(220, area.clientWidth * 0.55); // столько пикселей жеста = одна панель
  area.addEventListener('dragstart', (e) => e.preventDefault());
  area.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, p0: ring ? ring.pos : k, on: false, off: false, t: performance.now(), v: 0 };
    dragged = false;
  });
  area.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d || e.pointerId !== d.id || d.off) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) {
      // вертикальный жест остаётся у сцены и листает блоки
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { d.off = true; return; }
      if (Math.abs(dx) <= 6) return;
      d.on = dragged = true;
      user();
      holds.add('drag');
      area.classList.add('is-drag');
      try { area.setPointerCapture(e.pointerId); } catch { /* отпущен */ }
    }
    const now = performance.now(), pos = d.p0 - dx / unit();
    d.v = (pos - (ring ? ring.pos : d.p0)) / Math.max(1, now - d.t) * 1000; d.t = now;
    ring?.set(pos);
  });
  const release = (e: PointerEvent) => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    drag = null;
    area.classList.remove('is-drag');
    holds.delete('drag');
    if (d.on) {
      const pos = ring ? ring.pos : d.p0 - (e.clientX - d.x) / unit();
      // бросок: скорость досылает цилиндр на соседнюю панель
      const target = Math.round(pos + gsap.utils.clamp(-0.6, 0.6, d.v * 0.12));
      goTo(target === Math.round(d.p0) && Math.abs(pos - d.p0) > 0.18 ? Math.round(d.p0) + Math.sign(pos - d.p0) : target, 0.7);
    }
  };
  area.addEventListener('pointerup', release);
  area.addEventListener('pointercancel', release);
  // клик без протаскивания: следующая работа
  area.addEventListener('click', (e) => {
    if (dragged) { dragged = false; e.preventDefault(); return; }
    if ((e.target as Element).closest('[data-works-play]')) return;
    user(); step(1);
  });
  // боковой свайп двумя пальцами на тачпаде: один жест = одна работа, как вертикальный свайп листает блоки.
  // Жест кончается паузой в событиях или сменой направления; инерция того же жеста второй раз не листает
  let wAcc = 0, wDone = false, wLast = 0, wDir = 0;
  root.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || !active) return;
    e.preventDefault();
    const dx = e.deltaMode === 1 ? e.deltaX * 32 : e.deltaX;
    const now = performance.now(), dir = Math.sign(dx);
    if (now - wLast > 180 || dir !== wDir) { wAcc = 0; wDone = false; wDir = dir; }
    wLast = now;
    if (wDone) return;
    wAcc += Math.abs(dx);
    if (wAcc >= 40) { wDone = true; user(); step(dir); }
  }, { passive: false });

  /* ---------- стрелки, номера, клавиши ---------- */
  nav.addEventListener('click', (e) => {
    const s = (e.target as Element).closest<HTMLButtonElement>('[data-works-step]');
    if (s) { user(); step(Number(s.dataset.worksStep) || 1); return; }
    const d = (e.target as Element).closest<HTMLButtonElement>('[data-works-dot]');
    if (d) { user(); pick(Number(d.dataset.worksDot) || 0); }
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !(e.target as Element).closest?.('[data-works-nav], [data-works-area]')) return;
    e.preventDefault();
    user();
    step(e.key === 'ArrowRight' ? 1 : -1);
    if ((e.target as Element).closest('[data-works-dot]')) dots[k]?.focus();
  });
  nav.addEventListener('focusin', (e) => { if ((e.target as Element).matches(':focus-visible')) holds.add('focus'); });
  nav.addEventListener('focusout', (e) => { if (!nav.contains(e.relatedTarget as Node)) holds.delete('focus'); });
  // видео доиграло: следующая работа (если не держат жестом или фокусом)
  videos.forEach((v, j) => v.addEventListener('ended', () => {
    if (j !== k) return;
    if (active && auto && !holds.size) autoNext();
    else { v.currentTime = 0; if (active) v.play().catch(() => {}); }
  }));
  // кнопка запуска, если браузер не дал ролику пойти сам; любое касание страницы тоже пробует запустить
  playBtn?.addEventListener('click', (e) => { e.stopPropagation(); playFront(); });
  const retry = () => { if (active && videos[k]?.paused) playFront(); };
  ['pointerdown', 'keydown', 'touchend'].forEach((t) => addEventListener(t, retry, { passive: true }));

  /* ---------- вход ---------- */
  const entry = gsap.timeline({ paused: true })
    .fromTo(plane, { rotationX: 74, z: -700, opacity: 0 }, { rotationX: 56, z: 0, opacity: 0.3, duration: 1.2, ease: 'expo.out' }, 0)
    .fromTo(spin, { rotation: -8 }, { rotation: -24, duration: 1.2, ease: 'expo.out' }, 0)
    .fromTo(title, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, 0.05)
    .fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 0.25);
  const intro = wrap(entry);
  const cardIn = rise([one('.works__count'), nav, yours], { y: 14, stagger: 0.06, duration: 0.6, ease: 'expo.out' });

  /* ---------- перестройка плоскости и кадра цилиндра при смене размера ---------- */
  let rt = 0;
  new ResizeObserver(() => {
    fitName(k);
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      ring?.layout();
      if (vert.matches !== builtV || Math.abs(root.clientWidth - builtW) > builtW * 0.1) build();
    }, 150);
  }).observe(root);
  document.fonts?.addEventListener?.('loadingdone', () => fitName(k));

  /* ---------- жизненный цикл ---------- */
  nameOf(0); fitName(0);
  root.classList.add('is-primed');
  watchBlock(root, () => {
    active = true; auto = true;
    watched = 0; touched = false;
    if (!builtW) build();
    ring?.layout();
    ring?.start();
    intro.play(0.1);
    nameOf(k).play(0.45);
    gsap.fromTo(P[k].parts, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.06, delay: 0.55, clearProps: 'transform' });
    cardIn.play(0.7);
    // цилиндр въезжает с поворота и встаёт на переднюю работу
    if (ring && !calm) { const p = Math.round(ring.pos); ring.set(p - 0.6); ring.spin(p, 1.5, 'expo.out'); }
    playFront();
  }, () => {
    active = false; auto = false;
    blocked(false);
    clearTimeout(stuckT);
    videos.forEach((v) => v.pause());
    ring?.stop();
    intro.reset(); cardIn.reset();
    names.forEach((n) => n?.reset());
  });
  document.addEventListener('visibilitychange', () => { if (!active) return; if (document.hidden) videos[k]?.pause(); else playFront(); });

  // цилиндр: WebGL проверяется заранее, модуль с three.js грузится только если он есть
  const glOk = (() => {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    g?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!g;
  })();
  // пока модуль цилиндра грузится, плоское окно с видео не показывается: иначе оно мелькнуло бы перед цилиндром
  if (glOk) root.classList.add('will-gl');
  const ready = (async () => {
    build();
    if (!glOk) return;
    try {
      const { createRing } = await import('./ring3d');
      ring = createRing({ canvas, area, videos, posters: info.map((i) => i.poster) });
      root.classList.add('is-gl');
      ring.set(0);
      ring.layout();
      // цилиндр пришёл, когда блок уже открыт: въезжает с поворота, как при обычном входе
      if (active) { ring.start(); ring.live(k); if (!calm) { ring.set(k - 0.6); ring.spin(k, 1.5, 'expo.out'); } }
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ring?.stop(); ring = null; root.classList.remove('is-gl', 'will-gl'); videos.forEach((v, i) => v.classList.toggle('is-on', i === k)); }, { once: true });
    } catch { ring = null; root.classList.remove('will-gl'); }
  })();
  // сцена ждёт сборку плоскости и цилиндра перед тем, как открыть блок, но не дольше 600 мс
  return Promise.race([ready, new Promise((r) => setTimeout(r, 600))]).then(() => {});
}
