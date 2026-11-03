// The rules of Clay & Thunder. No DOM and no Three.js. The same seed and the same actions give the same match.
export const N = 96;              // Terrain vertices per side. One unit is one grid cell.
export const DT = 0.1;            // Fixed simulation step, in seconds.
export const MAX_HEIGHT = 7, MIN_HEIGHT = -2.4;
export const TEMPLE_GUARD = 7;    // No god can reshape the land this close to any temple.
const BELIEF_CAP = 500, MAX_POP = 110, MAX_TREES = 240;

export const MIRACLES = {
  rain: { name: 'Rain', cost: 25, cooldown: 10, radius: 12, help: 'Grows trees, puts out fires and makes your people fertile.' },
  bless: { name: 'Bless', cost: 40, cooldown: 15, radius: 8, help: 'Your followers here move faster, fight harder and heal.' },
  lightning: { name: 'Lightning', cost: 30, cooldown: 4, radius: 2.4, help: 'A single precise strike. Can start fires.' },
  fire: { name: 'Firestorm', cost: 70, cooldown: 12, radius: 5, help: 'Burns everything in the area. Fire spreads through trees.' },
  quake: { name: 'Earthquake', cost: 120, cooldown: 25, radius: 8, help: 'Tears up the land and collapses buildings.' },
  flood: { name: 'Flood', cost: 220, cooldown: 90, radius: 0, help: 'The sea rises for all. Only the high ground is safe.' },
};
export const BUILDINGS = {
  temple: { hp: 3000, capacity: 10, radius: 4.2, influence: 17 },
  hut: { hp: 160, capacity: 3, radius: 1.4, influence: 8, cost: 10, labor: 14, flat: 0.34 },
  house: { hp: 380, capacity: 9, radius: 2.3, influence: 10, cost: 16, labor: 22, flat: 0.28 },
  farm: { hp: 110, capacity: 0, radius: 2.2, influence: 6, cost: 6, labor: 8, flat: 0.6, workers: 2 },
  mine: { hp: 300, capacity: 0, radius: 1.7, influence: 6, cost: 12, labor: 16, flat: 1.1, workers: 3 },
  forge: { hp: 260, capacity: 0, radius: 1.7, influence: 6, cost: 14, labor: 16, flat: 0.7, workers: 2 },
  school: { hp: 260, capacity: 0, radius: 2, influence: 7, cost: 14, labor: 18, flat: 0.65, workers: 3 },
  tower: { hp: 520, capacity: 0, radius: 1.1, influence: 9, cost: 16, metal: 4, labor: 18, flat: 0.7 },
};

// Each age asks for lore, people and some proof of craft. Everything else follows from what your people can make.
export const AGES = [
  { id: 'stone', name: 'Stone Age', tool: 1, gear: 1, hp: 46 },
  { id: 'copper', name: 'Copper Age', tool: 1.15, gear: 1.25, hp: 52, needs: { lore: 60, pop: 12, farm: 1 } },
  { id: 'bronze', name: 'Bronze Age', tool: 1.3, gear: 1.6, hp: 62, needs: { lore: 330, pop: 24, school: 1, forge: 1, metalMade: 30 } },
  { id: 'iron', name: 'Iron Age', tool: 1.5, gear: 2.1, hp: 76, needs: { lore: 1250, pop: 36, school: 2, forge: 2, metalMade: 120 } },
];
export const PROFESSIONS = {
  priest: { name: 'priest', plural: 'Priests', duty: 'Prays for belief and keeps the old lore.' },
  farmer: { name: 'farmer', plural: 'Farmers', duty: 'Grows the food that lets children be born.' },
  woodcutter: { name: 'woodcutter', plural: 'Woodcutters', duty: 'Cuts timber for every building.' },
  builder: { name: 'builder', plural: 'Builders', duty: 'Raises homes and workshops.' },
  miner: { name: 'miner', plural: 'Miners', duty: 'Digs ore from the mine.' },
  smith: { name: 'smith', plural: 'Smiths', duty: 'Turns ore into metal for warriors.' },
  scribe: { name: 'scribe', plural: 'Scribes', duty: 'Writes tablets, the fastest source of lore.' },
  warrior: { name: 'warrior', plural: 'Warriors', duty: 'Guards the temple or marches to the standard.' },
};
const WORK_RANKS = ['apprentice', 'journeyman', 'master'], WAR_RANKS = ['recruit', 'veteran', 'champion'];
const WORK_XP = [0, 90, 240], WAR_XP = [0, 12, 40], RANK_SPEED = [1, 1.25, 1.6], RANK_MIGHT = [1, 1.2, 1.45];
const NAME_START = ['Enme', 'Ninsu', 'Ur', 'Lugal', 'Shara', 'Ishme', 'Nabu', 'Geme', 'Kuba', 'Puzur', 'Ili', 'Shu', 'Amar', 'Zimri', 'Tudha', 'Hamu', 'Naram', 'Ashur', 'Belit', 'Tabni'];
const NAME_END = ['', 'kal', 'dan', 'ra', 'ti', 'gal', 'ni', 'sin', 'bi', 'lum'];

export const rankName = (p) => (p.role === 'warrior' ? WAR_RANKS : WORK_RANKS)[p.rank || 0];
export const personTitle = (p) => `${p.name}, ${rankName(p)} ${p.role === 'warrior' ? 'warrior' : PROFESSIONS[p.profession].name}`;
const maxHp = (p) => (p.role === 'warrior' ? AGES[p.gear || 0].hp * (1 + (p.rank || 0) * 0.15) : 22);

