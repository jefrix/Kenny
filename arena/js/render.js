// Draws a Battle with Three.js. Reads simulation state and never changes it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { buildRobot } from './robot-model.js';
import { ARENAS } from './arenas.js';
import { SIZE } from './sim.js';
import { play } from './audio.js';

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

function floorTexture(base) {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 1024, 1024);
  const P = 1024 / 10;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    g.fillStyle = `rgba(${(i + j) % 2 ? '255,255,255,.035' : '0,0,0,.07'})`; g.fillRect(i * P, j * P, P, P);
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 2; g.strokeRect(i * P, j * P, P, P);
    g.fillStyle = 'rgba(0,0,0,.35)'; for (const [x, y] of [[8, 8], [P - 8, 8], [8, P - 8], [P - 8, P - 8]]) { g.beginPath(); g.arc(i * P + x, j * P + y, 2.5, 0, 7); g.fill(); }
  }
  for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.beginPath(); g.ellipse(Math.random() * 1024, Math.random() * 1024, Math.random() * 34, Math.random() * 12, Math.random() * 3, 0, 7); g.fill(); }
  // Hazard stripes around the edge.
  g.save(); g.beginPath(); g.rect(0, 0, 1024, 1024); g.rect(20, 20, 984, 984); g.clip('evenodd');
  for (let i = -40; i < 2100; i += 40) { g.fillStyle = '#FFC914'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 20, 0); g.lineTo(i - 1004, 1024); g.lineTo(i - 1024, 1024); g.fill(); }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const ZONE_STYLE = {
  lava: { color: 0xff5a14, emissive: 0xff3a00, ei: 1.5 }, mud: { color: 0x4d3a22, emissive: 0, ei: 0, rough: 1 },
  pit: { color: 0x000000, emissive: 0, ei: 0 }, spikes: { color: 0x2a2c33, emissive: 0, ei: 0 }, pad: { color: 0x1fa35b, emissive: 0x0d9a4b, ei: 0.7 },
};

