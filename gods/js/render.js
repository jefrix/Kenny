// Draws the World with Three.js. Reads simulation state and never changes it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { N, BUILDINGS, MAX_HEIGHT } from './sim.js';

export const TEAM_COLORS = ['#3f7cf0', '#e0432f'];
const SKY_HORIZON = 0xf3d9b4, SKY_TOP = 0x3f76b8;
const MODEL_NAMES = ['hut', 'house', 'site', 'rubble', 'temple', 'cedar', 'palm', 'rock', 'cloud', 'villager', 'warrior', 'standard', 'hand_open', 'hand_grab'];
const lin = (hex) => new THREE.Color(hex);
const TEAM = TEAM_COLORS.map(lin);

// ----- Models: every GLB becomes one merged geometry, plus a second for parts tinted by tribe. -----

async function loadModels(base) {
  const loader = new GLTFLoader(), models = {};
  await Promise.all(MODEL_NAMES.map(async (name) => {
    const gltf = await loader.loadAsync(`${base}/${name}.glb`);
    gltf.scene.updateMatrixWorld(true);
    const parts = { base: [], team: [] };
    gltf.scene.traverse((node) => {
      if (!node.isMesh) return;
      const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
      geometry.applyMatrix4(node.matrixWorld);
      for (const attribute of Object.keys(geometry.attributes)) if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
      const count = geometry.attributes.position.count, colors = new Float32Array(count * 3), c = node.material.color;
      for (let i = 0; i < count; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      (node.material.name === 'team' ? parts.team : parts.base).push(geometry);
    });
    models[name] = { base: parts.base.length ? mergeGeometries(parts.base) : null, team: parts.team.length ? mergeGeometries(parts.team) : null };
  }));
  return models;
}

class Batch {
  constructor(scene, model, capacity, material, shadows = true) {
    this.meshes = [];
    if (model.base) this.base = this.addMesh(scene, model.base, capacity, material, shadows);
    if (model.team) this.team = this.addMesh(scene, model.team, capacity, material, shadows);
    this.count = 0; this.capacity = capacity; this.dummy = new THREE.Object3D(); this.dummy.rotation.order = 'YXZ';
  }
  addMesh(scene, geometry, capacity, material, shadows) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.castShadow = shadows; mesh.receiveShadow = shadows; mesh.frustumCulled = false; mesh.count = 0;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    scene.add(mesh); this.meshes.push(mesh); return mesh;
  }
  add(x, y, z, yaw = 0, scale = 1, scaleY = scale, pitch = 0, roll = 0, tint = null, team = null) {
    if (this.count >= this.capacity) return;
    const d = this.dummy, i = this.count++;
    d.position.set(x, y, z); d.rotation.set(pitch, yaw, roll); d.scale.set(scale, scaleY, scale); d.updateMatrix();
    if (this.base) { this.base.setMatrixAt(i, d.matrix); this.base.instanceColor.setXYZ(i, tint ? tint.r : 1, tint ? tint.g : 1, tint ? tint.b : 1); }
    if (this.team) { this.team.setMatrixAt(i, d.matrix); const c = team || tint; this.team.instanceColor.setXYZ(i, c ? c.r : 1, c ? c.g : 1, c ? c.b : 1); }
  }
  commit() {
    for (const m of this.meshes) { m.count = this.count; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    this.count = 0;
  }
}

// ----- Particles: one pool of points for glow, one for smoke and dust. -----

function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

class Particles {
  constructor(scene, capacity, additive, texture) {
    this.capacity = capacity; this.items = []; this.position = new Float32Array(capacity * 3); this.color = new Float32Array(capacity * 4); this.size = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.position, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 4)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: texture }, scale: { value: 500 } },
      vertexShader: 'attribute vec4 aColor; attribute float aSize; varying vec4 vColor; uniform float scale; void main(){ vColor=aColor; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aSize*scale/-mv.z; gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vColor; void main(){ gl_FragColor=vColor*texture2D(map,gl_PointCoord); }',
    });
    this.points = new THREE.Points(g, this.material); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(x, y, z, o = {}) {
    if (this.items.length >= this.capacity) this.items.shift();
    const c = o.color || new THREE.Color(1, 1, 1);
    this.items.push({ x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, max: o.life || 1, size: o.size || 0.5, grow: o.grow || 0, gravity: o.gravity || 0, drag: o.drag || 0, r: c.r, g: c.g, b: c.b, alpha: o.alpha ?? 1 });
  }
  update(dt) {
    const items = this.items; let w = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i]; p.life -= dt; if (p.life <= 0) continue;
      p.vy -= p.gravity * dt; const damp = Math.max(0, 1 - p.drag * dt); p.vx *= damp; p.vy *= damp; p.vz *= damp;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size += p.grow * dt;
      const fade = Math.min(1, p.life / p.max * 2.2) * p.alpha;
      this.position[w * 3] = p.x; this.position[w * 3 + 1] = p.y; this.position[w * 3 + 2] = p.z;
      this.color[w * 4] = p.r; this.color[w * 4 + 1] = p.g; this.color[w * 4 + 2] = p.b; this.color[w * 4 + 3] = fade;
      this.size[w] = p.size; items[w++] = p;
    }
    items.length = w;
    const g = this.points.geometry; g.setDrawRange(0, w);
    g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = true;
  }
}

