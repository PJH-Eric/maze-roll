// 對局控制：單機（含電腦）與線上共用同一個畫面／規則。規則一律來自 rules.js 的 World。
import { Scene3D } from './scene.js';
import { audio } from './audio.js';
import { store } from './store.js';
const MR = window.MR, MRAI = window.MRAI;
const STEP = 1 / 60;

export class Game {
  /**
   * o: {canvas, mode, diff, seed, size?, players:[{id,name,kind,ai?}], meId, online?:{net}, input, minimapEl?, hooks}
   * hooks: onHud(h), onCount(n|null), onEnd(info), onMe(state)
   */
  constructor(o) {
    this.o = o; this.hooks = o.hooks || {}; this.input = o.input; this.meId = o.meId; this.online = !!o.online;
    this.world = new MR.World({ mode: o.mode, diff: o.diff, seed: o.seed, size: o.size, players: o.players.map((p) => ({ id: p.id, name: p.name, kind: p.kind })) });
    this.ctrl = new Map();
    if (!this.online) o.players.forEach((p) => { if (p.kind === 'ai') this.ctrl.set(p.id, MRAI.makeAI(this.world, this.world.byId.get(p.id), p.ai)); });
    this.scene = new Scene3D(o.canvas, { reduce: store.get('reduce'), shapes: store.get('shapes'), ballType: store.get('ball'), trail: store.get('trail'), preserve: !!window.__MR_PRESERVE });
    this.scene.setCam(store.get('cam'));
    this.state = 'count'; this.paused = false; this.acc = 0; this.last = 0; this.raf = 0; this.endTimer = null; this.ff = false;
    this.follow = null; this.hudT = 0; this.mapT = 0; this.posT = 0; this.rollT = 0; this.lastThud = 0; this.lastCrack = 0;
    this.remote = new Map(); this.graceLeft = null; this.meState = 'play'; this.stopped = false; this.countN = null;
    if (o.snapshot) this._applySnapshot(o.snapshot);
    this.scene.load(this.world, this.meId);
    this._size();
    this._loop = this._loop.bind(this);
    this.ro = new ResizeObserver(() => this._size()); this.ro.observe(o.canvas.parentElement);
    this.raf = requestAnimationFrame(this._loop);
  }
  me() { return this.meId ? this.world.byId.get(this.meId) : null; }
  _size() { const el = this.o.canvas.parentElement, r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) this.scene.resize(Math.round(r.width), Math.round(r.height)); }
  _applySnapshot(s) { // 斷線重連／中途加入：還原世界狀態
    const w = this.world;
    s.snap.forEach(([id, x, y, alive, score, fin, out]) => { const p = w.byId.get(id); if (!p) return; p.x = x; p.y = y; p.alive = alive; p.score = score || 0; p.fin = fin; p.out = out; });
    if (s.stars) { w.stars = s.stars.map(([id, c]) => ({ id, c })); w.nextStar = 1e6; }
    if (s.tiles) { w.tile.set(s.tiles); for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] === 1) w.timer[i] = 1; }
    w.t = s.tt || 0; w.started = s.state === 'playing';
  }

  // ---------- 流程 ----------
  startCountdown() { // 單機：3-2-1-GO
    let n = 3; this.state = 'count'; this._count(n);
    const tick = () => { if (this.stopped) return; n--; if (n > 0) { this._count(n); this.cdT = setTimeout(tick, 800); } else { this._count(0); this._begin(); } };
    this.cdT = setTimeout(tick, 800);
  }
  _count(n) { this.countN = n; audio.beep(n === 0); this.hooks.onCount && this.hooks.onCount(n); }
  _begin() { this.state = 'play'; this.world.start(); this.input && this.input.calibrate && this.input.calibrate(); setTimeout(() => { this.hooks.onCount && this.hooks.onCount(null); }, 600); }
  pause(on) { if (this.online || this.state === 'ended') return; this.paused = !!on; if (!on) this.last = 0; }
  setFollow(id) { this.follow = id; }
  fastForward() { if (!this.online) this.ff = true; }
  stop() {
    this.stopped = true; cancelAnimationFrame(this.raf); clearTimeout(this.cdT); clearTimeout(this.endTimer);
    this.ro && this.ro.disconnect(); audio.roll(0); this.scene.dispose();
  }

  // ---------- 線上訊息 ----------
  net(m) {
    const w = this.world;
    if (m.t === 'count') { this.state = 'count'; this._count(m.n); }
    else if (m.t === 'go') { if (this.state !== 'play') { this._begin(); this._count(0); } w.started = true; }
    else if (m.t === 'snap') {
      w.t = m.tt;
      for (const [id, x, y, vx, vy] of m.p) {
        const p = w.byId.get(id); if (!p || id === this.meId) continue;
        let r = this.remote.get(id); if (!r) { r = { tx: x, ty: y }; this.remote.set(id, r); p.x = x; p.y = y; }
        r.tx = x; r.ty = y; r.vx = vx; r.vy = vy; r.age = 0; p.vx = vx; p.vy = vy;
      }
    } else if (m.t === 'ev') { for (const e of m.ev) this._event(e, true); }
    else if (m.t === 'grace') this.graceLeft = m.left;
    else if (m.t === 'end') { w.applyEvent({ e: 'end', results: m.results }); this._ending(); }
  }

  // ---------- 事件 ----------
  _event(e, fromNet) {
    const w = this.world;
    if (fromNet) w.applyEvent(e);
    this.scene.onEvent(e);
    const me = this.meId;
    if (e.e === 'star') { if (e.id === me) { audio.star(); audio.vibrate(30); } else audio.starOther(); }
    else if (e.e === 'finish') {
      if (e.id === me) { e.place === 1 ? audio.win() : audio.finish(); audio.vibrate(60); this.meState = 'finished'; this.hooks.onMe && this.hooks.onMe('finished', e); }
      else audio.finish();
    } else if (e.e === 'out') {
      if (e.id === me) { audio.fall(); audio.vibrate(120); this.meState = 'out'; this.hooks.onMe && this.hooks.onMe('out', e); }
    } else if (e.e === 'tile' && e.s === 1) {
      const p = this.me(), now = performance.now();
      if (p && now - this.lastCrack > 70) { const x = (e.c % w.maze.w) + 0.5, y = ((e.c / w.maze.w) | 0) + 0.5; if (Math.hypot(x - p.x, y - p.y) < 3.2) { audio.crack(); this.lastCrack = now; } }
    } else if (e.e === 'end') this._ending();
  }
  _ending() {
    if (this.state === 'ended' || this.endTimer) return;
    this.endTimer = setTimeout(() => {
      this.state = 'ended'; this.ff = false;
      const w = this.world, r = w.results || [], mine = r.find((x) => x.id === this.meId);
      if (mine && mine.place === 1 && !(w.mode === 'race' && mine.dnf)) audio.win(); else if (this.meId) audio.lose();
      this.hooks.onEnd && this.hooks.onEnd({ world: w, results: r, mine, meId: this.meId });
    }, this.ff ? 50 : 1100);
  }

  // ---------- 主迴圈 ----------
  _tick(dt) {
    const w = this.world, me = this.me();
    if (!this.online) {
      for (const p of w.players) {
        if (!p.alive || (w.mode === 'race' && p.fin != null)) continue;
        let ix = 0, iy = 0;
        if (p.id === this.meId) { [ix, iy] = this.input.vec(); } else { const c = this.ctrl.get(p.id); if (c) [ix, iy] = c.step(dt); }
        const imp = MR.stepBall(w.maze, p, ix, iy, dt);
        if (p.id === this.meId && imp > 0.9) { const now = performance.now(); if (now - this.lastThud > 90) { audio.thud(imp); this.lastThud = now; } }
      }
      const ev = w.update(dt);
      for (const e of ev) this._event(e, false);
    } else {
      w.t += dt;
      if (me && me.alive && !(w.mode === 'race' && me.fin != null)) {
        const [ix, iy] = this.input.vec();
        const imp = MR.stepBall(w.maze, me, ix, iy, dt);
        if (imp > 0.9) { const now = performance.now(); if (now - this.lastThud > 90) { audio.thud(imp); this.lastThud = now; } }
        this.posT += dt;
        if (this.posT >= 0.05) { this.posT = 0; this.o.online.net.send({ t: 'pos', x: +me.x.toFixed(3), y: +me.y.toFixed(3), vx: +me.vx.toFixed(2), vy: +me.vy.toFixed(2) }); }
      }
      if (this.graceLeft != null) this.graceLeft = Math.max(0, this.graceLeft - dt);
    }
  }
  _loop(ts) {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this._loop);
    const dt = this.last ? Math.min(0.05, (ts - this.last) / 1000) : 0.016; this.last = ts;
    const w = this.world;
    if (this.state === 'play' && !this.paused) {
      this.acc = this.ff ? 600 * STEP : this.acc + dt; let n = 0; const max = this.ff ? 600 : 8;
      while (this.acc >= STEP && n++ < max && this.state === 'play') { this._tick(STEP); this.acc -= STEP; if (this.ff && w.over) break; }
      if (this.ff || this.acc > 0.2) this.acc = 0;
    }
    if (this.online) { // 其他玩家：往伺服器位置平滑追趕（含速度外插）
      const k = 1 - Math.exp(-14 * dt);
      this.remote.forEach((r, id) => {
        const p = w.byId.get(id); if (!p) return; r.age += dt;
        const ex = r.tx + (r.vx || 0) * Math.min(r.age, 0.15), ey = r.ty + (r.vy || 0) * Math.min(r.age, 0.15);
        p.x += (ex - p.x) * k; p.y += (ey - p.y) * k;
      });
    }
    // 滾動聲
    const me = this.me();
    audio.roll(me && me.alive && !(w.mode === 'race' && me.fin != null) && this.state === 'play' && !this.paused ? Math.hypot(me.vx, me.vy) : 0);
    // 鏡頭跟隨
    this.scene.frame(dt, this._followId(), false);
    this.hudT += dt; if (this.hudT > 0.15) { this.hudT = 0; this._hud(); }
    this.mapT += dt; if (this.mapT > 0.09) { this.mapT = 0; this.o.minimapEl && this._minimap(); }
  }
  _followId() {
    const w = this.world, me = this.me();
    if (this.follow && w.byId.get(this.follow) && w.byId.get(this.follow).alive !== undefined) { const f = w.byId.get(this.follow); if (f.alive && !(w.mode === 'race' && f.fin != null && f !== me)) return this.follow; }
    if (me && me.alive && !(w.mode === 'race' && me.fin != null)) return me.id;
    const rows = this.standings().filter((r) => r.alive && !r.done);
    if (rows.length) return rows[0].id;
    return me ? me.id : w.players[0].id;
  }
  standings() {
    const w = this.world, m = w.maze, rows = w.players.map((p) => {
      const base = { id: p.id, name: p.name, idx: p.idx, me: p.id === this.meId, ai: p.kind === 'ai', alive: p.alive, score: p.score };
      if (w.mode === 'race') { base.done = p.fin != null; base.fin = p.fin; base.rem = p.fin != null ? 0 : w.gd[MR.cellAt(m, p.x, p.y)] + 0.01 * Math.hypot(p.x - (m.goal % m.w + 0.5), p.y - ((m.goal / m.w | 0) + 0.5)); }
      if (w.mode === 'collapse') base.out = p.out;
      return base;
    });
    if (w.mode === 'race') rows.sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1) : a.done ? a.fin - b.fin : a.rem - b.rem));
    else if (w.mode === 'stars') rows.sort((a, b) => b.score - a.score);
    else rows.sort((a, b) => (a.alive !== b.alive ? (a.alive ? -1 : 1) : (b.out || 0) - (a.out || 0)));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }
  _hud() {
    const w = this.world; if (!this.hooks.onHud) return;
    const total = w.mode === 'stars' ? MR.STAR_TIME : null;
    this.hooks.onHud({ mode: w.mode, t: w.t, left: total != null ? Math.max(0, total - w.t) : null, grace: this.graceLeft, rows: this.standings(), state: this.state, meState: this.meState, alive: w.players.filter((p) => p.alive).length, follow: this._followId() });
  }
  /** 小地圖：依難度木色繪製的迷你木盤；牆體靜態層只畫一次，其餘每次重畫。 */
  _minimapStatic(c) {
    const w = this.world, m = w.maze, th = (window.MR.DIFF_THEME || [])[Math.max(0, Math.min(4, w.diff | 0))] || { floor: '#e2b97c', wall: '#8a5330' };
    const S = c.width * 0.9 / Math.max(m.w, m.h), ox = (c.width - m.w * S) / 2, oy = (c.height - m.h * S) / 2;
    const off = document.createElement('canvas'); off.width = c.width; off.height = c.height; const g = off.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, c.height); bg.addColorStop(0, th.floor); bg.addColorStop(1, th.floor);
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(60,30,10,.08)'; for (let y = 6; y < c.height; y += 9) g.fillRect(0, y, c.width, 1.2); // 木紋
    const walls = new Path2D();
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const cc = m.cells[y * m.w + x], X = ox + x * S, Y = oy + y * S;
      if (cc & 1) { walls.moveTo(X, Y); walls.lineTo(X + S, Y); } if (cc & 8) { walls.moveTo(X, Y); walls.lineTo(X, Y + S); }
      if (x === m.w - 1 && (cc & 2)) { walls.moveTo(X + S, Y); walls.lineTo(X + S, Y + S); } if (y === m.h - 1 && (cc & 4)) { walls.moveTo(X, Y + S); walls.lineTo(X + S, Y + S); }
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = Math.max(2, S * 0.3); g.save(); g.translate(0.8, 1.2); g.stroke(walls); g.restore(); // 牆的陰影
    g.strokeStyle = th.wall; g.lineWidth = Math.max(1.6, S * 0.22); g.stroke(walls);
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = Math.max(.8, S * 0.07); g.save(); g.translate(-0.3, -0.4); g.stroke(walls); g.restore(); // 高光
    return { img: off, S, ox, oy, w: m };
  }
  _minimap() {
    this._drawMini(this.o.minimapEl);
    if (this.bigMapEl) this._drawMini(this.bigMapEl);
  }
  _drawMini(c) {
    const g = c.getContext('2d'), w = this.world, m = w.maze;
    if (!c._mm || c._mm.w !== m) c._mm = this._minimapStatic(c);
    const { img, S, ox, oy } = c._mm;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
    if (w.tile) {
      for (let i = 0; i < m.n; i++) {
        const t = w.tile[i]; if (t === 0) continue;
        g.fillStyle = t === 2 ? 'rgba(18,10,6,0.92)' : 'rgba(224,100,50,0.55)'; g.fillRect(ox + (i % m.w) * S, oy + ((i / m.w) | 0) * S, S, S);
      }
    }
    const tt = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    if (w.mode === 'race') { // 終點小旗
      const gx = ox + (m.goal % m.w + 0.5) * S, gy = oy + (((m.goal / m.w) | 0) + 0.5) * S, u = Math.max(S * 1.1, 8);
      g.fillStyle = 'rgba(255,210,74,.55)'; g.beginPath(); g.arc(gx, gy, u * (0.7 + 0.12 * Math.sin(tt * 4)), 0, 7); g.fill();
      g.strokeStyle = '#4a2c1a'; g.lineWidth = Math.max(1.2, u * .12); g.beginPath(); g.moveTo(gx - u * .15, gy + u * .45); g.lineTo(gx - u * .15, gy - u * .5); g.stroke();
      g.fillStyle = '#d4473a'; g.beginPath(); g.moveTo(gx - u * .15, gy - u * .5); g.lineTo(gx + u * .5, gy - u * .28); g.lineTo(gx - u * .15, gy - u * .05); g.closePath(); g.fill();
    }
    if (w.stars) {
      for (const s of w.stars) {
        const x = ox + ((s.c % m.w) + 0.5) * S, y = oy + (((s.c / m.w) | 0) + 0.5) * S, r = Math.max(2.6, S * 0.4);
        g.fillStyle = '#ffc928'; g.strokeStyle = '#7a4d00'; g.lineWidth = 1; g.beginPath();
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * .45 : r; k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        g.closePath(); g.fill(); g.stroke();
      }
    }
    const cols = ['#d94a3d', '#3d7bd9', '#3fae5a', '#f0b323', '#9b59d0', '#f07b2b', '#e86aa6', '#dcdcdc'];
    const live = w.players.filter((p) => p.alive && !(w.mode === 'race' && p.fin != null));
    live.sort((a, b) => (a.id === this.meId) - (b.id === this.meId)); // 自己畫在最上層
    for (const p of live) {
      const me = p.id === this.meId, x = ox + p.x * S, y = oy + p.y * S, r = Math.max(me ? 3.4 : 2.6, S * (me ? 0.4 : 0.3));
      if (me) { g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x, y, r * (1.9 + 0.25 * Math.sin(tt * 5)), 0, 7); g.fill(); }
      g.fillStyle = cols[p.idx % 8]; g.strokeStyle = me ? '#fff' : 'rgba(30,18,10,.85)'; g.lineWidth = me ? 1.8 : 1.2;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
    }
  }
}
