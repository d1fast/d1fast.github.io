/** Шёлковая лента и её маленький символьный эскиз. Canvas 2D, без WebGL и библиотек 3D. */
export function initRibbon() {
  const root = document.querySelector<HTMLElement>('[data-ribbon]');
  const canvas = root?.querySelector<HTMLCanvasElement>('canvas');
  const ascii = document.querySelector<HTMLElement>('[data-ascii]');
  if (!root || !canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  type Point = { x: number; y: number; z: number };
  const segments = 200, strips = 7, tau = Math.PI * 2;
  let width = 0, height = 0, ratio = 1, frame = 0, last = 0, elapsed = 0, lastAscii = 0, visible = true;
  const resize = () => {
    width = root.clientWidth; height = root.clientHeight;
    ratio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  };
  const point = (a: number, v: number, time: number): Point => {
    const twist = a / 2 + time * .13;
    const band = 34 * v, c = Math.cos(twist), s = Math.sin(twist);
    const x = (326 + band * c) * Math.cos(a) + 28 * Math.sin(2 * a + .8);
    const y = (240 + band * c) * Math.sin(a) + 22 * Math.sin(2 * a);
    const z = band * s + 35 * Math.sin(a * 2 + time * .16);
    const rx = .16 + Math.sin(time * .17) * .10, ry = .20 + Math.cos(time * .13) * .14;
    const y1 = y * Math.cos(rx) - z * Math.sin(rx), z1 = y * Math.sin(rx) + z * Math.cos(rx);
    const x1 = x * Math.cos(ry) + z1 * Math.sin(ry), z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
    const rz = -.32 + Math.sin(time * .11) * .075;
    return { x: x1 * Math.cos(rz) - y1 * Math.sin(rz), y: x1 * Math.sin(rz) + y1 * Math.cos(rz), z: z2 };
  };
  const shade = (a: Point, b: Point, c: Point, v: number) => {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1; nx /= length; ny /= length; nz /= length;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const light = Math.max(0, -nx * .35 - ny * .5 + nz * .72);
    const shine = Math.pow(Math.max(0, -nx * .18 - ny * .22 + nz * .96), 15);
    const rim = Math.pow(Math.abs(v), 7) * .07;
    const mix = Math.min(1, .10 + light * .58 + shine * .29 + rim);
    // Холодная тень, розовый отблеск, почти белый блик.
    const warm = (Math.sin(a.x / 170 + elapsed * .12) + 1) * .5;
    const dark = [120 + warm * 30, 130 - warm * 18, 144 - warm * 22];
    const bright = [249, 242, 235];
    return { colour: `rgb(${dark.map((d, i) => Math.round(d + (bright[i] - d) * mix)).join(' ')})`, light: mix };
  };
  const draw = () => {
    if (!width || !height) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / 800, height / 700);
    ctx.translate(width / 2, height / 2); ctx.scale(scale, scale);
    const project = (p: Point) => { const f = 1200 / (1200 - p.z); return { x: p.x * f, y: p.y * f }; };
    const rows = Array.from({ length: segments + 1 }, (_, i) => Array.from({ length: strips + 1 }, (_, j) => point(i / segments * tau, j / strips * 2 - 1, elapsed)));
    const faces = [];
    for (let i = 0; i < segments; i++) for (let j = 0; j < strips; j++) {
      const pts = [rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]];
      faces.push({ pts, z: pts.reduce((sum, p) => sum + p.z, 0) / 4, ...shade(pts[0], pts[1], pts[3], j / strips * 2 - 1) });
    }
    faces.sort((a, b) => a.z - b.z);
    const updateAscii = ascii && elapsed - lastAscii > .12;
    const cols = 35, lines = 17, cells = Array(cols * lines).fill(' ');
    for (const face of faces) {
      const pts = face.pts.map(project);
      ctx.beginPath(); pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath();
      ctx.fillStyle = face.colour; ctx.strokeStyle = face.colour; ctx.lineWidth = .7; ctx.fill(); ctx.stroke();
      if (updateAscii) {
        const x = Math.round((pts[0].x / 800 + .5) * (cols - 1));
        const y = Math.round((pts[0].y / 700 + .5) * (lines - 1));
        if (x >= 0 && x < cols && y >= 0 && y < lines) cells[y * cols + x] = '/=+*#'[Math.min(4, Math.floor(face.light * 5))];
      }
    }
    if (updateAscii) { ascii.textContent = Array.from({ length: lines }, (_, y) => cells.slice(y * cols, (y + 1) * cols).join('')).join('\n'); lastAscii = elapsed; }
    root.classList.add('is-drawn');
  };
  const tick = (now: number) => {
    if (document.hidden || !visible) { frame = 0; last = 0; return; }
    if (!last || now - last >= 1000 / 30) { elapsed += last ? Math.min((now - last) / 1000, .1) : 0; last = now; draw(); }
    frame = requestAnimationFrame(tick);
  };
  const resume = () => { if (!frame && !document.hidden && visible) frame = requestAnimationFrame(tick); };
  new ResizeObserver(resize).observe(root);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; resume(); }, { rootMargin: '100px' }).observe(root);
  document.addEventListener('visibilitychange', resume);
  resize(); draw(); resume();
}
