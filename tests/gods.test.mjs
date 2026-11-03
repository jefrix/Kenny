// Run with: node tests/gods.test.mjs
import assert from 'node:assert';
import { World, N, MIRACLES, BUILDINGS, TEMPLE_GUARD } from '../gods/js/sim.js';
import { RivalGod } from '../gods/js/ai.js';

const verbose = process.argv.includes('-v');
const run = (world, seconds) => { const end = world.time + seconds; while (!world.over && world.time < end) world.step(); return world; };
const setup = (seed, difficulties) => { const w = new World({ seed }); difficulties.forEach(([tribe, d]) => w.rivals.push(new RivalGod(tribe, d))); return w; };
const signature = (w) => `${w.time.toFixed(1)}|${w.people.length}|${w.buildings.length}|${w.trees.length}|${w.tribes.map((t) => t.belief.toFixed(3)).join()}|${w.heights.reduce((s, h) => s + h, 0).toFixed(2)}`;

// Every seed makes a fair, playable map.
for (let seed = 1; seed <= 40; seed++) {
  const w = new World({ seed });
  for (const t of w.tribes) {
    assert.ok(t.temple.hp > 0, 'temple'); assert.equal(w.people.filter((p) => p.tribe === t.id).length, 8);
    assert.ok(w.heightAt(t.temple.x, t.temple.y) > 1.5, `seed ${seed}: temple above any flood`);
    assert.ok(w.trees.filter((tr) => Math.hypot(tr.x - t.temple.x, tr.y - t.temple.y) < 25).length >= 8, `seed ${seed}: wood near temple`);
  }
  assert.ok(!w.connected(w.tribes[0].temple.x + 5, w.tribes[0].temple.y, w.tribes[1].temple.x + 5, w.tribes[1].temple.y), `seed ${seed}: peoples start apart, so bridges matter`);
}

// The same seed and actions give the same match, and different seeds do not.
{
  const script = (w) => { for (let i = 0; i < 1200; i++) { if (i === 200) w.act(0, { type: 'miracle', name: 'rain', x: w.tribes[0].temple.x, y: w.tribes[0].temple.y }); w.step(); } return signature(w); };
  const a = script(setup(7, [[1, 'jealous']])), b = script(setup(7, [[1, 'jealous']])), c = script(setup(8, [[1, 'jealous']]));
  assert.equal(a, b); assert.notEqual(a, c);
}

// A left-alone tribe grows into a real settlement, with prayer paying for belief.
{
  const w = new World({ seed: 3 }); const t = w.tribes[0], start = t.belief;
  run(w, 240);
  if (verbose) console.log('growth', t.pop, t.warriors, t.wood, t.belief.toFixed(0), w.buildings.filter((b) => b.tribe === 0).map((b) => b.type).join());
  assert.ok(t.pop >= 12, `population grew, got ${t.pop}`);
  assert.ok(w.buildings.filter((b) => b.tribe === 0).length >= 3, 'built homes');
  assert.ok(t.belief > start, 'belief grew'); assert.ok(t.warriors >= 1, 'trained warriors');
}

// Terrain tools respect influence and temple ground, and cost belief.
{
  const w = new World({ seed: 5 }); const t = w.tribes[0], foe = w.tribes[1], before = t.belief;
  assert.equal(w.act(0, { type: 'raise', x: foe.temple.x, y: foe.temple.y }).ok, false, 'cannot sculpt in enemy land');
  assert.equal(w.act(0, { type: 'lower', x: t.temple.x, y: t.temple.y }).ok, false, 'cannot sculpt temple ground');
  const x = t.temple.x + TEMPLE_GUARD + 3, y = t.temple.y, h = w.heightAt(x, y);
  assert.ok(w.act(0, { type: 'raise', x, y }).ok); assert.ok(w.heightAt(x, y) > h); assert.ok(t.belief < before);
  assert.ok(w.terrainVersion > 0 && w.dirty);
}

// Every miracle can be cast, charges its cost and honours its cooldown.
for (const name of Object.keys(MIRACLES)) {
  const w = new World({ seed: 9 }); const t = w.tribes[0]; t.belief = 400;
  const x = t.temple.x + 6, y = t.temple.y + 6;
  assert.ok(w.act(0, { type: 'miracle', name, x, y }).ok, name);
  assert.equal(t.belief, 400 - MIRACLES[name].cost, name);
  assert.equal(w.act(0, { type: 'miracle', name, x, y }).ok, false, `${name} cooldown`);
  run(w, 8);
}
{
  const w = new World({ seed: 9 }); w.tribes[0].belief = 0;
  assert.equal(w.act(0, { type: 'miracle', name: 'lightning', x: w.tribes[0].temple.x, y: w.tribes[0].temple.y }).ok, false, 'needs belief');
  w.tribes[0].belief = 400;
  assert.equal(w.act(0, { type: 'miracle', name: 'lightning', x: w.tribes[1].temple.x, y: w.tribes[1].temple.y }).ok, false, 'needs influence');
}

// Flood rises and recedes, and drowns those caught low.
{
  const w = new World({ seed: 11 }); w.tribes[0].belief = 400;
  const low = w.tribes[0].temple; const person = w.people.find((p) => p.tribe === 1);
  w.heights.forEach((_, i) => { if (Math.hypot(i % N - person.x, ((i / N) | 0) - person.y) < 4) w.heights[i] = 0.2; }); w.passDirty = true;
  assert.ok(w.act(0, { type: 'miracle', name: 'flood', x: low.x, y: low.y }).ok);
  run(w, 12); assert.ok(w.sea > 0.9, `sea rose to ${w.sea}`);
  run(w, 22); assert.ok(w.sea < 0.1, `sea fell to ${w.sea}`);
  assert.ok(w.tribes[0].temple.hp > 0, 'temples survive flood');
}

