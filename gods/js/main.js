// Screens, input and the game loop.
import { World, DT, N, MIRACLES, BUILDINGS } from './sim.js';
import { RivalGod, DIFFICULTIES } from './ai.js';
import { GodRenderer, TEAM_COLORS } from './render.js';
import { initAudio, play, setMuted, isMuted } from './audio.js';

const ME = 0, FOE = 1;
const canvas = document.getElementById('world'), ui = document.getElementById('ui');
const store = { get(key, fallback) { try { const v = localStorage.getItem('clay.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } }, set(key, value) { try { localStorage.setItem('clay.' + key, JSON.stringify(value)); } catch { /* Private windows can refuse storage. The game plays on. */ } } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;

const ICONS = {
  hand: svg('<path d="M17 44c-3-4-9-11-11-15-1-3 2-5 4-3l6 6V10c0-4 5-4 5 0v10l1-14c0-4 5-4 5 0l1 14 2-11c1-4 6-3 5 1l-2 13 3-7c2-3 6-2 5 2l-4 15c-1 5-3 8-5 11z"/>'),
  raise: svg('<path d="M3 42 17 21l7 8 9-17 12 30z"/><path d="M33 3l7 8h-5v5h-4v-5h-5z"/>'),
  lower: svg('<path d="M3 21c8 0 7 11 14 14s10-1 14-1 5-13 14-13v21H3z"/><path d="M22 2h5v7h5l-7 8-8-8h5z"/>'),
  level: svg('<path d="M3 27h42v15H3z"/><path d="M6 21l9-9h18l9 9zM22 3h4v9h-4z"/>'),
  standard: svg('<path d="M21 6h4v34h7v5H14v-5h7z"/><path d="M26 9h17l-5 7 5 8H26z"/><path d="M14 2c1 5 11 5 14 0-1 8-13 8-14 0z"/>'),
  rain: svg('<path d="M12 27C5 27 3 17 11 15c1-9 15-11 19-2 9-1 12 12 3 14z"/><path d="M13 31l-3 9h3l3-9zM23 31l-4 13h3l4-13zM33 31l-3 9h3l3-9z"/>'),
  bless: svg('<circle cx="24" cy="24" r="8"/><path d="M22 2h4l1 12h-6zM22 46h4l1-12h-6zM2 22v4l12 1v-6zM46 22v4l-12 1v-6zM7 10l3-3 9 9-4 4zM41 38l-3 3-9-9 4-4zM38 7l3 3-9 9-4-4zM10 41l-3-3 9-9 4 4z"/>'),
  lightning: svg('<path d="M29 2 9 28h12l-5 18 23-27H26z"/>'),
  fire: svg('<path d="M24 2c2 9 14 14 14 28 0 9-7 16-14 16S10 39 10 30c0-6 3-10 6-13 0 5 2 7 4 7 3-7 1-14 4-22zm0 28c-4 4-6 6-6 9s3 5 6 5 6-2 6-5-2-5-6-9z"/>'),
  quake: svg('<path d="M3 27h16l4 5 5-9-3-5h20v9H34l-4 9 3 6-3 8H21l5-8-5-6-3-1H3z"/><path d="M5 8l5 4-3 3 5 4H8l-5-5 3-2-4-3zM41 2l1 5h3l-2 7-1-5h-3z"/>'),
  flood: svg('<path d="M3 14c7-7 14 7 21 0s14 7 21 0v7c-7 7-14-7-21 0s-14-7-21 0zM3 25c7-7 14 7 21 0s14 7 21 0v7c-7 7-14-7-21 0s-14-7-21 0zM3 36c7-7 14 7 21 0s14 7 21 0v7c-7 7-14-7-21 0s-14-7-21 0z"/>'),
};
const TOOLS = [
  { id: 'hand', name: 'Hand', key: '1', icon: 'hand', help: 'Grab people, rocks and trees, then set them down or throw them. Drag empty ground to move the view.' },
  { id: 'raise', name: 'Raise land', key: '2', icon: 'raise', stroke: true, help: 'Hold to raise the land. Build bridges across the sea.' },
  { id: 'lower', name: 'Lower land', key: '3', icon: 'lower', stroke: true, help: 'Hold to lower the land. Cut your people off, or drown the shore.' },
  { id: 'level', name: 'Level land', key: '4', icon: 'level', stroke: true, help: 'Hold to flatten toward where you first pressed. Flat ground gets built on, and very flat ground gets houses.' },
  { id: 'standard', name: 'Standard', key: '5', icon: 'standard', help: 'Plant it and warriors march there. Click it again to call them home. It also extends your reach.' },
];
const MIRACLE_KEYS = { rain: 'Z', bless: 'X', lightning: 'C', fire: 'V', quake: 'B', flood: 'N' };
const STEPS = [
  { title: 'Lift a follower', text: 'With the Hand, pick up one of your people and set them down somewhere nearby.', done: (s) => s.grabs > 0 },
  { title: 'Make room', text: 'Pick Level land and hold it on rough ground inside your border. People build on flat land.', done: (s) => s.strokes > 4 },
  { title: 'Feed the forest', text: 'Your people pray at the temple, and prayer earns belief. Cast Rain near your homes for more trees and children.', done: (s) => s.rain > 0 },
  { title: 'Cross the water', text: 'A strait keeps you apart. Hold Raise land at your shore until a bridge reaches across. You can only shape land inside your border.', done: (s) => s.raises > 10 },
  { title: 'March', text: 'Plant your standard at the far end, and your warriors will go. Their presence extends your border, so you can strike from there.', done: (s) => s.standards > 0 },
  { title: 'Bring down their temple', text: 'Destroy the rival temple, or leave them with no followers. Warriors and miracles both do the work.', done: () => false },
];

let renderer, world, mode = 'menu', difficulty = 'jealous', speed = 1, paused = false, tool = 'hand', accumulator = 0, last = performance.now();
let held = null, pointer = { x: 0, y: 0, inside: false, ground: null }, activePointers = new Map(), stroke = null, panning = null, trail = [], strokeTimer = 0, keys = new Set(), hover = null, uiTimer = 0, miniTimer = 0;
let progress, stepIndex = 0, seed = 0, omens = [], lastTempleHp = 0, lastAttackOmen = -99, noFlatWarned = false, statsLine = '', uiRefs = {};

const hudTemplate = () => `
  <section class="belief inlay edged" aria-label="Your people">
    <div class="belief-row"><span class="belief-value" id="b-value">0</span><span class="belief-label">belief</span></div>
    <div class="belief-rate" id="b-rate"></div>
    <div class="stats">
      <div class="stat"><b id="s-pop">0</b><span>followers</span></div>
      <div class="stat"><b id="s-war">0</b><span>warriors</span></div>
      <div class="stat"><b id="s-wood">0</b><span>wood</span></div>
    </div>
    <div class="bar" title="Your temple"><i id="my-temple" style="background:var(--you)"></i></div>
  </section>
  <div class="controls">
    <button class="ctl inlay" id="c-pause" aria-pressed="false" title="Pause (P)">Pause</button>
    <button class="ctl inlay" id="c-speed" title="Game speed">1×</button>
    <button class="ctl inlay" id="c-sound" title="Sound (M)">${isMuted() ? 'Sound off' : 'Sound on'}</button>
  </div>
  <section class="foe inlay edged" aria-label="The rival">
    <h2>${esc(DIFFICULTIES[difficulty].name)}</h2>
    <div class="foe-line" id="f-line"></div>
    <div class="bar" title="The rival temple" style="margin-top:0"><i id="foe-temple" style="background:var(--rival)"></i></div>
    <canvas id="minimap" width="${N}" height="${N}" role="button" aria-label="Map. Click to move the view."></canvas>
  </section>
  <div class="omens" id="omens" aria-live="polite"></div>
  <div id="prophecy-slot"></div>
  <div class="tray-wrap">
    <div class="inscription" id="inscription"></div>
    <div class="tray" role="toolbar" aria-label="Tools and miracles">
      ${TOOLS.map((t) => `<button class="tool" data-tool="${t.id}" aria-pressed="false" aria-label="${t.name}" title="${t.name} (${t.key})"><span class="key">${t.key}</span>${ICONS[t.icon]}<span class="cost">${t.stroke ? 'Hold' : 'Free'}</span></button>`).join('')}
      <span class="gap"></span>
      ${Object.entries(MIRACLES).map(([id, m]) => `<button class="tool miracle" data-tool="${id}" aria-pressed="false" aria-label="${m.name}, costs ${m.cost} belief" title="${m.name} (${MIRACLE_KEYS[id]})"><span class="key">${MIRACLE_KEYS[id]}</span>${ICONS[id]}<span class="cost">${m.cost}</span><span class="cool"></span></button>`).join('')}
    </div>
  </div>`;

function showTitle() {
  mode = 'menu'; document.body.classList.add('menu');
  paused = false; speed = 1; held = null; stroke = null; panning = null; tool = 'hand';
  const beaten = store.get('beaten', {});
  const choice = (id) => { const d = DIFFICULTIES[id]; return `<button class="rival-choice inlay" data-rival="${id}"><strong>${esc(d.name)}${beaten[id] ? ' <span class="won">— defeated</span>' : ''}</strong><small>${esc(d.blurb)}</small></button>`; };
  ui.innerHTML = `<div class="title"><div class="title-main">
    <h1>Clay <span>&amp; Thunder</span></h1>
    <p class="pitch">Move the land. Your people will build, pray and fight on their own. Their belief is your power, and only one god gets to stay.</p>
    <div class="rivals">${Object.keys(DIFFICULTIES).map(choice).join('')}</div>
  </div><div class="title-foot"><a href="../index.html">Back to Kenny</a><button id="t-how" style="text-decoration:underline">How to play</button></div></div>`;
  // Behind the menu, two rivals fight it out for real.
  world = new World({ seed: Math.floor(Math.random() * 1e9) }); world.rivals.push(new RivalGod(0, 'wrathful'), new RivalGod(1, 'wrathful'));
  renderer.setWorld(world); renderer.setHand(0, 0, false, false); renderer.setCursor(0, 0, 0);
  renderer.controls.target.set(N / 2, 1, N / 2); renderer.camera.position.set(N / 2 - 58, 42, N / 2 + 58); renderer.controls.autoRotate = renderer.motionOk; renderer.controls.autoRotateSpeed = 0.28; renderer.controls.enabled = false; renderer.controls.update();
  ui.querySelectorAll('[data-rival]').forEach((b) => b.addEventListener('click', () => { initAudio(); play('click'); startMatch(b.dataset.rival); }));
  ui.querySelector('#t-how').addEventListener('click', () => showHelp());
}

function showHelp() {
  const previous = paused; paused = true;
  const veil = document.createElement('div'); veil.className = 'veil';
  veil.innerHTML = `<div class="sheet inlay edged" role="dialog" aria-label="How to play"><h2>How to play</h2>
    <p>You never give orders. People find work, pray at your temple, and earn belief. You spend that belief to change their world.</p>
    <dl>
      <dt>Hand</dt><dd>Grab and carry. Flick to throw. Set an enemy down at your temple to convert them.</dd>
      <dt>Land</dt><dd>Level ground for homes and raise bridges. You can only touch what lies inside your border.</dd>
      <dt>Standard</dt><dd>Warriors march to it. Warriors carry your border with them.</dd>
      <dt>Win</dt><dd>Destroy the rival temple, or leave them with no followers.</dd>
      <dt>View</dt><dd>Drag empty ground, or use WASD, to move. Right-drag or Q and E to turn. Wheel to zoom. On a touchscreen, use two fingers to turn and zoom.</dd>
      <dt>Keys</dt><dd>1–5 for tools, Z X C V B N for miracles, P to pause, Esc to put down a tool.</dd>
    </dl>
    <div class="acts"><button class="act primary" id="h-close">Close</button></div></div>`;
  ui.appendChild(veil);
  const close = () => { veil.remove(); paused = previous; };
  veil.querySelector('#h-close').addEventListener('click', close); veil.querySelector('#h-close').focus();
}

function startMatch(rival, keepSeed) {
  difficulty = rival; seed = keepSeed ?? Math.floor(Math.random() * 1e9);
  mode = 'play'; document.body.classList.remove('menu'); paused = false; speed = 1; tool = 'hand'; held = null; stroke = null; panning = null; omens = []; accumulator = 0; noFlatWarned = false; lastAttackOmen = -99;
  world = new World({ seed }); world.rivals.push(new RivalGod(FOE, rival));
  renderer.controls.autoRotate = false; renderer.controls.enabled = true; renderer.setWorld(world, ME);
  progress = { grabs: 0, strokes: 0, rain: 0, raises: 0, standards: 0 }; stepIndex = store.get('tutorial', true) ? 0 : -1; lastTempleHp = world.tribes[ME].temple.hp;
  ui.innerHTML = hudTemplate();
  uiRefs = Object.fromEntries(['b-value', 'b-rate', 's-pop', 's-war', 's-wood', 'my-temple', 'foe-temple', 'f-line', 'omens', 'inscription', 'prophecy-slot', 'minimap', 'c-pause', 'c-speed', 'c-sound'].map((id) => [id, document.getElementById(id)]));
  ui.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => { play('click'); selectTool(b.dataset.tool); canvas.focus({ preventScroll: true }); }));
  ui.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('pointerenter', () => { uiRefs.inscription.textContent = describeTool(b.dataset.tool); }));
  ui.querySelector('.tray').addEventListener('pointerleave', () => { uiRefs.inscription.textContent = tool === 'hand' ? '' : describeTool(tool); });
  uiRefs['c-pause'].addEventListener('click', togglePause); uiRefs['c-speed'].addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; uiRefs['c-speed'].textContent = `${speed}×`; });
  uiRefs['c-sound'].addEventListener('click', toggleSound);
  const mini = uiRefs.minimap, jump = (e) => { const r = mini.getBoundingClientRect(); renderer.focus((e.clientX - r.left) / r.width * N, (e.clientY - r.top) / r.height * N); };
  mini.addEventListener('pointerdown', (e) => { jump(e); mini.setPointerCapture(e.pointerId); }); mini.addEventListener('pointermove', (e) => { if (e.buttons) jump(e); });
  selectTool('hand'); renderProphecy(); updateHud(); drawMinimap();
}

