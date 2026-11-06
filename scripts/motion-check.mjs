// Регрессии: самопроизвольные повторы, лишние перелистывания и движение камеры.
import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
const base = process.env.CHECK_URL || 'http://127.0.0.1:4322';
const browser = await launchBrowser();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.locator('#top.is-current').waitFor();
  await page.locator('#services.is-current').waitFor({ timeout: 18000 });
  await page.locator('.stage-fx').waitFor({ state: 'hidden' });
  await page.locator('[data-dot=top]').click();
  await page.locator('#top.is-current').waitFor();
  await page.waitForTimeout(14000);
  assert.ok(await page.locator('#top').evaluate((el) => el.classList.contains('is-current')), 'Возврат на обложку не запускает новый автопереход');
  console.log('Автопереход после заставки срабатывает один раз');

  await page.goto(`${base}/?interaction`);
  await page.locator('#top.is-current').waitFor();
  await page.mouse.move(100, 300); await page.mouse.move(160, 320);
  await page.waitForTimeout(14000);
  assert.ok(await page.locator('#top').evaluate((el) => el.classList.contains('is-current')), 'Действие посетителя отменяет автопереход');
  console.log('Ручное управление отменяет автопереход');

  await page.goto(`${base}/?motion#services`);
  await page.waitForTimeout(1800);
  // Наведение на окно не должно останавливать показ после окончания сцены.
  await page.locator('[data-services-screen]').hover();
  await page.mouse.move(1000,450); await page.mouse.move(1005,450);
  await page.locator('[data-svc-w=dash].is-shown').waitFor({timeout:12000});
  assert.equal(await page.locator('[data-services-btn]').nth(1).getAttribute('aria-pressed'),'true');
  console.log('Сцена сайта завершилась, открылся следующий пункт даже при наведении');

  await page.locator('[data-services-btn]').last().click();
  await page.locator('[data-services-screen]').hover();
  await page.mouse.move(1000, 450);
  await page.mouse.move(1005, 450);
  await page.waitForTimeout(1000);
  const cam = page.locator('[data-svc-w=promo] .svc-cam');
  const common = await cam.getAttribute('style');
  await page.waitForTimeout(4600);
  assert.equal(await cam.getAttribute('style'), common, 'Во время вращения колеса камера стоит');
  await page.waitForTimeout(2300);
  const prize = await cam.getAttribute('style');
  assert.notEqual(prize, common, 'Камера приближает готовый промокод');
  await page.waitForTimeout(300);
  assert.equal(await cam.getAttribute('style'), prize, 'После результата камера остаётся на промокоде');
  assert.equal(await page.locator('[data-svc-w=promo] .svc-code__t').textContent(), 'SALE15');
  await page.locator('[data-svc-w=sites].is-shown').waitFor({timeout:4000});
  console.log('Колесо: общий план, приближение к промокоду, следующий пункт');

  await page.goto(`${base}/?questions#process`);
  await page.locator('#process.is-current').waitFor();
  const stops = await page.evaluate(() => new Promise((resolve,reject) => {
    const marks = [...document.querySelectorAll('[data-process-mark]')];
    const points = marks.map(el=>[+el.getAttribute('x'),+el.getAttribute('y')]);
    const lens = document.querySelector('[data-process-lens]');
    const history = []; const started = performance.now();
    const sample = () => {
      const active = [...document.querySelectorAll('[data-process-step]')].findIndex(el=>el.classList.contains('is-active'));
      if (active === 1) return resolve({history,marks:marks.map(el=>el.textContent)});
      const match = /translate\(([-\d.]+)[, ]+([-\d.]+)/.exec(lens.getAttribute('transform')||'');
      if (match) {
        const x=+match[1],y=+match[2];
        const near = points.findIndex(([px,py])=>Math.hypot(x-px,y-py)<18);
        if (near>=0 && history.at(-1)!==near) history.push(near);
      }
      if(performance.now()-started>14000) return reject(new Error('Первый этап не завершился'));
      requestAnimationFrame(sample);
    };
    sample();
  }));
  assert.deepEqual(stops.history,[0,1,2,3], 'Лупа проходит четыре вопроса без возврата к первому');
  assert.deepEqual(stops.marks,['!','!','!','!']);
  console.log('Разобраться: четыре вопроса, затем второй этап без лишнего круга');

  await page.goto(`${base}/?flight#contacts`);
  const trail = page.locator('[data-trail]');
  await page.waitForTimeout(900);
  const smoothness = await trail.evaluate(el => {
    const len = el.getTotalLength(); let prev, max = 0;
    for (let s = 10; s < len - 10; s += 2) {
      const a = el.getPointAtLength(s - 2), b = el.getPointAtLength(s + 2);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (prev !== undefined) max = Math.max(max, Math.abs(angle - prev));
      prev = angle;
    }
    return max * 180 / Math.PI;
  });
  assert.ok(smoothness < 3, `У траектории нет изломов: ${smoothness}°`);
  await page.waitForTimeout(10500);
  const footer = await page.locator('.site-footer__policy').boundingBox();
  assert.ok(footer.x > 900, 'Ссылка на политику справа');
  assert.deepEqual(errors, []);
  console.log('Траектория плавная, подвал восстановлен, ошибок JavaScript нет');
} finally { await browser.close(); }
