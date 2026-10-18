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
// 闖關
{
  assert.strictEqual(MR.levelSize(0, 1), 5); assert.strictEqual(MR.levelSize(4, 100), 31); for (let d = 0; d < 5; d++) for (let l = 2; l <= 100; l++) assert(MR.levelSize(d, l) >= MR.levelSize(d, l - 1)); ok('五種難度的關卡大小隨關數遞增');
  assert.strictEqual(MR.levelSeed(2, 7), MR.levelSeed(2, 7)); assert.notStrictEqual(MR.levelSeed(2, 7), MR.levelSeed(2, 8)); ok('同一關永遠同一座迷宮');
  const m = MR.makeMaze(10, 10, 1, 0.05); const par = MR.levelPar(m); assert.strictEqual(MR.levelStars(par, m), 3); assert.strictEqual(MR.levelStars(par * 2, m), 2); assert.strictEqual(MR.levelStars(par * 5, m), 1); ok('評星門檻');
  const seen = new Set(); for (let d = 0; d < 5; d++) for (let l = 1; l <= 100; l++) { const s = MR.levelSeed(d, l); seen.add(s); const mm = MR.makeMaze(MR.levelSize(d, l), MR.levelSize(d, l), s, MR.BRAID.race); assert(mm.pathLen >= 4); } assert.strictEqual(seen.size, 500); ok('500 關全部可生成、彼此不同、起訖可達');
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
console.log('規則測試通過：' + n + ' 項');
