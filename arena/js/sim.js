// The battle simulation. Deterministic for a given seed and contains no DOM or rendering,
// so it can run in the browser or headless in tests.
import { WEAPONS, computeStats, DRIVES, ENGINES } from './parts.js';
import { runProgram } from './lang.js';
import { cloneArena } from './arenas.js';

export const SIZE = 100, DT = 1 / 30;
const SUDDEN_DEATH = 120, TIME_LIMIT = 210;
const RAD = Math.PI / 180, DEG = 180 / Math.PI, TAU = Math.PI * 2;
const norm = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const stepAngle = (a, target, max) => { const d = norm(target - a); return a + clamp(d, -max, max); };
const mulberry = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0; let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Distance along a ray to a box or circle, or Infinity.
function rayBox(ox, oy, dx, dy, s, maxD) {
  let t0 = 0, t1 = maxD;
  for (const [o, d, lo, hi] of [[ox, dx, s.x, s.x + s.w], [oy, dy, s.y, s.y + s.h]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity;
  }
  return t0;
}
function rayCircle(ox, oy, dx, dy, cx, cy, r, maxD) {
  const fx = ox - cx, fy = oy - cy, b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - c; if (disc < 0 || b > 0) return Infinity;
  const t = -b - Math.sqrt(disc); return t <= maxD ? t : Infinity;
}

export class Battle {
  /** entries: [{ bot, team? }] where bot = { name, color, design, program }. */
  constructor(entries, arenaId, seed = 1) {
    this.rand = mulberry(seed);
    this.arena = cloneArena(arenaId);
    this.time = 0; this.over = false; this.winner = null; this.winnerTeam = null;
    this.events = []; this.shots = []; this.mines = []; this.clouds = [];
    this.ringR = SIZE; // Half-width of the safe square once sudden death starts.
    this.solidsChanged = false;
    const n = entries.length;
    this.bots = entries.map((e, i) => this.spawn(e, i, n));
  }

  spawn({ bot, team }, i, n) {
    const a = (i / n) * TAU + Math.PI * 0.25, s = computeStats(bot.design);
    let x = 50 + Math.cos(a) * 40, y = 50 + Math.sin(a) * 40;
    const d = bot.design;
    const b = {
      id: i, name: bot.name, color: bot.color, design: d, program: bot.program, stats: s,
      team: team ?? i, x, y, z: 0, vx: 0, vy: 0, h: norm(a + Math.PI), turretA: 0, radarA: 0,
      hp: s.hp, energy: s.energy, alive: true, deathTime: 0,
      throttle: 0, steer: 0, strafeDir: 0, faceTarget: null, radarMode: 'sweep', aimMode: 'dead ahead', aimDeg: 0, radarDir: 1,
      firing: [false, false, false],
      weapons: d.weapons.map((w) => ({ id: w, def: WEAPONS[w], cd: 0, ammo: WEAPONS[w].ammo ? Math.floor(WEAPONS[w].ammo * s.ammoMul) : Infinity, beamOn: false })),
      mods: new Set(d.modules), shieldOn: false, cloakOn: false, smoke: 3, boostCd: 0, boostT: 0, jumpCd: 0, jumpT: 0, pdCd: 0,
      burn: 0, slow: 0, lastHit: -99, attackerId: null, attackerA: null, bumpT: -99, sparkT: 0,
      targetId: null, tx: 0, ty: 0, tvx: 0, tvy: 0, seenAt: -99, seesNow: false, pickMode: 'nearest',
      contacts: [], mem: { A: 0, B: 0, C: 0 }, timer0: 0, thinkAcc: this.rand() * 0.1, sayText: '', sayUntil: 0,
      stat: { dealt: 0, taken: 0, kills: 0, shots: 0 }, sense: {}, danger: false,
    };
    return b;
  }

  blockedCircle(x, y, r) { return x < r || y < r || x > SIZE - r || y > SIZE - r; }

  /** Nearest hit of a ray on anything that stops shots or radar. */
  rayWorld(ox, oy, dx, dy, maxD, radar = false) {
    let best = maxD, hit = null;
    for (const s of this.arena.solids) {
      if (s.dead || s.t === 'low') continue;
      const t = s.w !== undefined ? rayBox(ox, oy, dx, dy, s, best) : rayCircle(ox, oy, dx, dy, s.cx, s.cy, s.r, best);
      if (t < best) { best = t; hit = s; }
    }
    if (radar) for (const c of this.clouds) {
      const t = rayCircle(ox, oy, dx, dy, c.x, c.y, c.r, best);
      if (t < best) { best = t; hit = c; }
    }
    return { dist: best, hit };
  }

  wallDistance(b, angle, maxD = 60) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let d = maxD;
    if (dx > 0) d = Math.min(d, (SIZE - b.x) / dx); if (dx < 0) d = Math.min(d, -b.x / dx);
    if (dy > 0) d = Math.min(d, (SIZE - b.y) / dy); if (dy < 0) d = Math.min(d, -b.y / dy);
    d = this.rayWorld(b.x, b.y, dx, dy, d).dist;
    // Low barriers count for robots that cannot cross them, and so do lethal floors.
    const dr = DRIVES[b.design.drive];
    if (!dr.stepsOver) for (const s of this.arena.solids) if (s.t === 'low') d = Math.min(d, rayBox(b.x, b.y, dx, dy, s, d));
    if (!dr.hovers) for (const z of this.arena.zones) if (z.t === 'pit' || z.t === 'lava') d = Math.min(d, rayBox(b.x, b.y, dx, dy, z, d));
    return Math.max(0, d - b.stats.radius);
  }

  say(b, text) { if (this.time < b.sayUntil - 1.5) return; b.sayText = text; b.sayUntil = this.time + 2.5; this.events.push({ e: 'say', id: b.id, text }); }

  // ---- radar ----
  scan(b) {
    const r = b.stats.radar, half = r.cone / 2 * RAD, world = b.h + b.radarA;
    b.contacts = [];
    for (const o of this.bots) {
      if (o === b || !o.alive || o.team === b.team) continue;
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
      if (d > r.range + o.stats.radius) continue;
      if (r.cone < 360 && Math.abs(norm(Math.atan2(dy, dx) - world)) > half + Math.atan2(o.stats.radius, d + 0.01)) continue;
      if (o.cloakOn && d > 8) continue;
      if (this.rayWorld(b.x, b.y, dx / (d || 1), dy / (d || 1), d, true).dist < d - o.stats.radius) continue;
      b.contacts.push({ o, d });
    }
    b.seesNow = b.contacts.length > 0;
    if (!b.seesNow) return;
    let c;
    const by = (f) => b.contacts.reduce((m, x) => (f(x) < f(m) ? x : m));
    switch (b.pickMode) {
      case 'weakest': c = by((x) => x.o.hp); break;
      case 'strongest': c = by((x) => -x.o.hp); break;
      case 'attacker': c = b.contacts.find((x) => x.o.id === b.attackerId) || by((x) => x.d); break;
      default: c = by((x) => x.d);
    }
    b.targetId = c.o.id; b.tx = c.o.x; b.ty = c.o.y; b.tvx = c.o.vx; b.tvy = c.o.vy; b.seenAt = this.time;
  }

  // ---- the interface a robot's program sees ----
  io(b) {
    const sim = this;
    const hasTarget = () => b.targetId != null && b.seenAt > -50;
    const bearing = (x, y) => norm(Math.atan2(y - b.y, x - b.x) - b.h) * DEG;
    const modKey = { 'boost': 'boost', 'jump jets': 'jump', 'smoke': 'smoke' };
    return {
      mem: b.mem, random: () => sim.rand(),
      timer: () => sim.time - b.timer0, resetTimer: () => { b.timer0 = sim.time; },
      seen: () => b.seesNow, known: (s) => hasTarget() && sim.time - b.seenAt <= s,
      onAim: () => {
        if (!hasTarget()) return false;
        const d = Math.hypot(b.tx - b.x, b.ty - b.y);
        return Math.abs(norm(Math.atan2(b.ty - b.y, b.tx - b.x) - (b.h + b.turretA))) < Math.max(3 * RAD, Math.atan2(2, d + 0.01));
      },
      hitWithin: (s) => sim.time - b.lastHit <= s, bumped: () => sim.time - b.bumpT < 0.35,
      weaponReady: (i) => { const w = b.weapons[i]; return !!w && w.cd <= 0 && w.ammo > 0 && b.energy >= w.def.en; },
      moduleReady: (m) => {
        const k = modKey[m]; if (!b.mods.has(k)) return false;
        return k === 'boost' ? b.boostCd <= 0 : k === 'jump' ? b.jumpCd <= 0 : b.smoke > 0;
      },
      inDanger: () => b.danger,
      sense: (s) => {
        switch (s) {
          case 'target distance': return hasTarget() ? Math.hypot(b.tx - b.x, b.ty - b.y) : 999;
          case 'target bearing': return hasTarget() ? bearing(b.tx, b.ty) : 0;
          case 'target health %': { const o = sim.bots[b.targetId]; return hasTarget() && o ? Math.max(0, o.hp) / o.stats.hp * 100 : 0; }
          case 'attacker bearing': return b.attackerA == null ? 0 : norm(b.attackerA - b.h) * DEG;
          case 'my health %': return b.hp / b.stats.hp * 100;
          case 'my energy %': return b.energy / b.stats.energy * 100;
          case 'my speed': return Math.hypot(b.vx, b.vy);
          case 'robots left': return sim.bots.filter((o) => o.alive && o.team !== b.team).length;
          case 'wall ahead': return sim.wallDistance(b, b.h);
          case 'wall behind': return sim.wallDistance(b, b.h + Math.PI);
          case 'wall left': return sim.wallDistance(b, b.h - Math.PI / 2);
          case 'wall right': return sim.wallDistance(b, b.h + Math.PI / 2);
          case 'ammo weapon 1': case 'ammo weapon 2': case 'ammo weapon 3': {
            const w = b.weapons[+s.slice(-1) - 1]; return !w ? 0 : w.ammo === Infinity ? 999 : w.ammo;
          }
          case 'match seconds': return sim.time;
        }
        return 0;
      },
      drive: (p) => { b.throttle = clamp(p, -100, 100) / 100; },
      turn: (p) => { b.steer = clamp(p, -100, 100) / 100; b.faceTarget = null; },
      face: (how, what) => { b.faceTarget = { how, what }; },
      strafe: (d) => { b.strafeDir = d === 'left' ? -1 : d === 'right' ? 1 : 0; },
      pick: (w) => { b.pickMode = w; },
      radar: (m) => { b.radarMode = m; },
      aim: (m) => { b.aimMode = m; },
      aimAngle: (a) => { b.aimMode = 'angle'; b.aimDeg = a; },
      fire: (w) => { if (w === 'all') b.firing = [true, true, true]; else b.firing[+w - 1] = true; },
      useModule: (m) => sim.useModule(b, modKey[m]),
      toggle: (m, on) => { if (b.mods.has(m)) { if (m === 'shield') b.shieldOn = on; else b.cloakOn = on; } },
      say: (t) => sim.say(b, t),
    };
  }

  useModule(b, k) {
    if (!b.mods.has(k)) return;
    if (k === 'boost' && b.boostCd <= 0) { b.boostCd = 8; b.boostT = 2; this.events.push({ e: 'boost', id: b.id }); }
    if (k === 'jump' && b.jumpCd <= 0 && b.jumpT <= 0) { b.jumpCd = 7; b.jumpT = 1.2; const f = Math.max(13, Math.hypot(b.vx, b.vy)); b.vx = Math.cos(b.h) * f; b.vy = Math.sin(b.h) * f; this.events.push({ e: 'jump', id: b.id }); }
    if (k === 'smoke' && b.smoke > 0 && !this.clouds.some((c) => c.owner === b.id && c.t > 6)) { b.smoke--; this.clouds.push({ x: b.x, y: b.y, r: 9, t: 8, owner: b.id }); this.events.push({ e: 'smoke', x: b.x, y: b.y }); }
  }

  // ---- main step ----
  step() {
    if (this.over) return;
    this.events.length = 0;
    this.time += DT;
    if (this.time > SUDDEN_DEATH) this.ringR = Math.max(8, 50 - (this.time - SUDDEN_DEATH) * 0.55);
    for (const b of this.bots) if (b.alive) this.think(b);
    for (const b of this.bots) if (b.alive) this.move(b);
    this.botCollisions();
    for (const b of this.bots) if (b.alive) { this.floorEffects(b); this.weapons(b); }
    this.updateShots(); this.updateMines();
    for (const c of this.clouds) c.t -= DT;
    this.clouds = this.clouds.filter((c) => c.t > 0);
    this.checkEnd();
  }

  think(b) {
    b.thinkAcc += DT;
    const period = 1 / b.stats.cpu.hz;
    if (b.thinkAcc < period) return;
    b.thinkAcc -= period;
    this.scan(b);
    b.firing = [false, false, false];
    runProgram(b.program, this.io(b));
  }

  faceAngle(b) {
    const f = b.faceTarget; if (!f) return null;
    let x, y;
    if (f.what === 'target') { if (b.targetId == null) return null; x = b.tx; y = b.ty; }
    else if (f.what === 'attacker') { if (b.attackerA == null) return null; x = b.x + Math.cos(b.attackerA); y = b.y + Math.sin(b.attackerA); }
    else if (f.what === 'repair pad') {
      let best = Infinity; for (const z of this.arena.zones) if (z.t === 'pad') { const cx = z.x + z.w / 2, cy = z.y + z.h / 2, d = Math.hypot(cx - b.x, cy - b.y); if (d < best) { best = d; x = cx; y = cy; } }
      if (x === undefined) return null;
    } else { x = 50; y = 50; }
    const a = Math.atan2(y - b.y, x - b.x);
    return f.how === 'toward' ? a : a + Math.PI;
  }

  move(b) {
    const s = b.stats, dr = DRIVES[b.design.drive];
    const air = b.jumpT > 0;
    // Steering
    const want = this.faceAngle(b);
    const maxTurn = s.turn * RAD * DT;
    if (want != null) b.h = norm(stepAngle(b.h, want, maxTurn)); else b.h = norm(b.h + b.steer * maxTurn);
    // Throttle
    let mud = 1;
    if (!air) for (const z of this.arena.zones) if (z.t === 'mud' && inZone(b, z)) mud = dr.mud;
    const slow = b.slow > 0 ? 0.65 : 1, boost = b.boostT > 0 ? 1.7 : 1;
    const v = s.speed * mud * slow * boost;
    const sv = dr.strafe ? b.strafeDir * v * 0.75 : 0;
    const fx = Math.cos(b.h), fy = Math.sin(b.h);
    const tv = b.throttle >= 0 ? b.throttle * v : b.throttle * v * 0.65;
    if (!air) {
      const k = 1 - Math.exp(-s.traction * DT);
      b.vx += (fx * tv - fy * sv - b.vx) * k;
      b.vy += (fy * tv + fx * sv - b.vy) * k;
    }
    b.x += b.vx * DT; b.y += b.vy * DT;
    // Timers
    b.boostT = Math.max(0, b.boostT - DT); b.boostCd = Math.max(0, b.boostCd - DT); b.jumpCd = Math.max(0, b.jumpCd - DT); b.pdCd = Math.max(0, b.pdCd - DT);
    b.slow = Math.max(0, b.slow - DT);
    if (air) { b.jumpT -= DT; b.z = Math.sin(clamp(b.jumpT / 1.2, 0, 1) * Math.PI) * 7; if (b.jumpT <= 0) { b.z = 0; b.jumpT = 0; this.events.push({ e: 'land', id: b.id }); } }
    // Energy
    let drain = 0;
    if (b.cloakOn) drain += 11;
    if (b.shieldOn) drain += 4;
    b.energy = clamp(b.energy + (s.regen - drain) * DT, 0, s.energy);
    if (b.energy <= 0) { b.shieldOn = false; b.cloakOn = false; }
    if (b.mods.has('repair') && this.time - b.lastHit > 1) b.hp = Math.min(s.hp, b.hp + 1.5 * DT);
    if (b.burn > 0) { b.burn -= DT; this.damage(b, 5 * DT, 'fire', null, true); }
    // Radar and turret rotation
    this.radarRotate(b); this.turretRotate(b);
    if (!air) this.collideWorld(b); else this.clampBounds(b);
  }

  radarRotate(b) {
    const slew = b.stats.radar.slew * RAD * DT;
    if (b.stats.radar.cone >= 360) { b.radarA = norm(b.radarA + 4 * DT); return; }
    switch (b.radarMode) {
      case 'look ahead': b.radarA = stepAngle(b.radarA, 0, slew); break;
      case 'follow turret': b.radarA = stepAngle(b.radarA, b.turretA, slew); break;
      case 'track target':
        if (b.targetId != null && this.time - b.seenAt < 1.5) { b.radarA = stepAngle(b.radarA, norm(Math.atan2(b.ty - b.y, b.tx - b.x) - b.h), slew); break; }
      // falls through when nothing to track
      default: b.radarA = norm(b.radarA + slew);
    }
  }

  aimWorld(b) {
    switch (b.aimMode) {
      case 'at target': return b.targetId == null ? null : Math.atan2(b.ty - b.y, b.tx - b.x);
      case 'leading target': {
        if (b.targetId == null) return null;
        const w = b.weapons.find((x) => x.def.spd), spd = w ? w.def.spd : 1e4;
        const age = this.time - b.seenAt;
        const px = b.tx + b.tvx * age, py = b.ty + b.tvy * age;
        const t = Math.hypot(px - b.x, py - b.y) / spd;
        return Math.atan2(py + b.tvy * t - b.y, px + b.tvx * t - b.x);
      }
      case 'at attacker': return b.attackerA;
      case 'with radar': return b.h + b.radarA;
      case 'angle': return b.h + b.aimDeg * RAD;
      default: return b.h;
    }
  }

  turretRotate(b) {
    if (!b.stats.turretSlew) { b.turretA = 0; return; }
    const w = this.aimWorld(b);
    if (w != null) b.turretA = stepAngle(b.turretA, norm(w - b.h), b.stats.turretSlew * RAD * DT);
  }

  clampBounds(b) {
    const r = b.stats.radius;
    b.x = clamp(b.x, r, SIZE - r); b.y = clamp(b.y, r, SIZE - r);
  }

  collideWorld(b) {
    const r = b.stats.radius, dr = DRIVES[b.design.drive];
    const before = Math.hypot(b.vx, b.vy);
    let bumped = false;
    if (b.x < r || b.x > SIZE - r) { b.vx *= -0.2; bumped = true; }
    if (b.y < r || b.y > SIZE - r) { b.vy *= -0.2; bumped = true; }
    this.clampBounds(b);
    for (const s of this.arena.solids) {
      if (s.dead) continue;
      if (s.t === 'low' && dr.stepsOver) continue;
      let nx, ny, pen;
      if (s.w !== undefined) {
        const cx = clamp(b.x, s.x, s.x + s.w), cy = clamp(b.y, s.y, s.y + s.h);
        const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d > 1e-6) { nx = dx / d; ny = dy / d; pen = r - d; }
        else { // Centre inside the box: leave by the nearest face.
          const l = b.x - s.x, rt = s.x + s.w - b.x, t = b.y - s.y, bt = s.y + s.h - b.y, m = Math.min(l, rt, t, bt);
          nx = m === l ? -1 : m === rt ? 1 : 0; ny = m === t ? -1 : m === bt ? 1 : 0; pen = m + r;
        }
      } else {
        const dx = b.x - s.cx, dy = b.y - s.cy, d = Math.hypot(dx, dy) || 1e-6;
        if (d >= r + s.r) continue;
        nx = dx / d; ny = dy / d; pen = r + s.r - d;
      }
      b.x += nx * pen; b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= vn * nx * 1.15; b.vy -= vn * ny * 1.15; }
      bumped = true;
      if (s.hp !== undefined) this.hurtSolid(s, (dr.crush ? 40 : before > 8 ? 12 : 3) * DT * 3, b.id);
    }
    if (bumped) { b.bumpT = this.time; if (before > 10) this.damage(b, (before - 10) * 0.25, 'ram', null, true); }
  }

  botCollisions() {
    const L = this.bots;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], c = L[j];
      if (!a.alive || !c.alive || a.jumpT > 0 || c.jumpT > 0) continue;
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1e-6, R = a.stats.radius + c.stats.radius;
      if (d >= R) continue;
      const nx = dx / d, ny = dy / d, ma = a.stats.mass, mc = c.stats.mass, pen = R - d;
      a.x -= nx * pen * mc / (ma + mc); a.y -= ny * pen * mc / (ma + mc);
      c.x += nx * pen * ma / (ma + mc); c.y += ny * pen * ma / (ma + mc);
      const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
      a.bumpT = c.bumpT = this.time;
      if (rel > 0) {
        const imp = rel * 2 * ma * mc / (ma + mc) * 0.6;
        a.vx -= imp / ma * nx; a.vy -= imp / ma * ny; c.vx += imp / mc * nx; c.vy += imp / mc * ny;
        if (rel > 4 && a.team !== c.team && this.time - (a.ramAt || -9) > 0.6 && this.time - (c.ramAt || -9) > 0.6) {
          a.ramAt = c.ramAt = this.time;
          const e = rel * Math.sqrt(ma * mc) * 0.009;
          this.damage(c, e * a.stats.ram, 'ram', a); this.damage(a, e * c.stats.ram * (a.stats.ram > 2 ? 0.4 : 1), 'ram', c);
          this.events.push({ e: 'clang', x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 });
        }
      }
    }
  }

  floorEffects(b) {
    const dr = DRIVES[b.design.drive]; b.danger = false;
    const safe = this.time > SUDDEN_DEATH && (Math.abs(b.x - 50) > this.ringR || Math.abs(b.y - 50) > this.ringR);
    if (safe) { this.damage(b, 9 * DT, 'fire', null, true); b.danger = true; }
    if (b.jumpT > 0) return;
    for (const z of this.arena.zones) {
      if (!inZone(b, z)) continue;
      if (z.t === 'pad') { if (this.time - b.lastHit > 0.5) b.hp = Math.min(b.stats.hp, b.hp + 4 * DT); continue; }
      if (dr.hovers) continue;
      if (z.t === 'lava') { this.damage(b, 14 * DT, 'fire', null, true); b.burn = Math.max(b.burn, 1); b.danger = true; }
      if (z.t === 'spikes' && this.spikesUp()) { this.damage(b, 16 * DT, 'kinetic', null, true); b.danger = true; }
      if (z.t === 'pit') {
        const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
        if (Math.abs(b.x - cx) < z.w / 2 - 1 && Math.abs(b.y - cy) < z.h / 2 - 1) { this.events.push({ e: 'fall', id: b.id }); this.damage(b, 1e6, 'pit', null, true); return; }
        b.danger = true;
      }
    }
  }
  spikesUp() { return this.time % 6 > 3.5; }

  // ---- weapons ----
  weapons(b) {
    b.weapons.forEach((w, i) => {
      w.cd -= DT; w.beamOn = false;
      if (!b.firing[i] || w.cd > 0 || w.ammo <= 0 || b.energy < w.def.en) return;
      w.cd = w.def.cd; b.energy -= w.def.en; if (w.ammo !== Infinity) w.ammo--;
      b.stat.shots++;
      this.fire(b, w, i);
    });
  }

  muzzle(b, i) {
    const a = (b.weapons[i].def.fixed ? b.h : b.h + b.turretA);
    const side = (i - (b.weapons.length - 1) / 2) * 0.7;
    return { a, x: b.x + Math.cos(a) * (b.stats.radius + 0.4) - Math.sin(a) * side, y: b.y + Math.sin(a) * (b.stats.radius + 0.4) + Math.cos(a) * side };
  }

  fire(b, w, i) {
    const d = w.def, m = this.muzzle(b, i);
    const spread = () => (this.rand() - 0.5) * 2 * d.spread * RAD * b.stats.spreadMul;
    switch (d.kind) {
      case 'bullet': {
        const n = d.pellets || 1;
        for (let k = 0; k < n; k++) { const a = m.a + spread(); this.shots.push({ k: 'bullet', w: d.id ?? w.id, x: m.x, y: m.y, vx: Math.cos(a) * d.spd + b.vx, vy: Math.sin(a) * d.spd + b.vy, life: d.range / d.spd, dmg: d.dmg, type: d.type, owner: b }); }
        this.events.push({ e: 'shot', w: w.id, x: m.x, y: m.y, a: m.a, id: b.id }); break;
      }
      case 'rocket': case 'homing': {
        const a = m.a + spread();
        this.shots.push({ k: d.kind, w: w.id, x: m.x, y: m.y, a, spd: d.spd, life: d.range / d.spd, dmg: d.dmg, blast: d.blast, type: d.type, owner: b, turn: d.turn, targetId: b.seesNow ? b.targetId : null });
        this.events.push({ e: 'shot', w: w.id, x: m.x, y: m.y, a: m.a, id: b.id }); break;
      }
      case 'mortar': {
        const tx = b.targetId != null && this.time - b.seenAt < 4 ? b.tx : m.x + Math.cos(m.a) * 30;
        const ty = b.targetId != null && this.time - b.seenAt < 4 ? b.ty : m.y + Math.sin(m.a) * 30;
        const dist = clamp(Math.hypot(tx - m.x, ty - m.y), 6, d.range), a = m.a + spread();
        const life = dist / d.spd;
        this.shots.push({ k: 'mortar', w: w.id, x: m.x, y: m.y, vx: Math.cos(a) * d.spd, vy: Math.sin(a) * d.spd, life, life0: life, dmg: d.dmg, blast: d.blast, type: d.type, owner: b, arc: Math.min(22, dist * 0.5) });
        this.events.push({ e: 'shot', w: w.id, x: m.x, y: m.y, a: m.a, id: b.id }); break;
      }
      case 'beam': this.fireBeam(b, w, m, spread()); break;
      case 'flame': this.fireFlame(b, w, m); break;
      case 'tesla': this.fireTesla(b, w, m); break;
      case 'saw': this.fireSaw(b, w, m); break;
      case 'mine': {
        const a = b.h + Math.PI;
        this.mines.push({ x: b.x + Math.cos(a) * (b.stats.radius + 1.4), y: b.y + Math.sin(a) * (b.stats.radius + 1.4), arm: 0.8, owner: b, dmg: d.dmg, blast: d.blast, id: this.time + Math.random() });
        this.events.push({ e: 'mine', x: b.x, y: b.y }); break;
      }
    }
  }

  fireBeam(b, w, m, off) {
    const d = w.def, a = m.a + off, dx = Math.cos(a), dy = Math.sin(a);
    const wh = this.rayWorld(m.x, m.y, dx, dy, d.range);
    let end = wh.dist; const hits = [];
    for (const o of this.bots) {
      if (o === b || !o.alive || o.team === b.team || o.jumpT > 0.2 && o.z > 4) continue;
      const t = rayCircle(m.x, m.y, dx, dy, o.x, o.y, o.stats.radius, end);
      if (t < end) hits.push({ o, t });
    }
    hits.sort((p, q) => p.t - q.t);
    if (d.pierce) hits.forEach((h) => this.damage(h.o, d.dmg, d.type, b));
    else if (hits.length) { end = hits[0].t; this.damage(hits[0].o, d.dmg, d.type, b); }
    if (wh.hit && wh.hit.hp !== undefined && (d.pierce || end === wh.dist)) this.hurtSolid(wh.hit, d.dmg, b.id);
    w.beamOn = true;
    this.events.push({ e: 'beam', w: w.id, x: m.x, y: m.y, x2: m.x + dx * end, y2: m.y + dy * end, id: b.id, hit: hits.length > 0 });
  }

  fireFlame(b, w, m) {
    const d = w.def;
    for (const o of this.bots) {
      if (o === b || !o.alive || o.team === b.team || o.z > 3) continue;
      const dx = o.x - m.x, dy = o.y - m.y, dist = Math.hypot(dx, dy);
      if (dist > d.range + o.stats.radius) continue;
      if (Math.abs(norm(Math.atan2(dy, dx) - m.a)) > d.spread * RAD + Math.atan2(o.stats.radius, dist + 0.01)) continue;
      if (this.rayWorld(m.x, m.y, dx / (dist || 1), dy / (dist || 1), dist).dist < dist - o.stats.radius) continue;
      this.damage(o, d.dmg, d.type, b); o.burn = Math.max(o.burn, o.stats.resist.fire ? d.burn * 0.5 : d.burn);
    }
    const wh = this.rayWorld(m.x, m.y, Math.cos(m.a), Math.sin(m.a), d.range);
    if (wh.hit && wh.hit.hp !== undefined) this.hurtSolid(wh.hit, d.dmg, b.id);
    this.events.push({ e: 'flame', x: m.x, y: m.y, a: m.a, id: b.id, range: d.range });
  }

  fireTesla(b, w, m) {
    const d = w.def;
    let from = { x: m.x, y: m.y }; const hit = new Set();
    for (let k = 0; k < 2; k++) {
      let best = null, bd = k === 0 ? d.range : d.range * 0.8;
      for (const o of this.bots) {
        if (o === b || !o.alive || o.team === b.team || hit.has(o)) continue;
        const dist = Math.hypot(o.x - from.x, o.y - from.y);
        if (dist >= bd) continue;
        const dx = (o.x - from.x) / (dist || 1), dy = (o.y - from.y) / (dist || 1);
        if (this.rayWorld(from.x, from.y, dx, dy, dist).dist < dist - o.stats.radius) continue;
        best = o; bd = dist;
      }
      if (!best) break;
      hit.add(best); this.damage(best, d.dmg * (k ? 0.6 : 1), d.type, b); best.slow = 1;
      this.events.push({ e: 'arc', x: from.x, y: from.y, x2: best.x, y2: best.y });
      from = best;
    }
    if (!hit.size) { b.energy += d.en; w.cd = 0.1; } // A coil with nothing in range does not discharge.
  }

  fireSaw(b, w, m) {
    const d = w.def; let hitAny = false;
    for (const o of this.bots) {
      if (o === b || !o.alive || o.team === b.team || o.z > 3) continue;
      if (Math.hypot(o.x - m.x, o.y - m.y) < d.range + o.stats.radius) { this.damage(o, d.dmg, d.type, b); hitAny = true; }
    }
    for (const s of this.arena.solids) if (!s.dead && s.hp !== undefined) {
      const cx = s.cx ?? clamp(m.x, s.x, s.x + s.w), cy = s.cy ?? clamp(m.y, s.y, s.y + s.h);
      if (Math.hypot(cx - m.x, cy - m.y) < d.range + (s.r || 0)) { this.hurtSolid(s, d.dmg, b.id); hitAny = true; }
    }
    if (hitAny) this.events.push({ e: 'saw', x: m.x, y: m.y });
  }

  // ---- projectiles ----
  updateShots() {
    const keep = [];
    for (const p of this.shots) {
      p.life -= DT;
      if (p.k === 'homing') {
        const o = p.targetId != null ? this.bots[p.targetId] : null;
        if (o && o.alive && !o.cloakOn) p.a = stepAngle(p.a, Math.atan2(o.y - p.y, o.x - p.x), p.turn * RAD * DT);
      }
      if (p.k === 'rocket' || p.k === 'homing') { p.vx = Math.cos(p.a) * p.spd; p.vy = Math.sin(p.a) * p.spd; }
      const sx = p.vx * DT, sy = p.vy * DT, len = Math.hypot(sx, sy) || 1e-6, dx = sx / len, dy = sy / len;

      if (p.k === 'mortar') {
        p.x += sx; p.y += sy;
        const f = 1 - p.life / p.life0; p.z = Math.sin(f * Math.PI) * p.arc + 1;
        if (p.life <= 0) this.explode(p.x, p.y, p.blast, p.dmg, p.type, p.owner);
        else keep.push(p);
        continue;
      }
      // Point defense
      if (p.k !== 'bullet') {
        let shot = false;
        for (const o of this.bots) {
          if (!o.alive || o === p.owner || o.team === p.owner.team || !o.mods.has('pointdef') || o.pdCd > 0) continue;
          if (Math.hypot(o.x - p.x, o.y - p.y) < 14) { o.pdCd = 1.4; this.events.push({ e: 'arc', x: o.x, y: o.y, x2: p.x, y2: p.y, pd: true }); this.events.push({ e: 'boom', x: p.x, y: p.y, r: 2 }); shot = true; break; }
        }
        if (shot) continue;
      }
      // World and robots, along the swept segment.
      const wh = this.rayWorld(p.x, p.y, dx, dy, len);
      let end = wh.dist, target = null;
      for (const o of this.bots) {
        if (o === p.owner || !o.alive || o.team === p.owner.team || o.z > 4) continue;
        const t = rayCircle(p.x, p.y, dx, dy, o.x, o.y, o.stats.radius, end);
        if (t < end) { end = t; target = o; }
      }
      const out = p.x < 0 || p.y < 0 || p.x > SIZE || p.y > SIZE;
      if (target || wh.hit || out || p.life <= 0) {
        p.x += dx * end; p.y += dy * end;
        if (p.blast) this.explode(p.x, p.y, p.blast, p.dmg, p.type, p.owner, target);
        else {
          if (target) this.damage(target, p.dmg, p.type, p.owner);
          else if (wh.hit && wh.hit.hp !== undefined) this.hurtSolid(wh.hit, p.dmg, p.owner.id);
          if (target || wh.hit) this.events.push({ e: 'spark', x: p.x, y: p.y, big: p.dmg > 8 });
        }
        continue;
      }
      p.x += sx; p.y += sy; keep.push(p);
    }
    this.shots = keep;
  }

  updateMines() {
    const keep = [];
    for (const m of this.mines) {
      m.arm -= DT;
      let boom = false;
      if (m.arm <= 0) for (const o of this.bots) if (o.alive && o.team !== m.owner.team && o.z < 2 && !DRIVES[o.design.drive].hovers && Math.hypot(o.x - m.x, o.y - m.y) < o.stats.radius + 1.2) boom = true;
      if (boom) this.explode(m.x, m.y, m.blast, m.dmg, 'explosive', m.owner); else keep.push(m);
    }
    this.mines = keep;
  }

  explode(x, y, r, dmg, type, owner, direct = null) {
    this.events.push({ e: 'boom', x, y, r });
    for (const o of this.bots) {
      if (!o.alive || (owner && o.team === owner.team && o !== owner) || o.z > 5) continue;
      if (owner && o === owner) continue; // Your own blasts don't hurt you.
      const d = Math.hypot(o.x - x, o.y - y) - o.stats.radius;
      if (o !== direct && d > r) continue;
      const f = o === direct ? 1 : clamp(1 - d / r, 0.25, 1);
      this.damage(o, dmg * f, type, owner);
      const push = 7 * f, k = Math.hypot(o.x - x, o.y - y) || 1; o.vx += (o.x - x) / k * push; o.vy += (o.y - y) / k * push;
    }
    for (const s of this.arena.solids) if (!s.dead && s.hp !== undefined) {
      const cx = s.cx ?? clamp(x, s.x, s.x + s.w), cy = s.cy ?? clamp(y, s.y, s.y + s.h);
      if (Math.hypot(cx - x, cy - y) - (s.r || 0) < r) this.hurtSolid(s, dmg, owner ? owner.id : null);
    }
  }

  hurtSolid(s, dmg, ownerId) {
    if (s.dead) return;
    s.hp -= dmg;
    if (s.hp > 0) return;
    s.dead = true; this.solidsChanged = true;
    this.events.push({ e: 'break', id: s.id, x: s.cx ?? s.x + s.w / 2, y: s.cy ?? s.y + s.h / 2, t: s.t });
    if (s.t === 'barrel') this.explode(s.cx, s.cy, 9, 22, 'explosive', null);
  }

  damage(o, amt, type, src, env = false) {
    if (!o.alive || amt <= 0) return;
    let d = amt * (1 - (o.stats.resist[type] || 0));
    if (o.shieldOn && type !== 'pit') {
      const absorbed = d * 0.7, need = absorbed * 0.6;
      if (o.energy >= need) { o.energy -= need; d -= absorbed; this.events.push({ e: 'shield', id: o.id }); }
      else o.shieldOn = false;
    }
    o.hp -= d; o.stat.taken += d;
    if (!env || src) {
      o.lastHit = this.time;
      if (src) {
        src.stat.dealt += d; o.attackerId = src.id; o.attackerA = Math.atan2(src.y - o.y, src.x - o.x);
      }
    }
    if (o.hp <= 0) this.kill(o, src);
  }

  kill(o, src) {
    o.alive = false; o.hp = 0; o.deathTime = this.time;
    if (src && src !== o) src.stat.kills++;
    this.events.push({ e: 'die', id: o.id, x: o.x, y: o.y, by: src ? src.id : null });
    if (ENGINES[o.design.engine].explodes) this.explode(o.x, o.y, 13, 55, 'explosive', null);
    else this.events.push({ e: 'boom', x: o.x, y: o.y, r: 5 });
  }

  checkEnd() {
    const alive = this.bots.filter((b) => b.alive);
    const teams = new Set(alive.map((b) => b.team));
    if (teams.size <= 1 || this.time >= TIME_LIMIT) {
      this.over = true;
      if (teams.size === 1) { this.winnerTeam = alive[0].team; this.winner = alive.length === 1 ? alive[0] : alive.reduce((m, b) => (b.stat.dealt > m.stat.dealt ? b : m)); }
      else if (alive.length) { const w = alive.reduce((m, b) => (b.hp / b.stats.hp > m.hp / m.stats.hp ? b : m)); this.winner = w; this.winnerTeam = w.team; }
    }
  }
}

function inZone(b, z) { return b.x > z.x && b.x < z.x + z.w && b.y > z.y && b.y < z.y + z.h; }
