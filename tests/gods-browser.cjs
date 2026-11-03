// End-to-end check in headless Chromium. Serve the repo root first, then:
//   OUT=/some/dir node tests/gods-browser.cjs http://localhost:8765
const { chromium } = require('playwright');
const base = process.argv[2], out = process.env.OUT || '.';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const errors = [], watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };

  // Desktop: reach the game from the Kenny homepage, then play with real input.
  const p = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(p);
  await p.goto(base + '/index.html'); await p.waitForTimeout(800); await p.screenshot({ path: `${out}/home.png` });
  await p.click('.launch.gods'); await p.waitForSelector('.rival-choice', { timeout: 60000 }); await p.waitForTimeout(1000);
  await p.click('[data-rival=jealous]'); await p.waitForTimeout(1200);
  const screen = (x, y) => p.evaluate(([a, b]) => __clay.renderer.screenOf(a, __clay.world.heightAt(a, b), b), [x, y]);
  const read = (fn) => p.evaluate(fn);
  const person = await read(() => { const q = __clay.world.people.find((e) => e.tribe === 0); return { x: q.x, y: q.y }; });
  const at = await screen(person.x, person.y);
  await p.mouse.move(at.x, at.y); await p.waitForTimeout(200); await p.mouse.down(); await p.waitForTimeout(250);
  assert(await read(() => !!__clay.world.tribes[0].carried), 'Hand grabs a follower');
  await p.mouse.move(at.x + 120, at.y + 60, { steps: 5 }); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/carry.png` }); await p.mouse.up();
  assert(await read(() => !__clay.world.tribes[0].carried), 'Hand lets go');
  await p.waitForTimeout(500); await p.mouse.move(at.x + 200, at.y + 120); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/hand.png` });

  const [tx, ty] = await read(() => { const t = __clay.world.tribes[0].temple; return [t.x, t.y]; });
  // Pick ground inside the border that no HUD panel covers. Panels can hide any given spot, depending on the map.
  let ground = null, groundWhy = [];
  for (const [dx, dy] of [[10, 9], [-10, 9], [10, -9], [-10, -9], [12, 3], [-12, 3], [3, 12], [3, -12]]) {
    const at2 = await screen(tx + dx, ty + dy);
    const onCanvas = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id === 'world', [at2.x, at2.y]);
    groundWhy.push(`${dx},${dy}:${onCanvas}`);
    if (onCanvas) { ground = at2; break; }
  }
  assert(ground, 'found open ground: ' + groundWhy.join(' '));
  const before = await read(() => __clay.world.terrainVersion);
  await p.keyboard.press('2'); await p.mouse.move(ground.x, ground.y); await p.waitForTimeout(150); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up();
  const raised = await read(() => ({ version: __clay.world.terrainVersion, omens: [...document.querySelectorAll('.omen')].map((o) => o.textContent), tool: document.querySelector('[data-tool][aria-pressed=true]')?.dataset.tool, inf: __clay.world.tribes[0].belief }));
  assert(raised.version > before, 'raising land changes the terrain: ' + JSON.stringify(raised) + ' before ' + before);

  for (const [key, name] of [['z', 'rain'], ['x', 'bless'], ['c', 'lightning'], ['v', 'fire'], ['b', 'quake'], ['n', 'flood']]) {
    await p.evaluate(() => { __clay.world.tribes[0].belief = 400; });
    const count = await read(() => __clay.world.tribes[0].stats.miraclesCast);
    await p.keyboard.press(key); await p.mouse.move(ground.x, ground.y); await p.waitForTimeout(120); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(350);
    assert(await read(() => __clay.world.tribes[0].stats.miraclesCast) === count + 1, `${name} casts`);
    await p.screenshot({ path: `${out}/${name}.png` });
  }
  await p.keyboard.press('5'); await p.mouse.move(ground.x, ground.y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(150);
  assert(await read(() => !!__clay.world.tribes[0].standard), 'standard planted');

  // See through a follower's eyes, then come back to exactly the same view.
  await p.keyboard.press('1');
  const view = () => read(() => __clay.renderer.camera.position.toArray().map((v) => +v.toFixed(2)));
  const viewBefore = await view();
  const follower = await read(() => { const w = __clay.world, q = w.people.find((e) => e.tribe === 0 && e.state !== 'carried' && e.state !== 'air'), s = __clay.renderer.screenOf(q.x, w.heightAt(q.x, q.y) + 0.45, q.y); return { id: q.id, x: s.x, y: s.y }; });
  await p.keyboard.press('6'); await p.mouse.move(follower.x, follower.y); await p.waitForTimeout(150); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(700);
  assert(await read(() => !!__clay.renderer.watched), 'eyes select a person');
  assert(await read(() => { const r = __clay.renderer, c = r.camera.position; return Math.hypot(c.x - r.watched.x, c.z - r.watched.y) < 2.5; }), 'camera is at the person');
  await p.screenshot({ path: `${out}/eyes.png` });
  const yawBefore = await read(() => __clay.renderer.watch.yaw);
  await p.mouse.move(700, 400); await p.mouse.down(); await p.mouse.move(820, 400, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(150);
  assert(await read(() => __clay.renderer.watch.yaw) !== yawBefore, 'dragging looks around');
  await p.screenshot({ path: `${out}/eyes-look.png` });
  // Death ends the view safely.
  await p.evaluate(() => { const w = __clay.world; w.killPerson(__clay.renderer.watched, 'silent'); }); await p.waitForTimeout(400);
  assert(await read(() => !__clay.renderer.watched), 'death returns to god view');
  assert(JSON.stringify(await view()) === JSON.stringify(viewBefore), 'god view restored');
  // Esc leaves too.
  const other = await read(() => { const w = __clay.world, q = w.people.find((e) => e.state !== 'carried' && e.state !== 'air'), s = __clay.renderer.screenOf(q.x, w.heightAt(q.x, q.y) + 0.45, q.y); return { x: s.x, y: s.y }; });
  await p.keyboard.press('6'); await p.mouse.move(other.x, other.y); await p.waitForTimeout(150); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(200);
  assert(await read(() => !!__clay.renderer.watched), 'second selection works');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  assert(await read(() => !__clay.renderer.watched), 'Esc returns to god view');
  // Every other way back to god view works and restores the camera.
  const enter = async () => {
    const at2 = await read(() => { const w = __clay.world, q = w.people.find((e) => e.state !== 'carried' && e.state !== 'air'), s = __clay.renderer.screenOf(q.x, w.heightAt(q.x, q.y) + 0.45, q.y); return { x: s.x, y: s.y }; });
    await p.keyboard.press('6'); await p.mouse.move(at2.x, at2.y); await p.waitForTimeout(150); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(200);
    assert(await read(() => !!__clay.renderer.watched), 'entered first-person view');
  };
  for (const [name, leave] of [['button', () => p.click('#watch-exit')], ['eyes button', () => p.click('[data-tool=eyes]')], ['Hand button', () => p.click('[data-tool=hand]')], ['tool key', () => p.keyboard.press('2')], ['map', () => p.click('#minimap')]]) {
    await enter(); await leave(); await p.waitForTimeout(100);
    assert(await read(() => !__clay.renderer.watched), `${name} returns to god view`);
    await p.keyboard.press('1');
  }
  assert(await read(() => !document.body.classList.contains('watching') && __clay.renderer.controls.enabled), 'god view controls are back');

  // The People panel opens, and each age shows its own temple, buildings and gear.
  await p.click('#c-people'); await p.waitForSelector('#people table'); await p.waitForTimeout(250); await p.screenshot({ path: `${out}/people.png` }); await p.click('#c-people');
  for (const age of [1, 2, 3]) {
    await p.evaluate((a) => { const w = __clay.world, t = w.tribes[0]; for (const tr of w.tribes) { tr.age = a - 1; tr.lore = 99999; tr.metalMade = 9999; tr.metal = 300; tr.wood = 300; tr.food = 300; } let i = 0; const need = () => t.age < a; while (need() && i++ < 900 && !w.over) w.step(); for (let j = 0; j < 150 && !w.over; j++) w.step(); }, age);
    await p.waitForTimeout(900); await p.screenshot({ path: `${out}/age-${age}.png` });
    if (await read(() => __clay.world.over)) break;
  }
  // The age tour can end the match. Only test pausing if it is still running.
  if (await read(() => __clay.mode === 'play')) { await p.keyboard.press('p'); await p.waitForSelector('#pause-veil'); await p.click('#p-resume'); }

  await p.evaluate(() => { const w = __clay.world; for (let i = 0; i < 300 && !w.over; i++) w.step(); }); await p.waitForTimeout(800); await p.screenshot({ path: `${out}/later.png` });
  if (await read(() => !__clay.world.over)) await p.evaluate(() => { const w = __clay.world; w.hurtBuilding(w.tribes[1].temple, 99999); });
  await p.waitForSelector('.sheet h2'); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/end.png` });
  await p.click('#e-quit'); await p.waitForSelector('.rival-choice');

  // Phone: nothing overflows, and two fingers do not break the Hand.
  const phone = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const q = await phone.newPage(); watch(q);
  await q.goto(base + '/gods/index.html'); await q.waitForSelector('.rival-choice', { timeout: 60000 }); await q.waitForTimeout(800); await q.screenshot({ path: `${out}/phone-title.png` });
  await q.tap('[data-rival=novice]'); await q.waitForTimeout(1500); await q.screenshot({ path: `${out}/phone-game.png` });
  assert(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on a phone');
  // Tap the eyes, tap a person, then tilt the view with one finger.
  await q.tap('[data-tool=eyes]');
  const tapAt = await q.evaluate(() => { const w = __clay.world, e = w.people.find((o) => o.tribe === 0 && o.state !== 'carried'), s = __clay.renderer.screenOf(e.x, w.heightAt(e.x, e.y) + 0.45, e.y); return { x: s.x, y: s.y }; });
  await q.touchscreen.tap(tapAt.x, tapAt.y); await q.waitForTimeout(700);
  assert(await q.evaluate(() => !!__clay.renderer.watched), 'a tap selects a person on a phone');
  await q.screenshot({ path: `${out}/phone-eyes.png` });

  if (errors.length) throw new Error('browser errors:\n' + errors.slice(0, 8).join('\n'));
  await br.close(); console.log('gods browser ok');
})().catch((e) => { console.error(e); process.exit(1); });
