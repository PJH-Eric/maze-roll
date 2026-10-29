const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(3194, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:3194/'); await sleep(600);
  const cfgs = [['race', 0], ['race', 2], ['race', 4], ['stars', 3], ['collapse', 2]];
  for (const [mode, diff] of cfgs) {
    await page.evaluate(([mode, diff]) => window.__MRAPP.startLocal({ kind: 'practice', mode, diff, ais: [] }), [mode, diff]); await page.waitForFunction(() => window.__MRAPP.getGame() && window.__MRAPP.getGame().scene, null, { timeout: 8000 }); await sleep(1200);
    await page.evaluate(() => window.__MRAPP.getGame().input.keys.add('d')); await sleep(800);
    const box = await page.locator('canvas.mini').boundingBox();
    await page.screenshot({ path: `/tmp/shots/mini_${mode}_${diff}.png`, clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 } });
    if (mode === 'race' && diff === 2) await page.screenshot({ path: '/tmp/shots/mini_full.png' });
  }
  console.log('errs', errs); await browser.close(); server.close(); process.exit(0);
})();
