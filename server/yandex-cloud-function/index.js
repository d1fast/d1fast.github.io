// Функция для Yandex Cloud Functions (Node.js 18+): принимает сообщение из формы сайта
// и пересылает его в Telegram. Секреты только в переменных окружения функции:
//   BOT_TOKEN      токен бота от @BotFather
//   CHAT_ID        ваш chat id (узнать можно у @userinfobot)
//   ALLOWED_ORIGIN адрес сайта, например https://d1fast.github.io
// В репозитории и на фронтенде токена нет и быть не должно.

const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 5 }; // не больше 5 сообщений за 10 минут с одного IP
const MAX_NAME = 120;
const MAX_MESSAGE = 2000;
const hits = new Map(); // живёт, пока жив экземпляр функции; для спама этого достаточно
// уже отправленные заявки: повтор той же заявки (переотправка после обрыва связи) отвечает «ок», но в бота второй раз не уходит
const DEDUP_MS = 15 * 60 * 1000;
const seen = new Map();
const VIA = { tg: 'Telegram', wa: 'WhatsApp', email: 'Почта', phone: 'Телефон' };
function dup(keys) {
  const now = Date.now();
  if (seen.size > 5000) for (const [k, t] of seen) if (now - t > DEDUP_MS) seen.delete(k);
  return keys.some((k) => now - (seen.get(k) || 0) < DEDUP_MS);
}

function corsHeaders(origin) {
  const allowed = process.env.ALLOWED_ORIGIN || '';
  const ok = allowed && origin === allowed;
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function limited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (list.length >= RATE_LIMIT.max) return true;
  list.push(now);
  hits.set(ip, list);
  return false;
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

module.exports.handler = async function (event) {
  const headers = event.headers || {};
  const origin = headers.Origin || headers.origin || '';
  const base = { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' };
  const reply = (statusCode, body) => ({ statusCode, headers: base, body: JSON.stringify(body) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: base, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'method' });
  if (!process.env.ALLOWED_ORIGIN) return reply(500, { ok: false, error: 'config' });
  if (origin !== process.env.ALLOWED_ORIGIN) return reply(403, { ok: false, error: 'origin' });

  let data;
  try {
    data = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body || '{}');
  } catch {
    return reply(400, { ok: false, error: 'json' });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return reply(400, { ok: false, error: 'json' });

  // Honeypot: поле, которое человек не видит и не заполняет.
  if (data.website) return reply(200, { ok: true });

  const name = clean(data.name, MAX_NAME);
  const message = clean(data.message, MAX_MESSAGE);
  const lang = data.lang === 'en' ? 'en' : 'ru';
  const raw = data.contacts && typeof data.contacts === 'object' ? data.contacts : {};
  const contacts = Object.keys(VIA).map((k) => [k, clean(raw[k], 160)]).filter(([, v]) => v);
  if (!message || message.length < 3) return reply(400, { ok: false, error: 'empty' });
  if (data.consent !== true) return reply(400, { ok: false, error: 'consent' });

  // Доверяем адресу от платформы; заголовок X-Forwarded-For берём только как запасной вариант и с конца цепочки.
  const ctxIp = event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp;
  const xff = String(headers['X-Forwarded-For'] || headers['x-forwarded-for'] || '');
  const ip = ctxIp || xff.split(',').pop().trim() || 'unknown';
  const id = clean(data.id, 64);
  const keys = [`${ip}|${name}|${message}`];
  if (id) keys.push(`id|${id}`);
  if (dup(keys)) return reply(200, { ok: true, dup: true });
  if (limited(ip)) return reply(429, { ok: false, error: 'rate' });

  const token = process.env.BOT_TOKEN;
  const chatId = process.env.CHAT_ID;
  if (!token || !chatId) return reply(500, { ok: false, error: 'config' });

  keys.forEach((k) => seen.set(k, Date.now()));
  const text = [
    `<b>Заявка с сайта</b> (${lang})`,
    `<b>Имя:</b> ${escapeHtml(name || 'не указано')}`,
    ...contacts.map(([k, v]) => `<b>${VIA[k]}:</b> ${escapeHtml(v)}`),
    '',
    escapeHtml(message),
  ].join('\n');

  let res = null;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch { res = null; }
  if (res && res.ok) return reply(200, { ok: true });
  keys.forEach((k) => seen.delete(k));
  return reply(502, { ok: false, error: 'telegram' });
};
