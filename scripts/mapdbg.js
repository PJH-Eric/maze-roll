const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(3520, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  page.on('pageerror', (e) => console.log('PE', e.message)); page.on('console', (m) => console.log('C', m.text()));
  await page.goto('http://localhost:3520/'); await sleep(600);
  await page.evaluate(() => window.__MRAPP.startLocal({ kind: 'practice', mode: 'race', diff: 2, ais: [] })); await page.waitForFunction(() => window.__MRAPP.getGame() && window.__MRAPP.getGame().scene, null, { timeout: 8000 }); await sleep(1500);
  await page.locator('.miniBtn').click(); await sleep(1000);
  console.log(await page.evaluate(() => { const b = document.querySelector('canvas.bigMap'); const v=b.closest('.sa-view'); return 'over '+(v.scrollHeight-v.clientHeight)+' ch '+v.clientHeight+' '+b.style.width + ' ' + b.getBoundingClientRect().width + ' ' + b.parentElement.className + ' ' + (b.closest('.sa-view') ? 'view' : 'noview') + ' ' + (document.querySelector('.mapModal')?.parentElement.className); }));
  await page.screenshot({path:'/tmp/shots/dbg.png'}); await browser.close(); server.close(); process.exit(0);
})();
