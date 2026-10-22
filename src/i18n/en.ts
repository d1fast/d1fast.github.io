import type { Dict } from './types';

export const en: Dict = {
  lang: 'en',
  htmlLang: 'en',
  meta: {
    title: 'Saveliy Lopatin (d1fast): websites, apps, bots and 3D',
    description:
      'I build digital products from idea to launch: websites, web apps, mobile and desktop apps, Telegram bots, 3D scenes and promo games.',
    ogTitle: 'Saveliy Lopatin, d1fast',
    ogDescription: 'Websites, apps, Telegram bots and 3D. From idea to launch.',
  },
  nav: {
    about: 'About',
    services: 'What I do',
    works: 'Work',
    process: 'How I work',
    contacts: 'Contact',
    langSwitch: 'RU',
    langSwitchTitle: 'Переключить на русский',
    skipToContent: 'Skip to content',
  },
  hero: {
    name: 'Saveliy Lopatin',
    nick: 'd1fast',
    tagline: 'I make websites, apps, Telegram bots and 3D. From idea to launch.',
    ctaContact: 'Write to me',
    ctaWorks: 'Work',
  },
  about: {
    title: 'About',
    photoAlt: 'Photo of Saveliy Lopatin',
    lead: 'I love building quality products and seeing *your delight* at the result.',
    reviewsLabel: 'Reviews',
    reviews: [
      { text: 'Delivered faster than promised and suggested a couple of ideas we ended up keeping.', name: 'Anna', role: 'coffee shop owner' },
      { text: 'Takes feedback calmly and is always in touch. The site came out exactly as we wanted.', name: 'Dmitry', role: 'marketer' },
      { text: 'The booking bot took the load off our admin: clients book themselves, no calls needed.', name: 'Irina', role: 'nail studio' },
    ],
    stickers: ['feedback? sure', 'hard means fun', 'always in touch'],
  },

  services: {
    title: 'What I do',
    items: [
      { title: 'Websites', text: 'Landing pages, promo sites and portfolios.' },
      { title: 'Web services', text: 'Client accounts, CRMs, admin panels, APIs and integrations.' },
      { title: 'Mobile apps', text: 'iOS, Android and desktop from one codebase.' },
      { title: 'Telegram bots', text: 'Shops, bookings and Mini Apps right in the chat.' },
      { title: '3D and WebGL', text: 'Three.js scenes, 3D showcases and configurators.' },
      { title: 'Gamification', text: 'Promo games: prize wheels, quests, mini arcades.' },
    ],
  },
  works: {
    title: 'Work',
    open: 'View project',
    year: 'Year',
    stack: 'Stack',
    yours: 'Your project',
    screens: 'Project screens',
    screen: 'Screen {n} of {total}',
    carousel: 'carousel',
  },
  process: {
    title: 'How I work',
    steps: [
      { title: 'Understand', text: 'I find out why the business needs it and who will use it.' },
      { title: 'Specify', text: 'I learn all your requirements and suggest my own takes.' },
      { title: 'Build', text: 'I get a live version up fast so you can see it for yourself.' },
      { title: 'Polish', text: 'Final tweaks, testing, and the finished product is yours.' },
    ],
  },
  contacts: {
    title: 'Write to me',
    lead: 'Tell me what you want to build. I reply the same day.',
    formTitle: 'Your letter',
    nameLabel: 'Your name',
    namePlaceholder: 'Name',
    replyLabel: 'Where to reply',
    via: [
      { id: 'tg', label: 'Telegram', placeholder: 'handle', prefix: '@' },
      { id: 'email', label: 'Email', placeholder: 'name@mail.com' },
      { id: 'phone', label: 'Phone', placeholder: '1 555 000 0000', prefix: '+' },
    ],
    messageLabel: 'What needs doing',
    messagePlaceholder: 'A site for a coffee shop, needed by December',
    consent: 'I agree to the',
    consentLink: 'privacy policy',
    submit: 'Send',
    sending: 'Sending',
    success: 'Got it! I’ll reply the same day.',
    error: 'That didn’t go through. Please try again in a minute.',
    errorContact: 'Tell me where to reply.',
    errorConsent: 'Please agree to the data processing first.',
    errorEmpty: 'Write at least a couple of words.',
    policy: 'Privacy policy',
  },
  notFound: {
    title: 'No such page',
    text: 'Try the home page or my work instead.',
    home: 'Home',
    works: 'See work',
  },
  policy: {
    title: 'Privacy policy',
    updated: 'Version of 21 October 2026',
    intro: 'This policy describes how personal data of visitors to d1fast.github.io is processed and protected. It is written in accordance with Russian Federal Law No. 152-FZ of 27 July 2006 “On Personal Data”.',
    sections: [
      { h: 'General provisions', p: [
        'By sending the form on this site, the user confirms they have read and agree to this policy.',
        'The policy applies only to data the user enters into the contact form on this site.',
      ] },
      { h: 'Data controller', p: [
        'Saveliy Alekseevich Lopatin. Email for personal data requests: saveliylopatin@yandex.ru.',
      ] },
      { h: 'What data is processed', p: [
        'The name or form of address the user provides.',
        'A contact for the reply: a Telegram username, an email address or a phone number.',
        'The text of the message.',
      ] },
      { h: 'Purposes', p: [
        'To answer the user’s request and discuss the task and terms of work.',
        'The data is not used for mailings or advertising.',
      ] },
      { h: 'Legal basis', p: [
        'The user’s consent, given by ticking the box before sending the form (Article 9 of Federal Law No. 152-FZ).',
      ] },
      { h: 'How data is processed', p: [
        'A message from the form is passed through Cloudflare Workers to Telegram, where the controller receives it. No separate database is kept.',
        'Cloudflare and Telegram servers may be located outside the Russian Federation, so sending the form involves a cross-border transfer of data. By sending the form, the user consents to it as well.',
        'The controller does not share or sell the data to third parties, except where required by law.',
      ] },
      { h: 'Retention', p: [
        'Data is kept while the request is being discussed and deleted afterwards or at the user’s request.',
      ] },
      { h: 'User rights', p: [
        'To find out what data about them is processed.',
        'To ask for the data to be corrected, blocked or deleted.',
        'To withdraw consent by writing to the controller’s email. Such requests are answered within 10 working days.',
      ] },
      { h: 'Data protection', p: [
        'Data is transmitted over a secure connection (HTTPS). Only the controller has access to it.',
      ] },
      { h: 'Cookies and analytics', p: [
        'The site uses no cookies, visit counters or advertising trackers and stores nothing in the browser.',
      ] },
      { h: 'Final provisions', p: [
        'The controller may update this policy. A new version takes effect when it is published on this page.',
      ] },
    ],
    back: 'Home',
  },
  a11y: {
    close: 'Close',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    videoPreview: 'Project preview',
  },
};
