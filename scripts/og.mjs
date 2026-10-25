// Картинки для ссылок и иконки: node scripts/og.mjs (нужен запущенный npm run dev: снимается первый экран).
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4321/';
const exe = ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
// Шрифты встраиваются как data-URI: страница рендерится из about:blank, и внешние адреса не подходят.
const fontCss = fs.readFileSync('src/styles/fonts.generated.css', 'utf8')
  .split('\n').filter((l) => /Geologica|JetBrains Mono/.test(l) && !/italic/.test(l))
  .map((l) => l.replace(/url\(\/fonts\/([^)]+)\)/, (_, f) => `url(data:font/woff2;base64,${fs.readFileSync('public/fonts/' + f).toString('base64')})`))
  .join('\n');

const page = (w, h, scale = 1) => browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });

// Снимок первого экрана: ответ, текст обо мне и кривые, сошедшиеся в цель, на жёлтом, без шапки и кнопок.
for (const lang of ['ru', 'en']) {
  const p = await page(1200, 630);
  await p.goto(base + (lang === 'ru' ? '' : 'en/'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  // рассказ пропускается сразу к ответу: «Тогда вы попали по адресу» и кривые в цели
  await p.click('[data-hero-skip]');
  await p.mouse.move(2, 2);
  await p.addStyleTag({ content: '.site-header,.dots,.hero__cta,.hero__cta>*,.hero__skip,.cursor{visibility:hidden!important}.hero__sub{font-size:24px!important}' });
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `public/${lang === 'ru' ? 'og' : 'og-en'}.png` });
  await p.close();
  console.log('og', lang);
}

// Иконка: почти чёрный квадрат, «d1» из Geologica и оранжевая точка
const iconHtml = (size) => `<html><head><style>${fontCss}</style></head><body style="margin:0;width:${size}px;height:${size}px;background:transparent">
  <div style="width:${size}px;height:${size}px;border-radius:${size * 0.19}px;background:#121211;display:grid;place-items:center;position:relative;overflow:hidden">
    <span style="font:900 ${size * 0.5}px/1 Geologica;letter-spacing:-.04em;color:#F3F0E8;margin-top:-${size * 0.04}px">d1</span>
    <i style="position:absolute;right:${size * 0.16}px;bottom:${size * 0.17}px;width:${size * 0.13}px;height:${size * 0.13}px;border-radius:50%;background:#FF6A3D"></i>
  </div></body></html>`;
for (const [file, size] of [['apple-touch-icon.png', 180], ['favicon-32.png', 32], ['icon-192.png', 192], ['icon-512.png', 512], ['favicon-64.png', 64]]) {
  const p = await page(size, size, 1);
  await p.setContent(iconHtml(size), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.load('900 40px Geologica'));
  await p.waitForTimeout(100);
  await p.screenshot({ path: `public/${file}`, omitBackground: true });
  await p.close();
}
// SVG-иконка вкладки с той же картинкой внутри: текст в SVG без шрифта нарисовался бы системным
const png64 = fs.readFileSync('public/favicon-64.png').toString('base64');
fs.writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${png64}"/></svg>`);
fs.rmSync('public/favicon-64.png');
fs.writeFileSync('public/site.webmanifest', JSON.stringify({ name: 'd1fast', short_name: 'd1fast', start_url: '/', display: 'browser', background_color: '#FFD43B', theme_color: '#FFD43B', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2));
await browser.close();
console.log('icons done');
