/* 迷宮滾球：電腦對手。五段難度（0 幼幼班／1 簡單／2 普通／3 困難／4 神話）。
   難度不只是名字：最高輸入（速度）、轉彎判斷失誤率、手抖、搶星星的選目標策略、崩塌時的求生策略都不同。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.MRAI = factory(root.MR);
})(typeof self !== 'undefined' ? self : this, function (MR) {
  'use strict';
  const { cellAt, cellCenter, rng, clamp } = MR;

  const LEVELS = [
    { cap: 0.55, mistake: 0.16, commit: [1, 3], jitter: 0.13, idle: 0.2, think: 0.4, corner: 1.25, response: 1.5, smoothness: 0 },
    { cap: 0.8, mistake: 0.055, commit: [1, 2], jitter: 0.07, idle: 0, think: 0.22, corner: 1.35, response: 1.7, smoothness: 0.2 },
    { cap: 0.96, mistake: 0.01, commit: [1, 2], jitter: 0.025, idle: 0, think: 0.1, corner: 1.5, response: 1.9, smoothness: 0.6 },
    { cap: 1, mistake: 0, commit: [0, 0], jitter: 0.008, idle: 0, think: 0.06, corner: 1.65, response: 2.1, smoothness: 1.2 },
    { cap: 1, mistake: 0, commit: [0, 0], jitter: 0, idle: 0, think: 0.03, corner: 1.85, response: 2.4, smoothness: 2 },
  ];

  /** 沿著距離場往下走，找出一段直線並回傳最遠的直線端點與是否為轉彎點。 */
  function straightRun(maze, field, from, preference, smoothness, heading) {
    let cur = from, dir = 0, count = 0;
    for (let guard = 0; guard < 8; guard++) {
      let best = null, bestScore = Infinity;
      for (const nb of maze.neighbors(cur)) {
        if (field[nb.i] < 0 || field[nb.i] >= field[cur]) continue;
        const preferredDir = count ? dir : heading;
        const score = preference[nb.i] + (preferredDir && nb.d !== preferredDir ? smoothness : 0);
        if (!best || field[nb.i] < field[best.i] || (field[nb.i] === field[best.i] && score < bestScore)) { best = nb; bestScore = score; }
      }
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
    const vAllowed = turn ? lvl.corner + dist * 2.0 : 6;
    const targetSpeed = Math.min(vAllowed, cap * MR.PHYS.ACC / MR.PHYS.FRI);
    const throttle = clamp(targetSpeed * MR.PHYS.FRI / MR.PHYS.ACC + (targetSpeed - va) * lvl.response, -1, 1);
    let ix = ux * throttle - px * 1.3, iy = uy * throttle - py * 1.3;
    const m = Math.hypot(ix, iy);
    if (m > cap) { ix = ix / m * cap; iy = iy / m * cap; }
    return [ix, iy];
  }

  function makeAI(world, player, level, seed) {
    level = clamp(level | 0, 0, LEVELS.length - 1);
    const r = rng(MR.hashSeed('ai', world.seed, player.id, seed || 0));
    const base = LEVELS[level];
    const profile = {
      pace: 0.9 + r() * 0.1, corner: 0.9 + r() * 0.2, focus: 0.75 + r() * 0.5,
      rhythm: 0.02 + r() * 0.06, competition: 0.7 + r() * 0.6,
    };
    const drivePace = Math.min(1, profile.pace + (level === 4 ? 0.05 : level === 3 ? 0.015 : 0));
    const L = {
      ...base, cap: base.cap * drivePace, corner: base.corner * profile.corner,
      mistake: base.mistake * profile.focus, think: base.think * profile.focus,
    };
    const maze = world.maze;
    const st = { cell: -1, commitLeft: 0, prev: -1, thinkT: 0, target: null, idle: 0.04 + r() * (0.25 + L.think), idleCd: 4 + r() * 4, phase: r() * 6.28, collapseNext: -1 };
    const preference = Float32Array.from({ length: maze.n }, () => r());
    const wrongTurns = new Set();
    const usedPortals = new Set();
    const portalCells = new Set(level === 4 && world.esc ? world.esc.portals.flatMap((p) => [p.a, p.b]) : []);
    const starFields = new Map();
    const fieldOf = (c) => {
      let f = starFields.get(c);
      if (!f) { f = maze.bfs(c, (i) => i !== c && portalCells.has(i)); starFields.set(c, f); }
      return f;
    };

    function raceField() { return portalCells.size ? fieldOf(maze.goal) : world.gd; }

    function distanceAt(field, c) {
      if (field[c] >= 0) return field[c];
      let distance = Infinity;
      for (const nb of maze.neighbors(c)) if (field[nb.i] >= 0) distance = Math.min(distance, field[nb.i] + 1);
      return distance;
    }

    function moveAlong(field, dt, t) {
      const c = cellAt(maze, player.x, player.y);
      if (c !== st.cell) {
        st.prev = st.cell; st.cell = c;
        if (st.commitLeft > 0) st.commitLeft--;
        else if (L.mistake > 0 && r() < L.mistake && field[c] > 2) {
          const opts = maze.neighbors(c).filter((nb) => nb.i !== st.prev && field[nb.i] >= field[c] && !wrongTurns.has(c + ':' + nb.i));
          if (opts.length) {
            st.wrongTo = opts[(r() * opts.length) | 0].i; wrongTurns.add(c + ':' + st.wrongTo);
            st.commitLeft = L.commit[0] + ((r() * (L.commit[1] - L.commit[0] + 1)) | 0);
          }
        }
      }
      let tx, ty, turn = true;
      if (field[c] < 0) { // 剛傳送到被規劃排除的出口，先離開光圈，避免意外再次傳送。
        let exit = null;
        for (const nb of maze.neighbors(c)) if (field[nb.i] >= 0 && (!exit || field[nb.i] < field[exit.i])) exit = nb;
        if (exit) { const q = cellCenter(maze, exit.i); tx = q.x; ty = q.y; }
      }
      if (st.commitLeft > 0 && st.wrongTo != null) {
        // 走錯路：沿著隨機岔路往前直到承諾結束
        const nbs = maze.neighbors(c).filter((nb) => nb.i !== st.prev);
        let pick = nbs.find((nb) => nb.i === st.wrongTo) || nbs[(r() * nbs.length) | 0] || maze.neighbors(c)[0];
        if (pick) { st.wrongTo = pick.i; const q = cellCenter(maze, pick.i); tx = q.x; ty = q.y; }
      }
      if (tx == null) {
        let heading = 0;
        if (Math.hypot(player.vx, player.vy) >= 0.4) heading = Math.abs(player.vx) > Math.abs(player.vy) ? (player.vx > 0 ? MR.E : MR.W) : (player.vy > 0 ? MR.S : MR.N);
        const run = straightRun(maze, field, c, preference, L.smoothness, heading);
        const q = cellCenter(maze, run.to); tx = q.x; ty = q.y; turn = run.turn || run.end;
      }
      const pace = L.cap * (1 - profile.rhythm * (0.5 + 0.5 * Math.sin(t * 0.7 + st.phase)));
      return steerTo(player, tx, ty, turn, pace, L);
    }

    function pickStar(t) {
      const cands = world.stars; if (!cands.length) return null;
      const me = cellAt(maze, player.x, player.y);
      if (level === 0) return cands[(r() * cands.length) | 0];
      let best = null, bs = 1e9;
      for (const s of cands) {
        const d = fieldOf(s.c)[me]; if (d < 0) continue;
        let score = d + preference[s.c] * profile.competition;
        if (level >= 3) { // 使用實際走廊距離判斷競爭，不把隔牆的對手誤當成比較近。
          for (const o of world.players) {
            if (o === player || !o.alive) continue;
            const od = fieldOf(s.c)[cellAt(maze, o.x, o.y)];
            if (od >= 0 && od < d * 0.8) score += 6 * profile.competition;
          }
        }
        if (level === 4 && cands.length > 1) {
          let next = Infinity;
          for (const other of cands) if (other !== s) next = Math.min(next, fieldOf(s.c)[other.c]);
          score += next * 0.3; // 神話：兼顧下一顆的位置，減少撿完再折返。
        }
        if (score < bs) { bs = score; best = s; }
      }
      return best;
    }

    /** 逃出模式：依序處理每一道還沒通過的門——鑰匙門先去拿鑰匙再去門前；踏板門先去踩踏板，門開著就衝過去。回傳目標格，沒有就往終點。 */
    function escapeTarget() {
      const c = cellAt(maze, player.x, player.y);
      for (const d of world.esc.doors) {
        if (d.farSide[c]) continue;
        if (player.open[d.j] > 0) return -1;
        if (d.kind === 'key') return player.keyHas[d.j] === 1 ? d.near : d.item;
        return d.item;
      }
      return -1;
    }

    function shortcutField(field) {
      if (level < 4) return field;
      if (player.warp >= 0) { usedPortals.add(player.warp >> 1); return field; }
      const c = cellAt(maze, player.x, player.y);
      let best = distanceAt(field, c), chosen = field;
      for (let i = 0; i < world.esc.portals.length; i++) {
        if (usedPortals.has(i)) continue;
        const portal = world.esc.portals[i];
        for (const [entry, exit] of [[portal.a, portal.b], [portal.b, portal.a]]) {
          if (world.esc.doors.some((d) => d.farSide[c] !== d.farSide[entry])) continue;
          const toEntry = fieldOf(entry), distance = toEntry[c];
          if (distance < 0) continue;
          const cost = distance + distanceAt(field, exit) + 2;
          if (cost < best) { best = cost; chosen = toEntry; }
        }
      }
      return chosen;
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
            if (level >= 3) score += (nb.i === st.prev ? -3 : 0);
            if (level === 4) score += maze.neighbors(nb.i).filter((next) => next.i !== c && passable(next.i)).length * 3;
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
      level, st, profile,
      /** 每個固定時間步呼叫一次，回傳 [ix, iy]。 */
      step(dt) {
        if (!player.alive || (world.run && player.fin != null)) return [0, 0];
        const t = world.t;
        if (st.idle > 0) { st.idle -= dt; return [0, 0]; }
        if (L.idle > 0) {
          st.idleCd -= dt; if (st.idleCd <= 0) { st.idleCd = 4 + r() * 5; st.idle = L.idle; }
        }
        let inp;
        if (world.mode === 'race') inp = moveAlong(raceField(), dt, t);
        else if (world.mode === 'escape') {
          const tg = escapeTarget();
          if (tg !== st.escTarget) { st.escTarget = tg; st.cell = -1; st.commitLeft = 0; }
          inp = moveAlong(shortcutField(tg < 0 ? raceField() : fieldOf(tg)), dt, t);
        }
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
        const magnitude = Math.hypot(...inp);
        return magnitude > 1 ? inp.map((v) => v / magnitude) : inp;
      },
    };
  }
  return { makeAI, LEVELS };
});