export class ArenaView {
  constructor(canvas, overlay) {
    this.canvas = canvas; this.overlay = overlay;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0d1740); this.scene.fog = new THREE.Fog(0x0d1740, 190, 340);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 700);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.maxPolarAngle = 1.48; this.controls.minDistance = 10; this.controls.maxDistance = 240; this.controls.target.set(50, 0, 50);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a3226, 1.25));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.5); sun.position.set(30, 90, 10); sun.target.position.set(50, 0, 50); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 200 }); sun.shadow.bias = -0.0006; this.scene.add(sun, sun.target);
    this.tex = glowTexture();
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.fx = []; this.sprites = []; this.beams = [];
    for (let i = 0; i < 260; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.visible = false; this.scene.add(s); this.sprites.push({ s, life: 0 }); }
    this.spriteI = 0;
    this.shotMeshes = new Map();
    this.shotGeo = { bullet: new THREE.BoxGeometry(1.4, 0.13, 0.13), rocket: new THREE.CylinderGeometry(0.16, 0.2, 1.1, 8).rotateZ(Math.PI / 2), orb: new THREE.SphereGeometry(0.55, 10, 8) };
    this.showCones = true; this.selected = null; this.followId = null;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas.parentElement);
    this.resize();
  }

  resize() {
    const p = this.canvas.parentElement, w = p.clientWidth, h = p.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  overview() {
    const narrow = this.camera.aspect < 1;
    this.camera.position.set(50, narrow ? 150 : 108, narrow ? 135 : 136); this.controls.target.set(50, 0, 50); this.followId = null;
  }

  load(battle) {
    this.world.clear(); this.overlay.replaceChildren(); this.shotMeshes.forEach((m) => this.scene.remove(m)); this.shotMeshes.clear();
    this.beams.forEach((b) => this.scene.remove(b.m)); this.beams = [];
    for (const f of this.fx) this.scene.remove(f.m); this.fx = [];
    this.battle = battle;
    const a = ARENAS[battle.arena.id];
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: floorTexture(a.floor), roughness: 0.82, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(50, 0, 50); floor.receiveShadow = true; this.world.add(floor);
    // Outer base and perimeter wall.
    const wm = new THREE.MeshStandardMaterial({ color: 0x1b2554, roughness: 0.6, metalness: 0.4 });
    for (const [x, z, w, d] of [[50, -1.5, 106, 3], [50, 101.5, 106, 3], [-1.5, 50, 3, 100], [101.5, 50, 3, 100]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), wm); m.position.set(x, 2, z); m.castShadow = true; m.receiveShadow = true; this.world.add(m); }
    const base = new THREE.Mesh(new THREE.BoxGeometry(900, 1, 900), new THREE.MeshStandardMaterial({ color: 0x0f1c52, roughness: 1 })); base.position.set(50, -1.6, 50); this.world.add(base);

    this.lava = []; this.spikes = [];
    for (const z of battle.arena.zones) this.addZone(z);
    this.solidMeshes = new Map();
    for (const s of battle.arena.solids) this.addSolid(s);

    // Sudden-death walls
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), [ringMat, ringMat, new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshBasicMaterial({ visible: false }), ringMat, ringMat]);
    this.ring.position.set(50, 4.5, 50); this.ring.visible = false; this.world.add(this.ring);

    this.robots = battle.bots.map((b) => {
      const model = buildRobot(b.design, b.color, { cone: true }); this.world.add(model.root);
      const tag = document.createElement('div'); tag.className = 'tag'; const nm = document.createElement('span'); nm.className = 'tag-name'; nm.textContent = b.name;
      const bar = document.createElement('i'); bar.className = 'tag-hp'; const fill = document.createElement('b'); fill.style.background = b.color; bar.append(fill);
      const say = document.createElement('em'); say.className = 'tag-say'; say.hidden = true;
      tag.append(say, nm, bar); this.overlay.append(tag);
      return { b, model, tag, fill, say, px: b.x, py: b.y, ph: b.h, pz: 0, cx: b.x, cy: b.y, ch: b.h, cz: 0, pta: 0, cta: 0, pra: 0, cra: 0, dead: false, cloaked: false, sinking: 0, smokeT: 0 };
    });
    this.overview();
  }

  addZone(z) {
    const st = ZONE_STYLE[z.t];
    if (z.t === 'pit') {
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshBasicMaterial({ color: 0x01020a })); hole.rotation.x = -Math.PI / 2; hole.position.set(z.x + z.w / 2, 0.04, z.y + z.h / 2); this.world.add(hole);
      // Rim with hazard colour so the edge reads clearly.
      for (const [x, y, w, h] of [[z.x + z.w / 2, z.y, z.w + 1, 1], [z.x + z.w / 2, z.y + z.h, z.w + 1, 1], [z.x, z.y + z.h / 2, 1, z.h + 1], [z.x + z.w, z.y + z.h / 2, 1, z.h + 1]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, h), new THREE.MeshStandardMaterial({ color: 0xffc914 })); m.position.set(x, 0.06, y); this.world.add(m); }
      return;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshStandardMaterial({ color: st.color, emissive: st.emissive, emissiveIntensity: st.ei, roughness: st.rough ?? 0.6 }));
    m.rotation.x = -Math.PI / 2; m.position.set(z.x + z.w / 2, 0.05, z.y + z.h / 2); m.receiveShadow = true; this.world.add(m);
    if (z.t === 'lava') this.lava.push(m);
    if (z.t === 'pad') { const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9affc4, emissiveIntensity: 0.8 }); const a = new THREE.Mesh(new THREE.BoxGeometry(z.w * 0.55, 0.06, z.h * 0.15), cm), b = new THREE.Mesh(new THREE.BoxGeometry(z.w * 0.15, 0.06, z.h * 0.55), cm); a.position.copy(m.position); b.position.copy(m.position); a.position.y = b.position.y = 0.08; this.world.add(a, b); }
    if (z.t === 'spikes') {
      const n = Math.floor(z.w / 2) * Math.floor(z.h / 2), geo = new THREE.ConeGeometry(0.45, 1.7, 5), mat = new THREE.MeshStandardMaterial({ color: 0xb6bfcc, metalness: 0.9, roughness: 0.3, flatShading: true });
      const im = new THREE.InstancedMesh(geo, mat, n), d = new THREE.Object3D(); let i = 0;
      for (let x = z.x + 1; x < z.x + z.w && i < n; x += 2) for (let y = z.y + 1; y < z.y + z.h && i < n; y += 2) { d.position.set(x, 0, y); d.updateMatrix(); im.setMatrixAt(i++, d.matrix); }
      im.castShadow = true; im.position.y = -1; this.world.add(im); this.spikes.push(im);
    }
    if (z.t === 'mud') for (let i = 0; i < z.w * z.h / 45; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random(), 6, 4), new THREE.MeshStandardMaterial({ color: 0x3a2b18, roughness: 1, flatShading: true })); b.scale.y = 0.14; b.position.set(z.x + Math.random() * z.w, 0.08, z.y + Math.random() * z.h); this.world.add(b); }
  }

  addSolid(s) {
    let m;
    if (s.t === 'wall') { m = new THREE.Mesh(new THREE.BoxGeometry(s.w, 6, s.h), new THREE.MeshStandardMaterial({ color: 0x5e6a86, roughness: 0.7, metalness: 0.3, flatShading: true })); m.position.set(s.x + s.w / 2, 3, s.y + s.h / 2); const cap = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.2, 0.35, s.h + 0.2), new THREE.MeshStandardMaterial({ color: 0xffc914 })); cap.position.y = 3.1; m.add(cap); }
    else if (s.t === 'low') { m = new THREE.Mesh(new THREE.BoxGeometry(s.w, 1.15, s.h), new THREE.MeshStandardMaterial({ color: 0xc8cfdc, roughness: 0.8, flatShading: true })); m.position.set(s.x + s.w / 2, 0.57, s.y + s.h / 2); }
    else if (s.t === 'crate') { m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.w, s.h), new THREE.MeshStandardMaterial({ color: 0xa8743d, roughness: 0.85, flatShading: true })); m.position.set(s.x + s.w / 2, s.w / 2, s.y + s.h / 2); const b = new THREE.Mesh(new THREE.BoxGeometry(s.w * 1.02, s.w * 0.14, s.h * 1.02), new THREE.MeshStandardMaterial({ color: 0x5f3f1e })); b.castShadow = true; m.add(b); }
    else if (s.t === 'barrel') { m = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, 2.6, 12), new THREE.MeshStandardMaterial({ color: 0xe5352b, roughness: 0.5, metalness: 0.4 })); m.position.set(s.cx, 1.3, s.cy); const b = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 1.03, s.r * 1.03, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xffc914 })); m.add(b); }
    else if (s.t === 'pillar') { m = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.86, s.r, 9, 14), new THREE.MeshStandardMaterial({ color: 0x8179b0, roughness: 0.75, flatShading: true })); m.position.set(s.cx, 4.5, s.cy); }
    m.castShadow = true; m.receiveShadow = true; this.world.add(m); this.solidMeshes.set(s.id, m);
  }

  /** Call once after each sim step, before the next render. */
  syncStep() {
    for (const r of this.robots) {
      const b = r.b; r.px = r.cx; r.py = r.cy; r.ph = r.ch; r.pz = r.cz; r.pta = r.cta; r.pra = r.cra;
      r.cx = b.x; r.cy = b.y; r.ch = b.h; r.cz = b.z; r.cta = b.turretA; r.cra = b.radarA;
    }
    for (const e of this.battle.events) this.handleEvent(e);
  }

  puff(x, y, z, size, color, life, vx = 0, vy = 0, vz = 0, grow = 1) {
    const p = this.sprites[this.spriteI = (this.spriteI + 1) % this.sprites.length];
    p.s.visible = true; p.s.position.set(x, y, z); p.s.material.color.set(color); p.s.material.opacity = 1; p.s.scale.setScalar(size);
    Object.assign(p, { life, max: life, vx, vy, vz, size, grow });
  }

  flash(x, y, z, r, color = 0xffc070) { this.puff(x, y, z, r, color, 0.09, 0, 0, 0, 0); }

  boom(x, y, r) {
    this.puff(x, 1.5, y, r * 3, 0xffb050, 0.28, 0, 0, 0, 2);
    const n = Math.min(26, 8 + r * 2.5);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 4 + Math.random() * r * 2.4; this.puff(x, 1 + Math.random() * 2, y, 0.8 + Math.random() * r * 0.45, i % 3 ? 0xff7a22 : 0xffd770, 0.35 + Math.random() * 0.35, Math.cos(a) * s, 2 + Math.random() * r, Math.sin(a) * s, 1.3); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 28), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.25, y); this.scene.add(ring); this.fx.push({ m: ring, t: 0, max: 0.35, kind: 'ring', r });
    play('boom', r);
  }

  beam(x, y, x2, y2, color, width, life) {
    const len = Math.hypot(x2 - x, y2 - y) || 0.01;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, width, width), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set((x + x2) / 2, 1.8, (y + y2) / 2); m.rotation.y = -Math.atan2(y2 - y, x2 - x);
    this.scene.add(m); this.fx.push({ m, t: 0, max: life, kind: 'beam' });
  }

  handleEvent(e) {
    const rb = e.id !== undefined ? this.robots[e.id] : null;
    switch (e.e) {
      case 'shot':
        this.flash(e.x, 1.9, e.y, e.w === 'cannon' || e.w === 'rocket' ? 2.8 : 1.5); play(e.w);
        break;
      case 'beam':
        if (e.w === 'rail') { this.beam(e.x, e.y, e.x2, e.y2, 0x9ad7ff, 0.28, 0.3); this.beam(e.x, e.y, e.x2, e.y2, 0xffffff, 0.09, 0.2); this.flash(e.x2, 1.8, e.y2, 3, 0xbfe6ff); play('rail'); }
        else { const col = rb ? rb.b.color : '#ff4444'; this.beam(e.x, e.y, e.x2, e.y2, col, 0.2, 0.06); this.beam(e.x, e.y, e.x2, e.y2, 0xffffff, 0.06, 0.06); if (e.hit) this.flash(e.x2, 1.8, e.y2, 1.8, col); play('laser'); }
        break;
      case 'flame':
        for (let i = 0; i < 2; i++) { const a = e.a + (Math.random() - 0.5) * 0.45, s = e.range * (1.7 + Math.random() * 0.9); this.puff(e.x, 1.7, e.y, 0.9, i ? 0xff7a1e : 0xffc23e, 0.42, Math.cos(a) * s, 0.8 + Math.random(), Math.sin(a) * s, 2.8); }
        play('flame'); break;
      case 'arc': {
        const seg = 5; let ax = e.x, ay = e.y;
        for (let i = 1; i <= seg; i++) { const t = i / seg, j = i === seg ? 0 : 1.2, nx = lerp(e.x, e.x2, t) + (Math.random() - 0.5) * j, ny = lerp(e.y, e.y2, t) + (Math.random() - 0.5) * j; this.beam(ax, ay, nx, ny, e.pd ? 0xffd34d : 0x8fdcff, 0.14, 0.13); ax = nx; ay = ny; }
        play('arc'); break;
      }
      case 'saw': for (let i = 0; i < 2; i++) this.puff(e.x, 1, e.y, 0.5, 0xffe08a, 0.2, (Math.random() - 0.5) * 18, 3 + Math.random() * 6, (Math.random() - 0.5) * 18); play('saw'); break;
      case 'spark': for (let i = 0; i < (e.big ? 5 : 2); i++) this.puff(e.x, 1.6, e.y, e.big ? 0.7 : 0.4, 0xffe6a0, 0.18, (Math.random() - 0.5) * 14, Math.random() * 8, (Math.random() - 0.5) * 14); play('spark'); break;
      case 'boom': this.boom(e.x, e.y, e.r); break;
      case 'smoke': for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28, d = Math.random() * 8; this.fx.push(this.smokeBall(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d)); } break;
      case 'clang': this.puff(e.x, 1.5, e.y, 2.5, 0xffe6a0, 0.15); play('clang'); break;
      case 'break': { const m = this.solidMeshes.get(e.id); if (m) { this.world.remove(m); } for (let i = 0; i < 12; i++) this.puff(e.x, 1.5, e.y, 0.8, e.t === 'crate' ? 0xc08f4f : 0xff7a22, 0.5, (Math.random() - 0.5) * 16, Math.random() * 10, (Math.random() - 0.5) * 16); break; }
      case 'jump': for (let i = 0; i < 12; i++) this.puff(rb.cx, 0.4, rb.cy, 1.4, 0xffae40, 0.4, (Math.random() - 0.5) * 12, 0.5, (Math.random() - 0.5) * 12, 1.8); play('jump'); break;
      case 'boost': for (let i = 0; i < 10; i++) this.puff(rb.cx, 1, rb.cy, 1.2, 0x9ad7ff, 0.35, (Math.random() - 0.5) * 8, Math.random() * 2, (Math.random() - 0.5) * 8, 1.5); play('jump'); break;
      case 'die': if (rb) this.onDie(rb); play('die'); break;
      case 'fall': if (rb) rb.sinking = 0.001; break;
      case 'say': if (rb) { rb.say.textContent = e.text; rb.say.hidden = false; rb.sayUntil = performance.now() + 2200; } break;
    }
  }

  smokeBall(x, y) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: 0xb9bfcc, transparent: true, depthWrite: false, opacity: 0.8 }));
    m.position.set(x, 1.5 + Math.random() * 4, y); m.scale.setScalar(7 + Math.random() * 6); this.scene.add(m);
    return { m, t: Math.random() * -0.4, max: 8, kind: 'smoke' };
  }

  onDie(r) {
    r.dead = true; r.model.wreck(); r.tag.classList.add('dead'); r.model.shieldBubble.visible = false;
  }

  syncShots(alpha) {
    const seen = new Set(), b = this.battle;
    for (const p of [...b.shots, ...b.mines]) {
      seen.add(p); let m = this.shotMeshes.get(p);
      if (!m) { m = this.makeShot(p); this.shotMeshes.set(p, m); this.scene.add(m); }
      if (p.arm !== undefined) { m.position.set(p.x, 0.25, p.y); if (m.children[0]) m.children[0].visible = p.arm <= 0 && performance.now() % 700 < 180; continue; }
      const dt = (1 - alpha) / 30;
      m.position.set(p.x - (p.vx || 0) * dt, p.k === 'mortar' ? (p.z || 1) : 1.8, p.y - (p.vy || 0) * dt);
      m.rotation.y = -Math.atan2(p.vy || 0, p.vx || 1);
      if (p.k === 'rocket' || p.k === 'homing') this.puff(m.position.x, 1.7, m.position.z, 0.95, p.k === 'homing' ? 0xff9a60 : 0xffc070, 0.26, 0, 0.5, 0, 0.3);
      if (p.k === 'mortar') this.puff(m.position.x, m.position.y, m.position.z, 1.1, 0xc08fff, 0.2);
    }
    for (const [p, m] of this.shotMeshes) if (!seen.has(p)) { this.scene.remove(m); this.shotMeshes.delete(p); }
  }

  makeShot(p) {
    if (p.arm !== undefined) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x20242c, metalness: 0.5 }));
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); l.position.y = 0.2; m.add(l); return m;
    }
    if (p.k === 'bullet') return new THREE.Mesh(this.shotGeo.bullet, new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    if (p.k === 'mortar') return new THREE.Mesh(this.shotGeo.orb, new THREE.MeshBasicMaterial({ color: 0xe0b8ff }));
    return new THREE.Mesh(this.shotGeo.rocket, new THREE.MeshStandardMaterial({ color: p.k === 'homing' ? 0xe5352b : 0xe9edf7 }));
  }

  /** alpha: how far between the previous and current sim steps. dt: real seconds since last frame. */
  render(alpha, dt, simRunning = true) {
    const t = performance.now() / 1000, b = this.battle;
    if (b) {
      const v = new THREE.Vector3();
      for (const r of this.robots) {
        const o = r.b, x = lerp(r.px, r.cx, alpha), y = lerp(r.py, r.cy, alpha), h = lerpAngle(r.ph, r.ch, alpha), z = lerp(r.pz, r.cz, alpha);
        const root = r.model.root; root.position.set(x, z - (r.sinking ? r.sinking * r.sinking * 14 : 0), y); root.rotation.y = -h;
        if (r.sinking) { r.sinking += dt; root.visible = r.sinking < 1.8; }
        const speed = (o.vx * Math.cos(o.h) + o.vy * Math.sin(o.h));
        const firing = o.firing.some(Boolean);
        if (simRunning && !r.dead) r.model.animate(dt, speed, firing);
        if (!r.dead) {
          r.model.setHeadings(lerpAngle(r.pta, r.cta, alpha), lerpAngle(r.pra, r.cra, alpha));
          r.model.conePivot.visible = this.showCones && (this.selected == null || this.selected === o.id);
          r.model.coneMat.opacity = this.selected === o.id ? 0.24 : 0.09;
          r.model.shieldBubble.visible = o.shieldOn;
          if (o.cloakOn !== r.cloaked) { r.cloaked = o.cloakOn; r.model.setCloak(o.cloakOn); }
          if (o.burn > 0 && Math.random() < 0.35) this.puff(x, 1.5, y, 1.1, 0xff6a1a, 0.4, 0, 3, 0, 1.2);
          if (o.jumpT > 0 && Math.random() < 0.6) this.puff(x, z + 0.2, y, 1.2, 0xffb040, 0.25, 0, -6, 0);
          if (o.boostT > 0 && Math.random() < 0.6) this.puff(x - Math.cos(h) * o.stats.radius, 1, y - Math.sin(h) * o.stats.radius, 1.1, 0x9ad7ff, 0.22);
          if (o.slow > 0 && Math.random() < 0.3) this.puff(x + Math.random() * 2 - 1, 1 + Math.random() * 2, y + Math.random() * 2 - 1, 0.5, 0x9adfff, 0.12);
        } else if (!r.sinking && (r.smokeT -= dt) < 0) { r.smokeT = 0.2; this.puff(x, 2, y, 2, 0x444444, 1.1, (Math.random() - 0.5), 3, (Math.random() - 0.5), 1.6); }
        // Name tag
        v.set(x, z + o.stats.radius * 1.8 + 1, y).project(this.camera);
        const vis = v.z < 1 && root.visible && !(o.cloakOn && this.selected !== o.id);
        r.tag.style.display = vis ? '' : 'none';
        if (vis) { r.tag.style.transform = `translate(calc(${(v.x * 0.5 + 0.5) * this.w}px - 50%), calc(${(-v.y * 0.5 + 0.5) * this.h}px - 100%))`; r.fill.style.width = `${Math.max(0, o.hp / o.stats.hp) * 100}%`; }
        r.tag.classList.toggle('sel', this.selected === o.id);
        if (r.sayUntil && performance.now() > r.sayUntil) { r.say.hidden = true; r.sayUntil = 0; }
      }
      this.syncShots(alpha);
      const up = b.spikesUp();
      for (const s of this.spikes) s.position.y = lerp(s.position.y, up ? 0.75 : -1, Math.min(1, dt * 14));
      for (const m of this.lava) m.material.emissiveIntensity = 1.3 + Math.sin(t * 2.2) * 0.35;
      if (b.time > 120) { const w = b.ringR * 2; this.ring.visible = true; this.ring.scale.set(w, 1, w); this.ring.material[0].opacity = 0.2 + Math.sin(t * 5) * 0.08; }
      else this.ring.visible = false;
      if (this.followId != null) { const f = this.robots[this.followId]; if (f) { const tx = lerp(f.px, f.cx, alpha), ty = lerp(f.py, f.cy, alpha), dx = tx - this.controls.target.x, dy = ty - this.controls.target.z; this.controls.target.x += dx; this.controls.target.z += dy; this.camera.position.x += dx; this.camera.position.z += dy; } }
    }
    // Effects age in real time so the screen keeps moving during slow motion and pauses end cleanly.
    for (const p of this.sprites) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = p.life / p.max;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(p.size * (1 + (1 - k) * p.grow)); p.s.material.opacity = k;
    }
    this.fx = this.fx.filter((f) => {
      f.t += dt;
      if (f.t < 0) return true;
      const k = f.t / f.max;
      if (k >= 1) { this.scene.remove(f.m); f.m.geometry?.dispose?.(); f.m.material?.dispose?.(); return false; }
      if (f.kind === 'ring') { f.m.scale.setScalar(0.5 + k * f.r * 1.5); f.m.material.opacity = 1 - k; }
      if (f.kind === 'beam') f.m.material.opacity = 1 - k;
      if (f.kind === 'smoke') f.m.material.opacity = 0.8 * Math.min(1, (1 - k) * 2.4);
      return true;
    });
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  pick(clientX, clientY) {
    const rc = this.canvas.getBoundingClientRect(), v = new THREE.Vector3(); let best = null, bd = 60;
    for (const r of this.robots || []) {
      if (r.dead) continue;
      v.set(r.cx, r.cz + 1, r.cy).project(this.camera);
      const d = Math.hypot((v.x * 0.5 + 0.5) * rc.width + rc.left - clientX, (-v.y * 0.5 + 0.5) * rc.height + rc.top - clientY);
      if (d < bd) { bd = d; best = r; }
    }
    return best ? best.b.id : null;
  }

  dispose() { this.ro.disconnect(); this.controls.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss?.(); }
}

