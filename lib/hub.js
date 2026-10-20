/* 迷宮滾球：房間與對局中樞（與傳輸層無關；server.js 用 ws 接上）。
   房間生命週期以「實體玩家」為準：沒有任何真人玩家（AI 不存在於線上房、觀戰者不算）就立即關閉。 */
const crypto = require('crypto');
const MR = require('../public/js/rules.js');

const MAX_PLAYERS = 4, MAX_SPECS = 20, ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ADJ = ['圓滾滾', '閃亮亮', '慢吞吞', '笑嘻嘻', '胖嘟嘟', '機靈', '勇敢', '好奇', '輕飄飄', '暖呼呼'];
const ANI = ['小熊', '小兔', '松鼠', '企鵝', '刺蝟', '小貓', '小狗', '浣熊', '海獺', '小鹿'];

function cleanText(s, max) {
  s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, max).join('');
}
const randName = () => ADJ[(Math.random() * ADJ.length) | 0] + ANI[(Math.random() * ANI.length) | 0];
const cleanName = (s) => cleanText(s, 12) || randName();
const token = () => crypto.randomBytes(6).toString('hex');
const uid = () => crypto.randomBytes(5).toString('hex');
const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);

class Hub {
  constructor(opts = {}) {
    this.o = Object.assign({ countdown: 3, countMs: 1000, tickMs: 10, snapshotMs: 50, dropGraceMs: 30000, listThrottleMs: 400 }, opts);
    this.rooms = new Map(); this.members = new Map(); this.closed = new Map(); this.conns = new Set();
    this._listTimer = null;
    this._sweep = setInterval(() => this.sweep(), 5000); if (this._sweep.unref) this._sweep.unref();
  }
  shutdown() { clearInterval(this._sweep); for (const r of this.rooms.values()) this._clearTimers(r); }

  // ---------- 連線 ----------
  connect(send) {
    const c = { id: uid(), send: (o) => { try { send(o); } catch (e) { /* 連線已斷 */ } }, mid: null, lobby: false, lastChat: 0 };
    this.conns.add(c); return c;
  }
  disconnect(c) {
    this.conns.delete(c);
    const m = c.mid && this.members.get(c.mid);
    if (m && m.c === c) {
      m.c = null; m.dropAt = Date.now() + this.o.dropGraceMs;
      const room = this.rooms.get(m.room);
      if (room) { this._roomUpdate(room); }
    }
  }
  sweep() {
    const now = Date.now();
    for (const m of [...this.members.values()]) if (!m.c && m.dropAt && now > m.dropAt) this._remove(m, 'dropped');
    for (const [k, t] of this.closed) if (now - t > 600000) this.closed.delete(k);
  }

  handle(c, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    const fn = this['on_' + msg.t];
    if (typeof fn !== 'function') return;
    if (msg.t !== 'hello' && !c.mid) return;
    try { fn.call(this, c, msg); } catch (e) { console.error('hub error', msg.t, e); }
  }
  err(c, code, text) { c.send({ t: 'err', code, msg: text }); }

  on_hello(c, m) {
    let mem = m.mid && this.members.get(String(m.mid));
    if (mem && !mem.c) { // 斷線重連
      mem.c = c; mem.dropAt = 0; c.mid = mem.id; mem.name = cleanName(m.name || mem.name);
      c.send({ t: 'hi', mid: mem.id, resumed: true });
      const room = this.rooms.get(mem.room);
      if (room) { this._sendRoom(room, mem); this._resume(room, mem); this._roomUpdate(room); }
      return;
    }
    const id = uid();
    this.members.set(id, { id, name: cleanName(m.name), c, room: null, role: null, ready: false, x: 0, y: 0, vx: 0, vy: 0, has: false, vote: false });
    c.mid = id; c.lobby = true;
    c.send({ t: 'hi', mid: id }); c.send({ t: 'rooms', rooms: this.listRooms() });
  }
  me(c) { return this.members.get(c.mid); }

