// Framework-free adaptation of React Bits LightRays by David Haz.
// https://reactbits.dev/backgrounds/light-rays — see LICENSE-react-bits.txt.
(async () => {
  const canvas = document.querySelector('#light-rays');
  if (!canvas) return;
  const container = canvas.parentElement;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) return;
  const response = await fetch('/assets/light-rays/shader.frag?v=20260922');
  if (!response.ok) return;
  const fragment = await response.text();
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 vUv; void main(){vUv=position*.5+.5;gl_Position=vec4(position,0.,1.);}'));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniform = name => gl.getUniformLocation(program, name);
  const timeLocation = uniform('iTime');
  const mouseLocation = uniform('mousePos');
  for (const [name,value] of Object.entries({raysSpeed:.35,lightSpread:1.1,rayLength:1.8,pulsating:0,fadeDistance:1,saturation:1,mouseInfluence:.08,noiseAmount:0,distortion:.02,lightMode:1})) gl.uniform1f(uniform(name),value);
  gl.uniform3f(uniform('raysColor'), .50, .57, 1);
  gl.uniform2f(uniform('rayDir'), 0, 1);
  let target = [.5,.5], mouse = [.5,.5], visible = true, frame = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function draw(t = 0) {
    frame = 0;
    mouse = mouse.map((value,i) => value*.94 + target[i]*.06);
    gl.uniform2fv(mouseLocation,mouse);
    gl.uniform1f(timeLocation,reduced.matches ? 12 : t*.001);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(draw);
  }
  function restart() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (visible && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function resize() {
    const ratio = Math.min(devicePixelRatio,1.5);
    canvas.width = Math.round(container.clientWidth*ratio);
    canvas.height = Math.round(container.clientHeight*ratio);
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.uniform2f(uniform('iResolution'),canvas.width,canvas.height);
    gl.uniform2f(uniform('rayPos'),canvas.width*.5,-canvas.height*.2);
    restart();
  }
  new ResizeObserver(resize).observe(container);
  new IntersectionObserver(([entry]) => {visible=entry.isIntersecting;restart();}).observe(container);
  window.addEventListener('pointermove', e => {
    if (reduced.matches || e.pointerType==='touch') return;
    const rect = container.getBoundingClientRect();
    target=[e.clientX/rect.width,Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))];
  },{passive:true});
  document.addEventListener('visibilitychange',restart);
  reduced.addEventListener('change',restart);
  canvas.addEventListener('webglcontextlost', () => {cancelAnimationFrame(frame);visible=false;});
  resize();
})().catch(error => console.warn('Light Rays:', error));
