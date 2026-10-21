import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

/** Анимация с кнопками «сыграть заново» и «вернуть в начало». */
export interface Player { play(delay?: number): void; reset(): void; }

/**
 * Блок на экране. Сцена (stage.ts) шлёт блоку block:enter, когда он открывается, и block:leave,
 * когда экран закрылся переходом и блок ушёл. enter запускает анимации входа, leave сбрасывает их,
 * чтобы в следующий раз они сыграли заново. Класс is-on стоит, пока блок на экране: по нему живут
 * бесконечные CSS-анимации. Без сцены (узкий режим, отключённый JS) работает IntersectionObserver.
 */
export function watchBlock(root: HTMLElement, enter: () => void, leave?: () => void) {
  let active = false;
  const on = () => { if (active) return; active = true; root.classList.add('is-on', 'is-in'); enter(); };
  const off = () => { if (!active) return; active = false; root.classList.remove('is-on', 'is-in'); leave?.(); };
  if (document.documentElement.classList.contains('stage-on')) {
    root.addEventListener('block:enter', on);
    root.addEventListener('block:leave', off);
    if (root.classList.contains('is-current')) requestAnimationFrame(on);
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.intersectionRatio >= 0.2) on();
      else if (!e.isIntersecting || e.intersectionRatio === 0) off();
    }
  }, { threshold: [0, 0.2] });
  io.observe(root);
}

function player(get: () => gsap.core.Animation | undefined): Player {
  return {
    play: (delay = 0) => { const a = get(); if (a) { a.delay(delay); a.restart(true); } },
    reset: () => { get()?.pause(0); },
  };
}

/** Текст по строкам: строки выезжают из-под маски. Переживает смену ширины (autoSplit). */
export function splitLines(el: HTMLElement, vars: gsap.TweenVars = {}): Player {
  let tween: gsap.core.Tween | undefined;
  SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'ln', autoSplit: true, aria: 'none', onSplit(self) {
    // при пересборке строк (смена ширины, догрузка шрифта) новая анимация продолжает с того же места
    const running = !!tween && !tween.paused();
    tween = gsap.from(self.lines, { yPercent: 110, duration: 0.9, ease: 'expo.out', stagger: 0.08, paused: true, ...vars });
    if (running) { const t = tween; gsap.delayedCall(0, () => t.play()); }
    return tween;
  } });
  return player(() => tween);
}

/** Текст по буквам: буквы поднимаются из-под маски слова. */
export function splitChars(el: HTMLElement, vars: gsap.TweenVars = {}): Player {
  let tween: gsap.core.Tween | undefined;
  SplitText.create(el, { type: 'words,chars', mask: 'words', wordsClass: 'wd', charsClass: 'ch', onSplit(self) {
    tween = gsap.from(self.chars, { yPercent: 120, duration: 0.8, ease: 'expo.out', stagger: 0.03, paused: true, ...vars });
    return tween;
  } });
  return player(() => tween);
}

/** Несколько элементов по очереди снизу. */
export function rise(targets: gsap.TweenTarget, vars: gsap.TweenVars = {}): Player {
  const tween = gsap.from(targets, { y: 28, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.07, paused: true, ...vars });
  return player(() => tween);
}

/** Любой твин или таймлайн, созданный на паузе. */
export function wrap(anim: gsap.core.Animation): Player {
  return player(() => anim);
}

export const nn = (n: number) => String(n).padStart(2, '0');

/**
 * Мышь «взведена», когда после входа в блок курсор действительно сдвинулся. Пока он просто стоит там,
 * где оказался после перелистывания, наведение не считается: блок всегда начинает с первого пункта.
 */
const mouse = { x: -1, y: -1 };
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; } }, { passive: true });
export function pointerArm() {
  let from = { x: -1, y: -1 }, armed = false;
  addEventListener('pointermove', (e) => {
    if (armed || e.pointerType !== 'mouse') return;
    if (from.x < 0 || Math.hypot(e.clientX - from.x, e.clientY - from.y) > 6) armed = true;
  }, { passive: true });
  return {
    get armed() { return armed; },
    /** при входе в блок: курсор там, где был, ещё не наведение */
    reset() { from = { ...mouse }; armed = false; },
  };
}
