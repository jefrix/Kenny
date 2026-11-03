// Run with: node tests/sim.test.mjs
import assert from 'node:assert';
import { Battle, DT } from '../arena/js/sim.js';
import { PRESETS } from '../arena/js/presets.js';
import { ARENAS } from '../arena/js/arenas.js';
import { sanitizeBot } from '../arena/js/storage.js';
import { designCost, BUDGET, CHASSIS, DRIVES, ENGINES, ARMORS, RADARS, TURRETS, CPUS, WEAPONS, MODULES } from '../arena/js/parts.js';
import { countBlocks, BLOCKS, newBlock, sanitizeProgram } from '../arena/js/lang.js';

const fighters = PRESETS.filter((p) => !p.dummy);
const run = (bots, arena, seed) => { const b = new Battle(bots.map((bot) => ({ bot })), arena, seed); while (!b.over) b.step(); return b; };

// Stock robots obey their own rules.
for (const p of PRESETS) {
  const clean = sanitizeBot(p);
  assert.ok(designCost(p.design) <= BUDGET, p.name);
  assert.ok(countBlocks(clean.program) <= CPUS[p.design.cpu].blocks, `${p.name} uses ${countBlocks(clean.program)} blocks`);
}

// Every block survives sanitizing, and bad input is rejected.
for (const op of Object.keys(BLOCKS)) if (BLOCKS[op].kind === 'stmt') assert.equal(sanitizeProgram([newBlock(op)]).length, 1);
assert.throws(() => sanitizeProgram([{ op: 'constructor' }]));
assert.throws(() => sanitizeProgram([{ op: 'seen' }]));
assert.throws(() => sanitizeBot({ ...PRESETS[0], design: { ...PRESETS[0].design, weapons: ['rail', 'rail', 'rail'], chassis: 'fortress', engine: 'reactor' } }), /budget/i);

// Determinism.
const a = run([fighters[0], fighters[1]], 'foundry', 7), b = run([fighters[0], fighters[1]], 'foundry', 7);
assert.equal(a.time, b.time); assert.equal(a.bots[0].hp, b.bots[0].hp);

// Starting spots vary by seed, and are always safe and spaced apart, even with a full arena.
const eight = [...fighters, fighters[0]];
for (const id of Object.keys(ARENAS)) {
  const starts = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const m = new Battle(eight.map((bot) => ({ bot })), id, seed);
    starts.add(`${m.bots[0].x},${m.bots[0].h}`);
    m.bots.forEach((r, i) => {
      assert.ok(m.clearSpot(r.x, r.y, r.stats.radius), `${r.name} starts somewhere unsafe in ${id}`);
      for (const o of m.bots.slice(i + 1)) assert.ok(Math.hypot(o.x - r.x, o.y - r.y) > r.stats.radius + o.stats.radius + 4, `robots start too close in ${id}`);
    });
  }
  assert.equal(starts.size, 40, `${id} starts should differ between battles`);
  const same = new Battle(eight.map((bot) => ({ bot })), id, 9), again = new Battle(eight.map((bot) => ({ bot })), id, 9);
  assert.equal(same.bots[3].x, again.bots[3].x);
}

// Each weapon, module and drive runs through a match without throwing.
const shooter = (over) => ({ name: 'T', color: '#ffffff', design: { chassis: 'fortress', drive: 'legs', engine: 'battery', armor: 'none', radar: 'omni', turret: 'fast', cpu: 'abacus', weapons: ['mg'], modules: [], ...over },
  program: [{ op: 'aim', mode: 'at target' }, { op: 'face', how: 'toward', what: 'target' }, { op: 'drive', dir: 'forward', pct: 100 }, { op: 'fire', w: 'all' }, { op: 'module', m: 'boost' }, { op: 'module', m: 'jump jets' }, { op: 'module', m: 'smoke' }, { op: 'toggle', m: 'shield', on: 'on' }, { op: 'toggle', m: 'cloak', on: 'off' }] });
for (const w of Object.keys(WEAPONS)) { const m = run([shooter({ weapons: [w] }), PRESETS.at(-1)], 'bog', 3); assert.ok(m.bots[0].stat.shots > 0 || w === 'tesla' || w === 'saw', `${w} never fired`); assert.ok(m.bots[0].stat.dealt > 0, `${w} dealt no damage`); }
for (const x of Object.keys(MODULES)) run([shooter({ modules: [x] }), fighters[0]], 'foundry', 4);
for (const d of Object.keys(DRIVES)) for (const ar of Object.keys(ARENAS)) { const m = run([shooter({ drive: d }), fighters[2]], ar, 5); assert.ok(m.over); for (const r of m.bots) { assert.ok(isFinite(r.x) && isFinite(r.y), 'position stayed finite'); assert.ok(r.x >= 0 && r.x <= 100 && r.y >= 0 && r.y <= 100, `${d} in ${ar} stayed on the floor`); } }

// Round robin: matches finish, and no stock robot is hopeless or unbeatable.
const wins = Object.fromEntries(fighters.map((f) => [f.name, 0])); let draws = 0, total = 0, time = 0, longest = 0;
for (const arena of Object.keys(ARENAS)) for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) for (let s = 1; s <= 6; s++) {
  const m = run([fighters[i], fighters[j]], arena, s * 13 + i); total++; time += m.time; longest = Math.max(longest, m.time);
  if (m.winner) wins[m.winner.name]++; else draws++;
}
const free = run(fighters, 'junkyard', 2); assert.ok(free.over);
const games = 6 * Object.keys(ARENAS).length * (fighters.length - 1);
console.table(Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, { wins: v, pct: Math.round(v / games * 100) }])));
console.log({ total, draws, avgSeconds: Math.round(time / total), longest: Math.round(longest), freeForAll: Math.round(free.time), dt: DT });
for (const [k, v] of Object.entries(wins)) { assert.ok(v / games > 0.1, `${k} is hopeless`); assert.ok(v / games < 0.9, `${k} is unbeatable`); }
console.log('All sim tests passed.');