  // ---------- 大廳 ----------
  listRooms() {
    return [...this.rooms.values()].map((r) => ({
      code: r.code, host: this._host(r) ? this._host(r).name : '', mode: r.mode, diff: r.diff, lightsOut: r.lightsOut, state: r.state,
      players: this._players(r).length, max: MAX_PLAYERS, specs: this._specs(r).length,
    })).sort((a, b) => (a.state === 'waiting' ? 0 : 1) - (b.state === 'waiting' ? 0 : 1) || b.players - a.players);
  }
  _pushLobby() {
    if (this._listTimer) return;
    this._listTimer = setTimeout(() => {
      this._listTimer = null; const rooms = this.listRooms();
      for (const c of this.conns) { const m = this.members.get(c.mid); if (m && !m.room) c.send({ t: 'rooms', rooms }); }
    }, this.o.listThrottleMs);
    if (this._listTimer.unref) this._listTimer.unref();
  }
  on_rooms(c) { c.send({ t: 'rooms', rooms: this.listRooms() }); }

  _players(r) { return [...r.members.values()].filter((m) => m.role === 'player'); }
  _specs(r) { return [...r.members.values()].filter((m) => m.role === 'spec'); }
  _host(r) { return r.members.get(r.hostId); }

  on_name(c, m) { const me = this.me(c); me.name = cleanName(m.name); if (me.room) this._roomUpdate(this.rooms.get(me.room)); }

  _newCode() {
    for (let k = 0; k < 50; k++) {
      let s = ''; for (let i = 0; i < 4; i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0];
      if (!this.rooms.has(s) && !this.closed.has(s)) return s;
    }
    return uid().slice(0, 4).toUpperCase();
  }
  on_create(c, m) {
    const me = this.me(c); if (me.room) return this.err(c, 'inroom', '你已在房間中');
    me.name = cleanName(m.name || me.name);
    const mode = MR.MODES.includes(m.mode) ? m.mode : 'race', diff = num(m.diff, 0, 4, 2) | 0;
    const room = { code: this._newCode(), hostId: me.id, members: new Map(), state: 'waiting', mode, diff, lightsOut: m.lightsOut === true, tp: token(), ts: token(), revoked: new Set(), chat: [], world: null, timers: [], round: 0 };
    this.rooms.set(room.code, room);
    this._enter(room, me, 'player');
  }
  on_quick(c, m) {
    const me = this.me(c); if (me.room) return;
    me.name = cleanName(m.name || me.name);
    const cand = [...this.rooms.values()].filter((r) => r.state === 'waiting' && this._players(r).length < MAX_PLAYERS)
      .sort((a, b) => this._players(b).length - this._players(a).length)[0];
    if (cand) return this._enter(cand, me, 'player');
    this.on_create(c, { name: me.name, mode: 'race', diff: 2 });
  }
  _resolve(room, m) { // 以 token 與房間狀態決定最終角色（暱稱不影響權限）
    const tk = m.token ? String(m.token) : '';
    if (tk) {
      if (tk === room.ts) return { role: 'spec' };
      if (tk === room.tp) return { role: 'player' };
      return { error: room.revoked.has(tk) ? 'revoked' : 'invalid' };
    }
    return { role: m.role === 'spec' ? 'spec' : 'player' };
  }
  on_peek(c, m) {
    const code = String(m.code || '').toUpperCase(), room = this.rooms.get(code);
    if (!room) return c.send({ t: 'peek', ok: false, code, reason: this.closed.has(code) ? 'closed' : 'invalid' });
    const r = this._resolve(room, m);
    if (r.error) return c.send({ t: 'peek', ok: false, code, reason: r.error });
    c.send({ t: 'peek', ok: true, code, role: r.role, room: this.listRooms().find((x) => x.code === code) });
  }
  on_join(c, m) {
    const me = this.me(c); if (me.room) return this.err(c, 'inroom', '你已在房間中');
    const code = String(m.code || '').toUpperCase(), room = this.rooms.get(code);
    if (!room) return this.err(c, this.closed.has(code) ? 'closed' : 'invalid', this.closed.has(code) ? '這個房間已經結束了' : '找不到這個房間');
    const r = this._resolve(room, m);
    if (r.error) return this.err(c, r.error, r.error === 'revoked' ? '這個邀請連結已被房主撤銷' : '邀請連結無效');
    me.name = cleanName(m.name || me.name);
    let role = r.role, fallback = false;
    if (role === 'player' && (room.state !== 'waiting' || this._players(room).length >= MAX_PLAYERS)) { role = 'spec'; fallback = true; }
    if (role === 'spec' && this._specs(room).length >= MAX_SPECS) return this.err(c, 'specfull', '觀戰席已滿');
    this._enter(room, me, role, fallback);
  }
  _enter(room, me, role, fallback) {
    me.room = room.code; me.role = role; me.ready = false; me.vote = false; me.has = false;
    room.members.set(me.id, me); if (me.c) me.c.lobby = false;
    if (me.c) me.c.send({ t: 'joined', code: room.code, role, fallback: !!fallback });
    this._sendRoom(room, me);
    this._sys(room, me.name + (role === 'spec' ? ' 來觀戰了' : ' 加入了房間'));
    if (room.state !== 'waiting') this._resume(room, me);
    this._roomUpdate(room); this._pushLobby();
  }
  on_leave(c) { const me = this.me(c); if (me.room) this._remove(me, 'left'); }
  _remove(me, why) {
    const room = this.rooms.get(me.room);
    if (!room) { this.members.delete(me.id); return; }
    room.members.delete(me.id);
    const name = me.name, wasHost = room.hostId === me.id;
    me.room = null; me.role = null;
    if (me.c) { me.c.lobby = true; me.c.send({ t: 'left', why }); }
    if (why === 'dropped') this.members.delete(me.id);
    if (this._players(room).length === 0) return this.closeRoom(room, '房內沒有玩家了，房間已關閉');
    if (wasHost) { const nh = this._players(room)[0]; room.hostId = nh.id; this._sys(room, nh.name + ' 成為新房主'); }
    this._sys(room, name + (why === 'kicked' ? ' 被請出房間' : ' 離開了'));
    // 對局中玩家離開：該球凍結在原地（競速視為未完賽、崩塌最終會掉落）
    this._roomUpdate(room); this._pushLobby();
  }
  closeRoom(room, reason) {
    if (!this.rooms.has(room.code)) return;
    this._clearTimers(room);
    room.tp = room.ts = null; room.state = 'closed';
    this.rooms.delete(room.code); this.closed.set(room.code, Date.now());
    for (const m of room.members.values()) { m.room = null; m.role = null; if (m.c) { m.c.lobby = true; m.c.send({ t: 'closed', reason }); } if (!m.c) this.members.delete(m.id); }
    room.members.clear(); this._pushLobby();
  }
  _clearTimers(room) { for (const t of room.timers) { clearTimeout(t); clearInterval(t); } room.timers = []; }

