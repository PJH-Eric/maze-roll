// 以固定時間步模擬整局（供測試與難度驗證）
const MR = require('../public/js/rules.js'), { makeAI } = require('../public/js/ai.js');
function simulate(mode, diff, seed, aiLevels, opts = {}) {
  const players = aiLevels.map((lv, i) => ({ id: 'p' + i, name: 'AI' + i, kind: 'ai' }));
  if (opts.human) players.unshift({ id: 'h', name: 'H', kind: 'human' });
  const w = new MR.World({ mode, diff, seed, players, size: opts.size, grace: opts.grace });
  const ais = aiLevels.map((lv, i) => makeAI(w, w.byId.get('p' + i), lv));
  w.start();
  const dt = 1 / 60; let steps = 0; const limit = (opts.limit || 400) * 60;
  while (!w.over && steps++ < limit) {
    ais.forEach((ai, i) => { const p = w.players.find((q) => q.id === 'p' + i); if (!p.alive) return; if (w.run && p.fin != null) return; const [ix, iy] = ai.step(dt); w.stepPlayer(p, ix, iy, dt); });
    if (opts.human && w.byId.get('h').alive) { /* 人類不動 */ }
    w.update(dt);
  }
  return w;
}
module.exports = { simulate };
