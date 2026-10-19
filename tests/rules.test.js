// 規則核心單元測試：迷宮、物理、三種玩法、排名、闖關、電腦難度
const assert = require('assert');
const MR = require('../public/js/rules.js');
const { simulate } = require('./sim.js');
let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

// 迷宮：同 seed 同結果、完全連通、終點在最遠處
{
  const a = MR.makeMaze(15, 15, 42, 0.1), b = MR.makeMaze(15, 15, 42, 0.1), c = MR.makeMaze(15, 15, 43, 0.1);
  assert.deepStrictEqual(Array.from(a.cells), Array.from(b.cells)); assert.notDeepStrictEqual(Array.from(a.cells), Array.from(c.cells)); ok('相同 seed 產生相同迷宮、不同 seed 不同');
  for (const [w, br] of [[6, 0], [28, 0.05], [16, 0.55]]) { const m = MR.makeMaze(w, w, 7, br); const d = m.bfs(0); assert(Array.from(d).every((x) => x >= 0)); }
  ok('迷宮完全連通（含編織後）');
  const m = MR.makeMaze(21, 21, 5, 0.05), d = m.bfs(0); assert.strictEqual(d[m.goal], Math.max(...d)); ok('終點是離起點最遠的格子');
  for (let i = 0; i < m.n; i++) for (const nb of m.neighbors(i)) assert(m.neighbors(nb.i).some((x) => x.i === i)); ok('牆的開合左右對稱');
  const braided = MR.makeMaze(15, 15, 9, 0.6), plain = MR.makeMaze(15, 15, 9, 0); const deadEnds = (mm) => { let k = 0; for (let i = 0; i < mm.n; i++) if (mm.neighbors(i).length === 1) k++; return k; };
  assert(deadEnds(braided) < deadEnds(plain)); ok('編織會減少死路');
}
// 物理：球不穿牆、不出界、撞牆有衝擊值
{
  const m = MR.makeMaze(10, 10, 3, 0), b = { x: 0.5, y: 0.5, vx: 0, vy: 0 }; let hit = 0;
  for (let k = 0; k < 600; k++) { hit = Math.max(hit, MR.stepBall(m, b, -1, -1, 1 / 60)); assert(b.x > 0 && b.y > 0 && b.x < 10 && b.y < 10); }
  assert(b.x >= MR.PHYS.R + MR.PHYS.T / 2 - 1e-6 && b.y >= MR.PHYS.R + MR.PHYS.T / 2 - 1e-6); assert(hit > 0); ok('球推向角落會被牆擋住、不出界');
  const m2 = MR.makeMaze(12, 12, 77, 0.3); let bad = 0; const r = MR.rng(1);
  for (let t = 0; t < 40; t++) { const q = { x: 0.5 + ((r() * 12) | 0), y: 0.5 + ((r() * 12) | 0), vx: 0, vy: 0 }; const ix = r() * 2 - 1, iy = r() * 2 - 1; for (let k = 0; k < 400; k++) { MR.stepBall(m2, q, ix, iy, 1 / 60); if (q.x < 0 || q.y < 0 || q.x > 12 || q.y > 12) bad++; } }
  assert.strictEqual(bad, 0); ok('隨機輸入下球永遠不穿出邊界');
  const v = { x: 5.5, y: 5.5, vx: 0, vy: 0 }; for (let k = 0; k < 300; k++) MR.stepBall(MR.makeMaze(12, 12, 1, 1), v, 0, 0, 1 / 60); assert(Math.hypot(v.vx, v.vy) < 1e-3); ok('不推就會停下（摩擦）');
}
// 競速
{
  const w = new MR.World({ mode: 'race', diff: 0, seed: 5, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }); w.start();
  const g = MR.cellCenter(w.maze, w.maze.goal);
  w.byId.get('b').x = g.x; w.byId.get('b').y = g.y; w.update(0.1);
  assert(w.byId.get('b').fin != null && w.byId.get('b').place === 1 && w.graceLeft != null && w.graceLeft <= MR.GRACE && w.graceLeft > MR.GRACE - 0.2); ok('第一名抵達後開始寬限');
  for (let k = 0; k < 15 * 60 + 5; k++) w.update(1 / 60);
  assert(w.over && w.results[0].id === 'b' && w.results[1].dnf); ok('寬限結束自動結算，未到達者標記未完賽');
  const solo = new MR.World({ mode: 'race', diff: 0, seed: 5, players: [{ id: 'a', name: 'A' }] }); solo.start(); solo.byId.get('a').x = g.x; solo.byId.get('a').y = g.y; solo.update(0.1); assert(solo.over); ok('單人抵達立即結算（不等寬限）');
  const w2 = new MR.World({ mode: 'race', diff: 0, seed: 5, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] }); w2.start();
  const cell = (i) => MR.cellCenter(w2.maze, i); const far = w2.gd; let near = 0, mid = 0; for (let i = 0; i < w2.maze.n; i++) { if (far[i] === 3) near = i; if (far[i] === 9) mid = i; }
  w2.byId.get('a').x = cell(near).x; w2.byId.get('a').y = cell(near).y; w2.byId.get('b').x = cell(mid).x; w2.byId.get('b').y = cell(mid).y;
  const rk = w2.rank(); assert.deepStrictEqual(rk.slice(0, 2).map((r) => r.id), ['a', 'b']); ok('未完賽者依離終點的路徑距離排名');
}
// 搶星星
{
  const w = new MR.World({ mode: 'stars', diff: 1, seed: 11, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }); w.start();
  const cnt = w.stars.length; assert(cnt >= 3); const s = w.stars[0], c = MR.cellCenter(w.maze, s.c);
  w.byId.get('a').x = c.x; w.byId.get('a').y = c.y; w.byId.get('b').x = c.x; w.byId.get('b').y = c.y; const ev = w.update(1 / 60);
  assert.strictEqual(w.byId.get('a').score + w.byId.get('b').score, 1); assert(ev.some((e) => e.e === 'star') && w.stars.length === cnt); ok('同一顆星星只會給一個人，並在別處補生（數量不變）');
  assert(w.stars.every((x, i, arr) => arr.findIndex((y) => y.c === x.c) === i)); ok('星星不會重疊在同一格');
  w.byId.get('b').score = 3; w.byId.get('a').score = 3; w.byId.get('a').last = 10; w.byId.get('b').last = 20; w.t = 89.99; w.update(0.02); assert(w.over && w.results[0].id === 'a'); ok('90 秒結束，同分比較早拿到者名次前');
  const tie = new MR.World({ mode: 'stars', diff: 1, seed: 11, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }); tie.start(); tie.t = 89.99; tie.update(0.02); assert.strictEqual(tie.results[0].place, 1); assert.strictEqual(tie.results[1].place, 1); ok('完全同成績名次並列');
}
// 地板崩塌
{
  const w = new MR.World({ mode: 'collapse', diff: 2, seed: 21, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }); w.start();
  const a = w.byId.get('a'); const i0 = MR.cellAt(w.maze, a.x, a.y);
  for (let k = 0; k < 60 * 1.1; k++) w.update(1 / 60); assert.strictEqual(w.tile[i0], 0); ok('開局前 1.2 秒腳下地磚穩定');
  for (let k = 0; k < 60; k++) w.update(1 / 60); assert.strictEqual(w.tile[i0], 1); ok('站著的地磚開始碎裂');
  for (let k = 0; k < 60 * 2.2; k++) w.update(1 / 60); assert.strictEqual(w.tile[i0], 2); ok('碎裂延遲過後地磚消失');
  assert(!a.alive && w.byId.get('b').alive === false || w.over); ok('站在原地不動會掉下去被淘汰');
  const x = new MR.World({ mode: 'collapse', diff: 0, seed: 3, players: [{ id: 'a', name: 'A' }] }); x.start(); const p = x.byId.get('a');
  for (let k = 0; k < 60 * 30 && !x.over; k++) x.update(1 / 60); assert(x.over && x.results[0].alive === false); ok('單人崩塌：掉落即結束，紀錄存活秒數');
  const y = new MR.World({ mode: 'collapse', diff: 2, seed: 8, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] }); y.start();
  // 讓 b 一直換格存活；a、c 不動 → a、c 先淘汰，b 為最後贏家
  const bc = y.byId.get('b'); let guard = 0; while (!y.over && guard++ < 60 * 200) { const t = y.t; bc.x = 0.5 + ((Math.floor(t * 3) % y.maze.w)); bc.y = 0.5 + (Math.floor(t / 4) % y.maze.h); y.update(1 / 60); }
  assert(y.over); ok('多人崩塌會在有限時間內決出勝負（含猝死機制）');
}
// 闖關：逃出模式
{
  assert.strictEqual(MR.levelSize(0, 1, 'escape'), 6); assert.strictEqual(MR.levelSize(4, 100, 'escape'), 22); for (let d = 0; d < 5; d++) for (let l = 2; l <= 100; l++) assert(MR.levelSize(d, l, 'escape') >= MR.levelSize(d, l - 1, 'escape')); ok('逃出闖關：五種難度的關卡大小隨關數遞增');
  assert.strictEqual(MR.levelSeed(2, 7), MR.levelSeed(2, 7, 'race')); assert.notStrictEqual(MR.levelSeed(2, 7, 'escape'), MR.levelSeed(2, 7)); ok('逃出闖關：種子與競速關卡不同，競速關卡種子不變');
  const seen = new Set(); for (let d = 0; d < 5; d++) for (let l = 1; l <= 100; l++) { const s = MR.levelSeed(d, l, 'escape'); seen.add(s); const sz = MR.levelSize(d, l, 'escape'); const w = new MR.World({ mode: 'escape', diff: d, seed: s, size: sz, players: [{ id: 'a', name: 'A' }] }); const ds = w.esc.doors; let prev = null; assert(ds.length >= 2); ds.forEach((x) => { assert(!x.farSide[x.item] && x.farSide[w.maze.goal] && (!prev || prev[x.item])); prev = x.farSide; }); }
  assert.strictEqual(seen.size, 500); ok('逃出闖關：500 關全部可生成、彼此不同、機關都有解');
  const w = new MR.World({ mode: 'escape', diff: 2, seed: MR.levelSeed(2, 5, 'escape'), size: MR.levelSize(2, 5, 'escape'), players: [{ id: 'a', name: 'A' }] }); const par = MR.levelPar(w.maze, w.esc); assert(par > MR.levelPar(w.maze)); assert.strictEqual(MR.levelStars(par, w.maze, w.esc), 3); assert.strictEqual(MR.levelStars(par * 2, w.maze, w.esc), 2); assert.strictEqual(MR.levelStars(par * 5, w.maze, w.esc), 1); ok('逃出闖關：評星基準含繞路與開門時間');
  const ai = simulate('escape', 2, MR.levelSeed(2, 5, 'escape'), [3], { size: MR.levelSize(2, 5, 'escape'), limit: 900 }).players[0]; assert(ai.fin != null); ok('逃出闖關：困難電腦可完成關卡（' + ai.fin.toFixed(0) + ' 秒，三星基準 ' + (par * 1.35).toFixed(0) + ' 秒）');
}
// 回到起點
{
  const mk = (mode) => { const w = new MR.World({ mode, diff: 1, seed: 77, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }); w.start(); return w; };
  const r = mk('race'); const s0 = [r.players[0].x, r.players[0].y]; r.players[0].x = 5.5; r.players[0].y = 5.5; r.players[0].vx = 3;
  const ev = r.respawn('a'); assert(ev && Math.hypot(r.players[0].x - s0[0], r.players[0].y - s0[1]) < 1e-6 && r.players[0].vx === 0); ok('競速：回到起跑點並清除速度');
  r.players[0].fin = 3; assert.strictEqual(r.respawn('a'), null); ok('競速：已抵達終點不能回起點');
  const st = mk('stars'); const sp = MR.cellCenter(st.maze, st.players[1].spawn); st.players[1].x = 0.5; st.players[1].y = 0.5; st.respawn('b'); assert(Math.hypot(st.players[1].x - sp.x, st.players[1].y - sp.y) < 1e-6); ok('搶星星：回到自己的出生格');
  const cl = mk('collapse'); const sp2 = cl.players[0].spawn; cl.tile[sp2] = 2; cl.respawn('a'); const cur = MR.cellAt(cl.maze, cl.players[0].x, cl.players[0].y); assert(cur !== sp2 && cl.tile[cur] === 0); ok('崩塌：出生格已碎時改回最近的完好地磚');
  cl.players[1].alive = false; assert.strictEqual(cl.respawn('b'), null); ok('已淘汰不能回起點');
  const ap = mk('race'); ap.players[0].x = 9; ap.applyEvent({ e: 'respawn', id: 'a', x: 1.5, y: 2.5 }); assert.strictEqual(ap.players[0].x, 1.5); ok('respawn 事件可同步套用');
}
// 逃出模式
{
  const mk = (diff, seed, ps) => { const w = new MR.World({ mode: 'escape', diff, seed, players: ps || [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }); w.start(); return w; };
  const at = (p, c) => { const q = MR.cellCenter(p.w.maze, c); p.p.x = q.x; p.p.y = q.y; p.p.vx = p.p.vy = 0; };
  // 配置：各難度、多個種子都「有解」——鑰匙／踏板在該門之前、上一道門之後，終點在最後一道門之後
  for (let diff = 0; diff < 5; diff++) for (let seed = 1; seed <= 60; seed++) {
    const w = mk(diff, seed), ds = w.esc.doors, m = w.maze; let prev = null; assert(ds.length >= 2 && ds.length <= 5);
    ds.forEach((d) => { assert(!d.farSide[d.item] && !d.farSide[m.start] && d.farSide[m.goal] && (!prev || prev[d.item])); prev = d.farSide; });
    assert.strictEqual(new Set(ds.map((d) => d.item)).size, ds.length);
  }
  ok('逃出：五種難度各 60 種子的門／鑰匙／踏板配置都有解、不重疊');
  const a = mk(2, 5), b = mk(2, 5); assert.deepStrictEqual(a.esc.doors.map((d) => [d.near, d.far, d.item, d.kind]), b.esc.doors.map((d) => [d.near, d.far, d.item, d.kind])); ok('逃出：同 seed 的機關配置完全相同（伺服器與客戶端一致）');
  // 關著的門擋得住球
  const w = mk(1, 9, [{ id: 'a', name: 'A' }]), p = w.byId.get('a'), d0 = w.esc.doors[0]; assert.strictEqual(d0.kind, 'key');
  const nearC = MR.cellCenter(w.maze, d0.near); p.x = nearC.x; p.y = nearC.y; p.keyHas[0] = 0;
  const dir = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] }[d0.d];
  for (let k = 0; k < 200; k++) w.stepPlayer(p, dir[0], dir[1], 1 / 60);
  assert(w.passed(p) === 0 && MR.cellAt(w.maze, p.x, p.y) === d0.near); ok('逃出：關著的門擋住球');
  // 鑰匙：撿到 → 持有；走到門前 → 永久開門
  const ic = MR.cellCenter(w.maze, d0.item); p.x = ic.x; p.y = ic.y; let ev = w.update(0.01); assert(ev.some((e) => e.e === 'key') && p.keyHas[0] === 1); ok('逃出：碰到鑰匙就持有');
  p.x = nearC.x; p.y = nearC.y; ev = w.update(0.01); assert(ev.some((e) => e.e === 'unlock') && p.open[0] > 1e8 && p.keyHas[0] === 2); ok('逃出：帶著鑰匙走到門前，門永久打開');
  for (let k = 0; k < 200; k++) w.stepPlayer(p, dir[0], dir[1], 1 / 60); assert(w.passed(p) >= 1); ok('逃出：開門後球可以穿過去');
  // 沒拿鑰匙在門前不會開門
  const w2 = mk(1, 9, [{ id: 'a', name: 'A' }]), p2 = w2.byId.get('a'); p2.x = nearC.x; p2.y = nearC.y; w2.update(0.01); assert(p2.open[0] <= 0); ok('逃出：沒有鑰匙不會開門');
  // 踏板：踩下 → 限時開門 → 時間到自動關上；再踩可重開
  const w3 = mk(2, 5, [{ id: 'a', name: 'A' }]), p3 = w3.byId.get('a'), dp = w3.esc.doors[1]; assert.strictEqual(dp.kind, 'plate');
  const pc = MR.cellCenter(w3.maze, dp.item); p3.x = pc.x; p3.y = pc.y; ev = w3.update(0.01); assert(ev.some((e) => e.e === 'plate' && e.d === 1) && p3.open[1] > 5);
  const T = dp.T; for (let k = 0; k < (T - 0.5) * 100; k++) w3.update(0.01); assert(p3.open[1] > 0.3 && p3.open[1] < 0.7, '剩餘 ' + p3.open[1]);
  p3.x = 0.5; p3.y = 0.5; for (let k = 0; k < 100; k++) w3.update(0.01); assert.strictEqual(p3.open[1], 0); ok('逃出：踏板開門只維持一段時間，時間到門自動關上');
  p3.x = pc.x; p3.y = pc.y; ev = w3.update(0.01); assert(ev.some((e) => e.e === 'plate') && p3.open[1] > 5); ok('逃出：門關上後再踩踏板可重新開門');
  // 每個人的狀態各自獨立
  const w4 = mk(1, 9), A = w4.byId.get('a'), B = w4.byId.get('b'); at({ w: w4, p: A }, d0.item); w4.update(0.01); assert(A.keyHas[0] === 1 && B.keyHas[0] === 0); ok('逃出：鑰匙各自獨立，A 撿了 B 還在');
  assert(w4.blockers(A).length === w4.esc.doors.length && w4.blockers(B).length === w4.esc.doors.length); A.open[0] = 1e9; assert(w4.blockers(A).length === w4.esc.doors.length - 1 && w4.blockers(B).length === w4.esc.doors.length); ok('逃出：A 開的門對 B 仍是關的');
  // 事件同步（線上客戶端）
  const cl = mk(1, 9); cl.applyEvent({ e: 'key', id: 'a', d: 0 }); cl.applyEvent({ e: 'unlock', id: 'b', d: 0 }); cl.applyEvent({ e: 'plate', id: 'a', d: 1, T: 8 });
  assert(cl.byId.get('a').keyHas[0] === 1 && cl.byId.get('b').open[0] > 1e8 && cl.byId.get('a').open[1] === 8); cl.doorTick(3); assert(Math.abs(cl.byId.get('a').open[1] - 5) < 1e-4 && cl.byId.get('b').open[0] > 1e8); ok('逃出：key／unlock／plate 事件可同步，客戶端計時會倒數');
  // 勝負：第一人到終點後倒數 10 秒；單人立即結算
  const w5 = mk(0, 3), g = MR.cellCenter(w5.maze, w5.maze.goal); w5.byId.get('b').x = g.x; w5.byId.get('b').y = g.y; w5.update(0.1);
  assert(w5.byId.get('b').place === 1 && w5.grace === 10 && w5.graceLeft <= 10 && w5.graceLeft > 9.8); for (let k = 0; k < 10 * 60 + 5; k++) w5.update(1 / 60);
  assert(w5.over && w5.results[0].id === 'b' && w5.results[1].dnf); ok('逃出：第一個逃出後倒數 10 秒結算，沒逃出者為未完成');
  const s1 = mk(0, 3, [{ id: 'a', name: 'A' }]); s1.byId.get('a').x = g.x; s1.byId.get('a').y = g.y; s1.update(0.1); assert(s1.over); ok('逃出：單人逃出立即結算');
  // 未逃出者依「通過的門數、再依剩餘距離」排名
  const w6 = mk(2, 5, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]); const dd = w6.esc.doors; const gd = w6.gd; let cNear = 0; for (let i = 0; i < w6.maze.n; i++) if (dd[0].farSide[i] && gd[i] > gd[cNear]) cNear = i;
  at({ w: w6, p: w6.byId.get('a') }, cNear); at({ w: w6, p: w6.byId.get('b') }, w6.maze.start); assert.strictEqual(w6.rank()[0].id, 'a'); ok('逃出：未逃出者以通過的門數優先排名');
  // 回起點：保留已拿的鑰匙與開過的門
  const w7 = mk(1, 9, [{ id: 'a', name: 'A' }]); const p7 = w7.byId.get('a'); p7.keyHas[0] = 1; p7.x = 3.5; p7.y = 3.5; assert(w7.respawn('a')); assert(p7.keyHas[0] === 1 && Math.hypot(p7.x - 0.5, p7.y - 0.5) < 1e-6); ok('逃出：回到起點時保留鑰匙');
  // 傳送門：成對、同一段、不擋必經之路、不在鑰匙／踏板上
  { let pairs = 0;
    for (let diff = 0; diff < 5; diff++) for (let seed = 1; seed <= 80; seed++) {
      const w = mk(diff, seed, [{ id: 'a', name: 'A' }]), e = w.esc, items = new Set(e.doors.map((d) => d.item)), seg = (c) => e.doors.map((d) => (d.farSide[c] ? 1 : 0)).join('');
      const bl = new Set(e.portals.flatMap((q) => [q.a, q.b])), dist = w.maze.bfs(w.maze.start, (j) => bl.has(j));
      assert(e.portals.length <= [1, 1, 2, 2, 3][diff]); assert(dist[w.maze.goal] >= 0 && [...items].every((i) => dist[i] >= 0 && !bl.has(i)));
      for (const q of e.portals) { pairs++; assert.strictEqual(seg(q.a), seg(q.b)); assert(q.a !== q.b); }
    }
    assert(pairs > 100); ok('逃出：傳送門成對、同一段（不能繞門）、不擋住必經之路與鑰匙（' + pairs + ' 對）'); }
  { const w = mk(4, 5, [{ id: 'a', name: 'A' }]), p = w.byId.get('a'), q = w.esc.portals[0], A = MR.cellCenter(w.maze, q.a), B = MR.cellCenter(w.maze, q.b);
    p.x = A.x; p.y = A.y; p.vx = 2; let ev = w.update(0.01); assert(ev.some((e) => e.e === 'warp' && e.id === 'a') && Math.hypot(p.x - B.x, p.y - B.y) < 1e-6 && p.vx === 0); ok('逃出：走進傳送門從另一端出來並停下');
    ev = w.update(0.01); assert(!ev.some((e) => e.e === 'warp') && Math.hypot(p.x - B.x, p.y - B.y) < 1e-6); ok('逃出：剛傳送完停在出口不會立刻彈回');
    p.x = B.x + 1; p.y = B.y; w.update(0.01); p.x = B.x; p.y = B.y; ev = w.update(0.01); assert(ev.some((e) => e.e === 'warp') && Math.hypot(p.x - A.x, p.y - A.y) < 1e-6); ok('逃出：離開出口後，從原出口走回去可雙向傳回');
    const cl = mk(4, 5, [{ id: 'a', name: 'A' }]); cl.applyEvent({ e: 'warp', id: 'a', x: 3.5, y: 4.5, w: 1 }); assert(cl.byId.get('a').x === 3.5 && cl.byId.get('a').y === 4.5); ok('逃出：warp 事件可同步套用'); }
  // 每日挑戰種子
  assert.strictEqual(MR.dailySeed('2026-10-19', 2), MR.dailySeed('2026-10-19', 2)); assert.notStrictEqual(MR.dailySeed('2026-10-19', 2), MR.dailySeed('2026-10-20', 2)); assert.notStrictEqual(MR.dailySeed('2026-10-19', 2), MR.dailySeed('2026-10-19', 3)); ok('每日挑戰：同日同難度同一張圖，換日或換難度就不同');
  { const ds = new Set(); for (let d = 1; d <= 120; d++) for (let diff = 0; diff < 5; diff++) { const date = '2026-' + String(1 + ((d / 28) | 0)).padStart(2, '0') + '-' + String(1 + (d % 28)).padStart(2, '0'); const w = mk(diff, MR.dailySeed(date, diff), [{ id: 'a', name: 'A' }]); assert(w.esc.doors.length >= 2); ds.add(date + diff); } ok('每日挑戰：連續 120 天、五種難度的圖都能生成且有機關'); }
  // 電腦：四段 AI 都能逃出簡單迷宮（含開門流程）
  for (const lv of [1, 2, 3]) { const r = simulate('escape', 0, 11, [lv], { limit: 900 }); assert(r.players[0].fin != null, 'AI ' + lv + ' 沒逃出'); } ok('逃出：簡單迷宮電腦（簡單／普通／困難）都能完成開門並逃出');
  const tms = [1, 2, 3].map((lv) => { let t = 0; for (const sd of [11, 22, 33, 44]) { const r = simulate('escape', 1, sd, [lv], { limit: 900 }).players[0]; t += r.fin != null ? r.fin : 900; } return t / 4; }); assert(tms[2] < tms[1] && tms[1] < tms[0], '逃出 AI 難度：' + tms.join(',')); ok('逃出：電腦難度越高逃得越快 ' + tms.map((x) => x.toFixed(0) + 's').join(' > '));
}
// 闖關
{
  assert.strictEqual(MR.levelSize(0, 1), 5); assert.strictEqual(MR.levelSize(4, 100), 31); for (let d = 0; d < 5; d++) for (let l = 2; l <= 100; l++) assert(MR.levelSize(d, l) >= MR.levelSize(d, l - 1)); ok('五種難度的關卡大小隨關數遞增');
  assert.strictEqual(MR.levelSeed(2, 7), MR.levelSeed(2, 7)); assert.notStrictEqual(MR.levelSeed(2, 7), MR.levelSeed(2, 8)); ok('同一關永遠同一座迷宮');
  const m = MR.makeMaze(10, 10, 1, 0.05); const par = MR.levelPar(m); assert.strictEqual(MR.levelStars(par, m), 3); assert.strictEqual(MR.levelStars(par * 2, m), 2); assert.strictEqual(MR.levelStars(par * 5, m), 1); ok('評星門檻');
  const seen = new Set(); for (let d = 0; d < 5; d++) for (let l = 1; l <= 100; l++) { const s = MR.levelSeed(d, l); seen.add(s); const mm = MR.makeMaze(MR.levelSize(d, l), MR.levelSize(d, l), s, MR.braidFor('race', d)); assert(mm.pathLen >= 4); } assert.strictEqual(seen.size, 500); ok('500 關全部可生成、彼此不同、起訖可達');
}
// 電腦難度：可觀察差異
{
  const avg = (mode, diff, lv, seeds, f) => { let t = 0; for (const s of seeds) t += f(simulate(mode, diff, s, [lv], { limit: 400 })); return t / seeds.length; };
  const seeds = [11, 22, 33, 44, 55];
  const times = [0, 1, 2, 3].map((lv) => avg('race', 1, lv, seeds, (w) => (w.players[0].fin != null ? w.players[0].fin : 400)));
  for (let i = 1; i < 4; i++) assert(times[i] < times[i - 1], '競速 AI 難度越高越快：' + times.join(',')); ok('競速：四段 AI 完賽時間嚴格遞減 ' + times.map((x) => x.toFixed(1) + 's').join(' > '));
  const sc = [0, 1, 2, 3].map((lv) => avg('stars', 2, lv, seeds, (w) => w.players[0].score));
  for (let i = 1; i < 4; i++) assert(sc[i] > sc[i - 1], '搶星星 AI 分數遞增：' + sc.join(',')); ok('搶星星：四段 AI 得分嚴格遞增 ' + sc.map((x) => x.toFixed(1)).join(' < '));
  const sv = [0, 3].map((lv) => avg('collapse', 2, lv, [1, 2, 3, 4, 5, 6, 7, 8], (w) => w.players[0].out || w.t)); assert(sv[1] > sv[0], '崩塌：困難 AI 存活更久 ' + sv.join(',')); ok('地板崩塌：困難 AI 存活比幼幼班久 ' + sv.map((x) => x.toFixed(1) + 's').join(' vs '));
  const h = simulate('race', 3, 1234, [3], { limit: 400 }).players[0].fin; assert(h != null && h < 400); ok('困難 AI 能完成困難迷宮');
}
{ // 難度主題與環路比例
  assert.strictEqual(MR.DIFF_THEME.length, 5); assert.strictEqual(new Set(MR.DIFF_THEME.map((t) => t.wall)).size, 5);
  const b = [0, 1, 2, 3, 4].map((d) => MR.braidFor('race', d)); for (let i = 1; i < 5; i++) assert(b[i] < b[i - 1]);
  const dead = (d) => { let t = 0; for (let l = 1; l <= 20; l++) { const sz = MR.levelSize(d, l * 5); const m = MR.makeMaze(sz, sz, MR.levelSeed(d, l * 5), MR.braidFor('race', d)); let c = 0; for (let k = 0; k < m.n; k++) { let o = 0; for (let q = 0; q < 4; q++) if (!(m.cells[k] & (1 << q))) o++; if (o === 1) c++; } t += c / m.n; } return t / 20; };
  assert(dead(4) > dead(0) * 1.2); ok('五種難度主題各不相同、環路比例遞減、越難死路比例越高');
}
console.log('規則測試通過：' + n + ' 項');
