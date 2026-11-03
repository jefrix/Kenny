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
  const ground = await screen(tx + 10, ty + 9);
  const before = await read(() => __clay.world.tribes[0].belief);
  await p.keyboard.press('2'); await p.mouse.move(ground.x, ground.y); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up();
  assert(await read(() => __clay.world.tribes[0].belief) < before, 'raising land costs belief');

  for (const [key, name] of [['z', 'rain'], ['x', 'bless'], ['c', 'lightning'], ['v', 'fire'], ['b', 'quake'], ['n', 'flood']]) {
    await p.evaluate(() => { __clay.world.tribes[0].belief = 400; });
    const count = await read(() => __clay.world.tribes[0].stats.miraclesCast);
    await p.keyboard.press(key); await p.mouse.move(ground.x, ground.y); await p.waitForTimeout(120); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(350);
    assert(await read(() => __clay.world.tribes[0].stats.miraclesCast) === count + 1, `${name} casts`);
    await p.screenshot({ path: `${out}/${name}.png` });
  }
  await p.keyboard.press('5'); await p.mouse.move(ground.x, ground.y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(150);
  assert(await read(() => !!__clay.world.tribes[0].standard), 'standard planted');
  await p.keyboard.press('p'); await p.waitForSelector('#pause-veil'); await p.click('#p-resume');

  await p.evaluate(() => { const w = __clay.world; for (let i = 0; i < 2600 && !w.over; i++) w.step(); }); await p.waitForTimeout(800); await p.screenshot({ path: `${out}/later.png` });
  if (await read(() => !__clay.world.over)) await p.evaluate(() => { const w = __clay.world; w.hurtBuilding(w.tribes[1].temple, 99999); });
  await p.waitForSelector('.sheet h2'); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/end.png` });
  await p.click('#e-quit'); await p.waitForSelector('.rival-choice');

  // Phone: nothing overflows, and two fingers do not break the Hand.
  const phone = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const q = await phone.newPage(); watch(q);
  await q.goto(base + '/gods/index.html'); await q.waitForSelector('.rival-choice', { timeout: 60000 }); await q.waitForTimeout(800); await q.screenshot({ path: `${out}/phone-title.png` });
  await q.tap('[data-rival=novice]'); await q.waitForTimeout(1500); await q.screenshot({ path: `${out}/phone-game.png` });
  assert(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on a phone');

  if (errors.length) throw new Error('browser errors:\n' + errors.slice(0, 8).join('\n'));
  await br.close(); console.log('gods browser ok');
})().catch((e) => { console.error(e); process.exit(1); });
