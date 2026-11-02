// Screens: hangar (pick robots and start a battle), garage (build and program), battle, results.
import * as P from './parts.js';
import { PRESETS, starterProgram } from './presets.js';
import { ARENAS } from './arenas.js';
import { Battle, DT } from './sim.js';
import { BlockEditor } from './blocks-ui.js';
import { ArenaView, Turntable, robotThumbnail } from './render.js';
import * as Store from './storage.js';
import { initAudio, play, setMuted, isMuted } from './audio.js';

const app = document.getElementById('app'), dlg = document.getElementById('dlg'), toastEl = document.getElementById('toast');

/** Tiny element builder. Text always goes in as text, so untrusted robot names can't inject markup. */
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}

let toastTimer;
function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3600); }

let cleanup = null;
function show(fn, ...args) { cleanup?.(); cleanup = null; app.replaceChildren(); window.scrollTo(0, 0); cleanup = fn(...args) || null; }

const clone = (o) => JSON.parse(JSON.stringify(o));
const state = {
  tab: 'stock', roster: [], arena: 'foundry', mode: 'ffa', publicBots: null, publicError: null,
};
const thumbs = new Map();
function thumbFor(b) {
  const k = JSON.stringify(b.design) + b.color;
  if (!thumbs.has(k)) thumbs.set(k, robotThumbnail(b.design, b.color));
  return thumbs.get(k);
}
function topbar(title, ...right) {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '../index.html', title: 'Back to Kenny' }, 'Kenny'),
    h('h1', { class: 'scr-title' }, title), h('div', { class: 'tb-right' }, right));
}

