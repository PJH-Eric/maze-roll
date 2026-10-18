const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => server.listen(+process.argv[4], r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [w, h] of [[+process.argv[2], +process.argv[3]]]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: Math.min(w, h) < 500 })).newPage();
    page.on('pageerror', (e) => console.log('PE', e.message)); await page.goto('http://localhost:'+process.argv[4]+'/'); await sleep(600);
    await page.evaluate(() => window.__MRAPP.startLocal({ kind: 'practice', mode: 'race', diff: 2, ais: [] })); await sleep(3500); await sleep(2500);
    await page.locator(".miniBtn").click(); await sleep(2500);
    const r = await page.evaluate(() => { const v = document.querySelector('.mapModal .sa-view'); const c = document.querySelector('canvas.bigMap').getBoundingClientRect(); const bar = [...document.querySelectorAll('.mapModal [class^=sa-]')].map((e) => e.className + ':' + getComputedStyle(e).display); return { over: v ? v.scrollHeight - v.clientHeight : 'noview', cw: Math.round(c.width), bar }; });
    console.log(w + 'x' + h, JSON.stringify(r)); await page.screenshot({ path: `/tmp/shots/mapfit_${w}x${h}.png` });
  }
  await browser.close(); server.close(); process.exit(0);
})();