const WATER_VERTEX = `varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const WATER_FRAGMENT = `
uniform float time, sea, size; uniform sampler2D heights; uniform vec3 fogColor, sunDir; varying vec3 vWorld;
float wave(vec2 p){ return sin(p.x*.9+time*.8)*.5+sin(p.y*1.3-time*.6)*.35+sin((p.x+p.y)*2.1+time*1.2)*.2+sin((p.x-p.y)*3.7-time*1.7)*.12; }
void main(){
  vec2 uv=(vWorld.xz+.5)/size; float ground=-2.6;
  // Past the map edge the sea floor keeps falling away, so the map has no visible border.
  vec2 inside=min(uv,1.-uv); float edge=smoothstep(-.02,.16,min(inside.x,inside.y));
  if(uv.x>0.&&uv.y>0.&&uv.x<1.&&uv.y<1.) ground=mix(-2.6,texture2D(heights,uv).r,edge);
  float depth=sea-ground;
  if(depth<-.02) discard;
  vec2 q=vWorld.xz; float e=.25; float w=wave(q);
  float cameraDist=length(cameraPosition-vWorld), calm=1.-smoothstep(45.,130.,cameraDist);
  vec3 n=normalize(vec3((wave(q+vec2(e,0.))-w)*.14/e*calm,1.,(wave(q+vec2(0.,e))-w)*.14/e*calm));
  vec3 view=normalize(cameraPosition-vWorld);
  float fres=pow(1.-max(dot(n,view),0.),3.);
  vec3 deep=vec3(.015,.13,.30), mid=vec3(.02,.36,.46), shallow=vec3(.20,.66,.60);
  vec3 col=mix(shallow,mid,smoothstep(0.,.55,depth)); col=mix(col,deep,smoothstep(.45,1.9,depth));
  col+=vec3(.55,.68,.8)*fres*.55;
  float spec=pow(max(dot(reflect(-sunDir,n),view),0.),110.); col+=vec3(1.,.9,.7)*spec*1.25;
  float foamLine=sin(depth*30.-time*1.7+w*2.)*.5+.5;
  float foam=smoothstep(.34,0.,depth)*smoothstep(.45,.95,foamLine)+smoothstep(.07,0.,depth);
  col=mix(col,vec3(.95,.96,.9),clamp(foam,0.,1.)*.82);
  float alpha=mix(.62,.95,smoothstep(0.,1.3,depth)); alpha=max(alpha,clamp(foam,0.,1.));
  float fog=smoothstep(95.,300.,cameraDist);
  gl_FragColor=vec4(mix(col,fogColor,fog),alpha);
  #include <colorspace_fragment>
}`;

export class GodRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
    const scene = this.scene = new THREE.Scene(); scene.fog = new THREE.Fog(SKY_HORIZON, 100, 300); scene.background = lin(SKY_HORIZON);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.09, minDistance: 13, maxDistance: 105, minPolarAngle: 0.35, maxPolarAngle: 1.3, screenSpacePanning: false, zoomSpeed: 0.9, rotateSpeed: 0.7 });
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0xb0824e, 1.25); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffe0b0, 2.7); this.sunDir = new THREE.Vector3(-0.55, 0.62, 0.42).normalize();
    sun.position.copy(this.sunDir).multiplyScalar(120).add(new THREE.Vector3(N / 2, 0, N / 2)); sun.target.position.set(N / 2, 0, N / 2); scene.add(sun, sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -72, right: 72, top: 72, bottom: -72, near: 10, far: 260 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
    this.addSky();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const soft = softTexture(); this.glow = new Particles(scene, 2500, true, soft); this.smoke = new Particles(scene, 1400, false, soft);
    this.positions = new WeakMap(); this.effects = []; this.shake = 0; this.flash = 0; this.time = 0; this.hand = { x: N / 2, y: N / 2, visible: false, grabbing: false, smoothX: N / 2, smoothY: N / 2 };
    this.motionOk = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.v = new THREE.Vector3();
    this.addEventListeners();
  }

  addSky() {
    const geometry = new THREE.SphereGeometry(600, 24, 14), material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: lin(SKY_TOP) }, horizon: { value: lin(SKY_HORIZON) } },
      vertexShader: 'varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top,horizon; varying vec3 vPos; void main(){ float h=clamp(normalize(vPos).y*1.8,0.,1.); gl_FragColor=vec4(mix(horizon,top,pow(h,.75)),1.);\n#include <colorspace_fragment>\n}',
    });
    this.sky = new THREE.Mesh(geometry, material); this.scene.add(this.sky);
  }

  addEventListeners() {
    const resize = () => {
      const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
      this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      const scale = this.renderer.getPixelRatio() * h * 0.62; this.glow.material.uniforms.scale.value = scale; this.smoke.material.uniforms.scale.value = scale;
    };
    addEventListener('resize', resize); resize();
  }

  async load(base = 'models') {
    const m = this.models = await loadModels(base), s = this.scene, mat = this.material;
    this.batches = {
      villager: new Batch(s, m.villager, 240, mat), warrior: new Batch(s, m.warrior, 240, mat), hut: new Batch(s, m.hut, 90, mat), house: new Batch(s, m.house, 70, mat),
      site: new Batch(s, m.site, 40, mat), temple: new Batch(s, m.temple, 2, mat), cedar: new Batch(s, m.cedar, 280, mat), palm: new Batch(s, m.palm, 280, mat),
      rock: new Batch(s, m.rock, 60, mat), standard: new Batch(s, m.standard, 2, mat), rubble: new Batch(s, m.rubble, 60, mat), cloud: new Batch(s, m.cloud, 8, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72 }), false),
    };
    this.handGroup = new THREE.Group();
    const handMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.handOpen = new THREE.Mesh(m.hand_open.base, handMaterial); this.handGrab = new THREE.Mesh(m.hand_grab.base, handMaterial);
    this.handOpen.castShadow = this.handGrab.castShadow = true; this.handGroup.add(this.handOpen, this.handGrab); this.handGroup.visible = false; s.add(this.handGroup);
    this.addCursor();
    this.cloudSpots = Array.from({ length: 6 }, (_, i) => ({ x: (i * 37) % 150 - 30, z: (i * 61) % 130 - 20, y: 25 + (i % 3) * 3, scale: 1.2 + (i % 3) * 0.45, speed: 0.5 + (i % 2) * 0.35 }));
  }

  // ----- World binding -----

  setWorld(world, focusTribe = 0) {
    this.world = world; this.rubble = [];
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); }
    const geometry = new THREE.BufferGeometry(), count = N * N;
    this.terrainPositions = new Float32Array(count * 3); this.terrainColors = new Float32Array(count * 3);
    const index = new Uint32Array((N - 1) * (N - 1) * 6); let k = 0;
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
      const a = y * N + x, b = a + N, c = a + 1, d = b + 1;
      if ((x + y) % 2) { index[k++] = a; index[k++] = b; index[k++] = c; index[k++] = c; index[k++] = b; index[k++] = d; }
      else { index[k++] = a; index[k++] = b; index[k++] = d; index[k++] = a; index[k++] = d; index[k++] = c; }
    }
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(this.terrainPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.terrainColors, 3));
    this.terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
    this.terrain.receiveShadow = true; this.terrain.castShadow = true; this.terrain.frustumCulled = false; this.scene.add(this.terrain);
    this.heightData = new Uint16Array(count);
    if (!this.water) this.addWater();
    this.heightTexture.image.data = this.heightData;
    this.updateTerrain(0, 0, N - 1, N - 1); this.lastInfluence = -1;
    const home = world.tribes[focusTribe].temple, cx = N / 2, cy = N / 2, along = Math.hypot(home.x - cx, home.y - cy) || 1;
    this.controls.target.set(home.x, 2.5, home.y);
    this.camera.position.set(home.x + (home.x - cx) / along * 36, 30, home.y + (home.y - cy) / along * 36);
    this.controls.update();
  }

  addWater() {
    this.heightTexture = new THREE.DataTexture(new Uint16Array(N * N), N, N, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTexture.minFilter = this.heightTexture.magFilter = THREE.LinearFilter; this.heightTexture.wrapS = this.heightTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.waterUniforms = { time: { value: 0 }, sea: { value: 0 }, size: { value: N }, heights: { value: this.heightTexture }, fogColor: { value: lin(SKY_HORIZON) }, sunDir: { value: this.sunDir } };
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: this.waterUniforms, vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), material); this.water.rotation.x = -Math.PI / 2; this.water.position.set(N / 2, 0, N / 2); this.water.renderOrder = 1; this.scene.add(this.water);
  }

  updateTerrain(x0, y0, x1, y1) {
    const w = this.world, h = w.heights, pos = this.terrainPositions;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * N + x; pos[i * 3] = x; pos[i * 3 + 1] = h[i]; pos[i * 3 + 2] = y;
      this.heightData[i] = THREE.DataUtils.toHalfFloat(h[i]);
    }
    this.terrain.geometry.attributes.position.needsUpdate = true; this.terrain.geometry.computeBoundingSphere();
    this.heightTexture.needsUpdate = true;
    this.colorTerrain(Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(N - 1, x1 + 1), Math.min(N - 1, y1 + 1));
  }

  colorTerrain(x0, y0, x1, y1) {
    const w = this.world, h = w.heights, inf = w.influence, col = this.terrainColors;
    const sand = [0.72, 0.56, 0.33], olive = [0.38, 0.44, 0.14], steppe = [0.52, 0.47, 0.19], rock = [0.30, 0.25, 0.20], pale = [0.66, 0.61, 0.52], seabed = [0.18, 0.28, 0.25], cut = [0.52, 0.36, 0.20];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * N + x, v = h[i];
      const dx = (x < N - 1 ? h[i + 1] : v) - (x > 0 ? h[i - 1] : v), dy = (y < N - 1 ? h[i + N] : v) - (y > 0 ? h[i - N] : v), slope = Math.hypot(dx, dy) / 2;
      const hash = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      let c = v < 0 ? mix(seabed, sand, smooth(-0.9, 0, v)) : mix(sand, olive, smooth(0.12, 0.62, v));
      c = mix(c, steppe, smooth(1.2, 2.5, v) * (0.5 + hash * 0.5)); c = mix(c, rock, smooth(3.2, 4.4, v)); c = mix(c, pale, smooth(5, 6.2, v));
      if (v > 0.2) c = mix(c, cut, smooth(0.42, 0.9, slope) * 0.85);
      const m = inf[i]; const bright = 0.92 + hash * 0.16; let r = c[0] * bright, g = c[1] * bright, b = c[2] * bright;
      if (m && v > w.sea) {
        const border = x > 0 && y > 0 && x < N - 1 && y < N - 1 && (inf[i - 1] !== m || inf[i + 1] !== m || inf[i - N] !== m || inf[i + N] !== m || inf[i - N - 1] !== m || inf[i - N + 1] !== m || inf[i + N - 1] !== m || inf[i + N + 1] !== m);
        const team = m === 1 ? TEAM[0] : m === 2 ? TEAM[1] : null, amount = border ? 0.5 : 0.07;
        if (team) { r += (team.r - r) * amount; g += (team.g - g) * amount; b += (team.b - b) * amount; }
        else if (m === 3) { r += (0.9 - r) * amount; g += (0.72 - g) * amount; b += (0.25 - b) * amount; }
      }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    }
    this.terrain.geometry.attributes.color.needsUpdate = true;
  }

  // ----- Picking -----

  groundAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.ray.ray, w = this.world, sea = w.sea;
    if (direction.y >= -0.01) return null;
    let t = Math.max(0, (MAX_HEIGHT + 1 - origin.y) / direction.y), previous = t;
    for (let i = 0; i < 900; i++, t += 0.3) {
      const x = origin.x + direction.x * t, y = origin.y + direction.y * t, z = origin.z + direction.z * t;
      if (x < -30 || z < -30 || x > N + 30 || z > N + 30) { if (y < sea) return null; continue; }
      if (y <= Math.max(w.heightAt(x, z), sea)) {
        let lo = previous, hi = t;
        for (let j = 0; j < 6; j++) { const m = (lo + hi) / 2, ym = origin.y + direction.y * m; if (ym <= Math.max(w.heightAt(origin.x + direction.x * m, origin.z + direction.z * m), sea)) hi = m; else lo = m; }
        const px = origin.x + direction.x * hi, pz = origin.z + direction.z * hi;
        if (px < 0 || pz < 0 || px > N - 1 || pz > N - 1) return null;
        return { x: px, y: pz };
      }
      previous = t;
    }
    return null;
  }

  screenOf(x, y, z) {
    this.v.set(x, y, z).project(this.camera); const r = this.canvas.getBoundingClientRect();
    return { x: (this.v.x + 1) / 2 * r.width + r.left, y: (1 - this.v.y) / 2 * r.height + r.top, behind: this.v.z > 1 };
  }

  // Finds what the Hand would grab. People win over rocks, rocks win over trees.
  pickEntity(clientX, clientY) {
    const w = this.world; let best = null, bestScore = Infinity;
    const consider = (kind, e, height, reach, rank) => {
      const s = this.screenOf(e.x, height, e.y); if (s.behind) return;
      const d = Math.hypot(s.x - clientX, s.y - clientY); if (d > reach) return;
      const score = d + rank; if (score < bestScore) { bestScore = score; best = { kind, id: e.id, ref: e }; }
    };
    for (const p of w.people) if (p.state !== 'carried' && p.state !== 'air') consider('person', p, w.heightAt(p.x, p.y) + 0.45, 30, 0);
    for (const r of w.rocks) consider('rock', r, w.heightAt(r.x, r.y) + 0.4, 26, 18);
    for (const t of w.trees) if (t.growth > 0.6) consider('tree', t, w.heightAt(t.x, t.y) + 1, 24, 36);
    return best;
  }

  // ----- Cursor ring and Hand -----

  addCursor() {
    const segments = 72, geometry = new THREE.BufferGeometry(); this.ringVerts = new Float32Array((segments + 1) * 2 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.ringVerts, 3));
    const index = []; for (let i = 0; i < segments; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geometry.setIndex(index);
    this.ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, fog: false }));
    this.ring.frustumCulled = false; this.ring.visible = false; this.ring.renderOrder = 5; this.ringSegments = segments; this.scene.add(this.ring);
  }

  setCursor(x, y, radius, valid) {
    if (!radius) { this.ring.visible = false; return; }
    this.ring.visible = true; this.ring.material.color.set(valid ? 0xffd76a : 0xff5a43);
    const w = this.world, v = this.ringVerts, width = Math.max(0.12, this.camera.position.distanceTo(this.controls.target) * 0.0038);
    for (let i = 0; i <= this.ringSegments; i++) {
      const a = i / this.ringSegments * Math.PI * 2 + this.time * 0.15, ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j < 2; j++) {
        const r = radius + (j ? width : -width), px = x + ca * r, py = y + sa * r, h = Math.max(w.heightAt(px, py), w.sea) + 0.12, o = (i * 2 + j) * 3;
        v[o] = px; v[o + 1] = h; v[o + 2] = py;
      }
    }
    this.ring.geometry.attributes.position.needsUpdate = true;
  }

  setHand(x, y, visible, grabbing) { Object.assign(this.hand, { x, y, visible, grabbing }); }

  updateHand(dt) {
    const h = this.hand, group = this.handGroup, w = this.world;
    group.visible = !!h.visible; if (!h.visible) return;
    const follow = Math.min(1, dt * 22); h.smoothX += (h.x - h.smoothX) * follow; h.smoothY += (h.y - h.smoothY) * follow;
    this.handOpen.visible = !h.grabbing; this.handGrab.visible = !!h.grabbing;
    const distance = this.camera.position.distanceTo(this.controls.target), scale = Math.max(0.8, distance * 0.036);
    const yaw = this.controls.getAzimuthalAngle();
    const ground = Math.max(w.heightAt(h.smoothX, h.smoothY), w.sea), lift = (h.grabbing ? 2 : 0.8) + Math.sin(this.time * 2.3) * 0.08;
    // The model's fingertips sit in front of its origin. Shift so the tips point at the cursor.
    const tipForward = (h.grabbing ? 1.4 : 2.3) * scale, tipDown = (h.grabbing ? 0.7 : 0.75) * scale;
    group.position.set(h.smoothX + Math.sin(yaw) * tipForward, ground + lift * Math.max(1, scale) + tipDown, h.smoothY + Math.cos(yaw) * tipForward);
    group.rotation.set(0, yaw, 0); group.scale.setScalar(scale);
    this.handTip = { x: h.smoothX, y: ground + lift * Math.max(1, scale) - 0.1, z: h.smoothY };
  }

  // ----- Camera -----

  panBy(dx, dz) {
    const c = this.controls, nx = Math.max(2, Math.min(N - 2, c.target.x + dx)) - c.target.x, nz = Math.max(2, Math.min(N - 2, c.target.z + dz)) - c.target.z;
    c.target.x += nx; c.target.z += nz; this.camera.position.x += nx; this.camera.position.z += nz;
  }
  panScreen(right, forward) {
    const a = this.controls.getAzimuthalAngle(), speed = this.camera.position.distanceTo(this.controls.target) * 0.028;
    this.panBy((Math.cos(a) * right - Math.sin(a) * forward) * speed, (-Math.sin(a) * right - Math.cos(a) * forward) * speed);
  }
  focus(x, y) { this.panBy(x - this.controls.target.x, y - this.controls.target.z); }
  rotate(angle) {
    const c = this.controls, off = this.camera.position.clone().sub(c.target); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle); this.camera.position.copy(c.target).add(off);
  }

  // ----- Events become effects -----

  groundY(x, y) { return Math.max(this.world.heightAt(x, y), this.world.sea); }

  handleEvent(e) {
    const g = e.y === undefined ? 0 : this.groundY(e.x, e.y), rnd = Math.random, spread = (n) => (rnd() - 0.5) * n;
    const dust = lin(0xb79a72), fire = lin(0xff8a2a), gold = lin(0xffd76a), blue = lin(0xcfe8ff), white = lin(0xfff6dc);
    switch (e.type) {
      case 'miracle':
        if (e.name === 'lightning') this.lightning(e.x, e.y);
        else if (e.name === 'bless') { this.ringBurst(e.x, e.y, e.radius, 0xffd76a, 1.2); for (let i = 0; i < 90; i++) { const a = rnd() * 6.28, r = rnd() * e.radius, px = e.x + Math.cos(a) * r, py = e.y + Math.sin(a) * r; this.glow.emit(px, this.groundY(px, py) + rnd(), py, { vy: 1.6 + rnd() * 2, life: 1 + rnd() * 1.5, size: 0.35, color: gold }); } }
        else if (e.name === 'rain') this.effects.push({ kind: 'rain', x: e.x, y: e.y, until: this.time + 10 });
        else if (e.name === 'fire') this.effects.push({ kind: 'meteor', x: e.x, y: e.y, start: this.time, at: this.time + 0.9 });
        else if (e.name === 'quake') this.effects.push({ kind: 'quake', x: e.x, y: e.y, until: this.time + 3 });
        else if (e.name === 'flood') this.flash = Math.max(this.flash, 0.2);
        break;
      case 'fireImpact':
        this.shake = Math.max(this.shake, 0.55); this.flash = Math.max(this.flash, 0.25);
        this.ringBurst(e.x, e.y, 5.4, 0xff8a2a, 0.8);
        for (let i = 0; i < 130; i++) { const a = rnd() * 6.28, v = 2 + rnd() * 8; this.glow.emit(e.x, g + 0.3, e.y, { vx: Math.cos(a) * v, vy: 2 + rnd() * 7, vz: Math.sin(a) * v, gravity: 7, drag: 0.8, life: 0.6 + rnd() * 1, size: 0.5 + rnd() * 0.9, color: rnd() < 0.5 ? fire : gold }); }
        for (let i = 0; i < 26; i++) this.smoke.emit(e.x + spread(6), g + rnd(), e.y + spread(6), { vy: 1.2 + rnd() * 1.6, life: 2 + rnd() * 2, size: 1.6, grow: 1.2, color: lin(0x2d2622), alpha: 0.65 });
        break;
      case 'quakePulse': this.shake = Math.max(this.shake, 0.3); for (let i = 0; i < 16; i++) { const a = rnd() * 6.28, r = rnd() * 7.5, px = e.x + Math.cos(a) * r, py = e.y + Math.sin(a) * r; this.smoke.emit(px, this.groundY(px, py) + 0.1, py, { vy: 0.7 + rnd(), life: 1 + rnd(), size: 1, grow: 1.6, color: dust, alpha: 0.55 }); } break;
      case 'collapse':
        this.rubble.push({ x: e.x, y: e.y, scale: e.building === 'temple' ? 3.6 : e.building === 'house' ? 1.45 : 1, turn: rnd() * 6.28, until: this.time + 45 });
        this.shake = Math.max(this.shake, e.building === 'temple' ? 1.2 : 0.14);
        for (let i = 0; i < (e.building === 'temple' ? 150 : 28); i++) this.smoke.emit(e.x + spread(e.building === 'temple' ? 8 : 3), g + rnd(), e.y + spread(e.building === 'temple' ? 8 : 3), { vy: 0.6 + rnd() * 1.4, life: 1.2 + rnd() * 2, size: 1, grow: 1.4, color: dust, alpha: 0.65 });
        break;
      case 'death': for (let i = 0; i < 6; i++) this.glow.emit(e.x, g + 0.5, e.y, { vy: 1.5 + rnd(), vx: spread(1), vz: spread(1), life: 0.8 + rnd() * 0.5, size: 0.2, color: white, alpha: 0.75 }); break;
      case 'convert': case 'recruit': this.ringBurst(e.x, e.y, e.type === 'convert' ? 1.8 : 0.9, e.type === 'convert' ? 0xffffff : TEAM_COLORS[e.tribe], 0.5); break;
      case 'birth': for (let i = 0; i < 5; i++) this.glow.emit(e.x, g + 0.2, e.y, { vy: 1 + rnd(), life: 0.8, size: 0.18, color: lin(TEAM_COLORS[e.tribe]) }); break;
      case 'built': this.ringBurst(e.x, e.y, 2.2, TEAM_COLORS[e.tribe], 0.6); for (let i = 0; i < 12; i++) this.smoke.emit(e.x + spread(3), g + 0.2, e.y + spread(3), { vy: 0.5, life: 1, size: 0.7, grow: 1, color: dust, alpha: 0.45 }); break;
      case 'impact': this.shake = Math.max(this.shake, e.big ? 0.22 : 0.08); for (let i = 0; i < 18; i++) { const a = rnd() * 6.28, v = 1 + rnd() * 3.5; this.smoke.emit(e.x, g + 0.2, e.y, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 0.5 + rnd() * 1.4, drag: 2, life: 0.8 + rnd() * 0.7, size: 0.7, grow: 1.2, color: dust, alpha: 0.65 }); } break;
      case 'splash': for (let i = 0; i < 24; i++) { const a = rnd() * 6.28, v = 0.8 + rnd() * 3; this.glow.emit(e.x, g + 0.1, e.y, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2 + rnd() * 4, gravity: 12, life: 0.7, size: 0.22, color: blue, alpha: 0.75 }); } break;
      case 'offering': this.ringBurst(e.x, e.y, 2, 0xffd76a, 0.7); break;
      case 'hit': this.glow.emit(e.x, g + 0.5, e.y, { vy: 1, vx: spread(2), vz: spread(2), life: 0.22, size: 0.25, color: white }); break;
      case 'standard': this.ringBurst(e.x, e.y, 2, TEAM_COLORS[e.tribe], 0.7); break;
      case 'over': this.flash = Math.max(this.flash, 0.5); break;
      default: break;
    }
  }

  ringBurst(x, y, radius, color, life) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, this.groundY(x, y) + 0.5, y); this.scene.add(mesh);
    this.effects.push({ kind: 'ring', mesh, radius, born: this.time, life });
  }

  lightning(x, y) {
    const ground = this.groundY(x, y), top = ground + 34, material = new THREE.MeshBasicMaterial({ color: 0xdfeaff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
    const group = new THREE.Group(); let px = x + (Math.random() - 0.5) * 7, py = top, pz = y + (Math.random() - 0.5) * 7; const segments = 12, thickness = 0.2;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments, nx = i === segments ? x : px + (x - px) / (segments - i + 1) + (Math.random() - 0.5) * 2.4, ny = top + (ground - top) * t, nz = i === segments ? y : pz + (y - pz) / (segments - i + 1) + (Math.random() - 0.5) * 2.4;
      const length = Math.hypot(nx - px, ny - py, nz - pz), mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, length, thickness), material);
      mesh.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx - px, ny - py, nz - pz).normalize()); group.add(mesh);
      px = nx; py = ny; pz = nz;
    }
    this.scene.add(group); this.effects.push({ kind: 'bolt', group, material, born: this.time, life: 0.35 });
    this.flash = Math.max(this.flash, 0.65); this.shake = Math.max(this.shake, 0.3);
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, v = 2 + Math.random() * 7; this.glow.emit(x, ground + 0.2, y, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1 + Math.random() * 6, gravity: 11, life: 0.5 + Math.random() * 0.4, size: 0.24, color: lin(0xcfe2ff) }); }
    this.ringBurst(x, y, 2.6, 0xcfe2ff, 0.4);
  }

  updateEffects(dt) {
    const t = this.time, rnd = Math.random;
    this.effects = this.effects.filter((e) => {
      if (e.kind === 'ring') { const a = (t - e.born) / e.life; if (a >= 1) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); return false; } e.mesh.scale.setScalar(e.radius * (0.25 + a * 0.85)); e.mesh.material.opacity = 1 - a; return true; }
      if (e.kind === 'bolt') { const a = (t - e.born) / e.life; if (a >= 1) { this.scene.remove(e.group); e.group.children.forEach((m) => m.geometry.dispose()); e.material.dispose(); return false; } e.material.opacity = (1 - a) * (Math.sin(a * 40) > -0.3 ? 1 : 0.2); return true; }
      if (e.kind === 'rain') { if (t >= e.until) return false; for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 12, x = e.x + Math.cos(a) * r, z = e.y + Math.sin(a) * r, g = this.groundY(x, z); this.glow.emit(x, g + 15 + rnd() * 5, z, { vy: -24, life: 0.7, size: 0.13, color: lin(0xc2deff), alpha: 0.7 }); } if (rnd() < 0.15) this.smoke.emit(e.x + (rnd() - 0.5) * 16, this.groundY(e.x, e.y) + 18, e.y + (rnd() - 0.5) * 16, { life: 3, size: 9, grow: 1, color: lin(0x5f6978), alpha: 0.5 }); return true; }
      if (e.kind === 'meteor') { if (t >= e.at) return false; const a = (t - e.start) / (e.at - e.start), g = this.groundY(e.x, e.y), x = e.x + (1 - a) * 16, y = g + (1 - a) * 42, z = e.y - (1 - a) * 10; for (let i = 0; i < 9; i++) this.glow.emit(x + (rnd() - 0.5), y + (rnd() - 0.5), z + (rnd() - 0.5), { life: 0.45, size: 1.3 + rnd() * 1.1, grow: -1, color: rnd() < 0.5 ? lin(0xff8a2a) : lin(0xffd76a) }); return true; }
      if (e.kind === 'quake') { this.shake = Math.max(this.shake, 0.16); return t < e.until; }
      return true;
    });
  }

  // ----- Frame -----

  frame(dt, moving = true) {
    const w = this.world; if (!w || !this.batches) return;
    this.time += dt; const t = this.time, b = this.batches, rnd = Math.random;
    if (w.dirty) { const d = w.dirty; w.dirty = null; this.updateTerrain(d.x0, d.y0, d.x1, d.y1); }
    if (w.tick !== this.lastInfluence && w.tick % 10 === 0) { this.lastInfluence = w.tick; this.colorTerrain(0, 0, N - 1, N - 1); }
    this.waterUniforms.time.value = t; this.waterUniforms.sea.value = w.sea; this.water.position.y = w.sea;

    // Trees, rocks, buildings.
    const burnt = lin(0x32281f);
    for (const tree of w.trees) {
      const g = w.heightAt(tree.x, tree.y), s = tree.scale * (0.2 + tree.growth * 0.8), sway = Math.sin(t * 1.1 + tree.turn * 5) * 0.022;
      (tree.kind === 'palm' ? b.palm : b.cedar).add(tree.x, g - 0.05, tree.y, tree.turn, s, s, sway, sway * 0.6, tree.burn > 0 ? burnt : null);
      if (tree.burn > 0 && moving) { if (rnd() < dt * 26) this.glow.emit(tree.x + (rnd() - 0.5) * 0.7, g + 0.6 + rnd(), tree.y + (rnd() - 0.5) * 0.7, { vy: 1.8, life: 0.55, size: 0.75, grow: -0.5, color: rnd() < 0.5 ? lin(0xff8a2a) : lin(0xffb545) }); if (rnd() < dt * 6) this.smoke.emit(tree.x, g + 2, tree.y, { vy: 1.2, life: 2, size: 0.8, grow: 0.9, color: lin(0x322a24), alpha: 0.45 }); }
    }
    for (const r of w.rocks) b.rock.add(r.x, w.heightAt(r.x, r.y) - 0.05, r.y, r.turn, r.scale);
    for (const f of w.flying) this.drawLoose(f.kind, f.ref, f.x, f.z, f.y, f.turn + t * 5);
    this.rubble = this.rubble.filter((r) => r.until > t);
    for (const r of this.rubble) b.rubble.add(r.x, w.heightAt(r.x, r.y), r.y, r.turn, r.scale);
    for (const tr of w.tribes) {
      if (tr.standard) { const s = tr.standard; b.standard.add(s.x, w.heightAt(s.x, s.y), s.y, Math.sin(t * 1.5) * 0.08, 1, 1, 0, 0, null, TEAM[tr.id]); }
    }
    for (const bu of w.buildings) {
      const g = w.heightAt(bu.x, bu.y) - 0.03, batch = b[bu.type], team = TEAM[bu.tribe];
      if (bu.progress >= 1) batch.add(bu.x, g, bu.y, bu.turn, 1, 1, 0, 0, null, team);
      else { b.site.add(bu.x, g, bu.y, bu.turn, bu.type === 'house' ? 1.4 : 1); batch.add(bu.x, g, bu.y, bu.turn, 0.96, Math.max(0.04, bu.progress), 0, 0, null, team); }
      if (!moving) continue;
      const def = BUILDINGS[bu.type], damaged = 1 - bu.hp / def.hp;
      if (bu.burn > 0 || damaged > 0.45) {
        const s = def.radius;
        if (bu.burn > 0) { for (let i = 0; i < (bu.type === 'temple' ? 2 : 1); i++) if (rnd() < dt * 34) this.glow.emit(bu.x + (rnd() - 0.5) * s * 1.7, g + rnd() * s * 0.9, bu.y + (rnd() - 0.5) * s * 1.7, { vy: 2.2, life: 0.65, size: 0.8 + rnd() * 0.6, grow: -0.6, color: rnd() < 0.5 ? lin(0xff8a2a) : lin(0xffc04a) }); }
        if (rnd() < dt * (bu.burn > 0 ? 9 : 4)) this.smoke.emit(bu.x + (rnd() - 0.5) * s, g + s * 0.9, bu.y + (rnd() - 0.5) * s, { vy: 1.4, vx: 0.3, life: 2.8, size: 1, grow: 1.1, color: lin(0x2a2420), alpha: 0.5 });
      }
      if (bu.type === 'temple' && rnd() < dt * 6) { const side = rnd() < 0.5 ? -3.4 : 3.4, c = Math.cos(bu.turn), s = Math.sin(bu.turn), lx = side, lz = 3.1; this.glow.emit(bu.x + lx * c + lz * s, g + 2.3, bu.y - lx * s + lz * c, { vy: 1, life: 0.6, size: 0.45, color: lin(0xff9a2e) }); }
    }

    // People.
    for (const p of w.people) {
      let s = this.positions.get(p); if (!s) { s = { x: p.x, y: p.y, heading: p.heading }; this.positions.set(p, s); }
      const k = Math.min(1, dt * 12); s.x += (p.x - s.x) * k; s.y += (p.y - s.y) * k;
      let dh = p.heading - s.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2; s.heading += dh * Math.min(1, dt * 9);
      const batch = p.role === 'warrior' ? b.warrior : b.villager, team = TEAM[p.tribe], phase = t * 10 + p.seed;
      if (p.state === 'carried') { const tip = this.handTip; if (tip) { s.x = tip.x; s.y = tip.z; batch.add(tip.x, tip.y - 0.9, tip.z, t * 1.4, 1.7, 1.7, Math.sin(t * 5) * 0.3, Math.cos(t * 4) * 0.3, null, team); } continue; }
      if (p.state === 'air') { s.x = p.x; s.y = p.y; batch.add(p.x, p.z, p.y, t * 9 + p.seed, 1.7, 1.7, t * 7, t * 5, null, team); continue; }
      let y = w.heightAt(s.x, s.y), pitch = 0, roll = 0;
      if (p.state === 'swim') { y = w.sea - 0.42; roll = Math.sin(phase) * 0.22; }
      else if (p.moving) { y += Math.abs(Math.sin(phase)) * 0.09; roll = Math.sin(phase) * 0.09; }
      else if (p.state === 'pray') { pitch = 0.45 + Math.sin(t * 1.7 + p.seed) * 0.42; if (moving && rnd() < dt * 0.9) this.glow.emit(s.x, y + 0.9, s.y, { vy: 1.9, life: 1.8, size: 0.2, color: lin(0xffd76a), alpha: 0.85 }); }
      else if (p.state === 'work') { pitch = 0.2 + Math.sin(phase * 0.75) * 0.34; }
      else if (p.state === 'fight') { pitch = 0.12 + Math.max(0, Math.sin(phase * 0.8)) * 0.52; }
      if (p.blessUntil > w.time && moving && rnd() < dt * 3) this.glow.emit(s.x, y + 0.5, s.y, { vy: 1.1, life: 0.8, size: 0.16, color: lin(0xffd76a) });
      batch.add(s.x, y, s.y, s.heading, 1.7, 1.7, pitch, roll, null, team);
    }

    this.updateHand(dt);
    for (const tr of w.tribes) if (tr.carried && tr.carried.kind !== 'person' && tr.id === 0 && this.handTip) this.drawLoose(tr.carried.kind, tr.carried.ref, this.handTip.x, this.handTip.y - 0.5, this.handTip.z, t);
    for (const c of this.cloudSpots) { c.x += c.speed * dt; if (c.x > 130) c.x = -40; b.cloud.add(c.x, c.y, c.z, 0, c.scale); }
    for (const batch of Object.values(b)) batch.commit();
    this.glow.update(dt); this.smoke.update(dt); this.updateEffects(dt);

    // Lightning and impacts light the whole scene for a moment.
    this.flash = Math.max(0, this.flash - dt * 2.8);
    this.hemi.intensity = 1.25 + this.flash * 1.6; this.sun.intensity = 2.7 + this.flash * 1.4;
    this.controls.update();
    this.shake = Math.max(0, this.shake - dt * 1.3);
    const offset = this.motionOk && this.shake > 0 ? this.shake * 0.35 : 0, ox = (rnd() - 0.5) * offset, oy = (rnd() - 0.5) * offset, oz = (rnd() - 0.5) * offset;
    this.camera.position.x += ox; this.camera.position.y += oy; this.camera.position.z += oz;
    this.renderer.render(this.scene, this.camera);
    this.camera.position.x -= ox; this.camera.position.y -= oy; this.camera.position.z -= oz;
  }

  drawLoose(kind, ref, x, y, z, spin) {
    if (kind === 'rock') this.batches.rock.add(x, y, z, spin, ref.scale || 1, ref.scale || 1, spin * 0.7, spin * 0.4);
    else if (kind === 'tree') (ref.kind === 'palm' ? this.batches.palm : this.batches.cedar).add(x, y, z, spin * 0.2, (ref.scale || 1) * 0.85, (ref.scale || 1) * 0.85, 1.1, Math.sin(spin) * 0.5);
  }
}
