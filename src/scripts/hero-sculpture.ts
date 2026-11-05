import {
  ACESFilmicToneMapping, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DirectionalLight,
  Group, Mesh, MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, Scene, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface Sculpture { start(): void; stop(): void; point(x: number, y: number): void; push(): void }

/** Объёмная лента по замкнутому узлу. Всё освещение локальное, внешних моделей и текстур нет. */
export function createSculpture(canvas: HTMLCanvasElement): Sculpture {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, .1, 30);
  camera.position.z = 8.8;
  const room = new RoomEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .04);
  room.dispose(); pmrem.dispose();
  scene.environment = environment.texture;
  const light = new DirectionalLight(0xfff5d7, 3);
  light.position.set(-3, 4, 6); scene.add(light);
  const edge = new DirectionalLight(0xffffff, 2);
  edge.position.set(4, -2, 3); scene.add(edge);

  const curve = new CatmullRomCurve3(Array.from({ length: 120 }, (_, i) => {
    const t = i / 120 * Math.PI * 2;
    return new Vector3((Math.sin(t) + 2 * Math.sin(2 * t)) * .65, (Math.cos(t) - 2 * Math.cos(2 * t)) * .65, -Math.sin(3 * t) * .58);
  }), true);
  const count = 280, sides = 12;
  const frames = curve.computeFrenetFrames(count, true);
  const centers = curve.getSpacedPoints(count);
  const positions = new Float32Array((count + 1) * (sides + 1) * 3);
  const colors = new Float32Array(positions.length);
  const lime = new Color('#BED52D'), pale = new Color('#EDF3AB'), wine = new Color('#62253A');
  const indices: number[] = [];
  for (let i = 0; i < count; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new BufferGeometry();
  const pos = new BufferAttribute(positions, 3);
  geometry.setAttribute('position', pos);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const material = new MeshPhysicalMaterial({ vertexColors: true, metalness: .38, roughness: .3, clearcoat: .45, clearcoatRoughness: .28, envMapIntensity: 1 });
  const mesh = new Mesh(geometry, material);
  const group = new Group(); group.add(mesh); scene.add(group);
  group.rotation.set(.18, -.28, -.32);
  const normal = new Vector3(), binormal = new Vector3();
  const paint = (time: number, impulse: number) => {
    for (let i = 0; i <= count; i++) {
      const t = i / count * Math.PI * 2;
      const twist = Math.sin(t * 3 + time * .32) * .42 + t + impulse * Math.sin(t * 2);
      normal.copy(frames.normals[i]).multiplyScalar(Math.cos(twist)).addScaledVector(frames.binormals[i], Math.sin(twist));
      binormal.copy(frames.binormals[i]).multiplyScalar(Math.cos(twist)).addScaledVector(frames.normals[i], -Math.sin(twist));
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2;
        // Широкая плоская полоса с округлёнными кромками, а не круглая трубка.
        const x = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), .55) * .31;
        const y = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), .55) * .072;
        const at = (i * (sides + 1) + j) * 3, center = centers[i];
        positions[at] = center.x + normal.x * x + binormal.x * y;
        positions[at + 1] = center.y + normal.y * x + binormal.y * y;
        positions[at + 2] = center.z + normal.z * x + binormal.z * y;
        const color = Math.sin(a) < -.25 ? wine : Math.abs(Math.cos(a)) > .85 ? pale : lime;
        colors[at] = color.r; colors[at + 1] = color.g; colors[at + 2] = color.b;
      }
    }
    pos.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();
  };
  let active = false, raf = 0, last = 0, time = 0;
  const pointer = { x: 0, y: 0 }, current = { x: 0, y: 0 };
  let impulse = 0, velocity = 0;
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = camera.aspect < 1 ? 10.8 : 8.8;
    camera.updateProjectionMatrix();
    if (!active) renderer.render(scene, camera);
  };
  new ResizeObserver(resize).observe(canvas);
  paint(0, 0); resize();
  const render = (now: number) => {
    if (!active) return;
    raf = requestAnimationFrame(render);
    const dt = last ? Math.min((now - last) / 1000, .06) : 1 / 30;
    if (last && now - last < 1000 / 40) return;
    last = now; time += dt;
    const follow = 1 - Math.exp(-dt * 4);
    current.x += (pointer.x - current.x) * follow;
    current.y += (pointer.y - current.y) * follow;
    velocity += (-impulse * 18 - velocity * 5) * dt;
    impulse += velocity * dt;
    group.rotation.set(.18 + current.y * .35 + Math.sin(time * .24) * .1, -.28 + current.x * .5 + Math.sin(time * .18) * .18, -.32 + Math.sin(time * .15) * .08);
    group.position.y = Math.sin(time * .6) * .06;
    paint(time, impulse);
    renderer.render(scene, camera);
  };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); active = false; cancelAnimationFrame(raf);
    canvas.closest('.hero')?.classList.remove('has-sculpture');
  });
  return {
    start() { if (active) return; active = true; last = 0; raf = requestAnimationFrame(render); },
    stop() { active = false; cancelAnimationFrame(raf); },
    point(x, y) { pointer.x = (x - .5) * 2; pointer.y = (y - .5) * 2; },
    push() { velocity += 3; },
  };
}
