// End-to-end check in headless Chromium. Serve the repo root first, then:
//   OUT=/some/dir node tests/browser.cjs http://localhost:8765
const { chromium } = require('playwright');
const base = process.argv[2], out = process.env.OUT || '.';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text() + m.location().url)) errs.push(m.text()); });
  const public_bot = { name: 'Net Bot', by: 'liar', color: '#16B5B0', design: { chassis: 'scout', drive: 'wheels', engine: 'battery', armor: 'none', radar: 'dish', turret: 'none', cpu: 'abacus', weapons: ['mg'], modules: [] }, program: [{ op: 'fire', w: 'all' }] };
  await p.route(/api\.github\.com/, (r) => r.fulfill({ json: [
    { number: 7, title: '[BOT] Net Bot', user: { login: 'someplayer' }, html_url: 'https://github.com/x', body: 'hi\n```json\n' + JSON.stringify(public_bot) + '\n```' },
    { number: 8, title: '[BOT] Evil', user: { login: 'bad' }, body: '```json\n{"design":{"chassis":"__proto__"}}\n```' },
    { number: 9, title: 'Ordinary bug report', user: { login: 'x' }, body: 'nothing' },
  ], headers: { 'access-control-allow-origin': '*' } }));

  // Landing
  await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/landing.png` });
  await p.click('.launch'); await p.waitForSelector('.bot-card');

  // Hangar and public hangar
  await p.waitForTimeout(400); await p.screenshot({ path: `${out}/hangar.png` });
  await p.click('text=Public hangar'); await p.waitForSelector('text=Net Bot');
  const cards = await p.locator('.bot-card').count(); if (cards !== 1) throw new Error('public hangar cards: ' + cards);
  await p.waitForSelector('text=by someplayer');
  await p.click('text=Stock robots');

  // Garage: build
  await p.click('text=Build a new robot'); await p.waitForSelector('.part');
  await p.locator('.name-in').fill('Test Tank');
  await p.locator('.part', { hasText: 'Fortress frame' }).click();
  await p.click('.cat-tab:has-text("Weapons")');
  await p.locator('.part', { hasText: 'Railgun' }).click();
  await p.locator('.part', { hasText: 'Railgun' }).click();
  await p.locator('.part', { hasText: 'Railgun' }).click(); // over budget now
  await p.waitForTimeout(300);
  const over = await p.locator('.bud-num').innerText(); if (!/over/.test(over)) throw new Error('budget should be over: ' + over);
  if (!(await p.locator('text=Save robot').isDisabled())) throw new Error('save should be disabled while over budget');
  await p.screenshot({ path: `${out}/garage.png` });
  while (await p.locator('.fit li .x').count() > 1) await p.locator('.fit li .x').first().click();
  await p.click('.cat-tab:has-text("Chassis")'); await p.locator('.part', { hasText: 'Brawler frame' }).click();
  await p.click('.cat-tab:has-text("Weapons")');

  // Garage: program with real drags
  await p.click('.tab:has-text("Program")'); await p.waitForSelector('.palette .blk');
  await p.click('text=Clear all');
  const drag = async (fromLoc, toLoc, yFrac = 0.5) => {
    await fromLoc.scrollIntoViewIfNeeded(); await toLoc.scrollIntoViewIfNeeded();
    const a = await fromLoc.boundingBox(), b = await toLoc.boundingBox();
    await p.mouse.move(a.x + 8, a.y + a.height / 2); await p.mouse.down();
    await p.mouse.move(a.x + 30, a.y + 20, { steps: 3 }); await p.mouse.move(b.x + 10, b.y + b.height * yFrac, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(50);
  };
  const pal = (t) => p.locator(`.palette .blk[data-palette-op="${t}"]`);
  await drag(pal('if'), p.locator('.root-stack'));
  await drag(pal('seen'), p.locator('.workspace .s-bool').first());
  await drag(pal('fire'), p.locator('.workspace .mouth .stack').first());
  await drag(pal('radar'), p.locator('.root-stack'), 0.02); // Dropping at the top inserts first.
  await pal('drive').click(); // Click adds to the end.
  let prog = await p.evaluate(() => [...document.querySelectorAll('.root-stack > .blk')].map((b) => b.node.op));
  if (prog.join() !== 'radar,if,drive') throw new Error('program order: ' + prog);
  const inner = await p.evaluate(() => { const n = document.querySelectorAll('.root-stack > .blk')[1].node; return [n.c?.op, n.then.map((x) => x.op).join()]; });
  if (inner.join() !== 'seen,fire') throw new Error('nesting: ' + inner);
  // Reporter into a number slot, then drag a block out to delete it.
  await drag(pal('sense'), p.locator('.root-stack > .blk').last().locator('.s-num').first());
  const nodeArg = await p.evaluate(() => [...document.querySelectorAll('.root-stack > .blk')].at(-1).node.pct.op);
  if (nodeArg !== 'sense') throw new Error('reporter did not land');
  await p.screenshot({ path: `${out}/program.png` });
  await drag(p.locator('.root-stack > .blk').first().locator('.lbl').first(), p.locator('.palette'));
  if (await p.locator('.root-stack > .blk').count() !== 2) throw new Error('drag to palette did not delete');
  await p.keyboard.press('Control+z');
  if (await p.locator('.root-stack > .blk').count() !== 3) throw new Error('undo failed');
  await p.click('text=Load a sample'); await p.locator('dialog .part', { hasText: 'Rustbucket' }).click();

  // Save and persist
  await p.click('text=Save robot'); await p.waitForSelector('text=Saved Test Tank');
  await p.click('.tab:has-text("Build")'); await p.waitForTimeout(200);
  await p.click('text=Test against a dummy'); await p.waitForSelector('.arena-canvas');
  await p.waitForTimeout(800);
  await p.click('text=Leave battle'); await p.waitForSelector('.part');
  await p.click('text=Back to hangar');
  if (await p.locator('dialog[open]').count()) await p.locator('dialog').getByRole('button',{name:'Leave'}).click();
  await p.click('text=Your robots'); await p.waitForSelector('.bot-card:has-text("Test Tank")');

  // Share link round trip
  await p.click('.bot-card:has-text("Test Tank") >> text=Share');
  const link = await p.locator('dialog textarea').inputValue(); await p.getByRole('button',{name:'Close'}).click();
  const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errs.push('p2 ' + e.message));
  await p2.goto(link); await p2.waitForSelector('text=Add Test Tank'); await p2.close();

  // A full battle, with every stock robot, watched at speed.
  await p.click('text=Stock robots');
  for (const n of ['Rustbucket', 'Longshot', 'Crusher', 'Skitter', 'Grumbler', 'Hornet', 'The Warden']) await p.locator('.bot-card', { hasText: n }).getByRole('button', { name: 'Add to battle' }).click();
  await p.locator('.field select').first().selectOption('junkyard');
  await p.evaluate(() => { window.__kennyTest = true; });
  await p.click('text=Start battle'); await p.waitForSelector('.arena-canvas');
  await p.waitForTimeout(5000); await p.screenshot({ path: `${out}/battle.png` });
  await p.locator('.card').first().click(); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/battle2.png` });
  await p.evaluate(() => window.__kennyBattle.setSpeed(4));
  await p.waitForSelector('.res-box', { timeout: 240000 }); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/results.png` });

  // Phone width
  await p.click('text=Back');
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(300);
  for (const [name, go] of [['m-hangar', null], ['m-garage', async () => { await p.click('text=Build a new robot'); await p.waitForSelector('.part'); }]]) {
    if (go) await go(); await p.waitForTimeout(400);
    const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 392) errs.push(`${name} overflows sideways: ${w}px`);
    await p.screenshot({ path: `${out}/${name}.png` });
  }
  await p.goto(base + '/index.html'); await p.waitForTimeout(700); await p.screenshot({ path: `${out}/m-landing.png` });
  await br.close();
  if (errs.length) { console.log('ERRORS\n' + errs.join('\n')); process.exit(1); }
  console.log('Browser test passed.');
})().catch((e) => { console.error(e); process.exit(1); });
