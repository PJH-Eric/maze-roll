// 真 WebSocket 連線檢查：兩位玩家＋一位觀戰者走完 建房→邀請→準備→開局→抵達終點→結算
const WebSocket = require('ws');
const { server, hub } = require('../server.js');
const MR = require('../public/js/rules.js');
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(port, name) {
  const log = []; const ws = new WebSocket('ws://localhost:' + port + '/ws');
  const c = { ws, log, send: (o) => ws.send(JSON.stringify(o)), last: (t) => [...log].reverse().find((m) => m.t === t), name };
  ws.on('message', (d) => log.push(JSON.parse(d)));
  return new Promise((res) => ws.on('open', () => { c.send({ t: 'hello', name }); setTimeout(() => res(c), 80); }));
}
(async () => {
  await new Promise((r) => server.listen(0, r)); const port = server.address().port;
  const [a, b, s] = await Promise.all([client(port, 'A'), client(port, 'B'), client(port, 'S')]);
  const get = await fetch('http://localhost:' + port + '/health').then((r) => r.json()); assert(get.ok); console.log('  ✓ /health');
  a.send({ t: 'create', name: 'A', mode: 'race', diff: 0 }); await sleep(150);
  const room = a.last('room').room; assert(room.code);
  b.send({ t: 'join', code: room.code, token: room.invite.tp, name: 'B' }); s.send({ t: 'join', code: room.code, token: room.invite.ts, name: 'S' }); await sleep(150);
  assert.strictEqual(b.last('joined').role, 'player'); assert.strictEqual(s.last('joined').role, 'spec'); console.log('  ✓ 邀請 token 決定玩家／觀戰');
  b.send({ t: 'ready', v: true }); await sleep(80); a.send({ t: 'start' }); await sleep(4500);
  const init = a.last('init'); assert(init && s.last('init') && a.last('go')); console.log('  ✓ 開局、倒數、go');
  const w = new MR.World({ mode: 'race', diff: init.diff, seed: init.seed, players: [] }); const g = MR.cellCenter(w.maze, w.maze.goal);
  a.send({ t: 'pos', x: g.x, y: g.y, vx: 0, vy: 0 }); b.send({ t: 'pos', x: g.x, y: g.y, vx: 0, vy: 0 }); await sleep(400);
  assert(s.last('end') && s.last('end').results.length === 2); console.log('  ✓ 結算（觀戰者同步收到）');
  a.send({ t: 'leave' }); b.send({ t: 'leave' }); await sleep(200); assert(s.last('closed')); console.log('  ✓ 實體玩家歸零 → 觀戰者收到 closed');
  [a, b, s].forEach((c) => c.ws.close()); hub.shutdown(); server.close(); console.log('online-check 通過'); process.exit(0);
})().catch((e) => { console.error('❌', e); process.exit(1); });
