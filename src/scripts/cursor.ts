/**
 * Свой курсор, только для мыши: точка и кольцо, которое догоняет её с мягкой задержкой. Цвет инвертирует то,
 * что под ним (mix-blend-mode: difference), поэтому курсор виден на любом блоке. Над ссылками и кнопками кольцо
 * растёт и чуть заливается, точка прячется; над полями ввода кольцо сжимается; при нажатии кольцо поджимается.
 */
export function initCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const html = document.documentElement;
  let el = document.querySelector<HTMLElement>('.cursor');
  if (!el) {
    el = document.createElement('div');
    el.className = 'cursor is-hidden';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<i class="cursor__ring"></i><i class="cursor__dot"></i>';
    document.body.append(el);
  }
  html.classList.add('has-cursor');
  const ring = el.querySelector<HTMLElement>('.cursor__ring')!, dot = el.querySelector<HTMLElement>('.cursor__dot')!;
  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf = 0, shown = false;

  // точка стоит там, где мышь; кольцо догоняет её (экспоненциальное сглаживание, не зависит от частоты кадров)
  let last = 0;
  const loop = (t: number) => {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    const k = 1 - Math.exp(-dt * 16);
    rx += (x - rx) * k; ry += (y - ry) * k;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ring.style.transform = `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0)`;
    if (Math.abs(x - rx) > 0.1 || Math.abs(y - ry) > 0.1) raf = requestAnimationFrame(loop); else { raf = 0; last = 0; }
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    if (!shown) { shown = true; rx = x; ry = y; el!.classList.remove('is-hidden'); }
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
  document.addEventListener('mouseleave', () => el!.classList.add('is-hidden'));
  document.addEventListener('mouseenter', () => shown && el!.classList.remove('is-hidden'));
  addEventListener('pointerdown', () => el!.classList.add('is-down'));
  addEventListener('pointerup', () => el!.classList.remove('is-down'));

  const isLink = (t: Element | null) => t?.closest('a, button, label, [role="button"], input, textarea, select, [data-active-list] > *');
  document.addEventListener('pointerover', (e) => {
    const t = e.target as Element;
    const text = !!t.closest('input:not([type="checkbox"]):not([type="radio"]), textarea');
    el!.classList.toggle('is-link', !!isLink(t) && !text);
    el!.classList.toggle('is-text', text);
  });
}