/** Small turntable scene used for the garage preview and the landing page. */
export class Turntable {
  constructor(canvas, { transparent = true, spin = 0.5 } = {}) {
    this.canvas = canvas; this.spin = spin;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300); this.camera.position.set(11, 7.5, 11);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x54608a, 1.7));
    const d = new THREE.DirectionalLight(0xfff4e0, 2.6); d.position.set(5, 12, 7); d.castShadow = true; d.shadow.mapSize.set(1024, 1024); this.scene.add(d);
    const f = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.ShadowMaterial({ opacity: 0.3 })); f.rotation.x = -Math.PI / 2; f.receiveShadow = true; this.scene.add(f);
    this.a = 0.6; this.model = null;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas.parentElement); this.resize();
  }
  resize() { const p = this.canvas.parentElement, w = p.clientWidth, h = p.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.draw(); }
  setRobot(design, color, showCone = false) {
    if (this.model) this.scene.remove(this.model.root);
    this.model = buildRobot(design, color, { cone: showCone }); this.scene.add(this.model.root);
    const R = this.model.root; const { conePivot, shieldBubble } = this.model; R.remove(conePivot, shieldBubble); const box = new THREE.Box3().setFromObject(R); R.add(conePivot, shieldBubble); const size = box.getSize(new THREE.Vector3());
    if (!showCone) { const k = Math.max(size.x, size.z, size.y); const dist = Math.max(4, k * 1.75); this.camera.position.set(dist, dist * 0.68, dist); this.camera.lookAt(0, size.y * 0.42, 0); }
    else { const r = Math.min(this.model.conePivot.children[0].geometry.parameters.radius, 40); this.camera.position.set(r * 0.7 + 7, r * 0.8 + 6, r * 0.7 + 7); this.camera.lookAt(r * 0.1, 0, 0); }
    this.draw();
  }
  draw() { if (this.model) { this.model.root.rotation.y = this.a; this.renderer.render(this.scene, this.camera); } }
  tick(dt) { this.a += dt * this.spin; if (this.model) this.model.animate(dt, 0.8); this.draw(); }
  dispose() { this.ro.disconnect(); this.renderer.dispose(); }
}

/** Render a one-off thumbnail image for a robot design. */
let thumb = null;
export function robotThumbnail(design, color) {
  try {
    if (!thumb) { const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-999px;top:0;width:220px;height:170px;'; const c = document.createElement('canvas'); holder.append(c); document.body.append(holder); thumb = new Turntable(c); thumb.renderer.setSize(220, 170, false); thumb.camera.aspect = 220 / 170; thumb.camera.updateProjectionMatrix(); }
    thumb.a = 0.55; thumb.setRobot(design, color);
    return thumb.canvas.toDataURL('image/png');
  } catch { return ''; }
}
