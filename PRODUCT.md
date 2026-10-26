# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Astro (static output), GSAP for motion, vanilla TypeScript. Deployed to GitHub Pages through GitHub Actions. Chosen by the builder; the owner delegated the choice.

## Users
Two audiences open the same link, most often from Telegram on a phone:
- Clients (small businesses, founders, people who need a website, a bot, a 3D scene or a small game) deciding whether to write to Savely.
- Employers and recruiters checking whether he can ship real products.

## Product Purpose
Personal site of Savely Lopatin (nickname d1fast), a young developer from Moscow who builds digital products end to end: websites, web apps, Telegram bots, 3D scenes, small games, interfaces. The site exists to get the visitor to write to him in Telegram. Success: the visitor understands within seconds what he makes, sees proof of craft, and writes.

## Positioning
He understands what a product gives the business, thinks everything through up front, writes a detailed spec, and keeps polishing until he likes the result himself. The site must show this, not state it: the site is its own brief turned into a product, and every section proves the claim rather than describing it.

## Operating Context
Visitor arrives from a Telegram link, usually on a phone with a slow mobile connection. Desktop visits come from employers. Native scroll only. Russian is the default language, English at /en/. Contact happens through Telegram (@glslg031), email (saveliylopatin@yandex.ru) and a short form that later posts to a Telegram bot through a small server function.

## Capabilities and Constraints
- Sections: first screen where the typed brief turns into the page, about, what I do, works, how I work, contacts. Case pages with their own URL. 404, favicon, OG image.
- One case for now (Aroma Forge, a Three.js fragrance constructor); the works list must look right with one item and with ten.
- No scroll-scrubbed animation, no pinning, no scroll hijacking. Animations play once on reveal, transform and opacity where possible.
- Motion plays for everyone: the owner chose not to switch it off for the system "reduce motion" setting, so the site looks the same on every device and browser.
- Images never overlap text.
- Mobile must be as good as desktop.
- One calm sentence about AI writing code; never in headings.
- No photo of the owner anywhere on the site (his decision); the name sits small in the header, top left.
- Open decisions: server function host (Yandex Cloud Functions later).

## Brand Commitments
- Name: Савелий Лопатин / Savely Lopatin, nickname d1fast.
- Voice: first person, plain spoken Russian, no pathos, no bureaucratic phrasing, dashes rare. English is natural English, not a literal translation.
- Mood: bright and bold, dark allowed; saturated colors and unexpected combinations; unusual grid, type and interaction decisions; never a template; text always readable.
- References for technique, not copying: kirpichagency.com (how text appears and how services come alive on hover), torebentsen.com (works as a list with video previews). Anti-reference: jasonvakker.com.
- Facts may be lightly invented for trust (no numbers; "young developer"; Moscow). No real client brand names.

## Evidence on Hand
- Aroma Forge demo: source at /home/user/aroma-forge, screenshots in /home/user/aroma-forge/screenshots (desktop 1920x1080 and phone 390x844). Video previews to be recorded from the running app.
- No photo: the owner asked not to use one.
- No testimonials, no metrics. Do not fabricate numbers.

## Product Principles
- Show, don't tell: every claim about craft is demonstrated by the site itself.
- Phone first: the link is opened from Telegram.
- Motion is authored once per moment and never tied to scroll position.
- Content is in the HTML from the start; animation runs on top of it.
- Adding a case must be one text file plus media.
