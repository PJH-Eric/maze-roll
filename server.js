// 迷宮滾球：靜態檔 + /health + WebSocket（同一個 port，適合 Render Web Service）
const http = require('http'), fs = require('fs'), path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { Hub } = require('./lib/hub.js');

const PORT = process.env.PORT || 3090;
const ALLOWED = (process.env.GAME_ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const ROOT = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function cors(req, res) {
  const o = req.headers.origin;
  if (o && (!ALLOWED.length || ALLOWED.includes(o))) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
}
const server = http.createServer((req, res) => {
  cors(req, res);
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(buf);
  });
});

const hub = new Hub();

/* 大廳聊天室（與房間聊天分開；即時傳送訊息，不載入歷史訊息） */
const chatSends = new Map();   // 連線代號 → send
const lobbyChat = require('./lib/lobby-chat.js').createHub({ send: (id, msg) => { const f = chatSends.get(id); if (f) f(msg); }, key: 't' });
let chatSeq = 0;
const wss = new WebSocketServer({
  server, path: '/ws', maxPayload: 4096,
  verifyClient: ({ origin }) => !ALLOWED.length || !origin || ALLOWED.includes(origin),
});
wss.on('connection', (ws) => {
  const c = hub.connect((obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); });
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  const chatId = 'c' + (++chatSeq);
  chatSends.set(chatId, (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); });
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m && m.t === 'ping') { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'pong', ts: m.ts })); return; }
    if (m && m.t === 'lobbychat') { lobbyChat.handle(chatId, m); return; }
    const before = m && (m.t === 'create' || m.t === 'quick') ? new Set(hub.rooms.keys()) : null;
    hub.handle(c, m);
    if (before) for (const [code, r] of hub.rooms) {
      if (before.has(code)) continue;
      const host = r.members.get(r.hostId);
      lobbyChat.roomOpened({ code, host: host ? host.name : '' });
    }
  });
  ws.on('close', () => { lobbyChat.drop(chatId); chatSends.delete(chatId); hub.disconnect(c); });
  ws.on('error', () => {});
});
setInterval(() => wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 25000).unref();

if (require.main === module) {
  server.listen(PORT, () => {
    const port = server.address().port;
    console.log('迷宮滾球已啟動');
    console.log('本機網址：http://localhost:' + port);
    const seen = new Set();
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.internal || address.family !== 'IPv4' || seen.has(address.address)) continue;
        seen.add(address.address);
        console.log('同網路網址（' + name + '）：http://' + address.address + ':' + port);
      }
    }
  });
}
module.exports = { server, hub };
