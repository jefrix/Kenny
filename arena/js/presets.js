// Stock robots that ship with the game. They double as worked examples of the block language.
const n = (v) => v;
const sense = (s) => ({ op: 'sense', s });
const cmp = (x, rel, y) => ({ op: 'cmp', x, rel, y });
const seen = { op: 'seen' };
const If = (c, then, els) => (els ? { op: 'ifelse', c, then, else: els } : { op: 'if', c, then });
const and = (x, y) => ({ op: 'and', x, y });
const or = (x, y) => ({ op: 'or', x, y });
const not = (x) => ({ op: 'not', x });
const known = (s) => ({ op: 'known', s });
const onaim = { op: 'onaim' };
const drive = (pct = 100, dir = 'forward') => ({ op: 'drive', dir, pct });
const turn = (dir, pct = 100) => ({ op: 'turn', dir, pct });
const face = (what, how = 'toward') => ({ op: 'face', how, what });
const radar = (mode) => ({ op: 'radar', mode });
const aim = (mode) => ({ op: 'aim', mode });
const fire = (w = 'all') => ({ op: 'fire', w });
const say = (text) => ({ op: 'say', text });
const hit = (s) => ({ op: 'hit', s });
const use = (m) => ({ op: 'module', m });
const rdy = (m) => ({ op: 'modrdy', m });
const shield = (on) => ({ op: 'toggle', m: 'shield', on });

// Keep clear of walls and hazards. This ends the cycle early while dodging,
// so anything that must always run (like firing) goes above it.
const avoid = [
  If(or({ op: 'bump' }, cmp(sense('wall ahead'), '<', 7)), [
    If(cmp(sense('wall left'), '>', sense('wall right')), [turn('left')], [turn('right')]),
    drive(60),
    { op: 'stop' },
  ]),
  { op: 'nosteer' },
];

export const PRESETS = [
  {
    name: 'Rustbucket', color: '#F2711C', by: 'Kenny', blurb: 'Drives at you with a machine gun. A good first opponent.',
    design: { chassis: 'brawler', drive: 'wheels', engine: 'diesel', armor: 'plate', radar: 'dish', turret: 'swivel', cpu: 'cog8', weapons: ['mg'], modules: [] },
    program: [
      radar('track target'), aim('at target'),
      If(and(seen, onaim), [fire()]),
      ...avoid,
      If(known(2), [face('target'), drive(80)], [drive(70)]),
    ],
  },
  {
    name: 'Longshot', color: '#1F7FE0', by: 'Kenny', blurb: 'Keeps its distance and snipes with a railgun.',
    design: { chassis: 'scout', drive: 'hover', engine: 'fuelcell', armor: 'none', radar: 'needle', turret: 'fast', cpu: 'cog8', weapons: ['rail'], modules: [] },
    program: [
      radar('track target'), aim('leading target'),
      If(and(seen, onaim), [fire(), say('Lined up.')]),
      ...avoid,
      If(and(known(3), cmp(sense('target distance'), '<', 40)), [face('target', 'away from'), drive(100)], [
        If(known(3), [face('target'), drive(30)], [drive(70), turn('right', 25)]),
      ]),
    ],
  },
  {
    name: 'Crusher', color: '#39414F', by: 'Kenny', blurb: 'Armored tracks and a buzz saw. Rams first, then chews.',
    design: { chassis: 'wedge', drive: 'tracks', engine: 'turbine', armor: 'composite', radar: 'fan', turret: 'none', cpu: 'cog8', weapons: ['saw'], modules: ['boost'] },
    program: [
      radar('track target'),
      If(known(4), [face('target'), drive(100), If(cmp(sense('target distance'), '<', 22), [use('boost')]), fire()], [
        ...avoid.slice(0, 1), drive(70), turn('right', 15),
      ]),
    ],
  },
  {
    name: 'Skitter', color: '#1FA35B', by: 'Kenny', blurb: 'Strafes around you on legs and leaves laser burns.',
    design: { chassis: 'brawler', drive: 'legs', engine: 'fuelcell', armor: 'mirror', radar: 'omni', turret: 'swivel', cpu: 'cog8', weapons: ['laser'], modules: [] },
    program: [
      aim('at target'),
      If(and(seen, onaim), [fire()]),
      ...avoid,
      If(known(2), [
        face('target'),
        If(cmp(sense('target distance'), '>', 28), [drive(100)], [drive(0)]),
        If(cmp({ op: 'var', v: 'A' }, '>', 30), [{ op: 'strafe', dir: 'left' }], [{ op: 'strafe', dir: 'right' }]),
        { op: 'add', v: 'A', x: 1 },
        If(cmp({ op: 'var', v: 'A' }, '>', 60), [{ op: 'set', v: 'A', x: 0 }]),
      ], [drive(80)]),
    ],
  },
  {
    name: 'Grumbler', color: '#8A3FD1', by: 'Kenny', blurb: 'Slow artillery. Lobs plasma over walls and hides behind its shield.',
    design: { chassis: 'brawler', drive: 'tracks', engine: 'fuelcell', armor: 'reactive', radar: 'dish', turret: 'swivel', cpu: 'cog8', weapons: ['mortar'], modules: ['shield'] },
    program: [
      radar('sweep'), aim('at target'),
      If(known(4), [fire()]),
      If(hit(1), [shield('on')], [shield('off')]),
      ...avoid,
      drive(40),
    ],
  },
  {
    name: 'Hornet', color: '#FFC914', by: 'Kenny', blurb: 'Fast wheels and homing missiles, with a sting if you chase it.',
    design: { chassis: 'scout', drive: 'wheels', engine: 'diesel', armor: 'composite', radar: 'fan', turret: 'swivel', cpu: 'cog8', weapons: ['homing'], modules: ['jump'] },
    program: [
      radar('track target'), aim('at target'),
      If(seen, [fire()]),
      If(and(hit(1), rdy('jump jets')), [use('jump jets')]),
      ...avoid,
      If(known(3), [
        If(cmp(sense('target distance'), '<', 25), [face('target', 'away from')], [face('target')]),
      ]),
      drive(100),
    ],
  },
  {
    name: 'The Warden', color: '#E5352B', by: 'Kenny', blurb: 'A fortress with an autocannon and rockets. Bring friends.',
    design: { chassis: 'fortress', drive: 'tracks', engine: 'diesel', armor: 'none', radar: 'dish', turret: 'swivel', cpu: 'cog8', weapons: ['cannon', 'rocket'], modules: [] },
    program: [
      radar('track target'), aim('leading target'),
      If(and(seen, onaim), [fire('1'), If(cmp(sense('target distance'), '>', 12), [fire('2')])]),
      ...avoid,
      If(known(3), [face('target'), If(cmp(sense('target distance'), '>', 25), [drive(100)], [drive(0)])], [drive(70)]),
    ],
  },
  {
    name: 'Target dummy', color: '#E9EDF7', by: 'Kenny', dummy: true, blurb: 'Drives in slow circles and never fires back. Use it to test your robot.',
    design: { chassis: 'brawler', drive: 'wheels', engine: 'diesel', armor: 'none', radar: 'whisker', turret: 'none', cpu: 'cog8', weapons: ['mg'], modules: [] },
    program: [drive(35), ...avoid.slice(0, 1), turn('right', 20)],
  },
].map((p) => ({ ...p, id: 'stock-' + p.name.toLowerCase().replace(/\W+/g, '-'), stock: true }));

export const starterProgram = () => JSON.parse(JSON.stringify(PRESETS[0].program));
