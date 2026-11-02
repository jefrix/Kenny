// Parts catalog, budget rules and derived robot stats. No DOM in this file.
export const BUDGET = 1000;

export const CHASSIS = {
  scout:    { name: 'Scout frame',    cost: 70,  mass: 22, hp: 70,  hardpoints: 1, modules: 1, radius: 1.5, ram: 0.8, desc: 'Small target, one weapon.' },
  wedge:    { name: 'Wedge frame',    cost: 120, mass: 38, hp: 95,  hardpoints: 1, modules: 2, radius: 1.8, ram: 1.7, desc: 'Sloped nose. Ramming hurts them far more than you.' },
  brawler:  { name: 'Brawler frame',  cost: 130, mass: 42, hp: 110, hardpoints: 2, modules: 1, radius: 2.0, ram: 1.0, desc: 'The balanced choice.' },
  fortress: { name: 'Fortress frame', cost: 230, mass: 75, hp: 165, hardpoints: 3, modules: 2, radius: 2.5, ram: 1.3, desc: 'Three weapons and two modules, if you can move it.' },
};

// traction: how quickly velocity follows the throttle. ideal: power-to-mass at which top speed is reached.
export const DRIVES = {
  wheels: { name: 'Wheels', cost: 40,  mass: 6,  speed: 15, turn: 150, traction: 5,   ideal: 1.0, mud: 0.35, strafe: false, stepsOver: false, hovers: false, desc: 'Fast and cheap. Bogs down in mud.' },
  tracks: { name: 'Tracks', cost: 90,  mass: 16, speed: 10, turn: 130, traction: 11,  ideal: 0.7, mud: 0.75, strafe: false, stepsOver: false, hovers: false, crush: true, desc: 'Handles heavy loads and smashes crates.' },
  legs:   { name: 'Legs',   cost: 130, mass: 14, speed: 9,  turn: 210, traction: 14,  ideal: 0.8, mud: 0.8,  strafe: true,  stepsOver: true,  hovers: false, desc: 'Steps over low barriers and can strafe.' },
  hover:  { name: 'Hover',  cost: 170, mass: 8,  speed: 17, turn: 170, traction: 1.8, ideal: 1.3, mud: 1,    strafe: true,  stepsOver: true,  hovers: true,  desc: 'Glides over pits, lava and mud, but drifts.' },
};

export const ENGINES = {
  battery: { name: 'Battery pack',  cost: 40,  mass: 6,  power: 30,  energy: 60,  regen: 7,  desc: 'Light and weak.' },
  diesel:  { name: 'Diesel',        cost: 80,  mass: 16, power: 70,  energy: 50,  regen: 6,  desc: 'Plenty of push, little electricity.' },
  fuelcell:{ name: 'Fuel cell',     cost: 110, mass: 12, power: 55,  energy: 110, regen: 15, desc: 'Built for lasers and shields.' },
  turbine: { name: 'Gas turbine',   cost: 150, mass: 18, power: 115, energy: 80,  regen: 11, desc: 'Serious speed.' },
  reactor: { name: 'Micro reactor', cost: 240, mass: 28, power: 150, energy: 170, regen: 24, explodes: true, desc: 'Vast power. Detonates when destroyed.' },
};

// resist: fraction of damage removed, per damage type.
export const ARMORS = {
  none:      { name: 'No armor',        cost: 0,   mass: 0,  hp: 0,  resist: {}, desc: 'Every kilo saved goes to speed.' },
  plate:     { name: 'Steel plate',     cost: 60,  mass: 16, hp: 45, resist: { kinetic: 0.1 }, desc: 'Heavy, cheap hit points.' },
  composite: { name: 'Composite',       cost: 130, mass: 12, hp: 50, resist: { kinetic: 0.3, ram: 0.2 }, desc: 'Shrugs off bullets.' },
  reactive:  { name: 'Reactive bricks', cost: 130, mass: 18, hp: 45, resist: { explosive: 0.5 }, desc: 'Halves rockets and blasts.' },
  mirror:    { name: 'Mirror coat',     cost: 130, mass: 6,  hp: 25, resist: { energy: 0.55, fire: 0.3 }, desc: 'Scatters lasers, plasma and flame.' },
};

// range in metres, cone in degrees, slew in degrees per second.
export const RADARS = {
  whisker: { name: 'Whisker ring',  cost: 30,  mass: 1, range: 16, cone: 360, slew: 0,   desc: 'Sees all around, but only up close.' },
  dish:    { name: 'Dish scanner',  cost: 60,  mass: 3, range: 40, cone: 50,  slew: 180, desc: 'A solid all-rounder.' },
  needle:  { name: 'Needle lance',  cost: 90,  mass: 2, range: 90, cone: 14,  slew: 300, desc: 'Sees across the arena through a narrow slit.' },
  fan:     { name: 'Fan array',     cost: 110, mass: 4, range: 32, cone: 130, slew: 120, desc: 'A wide view at medium range.' },
  omni:    { name: 'Omni mast',     cost: 170, mass: 6, range: 38, cone: 360, slew: 0,   desc: 'Medium range in every direction.' },
  phased:  { name: 'Phased array',  cost: 240, mass: 7, range: 80, cone: 110, slew: 240, desc: 'Long and wide. The best money can buy.' },
};