function describeTool(id) {
  const m = MIRACLES[id]; if (m) return `${m.name}. ${m.help}`;
  const t = TOOLS.find((x) => x.id === id); return t ? `${t.name}. ${t.help}` : '';
}

function selectTool(id) {
  tool = id;
  ui.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === id ? 'true' : 'false'));
  if (uiRefs.inscription) uiRefs.inscription.textContent = id === 'hand' ? '' : describeTool(id);
}

function togglePause() {
  if (mode !== 'play') return;
  paused = !paused; uiRefs['c-pause'].setAttribute('aria-pressed', paused ? 'true' : 'false');
  uiRefs['c-pause'].textContent = paused ? 'Resume' : 'Pause';
  document.getElementById('pause-veil')?.remove();
  if (paused) {
    const veil = document.createElement('div'); veil.className = 'veil'; veil.id = 'pause-veil';
    veil.innerHTML = `<div class="sheet inlay edged" role="dialog" aria-label="Paused"><h2>Paused</h2><div class="acts"><button class="act primary" id="p-resume">Resume</button><button class="act" id="p-how">How to play</button><button class="act" id="p-restart">Restart</button><button class="act" id="p-quit">Quit to title</button></div></div>`;
    ui.appendChild(veil);
    veil.querySelector('#p-resume').addEventListener('click', togglePause); veil.querySelector('#p-resume').focus();
    veil.querySelector('#p-how').addEventListener('click', () => { showHelpOverPause(); });
    veil.querySelector('#p-restart').addEventListener('click', () => startMatch(difficulty, seed));
    veil.querySelector('#p-quit').addEventListener('click', showTitle);
  }
}
function showHelpOverPause() { showHelp(); paused = true; }
function toggleSound() { setMuted(!isMuted()); if (uiRefs['c-sound']) uiRefs['c-sound'].textContent = isMuted() ? 'Sound off' : 'Sound on'; }

