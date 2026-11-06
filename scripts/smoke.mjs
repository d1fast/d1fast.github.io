// Проверка реального браузерного поведения. Заявки перехватываются, Telegram не вызывается.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launchBrowser } from './browser.mjs';

const base = process.env.CHECK_URL || 'http://127.0.0.1:4321';
fs.mkdirSync('shots', { recursive: true });
const browser = await launchBrowser();
const errors = [];
let sent = 0;
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, isMobile: name === 'mobile', hasTouch: name === 'mobile', deviceScaleFactor: name === 'mobile' ? 2 : 1 });
    await ctx.route('https://form.test/submit', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type' } });
      const payload = route.request().postDataJSON();
      assert.equal(payload.contacts.tg, '@portfolio_check');
      assert.equal(payload.message, 'Проверка формы без отправки сообщения');
      assert.ok(payload.id);
      sent++;
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' });
    });
    await ctx.route(`${base}/**`, async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const response = await route.fetch();
      const html = (await response.text()).replace(/data-endpoint(?:="[^"]*")?/, 'data-endpoint="https://form.test/submit"');
      await route.fulfill({ response, body: html });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    for (const lang of ['', '/en']) {
      await page.goto(`${base}${lang}/`);
      const h1 = page.locator('.hero h1');
      await h1.waitFor({ state: 'visible' });
      assert.ok((await h1.innerText()).length > 10);
      await page.waitForTimeout(3600);
      await page.locator('.hero.has-garden').waitFor();
      assert.equal(await page.locator('.site-header__name').count(), 0);
      assert.equal(await page.locator('.hero__eyebrow').count(), 0);
      const frame = await page.locator('.hero__primary').boundingBox();
      assert.ok(frame.y + frame.height <= viewport.height + 1, 'Переход к работам должен быть виден сразу');
      assert.ok(await page.locator('.hero__primary').isVisible());
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `${name} ${lang}: горизонтальное переполнение`);
      await page.screenshot({ path: `shots/hero-${lang ? 'en' : 'ru'}-${name}.png` });
    }
    for (const id of ['services', 'works', 'process', 'contacts']) {
      // Query forces a document load instead of just changing the fragment.
      await page.goto(`${base}/?check=${id}#${id}`);
      await page.locator(`#${id}.is-current`).waitFor();
      await page.waitForTimeout(id === 'contacts' ? 11000 : 2200);
      if (id === 'services') {
        await page.locator('[data-services-btn]').nth(4).click();
        await page.locator('[data-svc-w=product].has-product').waitFor();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `shots/product-${name}.png` });
        await page.locator('[data-services-btn]').last().click();
        await page.waitForTimeout(1100);
        assert.ok(await page.locator('.svc-wheel').isVisible());
        assert.equal(await page.locator('.svc-wheel text').count(), 6);
        await page.locator('[data-svc-hit]').click();
        await page.waitForTimeout(3500);
      }
      if (id === 'works') {
        if (name === 'mobile') {
          const frames = page.locator('[data-works-mobile="0"] .works__frames');
          const box = await frames.boundingBox();
          const cdp = await ctx.newCDPSession(page);
          const y = box.y + box.height * .5;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .85, y }] });
          for (let i = 1; i <= 12; i++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (.85 - .7 * i / 12), y }] });
            await page.waitForTimeout(20);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForTimeout(700);
          assert.ok(await frames.evaluate((el) => el.scrollLeft > el.clientWidth * .8));
          assert.ok(await page.locator('#works.is-current').isVisible());
          await cdp.detach();
        }
        await page.locator('[data-works-dot="2"]').click();
        await page.waitForTimeout(1900);
        assert.equal(await page.locator('[data-works-proj="2"]').isVisible(), true);
        assert.equal(await page.locator('.works__meta').count(), 0);
      }
      if (id === 'process') {
        await page.locator('[data-process-btn]').last().click();
        await page.waitForTimeout(3300);
        const circle = page.locator('[data-process-check-c]');
        assert.equal(await circle.evaluate((el) => getComputedStyle(el).fillOpacity), '1');
      }
      if (id === 'contacts') {
        const form = page.locator('[data-contact-form]');
        await form.locator('button[type=submit]').click();
        await page.locator('[data-form-status][data-kind=err]').waitFor();
        await form.locator('[name=name]').fill('Проверка');
        await form.locator('[name=c_tg]').fill('portfolio_check');
        await form.locator('[name=message]').fill('Проверка формы без отправки сообщения');
        await form.locator('[name=consent]').check();
        await form.locator('button[type=submit]').click();
        await page.locator('[data-form-status][data-kind=ok]').waitFor({ state: 'attached' });
      }
      await page.screenshot({ path: `shots/${id}-${name}.png` });
      console.log(`${name}: ${id} OK`);
    }
    // Переход по настоящим ссылкам после завершения шторки.
    if (name === 'mobile') await page.keyboard.press('Home');
    else await page.locator('[data-dot=top]').click();
    await page.locator('#top.is-current').waitFor();
    await page.locator('.stage-fx').waitFor({ state: 'hidden' });
    await page.locator('.hero__primary').click();
    await page.locator('#works.is-current').waitFor();
    for (const path of ['/work/perfume/', '/en/work/perfume/', '/policy/', '/en/policy/', '/404.html']) {
      const response = await page.goto(base + path);
      assert.equal(response.status(), 200, path);
      await page.locator('h1:visible').first().waitFor();
    }
    await ctx.close();
    console.log(`${name}: обложка RU/EN, разделы, колесо, галерея, форма и внутренние страницы OK`);
  }
  assert.equal(sent, 2);
  assert.deepEqual(errors, []);
  console.log('OK: две заявки перехвачены локально, ошибок JavaScript нет');
} finally {
  await browser.close();
}
