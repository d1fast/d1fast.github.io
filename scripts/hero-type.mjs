// node scripts/hero-type.mjs — буквы стеклянных фраз первого экрана: Unbounded из public/fonts (вариативный woff2)
// в формате typeface для three.js, только знаки фраз hero.beats (src/i18n/ru.ts и en.ts).
// Результат лежит в репозитории (src/scripts/hero/unbounded.json), сборке этот скрипт не нужен.
// fontkitten не умеет вариации у woff2 (падает на составных глифах), поэтому точки контуров сдвигаются вручную
// процессором вариаций, взятым у пробного экземпляра шрифта. В вариативном шрифте контуры буквы перекрываются
// (ножки «П» отдельно от перекладины), а у «в» и «B» дыра одним самопересекающимся контуром; шрифт заливается
// по правилу ненулевой обмотки, а three.js режет такие контуры неверно: дыры и щели в лице буквы.
// Поэтому кривые раскладываются в ломаные и пересобираются Clipper'ом по тому же правилу в простые контуры
// и дыры (clipper-lib, только для скрипта).
import { readFileSync, writeFileSync } from 'node:fs';
import { create } from 'fontkitten';
import ClipperLib from 'clipper-lib';

const WGHT = 700;
const ROOT = new URL('../', import.meta.url);
// все строки внутри beats: [...] обоих словарей; «|» в строке — место переноса на узком экране
const phrases = ['ru', 'en'].flatMap((l) => {
  const src = readFileSync(new URL(`src/i18n/${l}.ts`, ROOT), 'utf8');
  const block = src.match(/beats:\s*\[([\s\S]*?)\]\s*,\s*\n\s*sub:/);
  if (!block) throw new Error(`в ${l}.ts нет hero.beats`);
  return [...block[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\|/g, ' '));
});
const chars = [...new Set(phrases.join('').replace(/ /g, ' '))];
if (!chars.length) throw new Error('в hero.beats нет строк');

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

/** контур TrueType (точки на кривой и контрольные) → ломаная; шаг по кривой около STEP единиц шрифта */
const STEP = 22;
function flatten(c) {
  const s = c.findIndex((p) => p.onCurve);
  const pts = s >= 0 ? [...c.slice(s), ...c.slice(0, s)]
    : [{ x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2, onCurve: true }, ...c.slice(1), c[0]];
  const out = [[pts[0].x, pts[0].y]];
  let cur = pts[0], off = null;
  const quad = (a, k, b) => {
    const n = Math.max(2, Math.ceil((Math.hypot(k.x - a.x, k.y - a.y) + Math.hypot(b.x - k.x, b.y - k.y)) / STEP));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * a.x + 2 * u * t * k.x + t * t * b.x, u * u * a.y + 2 * u * t * k.y + t * t * b.y]);
    }
  };
  for (const p of [...pts.slice(1), pts[0]]) {
    if (p.onCurve) { if (off) quad(cur, off, p); else out.push([p.x, p.y]); cur = p; off = null; }
    else { if (off) { const mid = { x: (off.x + p.x) / 2, y: (off.y + p.y) / 2 }; quad(cur, off, mid); cur = mid; } off = p; }
  }
  out.pop(); // последняя точка совпадает с первой
  return out;
}
const SC = 16; // Clipper считает в целых: координаты шрифта умножаются на SC
/** контуры буквы → простые контуры без перекрытий в формате typeface: заливки по часовой, дыры против (как ждёт three.js).
 *  Все контуры вместе заливаются по правилу ненулевой обмотки, как у самого шрифта */
function toTypeface(cts) {
  const rings = cts.filter((c) => c.length > 1).map(flatten).filter((r) => r.length > 2);
  if (!rings.length) return { o: '', x_min: 0, x_max: 0 };
  const paths = rings.map((r) => r.map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) })));
  const simple = ClipperLib.Clipper.SimplifyPolygons(paths, ClipperLib.PolyFillType.pftNonZero);
  const R = Math.round;
  let o = '', x0 = Infinity, x1 = -Infinity;
  for (const path of simple) {
    let r = path.map((p) => [p.X / SC, p.Y / SC]);
    if (r.length < 3) continue;
    // у Clipper заливка против часовой, дыры по часовой; three.js ждёт наоборот
    r = r.reverse();
    o += `m ${R(r[0][0])} ${R(r[0][1])} `;
    for (let i = 1; i < r.length; i++) o += `l ${R(r[i][0])} ${R(r[i][1])} `;
    for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  }
  return { o: o.trim(), x_min: x0 === Infinity ? 0 : R(x0), x_max: x1 === -Infinity ? 0 : R(x1) };
}

const glyphs = {};
let upm = 1000, asc = 0, desc = 0, cap = 0;
for (const f of ['unbounded-lat', 'unbounded-cyr']) {
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
const json = { glyphs, familyName: 'Unbounded', ascender: asc, descender: desc, capHeight: cap, underlinePosition: -100, underlineThickness: 50,
  boundingBox: { xMin: 0, yMin: desc, xMax: upm, yMax: asc }, resolution: upm, original_font_information: { format: 0, fontFamily: 'Unbounded', license: 'SIL Open Font License 1.1' } };
const out = new URL('src/scripts/hero/unbounded.json', ROOT);
writeFileSync(out, JSON.stringify(json));
console.log(`${chars.join('')} → ${out.pathname} (${JSON.stringify(json).length} B)\n${phrases.join(' / ')}`);
