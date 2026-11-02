// Saving robots: on this device, as share links and files, and in the public hangar.
// The public hangar stores each robot as a GitHub issue on the repo, so it needs no server.
import * as P from './parts.js';
import { sanitizeProgram, countBlocks } from './lang.js';

const KEY = 'kenny.arena.bots.v1';
export const REPO = 'jefrix/Kenny';
const TAG = '[BOT]';

const pick = (table, v, what) => {
  if (typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(table, v)) throw new Error(`Unknown ${what}.`);
  return v;
};

/** Validate a robot from any untrusted source. Throws with a readable message if it breaks the rules. */
export function sanitizeBot(raw) {
  if (!raw || typeof raw !== 'object' || !raw.design) throw new Error('This is not a robot file.');
  const r = raw.design;
  const design = {
    chassis: pick(P.CHASSIS, r.chassis, 'chassis'), drive: pick(P.DRIVES, r.drive, 'drive'),
    engine: pick(P.ENGINES, r.engine, 'engine'), armor: pick(P.ARMORS, r.armor, 'armor'),
    radar: pick(P.RADARS, r.radar, 'radar'), turret: pick(P.TURRETS, r.turret, 'turret'), cpu: pick(P.CPUS, r.cpu, 'CPU'),
    weapons: (Array.isArray(r.weapons) ? r.weapons : []).map((w) => pick(P.WEAPONS, w, 'weapon')),
    modules: [...new Set((Array.isArray(r.modules) ? r.modules : []).map((m) => pick(P.MODULES, m, 'module')))],
  };
  const problems = P.designProblems(design);
  if (problems.length) throw new Error(problems[0]);
  const program = sanitizeProgram(raw.program);
  if (countBlocks(program) > P.CPUS[design.cpu].blocks) throw new Error('Program has more blocks than its CPU allows.');
  const color = /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '#E5352B';
  return {
    name: String(raw.name || 'Unnamed').replace(/[\u0000-\u001f]/g, '').slice(0, 24) || 'Unnamed',
    by: String(raw.by || '').replace(/[\u0000-\u001f]/g, '').slice(0, 24),
    color, design, program,
  };
}

const portable = (b) => ({ name: b.name, by: b.by || '', color: b.color, design: b.design, program: b.program });

// ---- this device ----
export function loadBots() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return list.flatMap((b) => { try { return [{ ...sanitizeBot(b), id: b.id, wins: b.wins | 0, losses: b.losses | 0 }]; } catch { return []; } });
  } catch { return []; }
}
function writeBots(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}
export function saveBot(bot) {
  const list = loadBots();
  if (!bot.id || bot.stock || bot.remote) bot = { ...bot, id: 'bot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), stock: false, remote: false };
  const i = list.findIndex((b) => b.id === bot.id);
  if (i >= 0) list[i] = { ...list[i], ...bot }; else list.push(bot);
  return { bot, stored: writeBots(list) };
}
export function deleteBot(id) { writeBots(loadBots().filter((b) => b.id !== id)); }
export function recordResult(id, won) {
  const list = loadBots(), b = list.find((x) => x.id === id);
  if (b) { if (won) b.wins = (b.wins | 0) + 1; else b.losses = (b.losses | 0) + 1; writeBots(list); }
}

// ---- share links and files ----
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export const encodeBot = (b) => b64(JSON.stringify(portable(b)));
export const decodeBot = (code) => sanitizeBot(JSON.parse(unb64(code.trim())));
export const shareLink = (b) => `${location.origin}${location.pathname}#bot=${encodeBot(b)}`;
export const botJSON = (b) => JSON.stringify(portable(b), null, 1);

// ---- public hangar ----
const FENCE = '```';
export function publishUrl(b) {
  const json = JSON.stringify(portable(b));
  const body = `Robot for the Kenny arena. Keep the block below intact.\n\n${FENCE}json\n${json}\n${FENCE}\n`;
  const base = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`${TAG} ${b.name}`)}`;
  const full = `${base}&body=${encodeURIComponent(body)}`;
  // Browsers and GitHub reject very long URLs. For big programs, the player pastes from the clipboard.
  return full.length < 7500 ? { url: full, body: null } : { url: base, body };
}

const CACHE = 'kenny.arena.public.v1';
export async function fetchPublic(force = false) {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE) || 'null');
    if (!force && c && Date.now() - c.at < 5 * 60e3) return c.items.map((i) => parseIssue(i)).filter(Boolean);
  } catch { /* cache is optional */ }
  const r = await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=100&sort=created&direction=desc`, { headers: { Accept: 'application/vnd.github+json' } });
  if (r.status === 403 || r.status === 429) throw new Error('GitHub is limiting requests from your network. Try again in an hour.');
  if (!r.ok) throw new Error(`GitHub returned an error (${r.status}).`);
  const issues = await r.json();
  const items = issues.filter((i) => !i.pull_request && String(i.title).startsWith(TAG))
    .map((i) => ({ number: i.number, body: i.body, login: i.user && i.user.login, url: i.html_url }));
  try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), items })); } catch { /* cache is optional */ }
  return items.map((i) => parseIssue(i)).filter(Boolean);
}
function parseIssue(i) {
  const m = /```json\s*([\s\S]*?)```/.exec(i.body || '');
  if (!m) return null;
  try {
    const bot = sanitizeBot(JSON.parse(m[1]));
    // The author shown is the GitHub account that posted it, not whatever the file claims.
    return { ...bot, by: String(i.login || 'unknown').slice(0, 39), id: 'public-' + i.number, remote: true, url: i.url };
  } catch { return null; }
}
