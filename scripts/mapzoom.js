const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(3195, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  for (const [w, h, name] of [[390, 844, 'phone'], [1180, 820, 'tablet']]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500 })).newPage();
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://localhost:3195/'); await sleep(600);
    await page.evaluate(() => window.__MRAPP.startLocal({ kind: 'practice', mode: 'race', diff: 2, ais: [] })); await sleep(3500);
    await sleep(2500); await page.locator(".miniBtn").click(); await sleep(1200);
    const box = await page.locator('canvas.bigMap').boundingBox();
    const paused = await page.evaluate(() => !!window.__MRAPP.getGame().paused);
    console.log(name, 'bigMap', JSON.stringify(box), 'centered', Math.abs(box.x + box.width / 2 - w / 2) < 3, 'paused', paused);
    await page.screenshot({ path: `/tmp/shots/mapzoom_${name}.png` });
    await page.keyboard.press('Escape'); await sleep(400);
    console.log(name, 'closed', await page.locator('.mapModal').count(), 'paused', await page.evaluate(() => !!window.__MRAPP.getGame().paused));
  }
  console.log('errs', errs); await browser.close(); server.close(); process.exit(0);
})();
