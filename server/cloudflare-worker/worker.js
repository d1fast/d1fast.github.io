// Тот же приёмник заявок, но для Cloudflare Workers (бесплатно, без привязки карты).
// Секреты задаются в настройках воркера: BOT_TOKEN, CHAT_ID, ALLOWED_ORIGIN.
// В репозитории и на сайте токена нет.

const RATE = { windowMs: 10 * 60 * 1000, max: 5 };
const DEDUP_MS = 15 * 60 * 1000;
const hits = new Map();
// уже отправленные заявки: повтор той же заявки (переотправка после обрыва связи, второй клик)
// отвечает «ок», но в бота второй раз не уходит
const seen = new Map();
const VIA = { tg: 'Telegram', wa: 'WhatsApp', email: 'Почта', phone: 'Телефон' };
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function limited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  if (list.length >= RATE.max) return true;
  list.push(now);
  hits.set(ip, list);
  return false;
}

function dup(keys) {
  const now = Date.now();
  if (seen.size > 5000) for (const [k, t] of seen) if (now - t > DEDUP_MS) seen.delete(k);
  return keys.some((k) => now - (seen.get(k) || 0) < DEDUP_MS);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'method' });
    if (!allowed) return reply(500, { ok: false, error: 'config' });
    if (origin !== allowed) return reply(403, { ok: false, error: 'origin' });

    let data;
    try { data = await request.json(); } catch { return reply(400, { ok: false, error: 'json' }); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return reply(400, { ok: false, error: 'json' });
    if (data.website) return reply(200, { ok: true }); // ловушка для ботов

    const name = clean(data.name, 120);
    const message = clean(data.message, 2000);
    const lang = data.lang === 'en' ? 'en' : 'ru';
    const raw = data.contacts && typeof data.contacts === 'object' ? data.contacts : {};
    const contacts = Object.keys(VIA).map((k) => [k, clean(raw[k], 160)]).filter(([, v]) => v);
    if (message.length < 3) return reply(400, { ok: false, error: 'empty' });
    if (data.consent !== true) return reply(400, { ok: false, error: 'consent' });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const id = clean(data.id, 64);
    const keys = [`${ip}|${name}|${message}`];
    if (id) keys.push(`id|${id}`);
    if (dup(keys)) return reply(200, { ok: true, dup: true });
    if (limited(ip)) return reply(429, { ok: false, error: 'rate' });
    if (!env.BOT_TOKEN || !env.CHAT_ID) return reply(500, { ok: false, error: 'config' });

    // заявка помечается до отправки: вторая такая же, пришедшая, пока первая ещё летит в Telegram, не продублируется
    const now = Date.now();
    keys.forEach((k) => seen.set(k, now));
    const text = [
      `<b>Заявка с сайта</b> (${lang})`,
      `<b>Имя:</b> ${esc(name || 'не указано')}`,
      ...contacts.map(([k, v]) => `<b>${VIA[k]}:</b> ${esc(v)}`),
      '',
      esc(message),
    ].join('\n');
    let res;
    try {
      res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      });
    } catch { res = null; }
    if (res && res.ok) return reply(200, { ok: true });
    keys.forEach((k) => seen.delete(k));
    return reply(502, { ok: false, error: 'telegram' });
  },
};
