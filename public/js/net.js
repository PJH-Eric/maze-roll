// 線上連線：WebSocket + 斷線自動重連（以 mid 回到原房間）。server URL 只從 config.js 取得。
const cfg = (window.MR_CONFIG || {});

/** 回傳可用的 ws(s) URL；未設定伺服器時回傳 null。 */
export function wsUrl() {
  let u = (cfg.serverUrl || '').trim();
  if (!u || u.includes('__GAME_SERVER_URL__')) {
    // 本機以 node server.js 開啟時，使用同源的伺服器
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      const h = location.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local') || /^\d+\.\d+\.\d+\.\d+$/.test(h)) u = location.origin; else return null;
    } else return null;
  }
  let url; try { url = new URL(u); } catch (e) { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.pathname = '/ws'; url.search = ''; url.hash = '';
  return url.toString();
}

export class Net {
  constructor() { this.ws = null; this.handlers = new Set(); this.state = 'idle'; this.mid = null; this.name = ''; this.rtt = null; this.wantOpen = false; this.retry = 0; this.timer = null; this.sendQ = []; try { this.mid = sessionStorage.getItem('mr.mid'); } catch (e) { /* 略 */ } }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  emit(m) { [...this.handlers].forEach((f) => { if (this.handlers.has(f)) f(m); }); }
  setState(s) {
    if (window.ServerOutage) window.ServerOutage.state(s);
    if (this.state !== s) { this.state = s; this.emit({ t: '_state', state: s }); }
  }
  connect(name) {
    this.name = name || this.name; this.wantOpen = true;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const url = wsUrl(); if (!url) { this.setState('nourl'); return; }
    this.setState(this.retry ? 'reconnecting' : 'connecting');
    let ws; try { ws = new WebSocket(url); } catch (e) { this.setState('offline'); return; }
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; ws.send(JSON.stringify({ t: 'hello', name: this.name, mid: this.mid })); this._ping(); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'pong') { this.rtt = Math.round(performance.now() - m.ts); this.emit({ t: '_rtt', rtt: this.rtt }); return; }
      if (m.t === 'hi') { this.mid = m.mid; try { sessionStorage.setItem('mr.mid', m.mid); } catch (e) { /* 略 */ } this.setState('online'); const q = this.sendQ; this.sendQ = []; q.forEach((x) => this.send(x)); }
      window.GameAnalytics?.roomResponse(m.t, m.code || !!m.room);
      this.emit(m);
    };
    ws.onclose = () => { clearTimeout(this.pingT); if (this.ws === ws) this.ws = null; if (!this.wantOpen) { this.setState('idle'); return; } this.setState('reconnecting'); this.retry++; clearTimeout(this.timer); this.timer = setTimeout(() => this.connect(), Math.min(8000, 600 * this.retry)); };
    ws.onerror = () => {};
  }
  _ping() { clearTimeout(this.pingT); if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify({ t: 'ping', ts: performance.now() })); this.pingT = setTimeout(() => this._ping(), 4000); } }
  send(o) {
    if (this.ws && this.ws.readyState === 1 && this.state === 'online') {
      this.ws.send(JSON.stringify(o));
      window.GameAnalytics?.roomRequest(o);
    } else if (o.t !== 'pos') this.sendQ.push(o);
  }
  close() { this.wantOpen = false; clearTimeout(this.timer); clearTimeout(this.pingT); if (this.ws) { try { this.ws.close(); } catch (e) { /* 略 */ } } this.ws = null; this.setState('idle'); }
}
export const net = new Net();
