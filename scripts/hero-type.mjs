// node scripts/hero-type.mjs — буквы объёмных слов первого экрана: Geologica 800 из public/fonts (вариативный woff2)
// в формате typeface для three.js, только знаки слов из hero.ask[].word (src/i18n/ru.ts и en.ts).
// Результат лежит в репозитории (src/scripts/hero/geologica-800.json), сборке этот скрипт не нужен.
// fontkitten не умеет вариации у woff2 (падает на составных глифах), поэтому точки контуров сдвигаются вручную
// процессором вариаций, взятым у пробного экземпляра шрифта.
import { readFileSync, writeFileSync } from 'node:fs';
import { create } from 'fontkitten';

const WGHT = 800;
const ROOT = new URL('../', import.meta.url);
const words = ['ru', 'en'].flatMap((l) => [...readFileSync(new URL(`src/i18n/${l}.ts`, ROOT), 'utf8').matchAll(/word: '([^']+)'/g)].map((m) => m[1]));
const chars = [...new Set(words.join(''))];
if (!chars.length) throw new Error('в hero.ask нет полей word');

function loadAt(file, wght) {
  const font = create(readFileSync(file));
  font.fvar;
  Object.defineProperty(font, '_variationProcessor', { value: null, writable: true, configurable: true });
  font.glyphsForString('A'); // таблица glyf woff2 раскрывается без вариаций
  const probe = create(readFileSync(file));
  Object.defineProperty(probe, 'CFF2', { value: {} });
  const Proc = probe._variationProcessor.constructor;
  const coords = font.fvar.axis.map((a) => (a.axisTag.trim() === 'wght' ? wght : a.defaultValue));
  const gvp = new Proc(font, coords);
  const Pt = font._transformedGlyphs.find((g) => g.points?.length).points[0].constructor;
  const M = font.hmtx.metrics, n = M.length, get = (i) => (M.get ? M.get(i) : M[i]);
  const adv = (id) => get(id < n ? id : n - 1).advance;
  const advVar = (id) => adv(id) + (font.HVAR ? gvp.getAdvanceAdjustment(id, font.HVAR) : 0);
  const phantom = (a) => [new Pt(false, true, 0, 0), new Pt(false, true, a, 0), new Pt(false, true, 0, 0), new Pt(false, true, 0, 0)];
  function contours(id) {
    const g = font._transformedGlyphs[id];
    if (!g || g.numberOfContours === 0) return [];
    if (g.numberOfContours > 0) {
      const pts = g.points.map((p) => p.copy());
      pts.push(...phantom(adv(id)));
      gvp.transformPoints(id, pts);
      pts.length -= 4;
      const out = []; let cur = [];
      for (const p of pts) { cur.push(p); if (p.endContour) { out.push(cur); cur = []; } }
      return out;
    }
    // составной глиф (Й, Ё…): сдвиги частей тоже зависят от веса
    const comps = g.components.map((c) => ({ ...c }));
    const pts = comps.map((c) => new Pt(true, true, c.dx, c.dy));
    pts.push(...phantom(adv(id)));
    gvp.transformPoints(id, pts);
    return comps.flatMap((c, i) => contours(c.glyphID).map((ct) => ct.map((p) => new Pt(p.onCurve, p.endContour,
      p.x * (c.scaleX ?? 1) + p.y * (c.scale01 ?? 0) + pts[i].x, p.y * (c.scaleY ?? 1) + p.x * (c.scale10 ?? 0) + pts[i].y))));
  }
  return { font, contours, advVar };
}

/** квадратичные контуры TrueType → строка typeface (m/l/q; у q сначала конечная точка, потом контрольная) */
function toTypeface(cts) {
  const R = Math.round;
  let o = '', x0 = Infinity, x1 = -Infinity;
  for (const c of cts) {
    if (!c.length) continue;
    const s = c.findIndex((p) => p.onCurve);
    const pts = s >= 0 ? [...c.slice(s), ...c.slice(0, s)]
      : [{ x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2, onCurve: true }, ...c.slice(1), c[0]];
    o += `m ${R(pts[0].x)} ${R(pts[0].y)} `;
    let off = null;
    for (const p of [...pts.slice(1), pts[0]]) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      if (p.onCurve) { o += off ? `q ${R(p.x)} ${R(p.y)} ${R(off.x)} ${R(off.y)} ` : `l ${R(p.x)} ${R(p.y)} `; off = null; }
      else { if (off) o += `q ${R((off.x + p.x) / 2)} ${R((off.y + p.y) / 2)} ${R(off.x)} ${R(off.y)} `; off = p; }
    }
  }
  return { o: o.trim(), x_min: x0 === Infinity ? 0 : R(x0), x_max: x1 === -Infinity ? 0 : R(x1) };
}

const glyphs = {};
let upm = 2000, asc = 0, desc = 0, cap = 0;
for (const f of ['geologica-lat', 'geologica-cyr']) {
  const { font, contours, advVar } = loadAt(new URL(`public/fonts/${f}.woff2`, ROOT), WGHT);
  upm = font.unitsPerEm; asc = font.ascent; desc = font.descent; cap = font.capHeight || cap;
  for (const ch of chars) {
    const cp = ch.codePointAt(0);
    if (glyphs[ch] || !font.characterSet.includes(cp)) continue;
    const id = font._cmapProcessor.lookup(cp);
    glyphs[ch] = { ha: Math.round(advVar(id)), ...toTypeface(contours(id)) };
  }
}
const miss = chars.filter((c) => !glyphs[c]);
if (miss.length) throw new Error('нет знаков: ' + miss.join(''));
const json = { glyphs, familyName: 'Geologica', ascender: asc, descender: desc, capHeight: cap, underlinePosition: -100, underlineThickness: 50,
  boundingBox: { xMin: 0, yMin: desc, xMax: upm, yMax: asc }, resolution: upm, original_font_information: { format: 0, fontFamily: 'Geologica', license: 'SIL Open Font License 1.1' } };
const out = new URL('src/scripts/hero/geologica-800.json', ROOT);
writeFileSync(out, JSON.stringify(json));
console.log(`${chars.join('')} → ${out.pathname} (${JSON.stringify(json).length} B), слова: ${words.join(' ')}`);