// ----- Prophecy and omens -----

function renderProphecy() {
  const slot = uiRefs['prophecy-slot']; if (!slot) return;
  if (stepIndex < 0 || stepIndex >= STEPS.length) { slot.innerHTML = ''; return; }
  const s = STEPS[stepIndex];
  slot.innerHTML = `<aside class="prophecy inlay edged"><h3>${stepIndex + 1} of ${STEPS.length}: ${esc(s.title)}</h3><p>${esc(s.text)}</p><button id="p-skip">Hide these tips</button></aside>`;
  slot.querySelector('#p-skip').addEventListener('click', () => { stepIndex = -1; store.set('tutorial', false); renderProphecy(); });
}
function advanceProphecy() { if (stepIndex >= 0 && stepIndex < STEPS.length && STEPS[stepIndex].done(progress)) { stepIndex++; play('built'); renderProphecy(); } }

function omen(text, bad = false) {
  if (omens.some((o) => o.text === text)) return;
  const el = document.createElement('div'); el.className = `omen${bad ? ' bad' : ''}`; el.textContent = text; uiRefs.omens?.appendChild(el);
  const entry = { text, el, until: performance.now() + 5200 }; omens.push(entry);
  if (omens.length > 3) { const old = omens.shift(); old.el.remove(); }
}
function tickOmens(now) { omens = omens.filter((o) => { if (now < o.until) return true; o.el.remove(); return false; }); }

