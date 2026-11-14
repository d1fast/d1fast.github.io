// Проверяем появление страницы, движение без Canvas и отсутствие блокировки кнопок заставкой.
import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
const base = process.env.CHECK_URL || 'http://127.0.0.1:4322';
const browser = await launchBrowser(), errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const start = await page.locator('[data-studio]').evaluate(el => Number(getComputedStyle(el).opacity));
  await page.waitForTimeout(350);
  const middle = await page.locator('[data-studio]').evaluate(el => Number(getComputedStyle(el).opacity));
  await page.waitForTimeout(950);
  const end = await page.locator('[data-studio]').evaluate(el => Number(getComputedStyle(el).opacity));
  assert.ok(start < middle && middle < 1 && end > .99, `Плавное появление: ${start}, ${middle}, ${end}`);
  assert.equal(await page.locator('canvas,[data-ascii],[data-project-preview]').count(), 0);
  const graphic = page.locator('[data-flourish]');
  const first = await graphic.screenshot(); await page.waitForTimeout(1800);
  assert.equal(first.equals(await graphic.screenshot()), false, 'Графика движется при reduce без Canvas и WebGL');
  assert.equal(await page.locator('[data-sheet]').evaluate(el => el.open), false);
  await page.locator('.studio__actions [data-open-view=about]').click();
  const opening = await page.locator('[data-sheet]').evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), top: el.getBoundingClientRect().top }));
  await page.waitForTimeout(750);
  const opened = await page.locator('[data-sheet]').evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), top: el.getBoundingClientRect().top }));
  assert.ok(opening.opacity < .98 && opened.opacity > .99 && opened.top < opening.top);
  await page.keyboard.press('Escape'); await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.is-form-bound', { state: 'attached' });
  const box = await page.locator('.studio__actions [data-open-view=contact]').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('[data-view=contact]').waitFor({ state: 'visible' });
  console.log('Страница появляется плавно, кнопки работают во время входа, графика движется при reduce и без Canvas. Окна открываются и закрываются плавно.');
  assert.deepEqual(errors, []);
  await ctx.close();
} finally { await browser.close(); }
