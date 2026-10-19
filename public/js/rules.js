/* 迷宮滾球：共用規則核心（瀏覽器與伺服器同一份）。
   純函式／純資料：迷宮生成、球物理、四種玩法（競速／搶星星／地板崩塌／逃出）的判定與排名。
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

  const MODES = ['race', 'stars', 'collapse', 'escape'];
  const MODE_NAMES = { race: '同圖競速', stars: '搶星星', collapse: '地板崩塌', escape: '逃出模式' };
  /** 競速與逃出共用「先抵達終點者勝」的流程。 */
  const isRun = (mode) => mode === 'race' || mode === 'escape';
  const DIFFS = ['幼幼班', '簡單', '普通', '困難', '神話'];
  /** 五種難度的木質主題：地板／牆的木色與紋路色、桌面、背景、介面強調色。 */
  const DIFF_THEME = [
    { wood: '淺楓木', floor: '#f0d6a6', floorLine: 'rgba(130,80,30,A)', wall: '#d79f62', wallLine: 'rgba(90,48,16,A)', table: '#7a5436', bg: 0x6b4a2c, accent: '#e8a24a', trim: null },
    { wood: '櫻桃木', floor: '#e9b98e', floorLine: 'rgba(130,60,30,A)', wall: '#b4532f', wallLine: 'rgba(60,20,8,A)', table: '#5c3322', bg: 0x522a1b, accent: '#d9644a', trim: null },
    { wood: '胡桃木', floor: '#e2b97c', floorLine: 'rgba(110,60,20,A)', wall: '#8a5330', wallLine: 'rgba(40,18,6,A)', table: '#5a3722', bg: 0x4a2c1a, accent: '#c0862e', trim: null },
    { wood: '黑檀木', floor: '#b08e68', floorLine: 'rgba(60,34,16,A)', wall: '#3d2619', wallLine: 'rgba(10,4,2,A)', table: '#2b1d15', bg: 0x2e1d12, accent: '#6f93ad', trim: null },
    { wood: '烏木金邊', floor: '#8a7456', floorLine: 'rgba(40,26,12,A)', wall: '#241914', wallLine: 'rgba(0,0,0,A)', table: '#1c1410', bg: 0x1b120c, accent: '#e0b23c', trim: 0xe0b23c },
  ];
  /** 競速迷宮的「環路」比例：越難越少（死路越多、越像真迷宮）。 */
  const RACE_BRAID = [0.5, 0.3, 0.15, 0, 0];
  const JUNCTION_DENSITY = [0, 0, 0, 0.16, 0.24];
  const braidFor = (mode, diff) => (mode === 'race' ? RACE_BRAID[diff | 0] : BRAID[mode]);
  const AI_NAMES = ['幼幼班', '簡單', '普通', '困難', '神話'];
  const SIZE = { race: [6, 10, 15, 21, 28], stars: [8, 11, 15, 19, 23], collapse: [8, 10, 12, 15, 18], escape: [6, 9, 12, 16, 20] };
  const BRAID = { race: 0.05, stars: 0.5, collapse: 0.55, escape: 0 }; // 逃出：完美迷宮（無環），每道門才一定擋得住路
  /** 逃出模式：各難度的門數、機關計時倍率（越難越短）、門的顏色。 */
  const ESCAPE_GATES = [2, 2, 3, 4, 5];
  const ESCAPE_TIME = [1.4, 1.25, 1.1, 1, 0.9];
  const DOOR_COLORS = ['#22b8c7', '#3d7bd9', '#4cbf5a', '#f2d230', '#c45ad6']; // 避開紅／橘／褐（跟木牆太像）
  const KEY_R = 0.5, PLATE_R = 0.42, UNLOCK_R = 0.85, FOREVER = 1e9;
  /** 傳送門：各難度的成對數、顏色與觸發／離開半徑。 */
  const PORTAL_PAIRS = [1, 1, 2, 2, 3];
  const PORTAL_COLORS = ['#ff5fa2', '#9aff5f', '#5fd0ff'];
  const PORTAL_R = 0.42, PORTAL_LEAVE = 0.7;
  const CRUMBLE = [3.2, 2.5, 2.0, 1.6, 1.2];
  const LEVEL_SIZE = [[5, 9], [8, 14], [11, 19], [15, 25], [19, 31]];
  const ESCAPE_LEVEL_SIZE = [[6, 8], [8, 11], [10, 14], [13, 18], [16, 22]]; // 逃出要繞路拿鑰匙，迷宮比競速小
  const LEVELS_PER_DIFF = 100;

  const PHYS = { R: 0.36, T: 0.12, ACC: 9.5, FRI: 2.6, REST: 0.25 };
  const STAR_R = 0.55, GOAL_R = 0.5;
  const STAR_TIME = 90, GRACE = 10, ESCAPE_GRACE = 10, RACE_CAP = 600, ESCAPE_CAP = 900, COLLAPSE_CAP = 240;
  const COLLAPSE_FALL = 0.22, COLLAPSE_SUDDEN = 60, COLLAPSE_HEAD = 1.2;
  const MAX_PLAYERS = 8;

  /** 崩塌地圖隨參賽人數擴大，讓多人有更多空間周旋。 */
  function sizeFor(mode, diff, playerCount) {
    const level = clamp(diff | 0, 0, SIZE[mode].length - 1);
    const base = SIZE[mode][level];
    if (mode !== 'collapse') return base;
    const players = clamp(playerCount | 0, 1, MAX_PLAYERS);
    return base + (players - 1) * 2;
  }

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
  function makeMaze(w, h, seed, braid, branching = 0) {
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
    const maze = {
      w, h, n, cells, seed, braid, branching,
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
    if (branching > 0) addJunctions(maze, r, branching);
    // 編織只在調整樹狀支線後進行；逃出不編織，門仍位於必經的唯一通路。
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
    maze.start = 0;
    const d0 = maze.bfs(0);
    let far = 0; for (let i = 0; i < n; i++) if (d0[i] > d0[far]) far = i;
    maze.goal = far;
    maze.pathLen = d0[far];
    return maze;
  }

  /** 重接主路旁的子樹，增加三／四向岔路；不刪主路、不增環路，也不縮短既有解路。 */
  function addJunctions(maze, random, density) {
    const { w, h, n, cells } = maze, parent = new Int16Array(n).fill(-1), depth = new Int16Array(n);
    const queue = [0]; parent[0] = 0;
    let goal = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      for (const nb of maze.neighbors(c)) if (parent[nb.i] < 0) {
        parent[nb.i] = c; depth[nb.i] = depth[c] + 1; queue.push(nb.i);
        if (depth[nb.i] > depth[goal]) goal = nb.i;
      }
    }
    const main = new Uint8Array(n); main[0] = 1;
    for (let c = goal; c !== 0; c = parent[c]) main[c] = 1;
    const ancestor = (root, c) => { for (; c !== 0; c = parent[c]) if (c === root) return true; return false; };
    const deepBranch = (root) => maze.neighbors(root).some((nb) => parent[nb.i] === root);
    const target = Math.round(n * density);
    let changes = 0;
    for (let pass = 0; pass < 3 && changes < target; pass++) {
      const candidates = Array.from({ length: n }, (_, c) => ({ c, score: main[c] * 4 + (maze.neighbors(c).length === 3 ? 2 : 0) + random() }));
      candidates.sort((a, b) => b.score - a.score);
      for (const { c } of candidates) {
        const degree = maze.neighbors(c).length;
        if (degree < 2 || degree >= 4) continue;
        const x = c % w, y = (c / w) | 0;
        for (const d of DIRS) {
          if (!(cells[c] & d)) continue;
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const b = ny * w + nx, old = parent[b];
          if (main[b] || main[old] || maze.neighbors(old).length !== 2 || !deepBranch(b) || (!main[c] && ancestor(b, c))) continue;
          const cut = old === b - w ? N : old === b + w ? S : old === b - 1 ? W : E;
          cells[b] |= cut; cells[old] |= OPP[cut];
          cells[c] &= ~d; cells[b] &= ~OPP[d]; parent[b] = c;
          changes++;
          if (changes >= target) return;
          break;
        }
      }
    }
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
  function collide(m, b, extra) {
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
    if (extra) for (let k = 0; k < extra.length; k++) { const r = extra[k]; impact = Math.max(impact, resolveRect(b, r[0], r[1], r[2], r[3])); }
    return impact;
  }
  /** 推進一顆球；ix, iy 為 -1..1 的傾斜輸入；extra 為額外的矩形障礙（關著的門）；回傳撞牆速度（供音效）。 */
  function stepBall(m, b, ix, iy, dt, extra) {
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    const sub = 2, h = dt / sub, f = Math.exp(-PHYS.FRI * h);
    let impact = 0;
    for (let k = 0; k < sub; k++) {
      b.vx = (b.vx + ix * PHYS.ACC * h) * f;
      b.vy = (b.vy + iy * PHYS.ACC * h) * f;
      b.x += b.vx * h; b.y += b.vy * h;
      impact = Math.max(impact, collide(m, b, extra));
    }
    return impact;
  }

  // ---------- 關卡 ----------
  function levelSize(diff, n, mode) {
    const [a, b] = (mode === 'escape' ? ESCAPE_LEVEL_SIZE : LEVEL_SIZE)[diff];
    return Math.round(a + (b - a) * ((clamp(n, 1, LEVELS_PER_DIFF) - 1) / (LEVELS_PER_DIFF - 1)));
  }
  /** 每日挑戰：同一天、同玩法與難度共用一張迷宮，保留既有逃出地圖。 */
  function dailySeed(date, diff, mode) { return mode === 'race' ? hashSeed('maze-roll', 'daily', date, diff, 'race') : hashSeed('maze-roll', 'daily', date, diff); }
  function levelSeed(diff, n, mode) { return mode === 'escape' ? hashSeed('maze-roll', 'level', diff, n, 'escape') : hashSeed('maze-roll', 'level', diff, n); }
  /** 闖關評星：以最短路徑長度推算基準時間；逃出模式再加上繞去拿鑰匙／踏板的來回路程與每道門的操作時間。 */
  function levelPar(maze, esc) {
    let len = maze.pathLen, extra = 0;
    if (esc) { for (const d of esc.doors) len += 2 * d.detour; extra = 1.5 * esc.doors.length; }
    return len / 2.1 + 2 + extra;
  }
  function levelStars(time, maze, esc) {
    const par = levelPar(maze, esc);
    return time <= par * 1.35 ? 3 : time <= par * 2.2 ? 2 : 1;
  }


  // ---------- 逃出模式：門、鑰匙、踏板 ----------
  /** 由迷宮與難度決定性地產生機關配置（客戶端與伺服器各算一份，結果一致）。
      迷宮是完美迷宮（無環），所以起點到終點只有一條路；沿這條路依序放 N 道門，
      每道門的鑰匙／踏板放在「該門之前、上一道門之後」的區域，保證有解且需要繞路。 */
  function buildEscape(maze, diff, seed) {
    const r = rng(seed ^ 0x3c6ef372), n = maze.n, w = maze.w;
    const gd = maze.bfs(maze.goal), path = [maze.start];
    while (path[path.length - 1] !== maze.goal) {
      const cur = path[path.length - 1];
      path.push(maze.neighbors(cur).find((nb) => gd[nb.i] === gd[cur] - 1).i);
    }
    const L = path.length - 1, df = clamp(diff | 0, 0, 4);
    const G = Math.max(1, Math.min(ESCAPE_GATES[df], Math.floor(L / 4)));
    const dirTo = (a, b) => { for (const nb of maze.neighbors(a)) if (nb.i === b) return nb.d; return 0; };
    const sideOf = (from, na, nb) => { // 不跨過邊 (na,nb) 能走到的格子
      const mark = new Uint8Array(n), q = [from]; mark[from] = 1;
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi];
        for (const x of maze.neighbors(i)) { if ((i === na && x.i === nb) || (i === nb && x.i === na) || mark[x.i]) continue; mark[x.i] = 1; q.push(x.i); }
      }
      return mark;
    };
    const depth = new Int16Array(n).fill(-1), dq = path.slice(); // 離主路（起點到終點的唯一路徑）的距離
    dq.forEach((i) => { depth[i] = 0; });
    for (let qi = 0; qi < dq.length; qi++) for (const x of maze.neighbors(dq[qi])) if (depth[x.i] < 0) { depth[x.i] = depth[dq[qi]] + 1; dq.push(x.i); }
    const doors = [], used = new Set([maze.start, maze.goal]);
    let prevFar = null;
    for (let j = 0; j < G; j++) {
      const idx = clamp(Math.round(L * (j + 1) / (G + 1)), 2 + 2 * j, L - 1 - 2 * (G - 1 - j));
      const near = path[idx], far = path[idx + 1], d = dirTo(near, far), h = PHYS.T / 2;
      const x = near % w, y = (near / w) | 0;
      const rect = d === N ? [x - h, y - h, x + 1 + h, y + h] : d === S ? [x - h, y + 1 - h, x + 1 + h, y + 1 + h] : d === W ? [x - h, y - h, x + h, y + 1 + h] : [x + 1 - h, y - h, x + 1 + h, y + 1 + h];
      const cx = d === E ? x + 1 : d === W ? x : x + 0.5, cy = d === S ? y + 1 : d === N ? y : y + 0.5;
      const farSide = sideOf(far, near, far); // 門之後的區域（含終點）
      const entry = j === 0 ? maze.start : path[doors[j - 1].idx + 1];
      const dist = maze.bfs(entry), cand = [];
      for (let i = 0; i < n; i++) {
        if (farSide[i] || used.has(i) || i === near || (prevFar && !prevFar[i])) continue;
        cand.push(i);
      }
      cand.sort((a, b) => depth[b] - depth[a] || dist[b] - dist[a] || a - b); // 優先放在離主路最深的支線盡頭（要繞路）
      const item = cand.length ? cand[Math.min(cand.length - 1, (r() * Math.min(3, cand.length)) | 0)] : near;
      used.add(item);
      const kind = j % 2 === 0 ? 'key' : 'plate';
      const di = maze.bfs(near)[item];
      doors.push({ j, idx, kind, near, far, d, rect, cx, cy, item, detour: Math.max(0, depth[item]), color: DOOR_COLORS[j % DOOR_COLORS.length], farSide,
        T: kind === 'plate' ? Math.ceil(Math.max(7, (di / 1.6 + 4) * ESCAPE_TIME[df]) / 5) * 5 : 0 }); // 踏板門開啟秒數：以 5 秒為單位無條件進位
      prevFar = farSide;
    }
    // 傳送門：成對、雙向，放在主路旁 1～2 格的岔路上（自願走進去的捷徑，不會擋住必經之路）。
    // 兩端必須在同一段（同樣的門之間），所以傳送不可能繞過任何一道門；通往鑰匙／踏板的支線上不放，保證仍然有解。
    const pathIdx = new Map(path.map((c, i) => [c, i])), blocked = new Set();
    const parent = (c) => maze.neighbors(c).find((x) => depth[x.i] === depth[c] - 1).i;
    for (const d of doors) { let c = d.item; blocked.add(c); while (depth[c] > 0) { c = parent(c); blocked.add(c); } }
    const attach = (c) => { while (depth[c] > 0) c = parent(c); return pathIdx.get(c); };
    const seg = (c) => { let k = 0; for (const d of doors) if (d.farSide[c]) k++; return k; };
    let cands = [];
    for (let i = 0; i < n; i++) if (depth[i] >= 1 && depth[i] <= 2 && !blocked.has(i) && !used.has(i)) cands.push({ c: i, seg: seg(i), at: attach(i), x: i % w, y: (i / w) | 0 });
    const portals = [];
    for (let k = 0; k < PORTAL_PAIRS[df]; k++) {
      const pairs = [];
      for (let a = 0; a < cands.length; a++) for (let b = a + 1; b < cands.length; b++) {
        const A = cands[a], B = cands[b], gap = Math.abs(A.at - B.at);
        if (A.seg === B.seg && gap >= (df === 0 ? 3 : 6) && Math.hypot(A.x - B.x, A.y - B.y) >= (df === 0 ? 2.5 : 4)) pairs.push({ a: A.c, b: B.c, gap });
      }
      if (!pairs.length) break;
      pairs.sort((p, q) => q.gap - p.gap || p.a - q.a || p.b - q.b);
      const pick = pairs[Math.min(pairs.length - 1, (r() * Math.min(5, pairs.length)) | 0)];
      portals.push({ a: pick.a, b: pick.b, color: PORTAL_COLORS[k % PORTAL_COLORS.length] });
      cands = cands.filter((q) => q.c !== pick.a && q.c !== pick.b);
    }
    return { doors, portals };
  }

  // ---------- 世界（四種玩法共用）----------
  class World {
    /** o: {mode, diff, seed, size?, level?, grace?, players:[{id,name,kind,ai?}]} */
    constructor(o) {
      this.mode = o.mode; this.diff = o.diff | 0; this.seed = o.seed >>> 0;
      this.size = o.size || sizeFor(this.mode, this.diff, o.players.length);
      this.maze = makeMaze(this.size, this.size, this.seed, o.braid != null ? o.braid : braidFor(this.mode, this.diff), JUNCTION_DENSITY[this.diff]);
      this.rand = rng(this.seed ^ 0x9e3779b9);
      this.t = 0; this.started = false; this.over = false; this.results = null;
      this.events = []; this.finished = 0; this.graceLeft = null; this.grace = o.grace != null ? o.grace : (o.mode === 'escape' ? ESCAPE_GRACE : GRACE);
      this.run = isRun(this.mode);
      const m = this.maze;
      this.players = o.players.map((p, i) => ({
        id: p.id, name: p.name, kind: p.kind || 'human', ai: p.ai, idx: i,
        x: 0.5, y: 0.5, vx: 0, vy: 0, alive: true, score: 0, fin: null, out: null, last: 0, over: 0, place: 0,
      }));
      if (this.mode === 'escape') {
        this.esc = buildEscape(m, this.diff, this.seed);
        const G = this.esc.doors.length;
        for (const p of this.players) { p.keyHas = new Uint8Array(G); p.open = new Float32Array(G); p.warp = -1; } // keyHas: 0 沒拿／1 持有／2 已用；open: 門開著的剩餘秒數（FOREVER＝永久）
      }
      this.byId = new Map(this.players.map((p) => [p.id, p]));
      if (this.run) {
        const c = cellCenter(m, m.start), k = this.players.length;
        this.players.forEach((p, i) => { const a = (i / k) * Math.PI * 2; p.x = c.x + (k > 1 ? Math.cos(a) * 0.16 : 0); p.y = c.y + (k > 1 ? Math.sin(a) * 0.16 : 0); });
        this._gd = null;
      } else {
        const spots = this._spread(this.players.length);
        this.players.forEach((p, i) => { const c = cellCenter(m, spots[i]); p.x = c.x; p.y = c.y; p.spawn = spots[i]; });
        if (this.mode === 'stars') {
          this.stars = []; this.nextStar = 1;
          const cnt = Math.max(5, Math.round(m.n / 12)); // 星星不再補生，數量要夠一局搶
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
    /** 回到起點（競速：起跑點；搶星星／崩塌：自己的出生格，崩塌時改選最近的完好地磚）。成功回傳新位置，否則 null。 */
    respawn(id) {
      const p = this.byId.get(id), m = this.maze;
      if (!p || !p.alive || this.over || !this.started) return null;
      if (this.run && p.fin != null) return null;
      let c;
      if (this.run) {
        const o = cellCenter(m, m.start), k = this.players.length, a = (p.idx / k) * Math.PI * 2;
        c = { x: o.x + (k > 1 ? Math.cos(a) * 0.16 : 0), y: o.y + (k > 1 ? Math.sin(a) * 0.16 : 0) };
      } else if (this.mode === 'collapse') {
        const sp = cellCenter(m, p.spawn); let best = -1, bd = 1e9;
        for (let i = 0; i < m.n; i++) { if (this.tile[i] !== 0) continue; const q = cellCenter(m, i), d = Math.hypot(q.x - sp.x, q.y - sp.y); if (d < bd) { bd = d; best = i; } }
        if (best < 0) return null; c = cellCenter(m, best);
      } else c = cellCenter(m, p.spawn);
      p.x = c.x; p.y = c.y; p.vx = 0; p.vy = 0; p.over = 0;
      const ev = { e: 'respawn', id, x: +c.x.toFixed(3), y: +c.y.toFixed(3) }; this.emit(ev);
      return ev;
    }
    get gd() { if (!this._gd) this._gd = this.maze.bfs(this.maze.goal); return this._gd; }
    start() { this.started = true; }
    emit(e) { this.events.push(e); return e; }
    humans() { return this.players.filter((p) => p.kind !== 'ai'); }

    /** 判定一個固定時間步；graceDt 可另傳實際經過時間，避免掉幀延長結束倒數。回傳本步事件。 */
    update(dt, graceDt = dt) {
      if (this.over || !this.started) return [];
      const ev0 = this.events.length;
      this.t += dt;
      if (this.mode === 'escape') { this.doorTick(dt); this._escape(); this._race(graceDt); }
      else if (this.mode === 'race') this._race(graceDt);
      else if (this.mode === 'stars') this._stars();
      else this._collapse(dt);
      return this.events.slice(ev0);
    }
    _race(dt) {
      const m = this.maze, g = cellCenter(m, m.goal);
      const counting = this.graceLeft != null;
      for (const p of this.players) {
        if (p.fin != null) continue;
        if (Math.hypot(p.x - g.x, p.y - g.y) < GOAL_R) {
          p.fin = this.t; this.finished++; p.place = this.finished;
          this.emit({ e: 'finish', id: p.id, t: +p.fin.toFixed(3), place: p.place });
          if (this.graceLeft == null && this.players.length > 1) this.graceLeft = this.grace;
        }
      }
      if (counting) this.graceLeft = Math.max(0, this.graceLeft - dt);
      if (this.graceLeft != null) {
        if (this.graceLeft <= 1e-9) { this.graceLeft = 0; this._finish(); }
      } else if ((this.players.length === 1 && this.finished === 1) || this.t >= (this.mode === 'escape' ? ESCAPE_CAP : RACE_CAP)) this._finish();
    }
    // ---------- 逃出：機關 ----------
    /** 這位玩家目前關著的門的矩形（供球物理使用）；非逃出模式回傳 undefined。 */
    blockers(p) {
      if (!this.esc) return undefined;
      const out = [], ds = this.esc.doors;
      for (let j = 0; j < ds.length; j++) if (p.open[j] <= 0) out.push(ds[j].rect);
      return out;
    }
    /** 推進一位玩家的球（含門的阻擋）；回傳撞牆速度。 */
    stepPlayer(p, ix, iy, dt) { return stepBall(this.maze, p, ix, iy, dt, this.blockers(p)); }
    /** 門計時（踏板開門只維持一段時間）。線上客戶端也要每步呼叫，才能與伺服器同步關門。 */
    doorTick(dt) {
      if (!this.esc) return;
      for (const p of this.players) for (let j = 0; j < p.open.length; j++) if (p.open[j] > 0 && p.open[j] < FOREVER / 2) p.open[j] = Math.max(0, p.open[j] - dt);
    }
    /** 已經通過的門數（以所在區域判定，與門現在開不開無關）。 */
    passed(p) {
      if (!this.esc) return 0;
      const c = cellAt(this.maze, p.x, p.y); let k = 0;
      for (const d of this.esc.doors) if (d.farSide[c]) k++;
      return k;
    }
    /** 傳送門：走進一端就從另一端出來；剛傳送完要先離開出口一小段才會再觸發。 */
    _portals(p) {
      const m = this.maze, ps = this.esc.portals;
      if (p.warp >= 0) { const q = cellCenter(m, p.warp % 2 ? ps[p.warp >> 1].b : ps[p.warp >> 1].a); if (Math.hypot(p.x - q.x, p.y - q.y) > PORTAL_LEAVE) p.warp = -1; return; }
      for (let i = 0; i < ps.length; i++) for (let end = 0; end < 2; end++) {
        const from = cellCenter(m, end ? ps[i].b : ps[i].a);
        if (Math.hypot(p.x - from.x, p.y - from.y) >= PORTAL_R) continue;
        const to = cellCenter(m, end ? ps[i].a : ps[i].b);
        p.x = to.x; p.y = to.y; p.vx = 0; p.vy = 0; p.warp = i * 2 + (1 - end);
        this.emit({ e: 'warp', id: p.id, x: +to.x.toFixed(3), y: +to.y.toFixed(3), w: p.warp });
        return;
      }
    }
    _escape() {
      const m = this.maze;
      for (const p of this.players) {
        if (p.fin != null) continue;
        const c = cellAt(m, p.x, p.y);
        this._portals(p);
        for (const d of this.esc.doors) {
          const j = d.j, ic = cellCenter(m, d.item);
          if (d.kind === 'key') {
            if (p.keyHas[j] === 0 && Math.hypot(p.x - ic.x, p.y - ic.y) < KEY_R) { p.keyHas[j] = 1; this.emit({ e: 'key', id: p.id, d: j }); }
            else if (p.keyHas[j] === 1 && (c === d.near || c === d.far) && Math.hypot(p.x - d.cx, p.y - d.cy) < UNLOCK_R) { p.keyHas[j] = 2; p.open[j] = FOREVER; this.emit({ e: 'unlock', id: p.id, d: j }); }
          } else if (p.open[j] <= 0 && Math.hypot(p.x - ic.x, p.y - ic.y) < PLATE_R) {
            p.open[j] = d.T; this.emit({ e: 'plate', id: p.id, d: j, T: +d.T.toFixed(2) });
          }
        }
      }
    }
    _stars() {
      const m = this.maze;
      for (const p of this.players) {
        for (let k = this.stars.length - 1; k >= 0; k--) {
          const s = this.stars[k], c = cellCenter(m, s.c);
          if (Math.hypot(p.x - c.x, p.y - c.y) < STAR_R) {
            this.stars.splice(k, 1); p.score++; p.last = this.t;
            this.emit({ e: 'star', id: p.id, sid: s.id, score: p.score });
          }
        }
      }
      if (this.t >= STAR_TIME || !this.stars.length) this._finish(); // 時間到或星星被搶光都結束
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
      if (this.run) {
        key = (p) => (p.fin != null ? [0, p.fin] : [1, this.gd[cellAt(this.maze, p.x, p.y)] - 1000 * this.passed(p) + 0.01 * Math.hypot(p.x - cellCenter(this.maze, this.maze.goal).x, p.y - cellCenter(this.maze, this.maze.goal).y)]);
      } else if (this.mode === 'stars') {
        key = (p) => [-p.score, p.last];
      } else {
        key = (p) => [p.alive ? 0 : 1, p.alive ? 0 : -p.out];
      }
      ps.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
      const out = []; let place = 0, prev = null;
      ps.forEach((p, i) => {
        const k = key(p), same = prev && Math.abs(k[0] - prev[0]) < 1e-9 && (this.run && p.fin == null ? false : Math.abs(k[1] - prev[1]) < 1e-9);
        if (!same) place = i + 1; prev = k;
        const r = { id: p.id, place };
        if (this.run) { if (p.fin != null) r.time = +p.fin.toFixed(2); else r.dnf = true; }
        else if (this.mode === 'stars') r.score = p.score;
        else { r.alive = p.alive; r.time = +(p.alive ? this.t : p.out).toFixed(2); }
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
      } else if (e.e === 'key') { const p = this.byId.get(e.id); if (p && p.keyHas) p.keyHas[e.d] = 1; }
      else if (e.e === 'unlock') { const p = this.byId.get(e.id); if (p && p.open) { p.keyHas[e.d] = 2; p.open[e.d] = FOREVER; } }
      else if (e.e === 'plate') { const p = this.byId.get(e.id); if (p && p.open) p.open[e.d] = e.T; }
      else if (e.e === 'warp') { const p = this.byId.get(e.id); if (p) { p.x = e.x; p.y = e.y; p.vx = 0; p.vy = 0; p.warp = e.w; } }
      else if (e.e === 'tile') { this.tile[e.c] = e.s; if (e.s === 1) this.timer[e.c] = this.crumble; }
      else if (e.e === 'out') { const p = this.byId.get(e.id); if (p) { p.alive = false; p.out = e.t; } }
      else if (e.e === 'respawn') { const p = this.byId.get(e.id); if (p) { p.x = e.x; p.y = e.y; p.vx = 0; p.vy = 0; } }
      else if (e.e === 'end') { this.over = true; this.results = e.results; }
    }
  }

  return {
    N, E, S, W, DX, DY, OPP, DIRS, MODES, MODE_NAMES, isRun, DOOR_COLORS, FOREVER, ESCAPE_GRACE, DIFFS, DIFF_THEME, braidFor, AI_NAMES, SIZE, BRAID, CRUMBLE, LEVELS_PER_DIFF, PHYS,
    STAR_R, GOAL_R, STAR_TIME, GRACE, MAX_PLAYERS, COLLAPSE_SUDDEN, COLLAPSE_HEAD,
    rng, hashSeed, dailySeed, PORTAL_COLORS, clamp, makeMaze, cellCenter, cellAt, stepBall, levelSize, levelSeed, levelPar, levelStars, sizeFor, World,
  };
});
