import { gsap } from 'gsap';

/** Главная остаётся на месте. Окна имеют адреса, работают Назад, Escape и обычный Tab. */
export function initPortfolio() {
  const studio = document.querySelector<HTMLElement>('[data-studio]');
  const sheet = document.querySelector<HTMLDialogElement>('[data-sheet]');
  if (!studio || !sheet) return;
  const body = sheet.querySelector<HTMLElement>('[data-sheet-body]')!;
  const label = sheet.querySelector<HTMLElement>('[data-sheet-label]')!;
  const views = [...sheet.querySelectorAll<HTMLElement>('[data-view]')];
  const cases = views.filter(v => v.dataset.caseIndex !== undefined);
  const videos = [...sheet.querySelectorAll<HTMLVideoElement>('[data-video]')];
  let current = '', closing = false;
  let opener: HTMLElement | null = null;
  let contactScroll = 0;
  let returningToForm = false;
  const viewOf = (key: string) => views.find(v => v.dataset.view === key);
  const keyOfHash = () => {
    const hash = location.hash.slice(1);
    return ({ contacts: 'contact', process: 'about', services: 'about' } as Record<string, string>)[hash] || hash;
  };

  const stopVideo = () => videos.forEach(video => video.pause());
  const focusHeading = (view: HTMLElement) => {
    const heading = view.querySelector<HTMLElement>('h2,h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  };
  const play = (video: HTMLVideoElement) => {
    const player = video.closest<HTMLElement>('[data-player]')!;
    const retry = player.querySelector<HTMLButtonElement>('[data-video-retry]')!;
    retry.hidden = true;
    if (!video.dataset.loaded) {
      video.poster = video.dataset.poster || '';
      video.querySelectorAll<HTMLSourceElement>('source').forEach(source => { source.src = source.dataset.src!; });
      video.dataset.loaded = 'true';
      video.load();
    }
    void video.play().catch(() => { if (sheet.open && !video.closest<HTMLElement>('[data-view]')?.hidden) retry.hidden = false; });
  };
  const hide = () => {
    if (!sheet.open || closing) return;
    closing = true;
    stopVideo();
    sheet.classList.add('is-closing');
    gsap.killTweensOf(sheet);
    gsap.to(sheet, { y: 18, opacity: 0, scale: .99, duration: .25, ease: 'power2.in', onComplete: () => {
      sheet.close();
      sheet.classList.remove('is-closing');
      document.documentElement.classList.remove('has-sheet');
      views.forEach(v => { v.hidden = true; });
      current = ''; closing = false;
      opener?.focus({ preventScroll: true });
    } });
  };
  const show = (key: string) => {
    const view = viewOf(key);
    if (!view) { hide(); return; }
    if (current === key && sheet.open && !closing) return;
    const first = !sheet.open;
    const previous = current;
    if (previous === 'contact') contactScroll = body.scrollTop;
    if (key === 'privacy') returningToForm = previous === 'contact';
    if (first && document.activeElement instanceof HTMLElement) opener = document.activeElement;
    gsap.killTweensOf([sheet, ...views]);
    closing = false;
    sheet.classList.remove('is-closing');
    stopVideo();
    views.forEach(v => { v.hidden = v !== view; });
    current = key;
    label.textContent = view.dataset.viewLabel || '';
    sheet.querySelector<HTMLElement>('[data-back-to-form]')!.hidden = !returningToForm;
    if (first) {
      document.documentElement.classList.add('has-sheet');
      sheet.showModal();
      gsap.fromTo(sheet, { y: 30, opacity: 0, scale: .985 }, { y: 0, opacity: 1, scale: 1, duration: .65, ease: 'power3.out' });
    } else {
      gsap.to(sheet, { y: 0, opacity: 1, scale: 1, duration: .35, ease: 'power2.out' });
      gsap.fromTo(view, { y: 14, opacity: .3 }, { y: 0, opacity: 1, duration: .45, ease: 'power2.out' });
    }
    body.scrollTop = key === 'contact' && previous === 'privacy' ? contactScroll : 0;
    focusHeading(view);
    const video = view.querySelector<HTMLVideoElement>('[data-video]');
    if (video) play(video);
  };
  const open = (key: string) => {
    if (!viewOf(key)) return;
    const url = new URL(location.href); url.hash = key;
    if (sheet.open) history.replaceState(history.state, '', url);
    else history.pushState({ ...history.state, studioSheet: true }, '', url);
    show(key);
  };
  const close = () => {
    if (history.state?.studioSheet) history.back();
    else {
      const url = new URL(location.href); url.hash = '';
      history.replaceState(history.state, '', url);
      hide();
    }
  };
  document.addEventListener('click', event => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[data-open-view]');
    if (!anchor || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname) return;
    event.preventDefault(); open(anchor.dataset.openView!);
  });
  sheet.querySelectorAll('[data-sheet-close]').forEach(button => button.addEventListener('click', close));
  sheet.addEventListener('cancel', event => { event.preventDefault(); close(); });
  let backdropDown = false;
  sheet.addEventListener('pointerdown', event => { backdropDown = event.target === sheet; });
  sheet.addEventListener('click', event => { if (event.target === sheet && backdropDown) close(); });
  window.addEventListener('popstate', () => show(keyOfHash()));
  window.addEventListener('hashchange', () => show(keyOfHash()));
  show(keyOfHash());

  sheet.querySelectorAll<HTMLButtonElement>('[data-case-step]').forEach(button => button.addEventListener('click', () => {
    const i = cases.findIndex(v => v.dataset.view === current);
    const next = (i + Number(button.dataset.caseStep) + cases.length) % cases.length;
    open(cases[next].dataset.view!);
  }));

  const time = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  videos.forEach(video => {
    const player = video.closest<HTMLElement>('[data-player]')!;
    const toggle = player.querySelector<HTMLButtonElement>('[data-video-toggle]')!;
    const seek = player.querySelector<HTMLInputElement>('[data-video-seek]')!;
    const stamp = player.querySelector<HTMLElement>('[data-video-time]')!;
    const retry = player.querySelector<HTMLButtonElement>('[data-video-retry]')!;
    video.controls = false;
    player.querySelector<HTMLElement>('[data-video-controls]')!.hidden = false;
    const update = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const percent = duration ? video.currentTime / duration * 100 : 0;
      seek.value = String(percent);
      seek.style.setProperty('--progress', `${percent}%`);
      seek.setAttribute('aria-valuetext', `${time(video.currentTime)} / ${time(duration)}`);
      stamp.textContent = `${time(video.currentTime)} / ${time(duration)}`;
      player.classList.toggle('is-playing', !video.paused && !video.ended);
      toggle.setAttribute('aria-label', (video.paused ? player.dataset.play : player.dataset.pause)!);
    };
    for (const name of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended', 'seeking']) video.addEventListener(name, update);
    const togglePlayback = () => { if (video.paused) play(video); else video.pause(); };
    toggle.addEventListener('click', togglePlayback);
    video.addEventListener('click', togglePlayback);
    retry.addEventListener('click', () => play(video));
    seek.addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value) / 100 * video.duration; update(); });
    const expand = player.querySelector<HTMLButtonElement>('[data-video-expand]')!;
    const iosVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    expand.addEventListener('click', () => {
      if (document.fullscreenElement) { void document.exitFullscreen(); return; }
      if (player.requestFullscreen) void player.requestFullscreen().catch(() => { iosVideo.webkitEnterFullscreen?.(); });
      else iosVideo.webkitEnterFullscreen?.();
    });
    if (!player.requestFullscreen && !iosVideo.webkitEnterFullscreen) expand.hidden = true;
  });
  const hiddenPlaying = new Set<HTMLVideoElement>();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { videos.forEach(v => { if (!v.paused) { hiddenPlaying.add(v); v.pause(); } }); }
    else { hiddenPlaying.forEach(v => { if (sheet.open && !v.closest<HTMLElement>('[data-view]')!.hidden) play(v); }); hiddenPlaying.clear(); }
  });

  sheet.querySelectorAll<HTMLDetailsElement>('.project__details').forEach(details => details.addEventListener('toggle', () => {
    if (details.open) {
      details.querySelectorAll<HTMLImageElement>('img[data-src]').forEach(img => { if (!img.src && getComputedStyle(img.closest('figure')!).display !== 'none') img.src = img.dataset.src!; });
      gsap.fromTo(details.querySelector('.project__gallery'), { opacity: .2, y: 12 }, { opacity: 1, y: 0, duration: .5, ease: 'power2.out' });
    }
  }));
  // Аккордеон раскрывается мягко, без скачка соседних строк.
  sheet.querySelectorAll<HTMLDetailsElement>('.process-step').forEach(details => {
    const summary = details.querySelector('summary')!, content = details.querySelector('div')!;
    summary.addEventListener('click', event => {
      event.preventDefault();
      gsap.killTweensOf(content);
      if (details.open) gsap.to(content, { height: 0, opacity: 0, duration: .3, ease: 'power2.inOut', onComplete: () => { details.open = false; gsap.set(content, { clearProps: 'height,opacity' }); } });
      else { details.open = true; gsap.fromTo(content, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: .45, ease: 'power2.out', clearProps: 'height,opacity' }); }
    });
  });
  const reply = (value: string, focus = false) => {
    sheet.querySelectorAll<HTMLElement>('[data-via]').forEach(row => { row.hidden = row.dataset.via !== value; });
    if (focus) sheet.querySelector<HTMLInputElement>(`[name=c_${value}]`)?.focus({ preventScroll: true });
  };
  sheet.querySelectorAll<HTMLInputElement>('[name=via]').forEach(radio => radio.addEventListener('change', () => reply(radio.value, true)));
  sheet.querySelector('form')?.addEventListener('reset', () => requestAnimationFrame(() => reply(sheet.querySelector<HTMLInputElement>('[name=via]:checked')!.value)));

  // Подгоняем кегль по настоящей ширине букв, в том числе после загрузки кириллицы.
  const fitHeadline = () => {
    const heading = studio.querySelector<HTMLElement>('.studio__headline')!;
    heading.querySelectorAll<HTMLElement>(':scope > span,:scope > em').forEach(line => {
      line.style.fontSize = '';
      const range = document.createRange(); range.selectNodeContents(line);
      const width = range.getBoundingClientRect().width;
      const available = heading.clientWidth - parseFloat(getComputedStyle(line).marginLeft) - 8;
      if (width > available) line.style.fontSize = `${parseFloat(getComputedStyle(line).fontSize) * available / width * .98}px`;
    });
  };
  fitHeadline();
  void document.fonts.ready.then(fitHeadline);
  window.addEventListener('resize', fitHeadline, { passive: true });
}