// ------------------------------------------------------------------ Hangar
function hangar() {
  const main = h('div', { class: 'hangar' });
  app.append(topbar('Robot Arena', h('button', { class: 'btn', onclick: importDialog }, 'Import a robot'), h('button', { class: 'btn primary', onclick: () => show(garage, newBot()) }, 'Build a new robot')), main);

  const listEl = h('div', { class: 'bot-grid' }), tabs = h('div', { class: 'tabs', role: 'tablist' });
  const rosterEl = h('div', { class: 'roster' });
  main.append(h('section', { class: 'bots-panel' }, tabs, listEl), h('aside', { class: 'battle-panel' }, rosterEl));

  function drawTabs() {
    tabs.replaceChildren(...[['stock', 'Stock robots'], ['mine', 'Your robots'], ['public', 'Public hangar']].map(([id, name]) =>
      h('button', { role: 'tab', class: 'tab' + (state.tab === id ? ' on' : ''), 'aria-selected': String(state.tab === id), onclick: () => { state.tab = id; drawList(); drawTabs(); } }, name)));
  }

  function card(b) {
    const stats = P.computeStats(b.design), inRoster = state.roster.filter((r) => r.id === b.id).length;
    const add = () => { if (state.roster.length >= 8) return toast('A battle holds up to 8 robots.'); state.roster.push(b); play('click'); drawList(); drawRoster(); };
    return h('article', { class: 'bot-card' },
      h('button', { class: 'bot-thumb', style: `--bot:${b.color}`, onclick: add, title: `Add ${b.name} to the battle` },
        h('img', { src: thumbFor(b), alt: '', draggable: false }), inRoster ? h('span', { class: 'count' }, `${inRoster} in battle`) : null),
      h('div', { class: 'bot-info' },
        h('h3', {}, b.name),
        h('p', { class: 'by' }, b.stock ? 'Stock robot' : b.by ? `by ${b.by}` : 'Your robot', b.wins != null && (b.wins || b.losses) ? `, ${b.wins} wins, ${b.losses} losses` : ''),
        h('p', { class: 'blurb' }, b.blurb || `${P.CHASSIS[b.design.chassis].name}, ${P.DRIVES[b.design.drive].name.toLowerCase()}, ${b.design.weapons.map((w) => P.WEAPONS[w].name.toLowerCase()).join(' and ')}.`),
        h('p', { class: 'cost' }, `${stats.cost} credits`),
        h('div', { class: 'bot-actions' },
          h('button', { class: 'btn small primary', onclick: add }, 'Add to battle'),
          h('button', { class: 'btn small', onclick: () => show(garage, b.stock || b.remote ? { ...clone(b), id: null, stock: false, remote: false, name: b.name + ' copy' } : clone(b)) }, b.stock || b.remote ? 'Copy and edit' : 'Edit'),
          h('button', { class: 'btn small', onclick: () => shareDialog(b) }, 'Share'),
          !b.stock && !b.remote ? h('button', { class: 'btn small ghosty', onclick: () => { deleteConfirm(b, () => { state.roster = state.roster.filter((r) => r.id !== b.id); drawList(); drawRoster(); }); } }, 'Delete') : null,
          b.url ? h('a', { class: 'btn small ghosty', href: b.url, target: '_blank', rel: 'noopener' }, 'Post') : null,
        )));
  }

  function drawList() {
    listEl.replaceChildren();
    if (state.tab === 'stock') listEl.append(...PRESETS.map(card));
    if (state.tab === 'mine') {
      const mine = Store.loadBots();
      if (mine.length) listEl.append(...mine.map(card));
      else listEl.append(h('div', { class: 'empty-note' }, h('p', {}, 'You have not saved a robot yet.'), h('button', { class: 'btn primary', onclick: () => show(garage, newBot()) }, 'Build a new robot')));
    }
    if (state.tab === 'public') {
      listEl.append(h('p', { class: 'pub-intro' }, 'Robots other players have published. Publish yours from its Share button.'));
      if (state.publicBots) {
        if (state.publicBots.length) listEl.append(...state.publicBots.map(card));
        else listEl.append(h('div', { class: 'empty-note' }, h('p', {}, 'No robots have been published yet. Yours can be the first.')));
      } else if (state.publicError) listEl.append(h('div', { class: 'empty-note' }, h('p', {}, state.publicError), h('button', { class: 'btn', onclick: () => { state.publicError = null; loadPublic(true); } }, 'Try again')));
      else { listEl.append(h('div', { class: 'empty-note' }, h('p', {}, 'Loading published robots…'))); loadPublic(); }
    }
  }
  async function loadPublic(force = false) {
    try { state.publicBots = await Store.fetchPublic(force); }
    catch (e) { state.publicError = e instanceof TypeError ? 'Could not reach GitHub. Check your connection and try again.' : e.message; }
    if (state.tab === 'public') drawList();
  }

  function drawRoster() {
    const a = ARENAS[state.arena];
    const need = state.roster.length < 2;
    rosterEl.replaceChildren(
      h('h2', {}, 'Battle'),
      h('ul', { class: 'roster-list' }, state.roster.length ? state.roster.map((b, i) =>
        h('li', { style: `--bot:${b.color}` }, h('i', { class: 'dot' }), h('span', {}, b.name),
          state.mode === 'teams' ? h('em', { class: i % 2 ? 'team blue' : 'team red' }, i % 2 ? 'Blue' : 'Red') : null,
          h('button', { class: 'x', 'aria-label': `Remove ${b.name}`, onclick: () => { state.roster.splice(i, 1); drawRoster(); drawList(); } }, '×')))
        : h('li', { class: 'none' }, 'Pick at least two robots.')),
      h('label', { class: 'field' }, 'Arena', h('select', { onchange: (e) => { state.arena = e.target.value; drawRoster(); } }, Object.entries(ARENAS).map(([id, x]) => h('option', { value: id, selected: id === state.arena }, x.name)))),
      h('p', { class: 'arena-desc' }, a.desc),
      h('label', { class: 'field' }, 'Rules', h('select', { onchange: (e) => { state.mode = e.target.value; drawRoster(); } },
        h('option', { value: 'ffa', selected: state.mode === 'ffa' }, 'Free for all'), h('option', { value: 'teams', selected: state.mode === 'teams' }, 'Red team against blue team'))),
      h('button', { class: 'btn fight', disabled: need, onclick: () => startBattle(state.roster, state.arena, state.mode, () => show(hangar)) }, 'Start battle'),
    );
  }
  drawTabs(); drawList(); drawRoster();
}

