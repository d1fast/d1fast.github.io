import { chromium } from 'playwright';
import fs from 'node:fs';

/** Один способ найти браузер для скриншотов, превью и записи демо. */
export function launchBrowser() {
  const candidates = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
  const executablePath = candidates.find((p) => p && fs.existsSync(p) && fs.statSync(p).isFile());
  const proxy = process.env.BROWSER_PROXY === '1' ? process.env.HTTPS_PROXY || process.env.HTTP_PROXY : '';
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), ...(proxy ? { proxy: { server: proxy } } : {}), args: ['--enable-unsafe-swiftshader'] });
}
