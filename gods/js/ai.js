// The rival god. It only uses World.act, so it plays by the same rules as you, and sees no more than the world state.
import { N, MIRACLES, BUILDINGS, TEMPLE_GUARD } from './sim.js';

export const DIFFICULTIES = {
  novice: { name: 'Minor Spirit', blurb: 'Slow to anger. Learn the land.', interval: 3.2, strokeRate: 2, marchWarriors: 14, marchAfter: 900, aggression: 0.3, beliefMult: 1 },
  jealous: { name: 'Jealous God', blurb: 'Comes for you by mid-match.', interval: 1.8, strokeRate: 4, marchWarriors: 11, marchAfter: 600, aggression: 0.65, beliefMult: 1 },
  wrathful: { name: 'Wrathful God', blurb: 'Early, relentless, and unfair: extra prayer.', interval: 1, strokeRate: 7, marchWarriors: 8, marchAfter: 330, aggression: 1, beliefMult: 1.2 },
};

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export class RivalGod {
  constructor(tribe, difficulty = 'jealous') {
    this.tribe = tribe; this.params = DIFFICULTIES[difficulty] || DIFFICULTIES.jealous;
    this.timer = 1; this.strokes = []; this.strokeTimer = 0; this.marching = false; this.announcedBridge = false;
  }

  update(world, dt) {
    const me = world.tribes[this.tribe]; me.beliefMult = this.params.beliefMult;
    // Terrain work is queued, then spent at a limited rate, so the rival's hand is no faster than a person's.
    this.strokeTimer -= dt;
    if (this.strokes.length && this.strokeTimer <= 0) {
      this.strokeTimer = 1 / this.params.strokeRate;
      const stroke = this.strokes.shift();
      const result = world.act(this.tribe, stroke);
      if (!result.ok && result.reason === 'Outside your influence.') this.strokes.length = 0;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.params.interval;
    this.tend(world, me);
    this.defend(world, me);
    this.wage(world, me);
  }

  // When there is nowhere left to build, level some ground near home.
  tend(world, me) {
    if (this.strokes.length || me.noSiteSince < 0 || world.time - me.noSiteSince < 4 || me.belief < 8) return;
    const anchors = world.buildings.filter((b) => b.tribe === this.tribe && b.progress >= 1);
    let best = null, bestScore = Infinity;
    for (let i = 0; i < 24; i++) {
      const from = anchors[Math.floor(world.rng() * anchors.length)]; if (!from) return;
      const a = world.rng() * 6.283, r = 7 + world.rng() * 7, x = Math.round(from.x + Math.cos(a) * r), y = Math.round(from.y + Math.sin(a) * r);
      if (x < 4 || y < 4 || x > N - 5 || y > N - 5 || !world.inInfluence(this.tribe, x, y) || world.nearTemple(x, y, TEMPLE_GUARD + 1)) continue;
      if (world.heightAt(x, y) < world.sea + 0.4) continue;
      if (world.buildings.some((b) => dist(b.x, b.y, x, y) < BUILDINGS[b.type].radius + 3)) continue;
      const score = world.flatness(x, y, 1.5);
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
    if (best) {
      const height = world.heightAt(best.x, best.y);
      for (let i = 0; i < 5; i++) this.strokes.push({ type: 'level', x: best.x, y: best.y, height });
      me.noSiteSince = -1;
    }
  }

  defend(world, me) {
    if (!me.temple) return;
    // Bless a fight when it matters. Rain when wood is short or the home is burning.
    const fighter = world.people.find((p) => p.tribe === this.tribe && p.state === 'fight');
    if (fighter && me.belief > MIRACLES.bless.cost + 20 && this.ready(world, me, 'bless')) world.act(this.tribe, { type: 'miracle', name: 'bless', x: fighter.x, y: fighter.y });
    const burning = world.buildings.find((b) => b.tribe === this.tribe && b.burn > 0);
    if (burning && this.ready(world, me, 'rain') && me.belief > MIRACLES.rain.cost) world.act(this.tribe, { type: 'miracle', name: 'rain', x: burning.x, y: burning.y });
    else if (me.wood < 6 && me.belief > 60 && this.ready(world, me, 'rain')) world.act(this.tribe, { type: 'miracle', name: 'rain', x: me.temple.x + (N / 2 - me.temple.x) * 0.22, y: me.temple.y + (N / 2 - me.temple.y) * 0.22 });
  }

  ready(world, me, name) { return (me.cooldowns[name] || 0) <= world.time; }

  wage(world, me) {
    const params = this.params, foe = world.tribes[1 - this.tribe];
    const ready = world.time > params.marchAfter && me.warriors >= params.marchWarriors;
    if (!this.marching && ready) this.marching = true;
    if (this.marching && me.warriors < 2) { this.marching = false; world.act(this.tribe, { type: 'standard', remove: true }); this.strokes.length = 0; }
    if (this.marching && foe.temple) this.march(world, me, foe);
    this.smite(world, me, foe);
  }

  // Walk the standard toward the enemy temple, raising a bridge wherever the sea is in the way.
  march(world, me, foe) {
    if (this.strokes.length > 2) return;
    const from = me.standard || me.temple, tx = foe.temple.x, ty = foe.temple.y, total = dist(from.x, from.y, tx, ty);
    // Is the standard already next to the enemy temple? Then let the warriors work.
    if (total < 8) return;
    const warriorsThere = world.people.filter((p) => p.tribe === this.tribe && p.role === 'warrior' && dist(p.x, p.y, from.x, from.y) < 7).length;
    if (me.standard && warriorsThere < Math.min(3, me.warriors) && world.connected(me.standard.x + 1, me.standard.y, me.temple.x + 5, me.temple.y) && world.time - me.standard.placed < 40) return;
    let bestX = from.x, bestY = from.y, stepTaken = false;
    for (let d = 2; d <= 22; d += 1) {
      const x = Math.round(from.x + (tx - from.x) / total * d), y = Math.round(from.y + (ty - from.y) / total * d);
      if (!world.inInfluence(this.tribe, x, y)) break;
      if (world.heightAt(x, y) < world.sea + 0.25) {
        if (me.belief < 6) return;
        for (let i = 0; i < 4; i++) this.strokes.push({ type: 'raise', x, y });
        if (!this.announcedBridge) { this.announcedBridge = true; world.events.push({ type: 'rivalBridge', x, y, tribe: this.tribe }); }
        return;
      }
      bestX = x; bestY = y; stepTaken = true;
    }
    if (stepTaken && world.connected(bestX, bestY, me.temple.x + 5, me.temple.y) || stepTaken && world.connected(bestX, bestY, me.temple.x - 5, me.temple.y)) {
      if (dist(bestX, bestY, from.x, from.y) >= 3) world.act(this.tribe, { type: 'standard', x: bestX, y: bestY });
    }
  }

  // Spend spare belief striking anything of the foe's that lies within reach.
  smite(world, me, foe) {
    if (world.rng() > this.params.aggression) return;
    const within = (x, y) => world.inInfluence(this.tribe, x, y);
    const targets = world.buildings.filter((b) => b.tribe === foe.id && within(b.x, b.y));
    const crowd = world.people.filter((p) => p.tribe === foe.id && p.state !== 'carried' && p.state !== 'air' && within(p.x, p.y));
    if (!targets.length && crowd.length < 3) {
      // A desperate god floods the world, when the low ground is theirs and the high ground is yours.
      return;
    }
    const pick = targets.length && world.rng() < 0.6 ? targets[Math.floor(world.rng() * targets.length)] : crowd[Math.floor(world.rng() * crowd.length)];
    if (!pick) return;
    for (const name of ['quake', 'fire', 'lightning']) {
      if (me.belief >= MIRACLES[name].cost + 25 && this.ready(world, me, name) && !(name === 'quake' && pick.type === 'temple')) {
        world.act(this.tribe, { type: 'miracle', name, x: pick.x, y: pick.y });
        return;
      }
    }
  }
}
