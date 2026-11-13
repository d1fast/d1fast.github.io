// Настройки движения и графики не превращают главную в неподвижную картинку.
import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
const base = process.env.CHECK_URL || 'http://127.0.0.1:4322';
const browser = await launchBrowser(), errors = [];
try {
  for (const fallback of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU', reducedMotion: 'reduce' });
    await ctx.addInitScript(noCanvas => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return type.startsWith('webgl') || (noCanvas && type === '2d') ? null : get.call(this, type, ...args);
      };
    }, fallback);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForTimeout(2200);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    const ribbon = page.locator('[data-ribbon]');
    assert.equal(await ribbon.evaluate(el => el.classList.contains('is-drawn')), !fallback);
    const first = await ribbon.screenshot(); await page.waitForTimeout(1400);
    assert.equal(first.equals(await ribbon.screenshot()), false, 'Лента движется при reduce, даже без WebGL');
    if (!fallback) {
      const text = await page.locator('[data-ascii]').textContent(); await page.waitForTimeout(1700);
      assert.notEqual(await page.locator('[data-ascii]').textContent(), text, 'Символьный эскиз тоже меняется');
    }
    assert.equal(await page.locator('[data-sheet]').evaluate(el => el.open), false);
    await page.screenshot({ path: `shots/ribbon-${fallback ? 'svg' : 'canvas'}.png` });
    await page.locator('.studio__actions [data-open-view=about]').click();
    const start = await page.locator('[data-sheet]').evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), top: el.getBoundingClientRect().top }));
    await page.waitForTimeout(750);
    const end = await page.locator('[data-sheet]').evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), top: el.getBoundingClientRect().top }));
    assert.ok(start.opacity < .98 && end.opacity > .99 && end.top < start.top, 'Окно плавно появляется целиком');
    await page.keyboard.press('Escape'); await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
    console.log(fallback ? 'reduce + Canvas отключён: SVG движется, окна работают' : 'reduce + WebGL отключён: лента и символьный эскиз движутся, окна работают');
    await ctx.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
