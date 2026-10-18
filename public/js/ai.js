/* 迷宮滾球：電腦對手。四段難度（0 幼幼班／1 簡單／2 普通／3 困難）。
   難度不只是名字：最高輸入（速度）、轉彎判斷失誤率、手抖、搶星星的選目標策略、崩塌時的求生策略都不同。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.MRAI = factory(root.MR);
})(typeof self !== 'undefined' ? self : this, function (MR) {
  'use strict';
  const { DIRS, DX, DY, OPP, cellAt, cellCenter, rng, clamp } = MR;

  const LEVELS = [
    { cap: 0.45, mistake: 0.34, commit: [3, 6], jitter: 0.22, idle: 0.5, think: 0.5 },
    { cap: 0.66, mistake: 0.17, commit: [2, 5], jitter: 0.13, idle: 0, think: 0.35 },
    { cap: 0.84, mistake: 0.06, commit: [2, 4], jitter: 0.06, idle: 0, think: 0.2 },
    { cap: 1.0, mistake: 0, commit: [0, 0], jitter: 0.015, idle: 0, think: 0.12 },
  ];

  /** 沿著距離場往下走，找出一段直線並回傳最遠的直線端點與是否為轉彎點。 */
  function straightRun(maze, field, from) {
    let cur = from, dir = 0, count = 0;
    for (let guard = 0; guard < 8; guard++) {
      let best = null;
      for (const nb of maze.neighbors(cur)) if (field[nb.i] >= 0 && field[nb.i] < field[cur] && (!best || field[nb.i] < field[best.i])) best = nb;
      if (!best) return { to: cur, turn: false, end: true };
      if (count === 0) dir = best.d;
      else if (best.d !== dir) return { to: cur, turn: true, end: false };
      cur = best.i; count++;
      if (field[cur] === 0) return { to: cur, turn: false, end: true };
    }
    return { to: cur, turn: false, end: false };
  }

  /** 朝目標點前進：沿路徑全力，側向速度修正，接近轉彎點時依距離限速。 */
  function steerTo(p, tx, ty, turn, cap, lvl) {
    const ex = tx - p.x, ey = ty - p.y, dist = Math.hypot(ex, ey) || 1e-6;
    const ux = ex / dist, uy = ey / dist;
    const va = p.vx * ux + p.vy * uy;
    const px = p.vx - va * ux, py = p.vy - va * uy;
    const vAllowed = turn ? 1.2 + dist * 2.0 : 6;
    const throttle = clamp((Math.min(vAllowed, cap * 3.65) - va) * 1.6, -1, 1);
    let ix = ux * throttle - px * 1.3, iy = uy * throttle - py * 1.3;
    const m = Math.hypot(ix, iy);
    if (m > cap) { ix = ix / m * cap; iy = iy / m * cap; }
    return [ix, iy];
  }

  function makeAI(world, player, level, seed) {
    const L = LEVELS[clamp(level | 0, 0, 3)];
    const r = rng(MR.hashSeed('ai', world.seed, player.id, seed || 0));
    const maze = world.maze;
    const st = { cell: -1, commitLeft: 0, wrong: false, prev: -1, thinkT: 0, target: null, field: null, idle: 0, idleCd: 4 + r() * 4, phase: r() * 6.28, collapseNext: -1 };
    const starFields = new Map();
    const fieldOf = (c) => { let f = starFields.get(c); if (!f) { f = maze.bfs(c); starFields.set(c, f); } return f; };

    function raceField() { return world.gd; }

    function moveAlong(field, dt, t) {
      const c = cellAt(maze, player.x, player.y);
      if (c !== st.cell) {
        st.prev = st.cell; st.cell = c;
        if (st.commitLeft > 0) st.commitLeft--;
        else if (L.mistake > 0 && r() < L.mistake && field[c] > 2) {
          const opts = maze.neighbors(c).filter((nb) => nb.i !== st.prev && field[nb.i] >= field[c]);
          if (opts.length) { st.wrongTo = opts[(r() * opts.length) | 0].i; st.commitLeft = L.commit[0] + ((r() * (L.commit[1] - L.commit[0] + 1)) | 0); }
        }
      }
      let tx, ty, turn = true;
      if (st.commitLeft > 0 && st.wrongTo != null) {
        // 走錯路：沿著隨機岔路往前直到承諾結束
        const nbs = maze.neighbors(c).filter((nb) => nb.i !== st.prev);
        let pick = nbs.find((nb) => nb.i === st.wrongTo) || nbs[(r() * nbs.length) | 0] || maze.neighbors(c)[0];
        if (pick) { st.wrongTo = pick.i; const q = cellCenter(maze, pick.i); tx = q.x; ty = q.y; }
      }
      if (tx == null) {
        const run = straightRun(maze, field, c);
        const q = cellCenter(maze, run.to); tx = q.x; ty = q.y; turn = run.turn || run.end;
      }
      return steerTo(player, tx, ty, turn, L.cap, L);
    }

    function pickStar(t) {
      const cands = world.stars; if (!cands.length) return null;
      const me = cellAt(maze, player.x, player.y);
      if (level === 0) return cands[(r() * cands.length) | 0];
      if (level === 1) {
        let best = null, bd = 1e9;
        for (const s of cands) { const c = cellCenter(maze, s.c), d = Math.hypot(c.x - player.x, c.y - player.y); if (d < bd) { bd = d; best = s; } }
        return best;
      }
      let best = null, bs = 1e9;
      for (const s of cands) {
        const d = fieldOf(s.c)[me]; if (d < 0) continue;
        let score = d;
        if (level === 3) { // 困難：避開對手明顯比自己近的星星
          const c = cellCenter(maze, s.c);
          for (const o of world.players) {
            if (o === player || !o.alive) continue;
            const od = Math.hypot(c.x - o.x, c.y - o.y);
            if (od < d * 0.7) score += 6;
          }
        }
        if (score < bs) { bs = score; best = s; }
      }
      return best;
    }

    function collapseMove(dt) {
      const c = cellAt(maze, player.x, player.y);
      if (c !== st.cell) { st.prev = st.cell; st.cell = c; st.collapseNext = -1; }
      if (st.collapseNext < 0 || world.tile[st.collapseNext] === 2) {
        const passable = (i) => world.tile[i] === 0 || (world.tile[i] === 1 && world.timer[i] > 0.8);
        const nbs = maze.neighbors(c).filter((nb) => passable(nb.i));
        if (!nbs.length) st.collapseNext = -1;
        else if (level === 0) st.collapseNext = nbs[(r() * nbs.length) | 0].i;
        else {
          let best = null, bs = -1e9;
          for (const nb of nbs) {
            // 該方向能到達多少完好的磚（不經過目前所在格）
            const f = maze.bfs(nb.i, (j) => j === c || world.tile[j] !== 0);
            let reach = 0; for (let i = 0; i < f.length; i++) if (f[i] >= 0) reach++;
            let score = level === 1 ? (world.tile[nb.i] === 0 ? 5 : 0) + r() * 4 : reach + (world.tile[nb.i] === 0 ? 2 : 0) + r() * 0.5;
            if (level === 3) score += (nb.i === st.prev ? -3 : 0);
            if (score > bs) { bs = score; best = nb; }
          }
          st.collapseNext = best.i;
        }
      }
      if (st.collapseNext < 0) return [0, 0];
      const q = cellCenter(maze, st.collapseNext);
      return steerTo(player, q.x, q.y, true, L.cap, L);
    }

    return {
      level, st,
      /** 每個固定時間步呼叫一次，回傳 [ix, iy]。 */
      step(dt) {
        if (!player.alive || (world.mode === 'race' && player.fin != null)) return [0, 0];
        const t = world.t;
        if (L.idle > 0) {
          if (st.idle > 0) { st.idle -= dt; return [0, 0]; }
          st.idleCd -= dt; if (st.idleCd <= 0) { st.idleCd = 4 + r() * 5; st.idle = L.idle; }
        }
        let inp;
        if (world.mode === 'race') inp = moveAlong(raceField(), dt, t);
        else if (world.mode === 'stars') {
          st.thinkT -= dt;
          if (st.thinkT <= 0 || !st.target || !world.stars.some((s) => s.id === st.target.id)) {
            st.thinkT = L.think * (level === 0 ? 8 : 4);
            st.target = pickStar(t); st.cell = -1; st.commitLeft = 0;
          }
          inp = st.target ? moveAlong(fieldOf(st.target.c), dt, t) : [0, 0];
        } else inp = collapseMove(dt);
        if (L.jitter > 0) {
          const j = L.jitter;
          inp = [inp[0] + Math.sin(t * 2.1 + st.phase) * j, inp[1] + Math.cos(t * 1.7 + st.phase * 1.3) * j];
        }
        return inp;
      },
    };
  }
  return { makeAI, LEVELS };
});
