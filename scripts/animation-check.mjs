// Движение не зависит от настройки уменьшения анимаций и доступности WebGL.
import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
const base = process.env.CHECK_URL || 'http://127.0.0.1:4322';
const browser = await launchBrowser(), errors = [];
try {
  for (const fallback of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    if (fallback) await ctx.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type.startsWith('webgl') ? null : get.call(this, type, ...args); }; });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForTimeout(2200);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    await page.locator('[data-light-shift]').first().click(); await page.waitForTimeout(1200);
    await page.addStyleTag({ content: '.studio,.site-header,.project-preview{visibility:hidden!important}' });
    const field = page.locator('[data-lightfield]');
    const first = await field.screenshot(); await page.waitForTimeout(1200);
    assert.equal(first.equals(await field.screenshot()), false, 'Фон движется при reduce');
    if (!fallback) {
      assert.equal(await field.evaluate(el => el.classList.contains('has-field')), true);
      await page.locator('[data-light-canvas]').evaluate(c => c.getContext('webgl').getExtension('WEBGL_lose_context').loseContext());
      await page.waitForTimeout(1800);
      assert.equal(await field.evaluate(el => el.classList.contains('has-field')), false);
      const before = await field.screenshot(); await page.waitForTimeout(1300);
      assert.equal(before.equals(await field.screenshot()), false, 'CSS-фон продолжает движение после потери контекста');
    } else {
      await page.waitForTimeout(11500);
      assert.equal(await page.locator('[data-sheet]').evaluate(el => el.open), false, 'Главная не открывает окна без действий посетителя');
    }
    await page.screenshot({ path: `shots/studio-motion-${fallback ? 'fallback' : 'context-loss'}.png` });
    console.log(fallback ? 'reduce + WebGL отключён: фон движется, самопроизвольных переходов нет' : 'reduce + потеря WebGL: движение продолжается');
    await ctx.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.waitForTimeout(1300);
  await page.locator('.site-header [data-open-view=about]').click();
  const start = await page.locator('[data-sheet]').evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), top: el.getBoundingClientRect().top }));
  await page.waitForTimeout(750);
  const end = await page.locator('[data-sheet]').evaluate(el => ({ opacity: Number(getComputedStyle(el).opacity), top: el.getBoundingClientRect().top }));
  assert.ok(start.opacity < .98 && end.opacity > .99 && end.top < start.top, 'Окно целиком плавно появляется, включая фон и рамку');
  await page.keyboard.press('Escape'); await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
  await page.close(); console.log('Окно плавно появляется целиком и закрывается по Escape');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
