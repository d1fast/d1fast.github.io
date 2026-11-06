import {
  ACESFilmicToneMapping, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry,
  DirectionalLight, ExtrudeGeometry, Float32BufferAttribute, Group, HemisphereLight, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, PlaneGeometry, Scene, Shape,
  TorusGeometry, WebGLRenderer, DoubleSide,
} from 'three';
import type { View, Widget } from './widgets';

/** Лёгкая предметная витрина. Модель купе состоит из кузова, остекления, колёс и оптики. */
export function createProduct(root: HTMLElement): Widget {
  const canvas = document.createElement('canvas');
  canvas.className = 'svc-product-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new Scene();
  const camera = new OrthographicCamera(-3, 3, 1.7, -1.7, .1, 30);
  camera.position.set(5, 2.8, 5);
  camera.lookAt(0, .4, 0);
  scene.add(new HemisphereLight(0xf5ffdf, 0x5e1736, 2.4));
  const key = new DirectionalLight(0xffeed8, 3.4);
  key.position.set(1, 5, 4); scene.add(key);
  const rim = new DirectionalLight(0xcfedff, 2.5);
  rim.position.set(-4, 2, -3); scene.add(rim);

  const colors = ['#F06A93', '#D5E4AD', '#995FBA'].map((c) => new Color(c));
  const paint = new MeshStandardMaterial({ color: colors[0], roughness: .32, metalness: .28 });
  const glass = new MeshStandardMaterial({ color: '#18272c', roughness: .22, metalness: .35, side: DoubleSide });
  const rubber = new MeshStandardMaterial({ color: '#151219', roughness: .95 });
  const chrome = new MeshStandardMaterial({ color: '#dbe2ce', roughness: .32, metalness: .65 });
  const trim = new MeshStandardMaterial({ color: '#29232d', roughness: .55 });
  const lamp = new MeshStandardMaterial({ color: '#fff2b8', emissive: '#fff2b8', emissiveIntensity: .7 });
  const red = new MeshStandardMaterial({ color: '#ff5a61', emissive: '#e8354a', emissiveIntensity: .4 });
  const car = new Group(); scene.add(car);
  const part = (geo: BufferGeometry, mat: MeshStandardMaterial, x = 0, y = 0, z = 0, parent = car) => {
    const mesh = new Mesh(geo, mat); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const slab = (points: number[][], depth: number, mat: MeshStandardMaterial) => {
    const shape = new Shape();
    points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
    const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: .025, bevelSize: .035, bevelSegments: 2, steps: 1 });
    geo.translate(0, 0, -depth / 2);
    return part(geo, mat);
  };
  slab([[-1.65,.34],[-1.61,.58],[-1.4,.69],[-.8,.74],[.88,.71],[1.58,.57],[1.68,.4],[1.58,.29],[-1.5,.29]], 1.1, paint);
  slab([[-.86,.73],[-.38,1.13],[.39,1.13],[.94,.72]], .86, paint);
  part(new BoxGeometry(2.75,.08,1.13), trim, 0,.3);
  // Стекло лежит отдельными плоскостями на обеих сторонах кабины.
  const pane = (p: number[][]) => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(p.flat(), 3));
    geo.setIndex([0,1,2,0,2,3]); geo.computeVertexNormals(); part(geo, glass);
  };
  for (const z of [-.466,.466]) {
    pane([[-.74,.76,z],[-.34,1.075,z],[.03,1.075,z],[.03,.76,z]]);
    pane([[.11,.76,z],[.11,1.075,z],[.35,1.075,z],[.82,.76,z]]);
    part(new BoxGeometry(.19,.035,.025), chrome, -.22,.64, z > 0 ? .578 : -.578);
    part(new BoxGeometry(.16,.08,.17), paint, .53,.77, z > 0 ? .64 : -.64);
  }
  pane([[.49,1.12,-.39],[.49,1.12,.39],[.96,.77,.4],[.96,.77,-.4]]);
  pane([[-.48,1.12,.39],[-.48,1.12,-.39],[-.88,.77,-.4],[-.88,.77,.4]]);
  // Четыре колеса, диски с шестью спицами. Передняя пара слегка повёрнута.
  for (const x of [-1.05,1.08]) for (const z of [-.6,.6]) {
    const wheel = new Group(); wheel.position.set(x,.32,z); if (x > 0) wheel.rotation.y = -.12; car.add(wheel);
    part(new TorusGeometry(.245,.082,10,32), rubber, 0,0,0,wheel);
    const disc = part(new CylinderGeometry(.205,.205,.12,24), trim, 0,0,0,wheel); disc.rotation.x = Math.PI / 2;
    const face = z > 0 ? .075 : -.075;
    for (let i = 0; i < 6; i++) { const spoke = part(new BoxGeometry(.035,.37,.02), chrome, 0,0,face,wheel); spoke.rotation.z = i * Math.PI / 3; }
    const hub = part(new CylinderGeometry(.065,.065,.025,16), chrome, 0,0,face,wheel); hub.rotation.x = Math.PI / 2;
  }
  for (const z of [-.34,.34]) {
    part(new BoxGeometry(.05,.09,.25), lamp, 1.62,.5,z);
    part(new BoxGeometry(.04,.08,.26), red, -1.65,.47,z);
  }
  part(new BoxGeometry(.03,.095,.55), trim, 1.677,.375);
  part(new BoxGeometry(.035,.06,.32), chrome, -1.68,.36);

  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const ctx = shadowCanvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32,32,8,32,32,32);
  gradient.addColorStop(0,'#110810b0'); gradient.addColorStop(1,'#11081000');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64);
  const shadow = new Mesh(new PlaneGeometry(4.5,2.5), new MeshBasicMaterial({ map: new CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.015; scene.add(shadow);

  const swatches = document.createElement('div'); swatches.className = 'svc-product-colors'; swatches.setAttribute('aria-hidden','true');
  swatches.innerHTML = colors.map((color) => `<i style="--paint:#${color.getHexString()}"></i>`).join('');
  root.append(canvas, swatches);
  let active = false, raf = 0, last = 0, time = 0, choice = 0, manual = false, pointer = 0, follow = 0;
  const updateColor = (i: number) => { choice = i; [...swatches.children].forEach((s,k) => s.classList.toggle('is-selected', k === i)); };
  const resize = (v?: View) => {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w,h,false);
    const aspect = w / h, half = Math.max(1.6, 2.65 / aspect);
    camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
    camera.setViewOffset(w,h,0, -(v?.res || 0) / 2,w,h); camera.updateProjectionMatrix();
  };
  const render = (now: number) => {
    if (!active) return;
    raf = requestAnimationFrame(render);
    if (now - last < 1000 / 30) return;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 1/30;
    last = now; time += dt;
    if (!manual) updateColor(time < 3 ? 0 : time < 6 ? 1 : 2);
    paint.color.lerp(colors[choice], 1 - Math.exp(-dt * 3));
    follow += (pointer - follow) * (1 - Math.exp(-dt * 3));
    car.rotation.y = -.45 + time * .22 + follow;
    renderer.render(scene,camera);
    root.classList.add('has-product');
  };
  const stop = () => { active = false; cancelAnimationFrame(raf); };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); root.classList.remove('has-product'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); last = 0; }
    else if (active) raf = requestAnimationFrame(render);
  });
  return {
    dwell: 10.5,
    play() { stop(); active = true; time = 0; last = 0; manual = false; pointer = follow = 0; updateColor(0); paint.color.copy(colors[0]); resize(); if (!document.hidden) raf = requestAnimationFrame(render); },
    stop,
    resize,
    point(x, _y, touch) { pointer = (x - .5) * .4; if (touch) { manual = true; updateColor((choice + 1) % colors.length); } },
  };
}
