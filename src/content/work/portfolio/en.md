---
title: This site
subtitle: A portfolio of six screens, each with its own scene, typeface and motion
year: 2026
order: 2
role: Concept, design, front end, form handler
stack: [Astro, GSAP, Three.js, Cloudflare Workers]
cover: /work/portfolio/poster.webp
coverAlt: The first screen of the site, code glyphs forming a 3D knot next to the name
link: https://d1fast.github.io/
media:
  - src: /work/portfolio/hero.webp
    alt: "First screen: the name and a website window built from code glyphs"
    caption: First screen. Thousands of code glyphs in WebGL form the things I make and flow from one into the next.
  - src: /work/portfolio/services.webp
    alt: "The What I do screen: a retro game menu and a screen with a scene"
    caption: "What I do: a retro game menu. Each item plays its own scene on the screen while the camera zooms in on what matters."
  - src: /work/portfolio/process.webp
    alt: "The How I work screen: a desk lamp blueprint and the steps"
    caption: "How I work: a lamp blueprint is drawn step by step, a magnifier finds the flaws and they get fixed."
  - src: /work/portfolio/contacts.webp
    alt: "Contact screen: the request form as a letter in an envelope"
    caption: The form is a letter. Requests arrive in my Telegram.
  - src: /work/portfolio/mobile-hero.webp
    alt: The first screen on a phone
    caption: On a phone the sculpture sits on top with the name and buttons below.
    portrait: true
  - src: /work/portfolio/mobile-services.webp
    alt: The What I do screen on a phone
    caption: The menu on a phone, with the scene screen above the items.
    portrait: true
---

## The task

Build a portfolio that shows what I can do on its own: motion, 3D, layouts for any screen and a server link. Within a minute a visitor should get what I do, look at the work and message me.

## What I did

- Six screens, each with its own palette, typeface and motion. They turn one at a time with the wheel, a swipe, the keyboard or the dots on the side, with a transition between them.
- The first screen runs on WebGL: several thousand glyphs flow from one object into the next, and the GPU does all the motion.
- Each screen loads its script when its turn comes, and its animation stops while it is closed.
- The layout is checked on phones with browser bars, on tablets and short laptop screens, in Russian and English.
- Form requests reach Telegram through a Cloudflare Workers handler. The bot token is not on the site, and a repeated send does not duplicate the message.

## Result

The site is static, hosted on GitHub Pages and loads fast. Motion, 3D and the request form work on both phones and computers.
