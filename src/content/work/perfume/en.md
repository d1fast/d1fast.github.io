---
title: Fragrance builder
subtitle: Every perfume note becomes a planet
summary: "Each perfume note becomes a planet. Add notes, move them between orbits and find perfumes with a similar composition."
year: 2026
order: 1
role: Interface concept, 3D scene, front end
stack: [Three.js, GLSL, Vite]
cover: /work/perfume/poster.webp
video: { mp4: /work/perfume/video.mp4, webm: /work/perfume/video.webm, poster: /work/perfume/poster.webp }
coverAlt: The Sun and three rings of note planets in the fragrance builder
media:
  - src: /work/perfume/desktop-start.webp
    alt: Start screen with the Sun, three orbits and the "Your fragrance" panel
    caption: Start screen. Three rings around the Sun for top, heart and base notes.
  - src: /work/perfume/planet-rose.webp
    alt: The Rose planet up close with its note card
    caption: Tap a planet and the camera flies in while the note card opens.
  - src: /work/perfume/results.webp
    alt: The "Similar fragrances" window with match percentages and shared notes
    caption: Similar fragrances with a match percentage and a hint on which note to swap.
  - src: /work/perfume/mobile-start.webp
    alt: Start screen on a phone
    caption: The same scene on a phone, with a menu at the bottom and the fragrance panel above it.
    portrait: true
  - src: /work/perfume/mobile-planet-rose.webp
    alt: A note card on a phone
    caption: A note card on a phone.
    portrait: true
  - src: /work/perfume/mobile-results.webp
    alt: Similar fragrances on a phone
    caption: Similar fragrance picks on a phone.
    portrait: true
---

## The task

Build a fragrance composer where users choose notes and see the composition take shape. Support both mouse and touch controls.

## What I did

- Every note became a planet. It can be tapped, dragged to another ring or removed.
- Planet textures are calculated once and reused.
- The scene selects an image quality level on load and lowers it if the frame rate drops.
- Gestures: tap, hold to drag, pinch, double tap to reset the camera.
- Similar fragrances are matched against the chosen notes, with a match percentage and a hint about which note to swap for a closer match.

## Result

The same scene lets users compose a fragrance, change its notes and view similar perfumes. The interface supports mouse and touch controls.
