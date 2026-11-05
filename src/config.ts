/** Контакты и адреса. Здесь нет секретов: всё это публично на сайте. */
export const site = {
  name: 'd1fast',
  email: 'saveliylopatin@yandex.ru',
  /** Публичный адрес Cloudflare Worker. Задаётся при сборке через PUBLIC_FORM_ENDPOINT. */
  formEndpoint: import.meta.env.PUBLIC_FORM_ENDPOINT || '',
  year: 2026,
};