function handleEvents(audible) {
  for (const e of world.events) {
    renderer.handleEvent(e);
    if (!audible) continue;
    switch (e.type) {
      case 'miracle':
        if (e.name === 'lightning') play('thunder'); else if (e.name === 'fire') play('fire'); else if (e.name === 'rain') play('rain'); else if (e.name === 'bless') play('bless');
        else if (e.name === 'flood') { play('flood'); omen(e.tribe === ME ? 'The sea is rising. Your flood takes every low shore.' : 'The rival calls a flood. Get to high ground.', e.tribe !== ME); }
        if (e.tribe === FOE && e.name !== 'flood' && e.name !== 'rain' && e.name !== 'bless' && world.inInfluence(ME, e.x, e.y)) omen(`The rival casts ${MIRACLES[e.name].name} on your land.`, true);
        break;
      case 'fireImpact': play('impactBig'); break;
      case 'quakePulse': play('quake'); break;
      case 'collapse': play(e.building === 'temple' ? 'impactBig' : 'collapse'); if (e.tribe === ME && e.building !== 'temple') omen(e.cause === 'collapse' ? 'A home fell when the ground moved under it.' : 'One of your homes is gone.', true); break;
      case 'impact': play('thud', e.big); break;
      case 'splash': play('splash'); break;
      case 'land': if (e.hard) play('thud', false); break;
      case 'grab': if (e.tribe === ME) play('grab'); break;
      case 'convert': play('convert'); if (e.tribe === ME) omen('A rival follower now believes in you.'); else omen('The rival took one of your people.', true); break;
      case 'offering': play('built'); omen('An offering: wood for your people.'); break;
      case 'built': play('built'); break;
      case 'birth': if (e.tribe === ME) play('birth'); break;
      case 'hit': play('hit'); break;
      case 'death': play('death'); break;
      case 'rivalBridge': play('horn'); omen('The rival is raising land toward you.', true); break;
      case 'standard': if (e.tribe === FOE) { play('horn'); omen('The rival plants a standard. Their warriors are on the move.', true); } break;
      case 'floodEnd': omen('The waters fall back.'); break;
      default: break;
    }
  }
  world.events.length = 0;
}

