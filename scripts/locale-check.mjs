// Автоязык сохраняет прямые ссылки, не создаёт циклов и ничего не пишет в хранилище.
import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
const base = process.env.CHECK_URL || 'http://127.0.0.1:4322';
const browser = await launchBrowser(), errors = [];
try {
  for (const [languages, path, expected, suffix] of [
    [['ru-RU','en-US'], '/en/?from=test#about', 'ru', '/?from=test#about'],
    [['en-GB','ru'], '/?from=test#contact', 'en', '/en/?from=test#contact'],
    [['de-DE','ru'], '/en/policy/', 'ru', '/policy/'],
    [['fr-FR'], '/work/perfume/', 'en', '/en/work/perfume/'],
    [['ru'], '/en/#work-pena', 'ru', '/#work-pena'],
    [['en-US'], '/404.html', 'en', '/404.html'],
  ]) {
    const ctx = await browser.newContext({ locale: languages[0] });
    await ctx.addInitScript(value => { Object.defineProperty(navigator, 'languages', { get: () => value }); }, languages);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    let documents = 0; page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++; });
    await page.goto(base + path); await page.waitForURL(base + suffix);
    await page.waitForFunction(lang => document.documentElement.lang === lang, expected); await page.waitForTimeout(300);
    assert.ok(documents <= 2, `Нет цикла перенаправлений: ${documents}`);
    if (suffix.includes('#')) await page.locator(`[data-view="${suffix.split('#')[1]}"]`).waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => [localStorage.length,sessionStorage.length,document.cookie]), [0,0,'']);
    assert.equal(await page.locator('.site-header,[hreflang][title]').count(), 0);
    console.log(`${languages.join(', ')} → ${expected} ${suffix}`);
    await ctx.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