  // ---------- 房間 ----------
  _snapshot(room, viewer) {
    const isPlayer = viewer && viewer.role === 'player';
    return {
      code: room.code, state: room.state, mode: room.mode, diff: room.diff, lightsOut: room.lightsOut, host: room.hostId, max: MAX_PLAYERS, maxSpecs: MAX_SPECS,
      members: [...room.members.values()].map((m) => ({ id: m.id, name: m.name, role: m.role, ready: m.ready, online: !!m.c, vote: !!m.vote })),
      invite: isPlayer ? { tp: room.tp, ts: room.ts } : null,
    };
  }
  _sendRoom(room, me) { if (me.c) me.c.send({ t: 'room', room: this._snapshot(room, me), you: me.id, role: me.role }); }
  _roomUpdate(room) { if (!this.rooms.has(room.code)) return; for (const m of room.members.values()) this._sendRoom(room, m); }
  _bcast(room, o, except) { for (const m of room.members.values()) if (m.c && m !== except) m.c.send(o); }
  _sys(room, text) { this._bcast(room, { t: 'chat', sys: true, text, ts: Date.now() }); }

  on_ready(c, m) {
    const me = this.me(c), room = this.rooms.get(me.room);
    if (!room || room.state !== 'waiting' || me.role !== 'player') return;
    me.ready = !!m.v; this._roomUpdate(room);
  }
  on_set(c, m) {
    const me = this.me(c), room = this.rooms.get(me.room);
    if (!room || room.hostId !== me.id || room.state !== 'waiting') return;
    if (MR.MODES.includes(m.mode)) room.mode = m.mode;
    if (m.diff != null) room.diff = num(m.diff, 0, 4, room.diff) | 0;
    if (typeof m.lightsOut === 'boolean') room.lightsOut = m.lightsOut;
    for (const p of this._players(room)) if (p.id !== room.hostId) p.ready = false;
    this._roomUpdate(room); this._pushLobby();
  }
  on_kick(c, m) {
    const me = this.me(c), room = this.rooms.get(me.room);
    if (!room || room.hostId !== me.id) return;
    const t = room.members.get(String(m.id)); if (!t || t.id === me.id) return;
    this._remove(t, 'kicked');
  }
  on_invite(c, m) {
    const me = this.me(c), room = this.rooms.get(me.room);
    if (!room || room.hostId !== me.id || m.act !== 'revoke') return;
    room.revoked.add(room.tp); room.revoked.add(room.ts); room.tp = token(); room.ts = token();
    this._roomUpdate(room); this._sys(room, '房主撤銷並重發了邀請連結');
  }
  on_chat(c, m) {
    const me = this.me(c), room = this.rooms.get(me.room); if (!room) return;
    const now = Date.now(); if (now - c.lastChat < 700) return; c.lastChat = now;
    const text = cleanText(m.text, 80); if (!text) return;
    const entry = { t: 'chat', from: me.id, name: me.name, role: me.role, text, ts: now };
    room.chat.push(entry); if (room.chat.length > 40) room.chat.shift();
    this._bcast(room, entry);
  }

