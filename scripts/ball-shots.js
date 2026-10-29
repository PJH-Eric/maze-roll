const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
(async () => {
  await new Promise((r) => server.listen(3199, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:3199/'); await sleep(600);
  for (const t of ['glass', 'wood', 'steel', 'rainbow']) {
    await page.evaluate((t) => { window.__MRAPP.store.set('ball', t); window.__MRAPP.store.set('cam', 0); window.__MRAPP.startLocal({ kind: 'practice', mode: 'race', diff: 0, ais: [] }); }, t); await page.waitForFunction(() => window.__MRAPP.getGame() && window.__MRAPP.getGame().scene && window.__MRAPP.getGame().scene.balls.get('me'), null, { timeout: 8000 }); await sleep(600);
    await page.evaluate(() => { window.__MRAPP.getGame().input.keys.add('d'); }); await sleep(900);
    await page.evaluate(() => window.__MRAPP.getGame().input.keys.clear()); await sleep(100);
    await page.screenshot({ path: `/tmp/shots/ball_${t}.png`, clip: { x: 290, y: 150, width: 600, height: 420 } });
  }
  await page.evaluate(() => window.__MRAPP.go('home')); await sleep(300);
  await page.getByRole('button', { name: /設定/ }).first().click({ force: true }); await sleep(500);
  await page.screenshot({ path: '/tmp/shots/ball_settings.png' });
  console.log('errs', errs, ((Date.now() - T0) / 1000).toFixed(1) + 's'); await browser.close(); server.close(); process.exit(0);
})();
