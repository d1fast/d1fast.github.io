import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(ScrambleTextPlugin);

const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Магнитные кнопки: тянутся к курсору в радиусе, возвращаются пружиной. Только мышь. */
export function initMagnetic(root: ParentNode = document) {
  if (!fine()) return;
  for (const el of root.querySelectorAll<HTMLElement>('[data-magnetic]:not(.is-magnet-bound)')) {
    el.classList.add('is-magnet-bound');
    const strength = Number(el.dataset.magnetic || 0.35);
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.45)' });
    });
  }
}

/** Скрэмбл текста ссылок при наведении. Текст не меняет ширину: символы из того же набора. */
export function initScramble(root: ParentNode = document) {
  if (!fine()) return;
  for (const el of root.querySelectorAll<HTMLElement>('[data-scramble]:not(.is-scramble-bound)')) {
    el.classList.add('is-scramble-bound');
    const text = el.textContent || '';
    const cyr = /[а-яё]/i.test(text);
    let tween: gsap.core.Tween | null = null;
    el.addEventListener('pointerenter', () => {
      tween?.kill();
      tween = gsap.to(el, { duration: 0.6, scrambleText: { text, chars: cyr ? 'абвгдежзиклмнопрстуфхцчшщэюя' : 'abcdefghijklmnopqrstuvwxyz', speed: 0.8, revealDelay: 0.1 } });
    });
  }
}