export const TURRETS = {
  none:  { name: 'Fixed mounts',  cost: 0,  mass: 0,  slew: 0,   desc: 'Weapons point where the hull points.' },
  swivel:{ name: 'Swivel turret', cost: 50, mass: 6,  slew: 110, desc: 'Aims independently of the hull.' },
  fast:  { name: 'Fast turret',   cost: 110,mass: 8,  slew: 260, desc: 'Snaps onto targets.' },
};

// How many blocks your program may use, and how many times a second it runs.
export const CPUS = {
  abacus: { name: 'Abacus chip', cost: 15,  mass: 0, blocks: 15,  hz: 4,  desc: '15 blocks, runs 4 times a second.' },
  cog8:   { name: 'Cog-8',       cost: 40,  mass: 0, blocks: 40,  hz: 8,  desc: '40 blocks, runs 8 times a second.' },
  quad:   { name: 'Quad core',   cost: 80,  mass: 0, blocks: 90,  hz: 12, desc: '90 blocks, runs 12 times a second.' },
  neuron: { name: 'Neuron slab', cost: 140, mass: 0, blocks: 200, hz: 20, desc: '200 blocks, runs 20 times a second.' },
};

// dmg per shot, cd = seconds between shots, spd = projectile m/s, en = energy per shot.
export const WEAPONS = {
  mg:      { name: 'Machine gun',   cost: 60,  mass: 5,  kind: 'bullet', type: 'kinetic',   dmg: 2.4, cd: 0.1,  spd: 70, range: 45, spread: 3.5, ammo: 0,  en: 0,  desc: 'Steady, reliable fire.' },
  cannon:  { name: 'Autocannon',    cost: 110, mass: 12, kind: 'bullet', type: 'kinetic',   dmg: 12,  cd: 0.6,  spd: 80, range: 65, spread: 1.2, ammo: 0,  en: 0,  desc: 'Heavy shells at long range.' },
  scatter: { name: 'Scattergun',    cost: 80,  mass: 8,  kind: 'bullet', type: 'kinetic',   dmg: 2.5, cd: 0.9,  spd: 60, range: 20, spread: 14,  pellets: 9, ammo: 0, en: 0, desc: 'Devastating up close.' },
  laser:   { name: 'Laser',         cost: 130, mass: 6,  kind: 'beam',   type: 'energy',    dmg: 1.1, cd: 0.05, range: 55, spread: 0, ammo: 0, en: 0.75, desc: 'Instant hits. Drinks energy.' },
  rail:    { name: 'Railgun',       cost: 210, mass: 16, kind: 'beam',   type: 'kinetic',   dmg: 38,  cd: 3,    range: 110, spread: 0.2, ammo: 0, en: 30, pierce: true, desc: 'Punches through every robot in line.' },
  rocket:  { name: 'Rocket pod',    cost: 120, mass: 10, kind: 'rocket', type: 'explosive', dmg: 22,  cd: 1.3,  spd: 34, range: 70, spread: 2.5, blast: 6, ammo: 16, en: 0, desc: 'Splash damage. 16 rockets.' },
  homing:  { name: 'Homing missile',cost: 180, mass: 10, kind: 'homing', type: 'explosive', dmg: 26,  cd: 2.4,  spd: 26, range: 90, spread: 8, blast: 4, turn: 150, ammo: 10, en: 0, desc: 'Chases what your radar sees. 10 missiles.' },
  mortar:  { name: 'Plasma mortar', cost: 150, mass: 13, kind: 'mortar', type: 'energy',    dmg: 26,  cd: 2.6,  spd: 30, range: 70, spread: 2, blast: 7, ammo: 0, en: 14, desc: 'Lobs shots over walls.' },
  flame:   { name: 'Flamethrower',  cost: 90,  mass: 7,  kind: 'flame',  type: 'fire',      dmg: 1.1, cd: 0.06, range: 13, spread: 16, ammo: 0, en: 0, burn: 4, desc: 'Sets robots alight at close range.' },
  tesla:   { name: 'Tesla coil',    cost: 140, mass: 9,  kind: 'tesla',  type: 'energy',    dmg: 10,  cd: 0.8,  range: 17, spread: 0, ammo: 0, en: 8, desc: 'Arcs to two robots and slows them.' },
  saw:     { name: 'Buzz saw',      cost: 70,  mass: 8,  kind: 'saw',    type: 'kinetic',   dmg: 1.2, cd: 0.06, range: 2.2, spread: 0, ammo: 0, en: 0, fixed: true, desc: 'Chews whatever is directly ahead.' },
  mines:   { name: 'Mine layer',    cost: 80,  mass: 7,  kind: 'mine',   type: 'explosive', dmg: 34,  cd: 2,    range: 0, spread: 0, blast: 5, ammo: 10, en: 0, fixed: true, desc: 'Drops mines behind you. 10 mines.' },
};

