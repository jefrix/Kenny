// The drag-and-drop block editor. It works on the program's data directly and redraws after each change.
import { BLOCKS, CATEGORIES, newBlock, countBlocks } from './lang.js';
import { play } from './audio.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export class BlockEditor {
  constructor(palette, workspace, { onChange, toast }) {
    this.pal = palette; this.ws = workspace; this.onChange = onChange; this.toast = toast;
    this.program = []; this.history = []; this.future = []; this.loc = new Map();
    this.buildPalette();
    this.ws.addEventListener('pointerdown', (e) => this.down(e));
    this.pal.addEventListener('pointerdown', (e) => this.down(e));
    this.ws.addEventListener('keydown', (e) => {
      if (e.target.matches('input,select')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { const b = e.target.closest('.blk'); if (b && b.node) { e.preventDefault(); this.snapshot(); this.detach(b.node); this.changed(); } }
    });
  }

  setProgram(p) { this.program = p; this.history = []; this.future = []; this.draw(); }
  snapshot() { this.history.push(JSON.stringify(this.program)); if (this.history.length > 60) this.history.shift(); this.future = []; }
  undo() { if (!this.history.length) return; this.future.push(JSON.stringify(this.program)); this.program = JSON.parse(this.history.pop()); this.changed(); }
  redo() { if (!this.future.length) return; this.history.push(JSON.stringify(this.program)); this.program = JSON.parse(this.future.pop()); this.changed(); }
  clear() { if (!this.program.length) return; this.snapshot(); this.program = []; this.changed(); }
  changed() { this.draw(); this.onChange?.(this.program); }
  count() { return countBlocks(this.program); }

  buildPalette() {
    this.pal.replaceChildren();
    for (const c of CATEGORIES) {
      const sec = el('section', 'pal-cat'); sec.append(el('h4', `pal-h c-${c.id}`, c.name));
      const groups = el('div', 'pal-items');
      for (const [op, def] of Object.entries(BLOCKS)) {
        if (def.cat !== c.id) continue;
        const n = this.renderNode(newBlock(op), true); n.dataset.paletteOp = op; n.title = 'Drag into your program, or click to add'; groups.append(n);
      }
      sec.append(groups); this.pal.append(sec);
    }
  }

  draw() {
    this.loc.clear(); const sc = this.ws.scrollTop;
    this.ws.replaceChildren();
    const start = el('div', 'hat', 'On every CPU cycle'); this.ws.append(start);
    const stack = this.renderStack(this.program, false); stack.classList.add('root-stack'); this.ws.append(stack);
    if (!this.program.length) { const hint = el('p', 'ws-hint', 'Drag blocks here from the left. Your program runs top to bottom on every cycle, and the last command for each part wins.'); stack.append(hint); }
    this.ws.scrollTop = sc;
  }

  renderStack(list, palette) {
    const st = el('div', 'stack'); st.list = list;
    list.forEach((n) => { this.loc.set(n, { list }); st.append(this.renderNode(n, palette)); });
    return st;
  }

  renderNode(n, palette = false) {
    const def = BLOCKS[n.op], b = el('div', `blk k-${def.kind} c-${def.cat}`); b.node = n;
    if (!palette) b.tabIndex = 0;
    let row = el('div', 'blk-row'); b.append(row);
    for (const p of def.parts) {
      if (typeof p === 'string') { row.append(el('span', 'lbl', p)); continue; }
      if (p.enum) {
        const s = el('select', 'dd'); s.setAttribute('aria-label', p.a);
        for (const o of p.enum) { const op = el('option', null, o); op.value = o; s.append(op); }
        s.value = n[p.a]; s.disabled = palette;
        s.addEventListener('change', () => { this.snapshot(); n[p.a] = s.value; this.onChange?.(this.program); });
        row.append(s);
      } else if (p.text !== undefined) {
        const i = el('input', 'txt'); i.value = n[p.a]; i.maxLength = 40; i.disabled = palette; i.setAttribute('aria-label', 'Text to say');
        i.addEventListener('change', () => { this.snapshot(); n[p.a] = i.value; this.onChange?.(this.program); }); row.append(i);
      } else if (p.num !== undefined) row.append(this.renderValueSlot(n, p, palette));
      else if (p.bool) row.append(this.renderBoolSlot(n, p, palette));
      else if (p.stack) {
        const st = this.renderStack(n[p.a], palette);
        if (!palette && !n[p.a].length) st.classList.add('empty');
        const wrap = el('div', 'mouth'); wrap.append(st); b.append(wrap);
        row = el('div', 'blk-row after'); b.append(row);
      }
    }
    if (!row.children.length && row.classList.contains('after')) row.classList.add('foot');
    return b;
  }

  renderBoolSlot(n, p, palette) {
    const s = el('span', 'slot s-bool'); s.dataset.kind = 'bool'; s.parentNode_ = n; s.key = p.a;
    if (n[p.a]) { this.loc.set(n[p.a], { parent: n, key: p.a, def: null }); s.append(this.renderNode(n[p.a], palette)); }
    return s;
  }
  renderValueSlot(n, p, palette) {
    const s = el('span', 'slot s-num'); s.dataset.kind = 'num'; s.parentNode_ = n; s.key = p.a;
    const v = n[p.a];
    if (v && typeof v === 'object') { this.loc.set(v, { parent: n, key: p.a, def: p.num }); s.append(this.renderNode(v, palette)); }
    else {
      const i = el('input', 'numin'); i.type = 'number'; i.value = v; i.disabled = palette; i.step = 'any'; i.setAttribute('aria-label', 'Number');
      i.style.width = `${Math.max(2.2, String(v).length + 1.4)}ch`;
      i.addEventListener('input', () => { i.style.width = `${Math.max(2.2, i.value.length + 1.4)}ch`; });
      i.addEventListener('change', () => { this.snapshot(); n[p.a] = Number(i.value) || 0; this.onChange?.(this.program); });
      s.append(i);
    }
    return s;
  }

  /** Remove a node from wherever it sits. */
  detach(node) {
    const l = this.loc.get(node); if (!l) return;
    if (l.list) { const i = l.list.indexOf(node); if (i >= 0) l.list.splice(i, 1); }
    else l.parent[l.key] = l.def;
  }

  // ---- dragging ----
  down(e) {
    if (e.button > 0 || e.target.closest('input:not(:disabled),select:not(:disabled)')) return;
    const b = e.target.closest('.blk'); if (!b) return;
    const fromPal = this.pal.contains(b);
    let root = b;
    if (fromPal) { while (root.parentElement.closest('.blk')) root = root.parentElement.closest('.blk'); }
    this.drag = { src: root, node: root.node, fromPal, kind: BLOCKS[root.node.op].kind, x0: e.clientX, y0: e.clientY, id: e.pointerId, moved: false };
    const move = (ev) => this.move(ev), up = (ev) => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); this.up(ev); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  move(e) {
    const d = this.drag; if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
      d.moved = true;
      const r = d.src.getBoundingClientRect();
      d.ox = d.x0 - r.left; d.oy = d.y0 - r.top;
      const g = d.src.cloneNode(true); g.classList.add('ghost'); g.style.width = `${r.width}px`; document.body.append(g); d.ghost = g;
      if (!d.fromPal) d.src.classList.add('dragging');
      document.body.classList.add('is-dragging');
    }
    e.preventDefault();
    d.ghost.style.transform = `translate(${e.clientX - d.ox}px, ${e.clientY - d.oy}px)`;
    this.hover(e.clientX, e.clientY);
    const wsr = this.ws.getBoundingClientRect();
    if (e.clientY < wsr.top + 40) this.ws.scrollTop -= 10; else if (e.clientY > wsr.bottom - 40) this.ws.scrollTop += 10;
  }

  clearMarks() { this.marker?.remove(); this.marker = null; this.hot?.classList.remove('hot'); this.hot = null; this.pal.classList.remove('trash'); }

  hover(x, y) {
    const d = this.drag; this.clearMarks(); d.target = null;
    const under = document.elementFromPoint(x, y); if (!under) return;
    if (!d.fromPal && this.pal.contains(under)) { this.pal.classList.add('trash'); d.target = { trash: true }; return; }
    if (!this.ws.contains(under)) return;
    if (d.kind === 'stmt') {
      let st = under.closest('.stack');
      if (st && d.src.contains(st)) st = d.src.parentElement.closest('.stack');
      if (!st) st = this.ws.querySelector('.root-stack');
      const kids = [...st.children].filter((c) => c.classList.contains('blk') && c !== d.src);
      let before = null;
      for (const c of kids) { const r = c.getBoundingClientRect(); if (y < r.top + r.height / 2) { before = c; break; } }
      const m = el('div', 'drop-line'); st.insertBefore(m, before); this.marker = m;
      d.target = { list: st.list, before: before ? before.node : null };
    } else {
      const s = under.closest(`.slot[data-kind="${d.kind}"]`);
      if (s && !d.src.contains(s)) { s.classList.add('hot'); this.hot = s; d.target = { parent: s.parentNode_, key: s.key }; }
    }
  }

  up(e) {
    const d = this.drag; this.drag = null; if (!d) return;
    document.body.classList.remove('is-dragging');
    d.ghost?.remove(); d.src.classList.remove('dragging');
    const t = d.target; this.clearMarks();
    if (!d.moved) { if (d.fromPal && e.type === 'pointerup') this.tapAdd(d.node.op); return; }
    if (!t) { this.draw(); return; }
    this.snapshot();
    if (t.trash) { this.detach(d.node); this.changed(); return; }
    const node = d.fromPal ? newBlock(d.node.op) : d.node;
    if (!d.fromPal) this.detach(node);
    if (t.list) { const i = t.before ? t.list.indexOf(t.before) : -1; if (i >= 0) t.list.splice(i, 0, node); else t.list.push(node); }
    else t.parent[t.key] = node;
    play('click'); this.changed();
  }

  /** Clicking a palette block: statements go on the end, values fill the first free slot. */
  tapAdd(op) {
    const kind = BLOCKS[op].kind;
    if (kind === 'stmt') { this.snapshot(); this.program.push(newBlock(op)); play('click'); this.changed(); this.ws.scrollTop = this.ws.scrollHeight; return; }
    const free = [...this.ws.querySelectorAll(`.slot[data-kind="${kind}"]`)].find((s) => (kind === 'bool' ? !s.querySelector('.blk') : !s.querySelector('.blk')));
    if (!free) { this.toast?.(`Add an "if" block first. This block fits inside a ${kind === 'bool' ? 'condition' : 'number'} slot.`); return; }
    this.snapshot(); free.parentNode_[free.key] = newBlock(op); play('click'); this.changed();
  }
}
