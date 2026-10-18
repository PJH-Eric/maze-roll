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
  _minimap() {
    const c = this.o.minimapEl, g = c.getContext('2d'), w = this.world, m = w.maze, S = c.width / Math.max(m.w, m.h) * 0.96, ox = (c.width - m.w * S) / 2, oy = (c.height - m.h * S) / 2;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(30,18,10,0.82)'; g.fillRect(0, 0, c.width, c.height);
    if (w.tile) { for (let i = 0; i < m.n; i++) { if (w.tile[i] === 0) continue; g.fillStyle = w.tile[i] === 2 ? 'rgba(0,0,0,0.85)' : 'rgba(210,90,50,0.7)'; g.fillRect(ox + (i % m.w) * S, oy + ((i / m.w) | 0) * S, S, S); } }
    g.strokeStyle = '#e8c48a'; g.lineWidth = Math.max(1, S * 0.14); g.lineCap = 'square'; g.beginPath();
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const cc = m.cells[y * m.w + x], X = ox + x * S, Y = oy + y * S;
      if (cc & 1) { g.moveTo(X, Y); g.lineTo(X + S, Y); } if (cc & 8) { g.moveTo(X, Y); g.lineTo(X, Y + S); }
      if (x === m.w - 1 && (cc & 2)) { g.moveTo(X + S, Y); g.lineTo(X + S, Y + S); } if (y === m.h - 1 && (cc & 4)) { g.moveTo(X, Y + S); g.lineTo(X + S, Y + S); }
    }
    g.stroke();
    if (w.mode === 'race') { g.fillStyle = '#ffd24a'; const gx = m.goal % m.w, gy = (m.goal / m.w) | 0; g.fillRect(ox + gx * S + S * 0.15, oy + gy * S + S * 0.15, S * 0.7, S * 0.7); }
    if (w.stars) { g.fillStyle = '#ffd24a'; for (const s of w.stars) { g.beginPath(); g.arc(ox + ((s.c % m.w) + 0.5) * S, oy + (((s.c / m.w) | 0) + 0.5) * S, Math.max(2, S * 0.32), 0, 7); g.fill(); } }
    const cols = ['#d94a3d', '#3d7bd9', '#3fae5a', '#f0b323', '#9b59d0', '#f07b2b', '#e86aa6', '#dcdcdc'];
    for (const p of w.players) { if (!p.alive || (w.mode === 'race' && p.fin != null)) continue; g.fillStyle = cols[p.idx % 8]; g.beginPath(); g.arc(ox + p.x * S, oy + p.y * S, Math.max(2.2, S * (p.id === this.meId ? 0.42 : 0.3)), 0, 7); g.fill(); if (p.id === this.meId) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); } }
  }
}