export const MODULES = {
  shield:   { name: 'Shield generator', cost: 130, mass: 5, active: 'toggle', desc: 'While on, stops 70% of damage, paid for in energy.' },
  repair:   { name: 'Repair nanites',   cost: 110, mass: 3, desc: 'Slowly restores health.' },
  smoke:    { name: 'Smoke launcher',   cost: 50,  mass: 3, active: 'pulse', desc: 'Three clouds that block radar.' },
  boost:    { name: 'Boost rockets',    cost: 70,  mass: 3, active: 'pulse', desc: 'A burst of speed every 8 seconds.' },
  jump:     { name: 'Jump jets',        cost: 100, mass: 5, active: 'pulse', desc: 'Leaps over anything every 7 seconds.' },
  cloak:    { name: 'Cloak',            cost: 150, mass: 2, active: 'toggle', desc: 'Hidden from radar beyond 8 m while on. Drains energy.' },
  ammo:     { name: 'Ammo rack',        cost: 40,  mass: 4, desc: '50% more rockets, missiles and mines.' },
  targeting:{ name: 'Targeting computer',cost: 80, mass: 1, desc: 'Tighter spread and a faster turret.' },
  pointdef: { name: 'Point defense',    cost: 90,  mass: 3, desc: 'Shoots down rockets and missiles nearby.' },
};

export const COLORS = ['#E5352B', '#FFC914', '#1FA35B', '#1F7FE0', '#8A3FD1', '#F2711C', '#E83E9C', '#16B5B0', '#E9EDF7', '#39414F'];

export const defaultDesign = () => ({
  chassis: 'brawler', drive: 'wheels', engine: 'diesel', armor: 'plate',
  radar: 'dish', turret: 'swivel', cpu: 'cog8', weapons: ['mg'], modules: [],
});

export function designCost(d) {
  let c = CHASSIS[d.chassis].cost + DRIVES[d.drive].cost + ENGINES[d.engine].cost + ARMORS[d.armor].cost
        + RADARS[d.radar].cost + TURRETS[d.turret].cost + CPUS[d.cpu].cost;
  for (const w of d.weapons) c += WEAPONS[w].cost;
  for (const m of d.modules) c += MODULES[m].cost;
  return c;
}

export function designMass(d) {
  let m = CHASSIS[d.chassis].mass + DRIVES[d.drive].mass + ENGINES[d.engine].mass + ARMORS[d.armor].mass
        + RADARS[d.radar].mass + TURRETS[d.turret].mass;
  for (const w of d.weapons) m += WEAPONS[w].mass;
  for (const x of d.modules) m += MODULES[x].mass;
  return m;
}

/** Everything the sim and stat panels need, derived from a design. */
export function computeStats(d) {
  const ch = CHASSIS[d.chassis], dr = DRIVES[d.drive], en = ENGINES[d.engine], ar = ARMORS[d.armor];
  const mass = designMass(d);
  const ratio = en.power / mass;
  const k = Math.min(1.15, Math.max(0.22, ratio / dr.ideal));
  const speed = dr.speed * Math.pow(k, 0.75);
  const turn = dr.turn * Math.pow(k, 0.4);
  const has = (m) => d.modules.includes(m);
  return {
    mass, speed, turn, radius: ch.radius, hp: Math.round((ch.hp + ar.hp) * 1.5), ram: ch.ram,
    energy: en.energy, regen: en.regen, resist: ar.resist,
    traction: dr.traction * Math.pow(k, 0.5),
    turretSlew: TURRETS[d.turret].slew * (has('targeting') ? 1.35 : 1),
    spreadMul: has('targeting') ? 0.45 : 1,
    ammoMul: has('ammo') ? 1.5 : 1,
    radar: RADARS[d.radar], cpu: CPUS[d.cpu],
    cost: designCost(d),
  };
}

/** Rule problems with a design, in words a player can act on. Empty list means it is legal. */
export function designProblems(d) {
  const out = [];
  const ch = CHASSIS[d.chassis];
  const cost = designCost(d);
  if (cost > BUDGET) out.push(`Over budget by ${cost - BUDGET} credits.`);
  if (d.weapons.length > ch.hardpoints) out.push(`${ch.name} holds ${ch.hardpoints} weapon${ch.hardpoints > 1 ? 's' : ''}. Remove ${d.weapons.length - ch.hardpoints}.`);
  if (d.modules.length > ch.modules) out.push(`${ch.name} holds ${ch.modules} module${ch.modules > 1 ? 's' : ''}. Remove ${d.modules.length - ch.modules}.`);
  if (d.weapons.length === 0) out.push('Add at least one weapon.');
  return out;
}