function watchOmens() {
  const me = world.tribes[ME], temple = me.temple;
  if (temple && temple.hp < lastTempleHp - 0.5 && world.time - lastAttackOmen > 12) { lastAttackOmen = world.time; omen('Your temple is under attack!', true); play('horn'); }
  if (temple) lastTempleHp = temple.hp;
  if (me.noSiteSince >= 0 && world.time - me.noSiteSince > 14 && !noFlatWarned) { noFlatWarned = true; omen('Your people have run out of flat ground. Level some land.'); }
  if (me.noSiteSince < 0) noFlatWarned = false;
}

function endMatch() {
  mode = 'over'; const won = world.winner === ME, me = world.tribes[ME], d = DIFFICULTIES[difficulty], minutes = Math.floor(world.time / 60), seconds = String(Math.floor(world.time % 60)).padStart(2, '0');
  play(won ? 'win' : 'lose');
  if (won) { const beaten = store.get('beaten', {}); beaten[difficulty] = true; store.set('beaten', beaten); }
  const order = Object.keys(DIFFICULTIES), next = order[order.indexOf(difficulty) + 1];
  const reason = won ? (world.overReason === 'temple' ? `The temple of the ${d.name} lies in ruins.` : `The ${d.name} has no one left to believe.`) : (world.overReason === 'temple' ? 'Your temple fell, and your people forgot your name.' : 'Your last follower is gone. A god with no believers is no god.');
  const veil = document.createElement('div'); veil.className = 'veil';
  veil.innerHTML = `<div class="sheet inlay edged" role="dialog" aria-label="Match over"><h2>${won ? 'You alone remain' : 'You are forgotten'}</h2><p>${esc(reason)}</p>
    <div class="tally"><div><b>${minutes}:${seconds}</b><span>match length</span></div><div><b>${me.stats.peak}</b><span>most followers</span></div><div><b>${me.stats.miraclesCast}</b><span>miracles cast</span></div><div><b>${me.stats.converted}</b><span>converted</span></div></div>
    <div class="acts">${won && next ? `<button class="act primary" id="e-next">Face the ${esc(DIFFICULTIES[next].name)}</button>` : ''}<button class="act ${won && next ? '' : 'primary'}" id="e-again">Play this rival again</button><button class="act" id="e-quit">Quit to title</button></div></div>`;
  ui.appendChild(veil);
  veil.querySelector('#e-next')?.addEventListener('click', () => startMatch(next));
  veil.querySelector('#e-again').addEventListener('click', () => startMatch(difficulty));
  veil.querySelector('#e-quit').addEventListener('click', showTitle);
  veil.querySelector('.act.primary').focus();
  renderer.setHand(0, 0, false, false); renderer.setCursor(0, 0, 0);
}

