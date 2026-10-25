export type Lang = 'ru' | 'en';

export interface Dict {
  lang: Lang;
  htmlLang: string;
  meta: { title: string; description: string; ogTitle: string; ogDescription: string };
  nav: {
    services: string; works: string; process: string; contacts: string;
    langSwitch: string; langSwitchTitle: string; skipToContent: string;
  };
  /**
   * Первый экран-воронка. ask: вопросы, которые сменяют друг друга (строки заголовка; «~» в начале строки:
   * приглушённая, *…*: акцент), shape: во что складываются знаки; doubt: сомнение; answer: ответ;
   * sub: кто я и как работаю (до 20 слов); h1: заголовок для поиска и скринридеров.
   */
  hero: {
    name: string; nick: string; h1: string;
    ask: { lines: string[]; shape: 'browser' | 'dashboard' | 'phone' | 'plane' | 'knot' | 'wheel' }[];
    doubt: string[]; answer: string[]; sub: string; skip: string;
    ctaContact: string; ctaWorks: string;
  };
  services: { title: string; items: { title: string; text: string }[] };
  /** screen: «Экран {n} из {total}» для точек кадров; carousel: роль окна с кадрами для скринридера;
   *  prev/next: стрелки (кадр назад и дальше, на краях переходят к соседней работе); video: подпись точки видео;
   *  concept: пометка у придуманных проектов; project: «Работа {n} из {total}» для счётчика */
  works: { title: string; open: string; year: string; stack: string; yours: string; screens: string; screen: string; carousel: string;
    prev: string; next: string; video: string; concept: string; project: string };
  process: { title: string; steps: { title: string; text: string }[] };
  contacts: {
    title: string; lead: string;
    formTitle: string; nameLabel: string; namePlaceholder: string; messageLabel: string; messagePlaceholder: string;
    replyLabel: string; via: { id: 'tg' | 'email' | 'phone'; label: string; placeholder: string; prefix?: string }[]; errorContact: string;
    consent: string; consentLink: string; submit: string;
    sending: string; success: string; error: string; errorConsent: string; errorEmpty: string;
    policy: string;
  };
  notFound: { title: string; text: string; home: string; works: string };
  policy: { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[]; back: string };
  a11y: { close: string; openMenu: string; closeMenu: string; videoPreview: string };
}
