// Builds a 3D robot from its design out of primitive shapes, so every part you buy is visible.
// The robot faces +X. Works on the landing page, in the garage and in the arena.
import * as THREE from 'three';
import { CHASSIS, RADARS } from './parts.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, flatShading: true, ...o });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.position.set(x, y, z); g.castShadow = true; return g; };
const cyl = (r1, r2, h, m, seg = 12) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); g.castShadow = true; return g; };

function wedgeGeo(L, W, H) { // A hull sloped down toward the nose.
  const s = new THREE.Shape(); s.moveTo(-L / 2, 0); s.lineTo(L / 2, 0); s.lineTo(L / 2, H * 0.12); s.lineTo(-L * 0.15, H); s.lineTo(-L / 2, H); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false }); g.translate(0, 0, -W / 2); return g;
}

function buildWeapon(id, paint, dark, steel, glow) {
  const g = new THREE.Group();
  const barrel = (len, r, y = 0, z = 0, m = steel) => { const c = cyl(r, r, len, m, 8); c.rotation.z = Math.PI / 2; c.position.set(len / 2, y, z); return c; };
  switch (id) {
    case 'mg': g.add(box(0.6, 0.3, 0.3, dark), barrel(1.1, 0.06, 0, 0.08), barrel(1.1, 0.06, 0, -0.08)); break;
    case 'cannon': g.add(box(0.9, 0.5, 0.5, dark), barrel(1.9, 0.14)); { const m = cyl(0.2, 0.2, 0.35, steel, 8); m.rotation.z = Math.PI / 2; m.position.x = 1.8; g.add(m); } break;
    case 'scatter': g.add(box(0.7, 0.45, 0.55, dark)); { const c = cyl(0.32, 0.13, 0.9, steel, 8); c.rotation.z = Math.PI / 2; c.position.x = 0.75; g.add(c); } break;
    case 'laser': g.add(box(0.8, 0.35, 0.35, paint), barrel(1.2, 0.08)); { const t = cyl(0.11, 0.11, 0.12, glow, 8); t.rotation.z = Math.PI / 2; t.position.x = 1.25; g.add(t); } break;
    case 'rail': g.add(box(0.8, 0.3, 0.4, dark), box(2.6, 0.09, 0.09, steel, 1.3, 0.13, 0), box(2.6, 0.09, 0.09, steel, 1.3, -0.13, 0), box(0.2, 0.2, 0.05, glow, 1.5, 0, 0)); break;
    case 'rocket': g.add(box(1.0, 0.7, 0.7, paint)); for (const y of [-0.17, 0.17]) for (const z of [-0.17, 0.17]) g.add(barrel(1.03, 0.12, y, z, dark)); break;
    case 'homing': g.add(box(1.0, 0.5, 0.8, dark)); for (const z of [-0.2, 0.2]) { const c = cyl(0.01, 0.13, 0.5, paint, 8); c.rotation.z = -Math.PI / 2; c.position.set(0.95, 0.05, z); g.add(c); } break;
    case 'mortar': g.add(box(0.8, 0.35, 0.7, dark)); { const c = cyl(0.3, 0.22, 1.1, steel, 10); c.rotation.z = -0.9; c.position.set(0.3, 0.5, 0); g.add(c); const t = cyl(0.26, 0.26, 0.05, glow, 10); t.rotation.z = -0.9; t.position.set(0.72, 0.84, 0); g.add(t); } break;
    case 'flame': g.add(box(0.6, 0.3, 0.3, dark), barrel(0.9, 0.09)); { const t = cyl(0.22, 0.22, 0.75, paint, 10); t.rotation.x = Math.PI / 2; t.position.y = 0.3; g.add(t); } break;
    case 'tesla': { const c = cyl(0.3, 0.42, 0.25, dark, 10); g.add(c); const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 14), steel); r.rotation.x = Math.PI / 2; r.position.y = 0.3; const r2 = r.clone(); r2.position.y = 0.55; r2.scale.setScalar(0.72); const s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow); s.position.y = 0.8; g.add(r, r2, s); } break;
    case 'saw': { g.add(box(0.7, 0.14, 0.2, dark, 0.3)); const d = cyl(0.8, 0.8, 0.07, steel, 14); d.position.x = 0.9; g.add(d); g.userData.spin = d; for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283, t = box(0.28, 0.07, 0.13, steel, Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8); t.rotation.y = -a; d.add(t); } } break;
    case 'mines': g.add(box(0.8, 0.45, 0.8, dark)); { const c = cyl(0.25, 0.25, 0.1, paint, 10); c.position.y = 0.26; g.add(c); } break;
  }
  return g;
}

