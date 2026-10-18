// 五種難度主題截圖（實際遊戲畫面）＋闖關畫面（含難度解鎖狀態）
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(3199, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:3199/'); await sleep(600);
  for (let d = 0; d < 5; d++) {
    await page.evaluate((d) => window.__MRAPP.startLocal({ kind: 'practice', mode: 'race', diff: d, ais: [] }), d); await sleep(3600);
    await page.evaluate(() => { const g = window.__MRAPP.getGame(); g.input.keys.add('d'); }); await sleep(900);
    await page.evaluate(() => window.__MRAPP.getGame().input.keys.clear());
    await page.screenshot({ path: `/tmp/shots/theme_${d}.png` });
  }
  await page.evaluate(() => { window.__MRAPP.go('home'); for (let n = 1; n <= 40; n++) window.__MRAPP.store.setLevelStars(0, n, n % 3 + 1); });
  await sleep(500); await page.getByRole('button', { name: '闖關模式' }).first().click({ force: true }); await sleep(900);
  await page.screenshot({ path: '/tmp/shots/theme_levels.png' });
  console.log('errs', errs); await browser.close(); server.close(); process.exit(0);
})();
