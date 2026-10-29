// 線上流程端對端（真瀏覽器 + 真 WebSocket）：建房 → 邀請連結 → 觀戰連結 → 準備 → 開局 → 結算 → 再來一局 → 關房
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { server, hub } = require('../server.js');
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = +process.argv[2] || 1180, H = +process.argv[3] || 820;
(async () => {
  await new Promise((r) => server.listen(3197, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } }); const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); }); page.on('pageerror', (e) => errs.push(name + ' pageerror: ' + e.message));
    await page.addInitScript(() => { window.__MR_PRESERVE = true; });
    return page;
  };
  const host = await mk('host'), guest = await mk('guest'), spec = await mk('spec');
  const btn = (p, t) => p.getByRole('button', { name: t }).first();
  const ok = (m) => console.log('  ✓', m); console.log('start');

  console.log('goto'); await host.goto('http://localhost:3197/'); console.log('loaded'); await btn(host, '線上對戰').click(); await sleep(600);
  await host.locator('input.field').fill('房主阿明'); await btn(host, '建立房間').click(); await sleep(300);
  await host.locator('.modalActions .primary').click(); await sleep(700);
  const room = await host.evaluate(() => window.__MRAPP.session.room); assert(room && room.code, '房主進入房間'); ok('房主建房 ' + room.code);
  await host.screenshot({ path: '/tmp/shots/room_host.png' });

  // 受邀者：開啟邀請連結 → 停在大廳確認暱稱（不自動入房）
  const link = await host.evaluate(() => { const r = window.__MRAPP.session.room; return location.origin + location.pathname + '#/join/' + r.code + '/' + r.invite.tp; });
  const slink = await host.evaluate(() => { const r = window.__MRAPP.session.room; return location.origin + location.pathname + '#/join/' + r.code + '/' + r.invite.ts; });
  await guest.goto(link); await sleep(600);
  assert(await guest.locator('.inviteCard').count() === 1, '顯示邀請卡'); assert.strictEqual(await guest.evaluate(() => window.__MRAPP.session.room), null, '不自動入房'); ok('邀請連結：停在大廳等待確認，未自動入房');
  await guest.screenshot({ path: '/tmp/shots/invite_guest.png' });
  await guest.locator('input.field').fill('朋友小華'); await btn(guest, '確認並加入').click(); await sleep(700);
  assert.strictEqual(await guest.evaluate(() => window.__MRAPP.session.role), 'player'); ok('確認暱稱後以玩家身分加入');

  await spec.goto(slink); await sleep(600); await spec.locator('input.field').fill('觀戰路人'); await btn(spec, '確認並觀戰').click(); await sleep(700);
  assert.strictEqual(await spec.evaluate(() => window.__MRAPP.session.role), 'spec'); ok('觀戰連結 → 觀戰者');

  // 聊天
  await guest.locator('.chatBox input.field').fill('嗨大家'); await btn(guest, '送出').click(); await sleep(400);
  assert((await host.locator('.chatList').innerText()).includes('嗨大家')); assert((await spec.locator('.chatList').innerText()).includes('嗨大家')); ok('聊天室同房同步（含觀戰者）');

  await btn(guest, '準備好了').click(); await sleep(300);
  await host.screenshot({ path: '/tmp/shots/room_ready.png' });
  await btn(host, '開始遊戲').click(); await sleep(600);
  for (const [n, p] of [['host', host], ['guest', guest], ['spec', spec]]) { assert(await p.locator('.gameScreen').count() === 1, n + ' 進入遊戲'); }
  ok('三方進入遊戲畫面');
  await sleep(1500);
  // 房主往右下滾、朋友往左下滾
  await host.evaluate(() => { const g = window.__MRAPP.getGame(); g.input.keys.add('d'); g.input.keys.add('s'); });
  await guest.evaluate(() => { const g = window.__MRAPP.getGame(); g.input.keys.add('s'); });
  await sleep(3000);
  const pos = await spec.evaluate(() => window.__MRAPP.getGame().world.players.map((p) => [p.name, +p.x.toFixed(2), +p.y.toFixed(2)]));
  console.log('  觀戰者看到的位置', JSON.stringify(pos));
  assert(pos.some((p) => Math.hypot(p[1] - 0.5, p[2] - 0.5) > 0.1), '觀戰者看到球移動'); ok('觀戰者即時看到對手移動');
  await host.screenshot({ path: '/tmp/shots/online_game_host.png' });
  await spec.screenshot({ path: '/tmp/shots/online_game_spec.png' });

  // 直接用伺服器位置作弊式到終點，檢驗結算（以 hub 內部世界為準）
  const code = room.code, r = hub.rooms.get(code), w = r.world, m = w.maze, gc = { x: (m.goal % m.w) + 0.5, y: ((m.goal / m.w) | 0) + 0.5 };
  await host.evaluate(() => { const g = window.__MRAPP.getGame(); g.input.keys.clear(); }); await guest.evaluate(() => { const g = window.__MRAPP.getGame(); g.input.keys.clear(); });
  for (const p of w.players) { p.x = gc.x; p.y = gc.y; }
  for (const [n, p] of [['host', host], ['guest', guest], ['spec', spec]]) { await p.waitForSelector('.resultModal', { timeout: 10000 }); assert(await p.locator('.resultModal').count() === 1, n + ' 看到結算疊層'); }
  ok('三方都看到結算疊層（遊戲畫面保留在背景）');
  await host.screenshot({ path: '/tmp/shots/online_result_host.png' });
  await spec.screenshot({ path: '/tmp/shots/online_result_spec.png' });
  assert(await spec.locator('.resultModal .modalActions .btn').first().isDisabled(), '觀戰者不能再來一局'); ok('觀戰者的「再來一局」停用');

  // 再來一局（房主）→ 新對局
  const seed1 = r.seed; await host.locator('.resultModal .modalActions .btn').first().click(); await sleep(1500);
  assert(r.seed !== seed1 && (await guest.locator('.gameScreen').count()) === 1 && (await guest.locator('.resultModal').count()) === 0); ok('房主再來一局：全員進入新對局、結算疊層關閉');

  // 回到房間／首頁：玩家全離開 → 房間關閉，觀戰者收到房間已結束
  await sleep(300);
  await guest.evaluate(() => window.__MRAPP.go('home')); await sleep(300);
  await host.evaluate(() => window.__MRAPP.go('home')); await sleep(500);
  assert(!hub.rooms.has(code)); await sleep(300);
  assert(await spec.locator('.notice').count() === 1, '觀戰者看到房間已結束提示'); ok('實體玩家歸零：房間關閉，觀戰者回到大廳並看到提示');
  await spec.screenshot({ path: '/tmp/shots/spec_closed.png' });
  // 已關閉房間的舊邀請不能復活
  await guest.goto(link); await sleep(600);
  assert((await guest.locator('.inviteCard.bad').count()) === 1); ok('關閉後舊邀請顯示無效／已結束');

  console.log(errs.length ? 'console 錯誤：\n' + errs.join('\n') : '沒有 console 錯誤');
  await browser.close(); server.close(); hub.shutdown(); process.exit(errs.length ? 1 : 0);
})().catch(async (e) => { console.error('❌', e); process.exit(1); });