export function buildRobot(design, color, { cone = false } = {}) {
  const root = new THREE.Group();
  const paint = mat(color), dark = mat(0x3d4250, { metalness: 0.35 }), steel = mat(0x9aa3b2, { metalness: 0.8, roughness: 0.35 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd34d, emissiveIntensity: 2.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x8fe3ff, emissive: 0x2fb6e0, emissiveIntensity: 1.1 });
  const R = CHASSIS[design.chassis].radius, L = R * 1.75, W = R * 1.35, H = R * 0.62;
  const armored = design.armor !== 'none';
  const drive = design.drive;
  const ride = drive === 'legs' ? R * 0.95 : drive === 'hover' ? 0.75 : drive === 'tracks' ? 0.55 : 0.55;

  const tilt = new THREE.Group(); root.add(tilt); // Leans the hull when accelerating.
  const hull = new THREE.Group(); hull.position.y = ride; tilt.add(hull);

  if (design.chassis === 'wedge') {
    const m = new THREE.Mesh(wedgeGeo(L * 1.1, W, H * 1.15), paint); m.castShadow = true; hull.add(m);
  } else if (design.chassis === 'scout') {
    hull.add(box(L * 0.8, H * 0.9, W * 0.8, paint, 0, H * 0.45, 0), box(L * 0.3, H * 0.5, W * 0.5, dark, L * 0.22, H * 0.78, 0));
  } else if (design.chassis === 'fortress') {
    hull.add(box(L, H * 1.1, W, paint, 0, H * 0.55, 0), box(L * 0.6, H * 0.4, W * 0.72, dark, -L * 0.12, H * 1.28, 0));
    for (const z of [-W / 2, W / 2]) hull.add(box(L * 0.92, H * 0.3, 0.2, dark, 0, H * 0.75, z));
  } else {
    hull.add(box(L, H, W, paint, 0, H / 2, 0), box(L * 0.32, H * 0.45, W * 0.7, dark, L * 0.3, H * 0.7, 0));
  }
  // "Eyes" give each robot a face and show which way it points.
  hull.add(box(0.1, 0.17, W * 0.42, glass, L * (design.chassis === 'wedge' ? 0.12 : 0.47), H * (design.chassis === 'wedge' ? 0.72 : 0.72), 0));

  // Armor shows as added plates.
  const armorColors = { plate: 0x6a7280, composite: 0x3c4a3f, reactive: 0x57504a, mirror: 0xe8f1ff };
  if (armored) {
    const am = mat(armorColors[design.armor], design.armor === 'mirror' ? { metalness: 1, roughness: 0.12 } : {});
    const n = design.armor === 'reactive' ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const pw = (L * 0.86) / n - 0.05, px = -L * 0.43 + (i + 0.5) * (L * 0.86) / n;
      for (const z of [-W / 2 - 0.06, W / 2 + 0.06]) hull.add(box(pw, H * 0.68, 0.12, am, px, H * 0.42, z));
    }
    if (design.chassis !== 'wedge') hull.add(box(0.14, H * 0.72, W * 0.92, am, L / 2 + 0.05, H * 0.42, 0));
  }
  // Engine at the rear.
  const eng = design.engine, ex = -L / 2 - 0.1;
  if (eng === 'battery') hull.add(box(0.3, H * 0.55, W * 0.6, mat(0x2fa05b), ex, H * 0.5, 0));
  if (eng === 'diesel') { hull.add(box(0.5, H * 0.8, W * 0.55, dark, ex, H * 0.5, 0)); const e = cyl(0.09, 0.09, H * 1.4, steel, 8); e.position.set(ex, H * 1.2, W * 0.2); hull.add(e); }
  if (eng === 'fuelcell') for (const z of [-0.28, 0.28]) { const c = cyl(0.22, 0.22, W * 0.5, mat(0x4bb3d6), 10); c.rotation.x = Math.PI / 2; c.rotation.z = Math.PI / 2; c.position.set(ex, H * (z > 0 ? 0.35 : 0.8), 0); hull.add(c); }
  if (eng === 'turbine') { const c = cyl(0.42, 0.3, 0.8, steel, 12); c.rotation.z = Math.PI / 2; c.position.set(ex - 0.1, H * 0.55, 0); hull.add(c); }
  if (eng === 'reactor') { const c = cyl(0.42, 0.42, 0.7, dark, 12); c.position.set(-L * 0.32, H * 1.35, 0); const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: 0xbfffd0, emissive: 0x28ff7a, emissiveIntensity: 2.4 })); s.position.set(-L * 0.32, H * 1.82, 0); hull.add(c, s); }

  // Drive
  const spinners = [], legs = []; let glowDisc = null, belts = [];
  if (drive === 'wheels') {
    const r = R * 0.34;
    for (const x of [-L * 0.34, L * 0.34]) for (const z of [-W / 2 - 0.2, W / 2 + 0.2]) {
      const g = new THREE.Group(), t = cyl(r, r, 0.36, dark, 12); t.rotation.x = Math.PI / 2; const hub = box(r * 1.15, r * 0.3, 0.38, steel); g.add(t, hub);
      g.position.set(x, r, z); tilt.add(g); spinners.push(g);
    }
  } else if (drive === 'tracks') {
    for (const z of [-W / 2 - 0.3, W / 2 + 0.3]) {
      tilt.add(box(L * 1.08, 0.75, 0.55, dark, 0, 0.38, z));
      for (let i = 0; i < 6; i++) { const c = box(0.1, 0.8, 0.58, steel, -L * 0.5 + i * L / 5, 0.38, z); tilt.add(c); belts.push(c); }
    }
  } else if (drive === 'legs') {
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1, x = (-1 + Math.floor(i / 2)) * L * 0.38, leg = new THREE.Group();
      leg.position.set(x, ride + H * 0.25, side * W * 0.45);
      const up = box(0.2, 0.2, R * 0.8, steel, 0, R * 0.12, side * R * 0.4); up.rotation.x = side * -0.32;
      const lo = box(0.17, ride * 0.98, 0.17, dark, 0, -ride * 0.3, side * R * 0.78);
      leg.add(up, lo); leg.userData = { phase: i * 1.05 + (side > 0 ? Math.PI : 0), side }; tilt.add(leg); legs.push(leg);
    }
  } else if (drive === 'hover') {
    const skirt = cyl(R * 0.98, R * 0.8, 0.32, dark, 16); skirt.position.y = ride - 0.14; skirt.scale.x = 1.15; tilt.add(skirt);
    glowDisc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.72, R * 0.72, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x42b6ff, emissiveIntensity: 2.6 }));
    glowDisc.position.y = ride - 0.33; glowDisc.scale.x = 1.15; tilt.add(glowDisc);
  }

  // Turret and weapons
  const top = hull.children.length ? H * (design.chassis === 'fortress' ? 1.48 : design.chassis === 'scout' ? 0.92 : 1.02) : H;
  const turret = new THREE.Group(); turret.position.set(design.chassis === 'wedge' ? -L * 0.16 : 0, top, 0); hull.add(turret);
  const fixedRack = new THREE.Group(); fixedRack.position.copy(turret.position); hull.add(fixedRack);
  if (design.turret !== 'none') { const t = cyl(R * 0.42, R * 0.55, 0.28, design.turret === 'fast' ? steel : dark, 12); t.position.y = 0.14; turret.add(t); }
  let saw = [];
  design.weapons.forEach((w, i) => {
    const g = buildWeapon(w, paint, dark, steel, glow);
    const off = (i - (design.weapons.length - 1) / 2) * R * 0.5;
    if (w === 'saw') { g.position.set(L / 2 - 0.1, H * 0.3 - top, off); fixedRack.add(g); }
    else if (w === 'mines') { g.position.set(-L / 2 + 0.25, H * 0.1, off); fixedRack.add(g); }
    else { g.position.set(R * 0.1, 0.42, off); (design.turret !== 'none' ? turret : fixedRack).add(g); }
    if (g.userData.spin) saw.push(g.userData.spin);
  });

  // Radar
  const radar = new THREE.Group(); radar.position.set(-R * 0.35, top + 0.65, design.weapons.length > 1 ? 0 : R * 0.28);
  hull.add(radar);
  const mast = cyl(0.06, 0.08, 0.7, steel, 6); mast.position.y = -0.3; radar.add(mast);
  const rid = design.radar;
  if (rid === 'whisker') { const t = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 16), steel); t.rotation.x = Math.PI / 2; radar.add(t); }
  if (rid === 'dish') { const d = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, 6.3, 0, 1.1), new THREE.MeshStandardMaterial({ color: 0xe8ecf4, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.4 })); d.rotation.z = Math.PI / 2; d.position.x = 0.35; radar.add(d); }
  if (rid === 'needle') { const c = cyl(0.01, 0.1, 1.2, steel, 6); c.rotation.z = -Math.PI / 2; c.position.x = 0.55; radar.add(c); }
  if (rid === 'fan') radar.add(box(0.12, 0.42, 1.1, mat(0xe8ecf4)));
  if (rid === 'omni') { const s = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8), mat(0xe8ecf4)); radar.add(s); }
  if (rid === 'phased') radar.add(box(0.1, 0.72, 1.3, dark), box(0.03, 0.62, 1.2, glass, 0.07, 0, 0));

  // Modules as small visible extras.
  design.modules.forEach((m, i) => {
    const z = (i ? -1 : 1) * W * 0.38, x = -L * 0.3;
    if (m === 'shield') { const s = cyl(0.28, 0.34, 0.25, glass, 8); s.position.set(x, top + 0.12, z); hull.add(s); }
    else if (m === 'jump' || m === 'boost') for (const y of [0.25, 0.6]) { const c = cyl(0.13, 0.17, 0.5, steel, 8); c.rotation.z = Math.PI / 2; c.position.set(-L / 2 - 0.1, H * y, z); hull.add(c); }
    else if (m === 'smoke') for (let k = 0; k < 3; k++) { const c = cyl(0.08, 0.08, 0.4, dark, 6); c.rotation.x = 0.7; c.position.set(x + k * 0.22, top + 0.1, z); hull.add(c); }
    else if (m === 'pointdef') { const c = cyl(0.17, 0.2, 0.2, dark, 8); c.position.set(x, top + 0.1, z); const b = box(0.5, 0.05, 0.05, steel, 0.25, 0.1, 0); c.add(b); hull.add(c); }
    else if (m === 'cloak') { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), glass); c.position.set(x, top + 0.2, z); hull.add(c); }
    else if (m === 'repair') hull.add(box(0.4, 0.14, 0.4, mat(0x35c56e), x, top + 0.07, z));
    else if (m === 'ammo') hull.add(box(0.55, 0.3, 0.42, mat(0x6b6a2c), x, top + 0.15, z));
    else if (m === 'targeting') hull.add(box(0.3, 0.2, 0.3, glass, x, top + 0.1, z));
  });

  // Radar coverage shown on the ground.
  const rd = RADARS[rid];
  const coneGeo = new THREE.CircleGeometry(rd.range, rd.cone >= 360 ? 48 : 28, -(rd.cone / 2) * Math.PI / 180, rd.cone * Math.PI / 180);
  const coneMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
  const coneMesh = new THREE.Mesh(coneGeo, coneMat); coneMesh.rotation.x = Math.PI / 2; // CircleGeometry angles run from +X toward +Z after this rotation.
  coneMesh.position.y = 0.08;
  const conePivot = new THREE.Group(); conePivot.add(coneMesh); root.add(conePivot); conePivot.visible = cone;

  const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(R * 1.45, 18, 12), new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.2, depthWrite: false }));
  shieldBubble.position.y = R * 0.7; shieldBubble.visible = false; root.add(shieldBubble);

  let t = 0;
  const api = {
    root, turret, radar, conePivot, coneMat, shieldBubble,
    /** Animate moving parts. speed is signed metres per second. */
    animate(dt, speed, firing = false) {
      t += dt;
      for (const s of spinners) s.rotation.z -= speed * dt / (R * 0.34);
      belts.forEach((b, i) => { const span = L; b.position.x = ((b.userData.o ?? (b.userData.o = b.position.x)) + t * speed * 0.6 + span * 40) % span - span / 2; });
      const swing = Math.min(1, Math.abs(speed) / 4);
      for (const l of legs) { const a = t * (5 + Math.abs(speed) * 1.1) + l.userData.phase; l.rotation.z = Math.sin(a) * 0.36 * swing; l.position.y = ride + H * 0.25 + Math.max(0, Math.cos(a)) * 0.2 * swing; }
      if (glowDisc) { glowDisc.material.emissiveIntensity = 2.1 + Math.sin(t * 13) * 0.6; hull.position.y = ride + Math.sin(t * 2.3) * 0.07; }
      for (const s of saw) s.rotation.y += (firing ? 30 : 7) * dt;
    },
    setHeadings(turretA, radarA, hideCone = false) {
      turret.rotation.y = -turretA; radar.rotation.y = -radarA;
      conePivot.rotation.y = -radarA; if (hideCone) conePivot.visible = false;
    },
    setCloak(on) {
      root.traverse((o) => { if (o.isMesh && o !== coneMesh && o !== shieldBubble && o.material) { o.material.transparent = on; o.material.opacity = on ? 0.25 : 1; } });
    },
    wreck() {
      root.traverse((o) => { if (o.isMesh && o.material?.color && o !== coneMesh && o !== shieldBubble) { const m = o.material.clone(); m.color.multiplyScalar(0.18); if (m.emissive) m.emissive.setHex(0); o.material = m; } });
      conePivot.visible = false; shieldBubble.visible = false; tilt.rotation.z = 0.14; tilt.rotation.x = 0.1; turret.rotation.z = 0.25;
    },
  };
  return api;
}
