// Картинки для ссылок и иконки: node scripts/og.mjs (нужен запущенный npm run dev: снимается первый экран).
import { launchBrowser } from './browser.mjs';
import { generateIcons } from './icons.mjs';

const base = process.argv[2] || 'http://localhost:4321/';
const browser = await launchBrowser();
const page = (w, h, scale = 1) => browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });

// Снимок бумажного сада после посадки птицы.
for (const lang of ['ru', 'en']) {
  const p = await page(1200, 630);
  await p.goto(base + (lang === 'ru' ? '' : 'en/'), { waitUntil: 'networkidle' });
  await p.locator('.hero.has-garden').waitFor();
  await p.waitForTimeout(3800);
  await p.mouse.move(2, 2);
  await p.addStyleTag({ content: '.site-header,.dots,.hero__cta,.hero__cta>*,.hero__scroll,.cursor{visibility:hidden!important}.hero__sub{font-size:20px!important}' });
  await p.waitForTimeout(100);
  await p.screenshot({ path: `public/${lang === 'ru' ? 'og' : 'og-en'}.png` });
  await p.close();
  console.log('og', lang);
}

await browser.close();
await generateIcons();
console.log('icons done');
