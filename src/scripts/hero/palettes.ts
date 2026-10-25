/**
 * Палитры первого экрана. У каждого вопроса свой фон, текст, плашка выделения и цвет его кривой
 * (чёрная, красная, жёлтая, синяя, как на эскизе осей). Сомнение приглушённое, ответ подсолнечно-жёлтый
 * и остаётся после рассказа. Ни одна пара не повторяет другие блоки (матча с вишней, почти чёрный,
 * бетон, пудрово-голубой с вином) и синего фона нет.
 * Контраст (WCAG): текст к фону от 4,1 (красный, крупный кегль) до 14; плашка выделения к своему тексту от 4,6.
 */
export interface Palette {
  bg: string; fg: string;
  /** плашка выделенных слов и заливка кнопки при наведении */
  accent: string;
  /** текст на плашке и на залитой кнопке */
  side: string;
  /** цвет кривой вопроса */
  line: string;
  /** приглушённая строка, если смесь текста с фоном выходит грязной */
  muted?: string;
}

export const ASK: Palette[] = [
  { bg: '#CDBBFF', fg: '#160C38', accent: '#160C38', side: '#CDBBFF', line: '#141210' },              // сирень, чёрная кривая: бот
  { bg: '#FFC9D9', fg: '#2B0B16', accent: '#D7141E', side: '#FFF4F7', line: '#D7141E' },              // розовое молоко, красная: сайт
  { bg: '#0E4D45', fg: '#EFFCF7', accent: '#FFC83D', side: '#0E4D45', line: '#FFC83D' },              // глубокая бирюза, жёлтая: запись
  { bg: '#E5322D', fg: '#FFF6EE', accent: '#1F35D6', side: '#FFFFFF', line: '#2547FF', muted: '#FFD9CF' }, // томат, синяя: игра
];
export const DOUBT: Palette = { bg: '#77707F', fg: '#FBF9FD', accent: '#FBF9FD', side: '#3B3642', line: '#FBF9FD', muted: '#E0DBE6' }; // сумерки
export const ANSWER: Palette = { bg: '#FFD43B', fg: '#121110', accent: '#121110', side: '#FFD43B', line: '#121110', muted: '#5E5420' }; // подсолнух

const VARS = ['--bg', '--fg', '--accent', '--accent-fg', '--focus'] as const;
const values = (p: Palette) => [p.bg, p.fg, p.accent, p.side, p.fg];

/** Пишет палитру в переменные элемента: блок, а пока он открыт, и шапка, точки, курсор. */
export function paint(el: HTMLElement, p: Palette) {
  const v = values(p);
  VARS.forEach((k, i) => el.style.setProperty(k, v[i]));
  if (p.muted) el.style.setProperty('--hero-muted', p.muted); else el.style.removeProperty('--hero-muted');
}
/** Убирает палитру с элемента: дальше работают цвета его темы. */
export function unpaint(el: HTMLElement) {
  VARS.forEach((k) => el.style.removeProperty(k));
  el.style.removeProperty('--hero-muted');
}
/** Переменные палитры для разметки: летящий вопрос и его картинка всегда в цветах своего вопроса. */
export const qvars = (p: Palette) =>
  `--q-bg:${p.bg};--q-fg:${p.fg};--q-acc:${p.accent};--q-side:${p.side};--q-line:${p.line}${p.muted ? `;--q-muted:${p.muted}` : ''}`;
