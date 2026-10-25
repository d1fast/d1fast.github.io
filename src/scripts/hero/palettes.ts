/**
 * Палитры первого экрана. У каждого вопроса свой насыщенный фон, светлое лицо объёмных букв и их тёмные бока;
 * сомнение приглушённое, ответ (ультрамарин) остаётся после рассказа. Ни одна пара не повторяет другие блоки:
 * там бледные или нейтральные фоны с тёмным текстом и почти чёрный фон работ.
 * Контраст (WCAG): текст к фону от 6,8 до 10,9; акцент к фону от 4,9; приглушённая строка (62%) от 3,6.
 */
export interface Palette {
  bg: string; fg: string;
  /** выделение в строках и лицо объёмных букв */
  accent: string;
  /** текст на акценте (заливка кнопки при наведении) и бока букв */
  side: string;
}

export const ASK: Palette[] = [
  { bg: '#05606E', fg: '#ECFAFB', accent: '#FFC4D8', side: '#022E35' }, // бирюза, розовые буквы: бот
  { bg: '#8C2565', fg: '#FDF3F8', accent: '#FFE0B8', side: '#4A0634' }, // ежевика, сливочные: сайт
  { bg: '#6530B5', fg: '#F6F3FE', accent: '#94F2CB', side: '#33076A' }, // фиалка, мятные: запись
  { bg: '#F0E14E', fg: '#2A1B62', accent: '#5B2BD6', side: '#1C0E4A' }, // лимон, фиолетовые: игра (единственный светлый фон)
];
export const DOUBT: Palette = { bg: '#4A4360', fg: '#EEEAF6', accent: '#C4BBDD', side: '#241F33' }; // сумерки
export const ANSWER: Palette = { bg: '#2433B8', fg: '#F2F2FF', accent: '#FFADD9', side: '#0D1462' }; // ультрамарин
/** лица слов в итоговой стопке на ультрамарине: каждое слово сохраняет цвет своего вопроса (игра светло-сиреневая) */
export const STACK_FACES = ['#FFC4D8', '#FFE0B8', '#94F2CB', '#E4DEFF'];

const VARS = ['--bg', '--fg', '--accent', '--accent-fg', '--focus'] as const;
const values = (p: Palette) => [p.bg, p.fg, p.accent, p.side, p.fg];

/** Пишет палитру в переменные элемента: блок, а пока он открыт, и <html> (шапка, точки, курсор). */
export function paint(el: HTMLElement, p: Palette) {
  const v = values(p);
  VARS.forEach((k, i) => el.style.setProperty(k, v[i]));
}
/** Убирает палитру с элемента: дальше работают цвета его темы. */
export function unpaint(el: HTMLElement) {
  VARS.forEach((k) => el.style.removeProperty(k));
}
/** то же для переменных, закреплённых на уходящей строке: она гаснет в своих цветах, пока фон уже меняется */
export function pin(el: HTMLElement, p: Palette | null) {
  if (p) paint(el, p); else unpaint(el);
}
