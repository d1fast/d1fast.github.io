/** Небольшой шейдер света. Без WebGL или при потере контекста остаётся живая CSS-версия. */
export function initLightfield() {
  const root = document.querySelector<HTMLElement>('[data-lightfield]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-light-canvas]');
  if (!root || !canvas) return;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-light-shift]')];
  let shift = 0, targetShift = 0;
  buttons.forEach(button => button.addEventListener('click', () => {
    targetShift += 1.8;
    button.querySelector<SVGElement>('svg')?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)' }], { duration: 1000, easing: 'cubic-bezier(.22,1,.36,1)' });
    root.style.setProperty('--light-shift', String(targetShift));
  }));
  let context: WebGLRenderingContext | null;
  try { context = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' }); }
  catch { return; }
  const gl = context;
  if (!gl) return;
  const vertex = `attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  const fragment = `
    precision mediump float;
    varying vec2 uv;
    uniform float clock,aspect,shift;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
    void main(){
      vec2 p=(uv-.5)*vec2(aspect,1.);
      float t=clock*.065;
      vec2 q=p+vec2(sin(p.y*2.1+t+shift)*.17,cos(p.x*1.6-t*.8)*.18);
      float n=noise(q*2.+vec2(t*.19,-t*.11));
      float cloud=sin(q.x*1.8+q.y*1.3+n*.8-.6+t*.35+shift*.5)*.5+.5;
      vec3 sky=vec3(.63,.82,.88),cream=vec3(.947,.940,.872),pear=vec3(.773,.837,.523);
      vec3 colour=mix(sky,cream,smoothstep(.08,.92,cloud));
      vec2 green=vec2(.55+sin(t*.6+shift)*.35,-.23+cos(t*.5)*.12);
      float pool=exp(-dot((q-green)*vec2(1.35,2.1),(q-green)*vec2(1.35,2.1))*2.4);
      colour=mix(colour,pear,pool*.68);
      float silk=sin(q.x*3.6+q.y*2.8+n*2.4+t*.35);
      float rim=pow(max(0.,1.-abs(silk)),14.);
      colour+=rim*.030;
      gl_FragColor=vec4(colour,1.);
    }`;
  const compile = (type: number, text: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, text); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return; }
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = { clock: gl.getUniformLocation(program, 'clock'), aspect: gl.getUniformLocation(program, 'aspect'), shift: gl.getUniformLocation(program, 'shift') };
  let raf = 0, previous = 0, elapsed = 0, lost = false;
  const resize = () => {
    const ratio = Math.min(.8, 1280 / innerWidth);
    canvas.width = Math.max(1, Math.round(innerWidth * ratio));
    canvas.height = Math.max(1, Math.round(innerHeight * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uniforms.aspect, Math.max(.95, innerWidth / innerHeight));
  };
  const frame = (now: number) => {
    if (lost || document.hidden) return;
    raf = requestAnimationFrame(frame);
    if (previous && now - previous < 32) return;
    elapsed += previous ? Math.min(.1, (now - previous) / 1000) : 0;
    previous = now;
    shift += (targetShift - shift) * .025;
    gl.uniform1f(uniforms.clock, elapsed);
    gl.uniform1f(uniforms.shift, shift);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    root.classList.add('has-field');
  };
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; cancelAnimationFrame(raf); root.classList.remove('has-field');
  });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf); previous = 0;
    if (!document.hidden && !lost) raf = requestAnimationFrame(frame);
  });
  resize(); raf = requestAnimationFrame(frame);
}
