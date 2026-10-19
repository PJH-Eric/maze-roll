// 真實瀏覽器 HUD 回歸檢查：node scripts/countdown-audit.js，開啟網址後按 Run countdown audit。
// 測試頁只在這個本機入口提供，不加入正式 public/ 內容，也不載入 GA4。
const fs = require('fs');
const path = require('path');
const { server } = require('../server.js');

const handlers = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url.split('?')[0] === '/countdown-audit.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(__dirname, 'fixtures/countdown-audit.html'), 'utf8'));
    return;
  }
  handlers.forEach((handler) => handler.call(server, req, res));
});

server.listen(3091, '127.0.0.1', () => {
  console.log('倒數回歸檢查：http://127.0.0.1:3091/countdown-audit.html');
});
