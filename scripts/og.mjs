// Картинки для ссылок и иконки: нужен запущенный dev или preview.
import { launchBrowser } from './browser.mjs';
import { generateIcons } from './icons.mjs';
const base = process.argv[2] || 'http://localhost:4321/';
const browser = await launchBrowser();
for (const lang of ['ru', 'en']) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, locale: lang === 'ru' ? 'ru-RU' : 'en-US' });
  await page.goto(base + (lang === 'ru' ? '' : 'en/'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
  await page.addStyleTag({ content: '.projects,.studio__aside{display:none!important}.studio{display:grid!important;grid-template-columns:1fr!important;padding:0!important;min-height:630px!important;height:630px}.studio__hero{grid-column:1!important;width:800px;height:630px;margin:auto}.studio__headline>span{font-size:94px!important}.studio__headline em{font-size:90px!important}.ribbon{inset:0!important}' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `public/${lang === 'ru' ? 'og' : 'og-en'}.png` });
  await page.close(); console.log('og', lang);
}
await browser.close();
await generateIcons();
