export type Lang = 'ru' | 'en';

export interface Dict {
  lang: Lang;
  htmlLang: string;
  meta: { title: string; description: string; ogTitle: string; ogDescription: string };
  portfolio: {
    first: string; second: string; intro: string; about: string; contact: string; contactShort: string;
    selected: string; projectKinds: string[]; preview: string; light: string;
    aboutFirst: string; aboutSecond: string; aboutText: string[]; process: string; capabilities: string;
    contactFirst: string; contactSecond: string; contactText: string;
    home: string; next: string; previous: string; discuss: string; details: string;
    play: string; pause: string; seek: string; fullscreen: string; backToForm: string;
  };
  nav: {
    services: string; works: string; process: string; contacts: string;
    langSwitch: string; langSwitchTitle: string; skipToContent: string;
  };
  services: { title: string; items: { title: string; text: string }[] };
  /** Подписи работ и подробной страницы по прямой ссылке. */
  works: { title: string; open: string; year: string; stack: string; screens: string; screen: string; carousel: string;
    prev: string; next: string; video: string; concept: string; project: string; play: string; swipe: string; enlarge: string };
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
