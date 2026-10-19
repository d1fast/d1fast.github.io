// Картинки для ссылок и иконки: node scripts/og.mjs (нужен запущенный npm run dev для шрифтов).
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

// Как первый экран: кобальт, имя из мелких знаков кода поверх бледной заливки букв, ниже подпись.
const og = (lang) => {
  const ru = lang === 'ru';
  const name = ru ? ['САВЕЛИЙ', 'ЛОПАТИН'] : ['SAVELIY', 'LOPATIN'];
  const tag = ru ? 'Сайты, приложения, Telegram-боты и 3D. От идеи до запуска.' : 'Websites, apps, Telegram bots and 3D. From idea to launch.';
  return `<!doctype html><html><head><base href="${base}"><meta charset="utf-8">
  <style>${fontCss}</style>
  <style>
    html,body{margin:0;width:1200px;height:630px;background:#1D34C9;color:#F3F0E8;overflow:hidden}
    canvas{position:absolute;inset:0}
    .nick{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:12px;font:700 24px/1 'JetBrains Mono'}
    .nick i{width:12px;height:12px;border-radius:50%;background:#FF6A3D}
    .tag{position:absolute;left:64px;bottom:58px;margin:0;font:500 30px/1.3 'Geologica';max-width:760px}
  </style></head><body>
  <canvas id="c" width="2400" height="1260" style="width:1200px;height:630px"></canvas>
  <div class="nick"><i></i>d1fast</div>
  <p class="tag">${tag.replace('. ', '.<br>')}</p>
  <script>
  document.fonts.load('900 150px Geologica').then(() => document.fonts.load('700 20px "JetBrains Mono"')).then(() => {
    const c = document.getElementById('c'), g = c.getContext('2d'); g.scale(2, 2);
    const lines = ${JSON.stringify(name)}, fs = 150, x0 = 60, y0 = 250, lh = fs * .86, ind = [0, 230];
    g.font = '900 ' + fs + 'px Geologica'; g.letterSpacing = (-0.035 * fs) + 'px';
    // бледная заливка букв
    g.fillStyle = 'rgba(243,240,232,.13)';
    lines.forEach((t, i) => g.fillText(t, x0 + ind[i], y0 + i * lh));
    // места знаков: пиксели букв на скрытом холсте
    const m = document.createElement('canvas'); m.width = 1200; m.height = 630; const h = m.getContext('2d');
    h.font = g.font; h.letterSpacing = g.letterSpacing; h.fillStyle = '#000';
    lines.forEach((t, i) => h.fillText(t, x0 + ind[i], y0 + i * lh));
    const d = h.getImageData(0, 0, 1200, 630).data;
    const G = ('{}<>/=+*#01;()[]&%$@~^3D' + ${JSON.stringify(ru ? 'СЛФЖЯ' : 'SLJRZ')} + 'λ▲:').split('');
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const step = 5.2;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '0px';
    for (let y = 0, row = 0; y < 630; y += step * .87, row++) for (let x = row % 2 ? step / 2 : 0; x < 1200; x += step) {
      if (d[(Math.round(y) * 1200 + Math.round(x)) * 4 + 3] < 140) continue;
      const sz = step * 2.05 * (.85 + rnd() * .4);
      g.font = '700 ' + sz + 'px "JetBrains Mono"';
      g.fillStyle = rnd() < .06 ? '#FF6A3D' : '#F3F0E8';
      g.fillText(G[Math.floor(rnd() * G.length)], x + (rnd() - .5) * 2, y + (rnd() - .5) * 2);
    }
    // редкие знаки фона
    for (let i = 0; i < 260; i++) { g.font = '700 ' + (8 + rnd() * 14) + 'px "JetBrains Mono"'; g.fillStyle = 'rgba(243,240,232,' + (.12 + rnd() * .2) + ')'; g.fillText(G[Math.floor(rnd() * G.length)], rnd() * 1200, rnd() * 630); }
    document.body.dataset.ready = '1';
  });
  </script>
  </body></html>`;
};

for (const lang of ['ru', 'en']) {
  const p = await page(1200, 630);
  await p.setContent(og(lang), { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.body.dataset.ready === '1');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `public/${lang === 'ru' ? 'og' : 'og-en'}.png` });
  await p.close();
  console.log('og', lang);
}

// Иконка: кобальтовый квадрат, «d1» из Geologica и оранжевая точка
const iconHtml = (size) => `<html><head><style>${fontCss}</style></head><body style="margin:0;width:${size}px;height:${size}px;background:transparent">
  <div style="width:${size}px;height:${size}px;border-radius:${size * 0.19}px;background:#1D34C9;display:grid;place-items:center;position:relative;overflow:hidden">
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
fs.writeFileSync('public/site.webmanifest', JSON.stringify({ name: 'd1fast', short_name: 'd1fast', start_url: '/', display: 'browser', background_color: '#1D34C9', theme_color: '#1D34C9', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2));
await browser.close();
console.log('icons done');