// The Hand: grab, carry and throw. Enemies set down at your temple convert.
{
  const w = new World({ seed: 13 }); const me = w.tribes[0], foe = w.tribes[1];
  const mine = w.people.find((p) => p.tribe === 0), theirs = w.people.find((p) => p.tribe === 1);
  assert.equal(w.act(0, { type: 'grab', kind: 'person', id: theirs.id }).ok, false, 'cannot grab outside influence');
  assert.ok(w.act(0, { type: 'grab', kind: 'person', id: mine.id }).ok); assert.equal(mine.state, 'carried');
  assert.equal(w.act(0, { type: 'grab', kind: 'person', id: w.people[1].id }).ok, false, 'one thing at a time');
  w.act(0, { type: 'release', x: me.temple.x + 8, y: me.temple.y, z: 5 }); assert.equal(mine.state, 'air');
  run(w, 2); assert.notEqual(mine.state, 'air'); assert.ok(mine.hp > 0, 'gentle drop survives');
  // Hard throw hits the ground and kills.
  w.act(0, { type: 'grab', kind: 'person', id: mine.id }); w.act(0, { type: 'release', x: me.temple.x + 7, y: me.temple.y, z: 34, vx: 2, vy: 0 });
  run(w, 3); assert.ok(!w.people.includes(mine), 'hard throw kills');
  // Force an enemy into reach, then convert it.
  theirs.role = 'villager'; theirs.x = me.temple.x + 9; theirs.y = me.temple.y; w.refreshInfluence();
  assert.ok(w.act(0, { type: 'grab', kind: 'person', id: theirs.id }).ok);
  w.act(0, { type: 'release', x: me.temple.x + 6, y: me.temple.y, z: 5 });
  run(w, 2); assert.equal(theirs.tribe, 0, 'converted'); assert.ok(me.stats.converted === 1);
  assert.ok(foe.stats.converted === 0);
  // A rock is thrown and returned to the world.
  const rock = w.rocks.find((r) => w.inInfluence(0, r.x, r.y));
  if (rock) { const n = w.rocks.length; assert.ok(w.act(0, { type: 'grab', kind: 'rock', id: rock.id }).ok); assert.equal(w.rocks.length, n - 1); w.act(0, { type: 'release', x: me.temple.x + 8, y: me.temple.y, z: 6 }); run(w, 2); assert.equal(w.rocks.length, n); }
}

// Reshaping land under a home collapses it. Rival and player share the same rule.
{
  const w = new World({ seed: 3 }); run(w, 90);
  const hut = w.buildings.find((b) => b.type !== 'temple' && b.progress >= 1);
  assert.ok(hut, 'has a hut');
  w.tribes[hut.tribe].belief = 400;
  w.reshape(hut.x, hut.y, 2, (v) => v + 3, false);
  assert.ok(!w.buildings.includes(hut), 'undermined building collapsed');
}

// Destroying a temple ends the match in the attacker's favour.
{
  const w = new World({ seed: 2 }); w.hurtBuilding(w.tribes[1].temple, 99999);
  assert.ok(w.over); assert.equal(w.winner, 0);
}

// The rival wins against an idle player at every level, but takes a fair while.
for (const [difficulty, atLeast, atMost] of [['novice', 480, 1500], ['jealous', 300, 1100], ['wrathful', 170, 800]]) {
  const times = [];
  for (const seed of [1, 2, 3, 4]) {
    const w = setup(seed, [[1, difficulty]]); run(w, 1800);
    if (verbose) console.log(difficulty, 'seed', seed, 'over', w.over, 'winner', w.winner, w.time.toFixed(0), w.overReason, 'pops', w.tribes.map((t) => `${t.pop}/${t.warriors}`).join(' '), 'belief', w.tribes[1].belief.toFixed(0), 'miracles', w.tribes[1].stats.miraclesCast);
    assert.ok(w.over, `${difficulty} seed ${seed} finished`); assert.equal(w.winner, 1, `${difficulty} seed ${seed} rival wins`);
    times.push(w.time);
  }
  const mean = times.reduce((a, b) => a + b) / times.length;
  assert.ok(mean >= atLeast && mean <= atMost, `${difficulty} idle-player defeat took ${mean.toFixed(0)}s`);
}

// A rival against a rival: stronger usually beats weaker, and matches end.
{
  let strong = 0, finished = 0;
  for (let seed = 21; seed < 29; seed++) {
    const w = setup(seed, [[0, 'novice'], [1, 'wrathful']]); run(w, 1800);
    if (w.over) finished++; if (w.winner === 1) strong++;
    if (verbose) console.log('duel', seed, w.over, w.winner, w.time.toFixed(0), w.overReason, w.tribes.map((t) => t.pop).join('/'));
  }
  assert.ok(finished >= 7, `duels finished: ${finished}/8`); assert.ok(strong >= 5, `stronger rival won ${strong}/8`);
}

// Nobody ends up in an invalid state during a long, messy fight.
{
  const w = setup(31, [[0, 'wrathful'], [1, 'wrathful']]);
  for (let i = 0; i < 6000 && !w.over; i++) {
    w.step();
    if (i % 40 === 0) for (const p of w.people) { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'finite position'); assert.ok(p.x >= 0 && p.y >= 0 && p.x < N && p.y < N, 'on map'); }
  }
  for (const h of w.heights) assert.ok(Number.isFinite(h));
}
console.log('gods tests ok');
