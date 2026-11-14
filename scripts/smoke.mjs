// Проверяем настоящие действия посетителя. Все POST-запросы перехватываются, Telegram не вызывается.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launchBrowser } from './browser.mjs';
const base = (process.env.CHECK_URL || 'http://127.0.0.1:4322').replace(/\/$/, '');
const browser = await launchBrowser();
const errors = [], sent = [];
fs.mkdirSync('shots', { recursive: true });
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
    await ctx.route('**/*', async route => {
      const req = route.request();
      if (req.url() === 'https://form.test/submit') {
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        sent.push(req.postDataJSON());
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{"ok":true}' });
      }
      if (req.method() === 'POST') return route.abort();
      if (req.resourceType() === 'document' && req.url().startsWith(base)) {
        const response = await route.fetch();
        const html = (await response.text()).replace(/data-endpoint(?:="[^"]*")?/, 'data-endpoint="https://form.test/submit"');
        return route.fulfill({ response, body: html });
      }
      return route.continue();
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    for (const lang of ['ru', 'en']) {
      await page.addInitScript(value => { Object.defineProperty(navigator, 'languages', { configurable: true, get: () => [value] }); }, lang);
      const home = base + (lang === 'ru' ? '/' : '/en/');
      const requests = [];
      const record = req => requests.push(req.url());
      page.on('request', record);
      await page.goto(home); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1300);
      assert.equal(await page.locator('.project-link').count(), 3);
      assert.equal(await page.locator('.site-header,[data-light-shift],.project-link__number,.studio__footer').count(), 0);
      assert.equal(await page.locator('a[href^="mailto:"]').count(), 0);
      assert.equal(await page.locator('.contact__email').count(), 0);
      assert.equal(requests.some(url => /\.(mp4|webm)(\?|$)/.test(url)), false, 'Главная не скачивает скрытые видео');
      page.off('request', record);
      const headline = await page.locator('.studio__headline').evaluate(h => [...h.children].map(line => { const r = document.createRange(); r.selectNodeContents(line); const b = r.getBoundingClientRect(); return { left: b.left, right: b.right, viewport: innerWidth }; }));
      for (const line of headline) assert.ok(line.left >= 0 && line.right <= line.viewport, JSON.stringify(line));
      await page.screenshot({ path: `shots/studio-${lang}-${name}.png` });
      const about = page.locator('.studio__actions [data-open-view=about]');
      await about.click(); await page.locator('[data-view=about]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.process-step').count(), 4);
      await page.locator('.process-step summary').nth(1).click();
      await page.waitForFunction(() => document.querySelectorAll('.process-step')[1].open);
      await page.waitForTimeout(500);
      await page.locator('.sheet__close').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true, 'Фокус остаётся внутри окна');
      await page.keyboard.press('Escape'); await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
      assert.equal(await about.evaluate(el => el === document.activeElement), true, 'Фокус вернулся на открывшую окно кнопку');
      if (name === 'desktop') {
        await page.locator('.project-link').first().hover(); await page.waitForTimeout(550);
        assert.equal(await page.locator('[data-project-preview],[data-preview],.project-preview').count(), 0, 'Наведением не вызывается предпросмотр');
      }
      for (const [i, slug] of ['perfume', 'ugli-bot', 'pena'].entries()) {
        await page.locator(`.project-link[data-open-view=work-${slug}]`).click();
        const view = page.locator(`[data-view=work-${slug}]`), video = view.locator('video');
        await view.waitFor({ state: 'visible' });
        await video.evaluate(v => new Promise(resolve => { if (v.readyState >= 2) resolve(); else v.addEventListener('loadeddata', resolve, { once: true }); }));
        await page.waitForTimeout(800);
        assert.ok(await video.evaluate(v => !v.paused && v.currentTime > 0), `${slug}: видео идёт`);
        assert.equal(await page.locator('[data-video]').evaluateAll(v => v.filter(x => !x.paused).length), 1);
        await view.locator('[data-video-toggle]').click();
        assert.equal(await video.evaluate(v => v.paused), true);
        await view.locator('[data-video-seek]').evaluate(el => { el.value = '50'; el.dispatchEvent(new Event('input')); });
        const position = await video.evaluate(v => v.currentTime / v.duration);
        assert.ok(position > .47 && position < .53, 'Перемотка меняет настоящий кадр');
        await view.locator('[data-video-toggle]').click();
        assert.equal(await video.evaluate(v => v.paused), false);
        await page.screenshot({ path: `shots/case-${slug}-${lang}-${name}.png` });
        if (i === 2) {
          await view.locator('.project__details summary').click();
          await page.waitForFunction(() => [...document.querySelectorAll('[data-view=work-pena] figure')].filter(f => getComputedStyle(f).display !== 'none').every(f => { const i = f.querySelector('img'); return i.complete && i.naturalWidth > 0; }));
          if (name === 'mobile') assert.equal(await view.locator('.project__gallery .is-portrait').count(), 2);
        }
        await page.keyboard.press('Escape'); await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
        assert.equal(await video.evaluate(v => v.paused), true);
      }
      await page.goForward(); await page.locator('[data-view=work-pena]').waitFor({ state: 'visible' });
      await page.locator('[data-view=work-pena] [data-case-step="1"]').click();
      await page.locator('[data-view=work-perfume]').waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).hash, '#work-perfume');
      await page.goBack(); await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
      await page.locator('.studio__actions [data-open-view=contact]').click();
      const form = page.locator('[data-contact-form]');
      await page.locator('[data-view=contact]').waitFor({ state: 'visible' });
      await form.locator('button[type=submit]').click();
      await page.locator('[data-form-status][data-kind=err]').waitFor();
      await form.locator('[name=name]').fill('Проверка');
      await form.locator('.letter__options label').nth(1).click();
      await form.locator('[name=c_email]').fill('portfolio-check@example.org');
      await form.locator('[name=message]').fill('Проверка новой формы без отправки сообщения');
      await form.locator('[data-open-view=privacy]').click();
      await page.locator('[data-view=privacy]').waitFor({ state: 'visible' });
      await page.locator('[data-back-to-form]').click();
      await page.locator('[data-view=contact]').waitFor({ state: 'visible' });
      assert.equal(await form.locator('[name=message]').inputValue(), 'Проверка новой формы без отправки сообщения');
      await form.locator('[name=consent]').check();
      await form.locator('button[type=submit]').click();
      await page.locator('[data-form-status][data-kind=ok]').waitFor();
      await form.locator('[data-via=tg]').waitFor({ state: 'visible' });
      assert.equal(await form.locator('button[type=submit] svg').count(), 1, 'Иконка отправки сохранилась');
      const payload = sent.at(-1);
      assert.equal(payload.contacts.email, 'portfolio-check@example.org');
      assert.equal(payload.lang, lang); assert.ok(payload.id); assert.equal(payload.consent, true);
      await page.keyboard.press('Escape'); await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
      console.log(`${name} ${lang}: три кейса, видео, история, фокус, политика и форма OK`);
    }
    for (const path of ['/policy/', '/en/policy/', '/work/perfume/', '/en/work/perfume/', '/404.html']) {
      const response = await page.goto(base + path); assert.equal(response.status(), 200, path);
      assert.equal(await page.evaluate(() => document.body.scrollWidth > innerWidth + 1), false, path);
    }
    await ctx.close();
  }
  const page = await browser.newPage({ viewport: { width: 320, height: 640 } });
  page.on('pageerror', e => errors.push(e.message));
  for (const lang of ['', 'en/']) {
    await page.addInitScript(value => { Object.defineProperty(navigator, 'languages', { configurable: true, get: () => [value] }); }, lang ? 'en' : 'ru');
    await page.goto(`${base}/${lang}`); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
    const right = await page.locator('.studio__headline em').evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; });
    assert.ok(right <= 320, `Заголовок ${lang} помещается на 320px: ${right}`);
    await page.locator('.studio__actions [data-open-view=contact]').click(); await page.waitForTimeout(700);
    assert.equal(await page.locator('[data-sheet-body]').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'У формы нет боковой прокрутки на узком телефоне');
  }
  await page.close();
  assert.equal(sent.length, 4); assert.deepEqual(errors, []);
  console.log('Узкий телефон 320px и прямые ссылки OK. Все 4 заявки перехвачены локально, ошибок JavaScript нет.');
} finally { await browser.close(); }