// ----- HUD -----

function updateHud() {
  const me = world.tribes[ME], foe = world.tribes[FOE], r = uiRefs;
  r['b-value'].textContent = Math.floor(me.belief);
  const rate = me.pop * 0.012 + me.praying * 0.15;
  r['b-rate'].textContent = `${me.praying} praying, +${rate.toFixed(1)} a second`;
  r['s-pop'].textContent = `${me.pop}/${me.capacity}`; r['s-war'].textContent = me.warriors; r['s-wood'].textContent = Math.floor(me.wood);
  r['my-temple'].style.width = `${(me.temple ? me.temple.hp / BUILDINGS.temple.hp : 0) * 100}%`;
  r['foe-temple'].style.width = `${(foe.temple ? foe.temple.hp / BUILDINGS.temple.hp : 0) * 100}%`;
  const line = `${foe.pop} followers, ${foe.warriors} warriors`;
  if (line !== statsLine) { r['f-line'].textContent = line; statsLine = line; }
  ui.querySelectorAll('.tool.miracle').forEach((b) => {
    const id = b.dataset.tool, m = MIRACLES[id], left = (me.cooldowns[id] || 0) - world.time;
    b.classList.toggle('poor', me.belief < m.cost); b.querySelector('.cool').style.setProperty('--cool', left > 0 ? left / m.cooldown : 0);
  });
}

