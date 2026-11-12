// Картинки для ссылок и иконки: нужен запущенный dev или preview.
import { launchBrowser } from './browser.mjs';
import { generateIcons } from './icons.mjs';
const base = process.argv[2] || 'http://localhost:4321/';
const browser = await launchBrowser();
for (const lang of ['ru', 'en']) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(base + (lang === 'ru' ? '' : 'en/'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
  await page.addStyleTag({ content: '.site-header,.projects,.studio__spark,.studio__footer a{display:none!important}.studio{display:flex!important;padding:46px 56px!important;min-height:100vh}.studio__hero{width:100%;padding:0!important}.studio__headline>span{font-size:96px!important}.studio__headline em{font-size:180px!important;margin-left:6%!important}.studio__intro{font-size:18px!important;margin-top:36px!important;margin-right:0!important}.studio__footer{position:absolute;bottom:24px;left:56px;right:56px;padding:0!important;border:0!important;font-size:12px!important}' });
  await page.screenshot({ path: `public/${lang === 'ru' ? 'og' : 'og-en'}.png` });
  await page.close(); console.log('og', lang);
}
await browser.close();
await generateIcons();
