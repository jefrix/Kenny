// "Brick": the block language. Blocks are plain data; this file defines them, validates
// untrusted programs and runs them. The program runs top to bottom on every CPU cycle.
// There are no loops, so a program can never hang, and block count is a fixed cost per cycle.

const WPN = ['all', '1', '2', '3'];
const CMP = ['<', '<=', '>', '>=', '=', '!='];

// parts: strings are labels. Objects are inputs:
//   {a:'name', enum:[...]} dropdown, {a:'name', num:default} number or reporter slot,
//   {a:'name', bool:true} condition slot, {a:'name', stack:true} nested blocks.
export const BLOCKS = {
  // Logic
  if:     { kind: 'stmt', cat: 'logic', parts: ['if', { a: 'c', bool: true }, 'then', { a: 'then', stack: true }] },
  ifelse: { kind: 'stmt', cat: 'logic', parts: ['if', { a: 'c', bool: true }, 'then', { a: 'then', stack: true }, 'else', { a: 'else', stack: true }] },
  stop:   { kind: 'stmt', cat: 'logic', parts: ['end this cycle'] },
  and:    { kind: 'bool', cat: 'logic', parts: [{ a: 'x', bool: true }, 'and', { a: 'y', bool: true }] },
  or:     { kind: 'bool', cat: 'logic', parts: [{ a: 'x', bool: true }, 'or', { a: 'y', bool: true }] },
  not:    { kind: 'bool', cat: 'logic', parts: ['not', { a: 'x', bool: true }] },
  cmp:    { kind: 'bool', cat: 'logic', parts: [{ a: 'x', num: 0 }, { a: 'rel', enum: CMP }, { a: 'y', num: 10 }] },
  chance: { kind: 'bool', cat: 'logic', parts: [{ a: 'p', num: 50 }, '% chance'] },

  // Movement
  drive:  { kind: 'stmt', cat: 'move', parts: ['drive', { a: 'dir', enum: ['forward', 'backward'] }, 'at', { a: 'pct', num: 100 }, '%'] },
  halt:   { kind: 'stmt', cat: 'move', parts: ['stop moving'] },
  turn:   { kind: 'stmt', cat: 'move', parts: ['turn', { a: 'dir', enum: ['left', 'right'] }, 'at', { a: 'pct', num: 100 }, '%'] },
  nosteer:{ kind: 'stmt', cat: 'move', parts: ['stop turning'] },
  face:   { kind: 'stmt', cat: 'move', parts: ['steer', { a: 'how', enum: ['toward', 'away from'] }, { a: 'what', enum: ['target', 'attacker', 'arena center', 'repair pad'] }] },
  strafe: { kind: 'stmt', cat: 'move', parts: ['strafe', { a: 'dir', enum: ['left', 'right', 'off'] }, '(legs, hover)'] },

  // Radar and aim
  pick:   { kind: 'stmt', cat: 'sense', parts: ['target the', { a: 'what', enum: ['nearest', 'weakest', 'strongest', 'attacker'] }, 'robot'] },
  radar:  { kind: 'stmt', cat: 'sense', parts: ['radar', { a: 'mode', enum: ['sweep', 'track target', 'look ahead', 'follow turret'] }] },
  aim:    { kind: 'stmt', cat: 'sense', parts: ['aim turret', { a: 'mode', enum: ['at target', 'leading target', 'at attacker', 'dead ahead', 'with radar'] }] },
  aimang: { kind: 'stmt', cat: 'sense', parts: ['aim turret', { a: 'deg', num: 0 }, 'degrees from hull'] },

  // Weapons and modules
  fire:   { kind: 'stmt', cat: 'act', parts: ['fire weapon', { a: 'w', enum: WPN }] },
  module: { kind: 'stmt', cat: 'act', parts: ['use', { a: 'm', enum: ['boost', 'jump jets', 'smoke'] }] },
  toggle: { kind: 'stmt', cat: 'act', parts: ['turn', { a: 'm', enum: ['shield', 'cloak'] }, { a: 'on', enum: ['on', 'off'] }] },
  say:    { kind: 'stmt', cat: 'act', parts: ['say', { a: 'text', text: 'Hello!' }] },

  // Memory
  set:    { kind: 'stmt', cat: 'mem', parts: ['set', { a: 'v', enum: ['A', 'B', 'C'] }, 'to', { a: 'x', num: 0 }] },
  add:    { kind: 'stmt', cat: 'mem', parts: ['change', { a: 'v', enum: ['A', 'B', 'C'] }, 'by', { a: 'x', num: 1 }] },
  reset:  { kind: 'stmt', cat: 'mem', parts: ['reset timer'] },
  var:    { kind: 'num',  cat: 'mem', parts: ['memory', { a: 'v', enum: ['A', 'B', 'C'] }] },
  timer:  { kind: 'num',  cat: 'mem', parts: ['timer'] },
  math:   { kind: 'num',  cat: 'mem', parts: [{ a: 'x', num: 0 }, { a: 'mop', enum: ['+', '-', '*', '/'] }, { a: 'y', num: 1 }] },
  rand:   { kind: 'num',  cat: 'mem', parts: ['random to', { a: 'x', num: 100 }] },

  // Sensors returning true/false
  seen:   { kind: 'bool', cat: 'sensor', parts: ['radar sees a robot'] },
  known:  { kind: 'bool', cat: 'sensor', parts: ['target seen in last', { a: 's', num: 3 }, 's'] },
  onaim:  { kind: 'bool', cat: 'sensor', parts: ['turret on target'] },
  hit:    { kind: 'bool', cat: 'sensor', parts: ['took a hit in last', { a: 's', num: 1 }, 's'] },
  bump:   { kind: 'bool', cat: 'sensor', parts: ['bumped something'] },
  ready:  { kind: 'bool', cat: 'sensor', parts: ['weapon', { a: 'w', enum: ['1', '2', '3'] }, 'ready'] },
  modrdy: { kind: 'bool', cat: 'sensor', parts: [{ a: 'm', enum: ['boost', 'jump jets', 'smoke'] }, 'ready'] },
  danger: { kind: 'bool', cat: 'sensor', parts: ['standing in danger'] },

  // Sensors returning numbers
  sense:  { kind: 'num',  cat: 'sensor', parts: [{ a: 's', enum: [
    'target distance', 'target bearing', 'target health %', 'attacker bearing',
    'my health %', 'my energy %', 'my speed', 'robots left',
    'wall ahead', 'wall behind', 'wall left', 'wall right',
    'ammo weapon 1', 'ammo weapon 2', 'ammo weapon 3', 'match seconds',
  ] }] },
};

