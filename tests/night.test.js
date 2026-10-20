const assert = require('node:assert/strict');
const MR = require('../public/js/rules.js');
const AI = require('../public/js/ai.js');

function world(mode, lightsOut = true, seed = 17) {
  return new MR.World({ mode, lightsOut, diff: 2, seed, size: 10, players: [{ id: 'a', kind: 'ai' }] });
}

for (const mode of MR.MODES) {
  const day = world(mode, false), night = world(mode);
  assert.deepEqual(day.maze.cells, night.maze.cells, mode + ': darkness must not change the maze');
  assert.equal(day.maze.goal, night.maze.goal);
  assert.equal(day.crumble, night.crumble);
  assert.equal(day.grace, night.grace);
  assert.equal(AI.makeAI(day, day.players[0], 4).memory, null);
}

{
  const w = world('stars'), p = w.players[0], memory = AI.makeMemory(w, p);
  memory.observe();
  let distant = -1;
  for (let c = 0; c < w.maze.n; c++) {
    const q = MR.cellCenter(w.maze, c), visible = Math.hypot(q.x - p.x, q.y - p.y) <= MR.DARK_RADIUS;
    assert.equal(memory.seen[c], Number(visible));
    if (!visible) distant = c;
  }
  assert(distant >= 0 && memory.maze.neighbors(distant).length === 0);
  const old = { x: p.x, y: p.y };
  Object.assign(p, MR.cellCenter(w.maze, distant)); memory.observe();
  assert.equal(memory.seen[MR.cellAt(w.maze, old.x, old.y)], 1, 'visited roads stay remembered');
  const star = { id: 999, c: distant }; w.stars.push(star); memory.observe();
  Object.assign(p, old); w.stars = w.stars.filter((s) => s.id !== star.id); memory.observe();
  assert(memory.stars.has(star.id), 'offscreen collection must not leak into AI memory');
  Object.assign(p, MR.cellCenter(w.maze, distant)); memory.observe();
  assert(!memory.stars.has(star.id), 'returning to the area refreshes remembered collectibles');
}

{
  const w = world('collapse'), p = w.players[0], memory = AI.makeMemory(w, p);
  memory.observe(); const cell = MR.cellAt(w.maze, p.x, p.y);
  Object.assign(p, MR.cellCenter(w.maze, memory.seen.findIndex((v) => !v)));
  w.tile[cell] = 2; memory.observe();
  assert.equal(memory.tiles[cell], 0, 'offscreen random collapse must not update AI memory');
}

for (const mode of ['race', 'escape']) for (const seed of [3, 17, 42]) {
  const w = world(mode, true, seed), p = w.players[0], ai = AI.makeAI(w, p, 4);
  Object.defineProperty(w, 'gd', { get() { throw new Error('night AI read the complete goal-distance map'); } });
  w.start();
  for (let tick = 0; tick < 60000 && !w.over; tick++) {
    const input = ai.step(0.01);
    assert(Math.hypot(...input) <= 1.000001);
    w.stepPlayer(p, ...input, 0.01); w.update(0.01);
  }
  assert(p.fin != null, mode + ': exploratory AI must complete gates and reach the discovered goal, seed ' + seed);
}
console.log('關燈測試通過：地圖與規則不變、局部感知與記憶隔離、競速／逃出探索完賽');
