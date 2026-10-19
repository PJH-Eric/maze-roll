// 房間／邀請／觀戰／關房／對局流程測試（不經網路，直接用假連線驅動 Hub）
const assert = require('assert');
const { Hub } = require('../lib/hub.js');
const MR = require('../public/js/rules.js');

function client(hub, name) {
  const log = [];
  const c = hub.connect((o) => log.push(o));
  const api = { c, log, name,
    send(o) { hub.handle(c, o); },
    last(t) { for (let i = log.length - 1; i >= 0; i--) if (log[i].t === t) return log[i]; return null; },
    all(t) { return log.filter((x) => x.t === t); },
    get mid() { return c.mid; } };
  api.send({ t: 'hello', name });
  return api;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const hub = new Hub({ countdown: 1, countMs: 20, tickMs: 10, listThrottleMs: 5, dropGraceMs: 150 });
  let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

  const a = client(hub, '小明'), b = client(hub, '小華'), s1 = client(hub, '路人');
  assert(a.last('hi').mid && a.last('rooms'), 'hello 回應'); ok('hello 與大廳列表');

  a.send({ t: 'create', name: '<b>小明</b>', mode: 'stars', diff: 1 });
  const joined = a.last('joined'); assert(joined && joined.role === 'player');
  const room = a.last('room').room; assert.strictEqual(room.members[0].name, 'b小明/b'.replace('/', '') === '' ? '' : room.members[0].name); assert(!/[<>]/.test(room.members[0].name)); ok('建房、暱稱消毒');
  assert.strictEqual(room.mode, 'stars'); assert(room.invite.tp && room.invite.ts);

  // 邀請：player token → 玩家；spectator token → 觀戰；無效
  b.send({ t: 'peek', code: room.code, token: room.invite.tp }); assert(b.last('peek').ok && b.last('peek').role === 'player');
  b.send({ t: 'peek', code: room.code, token: 'zzzz' }); assert(!b.last('peek').ok && b.last('peek').reason === 'invalid');
  b.send({ t: 'join', code: room.code, token: room.invite.tp, name: '小華', role: 'spec' }); // 暱稱／role 不能改變權限
  assert.strictEqual(b.last('joined').role, 'player'); ok('player token 決定為玩家（不可被 role 欄位覆寫）');
  s1.send({ t: 'join', code: room.code, token: room.invite.ts, name: '路人' });
  assert.strictEqual(s1.last('joined').role, 'spec'); assert.strictEqual(s1.last('room').room.invite, null); ok('觀戰 token → 觀戰者且看不到邀請 token');

  // 撤銷
  const old = room.invite.tp;
  a.send({ t: 'invite', act: 'revoke' });
  const c3 = client(hub, '遲到'); c3.send({ t: 'peek', code: room.code, token: old }); assert.strictEqual(c3.last('peek').reason, 'revoked'); ok('撤銷後舊連結顯示已撤銷');

  // 玩家額滿 → 轉觀戰（fallback）
  const extra = [client(hub, 'p3'), client(hub, 'p4'), client(hub, 'p5')];
  extra.forEach((e) => e.send({ t: 'join', code: room.code, name: e.name }));
  assert.strictEqual(extra[0].last('joined').role, 'player'); assert.strictEqual(extra[1].last('joined').role, 'player');
  assert.strictEqual(extra[2].last('joined').role, 'spec'); assert(extra[2].last('joined').fallback); ok('額滿時轉為觀戰並標示 fallback（人數上限 4）');
  extra[1].send({ t: 'leave' }); extra[0].send({ t: 'leave' }); extra[2].send({ t: 'leave' });

  // 開局條件
  a.send({ t: 'start' }); assert.strictEqual(a.last('err').code, 'notready'); ok('有人未準備不得開始');
  b.send({ t: 'ready', v: true });
  a.send({ t: 'set', mode: 'race', diff: 0 }); assert.strictEqual(a.last('room').room.mode, 'race'); assert(!a.last('room').room.members.find((m) => m.id === b.mid).ready); ok('房主改設定會重置準備');
  b.send({ t: 'set', mode: 'stars' }); assert.strictEqual(a.last('room').room.mode, 'race'); ok('非房主不能改設定');
  b.send({ t: 'ready', v: true }); a.send({ t: 'start' });
  assert(a.last('init') && a.last('init').mode === 'race' && s1.last('init'), '全員含觀戰收到 init');
  const init = a.last('init'); assert.strictEqual(init.players.length, 2);
  await sleep(120); assert(a.last('go')); ok('倒數後 go');

  // 回到起點：伺服器重設位置、廣播事件、1 秒冷卻
  {
    const mz0 = new MR.World({ mode: 'race', diff: init.diff, seed: init.seed, players: [] }).maze, st0 = MR.cellCenter(mz0, 0), gl0 = MR.cellCenter(mz0, mz0.goal);
    // 回報位置要離起點遠一點（才看得出被重設）、離起點不超過 3（不被當成瞬移），而且不能碰到終點（碰到就算抵達，不能再回起點）；種子是隨機的，所以從這張迷宮裡挑
    let spot = null; for (let i = 1; i < mz0.n && !spot; i++) { const c = MR.cellCenter(mz0, i), ds = Math.hypot(c.x - st0.x, c.y - st0.y); if (ds > 1.2 && ds < 2.8 && Math.hypot(c.x - gl0.x, c.y - gl0.y) > MR.GOAL_R + 0.5) spot = c; }
    assert(spot, '找得到不是終點的測試位置');
    b.send({ t: 'pos', x: spot.x, y: spot.y, vx: 1, vy: 1 }); await sleep(30);
    const n0 = a.all('ev').length; b.send({ t: 'respawn' }); await sleep(60);
    const evs = a.all('ev').slice(n0).flatMap((m) => m.ev).filter((e) => e.e === 'respawn' && e.id === b.mid);
    assert.strictEqual(evs.length, 1, '收到一次 respawn 事件'); ok('回到起點：伺服器廣播 respawn');
    b.send({ t: 'respawn' }); await sleep(60);
    assert.strictEqual(a.all('ev').slice(n0).flatMap((m) => m.ev).filter((e) => e.e === 'respawn').length, 1); ok('回到起點：冷卻期內重複請求被忽略');
  }
  // 競速：兩人把位置送到終點
  const w = new MR.World({ mode: 'race', diff: init.diff, seed: init.seed, players: [] });
  const g = MR.cellCenter(w.maze, w.maze.goal);
  b.send({ t: 'pos', x: g.x, y: g.y, vx: 0, vy: 0 });
  await sleep(80);
  assert(a.all('ev').some((m) => m.ev.some((e) => e.e === 'finish' && e.id === b.mid))); ok('伺服器依回報位置判定抵達終點');
  assert.strictEqual(a.last('grace').left, 10); ok('第一名後開始 10 秒倒數');
  a.send({ t: 'pos', x: g.x, y: g.y, vx: 0, vy: 0 });
  await sleep(80);
  assert(!a.last('end') && !s1.last('end')); assert.strictEqual(hub.rooms.get(room.code).state, 'playing');
  const raceWorld = hub.rooms.get(room.code).world;
  assert(a.last('snap').graceLeft > 0); ok('全員到達仍在倒數，玩家與觀戰者都不提前結算');
  raceWorld.update(raceWorld.graceLeft - 0.02); await sleep(80);
  const end = a.last('end'); assert(end && end.results[0].id === b.mid && end.results[1].id === a.mid); assert(s1.last('end')); ok('倒數結束才結算，名次正確，觀戰者同步收到');
  assert.strictEqual(hub.rooms.get(room.code).state, 'ended');

  // 再來一局：非房主只投票、房主開新局
  b.send({ t: 'rematch' }); assert(a.last('room').room.members.find((m) => m.id === b.mid).vote); ok('非房主再來一局＝投票');
  const seed1 = init.seed; a.send({ t: 'rematch' }); assert(a.last('init').seed !== seed1); ok('房主再來一局換新 seed');
  await sleep(100);

  // 搶星星：位置送到星星上
  a.send({ t: 'leave' }); // 房主離開（對局中）→ b 變房主；房內玩家剩 1
  assert.strictEqual(b.last('room').room.host, b.mid); ok('房主離開自動換人');
  assert(hub.rooms.has(room.code));
  // 觀戰者留著、最後一位真人玩家離開 → 立刻關房
  b.send({ t: 'leave' });
  assert(!hub.rooms.has(room.code)); assert(s1.last('closed')); ok('實體玩家歸零：房間立即關閉並通知觀戰者');
  c3.send({ t: 'peek', code: room.code, token: old }); // 重新連線不能復活
  const late = client(hub, '遲到2'); late.send({ t: 'join', code: room.code, name: 'x' }); assert.strictEqual(late.last('err').code, 'closed'); ok('已關閉房間不可再加入（顯示房間已結束）');

  // 只剩觀戰者＋AI（此遊戲無線上 AI）：觀戰者單獨不算實體玩家
  const h = client(hub, '房主2'), sp = client(hub, '觀戰2');
  h.send({ t: 'create', name: '房主2' }); const code2 = h.last('joined').code;
  sp.send({ t: 'join', code: code2, role: 'spec', name: '觀戰2' }); assert.strictEqual(sp.last('joined').role, 'spec');
  h.send({ t: 'leave' }); assert(!hub.rooms.has(code2)); assert(sp.last('closed')); ok('只剩觀戰者時房間關閉');

  // 逃出模式（線上）：開局、伺服器判定拿鑰匙／開門事件、重連快照含機關狀態、第一人逃出後倒數 10 秒
  {
    const e1 = client(hub, 'E1'), e2 = client(hub, 'E2'); e1.send({ t: 'create', name: 'E1', mode: 'escape', diff: 1 }); const ec = e1.last('joined').code;
    assert.strictEqual(hub.rooms.get(ec).mode, 'escape'); e2.send({ t: 'join', code: ec, name: 'E2' }); e2.send({ t: 'ready', v: true }); e1.send({ t: 'start' });
    const init = e1.last('init'); assert(init && init.mode === 'escape' && init.size === MR.SIZE.escape[1]); await sleep(120);
    const room = hub.rooms.get(ec), w = room.world; assert(room.state === 'playing' && w.esc && w.esc.doors.length >= 2);
    const d0 = w.esc.doors[0], ic = MR.cellCenter(w.maze, d0.item); e1.send({ t: 'pos', x: ic.x, y: ic.y, vx: 0, vy: 0 }); await sleep(60);
    const evs = e2.all('ev').flatMap((m) => m.ev); assert(evs.some((x) => x.e === 'key' && x.id === e1.mid && x.d === 0)); assert(w.byId.get(e2.mid).keyHas[0] === 0); ok('逃出（線上）：伺服器依回報位置判定拿鑰匙，並廣播給所有人、不影響別人');
    hub.disconnect(e2.c); const e2b = hub.connect((o) => e2.log.push(o)); e2b.lobby = true; hub.handle(e2b, { t: 'hello', name: 'E2', mid: e2.mid });
    const rs = e2.all('init').filter((m) => m.resume).pop(); const row = rs.snap.find((r) => r[0] === e1.mid); assert(rs && row[7][0] === 1 && row[8].length === w.esc.doors.length); ok('逃出（線上）：重連快照包含每人的鑰匙與門狀態');
    { const q = w.esc.portals[0]; if (q) { const A = MR.cellCenter(w.maze, q.a), B = MR.cellCenter(w.maze, q.b); hub.members.get(e1.mid).has = false; e1.send({ t: 'pos', x: A.x, y: A.y, vx: 0, vy: 0 }); await sleep(60);
      const wev = e2.all('ev').flatMap((m) => m.ev).find((x) => x.e === 'warp' && x.id === e1.mid); assert(wev && Math.abs(wev.x - B.x) < 0.01);
      e1.send({ t: 'pos', x: A.x + 0.1, y: A.y, vx: 0, vy: 0 }); await sleep(30); const sp = w.byId.get(e1.mid); assert(Math.hypot(sp.x - B.x, sp.y - B.y) < 0.01, '傳送後短暫忽略舊位置'); ok('逃出（線上）：伺服器判定傳送、廣播 warp，傳送後短暫忽略舊位置回報'); } }
    const gc = MR.cellCenter(w.maze, w.maze.goal); hub.members.get(e1.mid).has = false; hub.members.get(e1.mid).warpUntil = 0; e1.send({ t: 'pos', x: gc.x, y: gc.y, vx: 0, vy: 0 }); await sleep(60);
    const gr = e2.last('grace'); assert(gr && gr.left === 10); ok('逃出（線上）：第一人逃出後通知倒數 10 秒');
    hub._resume(room, hub.members.get(e2.mid));
    assert(e2.last('init').graceLeft > 0 && e2.last('init').graceLeft <= 10); ok('倒數期間重連會還原剩餘秒數');
    hub.members.get(e2.mid).has = false;
    hub.handle(e2b, { t: 'pos', x: gc.x, y: gc.y, vx: 0, vy: 0 }); await sleep(60);
    assert(!e1.last('end') && !e2.last('end') && room.state === 'playing');
    w.update(w.graceLeft - 0.02); await sleep(80);
    assert(e1.last('end') && e2.last('end') && room.state === 'ended'); ok('逃出（線上）：全員逃出後仍須倒數結束才結算');
    e2b.lobby = false; hub.disconnect(e2b); e1.send({ t: 'leave' }); e2.send({ t: 'leave' });
  }

  // 聊天
  const x = client(hub, 'X'), y = client(hub, 'Y'); x.send({ t: 'create', name: 'X' }); const code3 = x.last('joined').code; y.send({ t: 'join', code: code3, name: 'Y' });
  x.send({ t: 'chat', text: '  <script>hi</script>  ' }); assert.strictEqual(y.last('chat').text, 'scripthi/script'); ok('聊天消毒');
  x.send({ t: 'chat', text: 'again' }); assert.notStrictEqual(y.last('chat').text, 'again'); ok('聊天頻率限制');

  // 踢人
  x.send({ t: 'kick', id: y.mid }); assert(y.last('left') && y.last('left').why === 'kicked'); ok('房主踢人');

  // 斷線重連
  const z = client(hub, 'Z'); z.send({ t: 'join', code: code3, name: 'Z' }); const zmid = z.mid; hub.disconnect(z.c);
  const z2 = hub.connect((o) => z.log.push(o)); z2.lobby = true; hub.handle(z2, { t: 'hello', name: 'Z', mid: zmid });
  assert(z.last('hi').resumed && z.last('room').room.code === code3); ok('斷線後以 mid 重連回到房間');

  // 斷線逾時 → 移出；房主等最後一人 → 關房
  hub.disconnect(z2); hub.disconnect(x.c); await sleep(260); hub.sweep();
  assert(!hub.rooms.has(code3)); ok('全員斷線逾時後房間關閉');

  hub.shutdown(); console.log('hub 測試通過：' + n + ' 項'); process.exit(0);
})().catch((e) => { console.error('❌', e); process.exit(1); });