function drawMinimap() {
  const c = uiRefs.minimap; if (!c) return;
  const g = c.getContext('2d'), image = g.createImageData(N, N), d = image.data, h = world.heights, inf = world.influence;
  for (let i = 0; i < N * N; i++) {
    const v = h[i], o = i * 4; let r, gr, b;
    if (v <= world.sea) { const deep = Math.min(1, (world.sea - v) / 1.4); r = 38 - deep * 22; gr = 121 - deep * 66; b = 150 - deep * 40; }
    else if (v < 0.5) { r = 197; gr = 168; b = 112; } else { const t = Math.min(1, v / 5); r = 100 + t * 70; gr = 112 + t * 28; b = 58 + t * 60; }
    if (inf[i] & 1 && v > world.sea) { r = r * 0.78 + 63 * 0.22; gr = gr * 0.78 + 124 * 0.22; b = b * 0.78 + 240 * 0.22; }
    if (inf[i] & 2 && v > world.sea) { r = r * 0.78 + 224 * 0.22; gr = gr * 0.78 + 67 * 0.22; b = b * 0.78 + 47 * 0.22; }
    d[o] = r; d[o + 1] = gr; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  for (const b of world.buildings) { g.fillStyle = TEAM_COLORS[b.tribe]; const s = b.type === 'temple' ? 6 : 2; g.fillRect(b.x - s / 2, b.y - s / 2, s, s); if (b.type === 'temple') { g.fillStyle = '#f1e8d3'; g.fillRect(b.x - 1, b.y - 1, 2, 2); } }
  for (const p of world.people) { g.fillStyle = TEAM_COLORS[p.tribe]; g.fillRect(p.x, p.y, 1, 1); }
  const t = renderer.controls.target; g.strokeStyle = '#f1e8d3'; g.lineWidth = 1; g.strokeRect(t.x - 9, t.z - 7, 18, 14);
}

// ----- Input -----

function refreshGround(e) {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; pointer.ground = renderer.groundAt(e.clientX, e.clientY);
}

function cast(id) {
  const g = pointer.ground; if (!g) return deny('Pick a spot on the map.');
  const result = world.act(ME, { type: 'miracle', name: id, x: g.x, y: g.y });
  if (!result.ok) return deny(result.reason);
  if (id === 'rain') progress.rain++;
  selectTool('hand');
}
function deny(reason) { play('deny'); omen(reason, true); }

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play' || paused) return;
  initAudio(); activePointers.set(e.pointerId, e);
  refreshGround(e);
  if (activePointers.size > 1) { // A second finger means the camera, so drop whatever the first was doing.
    stroke = null; panning = null; if (held) releaseHeld(0, 0); return;
  }
  if (e.button === 2) { pointer.rightStart = { x: e.clientX, y: e.clientY }; return; }
  if (e.button !== 0) return;
  const g = pointer.ground;
  if (tool === 'hand') {
    const hit = renderer.pickEntity(e.clientX, e.clientY);
    if (hit) {
      const r = world.act(ME, { type: 'grab', kind: hit.kind, id: hit.id });
      if (r.ok) { held = hit; trail = []; progress.grabs++; return; }
      if (hit.kind === 'person') { deny(r.reason); return; }
    }
    panning = { x: e.clientX, y: e.clientY };
    return;
  }
  if (TOOLS.find((t) => t.id === tool)?.stroke) {
    if (!g) return;
    stroke = { type: tool, height: tool === 'level' ? Math.max(world.heightAt(g.x, g.y), world.sea + 0.5) : undefined, denied: false };
    strokeTimer = 0;
    return;
  }
  if (tool === 'standard') {
    if (!g) return;
    const current = world.tribes[ME].standard;
    if (current && Math.hypot(current.x - g.x, current.y - g.y) < 2.2) { world.act(ME, { type: 'standard', remove: true }); omen('Your warriors return home.'); selectTool('hand'); return; }
    const r = world.act(ME, { type: 'standard', x: g.x, y: g.y });
    if (!r.ok) deny(r.reason); else { progress.standards++; play('horn'); selectTool('hand'); }
    return;
  }
  if (MIRACLES[tool]) cast(tool);
});
addEventListener('pointermove', (e) => {
  if (mode !== 'play') return;
  if (e.target !== canvas && !held && !stroke && !panning) { pointer.inside = false; return; }
  refreshGround(e);
  if (panning && activePointers.size <= 1) {
    const dx = e.clientX - panning.x, dy = e.clientY - panning.y; panning.x = e.clientX; panning.y = e.clientY;
    const a = renderer.controls.getAzimuthalAngle(), speedFactor = renderer.camera.position.distanceTo(renderer.controls.target) / Math.max(320, innerHeight) * 1.25;
    renderer.panBy((-Math.cos(a) * dx - Math.sin(a) * dy) * speedFactor, (Math.sin(a) * dx - Math.cos(a) * dy) * speedFactor);
  }
  if (held && pointer.ground) trail.push({ x: pointer.ground.x, y: pointer.ground.y, t: performance.now() });
  if (trail.length > 8) trail.shift();
});
function releaseHeld(vx, vy) {
  const g = pointer.ground || { x: renderer.hand.x, y: renderer.hand.y };
  world.act(ME, { type: 'release', x: g.x, y: g.y, z: Math.max(world.heightAt(g.x, g.y), world.sea) + 2.3, vx, vy });
  held = null; trail = []; play('drop');
}
const pointerEnd = (e) => {
  activePointers.delete(e.pointerId);
  if (mode !== 'play') return;
  if (pointer.rightStart && e.button === 2) { if (Math.hypot(e.clientX - pointer.rightStart.x, e.clientY - pointer.rightStart.y) < 6) selectTool('hand'); pointer.rightStart = null; }
  stroke = null; panning = null;
  if (held) {
    let vx = 0, vy = 0; const now = performance.now(), recent = trail.filter((s) => now - s.t < 130);
    if (recent.length >= 2) { const a = recent[0], b = recent[recent.length - 1], dt = Math.max(0.016, (b.t - a.t) / 1000); vx = (b.x - a.x) / dt; vy = (b.y - a.y) / dt; if (Math.hypot(vx, vy) < 3.5) vx = vy = 0; }
    releaseHeld(vx, vy);
  }
};
addEventListener('pointerup', pointerEnd); addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('pointerleave', () => { if (!held && !stroke) pointer.inside = false; });

