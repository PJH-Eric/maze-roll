// 單機完整流程：闖關第1關（AI 代打）→ 結算星數 → 下一關解鎖 → 再來一局 → 回到首頁；以及地板崩塌掉落流程
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(3198, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
  const btn = (t) => { const l = page.getByRole('button', { name: t }).first(); return { click: () => l.click({ force: true, timeout: 15000 }) }; };
  const ok = (m) => console.log('  ✓', m);
  await page.goto('http://localhost:3198/'); await sleep(800);
  const drive = () => page.evaluate(() => { const g = window.__MRAPP.getGame(); const ai = window.MRAI.makeAI(g.world, g.world.byId.get('me'), 3, 7); g.input.vec = () => ai.step(1 / 60); });
  const waitResult = async (ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.locator('.modal').count()) return true; await sleep(500); } return false; };

  await page.evaluate(() => window.__MRAPP.startLocal({ kind: 'level', mode: 'race', diff: 0, level: 1, ais: [] })); await sleep(3500);
  await drive(); assert(await waitResult(120000), '第1關應能完成'); ok('第1關完成，出現結算');
  const st = await page.evaluate(() => window.__MRAPP.store.levelStars(0)); assert(st[0] > 0, '星數已存'); ok('星數已存 ' + st[0]);
  assert.strictEqual(await page.evaluate(() => window.__MRAPP.store.unlockedLevel(0)), 2); ok('第2關解鎖');
  await page.screenshot({ path: '/tmp/shots/e2e_level_result.png' });
  await btn(/下一關/).click(); await sleep(3000);
  assert.strictEqual(await page.evaluate(() => window.__MRAPP.getGame().o.seed), await page.evaluate(() => window.MR.levelSeed(0, 2))); ok('下一關進入第2關');
  await page.evaluate(() => window.__MRAPP.go('home')); await sleep(600);
  assert.strictEqual(await page.evaluate(() => window.__MRAPP.getGame()), null); ok('回首頁後遊戲已釋放');

  // 地板崩塌：站著不動 → 掉落 → 淘汰橫幅/結算
  await page.evaluate(() => window.__MRAPP.startLocal({ kind: 'practice', mode: 'collapse', diff: 0, ais: [] })); await sleep(3500);
  assert(await waitResult(90000), '崩塌站著不動應被淘汰並結算'); ok('地板崩塌：掉落後出現結算');
  await page.screenshot({ path: '/tmp/shots/e2e_collapse_result.png' });
  await btn(/再來一局/).click(); await sleep(3000);
  assert.strictEqual(await page.locator('.modal').count(), 0); assert(await page.evaluate(() => !!window.__MRAPP.getGame())); ok('再來一局：新局開始、結算關閉');
  await page.evaluate(() => window.__MRAPP.go('home')); await sleep(400);
  console.log('主控台錯誤：', errs.length ? errs : '無'); await browser.close(); server.close(); process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
