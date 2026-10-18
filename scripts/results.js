// 各玩法「勝／敗」結算畫面截圖：node scripts/results.js <寬> <高> <埠>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const [W, H, PORT] = [+process.argv[2], +process.argv[3], +process.argv[4]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, hasTouch: Math.min(W, H) < 800 })).newPage();
  await page.goto(`http://localhost:${PORT}/`); await sleep(700);
  const drive = (diff) => page.evaluate((diff) => { const g = window.__MRAPP.getGame(); const ai = window.MRAI.makeAI(g.world, g.world.byId.get('me'), diff, 7); g.input.vec = () => ai.step(1 / 60); }, diff);
  const wait = async (ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.locator('.resultModal').count()) return true; await sleep(400); } return false; };
  const shot = async (n) => { await sleep(900); await page.screenshot({ path: `/tmp/shots/res/${n}_${W}x${H}.png` }); console.log('shot', n, await page.locator('.resultModal').first().getAttribute('class')); await page.evaluate(() => window.__MRAPP.go('home')); await sleep(400); };
  require('fs').mkdirSync('/tmp/shots/res', { recursive: true });
  const sc = [
    ['race-win', { kind: 'practice', mode: 'race', diff: 0, ais: [] }, 3, false],
    ['level-win', { kind: 'level', mode: 'race', diff: 0, level: 1, ais: [] }, 3, false],
    ['race-vsai-win', { kind: 'vsai', mode: 'race', diff: 0, ais: [0, 0] }, 3, false],
    ['stars-win', { kind: 'vsai', mode: 'stars', diff: 0, ais: [0] }, 3, true],
    ['collapse-win', { kind: 'vsai', mode: 'collapse', diff: 0, ais: [0] }, 3, true],
  ];
  const only = process.argv[5] ? process.argv[5].split(',') : null;
  for (const [name, cfg, d, ff] of sc) { if (only && !only.includes(name)) continue;
    await page.evaluate((c) => window.__MRAPP.startLocal(c), cfg); await sleep(3600); await drive(d);
    if (ff) { await sleep(2500); await page.evaluate(() => window.__MRAPP.getGame().fastForward()); }
    if (await wait(100000)) await shot(name); else console.log('timeout', name);
  }
  await browser.close(); server.close(); process.exit(0);
})();
