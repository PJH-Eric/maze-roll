// 開機煙霧測試：啟動伺服器、開首頁、收集 console 錯誤、截圖
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
(async () => {
  await new Promise((r) => server.listen(3199, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); }); page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('http://localhost:3199/'); await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/shots/home.png' });
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close(); server.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
