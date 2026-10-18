// 多語系檢查：介面文字（T('…')）、伺服器訊息、難度名稱都要有英文；變數佔位符兩邊一致；M() 能比對帶暱稱的訊息。
const fs = require('fs'), path = require('path'), assert = require('assert');
global.window = { MR: null };
require('../public/js/locales.js'); const EN = window.MR_EN;
const MR = require('../public/js/rules.js');
const ok = (m) => console.log('  ✓', m);
const files = fs.readdirSync(path.join(__dirname, '../public/js')).filter((f) => f.endsWith('.js') && !['i18n.js', 'locales.js', 't.js'].includes(f));
const keys = new Set();
for (const f of files) {
  const s = fs.readFileSync(path.join(__dirname, '../public/js', f), 'utf8');
  for (const m of s.matchAll(/\bT\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'").replace(/\\n/g, '\n'));
}
const need = [...keys, ...MR.DIFFS, ...MR.AI_NAMES, ...MR.DIFF_THEME.map((t) => t.wood), ...Object.values(MR.MODE_NAMES)];
const hub = fs.readFileSync(path.join(__dirname, '../lib/hub.js'), 'utf8');
for (const m of hub.matchAll(/(?:err\([^,]+,\s*[^,]+,\s*|_sys\(room,\s*|closeRoom\(room,\s*)'([^']*[一-鿿][^']*)'/g)) need.push(m[1]);
for (const m of hub.matchAll(/\+\s*\(?[^'+]*\?\s*'(\s*[^']*[一-鿿][^']*)'\s*:\s*'(\s*[^']*[一-鿿][^']*)'/g)) need.push('{name}' + m[1], '{name}' + m[2]);
const miss = [...new Set(need)].filter((k) => EN[k] === undefined && !/^\{name\}/.test(k));
assert.deepStrictEqual(miss, [], '缺少英文：' + miss.join(' | ')); ok(`${new Set(need).size} 條介面／伺服器文字都有英文`);
const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
for (const k of Object.keys(EN)) assert.strictEqual(vars(EN[k]), vars(k), '佔位符不一致：' + k); ok('英文與繁中的 {變數} 一致');
assert(MR.MODE_NAMES.race && EN['神話'] === 'Myth' && MR.DIFFS[4] === '神話'); ok('第五難度叫「神話」');
// M()：伺服器訊息比對
window.I18N = { lang: 'en' }; global.window.I18N = { lang: 'en' };
(async () => {
  const { M, T } = await import('../public/js/t.js');
  assert.strictEqual(M('小熊 加入了房間'), '小熊 joined the room'); ok('M()：帶暱稱的系統訊息可翻譯');
  assert.strictEqual(M('至少要 2 位玩家才能開始'), 'At least 2 players are needed to start');
  assert.strictEqual(T('第 {level} 關', { level: 7 }), 'Level 7'); assert.strictEqual(M('玩家亂打的字'), '玩家亂打的字'); ok('T() 代入變數；未知文字原樣顯示');
  window.I18N = { lang: 'zh-Hant' }; assert.strictEqual(T('第 {level} 關', { level: 7 }), '第 7 關'); ok('繁中直接顯示原文');
  console.log('多語系測試通過');
})().catch((e) => { console.error(e); process.exit(1); });