export const CATEGORIES = [
  { id: 'logic',  name: 'Logic' },
  { id: 'sensor', name: 'Sensors' },
  { id: 'move',   name: 'Movement' },
  { id: 'sense',  name: 'Radar and aim' },
  { id: 'act',    name: 'Weapons and modules' },
  { id: 'mem',    name: 'Memory and math' },
];

export function newBlock(op) {
  const def = BLOCKS[op], n = { op };
  for (const p of def.parts) {
    if (typeof p === 'string') continue;
    if (p.enum) n[p.a] = p.enum[0];
    else if (p.num !== undefined) n[p.a] = p.num;
    else if (p.bool) n[p.a] = null;
    else if (p.stack) n[p.a] = [];
    else if (p.text !== undefined) n[p.a] = p.text;
  }
  return n;
}

/** Number of blocks a program uses against the CPU's limit. Typed-in numbers are free. */
export function countBlocks(prog) {
  let c = 0;
  const walk = (n) => {
    if (n == null || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    c++;
    for (const p of BLOCKS[n.op].parts) if (typeof p !== 'string' && !p.enum) walk(n[p.a]);
  };
  walk(prog);
  return c;
}

const MAX_DEPTH = 24, MAX_NODES = 400;

/** Rebuild a program from untrusted JSON, keeping only known blocks and legal values. Throws if malformed. */
export function sanitizeProgram(raw) {
  let nodes = 0;
  const num = (v, fallback) => (typeof v === 'number' && isFinite(v)) ? Math.max(-1e6, Math.min(1e6, v)) : fallback;
  const node = (r, kind, depth) => {
    if (depth > MAX_DEPTH) throw new Error('Program is nested too deeply.');
    if (++nodes > MAX_NODES) throw new Error('Program has too many blocks.');
    if (!r || typeof r !== 'object' || !Object.prototype.hasOwnProperty.call(BLOCKS, r.op)) throw new Error('Program contains an unknown block.');
    const def = BLOCKS[r.op];
    if (def.kind !== kind) throw new Error('Program has a block in the wrong kind of slot.');
    const n = { op: r.op };
    for (const p of def.parts) {
      if (typeof p === 'string') continue;
      const v = r[p.a];
      if (p.enum) n[p.a] = p.enum.includes(v) ? v : p.enum[0];
      else if (p.text !== undefined) n[p.a] = String(v ?? '').slice(0, 40);
      else if (p.bool) n[p.a] = v == null ? null : node(v, 'bool', depth + 1);
      else if (p.stack) n[p.a] = list(v, depth + 1);
      else if (v && typeof v === 'object') n[p.a] = node(v, 'num', depth + 1);
      else n[p.a] = num(v, p.num);
    }
    return n;
  };
  const list = (v, depth) => {
    if (v == null) return [];
    if (!Array.isArray(v)) throw new Error('Program is malformed.');
    return v.map((x) => node(x, 'stmt', depth));
  };
  return list(raw, 0);
}

class Stop extends Error {}
const STOP = new Stop();

/** Execute one cycle. `io` is the robot-facing interface supplied by the simulator. */
export function runProgram(prog, io) {
  const N = (v) => (typeof v === 'number' ? v : (v == null ? 0 : evalNum(v)));
  const B = (n) => (n == null ? false : evalBool(n));

  function evalNum(n) {
    switch (n.op) {
      case 'var': return io.mem[n.v];
      case 'timer': return io.timer();
      case 'rand': return io.random() * N(n.x);
      case 'sense': return io.sense(n.s);
      case 'math': return mathOp(n, N(n.x), N(n.y));
    }
    return 0;
  }
  function evalBool(n) {
    switch (n.op) {
      case 'and': return B(n.x) && B(n.y);
      case 'or':  return B(n.x) || B(n.y);
      case 'not': return !B(n.x);
      case 'chance': return io.random() * 100 < N(n.p);
      case 'cmp': return compare(N(n.x), n.rel, N(n.y));
      case 'seen': return io.seen();
      case 'known': return io.known(N(n.s));
      case 'onaim': return io.onAim();
      case 'hit': return io.hitWithin(N(n.s));
      case 'bump': return io.bumped();
      case 'ready': return io.weaponReady(+n.w - 1);
      case 'modrdy': return io.moduleReady(n.m);
      case 'danger': return io.inDanger();
    }
    return false;
  }
  const run = (list) => { for (const s of list) exec(s); };
  function exec(n) {
    switch (n.op) {
      case 'if': if (B(n.c)) run(n.then); break;
      case 'ifelse': if (B(n.c)) run(n.then); else run(n.else); break;
      case 'stop': throw STOP;
      case 'set': io.mem[n.v] = N(n.x); break;
      case 'add': io.mem[n.v] += N(n.x); break;
      case 'reset': io.resetTimer(); break;
      case 'drive': io.drive(n.dir === 'forward' ? N(n.pct) : -N(n.pct)); break;
      case 'halt': io.drive(0); break;
      case 'turn': io.turn(n.dir === 'right' ? N(n.pct) : -N(n.pct)); break;
      case 'nosteer': io.turn(0); break;
      case 'face': io.face(n.how, n.what); break;
      case 'strafe': io.strafe(n.dir); break;
      case 'pick': io.pick(n.what); break;
      case 'radar': io.radar(n.mode); break;
      case 'aim': io.aim(n.mode); break;
      case 'aimang': io.aimAngle(N(n.deg)); break;
      case 'fire': io.fire(n.w); break;
      case 'module': io.useModule(n.m); break;
      case 'toggle': io.toggle(n.m, n.on === 'on'); break;
      case 'say': io.say(n.text); break;
    }
  }
  try { run(prog); } catch (e) { if (e !== STOP) throw e; }
}

function mathOp(n, x, y) {
  switch (n.mop) { case '-': return x - y; case '*': return x * y; case '/': return y === 0 ? 0 : x / y; default: return x + y; }
}
function compare(x, op, y) {
  switch (op) {
    case '<': return x < y; case '<=': return x <= y; case '>': return x > y;
    case '>=': return x >= y; case '=': return Math.abs(x - y) < 1e-9; default: return Math.abs(x - y) >= 1e-9;
  }
}
