// 實機截圖：從實際執行中的遊戲擷取（供 RWD 巡檢）。用法：node scripts/shots.js <場景> <寬> <高> <輸出檔>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const [scn, W, H, out] = [process.argv[2], +process.argv[3] || 1180, +process.argv[4] || 820, process.argv[5] || '/tmp/shots/x.png'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(3198, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: W < 1000 || H < 600, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.addInitScript(() => { window.__MR_PRESERVE = true; });
  await page.goto('http://localhost:3198/'); await page.waitForTimeout(500);
  const ev = (f, a) => page.evaluate(f, a);
  const start = (cfg) => ev((c) => window.__MRAPP.startLocal(c), cfg);
  const click = async (txt) => { await page.getByRole('button', { name: txt }).first().click(); await sleep(250); };
  if (scn === 'home') {}
  else if (scn === 'levels') { await click('闖關模式'); await sleep(400); }
  else if (scn === 'practice') { await click('自由練習'); }
  else if (scn === 'vsai') { await click('對電腦'); await click('增加一位電腦'); await click('增加一位電腦'); }
  else if (scn === 'online') { await click('線上對戰'); await sleep(800); }
  else if (scn === 'settings') { await click('設定'); await sleep(300); }
  else if (scn === 'how') { await click('怎麼玩'); }
  else if (scn.startsWith('game-')) {
    const mode = scn.split('-')[1], ais = scn.includes('ai') ? [0, 1, 2] : [];
    await start({ kind: ais.length ? 'vsai' : 'practice', mode, diff: scn.includes('big') ? 3 : 1, ais });
    await sleep(3600);
    await ev(() => { const g = window.__MRAPP.getGame(); g.input.keys.add('d'); g.input.keys.add('s'); }); await sleep(1800);
    await ev(() => { const g = window.__MRAPP.getGame(); g.input.keys.clear(); });
    if (scn.endsWith('-pause')) { await page.keyboard.press('Escape'); await sleep(300); }
    if (scn.endsWith('-result')) { await ev(() => { const g = window.__MRAPP.getGame(); g.fastForward(); }); await sleep(2500); }
    if (scn.endsWith('-drawer')) { await ev(() => document.querySelector('.sideTab').click()); await sleep(500); }
  }
  await sleep(300);
  await page.screenshot({ path: out });
  console.log(out, 'errors:', errs.length ? errs.slice(0, 5).join(' | ') : 'none');
  await browser.close(); server.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
