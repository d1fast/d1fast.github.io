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
   * Первый экран: чёрный экран, знак d1fast ©, потом фразы стеклянными буквами на цилиндре (beats: строки фразы,
   * «|» внутри строки: перенос на узком экране), последняя остаётся заголовком; sub: одна строка под ним;
   * h1: заголовок для поиска и скринридеров; photoAlt: подпись к фото, которое проявляется с третьей фразой.
   */
  hero: {
    name: string; nick: string; h1: string;
    beats: string[][];
    sub: string; ctaContact: string; ctaWorks: string; photoAlt: string;
  };
  services: { title: string; items: { title: string; text: string }[] };
  /** screen: «Экран {n} из {total}» для точек кадров; carousel: роль окна с кадрами для скринридера;
   *  prev/next: стрелки (кадр назад и дальше, на краях переходят к соседней работе); video: подпись точки видео;
   *  concept: пометка у придуманных проектов; project: «Работа {n} из {total}» для счётчика */
  works: { title: string; open: string; year: string; stack: string; yours: string; screens: string; screen: string; carousel: string;
    prev: string; next: string; video: string; concept: string; project: string; play: string };
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
