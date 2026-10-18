// 全畫面 RWD 巡檢：逐一開啟每個畫面／彈窗／遊戲狀態，檢查水平溢出、被裁切的按鈕、過小的觸控目標並截圖。
// 用法：node scripts/audit.js <寬> <高> <埠號>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server } = require('../server.js');
const fs = require('fs');
const [W, H, PORT] = [+process.argv[2], +process.argv[3], +process.argv[4] || 3300];
const dir = '/tmp/shots/audit'; fs.mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const issues = [];
// AUDIT_LANG=en：以英文介面巡檢，並檢查畫面上是否殘留中文
const LANG = process.env.AUDIT_LANG === 'en' ? 'en' : 'zh';
global.window = {}; require('../public/js/locales.js'); const EN = global.window.MR_EN;
const tr = (t) => (LANG !== 'en' ? t : t instanceof RegExp ? /Bot 1 level/ : (EN[t] || t));
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: Math.min(W, H) < 800 }); const page = await ctx.newPage();
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.addInitScript((l) => { window.__MR_PRESERVE = true; try { localStorage.setItem('game-island-lang', l === 'en' ? 'en' : 'zh-Hant'); } catch (e) {} }, LANG);
  const tag = `${W}x${H}`;
  const check = async (name) => {
    const r = await page.evaluate(() => {
      const out = { hscroll: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1, clipped: [], small: [] };
      const inScroll = (el) => !!el.closest('.sa-view');
      document.querySelectorAll('button,a.btn,.field').forEach((el) => {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return;
        const label = (el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 14);
        if (!inScroll(el) && (r.left < -2 || r.top < -2 || r.right > innerWidth + 2 || r.bottom > innerHeight + 2) && !el.closest('.panelSide')) out.clipped.push(label);
        if (Math.min(r.width, r.height) < 30 && !el.classList.contains('tiny')) out.small.push(label + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      // 文字溢出（元素本身內容寬度大於容器）
      out.overflow = [...document.querySelectorAll('.btn,.chip,.srow,.rrow,.seat,.roomRow,.hudTop,.modal,.banner')].filter((el) => el.offsetParent && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === 'visible' && !el.classList.contains('modal')).map((el) => (el.textContent || '').trim().slice(0, 14)).slice(0, 4);
      return out;
    });
    if (r.hscroll) issues.push(`${tag} ${name}: 水平溢出`);
    if (r.clipped.length) issues.push(`${tag} ${name}: 被裁切 ${r.clipped.join('、')}`);
    if (r.small.length) issues.push(`${tag} ${name}: 觸控目標偏小 ${r.small.join('、')}`);
    if (r.overflow.length) issues.push(`${tag} ${name}: 文字溢出 ${r.overflow.join('、')}`);
    if (LANG === 'en') { const zh = await page.evaluate(() => { const t = document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[title],[placeholder]')].map((e) => (e.getAttribute('aria-label') || '') + ' ' + (e.title || '') + ' ' + (e.getAttribute('placeholder') || '')).join(' '); return [...new Set(t.match(/[\u4e00-\u9fff]+/g) || [])]; }); const bad = zh.filter((x) => !['測試暱稱'].includes(x)); if (bad.length) issues.push(`${tag} ${name}: 殘留中文 ${bad.join('、')}`); }
    await page.screenshot({ path: `${dir}/${name}_${tag}${LANG === 'en' ? '_en' : ''}.png` });
  };
  const click = async (t, exact) => { await page.getByRole('button', { name: tr(t), exact: !!exact }).first().click(); await sleep(350); };
  const home = async () => { await page.goto(`http://localhost:${PORT}/`); await sleep(500); };
  const startLocal = async (cfg) => { await page.evaluate((c) => window.__MRAPP.startLocal(c), cfg); await sleep(3500); };

  await home(); await check('home');
  await click('怎麼玩'); await check('how'); await page.keyboard.press('Escape'); await sleep(200);
  await click('設定'); await check('settings'); await page.keyboard.press('Escape'); await sleep(200);
  await click('闖關模式'); await check('levels'); await page.evaluate(() => { for (let d = 0; d < 4; d++) for (let n = 1; n <= 10; n++) window.__MRAPP.store.setLevelStars(d, n, 3); }); await page.getByRole('button', { name: tr('返回') }).first().click({ force: true }).catch(() => {}); await sleep(300); await click('闖關模式'); await page.locator('.chip', { hasText: tr('神話') }).click(); await sleep(300); await check('levels-hard');
  await home(); await click('自由練習'); await check('practice');
  await home(); await click('對電腦'); for (let i = 0; i < 6; i++) await click('增加一位電腦'); await check('vsai7');
  await page.getByRole('button', { name: tr(/電腦 1 難度/) }).click({force:true,timeout:8000}); await sleep(250); await check('vsai-select'); await page.keyboard.press('Escape');
  await home(); await click('線上對戰'); await sleep(900); await check('online');
  await page.locator('input.field').fill(LANG === 'en' ? 'Tester' : '測試暱稱'); await click('建立房間', true); await check('create-modal'); await page.locator('.modalActions .primary').click(); await sleep(900); await check('room');
  await page.evaluate(() => window.__MRAPP.go('home')); await sleep(400);
  for (const [mode, ais] of [['race', [0, 1, 2, 3, 3, 3, 3]], ['stars', [1, 2]], ['collapse', [1, 2, 3]]]) {
    await startLocal({ kind: 'vsai', mode, diff: 1, ais }); await check(`game-${mode}`);
    await page.evaluate(() => document.querySelector('.sideTab').click()); await sleep(450); await check(`game-${mode}-side`);
    await page.evaluate(() => document.querySelector('.sideTab').click()); await sleep(300);
    if (mode === 'race') { await page.keyboard.press('Escape'); await sleep(300); await check('game-pause'); await page.keyboard.press('Escape'); await sleep(300); }
    await page.evaluate(() => window.__MRAPP.getGame().fastForward()); await page.waitForSelector('.resultModal', { timeout: 40000 }); await sleep(400); await check(`result-${mode}`);
    await page.evaluate(() => window.__MRAPP.go('home')); await sleep(300);
  }
  fs.writeFileSync(`${dir}/issues_${tag}${LANG === 'en' ? '_en' : ''}.txt`, issues.join('\n') + '\n控制台錯誤：' + (errs.length ? errs.join(' | ') : '無') + '\n');
  console.log(tag, '問題', issues.length, '控制台錯誤', errs.length); issues.forEach((i) => console.log('  -', i)); errs.slice(0, 5).forEach((e) => console.log('  err', e));
  await browser.close(); server.close(); process.exit(0);
})().catch((e) => { console.error(tag(), e.message); process.exit(1); function tag() { return W + 'x' + H; } });
