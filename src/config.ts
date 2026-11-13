/** Публичные настройки сайта. Секреты обработчика остаются на сервере. */
export const site = {
  name: 'd1fast',
  /** Публичный адрес Cloudflare Worker. Задаётся при сборке через PUBLIC_FORM_ENDPOINT. */
  formEndpoint: import.meta.env.PUBLIC_FORM_ENDPOINT || '',
  year: 2026,
};
