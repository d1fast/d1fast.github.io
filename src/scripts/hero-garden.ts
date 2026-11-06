import {
  ACESFilmicToneMapping, AmbientLight, BufferGeometry, Color, DirectionalLight, DoubleSide,
  Float32BufferAttribute, Group, Mesh, MeshLambertMaterial, PCFShadowMap, OrthographicCamera,
  PlaneGeometry, Scene, ShadowMaterial, SphereGeometry, WebGLRenderer,
} from 'three';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';

export interface Garden { start(restart?: boolean): void; stop(): void; rest(): void; notice(): void }
type Point = [number, number, number];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (a: number, b: number, t: number) => { const p = clamp((t-a)/(b-a)); return p*p*(3-2*p); };

/** Бумажная птица и сад. Каждая деталь имеет свой шарнир, геометрия не пересчитывается по кадрам. */
export function createGarden(host: HTMLElement): Garden {
  let webgl: WebGLRenderer | undefined;
  let renderer: WebGLRenderer | SVGRenderer;
  try {
    webgl = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    webgl.toneMapping = ACESFilmicToneMapping; webgl.toneMappingExposure = 1.1;
    webgl.shadowMap.enabled = true; webgl.shadowMap.type = PCFShadowMap;
    webgl.setClearColor(0x000000,0);
    renderer = webgl;
  } catch {
    // Та же сцена продолжает двигаться без аппаратного WebGL.
    const svg = new SVGRenderer(); svg.setQuality('high'); svg.setPrecision(2);
    renderer = svg;
  }
  renderer.domElement.classList.add('hero__renderer');
  renderer.domElement.setAttribute('aria-hidden','true');
  host.append(renderer.domElement);
  const scene = new Scene();
  const camera = new OrthographicCamera(-4,4,2.6,-2.6,.1,40);
  camera.position.set(4.3,3.0,7.5); camera.lookAt(.05,.85,0);
  scene.add(new AmbientLight(0xfff4e6,1.25));
  const key = new DirectionalLight(0xffedcf,2.6);
  key.position.set(-3.5,7,5); key.castShadow = true;
  key.shadow.mapSize.set(1024,1024); key.shadow.radius = 5;
  Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:18});
  key.shadow.normalBias = .03; scene.add(key);
  const fill = new DirectionalLight(0xe5eaff,.85); fill.position.set(4,3,-4); scene.add(fill);
  const paper = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const wine = ['#A64052','#8C2B43','#B95C63','#76283E','#DB9F97'];
  const sage = ['#8B9571','#AEB695','#737F5D','#C2C9A5'];

  // Отдельный цвет у каждой плоскости подчёркивает сгибы бумаги.
  const facet = (parent: Group, points: Point[], faces: number[][], palette = wine) => {
    const position: number[] = [], color: number[] = [];
    faces.forEach((face,i) => {
      const tint = new Color(palette[i % palette.length]);
      for (let j = 1; j < face.length-1; j++) for (const k of [face[0],face[j],face[j+1]]) {
        position.push(...points[k]); color.push(tint.r,tint.g,tint.b);
      }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute(position,3));
    geometry.setAttribute('color',new Float32BufferAttribute(color,3)); geometry.computeVertexNormals();
    const mesh = new Mesh(geometry,paper); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const bird = new Group(); scene.add(bird);
  const body = new Group(); bird.add(body);
  facet(body,[[-.55,1.04,0],[.65,1.13,0],[.02,.55,0],[.02,1.12,.36],[.02,1.12,-.36],[.12,1.35,0]],
    [[0,2,3],[3,2,1],[0,4,2],[4,1,2],[0,3,5],[3,1,5],[0,5,4],[4,5,1]]);
  const wings = [-1,1].map((side) => {
    const wing = new Group(); wing.position.set(.03,1.13,side*.19); body.add(wing);
    facet(wing,[[-.52,0,0],[.69,-.11,0],[.44,.1,side*1.9],[-.09,.02,side*.86],[.12,-.10,side*.32]],
      [[0,3,2],[3,1,2],[0,4,3],[4,1,3],[0,1,4]],
      ['#BD5A64','#8E2C45','#D98E88','#A64154','#E4ABA0']);
    return wing;
  });
  const neck = new Group(); neck.position.set(-.45,1.08,0); body.add(neck);
  facet(neck,[[0,0,-.085],[0,0,.085],[-.45,1.1,-.045],[-.45,1.1,.045],[-.21,.3,0],[-.31,1.05,0]],
    [[0,2,4],[4,2,5],[1,4,3],[4,5,3],[0,1,3,2]],['#973448','#C46A71','#B55261','#DC9B94','#7E273E']);
  const head = new Group(); head.position.set(-.43,1.08,0); neck.add(head);
  facet(head,[[.02,.05,-.065],[.02,.05,.065],[-.14,.14,0],[-.57,-.13,0],[-.13,-.08,0]],
    [[0,2,3],[2,1,3],[0,3,4],[1,4,3],[0,4,1,2]],['#C26A72','#E1A69A','#7F2B42','#A44555','#A63B50']);
  // Два маленьких отверстия вместо нарисованного лица.
  const eyeMaterial = new MeshLambertMaterial({color:'#3F162B'});
  for (const z of [-.058,.058]) {
    const eye = new Mesh(new SphereGeometry(.018,8,6),eyeMaterial); eye.position.set(-.09,.038,z); head.add(eye);
  }
  const tail = new Group(); tail.position.set(.51,1.13,0); body.add(tail);
  facet(tail,[[0,0,-.12],[0,0,.12],[1.28,.56,0],[.3,.3,0]],[[0,3,2],[3,1,2],[0,1,3]],['#9E3A50','#CD7B7B','#7B273E']);

  // Тонкие бумажные стебли. Ветер поворачивает шарниры у основания, листья запаздывают.
  const plants = [
    {x:1.8,z:-.9,h:1.65,a:-.13},{x:2.45,z:-1.2,h:1.35,a:.2},
    {x:1.5,z:-1.55,h:1.2,a:-.18},{x:-1.45,z:-1.6,h:.85,a:.12},
    {x:1.95,z:.6,h:.65,a:.25},
  ].map(({x,z,h,a},i) => {
    const stem = new Group(); stem.position.set(x,0,z); stem.rotation.y = i*.7; scene.add(stem);
    facet(stem,[[0,0,0],[.022,0,0],[a,h,0],[a+.012,h,0],[a*.6,h*.5,.015]],[[0,4,2],[4,3,2],[0,1,3,4]],sage);
    const leaves = [0,1,2].map((n) => {
      const leaf = new Group(); leaf.position.set(a*(.35+n*.23),h*(.35+n*.23),0); leaf.rotation.y = n*2+i*.8; stem.add(leaf);
      const size = h*(.28-n*.035), side = n%2 ? -1 : 1;
      facet(leaf,[[0,0,0],[side*size*.45,size*.38,.08],[side*size,size*.55,0],[side*size*.45,size*.25,-.06]],[[0,1,2],[0,2,3]],sage.slice(n%2));
      return leaf;
    });
    return {stem,leaves,a};
  });
  if (webgl) {
    const floor = new Mesh(new PlaneGeometry(24,24),new ShadowMaterial({opacity:.12}));
    floor.rotation.x = -Math.PI/2; floor.position.y = -.018; floor.receiveShadow = true; scene.add(floor);
  }
  let active = false, frame = 0, last = 0, time = 3, attention = 0, reduced = false;
  const pose = (t: number,dt = 0) => {
    const land = ease(0,1.95,t), fold = ease(1.0,2.5,t), idle = ease(2.3,3.7,t);
    bird.position.set(1.7*(1-land),-.55+.9*(1-land)+Math.sin(land*Math.PI)*.2,0);
    // Небольшое сжатие при касании опоры, затем бумага распрямляется.
    const settle = Math.sin(ease(1.7,2.8,t)*Math.PI)*.045;
    bird.rotation.set(0,.25+(1-land)*.18,-.16*(1-land));
    body.scale.y = 1-settle+Math.sin(t*1.8)*.006*idle;
    body.position.y = .55*(1-body.scale.y);
    wings.forEach((wing,i) => {
      const side = i ? 1 : -1;
      const flying = -.08+Math.sin(t*11)*.6;
      wing.rotation.x = -side*(flying*(1-fold)+(.58+Math.sin(t*.95+i*.5)*.018)*fold);
    });
    const glance = ease(4.4,5.3,t)*(1-ease(6.3,7.4,t));
    const down = ease(8.1,9,t)*(1-ease(10.2,11.3,t));
    neck.rotation.z = idle*(Math.sin(t*.6)*.025+down*.09);
    head.rotation.y = idle*(Math.sin(t*.55)*.07-glance*.35-attention*.25);
    head.rotation.z = idle*(Math.sin(t*.9)*.025+down*.1);
    tail.rotation.y = Math.sin(t*.8)*.045*idle;
    plants.forEach(({stem,leaves},i) => {
      stem.rotation.z = Math.sin(t*.65+i*.9)*.025+Math.sin(t*1.15+i)*.007;
      leaves.forEach((leaf,n) => leaf.rotation.x = Math.sin(t*.75+i+n*.7)*.065);
    });
    attention *= Math.exp(-dt*1.6);
  };
  const draw = () => {
    renderer.render(scene,camera);
    if (!webgl) renderer.domElement.style.backgroundColor = 'transparent';
  };
  const render = (now: number) => {
    if (!active) return;
    frame = requestAnimationFrame(render);
    if (last && now-last < 1000/(webgl ? 30 : 24)) return;
    const dt = last ? Math.min(.1,(now-last)/1000) : 1/30; last = now;
    time += dt; pose(time,dt); draw();
  };
  const resize = () => {
    const {width:w,height:h} = host.getBoundingClientRect(); if (!w || !h) return;
    if (webgl) webgl.setPixelRatio(Math.min(devicePixelRatio || 1,1.25,Math.sqrt(1_050_000/(w*h))));
    renderer.setSize(w,h);
    const aspect = w/h, half = aspect < 1 ? 2.5 : 2.35;
    camera.left = -half*aspect; camera.right = half*aspect; camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
    pose(reduced ? 6 : time); draw();
  };
  new ResizeObserver(resize).observe(host);
  pose(6); resize();
  if (webgl) webgl.domElement.addEventListener('webglcontextlost',(e) => {
    e.preventDefault(); active = false; cancelAnimationFrame(frame);
    host.closest('[data-hero]')?.classList.remove('has-garden');
  });
  return {
    start(restart = false) { if (restart) time = 0; if (active) return; active = true; reduced = false; last = 0; frame = requestAnimationFrame(render); },
    stop() { active = false; cancelAnimationFrame(frame); last = 0; },
    rest() { active = false; cancelAnimationFrame(frame); reduced = true; pose(6); draw(); },
    notice() { attention = 1; },
  };
}
