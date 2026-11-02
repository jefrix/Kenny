// Arena layouts. Coordinates are metres; the origin is the top-left corner of a 100 x 100 floor.
// Solid: wall (blocks everything), low (blocks wheels and tracks, not shots or radar),
//        crate (breakable), barrel (breakable, explodes), pillar (round wall).
// Floor: mud, lava, pit, spikes (cycle on and off), pad (heals).
const wall = (x, y, w, h) => ({ t: 'wall', x, y, w, h });
const low = (x, y, w, h) => ({ t: 'low', x, y, w, h });
const crate = (x, y, s = 3.2) => ({ t: 'crate', x: x - s / 2, y: y - s / 2, w: s, h: s, hp: 45 });
const barrel = (x, y) => ({ t: 'barrel', cx: x, cy: y, r: 1.3, hp: 18 });
const pillar = (x, y, r = 2.5) => ({ t: 'pillar', cx: x, cy: y, r });
const zone = (t, x, y, w, h) => ({ t, x, y, w, h });

const ring = (cx, cy, r, n, fn) => Array.from({ length: n }, (_, i) => fn(cx + Math.cos((i / n) * 6.2832) * r, cy + Math.sin((i / n) * 6.2832) * r));

export const ARENAS = {
  foundry: {
    name: 'The Foundry',
    desc: 'Lava channels and thick cover. Hover robots cross where others must go around.',
    floor: '#3a3f4a',
    solids: [wall(30, 18, 3, 18), wall(67, 64, 3, 18), wall(18, 62, 18, 3), wall(64, 35, 18, 3), low(44, 26, 12, 1.5), low(44, 72, 12, 1.5), crate(14, 42), crate(86, 58), barrel(50, 14), barrel(50, 86)],
    zones: [zone('lava', 40, 40, 20, 20), zone('lava', 4, 28, 12, 6), zone('lava', 84, 66, 12, 6), zone('pad', 8, 8, 8, 8), zone('pad', 84, 84, 8, 8)],
  },
  junkyard: {
    name: 'Junkyard',
    desc: 'Crowded with crates and fuel barrels. Cover disappears as the fight goes on.',
    floor: '#4a4436',
    solids: [
      ...[[22, 22], [25.2, 22], [22, 25.2], [78, 78], [74.8, 78], [78, 74.8], [22, 78], [25.2, 78], [78, 22], [74.8, 22]].map(([x, y]) => crate(x, y)),
      ...ring(50, 50, 13, 8, (x, y) => crate(x, y)),
      ...ring(50, 50, 28, 10, (x, y) => barrel(x, y)),
      wall(47, 4, 6, 12), wall(47, 84, 6, 12), barrel(50, 50),
    ],
    zones: [zone('pad', 46, 46, 8, 8)],
  },
  bog: {
    name: 'The Bog',
    desc: 'Wide mud flats and low barriers. Wheels struggle here; legs thrive.',
    floor: '#37473a',
    solids: [low(20, 30, 22, 1.5), low(58, 30, 22, 1.5), low(20, 68, 22, 1.5), low(58, 68, 22, 1.5), low(49, 10, 1.5, 18), low(49, 72, 1.5, 18), pillar(30, 50, 3), pillar(70, 50, 3), crate(50, 50, 5)],
    zones: [zone('mud', 10, 34, 80, 32), zone('mud', 30, 4, 12, 22), zone('mud', 58, 74, 12, 22), zone('pad', 6, 86, 8, 8), zone('pad', 86, 6, 8, 8)],
  },
  pillars: {
    name: 'Hall of Pillars',
    desc: 'A grid of columns that blocks radar and shots. Good for ambushes and mortars.',
    floor: '#3d3a52',
    solids: [20, 40, 60, 80].flatMap((x) => [20, 40, 60, 80].map((y) => pillar(x, y, 3))),
    zones: [zone('spikes', 44, 44, 12, 12), zone('spikes', 14, 44, 12, 12), zone('spikes', 74, 44, 12, 12), zone('spikes', 44, 14, 12, 12), zone('spikes', 44, 74, 12, 12)],
  },
  pit: {
    name: 'The Maw',
    desc: 'A huge pit in the middle will swallow anything that cannot fly over it.',
    floor: '#2f4254',
    solids: [wall(10, 48, 12, 4), wall(78, 48, 12, 4), wall(48, 10, 4, 12), wall(48, 78, 4, 12), barrel(26, 26), barrel(74, 26), barrel(26, 74), barrel(74, 74)],
    zones: [zone('pit', 34, 34, 32, 32), zone('pad', 6, 6, 7, 7), zone('pad', 87, 87, 7, 7)],
  },
};

/** Fresh mutable obstacle list for one match. */
export const cloneArena = (id) => {
  const a = ARENAS[id];
  return { id, name: a.name, solids: a.solids.map((s, i) => ({ ...s, id: i, maxHp: s.hp })), zones: a.zones.map((z) => ({ ...z })) };
};
