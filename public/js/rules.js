/* 迷宮滾球：共用規則核心（瀏覽器與伺服器同一份）。
   純函式／純資料：迷宮生成、球物理、三種玩法（競速／搶星星／地板崩塌）的判定與排名。
   不碰 DOM、網路、音訊、儲存；隨機一律用可注入的 seed。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 常數 ----------
  const N = 1, E = 2, S = 4, W = 8;
  const DX = { 1: 0, 2: 1, 4: 0, 8: -1 }, DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
  const OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };
  const DIRS = [N, E, S, W];

  const MODES = ['race', 'stars', 'collapse'];
  const MODE_NAMES = { race: '同圖競速', stars: '搶星星', collapse: '地板崩塌' };
  const DIFFS = ['幼幼班', '簡單', '普通', '困難', '超難'];
  const AI_NAMES = ['幼幼班', '簡單', '普通', '困難'];
  const SIZE = { race: [6, 10, 15, 21, 28], stars: [8, 11, 15, 19, 23], collapse: [6, 8, 10, 13, 16] };
  const BRAID = { race: 0.05, stars: 0.5, collapse: 0.55 };
  const CRUMBLE = [3.2, 2.5, 2.0, 1.6, 1.2];
  const LEVEL_SIZE = [[5, 9], [8, 14], [11, 19], [15, 25], [19, 31]];
  const LEVELS_PER_DIFF = 100;

  const PHYS = { R: 0.2, T: 0.12, ACC: 9.5, FRI: 2.6, REST: 0.25 };
  const STAR_R = 0.42, GOAL_R = 0.38;
  const STAR_TIME = 90, GRACE = 15, RACE_CAP = 600, COLLAPSE_CAP = 240;
  const COLLAPSE_FALL = 0.22, COLLAPSE_SUDDEN = 60, COLLAPSE_HEAD = 1.2;
  const MAX_PLAYERS = 8;

  // ---------- 亂數 ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed() {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < arguments.length; i++) {
      const s = String(arguments[i]);
      for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
      h ^= 0x9e; h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------- 迷宮 ----------
  function makeMaze(w, h, seed, braid) {
    const r = rng(seed);
    const n = w * h;
    const cells = new Uint8Array(n).fill(15);
    const seen = new Uint8Array(n);
    const stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const i = stack[stack.length - 1];
      const x = i % w, y = (i / w) | 0;
      const opts = [];
      for (const d of DIRS) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!seen[ny * w + nx]) opts.push(d);
      }
      if (!opts.length) { stack.pop(); continue; }
      const d = opts[(r() * opts.length) | 0];
      const j = (y + DY[d]) * w + (x + DX[d]);
      cells[i] &= ~d; cells[j] &= ~OPP[d];
      seen[j] = 1; stack.push(j);
    }
    const open = (i, d) => !(cells[i] & d);
    const openWall = (i, d) => {
      const x = i % w, y = (i / w) | 0, nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      cells[i] &= ~d; cells[ny * w + nx] &= ~OPP[d];
    };
    // 編織：把死路打通，讓迷宮出現環與捷徑（braid 越高越多）
    if (braid > 0) {
      for (let i = 0; i < n; i++) {
        let c = 0; for (const d of DIRS) if (!open(i, d)) c++;
        if (c === 3 && r() < braid) {
          const x = i % w, y = (i / w) | 0;
          const cand = DIRS.filter((d) => { const nx = x + DX[d], ny = y + DY[d]; return nx >= 0 && ny >= 0 && nx < w && ny < h; });
          if (cand.length) openWall(i, cand[(r() * cand.length) | 0]);
        }
      }
    }
    const maze = {
      w, h, n, cells, seed, braid,
      open,
      neighbors(i) {
        const out = [], x = i % w, y = (i / w) | 0;
        for (const d of DIRS) if (open(i, d)) out.push({ d, i: (y + DY[d]) * w + (x + DX[d]) });
        return out;
      },
      bfs(from, blocked) {
        const dist = new Int16Array(n).fill(-1);
        const q = [from]; dist[from] = 0;
        for (let qi = 0; qi < q.length; qi++) {
          const i = q[qi], x = i % w, y = (i / w) | 0;
          for (const d of DIRS) {
            if (!open(i, d)) continue;
            const j = (y + DY[d]) * w + (x + DX[d]);
            if (dist[j] >= 0 || (blocked && blocked(j))) continue;
            dist[j] = dist[i] + 1; q.push(j);
          }
        }
        return dist;
      },
    };
    maze.start = 0;
    const d0 = maze.bfs(0);
    let far = 0; for (let i = 0; i < n; i++) if (d0[i] > d0[far]) far = i;
    maze.goal = far;
    maze.pathLen = d0[far];
    return maze;
  }
  const cellCenter = (maze, i) => ({ x: (i % maze.w) + 0.5, y: ((i / maze.w) | 0) + 0.5 });
  const cellAt = (maze, x, y) => clamp(Math.floor(y), 0, maze.h - 1) * maze.w + clamp(Math.floor(x), 0, maze.w - 1);

  // ---------- 球物理（固定時間步）----------
  function resolveRect(b, x0, y0, x1, y1) {
    const px = clamp(b.x, x0, x1), py = clamp(b.y, y0, y1);
    let dx = b.x - px, dy = b.y - py;
    const d2 = dx * dx + dy * dy, R = PHYS.R;
    if (d2 >= R * R) return 0;
    let nx, ny, pen;
    if (d2 < 1e-12) { // 球心在牆內：沿最小穿透軸推出
      const l = b.x - x0, r = x1 - b.x, t = b.y - y0, bt = y1 - b.y;
      const m = Math.min(l, r, t, bt);
      if (m === l) { nx = -1; ny = 0; pen = l + R; }
      else if (m === r) { nx = 1; ny = 0; pen = r + R; }
      else if (m === t) { nx = 0; ny = -1; pen = t + R; }
      else { nx = 0; ny = 1; pen = bt + R; }
    } else { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = R - d; }
    b.x += nx * pen; b.y += ny * pen;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + PHYS.REST) * vn * nx; b.vy -= (1 + PHYS.REST) * vn * ny; return -vn; }
    return 0;
  }
  function collide(m, b) {
    const cx = Math.floor(b.x), cy = Math.floor(b.y), h = PHYS.T / 2;
    let impact = 0;
    for (let yy = cy - 1; yy <= cy + 1; yy++) {
      if (yy < 0 || yy >= m.h) continue;
      for (let xx = cx - 1; xx <= cx + 1; xx++) {
        if (xx < 0 || xx >= m.w) continue;
        const c = m.cells[yy * m.w + xx];
        if (c & N) impact = Math.max(impact, resolveRect(b, xx - h, yy - h, xx + 1 + h, yy + h));
        if (c & W) impact = Math.max(impact, resolveRect(b, xx - h, yy - h, xx + h, yy + 1 + h));
        if (xx === m.w - 1 && (c & E)) impact = Math.max(impact, resolveRect(b, xx + 1 - h, yy - h, xx + 1 + h, yy + 1 + h));
        if (yy === m.h - 1 && (c & S)) impact = Math.max(impact, resolveRect(b, xx - h, yy + 1 - h, xx + 1 + h, yy + 1 + h));
      }
    }
    return impact;
  }
  /** 推進一顆球；ix, iy 為 -1..1 的傾斜輸入；回傳撞牆速度（供音效）。 */
  function stepBall(m, b, ix, iy, dt) {
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    const sub = 2, h = dt / sub, f = Math.exp(-PHYS.FRI * h);
    let impact = 0;
    for (let k = 0; k < sub; k++) {
      b.vx = (b.vx + ix * PHYS.ACC * h) * f;
      b.vy = (b.vy + iy * PHYS.ACC * h) * f;
      b.x += b.vx * h; b.y += b.vy * h;
      impact = Math.max(impact, collide(m, b));
    }
    return impact;
  }

  // ---------- 關卡 ----------
  function levelSize(diff, n) {
    const [a, b] = LEVEL_SIZE[diff];
    return Math.round(a + (b - a) * ((clamp(n, 1, LEVELS_PER_DIFF) - 1) / (LEVELS_PER_DIFF - 1)));
  }
  function levelSeed(diff, n) { return hashSeed('maze-roll', 'level', diff, n); }
  /** 闖關評星：以最短路徑長度推算基準時間。 */
  function levelPar(maze) { return maze.pathLen / 2.1 + 2; }
  function levelStars(time, maze) {
    const par = levelPar(maze);
    return time <= par * 1.35 ? 3 : time <= par * 2.2 ? 2 : 1;
  }

  // ---------- 世界（三種玩法共用）----------
  class World {
    /** o: {mode, diff, seed, size?, level?, grace?, players:[{id,name,kind,ai?}]} */
    constructor(o) {
      this.mode = o.mode; this.diff = o.diff | 0; this.seed = o.seed >>> 0;
      this.size = o.size || SIZE[this.mode][this.diff];
      this.maze = makeMaze(this.size, this.size, this.seed, o.braid != null ? o.braid : BRAID[this.mode]);
      this.rand = rng(this.seed ^ 0x9e3779b9);
      this.t = 0; this.started = false; this.over = false; this.results = null;
      this.events = []; this.finished = 0; this.graceLeft = null; this.grace = o.grace != null ? o.grace : GRACE;
      const m = this.maze;
      this.players = o.players.map((p, i) => ({
        id: p.id, name: p.name, kind: p.kind || 'human', ai: p.ai, idx: i,
        x: 0.5, y: 0.5, vx: 0, vy: 0, alive: true, score: 0, fin: null, out: null, last: 0, over: 0, place: 0,
      }));
      this.byId = new Map(this.players.map((p) => [p.id, p]));
      if (this.mode === 'race') {
        const c = cellCenter(m, m.start), k = this.players.length;
        this.players.forEach((p, i) => { const a = (i / k) * Math.PI * 2; p.x = c.x + (k > 1 ? Math.cos(a) * 0.16 : 0); p.y = c.y + (k > 1 ? Math.sin(a) * 0.16 : 0); });
        this._gd = null;
      } else {
        const spots = this._spread(this.players.length);
        this.players.forEach((p, i) => { const c = cellCenter(m, spots[i]); p.x = c.x; p.y = c.y; p.spawn = spots[i]; });
        if (this.mode === 'stars') {
          this.stars = []; this.nextStar = 1;
          const cnt = Math.max(3, Math.round(m.n / 22));
          const taken = new Set(spots);
          for (let k = 0; k < cnt; k++) this._spawnStar(taken, null, false);
        } else {
          this.tile = new Uint8Array(m.n); this.timer = new Float32Array(m.n); this.sd = 0;
          this.crumble = CRUMBLE[this.diff];
        }
      }
    }
    _spread(k) {
      const m = this.maze, r = rng(this.seed ^ 0x51ed), chosen = [(r() * m.n) | 0];
      while (chosen.length < k) {
        let best = -1, bd = -1;
        for (let i = 0; i < m.n; i++) {
          if (chosen.includes(i)) continue;
          const c = cellCenter(m, i); let md = 1e9;
          for (const j of chosen) { const o = cellCenter(m, j); md = Math.min(md, Math.hypot(c.x - o.x, c.y - o.y)); }
          md += r() * 0.01;
          if (md > bd) { bd = md; best = i; }
        }
        chosen.push(best);
      }
      return chosen;
    }
    _spawnStar(taken, away, emit) {
      const m = this.maze;
      const occupied = new Set(this.stars.map((s) => s.c));
      let c = -1;
      for (let tries = 0; tries < 60; tries++) {
        const i = (this.rand() * m.n) | 0;
        if (occupied.has(i) || (taken && taken.has(i))) continue;
        if (away) { const q = cellCenter(m, i); if (Math.hypot(q.x - away.x, q.y - away.y) < 2.5) continue; }
        c = i; break;
      }
      if (c < 0) { for (let i = 0; i < m.n; i++) if (!occupied.has(i)) { c = i; break; } }
      const star = { id: this.nextStar++, c };
      this.stars.push(star);
      return star;
    }
    get gd() { if (!this._gd) this._gd = this.maze.bfs(this.maze.goal); return this._gd; }
    start() { this.started = true; }
    emit(e) { this.events.push(e); return e; }
    humans() { return this.players.filter((p) => p.kind !== 'ai'); }

    /** 判定一個固定時間步（球的位置已由外部更新）。回傳本步事件。 */
    update(dt) {
      if (this.over || !this.started) return [];
      const ev0 = this.events.length;
      this.t += dt;
      if (this.mode === 'race') this._race(dt);
      else if (this.mode === 'stars') this._stars();
      else this._collapse(dt);
      return this.events.slice(ev0);
    }
    _race(dt) {
      const m = this.maze, g = cellCenter(m, m.goal);
      for (const p of this.players) {
        if (p.fin != null) continue;
        if (Math.hypot(p.x - g.x, p.y - g.y) < GOAL_R) {
          p.fin = this.t; this.finished++; p.place = this.finished;
          this.emit({ e: 'finish', id: p.id, t: +p.fin.toFixed(3), place: p.place });
          if (this.graceLeft == null && this.players.length > 1) this.graceLeft = this.grace;
        }
      }
      if (this.graceLeft != null) this.graceLeft -= dt;
      const hs = this.humans();
      const allHumans = hs.length > 0 && hs.every((p) => p.fin != null);
      if (allHumans || this.finished === this.players.length || (this.graceLeft != null && this.graceLeft <= 0) || this.t >= RACE_CAP) this._finish();
    }
    _stars() {
      const m = this.maze;
      for (const p of this.players) {
        for (let k = this.stars.length - 1; k >= 0; k--) {
          const s = this.stars[k], c = cellCenter(m, s.c);
          if (Math.hypot(p.x - c.x, p.y - c.y) < STAR_R) {
            this.stars.splice(k, 1); p.score++; p.last = this.t;
            const ns = this._spawnStar(null, c, true);
            this.emit({ e: 'star', id: p.id, sid: s.id, score: p.score, nid: ns.id, nc: ns.c });
          }
        }
      }
      if (this.t >= STAR_TIME) this._finish();
    }
    _collapse(dt) {
      const m = this.maze;
      if (this.t > COLLAPSE_HEAD) { // 開局前 1.2 秒大家腳下的磚先穩住
        for (const p of this.players) {
          if (!p.alive) continue;
          const i = cellAt(m, p.x, p.y);
          if (this.tile[i] === 0) { this.tile[i] = 1; this.timer[i] = this.crumble; this.emit({ e: 'tile', c: i, s: 1 }); }
        }
      }
      for (let i = 0; i < m.n; i++) {
        if (this.tile[i] === 1) {
          this.timer[i] -= dt;
          if (this.timer[i] <= 0) { this.tile[i] = 2; this.emit({ e: 'tile', c: i, s: 2 }); }
        }
      }
      for (const p of this.players) {
        if (!p.alive) continue;
        const i = cellAt(m, p.x, p.y);
        if (this.tile[i] === 2) {
          p.over += dt;
          if (p.over >= COLLAPSE_FALL) { p.alive = false; p.out = this.t; this.emit({ e: 'out', id: p.id, t: +this.t.toFixed(3) }); }
        } else p.over = 0;
      }
      if (this.t > COLLAPSE_SUDDEN) { // 猝死：定時隨機碎一塊，逼出勝負
        this.sd += dt;
        while (this.sd >= 0.7) {
          this.sd -= 0.7;
          const intact = []; for (let i = 0; i < m.n; i++) if (this.tile[i] === 0) intact.push(i);
          if (!intact.length) break;
          const i = intact[(this.rand() * intact.length) | 0];
          this.tile[i] = 1; this.timer[i] = this.crumble; this.emit({ e: 'tile', c: i, s: 1 });
        }
      }
      const alive = this.players.filter((p) => p.alive).length;
      const solo = this.players.length === 1;
      if ((solo && alive === 0) || (!solo && alive <= 1) || this.t >= COLLAPSE_CAP) this._finish();
    }
    _finish() {
      if (this.over) return;
      this.over = true; this.results = this.rank();
      this.emit({ e: 'end', results: this.results });
    }
    /** 排名：回傳 [{id, place, ...}]（同成績同名次）。 */
    rank() {
      const ps = this.players.slice();
      let key; // 越小越前
      if (this.mode === 'race') {
        key = (p) => (p.fin != null ? [0, p.fin] : [1, this.gd[cellAt(this.maze, p.x, p.y)] + 0.01 * Math.hypot(p.x - cellCenter(this.maze, this.maze.goal).x, p.y - cellCenter(this.maze, this.maze.goal).y)]);
      } else if (this.mode === 'stars') {
        key = (p) => [-p.score, p.last];
      } else {
        key = (p) => [p.alive ? 0 : 1, p.alive ? 0 : -p.out];
      }
      ps.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
      const out = []; let place = 0, prev = null;
      ps.forEach((p, i) => {
        const k = key(p), same = prev && Math.abs(k[0] - prev[0]) < 1e-9 && (this.mode === 'race' && p.fin == null ? false : Math.abs(k[1] - prev[1]) < 1e-9);
        if (!same) place = i + 1; prev = k;
        const r = { id: p.id, place };
        if (this.mode === 'race') { if (p.fin != null) r.time = +p.fin.toFixed(2); else r.dnf = true; }
        else if (this.mode === 'stars') r.score = p.score;
        else { r.alive = p.alive; r.time = +(p.alive ? this.t : p.out).toFixed(1); }
        out.push(r);
      });
      return out;
    }
    /** 客戶端（線上）套用伺服器事件，保持與權威世界一致。 */
    applyEvent(e) {
      if (e.e === 'star') {
        const p = this.byId.get(e.id); if (p) { p.score = e.score; }
        const k = this.stars.findIndex((s) => s.id === e.sid); if (k >= 0) this.stars.splice(k, 1);
        if (e.nid != null) this.stars.push({ id: e.nid, c: e.nc });
      } else if (e.e === 'finish') {
        const p = this.byId.get(e.id); if (p) { p.fin = e.t; p.place = e.place; }
      } else if (e.e === 'tile') { this.tile[e.c] = e.s; if (e.s === 1) this.timer[e.c] = this.crumble; }
      else if (e.e === 'out') { const p = this.byId.get(e.id); if (p) { p.alive = false; p.out = e.t; } }
      else if (e.e === 'end') { this.over = true; this.results = e.results; }
    }
  }

  return {
    N, E, S, W, DX, DY, OPP, DIRS, MODES, MODE_NAMES, DIFFS, AI_NAMES, SIZE, BRAID, CRUMBLE, LEVELS_PER_DIFF, PHYS,
    STAR_R, GOAL_R, STAR_TIME, GRACE, MAX_PLAYERS, COLLAPSE_SUDDEN, COLLAPSE_HEAD,
    rng, hashSeed, clamp, makeMaze, cellCenter, cellAt, stepBall, levelSize, levelSeed, levelPar, levelStars, World,
  };
});