// What the tribe still needs for the next age, for the rules and the HUD alike.
export function ageProgress(world, tribe) {
  const next = AGES[tribe.age + 1]; if (!next) return null;
  const count = (type) => world.buildings.filter((b) => b.tribe === tribe.id && b.type === type && b.progress >= 1).length;
  const have = (key) => (key === 'lore' ? tribe.lore : key === 'pop' ? tribe.pop : key === 'metalMade' ? tribe.metalMade : count(key));
  const items = Object.entries(next.needs).map(([key, need]) => ({ key, need, have: Math.floor(have(key)) }));
  return { next, items, done: items.every((i) => i.have >= i.need), fraction: items.reduce((sum, i) => sum + Math.min(1, i.have / i.need), 0) / items.length };
}
const STROKE_COST = 0.35;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const idx = (x, y) => y * N + x;
const NEIGHBORS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export class World {
  constructor({ seed = 1 } = {}) {
    this.seed = seed; this.rng = mulberry(seed); this.time = 0; this.tick = 0; this.nextId = 1;
    this.heights = new Float32Array(N * N); this.passable = new Uint8Array(N * N); this.component = new Int32Array(N * N);
    this.blocked = new Uint8Array(N * N); this.influence = new Uint8Array(N * N);
    this.sea = 0; this.floodUntil = 0; this.seaTarget = 0;
    this.people = []; this.buildings = []; this.trees = []; this.rocks = []; this.flying = []; this.storms = [];
    this.events = []; this.rivals = []; this.over = false; this.winner = -1; this.dirty = null; this.terrainVersion = 0;
    this.passDirty = true; this.influenceDirty = true; this.pathBudget = 0; this.grid = new Map();
    this.tribes = [0, 1].map((id) => ({
      id, belief: 60, wood: 20, food: 26, ore: 0, metal: 0, lore: 0, metalMade: 0, age: 0, pop: 0, warriors: 0, capacity: 0, praying: 0, temple: null, standard: null, carried: null,
      cooldowns: {}, fertileUntil: 0, birthTimer: 3, plannerTimer: 1 + id * 0.3, noSiteSince: -1, beliefMult: 1,
      stats: { miraclesCast: 0, born: 0, converted: 0, lost: 0, buildings: 0, peak: 0 },
    }));
    this.generate();
  }

  // ----- Map generation -----

  generate() {
    const rng = this.rng, flip = rng() < 0.5;
    const noise = this.makeNoise(rng);
    const starts = flip ? [[24, 70], [71, 25]] : [[24, 25], [71, 70]];
    // Which corners face each other changes by seed; the player is always tribe 0.
    const centerX = 47.5 + (rng() - 0.5) * 6, centerY = 47.5 + (rng() - 0.5) * 6;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let mask = 0;
      for (const [sx, sy] of starts) mask = Math.max(mask, 1 - dist(x, y, sx, sy) / 27);
      mask = Math.max(mask, 0.55 * (1 - dist(x, y, centerX, centerY) / 11)); // A small middle isle, worth reaching.
      const n = noise(x / 16, y / 16) * 0.7 + noise(x / 7 + 9, y / 7 + 4) * 0.25;
      const raw = mask * 3.3 + (n - 0.5) * 1.5 * (mask > 0 ? 1 : 0.5) - 0.42;
      this.heights[idx(x, y)] = clamp(raw, MIN_HEIGHT, 4.4);
    }
    // Terrace the temple grounds, then blend them into the land.
    for (const [sx, sy] of starts) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = dist(x, y, sx, sy);
      if (d < 16) { const t = clamp((d - 8) / 8, 0, 1), s = t * t * (3 - 2 * t); this.heights[idx(x, y)] = 2.7 * (1 - s) + this.heights[idx(x, y)] * s; }
    }
    // Cut a strait between the two peoples, and a ring of water around the middle isle, so bridges matter.
    const axisX = starts[1][0] - starts[0][0], axisY = starts[1][1] - starts[0][1], axisLength = Math.hypot(axisX, axisY);
    const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const along = Math.abs(((x - centerX) * axisX + (y - centerY) * axisY) / axisLength), toCenter = dist(x, y, centerX, centerY);
      const ring = toCenter < 13 ? smoothstep(8.5, 10.5, toCenter) * (1 - smoothstep(14, 16, toCenter)) : 1 - smoothstep(14, 16, toCenter);
      const band = toCenter >= 13 ? 1 - smoothstep(4, 7, along) : 0;
      const cut = Math.max(ring, band);
      if (cut > 0) this.heights[idx(x, y)] = this.heights[idx(x, y)] * (1 - cut) + Math.min(this.heights[idx(x, y)], -0.6) * cut;
    }
    // Keep the deep channel between the two peoples at least shallow enough to bridge.
    for (let i = 0; i < N * N; i++) this.heights[i] = Math.max(this.heights[i], -1.3);
    this.tribes.forEach((tribe, id) => {
      const [x, y] = starts[id];
      tribe.temple = this.addBuilding('temple', id, x, y, 1);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + rng(), r = 6 + rng() * 2;
        this.spawnPerson(id, x + Math.cos(a) * r, y + Math.sin(a) * r, 'villager');
      }
    });
    this.refreshNavigation(); this.refreshInfluence();
    this.scatter(starts);
    this.events.length = 0;
  }

  makeNoise(rng) {
    const P = 64, table = new Float32Array(P * P); for (let i = 0; i < table.length; i++) table[i] = rng();
    const smooth = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
      const at = (a, b) => table[((a % P + P) % P) + ((b % P + P) % P) * P];
      return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
    };
  }

  scatter(starts) {
    const rng = this.rng;
    let attempts = 0;
    while (this.trees.length < 170 && attempts++ < 5000) {
      const x = 2 + rng() * (N - 4), y = 2 + rng() * (N - 4), h = this.heightAt(x, y);
      if (h < 0.3) continue;
      if (starts.some(([a, b]) => dist(x, y, a, b) < 7)) continue;
      if (rng() < 0.35 && !this.trees.some((t) => dist(t.x, t.y, x, y) < 5)) continue; // Groves, not an even scatter.
      this.addTree(x, y, 1);
    }
    attempts = 0;
    while (this.rocks.length < 34 && attempts++ < 3000) {
      const x = 2 + rng() * (N - 4), y = 2 + rng() * (N - 4);
      if (this.heightAt(x, y) < 0.2 || starts.some(([a, b]) => dist(x, y, a, b) < 7)) continue;
      this.rocks.push({ id: this.nextId++, x, y, scale: 0.8 + rng() * 0.8, turn: rng() * 6.28 });
    }
    // Each temple gets a guaranteed grove within a short walk.
    starts.forEach(([sx, sy]) => {
      for (let i = 0; i < 12; i++) {
        const a = rng() * 6.28, r = 9 + rng() * 5, x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r;
        if (this.heightAt(x, y) > 0.3) this.addTree(x, y, 1);
      }
    });
  }

  addTree(x, y, growth) {
    const tree = { id: this.nextId++, x, y, kind: this.heightAt(x, y) < 1.1 ? 'palm' : 'cedar', wood: 3, growth, burn: 0, wet: 0, scale: 0.85 + this.rng() * 0.45, turn: this.rng() * 6.28 };
    this.trees.push(tree); return tree;
  }

  // ----- Terrain helpers -----

  heightAt(x, y) {
    x = clamp(x, 0, N - 1.001); y = clamp(y, 0, N - 1.001);
    const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, h = this.heights;
    return (h[idx(ix, iy)] * (1 - fx) + h[idx(ix + 1, iy)] * fx) * (1 - fy) + (h[idx(ix, iy + 1)] * (1 - fx) + h[idx(ix + 1, iy + 1)] * fx) * fy;
  }

  flatness(x, y, radius) {
    let lo = Infinity, hi = -Infinity; const r = Math.ceil(radius);
    for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) {
      const cx = Math.round(x) + a, cy = Math.round(y) + b;
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) return Infinity;
      const h = this.heights[idx(cx, cy)]; lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return hi - lo;
  }

  nearTemple(x, y, range = TEMPLE_GUARD) { return this.tribes.some((t) => t.temple && t.temple.hp > 0 && dist(x, y, t.temple.x, t.temple.y) < range); }

  markDirty(x0, y0, x1, y1) {
    const d = this.dirty;
    if (!d) this.dirty = { x0, y0, x1, y1 };
    else { d.x0 = Math.min(d.x0, x0); d.y0 = Math.min(d.y0, y0); d.x1 = Math.max(d.x1, x1); d.y1 = Math.max(d.y1, y1); }
    this.passDirty = true; this.terrainVersion++;
  }

  // Applies fn(oldHeight, distance, x, y) -> newHeight across a disc, then checks nothing was undermined.
  reshape(cx, cy, radius, fn, guard = true) {
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(N - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(N - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = dist(x, y, cx, cy); if (d > radius) continue;
      if (guard && this.nearTemple(x, y)) continue;
      this.heights[idx(x, y)] = clamp(fn(this.heights[idx(x, y)], d, x, y), MIN_HEIGHT, MAX_HEIGHT);
    }
    this.markDirty(x0, y0, x1, y1);
    for (const b of [...this.buildings]) {
      if (b.type === 'temple' || dist(b.x, b.y, cx, cy) > radius + BUILDINGS[b.type].radius + 1) continue;
      const footprint = BUILDINGS[b.type].radius;
      if (this.flatness(b.x, b.y, footprint) > 1.25) this.destroyBuilding(b, 'collapse');
    }
  }

  refreshNavigation() {
    const h = this.heights, pass = this.passable, comp = this.component, sea = this.sea + 0.04;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = h[idx(x, y)]; let ok = v > sea && x > 0 && y > 0 && x < N - 1 && y < N - 1;
      if (ok) for (const [a, b] of NEIGHBORS) if (Math.abs(h[idx(x + a, y + b)] - v) > 1.5) { ok = false; break; }
      pass[idx(x, y)] = ok ? 1 : 0;
    }
    comp.fill(-1);
    const stack = []; let label = 0;
    for (let i = 0; i < N * N; i++) {
      if (!pass[i] || comp[i] >= 0) continue;
      comp[i] = label; stack.push(i);
      while (stack.length) {
        const c = stack.pop(), cx = c % N, cy = (c / N) | 0;
        for (const [a, b] of NEIGHBORS) { const n = idx(cx + a, cy + b); if (cx + a >= 0 && cy + b >= 0 && cx + a < N && cy + b < N && pass[n] && comp[n] < 0) { comp[n] = label; stack.push(n); } }
      }
      label++;
    }
    this.passDirty = false; this.navVersion = (this.navVersion || 0) + 1;
  }

  stampBlocked(b, value) {
    if (b.type === 'farm') return; // People walk through the fields.
    const r = b.type === 'temple' ? 3.8 : BUILDINGS[b.type].radius - 0.4;
    for (let y = Math.floor(b.y - r); y <= Math.ceil(b.y + r); y++) for (let x = Math.floor(b.x - r); x <= Math.ceil(b.x + r); x++) {
      if (x >= 0 && y >= 0 && x < N && y < N && dist(x, y, b.x, b.y) <= r) this.blocked[idx(x, y)] = value;
    }
  }

  componentAt(x, y) { return this.component[idx(clamp(Math.round(x), 0, N - 1), clamp(Math.round(y), 0, N - 1))]; }
  connected(ax, ay, bx, by) { const a = this.componentAt(ax, ay), b = this.componentAt(bx, by); return a >= 0 && a === b; }

  refreshInfluence() {
    const inf = this.influence; inf.fill(0);
    const stamp = (x, y, r, bit) => {
      for (let b = Math.max(0, Math.floor(y - r)); b <= Math.min(N - 1, Math.ceil(y + r)); b++) for (let a = Math.max(0, Math.floor(x - r)); a <= Math.min(N - 1, Math.ceil(x + r)); a++) {
        if ((a - x) * (a - x) + (b - y) * (b - y) <= r * r) inf[idx(a, b)] |= bit;
      }
    };
    for (const b of this.buildings) if (b.progress >= 1) stamp(b.x, b.y, BUILDINGS[b.type].influence, 1 << b.tribe);
    for (const p of this.people) if (p.state !== 'carried' && p.state !== 'air') stamp(p.x, p.y, p.role === 'warrior' ? 7 : 3.5, 1 << p.tribe);
    for (const t of this.tribes) if (t.standard) stamp(t.standard.x, t.standard.y, 9, 1 << t.id);
    this.influenceDirty = false;
  }

  inInfluence(tribe, x, y) {
    if (x < 0 || y < 0 || x > N - 1 || y > N - 1) return false;
    return (this.influence[idx(Math.round(x), Math.round(y))] & (1 << tribe)) !== 0;
  }

  // ----- Entities -----

  addBuilding(type, tribe, x, y, progress = 0) {
    const def = BUILDINGS[type];
    const b = { id: this.nextId++, type, tribe, x: Math.round(x), y: Math.round(y), hp: def.hp, progress, burn: 0, turn: type === 'temple' ? this.templeTurn(x, y) : Math.floor(this.rng() * 4) * Math.PI / 2, builders: 0, upgrading: false };
    const h = this.heightAt(b.x, b.y), r = def.radius;
    b.base = h;
    // Workers level the plot. This is not a player stroke, so it bypasses the temple guard.
    this.reshape(b.x, b.y, r + 0.9, (v, d) => { const t = clamp((d - r + 0.3) / 1.2, 0, 1); return h * (1 - t) + v * t; }, false);
    this.buildings.push(b); this.stampBlocked(b, 1);
    this.influenceDirty = true;
    return b;
  }

  // Temples face away from the middle of the map, so each god's opening view looks up the great stair.
  templeTurn(x, y) { return Math.round(Math.atan2(x - N / 2, y - N / 2) / (Math.PI / 2)) * Math.PI / 2; }

  destroyBuilding(b, cause) {
    const i = this.buildings.indexOf(b); if (i < 0) return;
    this.buildings.splice(i, 1); this.stampBlocked(b, 0);
    for (const other of this.buildings) if (other !== b) this.stampBlocked(other, 1);
    this.influenceDirty = true;
    this.events.push({ type: 'collapse', x: b.x, y: b.y, tribe: b.tribe, building: b.type, cause });
    this.tribes[b.tribe].stats.lost++;
    if (b.type === 'temple') this.defeat(b.tribe, 'temple');
    for (const p of this.people) if (p.job && p.job.building === b) p.job = null;
  }

  spawnPerson(tribe, x, y, role) {
    const p = { id: this.nextId++, tribe, role, x, y, z: 0, vx: 0, vy: 0, vz: 0, hp: role === 'warrior' ? 46 : 22, name: NAME_START[Math.floor(this.rng() * NAME_START.length)] + NAME_END[Math.floor(this.rng() * NAME_END.length)], profession: role === 'warrior' ? 'warrior' : 'priest', rank: 0, xp: 0, gear: 0, state: 'idle', job: null, path: null, pathIndex: 0, pathGoal: null, navVersion: 0, think: this.rng(), blessUntil: 0, carry: 0, heading: this.rng() * 6.28, moving: false, scared: 0, attack: 0, offX: (this.rng() - 0.5) * 0.7, offY: (this.rng() - 0.5) * 0.7, seed: this.rng() * 100, work: 0 };
    this.people.push(p); return p;
  }

  killPerson(p, cause) {
    const i = this.people.indexOf(p); if (i < 0) return;
    this.people.splice(i, 1);
    this.tribes[p.tribe].stats.lost++;
    if (cause !== 'silent') this.events.push({ type: 'death', x: p.x, y: p.y, tribe: p.tribe, cause });
  }

  hurt(p, amount, cause) {
    p.hp -= amount; p.scared = 4;
    if (p.hp <= 0) this.killPerson(p, cause);
  }

  hurtBuilding(b, amount) {
    b.hp -= amount;
    if (b.hp <= 0) this.destroyBuilding(b, 'damage');
  }

  convert(p, tribe) {
    if (p.tribe === tribe) return;
    this.tribes[tribe].stats.converted++;
    p.tribe = tribe; p.role = 'villager'; p.profession = 'priest'; p.rank = 0; p.xp = 0; p.gear = 0; p.hp = 22; p.job = null; p.path = null; p.state = 'idle'; p.scared = 0;
    this.events.push({ type: 'convert', x: p.x, y: p.y, tribe });
  }

  defeat(tribe, reason) {
    if (this.over) return;
    this.over = true; this.winner = 1 - tribe; this.overReason = reason;
    this.events.push({ type: 'over', winner: this.winner, reason });
  }

  // ----- God actions. Both tribes go through here, so the rival plays by the player's rules. -----

  act(tribeId, action) {
    if (this.over) return { ok: false, reason: 'The match is over.' };
    const tribe = this.tribes[tribeId], { type, x, y } = action;
    if (type === 'raise' || type === 'lower' || type === 'level') {
      if (!this.inInfluence(tribeId, x, y)) return { ok: false, reason: 'Outside your influence.' };
      if (this.nearTemple(x, y, TEMPLE_GUARD - 1)) return { ok: false, reason: 'Temple ground cannot be moved.' };
      if (tribe.belief < STROKE_COST) return { ok: false, reason: 'Not enough belief.' };
      tribe.belief -= STROKE_COST;
      const R = 3.2;
      if (type === 'level') {
        const target = action.height ?? this.heightAt(x, y);
        this.reshape(x, y, 2.8, (v, d) => v + (target - v) * 0.42 * (1 - (d / 2.8) ** 2));
      } else {
        const sign = type === 'raise' ? 1 : -1;
        this.reshape(x, y, R, (v, d) => v + sign * 0.3 * (1 - (d / R) ** 2));
      }
      return { ok: true };
    }
    if (type === 'miracle') return this.castMiracle(tribeId, action);
    if (type === 'standard') {
      if (action.remove) { tribe.standard = null; this.influenceDirty = true; this.dropOrders(tribeId); return { ok: true }; }
      if (!this.inInfluence(tribeId, x, y)) return { ok: false, reason: 'Outside your influence.' };
      if (this.heightAt(x, y) <= this.sea + 0.1) return { ok: false, reason: 'A standard needs dry land.' };
      tribe.standard = { x, y, placed: this.time }; this.influenceDirty = true; this.dropOrders(tribeId);
      this.events.push({ type: 'standard', x, y, tribe: tribeId });
      return { ok: true };
    }
    if (type === 'grab') return this.grab(tribeId, action);
    if (type === 'release') return this.release(tribeId, action);
    return { ok: false, reason: 'Unknown action.' };
  }

  dropOrders(tribeId) { for (const p of this.people) if (p.tribe === tribeId && p.role === 'warrior') { p.job = null; p.path = null; p.think = 0; } }

  grab(tribeId, { kind, id }) {
    const tribe = this.tribes[tribeId];
    if (tribe.carried) return { ok: false, reason: 'The Hand is full.' };
    if (kind === 'person') {
      const p = this.people.find((e) => e.id === id); if (!p || p.state === 'carried') return { ok: false, reason: 'Gone.' };
      if (!this.inInfluence(tribeId, p.x, p.y)) return { ok: false, reason: 'Outside your influence.' };
      p.state = 'carried'; p.job = null; p.path = null; p.scared = 0;
      tribe.carried = { kind, ref: p };
    } else if (kind === 'rock' || kind === 'tree') {
      const list = kind === 'rock' ? this.rocks : this.trees, i = list.findIndex((e) => e.id === id);
      if (i < 0) return { ok: false, reason: 'Gone.' };
      const e = list[i];
      if (!this.inInfluence(tribeId, e.x, e.y)) return { ok: false, reason: 'Outside your influence.' };
      list.splice(i, 1);
      for (const p of this.people) if (p.job && p.job.tree === e) p.job = null;
      tribe.carried = { kind, ref: e };
    } else return { ok: false, reason: 'Nothing to grab.' };
    this.events.push({ type: 'grab', tribe: tribeId, x: tribe.carried.ref.x, y: tribe.carried.ref.y });
    return { ok: true };
  }

  // Lets go at (x, y), height z, with a throw velocity. Velocity is capped, so a throw has a real range.
  release(tribeId, { x, y, z = 3, vx = 0, vy = 0 }) {
    const tribe = this.tribes[tribeId], carried = tribe.carried; if (!carried) return { ok: false };
    tribe.carried = null;
    const speed = Math.hypot(vx, vy), cap = 24; if (speed > cap) { vx *= cap / speed; vy *= cap / speed; }
    x = clamp(x, 1, N - 2); y = clamp(y, 1, N - 2);
    if (carried.kind === 'person') {
      const p = carried.ref;
      if (!this.people.includes(p)) return { ok: true };
      p.x = x; p.y = y; p.z = Math.max(0.2, z); p.vx = vx; p.vy = vy; p.vz = 1; p.state = 'air'; p.thrower = tribeId;
    } else {
      this.flying.push({ id: this.nextId++, kind: carried.kind, ref: carried.ref, x, y, z: Math.max(0.2, z), vx, vy, vz: 1, tribe: tribeId, turn: carried.ref.turn || 0, scale: carried.ref.scale || 1 });
    }
    return { ok: true };
  }

  castMiracle(tribeId, { name, x, y }) {
    const tribe = this.tribes[tribeId], def = MIRACLES[name]; if (!def) return { ok: false, reason: 'Unknown miracle.' };
    if ((tribe.cooldowns[name] || 0) > this.time) return { ok: false, reason: `${def.name} is not ready.` };
    if (tribe.belief < def.cost) return { ok: false, reason: 'Not enough belief.' };
    if (name !== 'flood' && !this.inInfluence(tribeId, x, y)) return { ok: false, reason: 'Outside your influence.' };
    tribe.belief -= def.cost; tribe.cooldowns[name] = this.time + def.cooldown; tribe.stats.miraclesCast++;
    this.events.push({ type: 'miracle', name, x, y, tribe: tribeId, radius: def.radius });
    if (name === 'lightning') this.strike(tribeId, x, y);
    else if (name === 'rain') this.storms.push({ kind: 'rain', x, y, tribe: tribeId, until: this.time + 10, seeds: 12, next: 0 });
    else if (name === 'bless') { for (const p of this.people) if (p.tribe === tribeId && dist(p.x, p.y, x, y) <= def.radius) { p.blessUntil = this.time + 25; p.hp = Math.min(p.hp + 20, maxHp(p)); } }
    else if (name === 'fire') this.storms.push({ kind: 'fire', x, y, tribe: tribeId, at: this.time + 0.9, until: this.time + 1 });
    else if (name === 'quake') this.storms.push({ kind: 'quake', x, y, tribe: tribeId, until: this.time + 3, next: 0 });
    else if (name === 'flood') { this.seaTarget = 1.15; this.floodUntil = this.time + 18; }
    return { ok: true };
  }

  strike(tribeId, x, y) {
    for (const p of [...this.people]) if (p.state !== 'carried' && dist(p.x, p.y, x, y) < 2.4) this.hurt(p, 60, 'lightning');
    for (const b of [...this.buildings]) if (dist(b.x, b.y, x, y) < BUILDINGS[b.type].radius + 1.2) { this.hurtBuilding(b, 110); if (this.rng() < 0.6) b.burn = Math.max(b.burn, 8); }
    for (const t of this.trees) if (dist(t.x, t.y, x, y) < 2.8) t.burn = Math.max(t.burn, 5);
  }

  // ----- Main step -----

  step() {
    if (this.over) return;
    this.time += DT; this.tick++;
    for (const ai of this.rivals) ai.update(this, DT);
    this.pathBudget = 22;
    this.updateSea();
    if (this.passDirty && this.tick % 4 === 0) this.refreshNavigation();
    if (this.tick % 10 === 0 || this.influenceDirty) this.refreshInfluence();
    if (this.tick % 2 === 0) this.buildGrid();
    this.updateStorms();
    this.updateFlying();
    for (const tribe of this.tribes) this.updateTribe(tribe);
    for (const p of [...this.people]) this.updatePerson(p);
    this.updateBuildings();
    if (this.tick % 5 === 0) this.updateTrees();
    this.checkEnd();
  }

  updateSea() {
    if (this.seaTarget > 0 && this.time >= this.floodUntil) { this.seaTarget = 0; this.events.push({ type: 'floodEnd' }); }
    const old = this.sea, rate = 0.12 * DT;
    this.sea += clamp(this.seaTarget - this.sea, -rate, rate);
    if (Math.abs(this.sea - old) > 1e-5 && this.tick % 5 === 0) this.passDirty = true;
  }

  updateStorms() {
    for (const s of this.storms) {
      if (s.kind === 'rain' && this.time >= s.next && s.seeds > 0) {
        s.next = this.time + 0.6; s.seeds--;
        for (let tries = 0; tries < 6; tries++) {
          const a = this.rng() * 6.28, r = this.rng() * 11, x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
          if (x > 1 && y > 1 && x < N - 2 && y < N - 2 && this.heightAt(x, y) > this.sea + 0.25 && !this.nearTemple(x, y, 5.5) && this.trees.length < MAX_TREES && !this.buildings.some((b) => dist(b.x, b.y, x, y) < BUILDINGS[b.type].radius + 0.6)) { this.addTree(x, y, 0.15); break; }
        }
        for (const t of this.trees) if (t.burn > 0 && dist(t.x, t.y, s.x, s.y) < 12) t.burn = 0;
        for (const b of this.buildings) if (dist(b.x, b.y, s.x, s.y) < 12) b.burn = 0;
        for (const b of this.buildings) if (b.tribe === s.tribe && dist(b.x, b.y, s.x, s.y) < 13) { this.tribes[s.tribe].fertileUntil = this.time + 25; break; }
      }
      if (s.kind === 'fire' && this.time >= s.at && !s.done) {
        s.done = true;
        this.events.push({ type: 'fireImpact', x: s.x, y: s.y });
        for (const p of [...this.people]) if (p.state !== 'carried' && dist(p.x, p.y, s.x, s.y) < 5) this.hurt(p, 48 * (1 - dist(p.x, p.y, s.x, s.y) / 8), 'fire');
        for (const b of this.buildings) if (dist(b.x, b.y, s.x, s.y) < 5 + BUILDINGS[b.type].radius) { b.burn = Math.max(b.burn, 14); }
        for (const t of this.trees) if (dist(t.x, t.y, s.x, s.y) < 5.5) t.burn = Math.max(t.burn, 5 + this.rng() * 3);
      }
      if (s.kind === 'quake' && this.time >= s.next) {
        s.next = this.time + 0.3;
        this.events.push({ type: 'quakePulse', x: s.x, y: s.y });
        for (let i = 0; i < 4; i++) {
          const a = this.rng() * 6.28, r = this.rng() * 7, cx = s.x + Math.cos(a) * r, cy = s.y + Math.sin(a) * r, amount = (this.rng() - 0.45) * 1.15;
          this.reshape(cx, cy, 2.6, (v, d) => v + amount * (1 - (d / 2.6) ** 2));
        }
        for (const p of [...this.people]) if (p.state !== 'carried' && dist(p.x, p.y, s.x, s.y) < 8) this.hurt(p, 3, 'quake');
        for (const b of [...this.buildings]) if (dist(b.x, b.y, s.x, s.y) < 8 + BUILDINGS[b.type].radius) this.hurtBuilding(b, b.type === 'temple' ? 45 : 22);
      }
    }
    this.storms = this.storms.filter((s) => this.time < (s.until ?? 0) || (s.kind === 'rain' && s.seeds > 0));
  }

  landImpact(x, y, damage, radius, tribeId, buildingDamage) {
    this.events.push({ type: 'impact', x, y, big: radius > 1.5 });
    for (const p of [...this.people]) if (p.state !== 'carried' && p.state !== 'air' && dist(p.x, p.y, x, y) < radius) this.hurt(p, damage, 'crushed');
    for (const b of [...this.buildings]) if (dist(b.x, b.y, x, y) < radius + BUILDINGS[b.type].radius) this.hurtBuilding(b, buildingDamage);
  }

  updateFlying() {
    for (const f of [...this.flying]) {
      f.vz -= 18 * DT; f.x = clamp(f.x + f.vx * DT, 1, N - 2); f.y = clamp(f.y + f.vy * DT, 1, N - 2); f.z += f.vz * DT;
      const ground = Math.max(this.heightAt(f.x, f.y), this.sea);
      if (f.z > ground) continue;
      this.flying.splice(this.flying.indexOf(f), 1);
      const speed = Math.hypot(f.vx, f.vy, f.vz), onLand = this.heightAt(f.x, f.y) > this.sea;
      if (f.kind === 'rock') {
        if (speed > 5) this.landImpact(f.x, f.y, 70, 1.9 * (f.scale || 1), f.tribe, 90);
        if (onLand) this.rocks.push({ id: f.ref.id, x: f.x, y: f.y, scale: f.ref.scale, turn: f.ref.turn });
        else this.events.push({ type: 'splash', x: f.x, y: f.y });
      } else if (f.kind === 'tree') {
        const temple = this.tribes[f.tribe].temple;
        if (temple && dist(f.x, f.y, temple.x, temple.y) < 8) { this.tribes[f.tribe].wood += 8; this.events.push({ type: 'offering', x: f.x, y: f.y, tribe: f.tribe }); }
        else if (onLand) { if (speed > 8) this.landImpact(f.x, f.y, 26, 1.5, f.tribe, 25); const t = this.addTree(f.x, f.y, 1); t.kind = f.ref.kind; t.scale = f.ref.scale; t.wood = f.ref.wood; }
        else this.events.push({ type: 'splash', x: f.x, y: f.y });
      }
    }
  }

  updateTribe(tribe) {
    tribe.belief = Math.min(BELIEF_CAP, tribe.belief + tribe.pop * 0.012 * DT * tribe.beliefMult);
    tribe.food = Math.max(0, tribe.food - tribe.pop * 0.024 * DT);
    if (this.time > 0) {
      let capacity = 0, count = 0, warriors = 0;
      for (const b of this.buildings) if (b.tribe === tribe.id && b.progress >= 1) capacity += BUILDINGS[b.type].capacity;
      for (const p of this.people) if (p.tribe === tribe.id) { count++; if (p.role === 'warrior') warriors++; }
      tribe.pop = count; tribe.warriors = warriors; tribe.capacity = capacity; tribe.stats.peak = Math.max(tribe.stats.peak, count);
    }
    tribe.birthTimer -= DT * (tribe.fertileUntil > this.time ? 2 : 1);
    if (tribe.birthTimer <= 0) {
      tribe.birthTimer = 7 + tribe.pop * 0.12;
      if (tribe.pop < Math.min(tribe.capacity, MAX_POP) && tribe.food >= 2) {
        const homes = this.buildings.filter((b) => b.tribe === tribe.id && b.progress >= 1 && BUILDINGS[b.type].capacity > 0);
        if (homes.length) {
          tribe.food -= 2;
          const home = homes[Math.floor(this.rng() * homes.length)], a = this.rng() * 6.28, r = BUILDINGS[home.type].radius + 0.8;
          const x = clamp(home.x + Math.cos(a) * r, 1, N - 2), y = clamp(home.y + Math.sin(a) * r, 1, N - 2);
          if (this.heightAt(x, y) > this.sea) { this.spawnPerson(tribe.id, x, y, 'villager'); tribe.stats.born++; this.events.push({ type: 'birth', x, y, tribe: tribe.id }); }
        }
      }
    }
    tribe.plannerTimer -= DT;
    if (tribe.plannerTimer <= 0) { tribe.plannerTimer = 1.5; this.planBuildings(tribe); this.trainWarriors(tribe); this.assignJobs(tribe); this.equipWarriors(tribe); this.checkAge(tribe); }
  }

  trainWarriors(tribe) {
    const wanted = tribe.pop >= 10 ? Math.floor(tribe.pop * (tribe.standard ? 0.42 : 0.28)) : 0;
    if (tribe.warriors >= wanted) return;
    const recruit = this.people.find((p) => p.tribe === tribe.id && p.role === 'villager' && p.state === 'pray') || this.people.find((p) => p.tribe === tribe.id && p.role === 'villager' && p.state === 'idle' && !p.job);
    if (recruit) { recruit.role = 'warrior'; recruit.profession = 'warrior'; recruit.rank = 0; recruit.xp = 0; recruit.gear = 0; recruit.hp = 46; recruit.job = null; recruit.path = null; recruit.state = 'idle'; this.events.push({ type: 'recruit', x: recruit.x, y: recruit.y, tribe: tribe.id }); }
  }

  // The elders decide who does what, by need. People change jobs rarely, because changing costs them their rank.
  assignJobs(tribe) {
    const civilians = this.people.filter((p) => p.tribe === tribe.id && p.role === 'villager');
    if (!civilians.length) return;
    const count = (type) => this.buildings.filter((b) => b.tribe === tribe.id && b.type === type && b.progress >= 1).length;
    const sites = this.buildings.some((b) => b.tribe === tribe.id && b.progress < 1) ? this.buildings.filter((b) => b.tribe === tribe.id && b.progress < 1).length : 0;
    const total = civilians.length, wanted = {
      farmer: tribe.food > tribe.pop * 5 + 40 ? Math.min(1, count('farm')) : Math.min(count('farm') * BUILDINGS.farm.workers, Math.ceil(tribe.pop / 8) + (tribe.food < 10 ? 1 : 0)),
      builder: sites ? Math.min(sites * 2, Math.max(1, Math.ceil(total * 0.25))) : (total > 14 ? 1 : 0),
      woodcutter: tribe.wood < 30 ? Math.ceil(total * 0.3) : tribe.wood < 70 ? Math.ceil(total * 0.1) : 0,
      miner: Math.min(count('mine') * BUILDINGS.mine.workers, Math.ceil(total * 0.14)),
      smith: tribe.ore >= 2 || tribe.metal < 6 ? Math.min(count('forge') * BUILDINGS.forge.workers, Math.ceil(total * 0.1)) : 0,
      scribe: Math.min(count('school') * BUILDINGS.school.workers, Math.ceil(total * 0.15)),
    };
    const members = (job) => civilians.filter((p) => p.profession === job);
    let moves = 2;
    for (const [job, target] of Object.entries(wanted)) {
      const current = members(job);
      if (current.length > target && moves > 0) { const p = current.sort((a, b) => a.xp - b.xp)[0]; this.setProfession(p, 'priest'); moves--; }
      else if (current.length < target && moves > 0) {
        const spare = members('priest').sort((a, b) => a.xp - b.xp)[0];
        if (spare && members('priest').length > Math.floor(total * 0.15)) { this.setProfession(spare, job); moves--; }
      }
    }
  }

  setProfession(p, job) {
    p.profession = job; p.rank = 0; p.xp = 0; p.work = 0;
    if (p.job && p.carry === 0) { p.job = null; p.path = null; p.think = this.rng(); }
  }

  gainXp(p, amount) {
    p.xp += amount;
    const table = p.role === 'warrior' ? WAR_XP : WORK_XP;
    if (p.rank < 2 && p.xp >= table[p.rank + 1]) {
      p.rank++;
      this.events.push({ type: 'promote', x: p.x, y: p.y, tribe: p.tribe, title: personTitle(p), rank: p.rank, id: p.id });
    }
  }

  // New metal goes to the warriors a pair at a time, so an army's look and strength change gradually.
  equipWarriors(tribe) {
    if (!tribe.age) return;
    let upgrades = 2;
    for (const p of this.people) {
      if (!upgrades || tribe.metal < 2) break;
      if (p.tribe !== tribe.id || p.role !== 'warrior' || p.gear >= tribe.age) continue;
      tribe.metal -= 2; p.gear = tribe.age; p.hp = maxHp(p); upgrades--;
    }
  }

  checkAge(tribe) {
    const progress = ageProgress(this, tribe);
    if (progress && progress.done) {
      tribe.age++; tribe.ageAt = tribe.ageAt || []; tribe.ageAt[tribe.age] = this.time;
      this.events.push({ type: 'age', tribe: tribe.id, age: tribe.age, x: tribe.temple.x, y: tribe.temple.y });
    }
  }

  planBuildings(tribe) {
    const mine = this.buildings.filter((b) => b.tribe === tribe.id), sites = mine.filter((b) => b.progress < 1);
    if (sites.length >= 2 + Math.floor(tribe.pop / 18)) return;
    const count = (type) => mine.filter((b) => b.type === type).length;
    const needsHome = tribe.capacity + sites.filter((b) => BUILDINGS[b.type].capacity).length * 3 < Math.min(tribe.pop + 7, MAX_POP);
    // A hut that now has room around it grows into a house, the reward for levelling land.
    if (needsHome && tribe.age >= 1 && tribe.wood >= BUILDINGS.house.cost) {
      const hut = mine.find((b) => b.type === 'hut' && b.progress >= 1 && this.flatness(b.x, b.y, 2) <= BUILDINGS.house.flat + 0.05 && !this.buildings.some((o) => o !== b && dist(o.x, o.y, b.x, b.y) < BUILDINGS.house.radius + BUILDINGS[o.type].radius));
      if (hut) {
        hut.type = 'house'; hut.progress = 0; hut.upgrading = true; hut.hp = BUILDINGS.house.hp; tribe.wood -= BUILDINGS.house.cost; this.stampBlocked(hut, 1);
        return;
      }
    }
    // Needs in order. The first workshop of each kind outranks new homes, so an age's new crafts actually start.
    const needs = [];
    if (count('farm') < Math.min(6, Math.ceil((tribe.pop + 2) / 12)) && tribe.food < tribe.pop * 4 + 20) needs.push('farm');
    if (tribe.age >= 1) for (const type of ['school', 'mine', 'forge']) if (!count(type)) needs.push(type);
    if (needsHome) needs.push('hut');
    if (tribe.age >= 1) {
      if (count('school') && count('school') < 1 + Math.floor(tribe.pop / 26)) needs.push('school');
      if (count('mine') && count('mine') < 1 + Math.floor(tribe.pop / 24)) needs.push('mine');
      if (count('forge') && count('forge') < 1 + Math.floor(tribe.pop / 26)) needs.push('forge');
    }
    if (tribe.age >= 2 && count('tower') < Math.min(3, 1 + Math.floor(tribe.pop / 30))) needs.push('tower');
    if (!needs.length) { tribe.noSiteSince = -1; return; }
    for (const type of needs) {
      const def = BUILDINGS[type];
      if (tribe.wood < def.cost || tribe.metal < (def.metal || 0)) return; // Save up for the most urgent thing.
      // A workshop the next age depends on must not stall it, so workers will clear trees and level rougher ground for it.
      const found = this.findPlot(tribe, type) || (type !== 'hut' && (count(type) === 0 || ageProgress(this, tribe)?.items.some((i) => i.key === type && i.have < i.need)) ? this.findPlot(tribe, type, true) : null);
      if (found) {
        if (found.clear) for (let t = this.trees.length - 1; t >= 0; t--) if (dist(this.trees[t].x, this.trees[t].y, found.x, found.y) < def.radius) this.removeTree(t);
        tribe.wood -= def.cost; tribe.metal -= def.metal || 0;
        this.addBuilding(type, tribe.id, found.x, found.y, 0); tribe.noSiteSince = -1; tribe.stats.buildings++;
        return;
      }
    }
    if (tribe.noSiteSince < 0) tribe.noSiteSince = this.time;
  }

  findPlot(tribe, type, rough = false) {
    const def = BUILDINGS[type], homes = this.buildings.filter((b) => b.tribe === tribe.id && b.progress >= 1);
    const anchor = tribe.standard && type === 'hut' && this.rng() < 0.5 ? tribe.standard : null;
    const reach = Math.ceil(def.radius - 0.4);
    for (let i = 0; i < (type === 'hut' ? 44 : 90); i++) {
      const from = anchor || homes[Math.floor(this.rng() * homes.length)]; if (!from) return null;
      const a = this.rng() * 6.28, r = (from.type === 'temple' ? 6.5 : 3.5) + this.rng() * (rough ? 18 : type === 'hut' ? 8.5 : 13);
      const x = Math.round(from.x + Math.cos(a) * r), y = Math.round(from.y + Math.sin(a) * r);
      if (x < 3 || y < 3 || x > N - 4 || y > N - 4) continue;
      if (!this.inInfluence(tribe.id, x, y) || this.heightAt(x, y) < this.sea + (type === 'mine' ? 0.7 : 0.3)) continue;
      if (!this.connectedToTemple(tribe, x, y)) continue;
      if (this.flatness(x, y, reach) > (rough ? 1.15 : def.flat)) continue;
      if (this.buildings.some((b) => dist(b.x, b.y, x, y) < BUILDINGS[b.type].radius + def.radius + 0.6)) continue;
      if (!rough && this.trees.some((t) => dist(t.x, t.y, x, y) < def.radius)) continue;
      return { x, y, clear: rough };
    }
    return null;
  }

  connectedToTemple(tribe, x, y) {
    if (!tribe.temple) return false;
    const c = this.componentAt(x, y); if (c < 0) return false;
    for (const [a, b] of [[5, 0], [-5, 0], [0, 5], [0, -5], [5, 5], [-5, -5], [5, -5], [-5, 5]]) if (this.componentAt(tribe.temple.x + a, tribe.temple.y + b) === c) return true;
    return false;
  }

  updateBuildings() {
    for (const b of [...this.buildings]) {
      if (b.burn > 0) {
        b.burn -= DT;
        this.hurtBuilding(b, (b.type === 'temple' ? 14 : 20) * DT);
        if (!this.buildings.includes(b)) continue;
        if (this.tick % 15 === b.id % 15) for (const t of this.trees) if (dist(t.x, t.y, b.x, b.y) < BUILDINGS[b.type].radius + 2 && this.rng() < 0.35) t.burn = Math.max(t.burn, 4);
      }
      if (b.type === 'tower' && b.progress >= 1) this.fireTower(b);
      if (b.type !== 'temple' && this.heightAt(b.x, b.y) < this.sea - 0.05) this.hurtBuilding(b, 60 * DT);
      else if (b.type === 'temple' && b.hp < BUILDINGS.temple.hp) b.hp = Math.min(BUILDINGS.temple.hp, b.hp + 2 * DT);
    }
  }

  // A watchtower looses arrows at any enemy in range.
  fireTower(b) {
    b.reload = (b.reload || 0) - DT; if (b.reload > 0) return;
    let target = null, best = 9;
    for (const p of this.people) { if (p.tribe === b.tribe || p.state === 'carried' || p.state === 'air') continue; const d = dist(p.x, p.y, b.x, b.y); if (d < best) { best = d; target = p; } }
    if (!target) { b.reload = 0.5; return; }
    b.reload = 1.3; this.events.push({ type: 'arrow', fromX: b.x, fromY: b.y, x: target.x, y: target.y, tribe: b.tribe });
    this.hurt(target, 8 * AGES[this.tribes[b.tribe].age].gear, 'arrow');
  }

  updateTrees() {
    const dt = DT * 5;
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const t = this.trees[i];
      if (t.growth < 1) t.growth = Math.min(1, t.growth + dt * 0.04);
      if (this.heightAt(t.x, t.y) < this.sea - 0.1) { t.wet += dt; if (t.wet > 5) { this.removeTree(i); continue; } }
      if (t.burn > 0) {
        t.burn -= dt;
        if (this.rng() < 0.11) for (const o of this.trees) if (o !== t && o.burn <= 0 && dist(o.x, o.y, t.x, t.y) < 2.6) { o.burn = 4 + this.rng() * 2; break; }
        if (t.burn <= 0) { this.events.push({ type: 'treeBurnt', x: t.x, y: t.y }); this.removeTree(i); }
      }
    }
    // Forests slowly spread on their own, so wood is never gone for good.
    if (this.tick % 60 === 0 && this.trees.length && this.trees.length < MAX_TREES) {
      const from = this.trees[Math.floor(this.rng() * this.trees.length)], a = this.rng() * 6.28, r = 1.5 + this.rng() * 3;
      const x = from.x + Math.cos(a) * r, y = from.y + Math.sin(a) * r;
      if (x > 1 && y > 1 && x < N - 2 && y < N - 2 && this.heightAt(x, y) > this.sea + 0.25 && !this.nearTemple(x, y, 5.5) && !this.buildings.some((b) => dist(b.x, b.y, x, y) < BUILDINGS[b.type].radius + 0.6)) this.addTree(x, y, 0.1);
    }
  }

  removeTree(i) {
    const t = this.trees[i]; this.trees.splice(i, 1);
    for (const p of this.people) if (p.job && p.job.tree === t) p.job = null;
  }

  checkEnd() {
    if (this.tick < 20) return;
    for (const tribe of this.tribes) if (tribe.pop === 0 && !tribe.carried) { this.defeat(tribe.id, 'followers'); return; }
  }

  // ----- People -----

  buildGrid() {
    this.grid.clear();
    for (const p of this.people) {
      if (p.state === 'carried' || p.state === 'air') continue;
      const key = ((p.x / 8) | 0) + ((p.y / 8) | 0) * 100; let list = this.grid.get(key);
      if (!list) { list = []; this.grid.set(key, list); }
      list.push(p);
    }
  }

  nearestEnemy(p, radius) {
    let best = null, bestD = radius, reach = Math.ceil(radius / 8);
    const cx = (p.x / 8) | 0, cy = (p.y / 8) | 0;
    for (let b = cy - reach; b <= cy + reach; b++) for (let a = cx - reach; a <= cx + reach; a++) {
      const list = this.grid.get(a + b * 100); if (!list) continue;
      for (const o of list) { if (o.tribe === p.tribe) continue; const d = dist(o.x, o.y, p.x, p.y); if (d < bestD) { bestD = d; best = o; } }
    }
    return best;
  }

  nearestEnemyBuilding(x, y, tribe, radius) {
    let best = null, bestD = radius;
    for (const b of this.buildings) { if (b.tribe === tribe) continue; const d = dist(b.x, b.y, x, y) - BUILDINGS[b.type].radius; if (d < bestD) { bestD = d; best = b; } }
    return best;
  }

  updatePerson(p) {
    if (p.state === 'carried') return;
    if (p.state === 'air') return this.updateAirborne(p);
    p.moving = false;
    const tribe = this.tribes[p.tribe], ground = this.heightAt(p.x, p.y);
    if (p.blessUntil > this.time && this.tick % 10 === 0) p.hp = Math.min(maxHp(p), p.hp + 1.5);
    if (p.scared > 0) p.scared -= DT;
    if (p.attack > 0) p.attack -= DT;
    if (ground < this.sea + 0.02) return this.swim(p);
    p.think -= DT;
    if (p.think <= 0) { p.think = 0.8 + this.rng() * 0.6; if (p.role === 'warrior') this.thinkWarrior(p, tribe); else this.thinkVillager(p, tribe); }
    if (p.role === 'warrior') this.actWarrior(p, tribe); else this.actVillager(p, tribe);
    // Stray fire and the odd burning tree hurt whoever stands too close.
    if (this.tick % 10 === p.id % 10) for (const t of this.trees) if (t.burn > 0 && dist(t.x, t.y, p.x, p.y) < 1.1) { this.hurt(p, 7, 'fire'); break; }
  }

  updateAirborne(p) {
    p.vz -= 18 * DT; p.x = clamp(p.x + p.vx * DT, 1, N - 2); p.y = clamp(p.y + p.vy * DT, 1, N - 2); p.z += p.vz * DT;
    const ground = Math.max(this.heightAt(p.x, p.y), this.sea);
    if (p.z > ground) return;
    const impact = Math.hypot(p.vx, p.vy, p.vz);
    p.z = 0; p.vx = p.vy = p.vz = 0; p.state = 'idle'; p.job = null; p.path = null; p.think = 0.5;
    if (this.heightAt(p.x, p.y) < this.sea) { this.events.push({ type: 'splash', x: p.x, y: p.y }); return; }
    this.events.push({ type: 'land', x: p.x, y: p.y, hard: impact > 12 });
    if (impact > 12) {
      for (const o of [...this.people]) if (o !== p && o.tribe !== p.tribe && o.state !== 'carried' && o.state !== 'air' && dist(o.x, o.y, p.x, p.y) < 1.5) this.hurt(o, 22, 'crushed');
      this.hurt(p, impact > 18 ? 999 : 12, 'thrown');
      if (!this.people.includes(p)) return;
    }
    // Set an enemy down on your temple ground and they join you.
    const captor = this.tribes[p.thrower ?? p.tribe];
    if (captor && p.tribe !== captor.id && p.role === 'villager' && captor.temple && dist(p.x, p.y, captor.temple.x, captor.temple.y) < 9) this.convert(p, captor.id);
  }

  swim(p) {
    p.state = 'swim'; p.job = null; p.path = null;
    if (this.tick % 5 === 0) this.hurt(p, 2.2, 'drowned');
    if (!this.people.includes(p)) return;
    // Scrabble toward the highest nearby ground.
    let bestX = 0, bestY = 0, best = -Infinity;
    for (const [a, b] of NEIGHBORS) { const h = this.heightAt(p.x + a * 2, p.y + b * 2); if (h > best) { best = h; bestX = a; bestY = b; } }
    const len = Math.hypot(bestX, bestY) || 1;
    p.x = clamp(p.x + bestX / len * 1.0 * DT, 1, N - 2); p.y = clamp(p.y + bestY / len * 1.0 * DT, 1, N - 2);
    p.heading = Math.atan2(bestX, bestY); p.moving = true;
    if (this.heightAt(p.x, p.y) >= this.sea + 0.02) p.state = 'idle';
  }

  thinkVillager(p, tribe) {
    if (p.scared > 0 && tribe.temple) {
      const threat = this.nearestEnemy(p, 6);
      if (threat) { p.job = { type: 'flee', x: tribe.temple.x + p.offX * 12, y: tribe.temple.y + p.offY * 12 }; p.state = 'walk'; return; }
    }
    if (p.job && p.job.type !== 'pray' && p.job.type !== 'flee') return;
    if (p.job && p.job.type === 'flee') p.job = null;
    if (p.carry > 0) { const home = this.nearestHome(p, tribe); if (home) { p.job = { type: 'deliver', building: home }; return; } p.carry = 0; }
    // Everyone does their own job first. With nothing to do, they go and pray.
    if (p.profession === 'builder') {
      let site = null, siteD = Infinity;
      for (const b of this.buildings) {
        if (b.tribe !== tribe.id || b.progress >= 1 || this.workersAt(b, 'build') >= 3) continue;
        const d = dist(b.x, b.y, p.x, p.y); if (d < siteD && this.connectedBuilding(p, b)) { siteD = d; site = b; }
      }
      if (site) { p.job = { type: 'build', building: site }; p.path = null; return; }
    } else if (p.profession === 'woodcutter') {
      const tree = this.nearestTree(p, 40);
      if (tree) { p.job = { type: 'chop', tree }; p.path = null; return; }
    } else if (p.profession === 'farmer' || p.profession === 'miner' || p.profession === 'smith' || p.profession === 'scribe') {
      const type = { farmer: 'farm', miner: 'mine', smith: 'forge', scribe: 'school' }[p.profession];
      if (p.profession !== 'smith' || tribe.ore >= 2) {
        const place = this.workplace(p, type);
        if (place) { p.job = { type: 'tend', building: place }; p.path = null; return; }
      }
    }
    if (p.job && p.job.type === 'pray') { if (this.rng() < 0.97) return; }
    if (tribe.temple) {
      const a = (p.seed * 7.3) % 6.283, r = 5.4 + (p.seed % 1) * 2.4;
      const x = tribe.temple.x + Math.cos(a) * r, y = tribe.temple.y + Math.sin(a) * r;
      if (this.connected(p.x, p.y, x, y)) { p.job = { type: 'pray', x, y }; p.path = null; return; }
    }
    if (this.rng() < 0.3) { const a = this.rng() * 6.28; p.job = { type: 'wander', x: p.x + Math.cos(a) * 4, y: p.y + Math.sin(a) * 4 }; p.path = null; }
  }

  workersAt(b, kind) { let n = 0; for (const o of this.people) if (o.job && o.job.type === kind && o.job.building === b) n++; return n; }

  workplace(p, type) {
    let best = null, bestD = Infinity;
    for (const b of this.buildings) {
      if (b.tribe !== p.tribe || b.type !== type || b.progress < 1 || this.workersAt(b, 'tend') >= BUILDINGS[type].workers) continue;
      const d = dist(b.x, b.y, p.x, p.y); if (d < bestD && this.connectedBuilding(p, b)) { bestD = d; best = b; }
    }
    return best;
  }

  // How fast this person works, from their rank, their tribe's tools and any blessing.
  workSpeed(p, tribe) { return RANK_SPEED[p.rank] * AGES[tribe.age].tool * (p.blessUntil > this.time ? 1.6 : 1); }

  connectedBuilding(p, b) { const r = BUILDINGS[b.type].radius + 1; return [[r, 0], [-r, 0], [0, r], [0, -r]].some(([x, y]) => this.connected(p.x, p.y, b.x + x, b.y + y)); }

  nearestHome(p, tribe) {
    let best = null, bestD = Infinity;
    for (const b of this.buildings) { if (b.tribe !== tribe.id || b.progress < 1) continue; const d = dist(b.x, b.y, p.x, p.y); if (d < bestD && this.connectedBuilding(p, b)) { bestD = d; best = b; } }
    return best;
  }

  nearestTree(p, radius) {
    let best = null, bestD = radius;
    for (const t of this.trees) { if (t.growth < 0.7 || t.burn > 0) continue; const d = dist(t.x, t.y, p.x, p.y); if (d < bestD && this.connected(p.x, p.y, t.x, t.y)) { bestD = d; best = t; } }
    return best;
  }

  actVillager(p, tribe) {
    const job = p.job;
    if (!job) { p.state = 'idle'; return; }
    if (job.type === 'build') {
      const b = job.building;
      if (!this.buildings.includes(b) || b.progress >= 1) { p.job = null; p.think = 0; return; }
      if (this.approachBuilding(p, b)) {
        p.state = 'work'; p.heading = Math.atan2(b.x - p.x, b.y - p.y);
        const labor = BUILDINGS[b.type].labor;
        b.progress = Math.min(1, b.progress + DT / labor * this.workSpeed(p, tribe)); this.gainXp(p, DT);
        if (b.progress >= 1) { b.upgrading = false; b.builders = 0; this.influenceDirty = true; this.events.push({ type: 'built', x: b.x, y: b.y, tribe: b.tribe, building: b.type }); for (const o of this.people) if (o.job && o.job.building === b) o.job = null; }
      }
    } else if (job.type === 'chop') {
      const t = job.tree;
      if (!this.trees.includes(t)) { p.job = null; p.think = 0; return; }
      if (this.moveTo(p, t.x, t.y, 0.9)) {
        p.state = 'work'; p.heading = Math.atan2(t.x - p.x, t.y - p.y); p.work += DT;
        p.work += DT * (this.workSpeed(p, tribe) - 1); this.gainXp(p, DT);
        if (p.work > 2.4) {
          p.work = 0; t.wood--; p.carry = 2; this.events.push({ type: 'chop', x: t.x, y: t.y, tribe: p.tribe });
          if (t.wood <= 0) this.removeTree(this.trees.indexOf(t));
          const home = this.nearestHome(p, tribe); p.job = home ? { type: 'deliver', building: home } : null; p.path = null;
        }
      }
    } else if (job.type === 'deliver') {
      const b = job.building;
      if (!this.buildings.includes(b)) { p.job = null; p.think = 0; return; }
      if (this.approachBuilding(p, b)) { tribe.wood += p.carry; p.carry = 0; p.job = null; p.think = 0; }
    } else if (job.type === 'tend') {
      const b = job.building;
      if (!this.buildings.includes(b) || b.progress < 1) { p.job = null; p.think = 0; return; }
      if (this.approachBuilding(p, b)) {
        p.state = 'work'; p.heading = Math.atan2(b.x - p.x, b.y - p.y); this.gainXp(p, DT);
        const speed = this.workSpeed(p, tribe);
        if (p.profession === 'scribe') tribe.lore += 0.13 * DT * speed;
        else {
          p.work += DT * speed;
          if (p.profession === 'farmer' && p.work >= 5) { p.work = 0; tribe.food += tribe.fertileUntil > this.time ? 2.6 : 1.7; }
          else if (p.profession === 'miner' && p.work >= 6) { p.work = 0; tribe.ore += 1; }
          else if (p.profession === 'smith') {
            if (tribe.ore < 2) { p.work = 0; p.job = null; p.think = 2; return; }
            if (p.work >= 6) { p.work = 0; tribe.ore -= 2; tribe.metal += 1; tribe.metalMade += 1; }
          }
        }
      }
    } else if (job.type === 'pray') {
      if (this.moveTo(p, job.x, job.y, 0.6)) {
        p.state = 'pray'; if (tribe.temple) p.heading = Math.atan2(tribe.temple.x - p.x, tribe.temple.y - p.y);
        tribe.belief = Math.min(BELIEF_CAP, tribe.belief + 0.15 * DT * tribe.beliefMult); tribe.lore += 0.028 * DT;
        if (p.profession === 'priest') this.gainXp(p, DT);
      }
    } else if (job.type === 'flee' || job.type === 'wander') {
      if (this.moveTo(p, job.x, job.y, 1.2)) p.job = null;
    }
    tribe.prayingNext = (tribe.prayingNext || 0) + (p.state === 'pray' ? 1 : 0);
    if (this.tick % 10 === 0 && p === this.people[this.people.length - 1]) this.commitPrayerCount();
  }

  commitPrayerCount() { for (const t of this.tribes) { t.praying = Math.round((t.prayingNext || 0) / 10); t.prayingNext = 0; } }

  thinkWarrior(p, tribe) {
    const enemy = this.nearestEnemy(p, 9);
    if (enemy) { p.job = { type: 'fight', target: enemy }; p.path = null; return; }
    if (tribe.standard) {
      const s = tribe.standard, near = dist(p.x, p.y, s.x, s.y) < 7;
      if (near) {
        const b = this.nearestEnemyBuilding(p.x, p.y, p.tribe, 11);
        if (b) { p.job = { type: 'raze', building: b }; p.path = null; return; }
      }
      if (!p.job || p.job.type !== 'march' || !near) {
        const tx = s.x + p.offX * 7, ty = s.y + p.offY * 7;
        if (this.connected(p.x, p.y, tx, ty) || this.connected(p.x, p.y, s.x, s.y)) { p.job = { type: 'march', x: tx, y: ty }; return; }
      }
    }
    const adjacent = this.nearestEnemyBuilding(p.x, p.y, p.tribe, 5);
    if (adjacent) { p.job = { type: 'raze', building: adjacent }; p.path = null; return; }
    if (!p.job || p.job.type === 'fight' || p.job.type === 'raze' || p.job.type === 'march') {
      if (tribe.temple) { const a = p.seed * 3.1, r = 8 + (p.seed % 1) * 4; p.job = { type: 'guard', x: tribe.temple.x + Math.cos(a) * r, y: tribe.temple.y + Math.sin(a) * r }; p.path = null; }
    }
  }

  actWarrior(p) {
    const job = p.job; if (!job) { p.state = 'idle'; return; }
    const might = (p.blessUntil > this.time ? 1.6 : 1) * AGES[p.gear].gear * RANK_MIGHT[p.rank];
    if (job.type === 'fight') {
      const t = job.target;
      if (!this.people.includes(t) || t.state === 'carried' || t.state === 'air') { p.job = null; p.think = 0; return; }
      if (this.moveTo(p, t.x, t.y, 0.75) && dist(p.x, p.y, t.x, t.y) < 1.8) {
        p.state = 'fight'; p.heading = Math.atan2(t.x - p.x, t.y - p.y);
        if (p.attack <= 0) { p.attack = 0.8; this.gainXp(p, 1); this.hurt(t, 7 * might, 'battle'); this.events.push({ type: 'hit', x: t.x, y: t.y }); }
      }
    } else if (job.type === 'raze') {
      const b = job.building;
      if (!this.buildings.includes(b)) { p.job = null; p.think = 0; return; }
      if (this.approachBuilding(p, b)) {
        p.state = 'fight'; p.heading = Math.atan2(b.x - p.x, b.y - p.y);
        if (p.attack <= 0) { p.attack = 0.8; this.hurtBuilding(b, 6.5 * might); this.events.push({ type: 'hit', x: p.x, y: p.y, building: true }); }
      }
    } else if (job.type === 'march' || job.type === 'guard') {
      if (this.moveTo(p, job.x, job.y, 1)) { p.state = 'idle'; if (job.type === 'guard' && this.rng() < 0.01) p.job = null; }
    }
  }

  approachBuilding(p, b) {
    const reach = BUILDINGS[b.type].radius + 0.75;
    if (dist(p.x, p.y, b.x, b.y) <= reach) return true;
    return this.moveTo(p, b.x, b.y, reach) || dist(p.x, p.y, b.x, b.y) <= reach;
  }

  // Walks toward (x, y) along a cached path. Returns true when within reach.
  moveTo(p, x, y, reach) {
    if (dist(p.x, p.y, x, y) <= reach) { p.path = null; return true; }
    const settled = p.settled;
    if (settled && settled.version === this.navVersion && dist(settled.x, settled.y, x, y) < 0.5) return true;
    p.state = 'walk';
    const goalChanged = !p.pathGoal || dist(p.pathGoal.x, p.pathGoal.y, x, y) > 1.5;
    if (!p.path || goalChanged || (p.navVersion !== this.navVersion && !this.pathStillValid(p))) {
      if (this.pathBudget <= 0) return false;
      this.pathBudget--;
      p.path = this.findPath(p.x, p.y, x, y, reach); p.pathIndex = 0; p.pathGoal = { x, y }; p.navVersion = this.navVersion;
      if (!p.path) { p.job = null; p.think = 0.6 + this.rng(); p.state = 'idle'; return false; }
      // Already at the closest reachable point. Without this, the person would search again on every step and use up the budget.
      if (!p.path.length) { p.path = null; p.settled = { x, y, version: this.navVersion }; return true; }
    }
    const blessed = p.blessUntil > this.time;
    const speed = (p.role === 'warrior' ? 2.1 : 1.75) * (blessed ? 1.35 : 1);
    let step = speed * DT;
    while (step > 0 && p.pathIndex < p.path.length) {
      const node = p.path[p.pathIndex], nx = node % N + p.offX * 0.8, ny = ((node / N) | 0) + p.offY * 0.8, dx = nx - p.x, dy = ny - p.y, d = Math.hypot(dx, dy);
      if (d <= step) { p.x = nx; p.y = ny; step -= d; p.pathIndex++; continue; }
      p.x += dx / d * step; p.y += dy / d * step; p.heading = Math.atan2(dx, dy); step = 0;
    }
    p.moving = true;
    if (p.pathIndex >= p.path.length) { p.path = null; return true; }
    return false;
  }

  pathStillValid(p) {
    p.navVersion = this.navVersion;
    for (let i = p.pathIndex; i < Math.min(p.path.length, p.pathIndex + 12); i++) if (!this.passable[p.path[i]]) return false;
    return true;
  }

  // A* on the terrain grid. Components reject unreachable goals, so a failed search costs almost nothing.
  findPath(sx, sy, gx, gy, reach) {
    const start = idx(clamp(Math.round(sx), 0, N - 1), clamp(Math.round(sy), 0, N - 1));
    const cgx = clamp(Math.round(gx), 0, N - 1), cgy = clamp(Math.round(gy), 0, N - 1);
    const startComp = this.nearbyComponent(start); if (startComp < 0) return null;
    if (!this.pathScratch) this.pathScratch = { g: new Float32Array(N * N), from: new Int32Array(N * N), stamp: new Uint32Array(N * N), run: 0 };
    const { g, from, stamp } = this.pathScratch, run = ++this.pathScratch.run, reachSq = (reach + 0.5) * (reach + 0.5);
    const open = [], push = (node, f) => { open.push([f, node]); let i = open.length - 1; while (i > 0) { const up = (i - 1) >> 1; if (open[up][0] <= open[i][0]) break; [open[up], open[i]] = [open[i], open[up]]; i = up; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
    const h = (node) => { const x = node % N, y = (node / N) | 0, a = Math.abs(x - cgx), b = Math.abs(y - cgy); return Math.max(a, b) + 0.414 * Math.min(a, b); };
    g[start] = 0; stamp[start] = run; from[start] = -1; push(start, h(start));
    let closest = start, closestH = h(start), expansions = 0;
    while (open.length && expansions++ < 2600) {
      const [, node] = pop(), x = node % N, y = (node / N) | 0;
      const dx = x - cgx, dy = y - cgy;
      if (dx * dx + dy * dy <= reachSq) { closest = node; closestH = 0; break; }
      const here = this.heights[node];
      for (const [a, b, cost] of NEIGHBORS) {
        const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const next = idx(nx, ny); if (!this.passable[next] || this.blocked[next]) continue;
        const tentative = g[node] + cost * (1 + Math.abs(this.heights[next] - here) * 0.9);
        if (stamp[next] === run && tentative >= g[next]) continue;
        stamp[next] = run; g[next] = tentative; from[next] = node; const nh = h(next);
        if (nh < closestH) { closestH = nh; closest = next; }
        push(next, tentative + nh);
      }
    }
    if (closestH > reach + 2.5) return null;
    const path = []; for (let n = closest; n !== -1 && n !== start; n = from[n]) path.push(n);
    path.reverse();
    return path;
  }

  nearbyComponent(node) { return this.component[node] >= 0 ? this.component[node] : (() => { const x = node % N, y = (node / N) | 0; for (const [a, b] of NEIGHBORS) { const nx = x + a, ny = y + b; if (nx >= 0 && ny >= 0 && nx < N && ny < N && this.component[idx(nx, ny)] >= 0) return this.component[idx(nx, ny)]; } return -1; })(); }
}

