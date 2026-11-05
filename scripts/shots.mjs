// Скриншоты страниц для проверки: node scripts/shots.mjs [baseUrl] [path?v=1 ...]
// Кладёт файлы в shots/<имя>-<desktop|mobile>.png. Нужен запущенный dev или preview.
import { launchBrowser } from './browser.mjs';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4321';
const paths = process.argv.slice(3);
const list = paths.length ? paths : ['/'];
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const wait = Number(process.env.SHOT_WAIT || 6000);
const full = process.env.SHOT_FULL === '1';
const reduced = process.env.SHOT_REDUCED === '1';
const scrollTo = process.env.SHOT_SCROLL || '';
fs.mkdirSync('shots', { recursive: true });

const browser = await launchBrowser();
for (const p of list) {
  for (const [name, vp] of Object.entries(viewports)) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor || 1, reducedMotion: reduced ? 'reduce' : 'no-preference', locale: 'ru-RU' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    const target = new URL(p, base);
    if (scrollTo?.startsWith('#')) target.hash = scrollTo;
    await page.goto(target.href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(wait);
    if (full) {
      // Прокручиваем страницу до низа и обратно, чтобы сработали появления блоков.
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += vp.height * 0.6) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(250); }
      await page.waitForTimeout(1200);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(900);
    }
    if (scrollTo && !scrollTo.startsWith('#')) { await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), scrollTo); await page.waitForTimeout(1800); }
    const safe = ((p.replace(/^\//, '') || 'index') + (scrollTo ? scrollTo : '')).replace(/[^a-z0-9]+/gi, '-');
    const file = `shots/${safe}-${name}.png`;
    await page.screenshot({ path: file, fullPage: full });
    console.log(file, errors.length ? `ERRORS: ${errors.join(' | ')}` : 'ok');
    await ctx.close();
  }
}
await browser.close();