function deleteConfirm(b, done) {
  openDialog(h('div', {}, h('h2', {}, `Delete ${b.name}?`), h('p', {}, 'This removes it from this device. It cannot be undone.'),
    h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Keep it'), h('button', { class: 'btn danger', onclick: () => { Store.deleteBot(b.id); dlg.close(); done(); toast(`Deleted ${b.name}.`); } }, 'Delete'))));
}

function openDialog(content) { dlg.replaceChildren(content); dlg.showModal(); }

function shareDialog(b) {
  const link = Store.shareLink(b);
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Your browser blocked copying. Select the text and copy it yourself.'); } };
  const pub = Store.publishUrl(b);
  const area = h('textarea', { class: 'code', readOnly: true, rows: 3 }, link);
  openDialog(h('div', { class: 'share' },
    h('h2', {}, `Share ${b.name}`),
    h('h3', {}, 'Send a link'), h('p', {}, 'Anyone who opens this link can add the robot to their hangar.'), area,
    h('div', { class: 'dlg-actions left' }, h('button', { class: 'btn primary', onclick: () => copy(link, 'Link copied.') }, 'Copy link'),
      h('button', { class: 'btn', onclick: () => { const u = URL.createObjectURL(new Blob([Store.botJSON(b)], { type: 'application/json' })); const a = h('a', { href: u, download: b.name.replace(/[^\w-]+/g, '_') + '.kennybot.json' }); a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); } }, 'Download file')),
    h('h3', {}, 'Publish to the public hangar'),
    h('p', {}, 'Publishing posts your robot as an issue on the Kenny GitHub repo, where every player can see it. You need a free GitHub account. Close the issue to take it down.'),
    pub.body ? h('p', { class: 'note' }, 'This robot is too large for an automatic form. When GitHub opens, paste into the description box. It is on your clipboard after you press Publish.') : null,
    h('div', { class: 'dlg-actions left' }, h('button', { class: 'btn', onclick: async () => { if (pub.body) await copy(pub.body, 'Robot copied. Paste it into the GitHub description.'); window.open(pub.url, '_blank', 'noopener'); } }, 'Publish on GitHub')),
    h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Close'))));
  area.addEventListener('focus', () => area.select());
}

function importDialog() {
  const area = h('textarea', { class: 'code', rows: 5, placeholder: 'Paste a share link or robot file contents' });
  const err = h('p', { class: 'err', hidden: true });
  const take = (text) => {
    try {
      const t = text.trim(); let bot;
      const m = /#bot=([\w-]+)/.exec(t);
      if (m) bot = Store.decodeBot(m[1]); else if (t.startsWith('{')) bot = Store.sanitizeBot(JSON.parse(t)); else bot = Store.decodeBot(t);
      addImported(bot); dlg.close();
    } catch (e) { err.textContent = e instanceof SyntaxError || e.name === 'InvalidCharacterError' || e instanceof URIError ? 'That is not a robot link or file.' : e.message; err.hidden = false; }
  };
  openDialog(h('div', {}, h('h2', {}, 'Import a robot'), area, err,
    h('label', { class: 'btn file-btn' }, 'Choose a file', h('input', { type: 'file', accept: '.json,application/json', onchange: async (e) => { const f = e.target.files[0]; if (f) { if (f.size > 500000) { err.textContent = 'That file is too large to be a robot.'; err.hidden = false; return; } take(await f.text()); } } })),
    h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => take(area.value) }, 'Add to my robots'))));
}
function addImported(bot) {
  const { stored } = Store.saveBot({ ...bot, id: null });
  state.tab = 'mine'; show(hangar);
  toast(stored ? `Added ${bot.name} to your robots.` : 'Your browser is blocking storage, so this robot cannot be saved.');
}

// ------------------------------------------------------------------ Garage
const newBot = () => ({ id: null, name: 'New robot', by: '', color: P.COLORS[Math.floor(Math.random() * 6)], design: P.defaultDesign(), program: starterProgram() });

const GROUPS = [
  { id: 'chassis', name: 'Chassis', table: P.CHASSIS, stats: (x) => `${Math.round(x.hp * 1.5)} health, ${x.hardpoints} weapon${x.hardpoints > 1 ? 's' : ''}, ${x.modules} module${x.modules > 1 ? 's' : ''}` },
  { id: 'drive', name: 'Movement', table: P.DRIVES, stats: (x) => `Top speed ${x.speed} m/s` },
  { id: 'engine', name: 'Engine', table: P.ENGINES, stats: (x) => `${x.power} power, ${x.energy} energy, +${x.regen} a second` },
  { id: 'armor', name: 'Armor', table: P.ARMORS, stats: (x) => x.hp ? `+${Math.round(x.hp * 1.5)} health` : 'No added health' },
  { id: 'radar', name: 'Radar', table: P.RADARS, stats: (x) => `${x.range} m range, ${x.cone}° view` },
  { id: 'turret', name: 'Turret', table: P.TURRETS, stats: (x) => x.slew ? `Turns ${x.slew}° a second` : 'Turn the whole robot to aim' },
  { id: 'cpu', name: 'CPU', table: P.CPUS, stats: () => '' },
  { id: 'weapons', name: 'Weapons', table: P.WEAPONS, multi: true, dup: true, stats: (x) => weaponLine(x) },
  { id: 'modules', name: 'Modules', table: P.MODULES, multi: true, stats: () => '' },
];
const weaponLine = (w) => {
  const dps = w.dmg * (w.pellets || 1) / w.cd;
  return [`${dps.toFixed(0)} damage a second`, w.range > 3 ? `${w.range} m` : null, w.en ? `${(w.en / w.cd).toFixed(0)} energy a second` : null].filter(Boolean).join(', ');
};

