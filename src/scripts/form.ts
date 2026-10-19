/**
 * Форма связи. Шлёт JSON на серверную функцию, и заявка приходит владельцу в Telegram-бота,
 * посетителю никуда переходить не нужно.
 *
 * У каждой заявки свой номер. Если связь оборвалась, пока заявка летела (вкладку свернули,
 * сменилась сеть), повторная отправка того же текста идёт с тем же номером, и функция не
 * пересылает её в бота второй раз.
 */
export function initForm(root: ParentNode = document) {
  const form = root.querySelector<HTMLFormElement>('form[data-contact-form]:not(.is-form-bound)');
  if (!form) return;
  form.classList.add('is-form-bound');
  const endpoint = form.dataset.endpoint || '';
  const lang = form.dataset.lang || 'ru';
  const status = form.querySelector<HTMLElement>('[data-form-status]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const labels = { submit: submit.textContent || '', sending: form.dataset.sending || '', success: form.dataset.success || '', error: form.dataset.error || '', errorConsent: form.dataset.errorConsent || '', errorEmpty: form.dataset.errorEmpty || '', errorContact: form.dataset.errorContact || '' };
  const last = { t: 0 };
  let pending: { sig: string; id: string } | null = null;
  let busy = false;

  const msgField = form.querySelector<HTMLElement>('[name="message"]')!;
  const consentBox = form.querySelector<HTMLElement>('[name="consent"]')!;
  const via = [...form.querySelectorAll<HTMLInputElement>('input[name="via"]')];
  const viaInput = (v: string) => form.querySelector<HTMLInputElement>(`[name="c_${v}"]`);
  const show = (text: string, kind: 'ok' | 'err' | '', field?: HTMLElement | null) => {
    status.textContent = text;
    status.dataset.kind = kind;
    form.querySelectorAll('[aria-invalid]').forEach((el) => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
    if (kind === 'err' && field) { field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', status.id); field.focus(); }
  };
  const newId = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const message = String(data.get('message') || '').trim();
    const consent = data.get('consent') === 'on';
    const website = String(data.get('website') || '');
    if (website) return; // ловушка для ботов
    // куда ответить: только отмеченные способы с заполненной строкой
    const contacts: Record<string, string> = {};
    for (const box of via) { const v = viaInput(box.value)?.value.trim(); if (box.checked && v) contacts[box.value] = v; }
    if (via.length && !Object.keys(contacts).length) {
      const empty = via.find((b) => b.checked);
      show(labels.errorContact, 'err', empty ? viaInput(empty.value) : via[0]);
      return;
    }
    if (!message || message.length < 3) { show(labels.errorEmpty, 'err', msgField); return; }
    if (!consent) { show(labels.errorConsent, 'err', consentBox); return; }
    if (Date.now() - last.t < 15000) return; // не чаще раза в 15 секунд

    if (!endpoint) { show(labels.error, 'err'); return; } // адрес функции не задан при сборке

    const payload = { name, contacts, message, consent, lang, website };
    const sig = JSON.stringify(payload);
    if (!pending || pending.sig !== sig) pending = { sig, id: newId() };
    busy = true;
    submit.disabled = true;
    submit.textContent = labels.sending;
    show('', '');
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 20000);
    try {
      // keepalive: заявка долетает, даже если вкладку свернули сразу после нажатия
      const res = await fetch(endpoint, { method: 'POST', keepalive: true, signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: pending.id }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || res.statusText);
      last.t = Date.now();
      pending = null;
      form.reset();
      show(labels.success, 'ok');
    } catch {
      show(labels.error, 'err');
    } finally {
      clearTimeout(timer);
      busy = false;
      submit.disabled = false;
      submit.textContent = labels.submit;
    }
  });
}