  // ---------- 對局 ----------
  on_start(c) {
    const me = this.me(c), room = this.rooms.get(me.room);
    if (!room || room.hostId !== me.id) return;
    if (room.state !== 'waiting' && room.state !== 'ended') return;
    const ps = this._players(room).filter((p) => p.c);
    if (ps.length < 2) return this.err(c, 'few', '至少要 2 位玩家才能開始');
    if (ps.some((p) => p.id !== room.hostId && !p.ready && room.state === 'waiting')) return this.err(c, 'notready', '還有玩家沒按準備');
    this._begin(room);
  }
  on_rematch(c) {
    const me = this.me(c), room = this.rooms.get(me.room);
    if (!room || me.role !== 'player' || room.state !== 'ended') return;
    if (room.hostId === me.id) {
      if (this._players(room).filter((p) => p.c).length < 2) return this.err(c, 'few', '至少要 2 位玩家才能再來一局');
      return this._begin(room);
    }
    me.vote = true; this._roomUpdate(room);
  }
  on_back(c) {
    const me = this.me(c), room = this.rooms.get(me.room);
    if (!room || room.state !== 'ended') return;
    room.state = 'waiting';
    for (const m of room.members.values()) { m.ready = false; m.vote = false; }
    this._roomUpdate(room); this._pushLobby();
  }
  _begin(room) {
    this._clearTimers(room);
    const players = this._players(room).filter((p) => p.c);
    // 開局時，連線中的玩家才入局；斷線者與觀戰者維持觀戰
    for (const p of this._players(room)) if (!p.c) { p.role = 'spec'; }
    room.round++; room.state = 'count'; room.seed = MR.hashSeed(room.code, room.round, Date.now(), Math.random());
    for (const m of room.members.values()) { m.ready = false; m.vote = false; m.has = false; }
    room.world = new MR.World({ mode: room.mode, diff: room.diff, lightsOut: room.lightsOut, seed: room.seed, players: players.map((p) => ({ id: p.id, name: p.name, kind: 'remote' })) });
    const init = { t: 'init', mode: room.mode, diff: room.diff, lightsOut: room.lightsOut, seed: room.seed, size: room.world.size, players: players.map((p) => ({ id: p.id, name: p.name })) };
    this._bcast(room, init);
    this._roomUpdate(room); this._pushLobby();
    let n = this.o.countdown;
    const tick = () => {
      if (!this.rooms.has(room.code)) return;
      if (n > 0) { this._bcast(room, { t: 'count', n }); n--; room.timers.push(setTimeout(tick, this.o.countMs)); }
      else this._go(room);
    };
    tick();
  }
  _go(room) {
    room.state = 'playing'; room.graceSent = false; room.world.start(); this._bcast(room, { t: 'go' });
    const dt = this.o.tickMs / 1000, w = room.world, snapshotMs = Math.max(this.o.tickMs, this.o.snapshotMs), snapshotEvery = Math.ceil(snapshotMs / this.o.tickMs);
    let snapshotTicks = 0;
    let lastTick = performance.now();
    const iv = setInterval(() => {
      if (!this.rooms.has(room.code) || room.state !== 'playing') return;
      const now = performance.now(), graceDt = (now - lastTick) / 1000; lastTick = now;
      const ev = w.update(dt, graceDt);
      if (++snapshotTicks >= snapshotEvery) {
        snapshotTicks = 0;
        const snap = [];
        for (const p of w.players) { snap.push([p.id, +p.x.toFixed(3), +p.y.toFixed(3), +p.vx.toFixed(2), +p.vy.toFixed(2)]); }
        this._bcast(room, { t: 'snap', tt: +w.t.toFixed(2), graceLeft: w.graceLeft, p: snap });
      }
      if (ev.length) {
        for (const e of ev) if (e.e === 'warp') { const m = room.members.get(e.id); if (m) m.warpUntil = Date.now() + 400; } // 傳送後短暫忽略舊位置回報，避免被舊位置拉回入口
        const real = ev.filter((e) => e.e !== 'end'); if (real.length) this._bcast(room, { t: 'ev', ev: real });
      }
      if (w.graceLeft != null && !room.graceSent) { room.graceSent = true; this._bcast(room, { t: 'grace', left: w.grace }); }
      if (w.over) {
        clearInterval(iv); room.state = 'ended';
        this._bcast(room, { t: 'end', results: w.results, t_total: +w.t.toFixed(2) });
        this._roomUpdate(room); this._pushLobby();
      }
    }, this.o.tickMs);
    room.timers.push(iv);
  }
  on_pos(c, m) {
    const me = this.me(c), room = this.rooms.get(me.room);
    if (!room || room.state !== 'playing' || me.role !== 'player' || !room.world) return;
    const p = room.world.byId.get(me.id); if (!p || !p.alive) return;
    if (me.warpUntil && Date.now() < me.warpUntil) return;
    const mz = room.world.maze, x = num(m.x, 0, mz.w, p.x), y = num(m.y, 0, mz.h, p.y);
    if (me.has && Math.hypot(x - p.x, y - p.y) > 3) return; // 瞬移式移動不採信
    if (room.world.run && p.fin != null) return;
    p.x = x; p.y = y; p.vx = num(m.vx, -8, 8, 0); p.vy = num(m.vy, -8, 8, 0); me.has = true;
  }
  on_respawn(c) {
    const me = this.me(c), room = this.rooms.get(me.room);
    if (!room || room.state !== 'playing' || me.role !== 'player' || !room.world) return;
    const now = Date.now(); if (me.lastRespawn && now - me.lastRespawn < 1000) return; // 冷卻 1 秒
    const ev = room.world.respawn(me.id); if (!ev) return;
    me.lastRespawn = now; me.has = false; // 接著的位置回報不受「瞬移」檢查限制
    this._bcast(room, { t: 'ev', ev: [ev] });
  }
  _resume(room, me) {
    if (!me.c || !room.world || room.state === 'waiting') return;
    const w = room.world;
    me.c.send({ t: 'init', mode: room.mode, diff: room.diff, lightsOut: w.lightsOut, seed: room.seed, size: w.size, players: w.players.map((p) => ({ id: p.id, name: p.name })), resume: true,
      state: room.state, tt: +w.t.toFixed(2), graceLeft: w.graceLeft,
      snap: w.players.map((p) => [p.id, +p.x.toFixed(3), +p.y.toFixed(3), p.alive, p.score, p.fin, p.out, p.keyHas ? Array.from(p.keyHas) : null, p.open ? Array.from(p.open) : null]),
      stars: w.stars ? w.stars.map((s) => [s.id, s.c]) : null, tiles: w.tile ? Array.from(w.tile) : null });
    if (room.state === 'playing') me.c.send({ t: 'go', resume: true });
    if (room.state === 'ended' && w.results) me.c.send({ t: 'end', results: w.results });
  }
}
module.exports = { Hub, MAX_PLAYERS, MAX_SPECS, cleanName, cleanText };
