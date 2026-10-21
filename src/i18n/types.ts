export type Lang = 'ru' | 'en';

export interface Dict {
  lang: Lang;
  htmlLang: string;
  meta: { title: string; description: string; ogTitle: string; ogDescription: string };
  nav: {
    about: string; services: string; works: string; process: string; contacts: string;
    langSwitch: string; langSwitchTitle: string; skipToContent: string;
  };
  hero: { name: string; nick: string; tagline: string; ctaContact: string; ctaWorks: string };
  /** lead: одно короткое вступление; notes: пометки от руки; stickers: короткие наклейки-факты */
  about: { title: string; photoAlt: string; lead: string; notes: string[]; stickers: string[]; aka: string };
  services: { title: string; items: { title: string; text: string }[] };
  /** screen: «Экран {n} из {total}» для точек кадров; carousel: роль окна с кадрами для скринридера */
  works: { title: string; open: string; year: string; stack: string; yours: string; screens: string; screen: string; carousel: string };
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
