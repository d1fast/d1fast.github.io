import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import type { Sculpt } from './sculpt';

gsap.registerPlugin(SplitText, ScrambleTextPlugin);

/**
 * Первый экран. Буквы имени поднимаются из-под строки и наливаются весом, следом подпись и кнопки.
 * Рядом знаки кода слетаются из облака в скульптуру (sculpt.ts) и по очереди перетекают в то, что я делаю;
 * подпись под ней называет предмет и показывает, сколько до следующего. Курсор наклоняет скульптуру
 * и расталкивает знаки, тап или клик по пустому месту пускает по ним волну.
 * При каждом возвращении на первый экран всё проигрывается заново. Без WebGL остаётся текст.
 */
export function initHero(onDone?: (hero: HTMLElement) => void) {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero || hero.classList.contains('is-bound')) return;
  hero.classList.add('is-bound');
  const canvas = hero.querySelector<HTMLCanvasElement>('[data-hero-gl]');
  const stage = hero.querySelector<HTMLElement>('[data-hero-stage]');
  const lines = [...hero.querySelectorAll<HTMLElement>('[data-hero-line]')];
  const tag = hero.querySelector<HTMLElement>('[data-hero-tag]');
  const cta = [...hero.querySelectorAll<HTMLElement>('[data-hero-cta] > *')];
  const hud = hero.querySelector<HTMLElement>('[data-hero-hud]');
  const idx = hero.querySelector<HTMLElement>('[data-hero-idx]');
  const now = hero.querySelector<HTMLElement>('[data-hero-now]');
  const bar = hero.querySelector<HTMLElement>('[data-hero-bar]');
  const labels: string[] = JSON.parse(hud?.dataset.labels || '[]');
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const staged = () => document.documentElement.classList.contains('stage-on');
  const isOpen = () => !staged() || hero.classList.contains('is-current');
  let sculpt: Sculpt | null = null;
  let split: SplitText | null = null;
  let intro: gsap.core.Timeline | null = null;

  /* ---------- текст ---------- */
  const chars = () => (split?.chars as HTMLElement[] | undefined) ?? [];
  const hideText = () => {
    intro?.kill();
    if (split) gsap.set(chars(), { yPercent: 118, rotate: 6 });
    gsap.set([tag, ...cta, hud].filter(Boolean), { opacity: 0 });
  };
  const showText = (delay: number) => {
    intro?.kill();
    intro = gsap.timeline({ delay })
      // буквы поднимаются по одной и из тонких становятся жирными
      .fromTo(chars(), { yPercent: 118, rotate: 6, fontWeight: 260 }, { yPercent: 0, rotate: 0, fontWeight: 900, duration: 1.2, ease: 'expo.out', stagger: 0.045 }, 0)
      .fromTo(tag, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out' }, 0.6)
      .fromTo(cta, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.08 }, 0.75)
      .fromTo(hud, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 1.3);
  };

  /* ---------- подпись под скульптурой ---------- */
  let barTween: gsap.core.Tween | null = null;
  const onShape = (i: number, dur: number) => {
    if (idx) idx.textContent = String(i + 1).padStart(2, '0');
    if (now && labels[i]) gsap.to(now, { duration: 0.7, scrambleText: { text: labels[i], chars: '{}<>/=+*#01', speed: 0.6 }, overwrite: true });
    barTween?.kill();
    if (bar) barTween = gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: dur, ease: 'none' });
  };

  /* ---------- место скульптуры: квадрат внутри [data-hero-stage] над подписью ---------- */
  const place = () => {
    if (!sculpt || !stage) return;
    const hr = hero.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const hudH = hud ? hud.offsetHeight + 14 : 0;
    const w = sr.width, h = sr.height - hudH;
    if (w < 10 || h < 10) return;
    sculpt.layout(sr.left - hr.left + w / 2, sr.top - hr.top + h / 2, Math.min(w * 1.04, h * 0.94));
  };

  const ready = () => { onDone?.(hero); };
  hideText();

  (document.fonts?.ready ?? Promise.resolve()).then(async () => {
    split = new SplitText(lines, { type: 'chars', charsClass: 'hero__ch' });
    hideText();
    hero.classList.add('is-split');
    if (isOpen()) showText(0.25);
    if (!canvas || !stage) { hero.classList.add('is-flat'); return ready(); }
    let mod: typeof import('./sculpt');
    try { mod = await import('./sculpt'); } catch { hero.classList.add('is-flat'); return ready(); }
    const cs = getComputedStyle(hero);
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';
    try { await document.fonts?.load(`700 46px ${mono}`); } catch { /* знаки нарисуются запасным моноширинным */ }
    try {
      sculpt = mod.createSculpt({ canvas, color: cs.getPropertyValue('--fg').trim() || '#F3F0E8', hot: cs.getPropertyValue('--accent').trim() || '#FF6A3D', font: mono, count: isTouch ? 3000 : 5200, calm });
    } catch { hero.classList.add('is-flat'); return ready(); }
    const sc = sculpt;
    hero.classList.add('is-gl');
    sc.onShape(onShape);
    place();
    if (isOpen()) { sc.intro(); sc.start(); }
    ready();

    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(place, 120); }, { passive: true });

    // курсор и палец
    const local = (e: PointerEvent) => { const r = hero.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    let down = { x: 0, y: 0, t: 0 };
    hero.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const p = local(e); sc.pointer(p.x, p.y, true); }, { passive: true });
    hero.addEventListener('pointerleave', () => sc.pointer(0, 0, false));
    hero.addEventListener('pointerdown', (e) => { const p = local(e); down = { ...p, t: performance.now() }; });
    hero.addEventListener('pointerup', (e) => {
      if ((e.target as Element).closest('a, button')) return;
      const p = local(e);
      if (Math.hypot(p.x - down.x, p.y - down.y) < 10 && performance.now() - down.t < 450) sc.pulse(p.x, p.y);
    });

    // рендер идёт, только пока первый экран открыт
    hero.addEventListener('block:leave', () => sc.stop());
    if (!staged()) new IntersectionObserver(([en]) => { if (en.isIntersecting) sc.start(); else sc.stop(); }).observe(hero);
  });

  /** Возвращение на первый экран: буквы поднимаются заново, знаки снова слетаются из облака. */
  (hero as HTMLElement & { _reenter?: () => void })._reenter = () => {
    hideText();
    showText(0.15);
    if (sculpt) { place(); sculpt.intro(); sculpt.start(); }
  };
}

export function heroReenter(hero: HTMLElement) {
  (hero as HTMLElement & { _reenter?: () => void })._reenter?.();
}