addEventListener('keydown', (e) => {
  if (mode !== 'play' || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'p' || (k === ' ' && !paused && e.target === canvas)) { e.preventDefault(); togglePause(); return; }
  if (k === 'm') return toggleSound();
  if (k === 'escape') { if (paused && document.getElementById('pause-veil')) return togglePause(); if (tool !== 'hand') return selectTool('hand'); return togglePause(); }
  if (paused) return;
  const t = TOOLS.find((x) => x.key === k); if (t) return selectTool(t.id);
  for (const [id, key] of Object.entries(MIRACLE_KEYS)) if (key.toLowerCase() === k) return selectTool(id);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

// ----- Loop -----

function updateCameraKeys(dt) {
  if (mode !== 'play') return;
  const right = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  if (right || forward) renderer.panScreen(right * dt * 38, forward * dt * 38);
  const turn = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0); if (turn) renderer.rotate(turn * dt * 1.4);
}

function applyStroke(dt) {
  if (!stroke || !pointer.ground || paused) return;
  strokeTimer -= dt; if (strokeTimer > 0) return; strokeTimer = 1 / 8;
  const g = pointer.ground, r = world.act(ME, { type: stroke.type, x: g.x, y: g.y, height: stroke.height });
  if (r.ok) { progress.strokes++; if (stroke.type === 'raise') progress.raises++; play(stroke.type === 'lower' ? 'lower' : 'raise'); }
  else if (!stroke.denied) { stroke.denied = true; deny(r.reason); }
}

function updateCursor() {
  if (mode !== 'play') return;
  const g = pointer.ground;
  const showHand = (tool === 'hand' || held) && pointer.inside && (g || held);
  if (g || !held) renderer.setHand(g ? g.x : renderer.hand.x, g ? g.y : renderer.hand.y, !!showHand, !!held);
  if (!pointer.inside || !g) { renderer.setCursor(0, 0, 0); hover = null; return; }
  if (tool === 'hand') {
    if (held) { renderer.setCursor(0, 0, 0); return; }
    hover = renderer.pickEntity(pointer.x, pointer.y);
    if (hover) renderer.setCursor(hover.ref.x, hover.ref.y, hover.kind === 'person' ? 0.65 : 1, world.inInfluence(ME, hover.ref.x, hover.ref.y));
    else renderer.setCursor(0, 0, 0);
    return;
  }
  const radius = MIRACLES[tool]?.radius ?? (tool === 'raise' || tool === 'lower' ? 3.2 : tool === 'level' ? 2.8 : tool === 'standard' ? 1.6 : 0);
  renderer.setCursor(g.x, g.y, radius || (tool === 'flood' ? 0 : 1), tool === 'flood' || world.inInfluence(ME, g.x, g.y));
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const step = mode === 'menu' ? 1 : paused || mode === 'over' ? 0 : speed;
  accumulator += dt * step;
  let guard = 0; while (accumulator >= DT && guard++ < 6) { accumulator -= DT; world.step(); }
  if (guard >= 6) accumulator = 0;
  if (mode === 'menu' && world.over) { const old = world.rivals.length; world = new World({ seed: Math.floor(Math.random() * 1e9) }); if (old) world.rivals.push(new RivalGod(0, 'wrathful'), new RivalGod(1, 'wrathful')); const p = renderer.camera.position.clone(), t = renderer.controls.target.clone(); renderer.setWorld(world); renderer.camera.position.copy(p); renderer.controls.target.copy(t); }
  handleEvents(mode === 'play');
  if (mode === 'play') {
    updateCameraKeys(dt); applyStroke(dt); updateCursor();
    uiTimer -= dt; if (uiTimer <= 0) { uiTimer = 0.2; updateHud(); watchOmens(); advanceProphecy(); tickOmens(now); }
    miniTimer -= dt; if (miniTimer <= 0) { miniTimer = 0.75; drawMinimap(); }
    if (world.over) { handleEvents(true); endMatch(); }
  }
  renderer.frame(dt, step > 0 || mode === 'over');
}

async function boot() {
  try {
    renderer = new GodRenderer(canvas);
    ui.innerHTML = '<div class="fatal">Shaping the land…</div>';
    await renderer.load('models');
  } catch (error) {
    console.error(error);
    ui.innerHTML = '<div class="fatal"><p>The game could not start. It needs WebGL and must be opened through a web server, not as a local file. <a href="../index.html">Back to Kenny</a></p></div>';
    return;
  }
  showTitle();
  window.__clay = { get world() { return world; }, renderer, startMatch, get mode() { return mode; } };
  requestAnimationFrame(loop);
}
boot();