function garage(bot) {
  bot.program = bot.program || [];
  let group = 'chassis', dirty = false, view = 'build';
  const prob = () => { const p = P.designProblems(bot.design); if (ed && ed.count() > P.CPUS[bot.design.cpu].blocks) p.push(`Program uses ${ed.count()} blocks, but ${P.CPUS[bot.design.cpu].name} allows ${P.CPUS[bot.design.cpu].blocks}. Remove blocks or fit a bigger CPU.`); return p; };

  const nameIn = h('input', { class: 'name-in', value: bot.name, maxLength: 24, 'aria-label': 'Robot name', oninput: (e) => { bot.name = e.target.value; dirty = true; } });
  const byIn = h('input', { class: 'by-in', value: bot.by || '', maxLength: 24, placeholder: 'Your name', 'aria-label': 'Your name', oninput: (e) => { bot.by = e.target.value; dirty = true; } });
  const budget = h('div', { class: 'budget', role: 'meter', 'aria-label': 'Budget used', 'aria-valuemin': 0, 'aria-valuemax': P.BUDGET });
  const saveBtn = h('button', { class: 'btn primary', onclick: save }, 'Save robot');
  const testBtn = h('button', { class: 'btn', onclick: test }, 'Test against a dummy');
  const backBtn = h('button', { class: 'btn', onclick: () => { if (!dirty) return show(hangar); openDialog(h('div', {}, h('h2', {}, 'Leave without saving?'), h('p', {}, 'Your changes to this robot will be lost.'), h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Keep working'), h('button', { class: 'btn danger', onclick: () => { dlg.close(); show(hangar); } }, 'Leave')))); } }, 'Back to hangar');

  const tabBuild = h('button', { class: 'tab on', role: 'tab', onclick: () => setView('build') }, 'Build');
  const tabCode = h('button', { class: 'tab', role: 'tab', onclick: () => setView('code') }, 'Program');
  const probEl = h('div', { class: 'problems', role: 'status' });

  const catTabs = h('div', { class: 'cat-tabs' }), catList = h('div', { class: 'cat-list' });
  const previewBox = h('div', { class: 'preview' }, h('canvas', {}));
  const coneToggle = h('label', { class: 'cone-toggle' }, h('input', { type: 'checkbox', onchange: () => drawPreview() }), 'Show radar coverage');
  const statsEl = h('div', { class: 'stats' }), colorEl = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Paint' });

  const buildView = h('div', { class: 'build' },
    h('div', { class: 'catalog' }, catTabs, catList),
    h('div', { class: 'preview-col' }, previewBox, coneToggle, colorEl),
    h('div', { class: 'stats-col' }, statsEl));
  const palEl = h('div', { class: 'palette' }), wsEl = h('div', { class: 'workspace' });
  const countEl = h('span', { class: 'count-pill' });
  const codeView = h('div', { class: 'code-view', hidden: true },
    h('div', { class: 'code-bar' }, countEl,
      h('button', { class: 'btn small', onclick: () => ed.undo() }, 'Undo'), h('button', { class: 'btn small', onclick: () => ed.redo() }, 'Redo'),
      h('button', { class: 'btn small', onclick: () => samples() }, 'Load a sample'),
      h('button', { class: 'btn small ghosty', onclick: () => ed.clear() }, 'Clear all'),
      h('button', { class: 'btn small ghosty', onclick: helpDialog }, 'How programs work')),
    h('div', { class: 'code-split' }, palEl, wsEl));

  app.append(
    h('header', { class: 'topbar garage-top' }, h('a', { class: 'brand', href: '../index.html' }, 'Kenny'), h('div', { class: 'nameblock' }, nameIn, byIn), budget, h('div', { class: 'tb-right' }, backBtn, testBtn, saveBtn)),
    h('div', { class: 'gar-tabs' }, h('div', { class: 'tabs', role: 'tablist' }, tabBuild, tabCode), probEl),
    h('main', { class: 'gar-main' }, buildView, codeView));

  const ed = new BlockEditor(palEl, wsEl, { toast, onChange: (p) => { bot.program = p; dirty = true; refresh(); } });
  ed.setProgram(bot.program);
  const tt = new Turntable(previewBox.querySelector('canvas'));

  function setView(v) {
    view = v; buildView.hidden = v !== 'build'; codeView.hidden = v !== 'code';
    tabBuild.classList.toggle('on', v === 'build'); tabCode.classList.toggle('on', v === 'code');
    if (v === 'build') tt.resize();
  }
  function drawPreview() { tt.setRobot(bot.design, bot.color, coneToggle.querySelector('input').checked); }
  function refresh() {
    const d = bot.design, cost = P.designCost(d), left = P.BUDGET - cost, s = P.computeStats(d);
    budget.replaceChildren(h('span', { class: 'bud-num' + (left < 0 ? ' over' : '') }, left >= 0 ? `${left} credits left` : `${-left} credits over`),
      h('i', { class: 'bud-bar' }, h('b', { class: left < 0 ? 'over' : '', style: `width:${Math.min(100, cost / P.BUDGET * 100)}%` })));
    budget.setAttribute('aria-valuenow', cost);
    const bar = (name, v, max, txt) => h('div', { class: 'stat' }, h('span', { class: 'st-name' }, name), h('span', { class: 'st-val' }, txt), h('i', { class: 'st-bar' }, h('b', { style: `width:${Math.min(100, v / max * 100)}%` })));
    statsEl.replaceChildren(...[h('h3', {}, 'Performance'),
      bar('Health', s.hp, 320, s.hp), bar('Top speed', s.speed, 19, `${s.speed.toFixed(1)} m/s`), bar('Turning', s.turn, 240, `${Math.round(s.turn)}°/s`),
      bar('Weight', s.mass, 200, `${s.mass} kg`), bar('Energy', s.energy, 170, s.energy), bar('Radar range', s.radar.range, 90, `${s.radar.range} m`),
      h('h3', {}, 'Fitted weapons'),
      h('ol', { class: 'fit' }, d.weapons.map((w, i) => h('li', {}, h('span', {}, P.WEAPONS[w].name), h('button', { class: 'x', 'aria-label': `Remove ${P.WEAPONS[w].name}`, onclick: () => { d.weapons.splice(i, 1); changed(); } }, '×')))),
      d.weapons.length ? null : h('p', { class: 'mini' }, 'None. Pick some under Weapons.'),
      h('h3', {}, 'Fitted modules'),
      h('ul', { class: 'fit plain' }, d.modules.map((m, i) => h('li', {}, h('span', {}, P.MODULES[m].name), h('button', { class: 'x', 'aria-label': `Remove ${P.MODULES[m].name}`, onclick: () => { d.modules.splice(i, 1); changed(); } }, '×')))),
      d.modules.length ? null : h('p', { class: 'mini' }, 'None fitted.')].filter(Boolean));
    const cpu = P.CPUS[d.cpu], n = ed.count();
    countEl.textContent = `${n} of ${cpu.blocks} blocks, ${cpu.name}`; countEl.classList.toggle('over', n > cpu.blocks);
    const ps = prob();
    probEl.replaceChildren(...ps.map((x) => h('p', {}, x)));
    saveBtn.disabled = testBtn.disabled = ps.length > 0;
  }
  function changed() { dirty = true; drawCat(); refresh(); drawPreview(); play('click'); }

  function drawCat() {
    catTabs.replaceChildren(...GROUPS.map((g) => h('button', { class: 'cat-tab' + (g.id === group ? ' on' : ''), onclick: () => { group = g.id; drawCat(); } }, g.name)));
    const g = GROUPS.find((x) => x.id === group), d = bot.design;
    const hint = g.id === 'weapons' ? `Slots used: ${d.weapons.length} of ${P.CHASSIS[d.chassis].hardpoints}. The order sets weapon 1, 2 and 3 in your program.` : g.id === 'modules' ? `Slots used: ${d.modules.length} of ${P.CHASSIS[d.chassis].modules}.` : null;
    catList.replaceChildren(...[hint && h('p', { class: 'cat-hint' }, hint), ...Object.entries(g.table).map(([id, x]) => {
      const count = g.multi ? d[g.id].filter((v) => v === id).length : d[g.id] === id ? 1 : 0;
      return h('button', { class: 'part' + (count ? ' on' : ''), 'aria-pressed': String(!!count), onclick: () => {
        if (!g.multi) d[g.id] = id;
        else if (g.dup) { const cap = P.CHASSIS[d.chassis].hardpoints; if (d.weapons.length >= cap) { toast(`${P.CHASSIS[d.chassis].name} holds ${cap} weapon${cap > 1 ? 's' : ''}. Remove one first, or use a bigger chassis.`); return; } d.weapons.push(id); }
        else if (count) d.modules = d.modules.filter((m) => m !== id);
        else { const cap = P.CHASSIS[d.chassis].modules; if (d.modules.length >= cap) { toast(`${P.CHASSIS[d.chassis].name} holds ${cap} module${cap > 1 ? 's' : ''}. Remove one first.`); return; } d.modules.push(id); }
        changed();
      } },
      h('span', { class: 'part-top' }, h('b', {}, x.name), g.dup && count ? h('em', { class: 'part-n' }, `×${count}`) : null, h('span', { class: 'part-cost' }, x.cost ? `${x.cost} cr` : 'Free')),
      h('span', { class: 'part-desc' }, x.desc),
      g.stats(x) ? h('span', { class: 'part-stats' }, g.stats(x), `, ${x.mass} kg`) : null);
    })].filter(Boolean));
  }
  colorEl.append(...P.COLORS.map((c) => h('button', { class: 'swatch', style: `background:${c}`, 'aria-label': `Paint ${c}`, onclick: () => { bot.color = c; dirty = true; drawPreview(); } })));

  function collect() { return { ...bot, name: bot.name.trim() || 'Unnamed', program: ed.program }; }
  function save() {
    const { bot: saved, stored } = Store.saveBot(collect());
    bot.id = saved.id; dirty = false; state.tab = 'mine';
    toast(stored ? `Saved ${saved.name}.` : 'Your browser is blocking storage, so this robot was not saved. Use Share to keep a copy.');
  }
  function test() {
    const me = collect(), snapshot = clone(me), d = PRESETS.find((p) => p.dummy);
    startBattle([snapshot, d], state.arena === 'pit' ? 'foundry' : state.arena, 'ffa', () => { show(garage, { ...snapshot, id: bot.id, __dirty: dirty }); });
  }
  function samples() {
    openDialog(h('div', {}, h('h2', {}, 'Load a sample program'), h('p', {}, 'This replaces your current program. Undo brings it back. A sample may use weapons or modules you have not fitted; those blocks then do nothing.'),
      h('div', { class: 'sample-list' }, PRESETS.filter((p) => !p.dummy).map((p) => h('button', { class: 'part', onclick: () => { ed.snapshot(); ed.program = clone(p.program); ed.changed(); dlg.close(); } }, h('span', { class: 'part-top' }, h('b', {}, p.name)), h('span', { class: 'part-desc' }, p.blurb)))),
      h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Cancel'))));
  }

  dirty = !!bot.__dirty; delete bot.__dirty;
  drawCat(); refresh(); drawPreview();
  const keys = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && view === 'code' && !e.target.matches('input,textarea')) { e.preventDefault(); e.shiftKey ? ed.redo() : ed.undo(); } };
  addEventListener('keydown', keys);
  const unload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', unload);
  return () => { removeEventListener('keydown', keys); removeEventListener('beforeunload', unload); tt.dispose(); };
}

function helpDialog() {
  openDialog(h('div', { class: 'help' }, h('h2', {}, 'How programs work'),
    h('p', {}, 'You never steer your robot during a battle. Its program does everything, so plan for what it should do on its own.'),
    h('ul', {},
      h('li', {}, 'The program runs from top to bottom on every CPU cycle. A faster CPU reacts sooner, and a bigger one fits more blocks.'),
      h('li', {}, 'Movement, radar and aim commands stay in force until something changes them. Weapons fire only on cycles that reach a fire block.'),
      h('li', {}, 'Your radar only knows what falls within its cone and range. Walls and smoke block it. The target is the last robot it saw, so its position can go stale.'),
      h('li', {}, 'Bearings are in degrees: 0 is straight ahead, positive is to your right. Wall readings are in metres and also count pits and lava your robot cannot cross.'),
      h('li', {}, 'Memory A, B and C hold numbers between cycles. Use them to count, to switch modes, or to remember what you were doing.'),
      h('li', {}, 'Blocks for parts you have not fitted do nothing. Click a block in your program and press Delete to remove it, or drag it back to the left.'),
    ), h('div', { class: 'dlg-actions' }, h('button', { class: 'btn primary', onclick: () => dlg.close() }, 'Got it'))));
}

// ------------------------------------------------------------------ Battle
function startBattle(bots, arenaId, mode, onExit) {
  initAudio();
  const seed = Math.floor(Math.random() * 1e9);
  show(battleScreen, bots, arenaId, mode, seed, onExit);
}

function battleScreen(bots, arenaId, mode, seed, onExit) {
  const entries = bots.map((bot, i) => ({ bot, team: mode === 'teams' ? i % 2 : undefined }));
  const sim = new Battle(entries, arenaId, seed);
  const canvas = h('canvas', { class: 'arena-canvas' }), overlay = h('div', { class: 'overlay' });
  const stage = h('div', { class: 'stage' }, canvas, overlay);
  const timeEl = h('b', { class: 'clock' }, '0:00'), warnEl = h('span', { class: 'warn', hidden: true }, 'Walls closing');
  let speed = 1, paused = false;
  const speedBtns = [0.5, 1, 2, 4].map((s) => h('button', { class: 'seg' + (s === 1 ? ' on' : ''), 'aria-label': `Speed ${s}`, onclick: () => { speed = s; speedBtns.forEach((b, i) => b.classList.toggle('on', [0.5, 1, 2, 4][i] === s)); } }, s === 0.5 ? '½×' : `${s}×`));
  const pauseBtn = h('button', { class: 'btn small', onclick: () => { paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; } }, 'Pause');
  const coneBtn = h('button', { class: 'btn small', 'aria-pressed': 'true', onclick: () => { view.showCones = !view.showCones; coneBtn.setAttribute('aria-pressed', String(view.showCones)); coneBtn.textContent = view.showCones ? 'Hide radar' : 'Show radar'; } }, 'Hide radar');
  const muteBtn = h('button', { class: 'btn small', onclick: () => { setMuted(!isMuted()); muteBtn.textContent = isMuted() ? 'Sound on' : 'Sound off'; } }, isMuted() ? 'Sound on' : 'Sound off');
  const camBtn = h('button', { class: 'btn small', onclick: () => view.overview() }, 'Reset view');
  const followBtn = h('button', { class: 'btn small', disabled: true, onclick: () => { view.followId = view.followId == null ? selected : null; followBtn.textContent = view.followId == null ? 'Follow' : 'Stop following'; } }, 'Follow');
  const exitBtn = h('button', { class: 'btn small', onclick: () => onExit() }, 'Leave battle');
  const cardsEl = h('div', { class: 'cards' }), telem = h('div', { class: 'telem', hidden: true });
  const results = h('div', { class: 'results', hidden: true });
  app.append(h('div', { class: 'battle' },
    h('header', { class: 'bbar' }, h('span', { class: 'arena-name' }, ARENAS[arenaId].name), timeEl, warnEl, h('div', { class: 'segs', role: 'group', 'aria-label': 'Speed' }, speedBtns), pauseBtn, followBtn, camBtn, coneBtn, muteBtn, h('span', { class: 'spacer' }), exitBtn),
    stage, h('aside', { class: 'side' }, cardsEl, telem), results));

  let view;
  try { view = new ArenaView(canvas, overlay); }
  catch { stage.replaceChildren(h('div', { class: 'empty-note' }, h('p', {}, 'This browser could not start 3D graphics. Turn on hardware acceleration or try another browser.'))); return null; }
  view.load(sim);

  let selected = null;
  const cards = sim.bots.map((b) => {
    const hp = h('b', { style: `background:${b.color}` }), en = h('b', {}), status = h('span', { class: 'cd-status' });
    const c = h('button', { class: 'card', style: `--bot:${b.color}`, onclick: () => select(selected === b.id ? null : b.id) },
      h('span', { class: 'cd-name' }, h('i', { class: 'dot' }), b.name, mode === 'teams' ? h('em', { class: b.team ? 'team blue' : 'team red' }, b.team ? 'Blue' : 'Red') : null),
      h('i', { class: 'bar hp' }, hp), h('i', { class: 'bar en' }, en), status);
    cardsEl.append(c);
    return { b, c, hp, en, status };
  });
  function select(id) {
    selected = id; view.selected = id; followBtn.disabled = id == null;
    if (id == null) { view.followId = null; followBtn.textContent = 'Follow'; } else if (view.followId != null) view.followId = id;
    cards.forEach((x) => x.c.classList.toggle('on', x.b.id === id)); telem.hidden = id == null; drawTelem();
  }
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) { const id = view.pick(e.clientX, e.clientY); select(id); } });

  function drawTelem() {
    if (selected == null) return;
    const b = sim.bots[selected], io = sim.io(b), v = (s) => io.sense(s), nf = (x) => (x === 999 ? 'none' : Math.round(x));
    const row = (k, val, cls) => h('div', { class: 'tl-row ' + (cls || '') }, h('span', {}, k), h('b', {}, val));
    telem.replaceChildren(...[h('h3', {}, `What ${b.name} senses`),
      row('Radar sees a robot', b.seesNow ? 'yes' : 'no', b.seesNow ? 'yes' : ''), row('Target distance', nf(v('target distance'))), row('Target bearing', Math.round(v('target bearing')) + '°'),
      row('Health', Math.round(v('my health %')) + '%'), row('Energy', Math.round(v('my energy %')) + '%'), row('Speed', v('my speed').toFixed(1) + ' m/s'),
      row('Wall ahead', Math.round(v('wall ahead')) + ' m'), row('Wall left', Math.round(v('wall left')) + ' m'), row('Wall right', Math.round(v('wall right')) + ' m'),
      row('Memory A, B, C', `${+b.mem.A.toFixed(1)}, ${+b.mem.B.toFixed(1)}, ${+b.mem.C.toFixed(1)}`),
      ...b.weapons.map((w, i) => row(`Weapon ${i + 1}: ${w.def.name}`, w.ammo === Infinity ? (w.cd <= 0 ? 'ready' : 'cycling') : `${w.ammo} left`)),
      row('Damage dealt', Math.round(b.stat.dealt))]);
  }

  let raf = 0, last = performance.now(), acc = 0, ended = false, uiT = 0, closing = 0;
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused && !sim.over) {
      acc += dt * speed;
      let n = 0;
      while (acc >= DT && !sim.over && n++ < 24) { sim.step(); view.syncStep(); acc -= DT; }
      if (n >= 24) acc = 0;
    }
    if (sim.over && !ended) { ended = true; closing = 1.2; }
    if (ended && closing > 0) { closing -= dt; if (closing <= 0) showResults(); }
    view.render(sim.over || paused ? 1 : Math.min(1, acc / DT), paused ? 0 : dt, !paused);
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.12;
      timeEl.textContent = fmt(sim.time); warnEl.hidden = !(sim.time > 120);
      for (const x of cards) {
        x.hp.style.width = `${Math.max(0, x.b.hp / x.b.stats.hp) * 100}%`; x.en.style.width = `${x.b.energy / x.b.stats.energy * 100}%`;
        x.c.classList.toggle('dead', !x.b.alive);
        x.status.textContent = !x.b.alive ? 'Destroyed' : x.b.shieldOn ? 'Shield on' : x.b.cloakOn ? 'Cloaked' : x.b.seesNow ? 'Target on radar' : 'Searching';
      }
      drawTelem();
    }
  }
  function showResults() {
    const ranked = [...sim.bots].sort((a, b) => (b.alive - a.alive) || (b.deathTime - a.deathTime) || (b.stat.dealt - a.stat.dealt));
    const w = sim.winner;
    if (w) play('win');
    for (const b of bots) if (b.id && !b.stock && !b.remote) { const r = sim.bots[bots.indexOf(b)]; Store.recordResult(b.id, r.team === sim.winnerTeam); }
    const title = !w ? 'A draw. Nobody survived.' : mode === 'teams' ? `${w.team ? 'Blue' : 'Red'} team wins` : `${w.name} wins`;
    results.replaceChildren(h('div', { class: 'res-box' },
      h('h2', {}, title), h('p', { class: 'res-sub' }, `After ${fmt(sim.time)} in ${ARENAS[arenaId].name}.`),
      h('table', {}, h('thead', {}, h('tr', {}, ['Robot', 'Result', 'Damage dealt', 'Damage taken', 'Kills'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, ranked.map((b) => h('tr', { style: `--bot:${b.color}` },
          h('td', {}, h('i', { class: 'dot' }), b.name), h('td', {}, b.alive ? `Survived, ${Math.round(b.hp / b.stats.hp * 100)}% health` : `Lost at ${fmt(b.deathTime)}`),
          h('td', {}, Math.round(b.stat.dealt)), h('td', {}, Math.round(b.stat.taken)), h('td', {}, b.stat.kills))))),
      h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', onclick: () => { results.hidden = true; } }, 'View the arena'), h('button', { class: 'btn', onclick: () => onExit() }, 'Back'), h('button', { class: 'btn primary', onclick: () => startBattle(bots, arenaId, mode, onExit) }, 'Fight again'))));
    results.hidden = false;
  }
  raf = requestAnimationFrame(frame);
  if (window.__kennyTest) window.__kennyBattle = { sim, setSpeed: (s) => { speed = s; } };
  return () => { cancelAnimationFrame(raf); view.dispose(); };
}

// ------------------------------------------------------------------ Start
function boot() {
  show(hangar);
  const m = /#bot=([\w-]+)/.exec(location.hash);
  if (m) {
    try {
      const bot = Store.decodeBot(m[1]);
      history.replaceState(null, '', location.pathname);
      openDialog(h('div', {}, h('h2', {}, `Add ${bot.name} to your robots?`), h('p', {}, bot.by ? `Someone shared this robot, built by ${bot.by}.` : 'Someone shared this robot with you.'),
        h('div', { class: 'share-thumb' }, h('img', { src: robotThumbnail(bot.design, bot.color), alt: '' })),
        h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Not now'), h('button', { class: 'btn primary', onclick: () => { dlg.close(); addImported(bot); } }, 'Add robot'))));
    } catch (e) { toast(`That share link did not work. ${e.message}`); }
  }
}
boot();
