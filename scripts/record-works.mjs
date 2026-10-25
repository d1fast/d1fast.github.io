// Видео и кадры для блока «Работы» из демо-страниц demos/<name>/index.html.
// Нужен статический сервер из корня репозитория: python3 -m http.server 4330 --bind 127.0.0.1
// node scripts/record-works.mjs tg|coffee — пишет public/work/<slug>/video.mp4, video.webm, poster.webp и кадры (+ -800).
// Сцена на странице — один таймлайн GSAP на паузе: каждый кадр ставится через window.__seek(t), поэтому видео ровное
// при любой скорости машины. Компьютер: 1104×621 с плотностью 1,45 (на выходе 1600×900), телефон: 390×844 с плотностью 2.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const BASE = process.env.DEMO_URL || 'http://127.0.0.1:4330/demos';
const JOBS = {
  tg: { slug: 'ugli-bot', page: 'tg-bot', fps: 30,
    desk: { 'ai': 10.6, 'booking': 14.0, 'done': 17.0 },
    phone: { 'mobile-hi': 3.0, 'mobile-done': 17.0 } },
  coffee: { slug: 'pena', page: 'coffee', fps: 30,
    desk: { 'hero': 3.2, 'menu': 8.6, 'beans': 11.2, 'find': 15.0 },
    phone: { 'mobile-hero': 3.2, 'mobile-menu': 5.4 } },
};
const name = process.argv[2];
const job = JOBS[name];
if (!job) { console.log('node scripts/record-works.mjs ' + Object.keys(JOBS).join('|')); process.exit(1); }
const OUT = path.resolve('public/work', job.slug);
const FR = path.resolve('.record', name);
fs.rmSync(FR, { recursive: true, force: true });
fs.mkdirSync(FR, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const exe = ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

async function open(mobile) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }
    : { viewport: { width: 1104, height: 621 }, deviceScaleFactor: 1600 / 1104 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${BASE}/${job.page}/index.html?t=0${mobile ? '&m=1' : ''}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__ready);
  return { ctx, p };
}
const seek = (p, t) => p.evaluate((t) => window.__seek(t), t);

// видео
{
  const { ctx, p } = await open(false);
  const dur = await p.evaluate(() => window.__dur);
  const n = Math.round(dur * job.fps);
  for (let i = 0; i <= n; i++) {
    await seek(p, i / job.fps);
    await p.screenshot({ path: `${FR}/f${String(i).padStart(4, '0')}.png` });
  }
  await ctx.close();
  run(`ffmpeg -y -loglevel error -framerate ${job.fps} -i ${FR}/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 22 -preset slow -movflags +faststart ${OUT}/video.mp4`);
  run(`ffmpeg -y -loglevel error -framerate ${job.fps} -i ${FR}/f%04d.png -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -pix_fmt yuv420p ${OUT}/video.webm`);
  console.log('video', n, 'frames');
}
// кадры: компьютер 1600×900 и уменьшенные 800×450, телефон 780×1688
for (const [mobile, list] of [[false, job.desk], [true, job.phone]]) {
  const { ctx, p } = await open(mobile);
  for (const [file, t] of Object.entries(list)) {
    await seek(p, t);
    await p.waitForTimeout(60);
    await p.screenshot({ path: `${FR}/${file}.png` });
    run(`ffmpeg -y -loglevel error -i ${FR}/${file}.png -c:v libwebp -quality 84 ${OUT}/${file}.webp`);
    if (!mobile) run(`ffmpeg -y -loglevel error -i ${FR}/${file}.png -vf scale=800:-1:flags=lanczos -c:v libwebp -quality 80 ${OUT}/${file}-800.webp`);
  }
  await ctx.close();
}
// обложка работы: первый кадр, где сцена уже собрана; постер видео: его самый первый кадр, чтобы запуск не прыгал
run(`ffmpeg -y -loglevel error -i ${FR}/${Object.keys(job.desk)[0]}.png -vf scale=1280:-1:flags=lanczos -c:v libwebp -quality 80 ${OUT}/poster.webp`);
run(`ffmpeg -y -loglevel error -i ${FR}/f0000.png -vf scale=1280:-1:flags=lanczos -c:v libwebp -quality 80 ${OUT}/start.webp`);
await browser.close();
fs.rmSync(FR, { recursive: true, force: true });
console.log('done', OUT);
