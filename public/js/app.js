// 迷宮滾球：畫面與流程。所有可見元件皆為 ui.js 的自訂元件。
import { h, icon, Button, IconButton, Toggle, Slider, Chips, Select, ScrollArea, TextInput, Modal, toast, modalOpen, Key } from './ui.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { net, wsUrl } from './net.js';
import { BALL_COLORS, SHAPES, BALL_TYPES } from './scene.js';

const MR = window.MR;
const $app = document.getElementById('app');
const MODE_INFO = {
  race: { name: '同圖競速', sub: '同一座迷宮，先滾到終點旗的人贏', icon: 'flag' },
  stars: { name: '搶星星', sub: '90 秒內撿最多星星；被撿走會在別處重生', icon: 'star' },
  collapse: { name: '地板崩塌', sub: '踩過的磚會碎裂，掉下去就淘汰，最後留下的人贏', icon: 'crown' },
};
const DIFF_SUB = ['極小・很慢', '小迷宮', '中迷宮', '大迷宮', '巨大迷宮'];
const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + String(Math.floor(s % 60)).padStart(2, '0') + (s < 60 ? '.' + String(Math.floor((s % 1) * 10)) : ''); };
const fmtShort = (s) => (s >= 60 ? fmt(s) : s.toFixed(1) + ' 秒');
const myName = () => (store.get('name') || '').trim() || '你';

// ---------- 全域外框：設定入口（右上角）、回大廳（只在首頁）----------
const chrome = h('div', { class: 'chrome' });
const gearBtn = IconButton({ icon: 'gear', ariaLabel: '設定', class: 'gear', onClick: () => openSettings() });
const chromeRight = h('div', { class: 'chromeRight' }, gearBtn);
const lobbyLink = h('a', { class: 'btn lobbyLink', href: (window.MR_CONFIG && window.MR_CONFIG.lobbyUrl) || '#', 'aria-label': '回遊戲大廳' }, icon('home'), h('span', { text: '遊戲小小島' }));
chrome.append(lobbyLink, chromeRight);
const $screen = h('div', { class: 'screenHost' });
$app.append($screen, chrome);

let cleanup = null, current = '', ctx = {};
function go(name, params) {
  if (name === 'home' && session.room) net.send({ t: 'leave' }); // 回首頁一定離開房間，避免留下空殼房
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  Array.from(chromeRight.children).forEach((c) => { if (c !== gearBtn) c.remove(); });
  $screen.replaceChildren(); current = name; ctx = params || {};
  lobbyLink.style.display = name === 'home' ? '' : 'none';
  $app.dataset.screen = name;
  const fn = SCREENS[name]; const r = fn(ctx);
  if (typeof r === 'function') cleanup = r;
  audio.bgm(store.get('bgm') && audio.ready());
}
function topbar(title, onBack) {
  return h('header', { class: 'topbar' }, Button({ icon: 'back', label: '返回', size: 'small', onClick: onBack }), h('h1', { class: 'title', text: title }), h('span', { class: 'spacer' }));
}
const rc = (el, ...k) => el.replaceChildren(...k.flat().filter((x) => x != null && x !== false));
const panel = (...k) => h('div', { class: 'panel' }, ...k);

// 第一次使用者手勢：解鎖音訊
const unlock = () => { audio.unlock(); audio.bgm(store.get('bgm')); removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); };
addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.btn,.chip,.opt')) audio.click(); }, true);

// ---------- 設定彈窗 ----------
function openSettings() {
  audio.unlock();
  let m; const S = store;
  const rows = {
    bgm: Toggle({ label: '背景音樂', value: S.get('bgm'), onChange: (v) => { S.set('bgm', v); audio.bgm(v); } }),
    bgmVol: Slider({ label: '音樂音量', value: S.get('bgmVol'), onChange: (v) => S.set('bgmVol', v) }),
    sfx: Toggle({ label: '音效', value: S.get('sfx'), onChange: (v) => { S.set('sfx', v); if (v) audio.star(); } }),
    sfxVol: Slider({ label: '音效音量', value: S.get('sfxVol'), onChange: (v, commit) => { S.set('sfxVol', v); if (commit) audio.star(); } }),
    ctrl: Chips({ label: '操作方式', value: S.get('ctrl'), options: [{ value: 'stick', label: '虛擬搖桿' }, { value: 'drag', label: '手指拖曳' }, { value: 'tilt', label: '裝置傾斜' }], onChange: async (v) => { if (v === 'tilt') { const ok = await new Input().enableTilt(); if (!ok) { toast('此裝置無法使用傾斜，已改回搖桿'); S.set('ctrl', 'stick'); rows.ctrl.set('stick'); return; } } S.set('ctrl', v); } }),
    vib: Toggle({ label: '震動回饋', value: S.get('vib'), onChange: (v) => S.set('vib', v) }),
    cam: Chips({ label: '鏡頭距離', value: S.get('cam'), options: [{ value: 0, label: '近' }, { value: 1, label: '中' }, { value: 2, label: '遠' }], onChange: (v) => S.set('cam', v) }),
    minimap: Toggle({ label: '小地圖', value: S.get('minimap'), onChange: (v) => S.set('minimap', v) }),
    ball: Chips({ label: '球種', value: S.get('ball'), options: BALL_TYPES.map((b) => ({ value: b.id, label: b.name })), onChange: (v) => S.set('ball', v) }),
    trail: Toggle({ label: '滾動軌跡', value: S.get('trail'), onChange: (v) => S.set('trail', v) }),
    shapes: Toggle({ label: '色彩輔助（用形狀區分玩家）', value: S.get('shapes'), onChange: (v) => S.set('shapes', v) }),
    reduce: Toggle({ label: '減少動態（關閉粒子、晃動與浮動）', value: S.get('reduce'), onChange: (v) => S.set('reduce', v) }),
  };
  const sect = (t, ...k) => h('section', { class: 'sect' }, h('h3', { text: t }), ...k);
  const body = h('div', { class: 'settings' },
    sect('聲音', rows.bgm, rows.bgmVol, rows.sfx, rows.sfxVol),
    sect('操作', h('div', { class: 'rowStack' }, h('span', { class: 'rowLabel', text: '操作方式' }), rows.ctrl), rows.vib, h('p', { class: 'hint' }, '鍵盤：', Key('W'), Key('A'), Key('S'), Key('D'), ' 或方向鍵都能操作。')),
    sect('畫面與輔助', h('div', { class: 'rowStack' }, h('span', { class: 'rowLabel', text: '鏡頭距離' }), rows.cam), h('div', { class: 'rowStack' }, h('span', { class: 'rowLabel', text: '球種（自己的球）' }), rows.ball), rows.trail, rows.minimap, rows.shapes, rows.reduce));
  const g = activeGame && !activeGame.online && activeGame.state === 'play' && !activeGame.paused ? activeGame : null;
  if (g) g.pause(true);
  m = Modal({
    title: '設定', body, class: 'settingsModal', onClose: () => { if (g && activeGame === g) g.pause(false); },
    actions: [Button({ label: '恢復預設', onClick: () => { S.reset(); m.close('reset'); toast('已恢復預設設定'); audio.bgm(S.get('bgm')); } }), Button({ label: '完成', variant: 'primary', onClick: () => m.close('ok') })],
  });
  return m;
}

function openHow() {
  const sec = (t, ...k) => h('section', { class: 'sect' }, h('h3', { text: t }), ...k);
  const m = Modal({
    title: '怎麼玩', class: 'howModal',
    body: h('div', { class: 'how' },
      sec('基本操作', h('p', {}, '推動搖桿（或按 ', Key('W'), Key('A'), Key('S'), Key('D'), '／方向鍵）讓球往那個方向滾。牆會擋住球，撞牆會減速，慢慢控制比硬衝更快。')),
      sec('同圖競速', h('p', { text: '所有人用同一座迷宮、從同一個起點出發，先滾進終點旗洞的人贏。第一名到達後，其他人還有 15 秒可以衝線；球和球不會互相碰撞，可以穿過去。' })),
      sec('搶星星', h('p', { text: '迷宮裡散落著星星，碰到就得 1 分，星星被撿走後會在別處重新出現。90 秒內分數最高的人贏；同分時，比較早拿到最後一顆的人名次較前。' })),
      sec('地板崩塌', h('p', { text: '你踩過的地磚會先晃動，接著碎裂掉下去。一直停在原地也會掉！規劃好路線，不要把自己困在死路裡，最後還站著的人贏。拖太久時，場地會自己隨機碎裂。' })),
      sec('闖關模式', h('p', { text: '五種難度各 100 關，依序解鎖。依完成時間評 1～3 顆星。' })),
      sec('線上對戰', h('p', { text: '每房最多 4 位玩家、20 位觀戰者。房主可以複製邀請連結給朋友；朋友打開連結後確認暱稱就能加入。觀戰者可以看全場並聊天。' }))),
    actions: [Button({ label: '知道了', variant: 'primary', onClick: () => m.close('ok') })],
  });
}

// ---------- 畫面：首頁 ----------
const LOGO = '<svg viewBox="0 0 200 120" aria-hidden="true"><rect x="8" y="8" width="184" height="104" rx="12" fill="#e2b97c" stroke="#3b2417" stroke-width="6"/><path d="M30 94V30h40v44h30V30h40v54h20M70 94h30M130 94V74" fill="none" stroke="#8a5330" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="52" cy="52" r="13" fill="#d94a3d" stroke="#7a2018" stroke-width="2"/><path d="M43 48a10 10 0 0 1 8-6" fill="none" stroke="#fff" stroke-width="3.500" stroke-linecap="round" opacity=".85"/><path d="M168 30v22" stroke="#f4ead2" stroke-width="3"/><path d="M168 30l16 6-16 6z" fill="#d4473a"/></svg>';
function menuBtn(ic, title, sub, onClick, variant) {
  return h('button', { type: 'button', class: 'btn big ' + (variant || ''), on: { click: onClick } }, icon(ic), h('span', { class: 'tx' }, h('b', { text: title }), h('small', { text: sub })));
}
function homeScreen() {
  $screen.append(h('section', { class: 'screen home' },
    ScrollArea(h('div', { class: 'homeIn' },
      h('div', { class: 'logo', html: LOGO }),
      h('h1', { class: 'gameTitle', text: '迷宮滾球' }),
      h('p', { class: 'sub', text: '3D 木質迷宮・推著小球衝向終點' }),
      h('div', { class: 'menu' },
        menuBtn('flag', '闖關模式', '單人・五種難度各 100 關', () => go('levels'), 'primary'),
        menuBtn('star', '自由練習', '一個人・三種玩法・計時', () => go('setup', { kind: 'practice' })),
        menuBtn('people', '對電腦', '1～7 位電腦・各自選難度', () => go('setup', { kind: 'vsai' })),
        menuBtn('link', '線上對戰', '最多 4 人・觀戰・邀請連結', () => go('online')),
        Button({ label: '怎麼玩', variant: 'ghost', onClick: openHow }))), { class: 'homeScroll' })));
}

// ---------- 畫面：闖關 ----------
function levelsScreen(p) {
  const NEED = MR.DIFF_UNLOCK_STARS, dOpen = (i) => store.diffUnlocked(i, NEED);
  let diff = p.diff != null && dOpen(p.diff) ? p.diff : Math.max(0, MR.DIFFS.findIndex((_, i) => dOpen(i) && store.levelStars(i).filter((x) => x > 0).length < 100));
  const grid = h('div', { class: 'levelGrid' }), prog = h('p', { class: 'note' });
  const sa = ScrollArea(h('div', { class: 'levelWrap' }, grid), { class: 'levelScroll', label: '關卡列表' });
  const draw = () => {
    const stars = store.levelStars(diff), un = store.unlockedLevel(diff), done = stars.filter((x) => x > 0).length, tot = stars.reduce((a, b) => a + b, 0);
    grid.dataset.diff = String(diff); grid.style.setProperty('--dtheme', MR.DIFF_THEME[diff].accent);
    const nx = diff < 4 ? (dOpen(diff + 1) ? `　${MR.DIFFS[diff + 1]}已開放` : `　再 ${NEED - tot} 顆星開放${MR.DIFFS[diff + 1]}`) : '';
    prog.textContent = `${MR.DIFF_THEME[diff].wood}・已通過 ${done}/100 關・共 ${tot} 顆星${nx}・迷宮大小 ${MR.levelSize(diff, 1)}×${MR.levelSize(diff, 1)} ～ ${MR.levelSize(diff, 100)}×${MR.levelSize(diff, 100)}`;
    grid.replaceChildren();
    for (let n = 1; n <= 100; n++) {
      const locked = n > un, s = stars[n - 1] || 0;
      const b = h('button', { type: 'button', class: 'lv' + (locked ? ' locked' : '') + (s ? ' done' : '') + (n === un ? ' next' : ''), disabled: locked || null, 'aria-label': `第 ${n} 關${locked ? '（未解鎖）' : s ? `，${s} 顆星` : ''}` },
        h('b', { text: String(n) }), locked ? icon('lock') : h('span', { class: 'stars', text: '★'.repeat(s) + '☆'.repeat(3 - s) }));
      if (!locked) b.addEventListener('click', () => startLocal({ kind: 'level', mode: 'race', diff, level: n, ais: [] }));
      grid.append(b);
      if (n === un) setTimeout(() => b.scrollIntoView({ block: 'center' }), 30);
    }
  };
  const chips = Chips({ label: '難度', value: diff, options: MR.DIFFS.map((d, i) => ({ value: i, label: d, disabled: !dOpen(i), sub: dOpen(i) ? MR.DIFF_THEME[i].wood : `需 ${NEED} 顆星` })), onChange: (v) => { diff = v; draw(); sa.view.scrollTop = 0; } });
  $screen.append(h('section', { class: 'screen levels' }, topbar('闖關模式', () => go('home')), h('div', { class: 'body' }, panel(chips, prog, sa))));
  draw();
}

// ---------- 畫面：自由練習／對電腦 設定 ----------
function setupScreen(p) {
  const vsai = p.kind === 'vsai', S = { mode: p.mode || 'race', diff: p.diff != null ? p.diff : 1, ai: p.ai || [1], count: p.ai ? p.ai.length : 1 };
  const best = h('p', { class: 'note best' }), compList = h('div', { class: 'comps' }), countLbl = h('b', { class: 'count' });
  const modeDesc = h('p', { class: 'note', text: MODE_INFO[S.mode].sub });
  const showBest = () => {
    if (vsai) return;
    const v = store.getBest(S.mode + '-' + S.diff);
    best.textContent = v == null ? '還沒有紀錄，來挑戰看看！' : S.mode === 'race' ? `本機最佳：${fmtShort(v)}` : S.mode === 'stars' ? `本機最佳：${v} 顆星星` : `本機最佳：存活 ${v.toFixed(1)} 秒`;
  };
  const drawComps = () => {
    countLbl.textContent = S.count + ' 位電腦'; compList.replaceChildren();
    for (let i = 0; i < S.count; i++) {
      compList.append(h('div', { class: 'comp' }, h('span', { class: 'dot', style: { background: BALL_COLORS[(i + 1) % 8] } }), h('span', { class: 'cname', text: '電腦 ' + (i + 1) }),
        Select({ label: `電腦 ${i + 1} 難度`, value: S.ai[i] != null ? S.ai[i] : 1, options: MR.AI_NAMES.map((n, k) => ({ value: k, label: n })), onChange: (v) => { S.ai[i] = v; } })));
    }
  };
  const modeChips = Chips({ label: '玩法', value: S.mode, options: MR.MODES.map((m) => ({ value: m, label: MODE_INFO[m].name, icon: MODE_INFO[m].icon })), onChange: (v) => { S.mode = v; modeDesc.textContent = MODE_INFO[v].sub; showBest(); } });
  const diffChips = Chips({ label: '迷宮難度', value: S.diff, options: MR.DIFFS.map((d, i) => ({ value: i, label: d, sub: DIFF_SUB[i] })), onChange: (v) => { S.diff = v; showBest(); } });
  const stepper = vsai ? h('div', { class: 'stepper' }, IconButton({ icon: 'minus', ariaLabel: '減少一位電腦', onClick: () => { if (S.count > 1) { S.count--; drawComps(); } } }), countLbl, IconButton({ icon: 'plus', ariaLabel: '增加一位電腦', onClick: () => { if (S.count < 7) { S.count++; while (S.ai.length < S.count) S.ai.push(1); drawComps(); } } })) : null;
  const sections = [h('h3', { text: '玩法' }), modeChips, modeDesc, h('h3', { text: '迷宮難度' }), diffChips, vsai ? h('h3', { text: '電腦對手' }) : best, vsai ? stepper : null, vsai ? compList : null];
  $screen.append(h('section', { class: 'screen setup' }, topbar(vsai ? '對電腦' : '自由練習', () => go('home')),
    h('div', { class: 'body' }, panel(ScrollArea(h('div', { class: 'setupBody' }, ...sections), { class: 'setupScroll' }),
      h('div', { class: 'panelActions' }, Button({ label: '開始遊戲', variant: 'primary', size: 'big', onClick: () => startLocal({ kind: p.kind, mode: S.mode, diff: S.diff, ais: vsai ? S.ai.slice(0, S.count) : [] }) }))))));
  showBest(); if (vsai) drawComps();
}

// ---------- 單機開局 ----------
function startLocal(cfg) {
  const players = [{ id: 'me', name: myName(), kind: 'human' }];
  cfg.ais.forEach((lv, i) => players.push({ id: 'ai' + (i + 1), name: `電腦${i + 1}・${MR.AI_NAMES[lv]}`, kind: 'ai', ai: lv }));
  let seed, size;
  if (cfg.kind === 'level') { seed = MR.levelSeed(cfg.diff, cfg.level); size = MR.levelSize(cfg.diff, cfg.level); } else seed = (Math.random() * 4294967296) >>> 0;
  go('game', { local: true, cfg, players, mode: cfg.mode, diff: cfg.diff, seed, size, meId: 'me' });
}

// ---------- 線上：共用 session（任何畫面都能收到房間／聊天更新）----------
const session = { room: null, you: null, role: null, chat: [], unread: 0, subs: new Set(), init: null, fallback: false };
net.on((m) => {
  if (m.t === 'room') { session.room = m.room; session.you = m.you; session.role = m.role; }
  else if (m.t === 'joined') { session.chat = []; session.unread = 0; session.fallback = !!m.fallback; session.init = null; }
  else if (m.t === 'chat') { session.chat.push(m); if (session.chat.length > 80) session.chat.shift(); if (!m.sys && m.from !== session.you) session.unread++; }
  else if (m.t === 'left' || m.t === 'closed') { session.room = null; session.role = null; session.init = null; }
  else if (m.t === 'init') session.init = m;
  [...session.subs].forEach((f) => f(m));
  if (m.t === 'room' && current === 'online') go('room');
  if ((m.t === 'closed' || m.t === 'left') && (current === 'room' || current === 'game')) {
    go('online', { notice: m.t === 'closed' ? (m.reason || '房間已結束') : m.why === 'kicked' ? '你被房主請出房間了' : '' });
  }
  if (m.t === 'init' && (current === 'room')) go('game', { online: true, init: m });
});
const inviteLink = (kind) => { const r = session.room; if (!r || !r.invite) return ''; return location.origin + location.pathname + '#/join/' + r.code + '/' + (kind === 'spec' ? r.invite.ts : r.invite.tp); };
function copyText(text) {
  const done = () => toast('已複製連結');
  const fallback = () => { const m = Modal({ title: '複製連結', body: h('div', {}, h('p', { class: 'note', text: '請長按選取下面的連結後複製：' }), h('div', { class: 'linkBox', text })), actions: [Button({ label: '完成', variant: 'primary', onClick: () => m.close() })] }); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}

// ---------- 聊天元件 ----------
const QUICK = ['加油！', '好險～', '漂亮！', '再來一局！', 'GG'];
function ChatBox() {
  const list = h('div', { class: 'chatList', role: 'log', 'aria-live': 'polite' });
  const sa = ScrollArea(list, { class: 'chatScroll', label: '聊天訊息' });
  const input = TextInput({ placeholder: '輸入訊息…', maxLength: 80, label: '聊天輸入', enter: 'send', onEnter: () => send() });
  const send = () => { const t = input.value.trim(); if (!t) return; net.send({ t: 'chat', text: t }); input.value = ''; };
  const draw = () => {
    list.replaceChildren(...session.chat.slice(-60).map((c) => c.sys ? h('div', { class: 'msg sys', text: c.text }) :
      h('div', { class: 'msg' + (c.from === session.you ? ' mine' : '') }, h('b', { text: c.name + (c.role === 'spec' ? '（觀戰）' : '') }), h('span', { text: c.text }))));
    requestAnimationFrame(() => sa.scrollToEnd());
  };
  const root = h('div', { class: 'chatBox' }, sa,
    h('div', { class: 'quick' }, QUICK.map((q) => Button({ label: q, size: 'tiny', onClick: () => net.send({ t: 'chat', text: q }) }))),
    h('div', { class: 'chatIn' }, input, Button({ label: '送出', size: 'small', variant: 'primary', onClick: send })));
  root.draw = draw; draw();
  return root;
}

// ---------- 畫面：線上大廳 ----------
const MODE_SHORT = { race: '競速', stars: '搶星星', collapse: '崩塌' };
function onlineScreen(p) {
  let rooms = [], invite = p.invite || null, peek = null, joining = false;
  const status = h('div', { class: 'status' });
  const nameIn = TextInput({ placeholder: '輸入暱稱（可留空）', maxLength: 12, value: store.get('name'), label: '暱稱', onInput: (v) => store.set('name', v.trim()) });
  const listEl = h('div', { class: 'roomList' });
  const inviteBox = h('div', { class: 'inviteBox' });
  const notice = p.notice ? h('p', { class: 'notice', role: 'alert', text: p.notice }) : null;
  const nm = () => nameIn.value.trim();
  const drawStatus = () => {
    const st = net.state, map = { idle: '尚未連線', connecting: '連線中…（伺服器第一次喚醒可能要等幾十秒）', reconnecting: '重新連線中…', online: '已連線', offline: '無法連線', nourl: '尚未設定線上伺服器' };
    status.className = 'status ' + st; status.textContent = map[st] || st;
  };
  const drawRooms = () => {
    listEl.replaceChildren();
    if (net.state === 'nourl') { listEl.append(h('p', { class: 'empty', text: '這個版本還沒有設定線上伺服器（GAME_SERVER_URL），目前只能玩單機模式。' })); return; }
    if (!rooms.length) { listEl.append(h('p', { class: 'empty', text: net.state === 'online' ? '目前沒有房間。按「快速加入」會自動幫你開一間！' : '連線後會顯示房間列表。' })); return; }
    for (const r of rooms) {
      const full = r.players >= r.max || r.state !== 'waiting';
      listEl.append(h('div', { class: 'roomRow' },
        h('div', { class: 'ri' }, h('b', { text: r.host + ' 的房間' }), h('small', { text: `${MODE_SHORT[r.mode]}・${MR.DIFFS[r.diff]}・${r.state === 'waiting' ? '等待中' : '遊戲中'}・${r.players}/${r.max} 人${r.specs ? '・' + r.specs + ' 人觀戰' : ''}` })),
        Button({ label: '加入', size: 'small', variant: 'primary', disabled: full || joining, onClick: () => net.send({ t: 'join', code: r.code, name: nm(), role: 'player' }) }),
        Button({ label: '觀戰', size: 'small', icon: 'eye', onClick: () => net.send({ t: 'join', code: r.code, name: nm(), role: 'spec' }) })));
    }
  };
  const drawInvite = () => {
    inviteBox.replaceChildren(); if (!invite) return;
    const bad = { invalid: '邀請連結無效，請向朋友再要一次。', revoked: '這個邀請連結已被房主撤銷，請向朋友再要一個新的。', closed: '這個房間已經結束了。' };
    if (peek && !peek.ok) { inviteBox.append(h('div', { class: 'inviteCard bad' }, h('p', { text: bad[peek.reason] || '無法使用這個邀請。' }), Button({ label: '知道了', onClick: () => { invite = null; peek = null; clearHash(); drawInvite(); } }))); return; }
    if (!peek) { inviteBox.append(h('div', { class: 'inviteCard' }, h('p', { text: net.state === 'online' ? '正在確認邀請…' : '連線後會確認邀請…' }))); return; }
    const r = peek.room;
    inviteBox.append(h('div', { class: 'inviteCard' },
      h('h3', { text: '你收到房間邀請' }),
      h('p', { text: `${r.host} 的房間・${MODE_SHORT[r.mode]}・${MR.DIFFS[r.diff]}・${r.players}/${r.max} 人` }),
      h('p', { class: 'note', text: peek.role === 'spec' ? '你將以「觀戰者」身分加入。確認暱稱後按加入。' : r.state === 'waiting' ? '你將以「玩家」身分加入。確認暱稱後按加入。' : '遊戲進行中，你會先以觀戰者身分加入。' }),
      Button({ label: peek.role === 'spec' ? '確認並觀戰' : '確認並加入', variant: 'primary', onClick: () => { joining = true; net.send({ t: 'join', code: invite.code, token: invite.token, name: nm() }); } })));
  };
  const clearHash = () => { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 略 */ } };
  const sub = (m) => {
    if (m.t === '_state') { drawStatus(); drawRooms(); if (m.state === 'online' && invite && !peek) net.send({ t: 'peek', code: invite.code, token: invite.token }); drawInvite(); }
    else if (m.t === 'rooms') { rooms = m.rooms; drawRooms(); }
    else if (m.t === 'peek') { peek = m; drawInvite(); }
    else if (m.t === 'joined') { clearHash(); }
    else if (m.t === 'err') { joining = false; toast(m.msg || '發生錯誤'); if (invite && ['invalid', 'revoked', 'closed'].includes(m.code)) { peek = { ok: false, reason: m.code }; drawInvite(); } drawRooms(); }
  };
  net.on(sub); const off = () => net.handlers.delete(sub);
  const createRoom = () => {
    let mode = 'race', diff = 2, mm;
    const body = h('div', {}, h('h3', { text: '玩法' }), Chips({ label: '玩法', value: mode, options: MR.MODES.map((m) => ({ value: m, label: MODE_INFO[m].name })), onChange: (v) => { mode = v; } }),
      h('h3', { text: '迷宮難度' }), Chips({ label: '難度', value: diff, options: MR.DIFFS.map((d, i) => ({ value: i, label: d })), onChange: (v) => { diff = v; } }), h('p', { class: 'note', text: '進房後房主還可以再調整。' }));
    mm = Modal({ title: '建立房間', body, actions: [Button({ label: '取消', onClick: () => mm.close() }), Button({ label: '建立', variant: 'primary', onClick: () => { net.send({ t: 'create', name: nm(), mode, diff }); mm.close(); } })] });
  };
  $screen.append(h('section', { class: 'screen online' }, topbar('線上對戰', () => go('home')),
    h('div', { class: 'body' }, panel(ScrollArea(h('div', { class: 'onlineBody' },
      notice, status, inviteBox,
      h('div', { class: 'nickRow' }, h('label', { class: 'rowLabel', text: '暱稱' }), nameIn),
      h('div', { class: 'row2' },
        Button({ label: '快速加入', variant: 'primary', icon: 'flag', onClick: () => net.send({ t: 'quick', name: nm() }) }),
        Button({ label: '建立房間', icon: 'plus', onClick: createRoom }),
        Button({ label: '重新整理', size: 'small', onClick: () => net.send({ t: 'rooms' }) })),
      h('h3', { text: '公開房間' }), listEl), { class: 'onlineScroll' })))));
  net.connect(nm()); drawStatus(); drawRooms(); drawInvite();
  if (net.state === 'online') { net.send({ t: 'rooms' }); if (invite && !peek) net.send({ t: 'peek', code: invite.code, token: invite.token }); }
  return off;
}

// ---------- 畫面：房間 ----------
function roomScreen() {
  if (!session.room) { go('online'); return; }
  const chat = ChatBox();
  const seats = h('div', { class: 'seats' }), specs = h('div', { class: 'specs' }), actions = h('div', { class: 'panelActions' }), head = h('div', { class: 'roomHead' }), settings = h('div', { class: 'roomSettings' }), inviteEl = h('div', { class: 'inviteRow' });
  const draw = () => {
    const r = session.room; if (!r) return;
    const isHost = r.host === session.you, me = r.members.find((m) => m.id === session.you), isPlayer = me && me.role === 'player';
    const players = r.members.filter((m) => m.role === 'player'), sp = r.members.filter((m) => m.role === 'spec');
    rc(head, h('div', {}, h('small', { text: '房間代碼' }), h('b', { class: 'code', text: r.code })), Button({ label: '離開房間', size: 'small', onClick: () => { net.send({ t: 'leave' }); go('online'); } }));
    rc(settings,
      h('h3', { text: '玩法' }), Chips({ label: '玩法', value: r.mode, options: MR.MODES.map((m) => ({ value: m, label: MODE_INFO[m].name, disabled: !isHost })), onChange: (v) => net.send({ t: 'set', mode: v }) }),
      h('p', { class: 'note', text: MODE_INFO[r.mode].sub }),
      h('h3', { text: '迷宮難度' }), Chips({ label: '難度', value: r.diff, options: MR.DIFFS.map((d, i) => ({ value: i, label: d, disabled: !isHost })), onChange: (v) => net.send({ t: 'set', diff: v }) }),
      isHost ? null : h('p', { class: 'note', text: '只有房主能更改設定。' }));
    seats.replaceChildren();
    for (let i = 0; i < r.max; i++) {
      const m = players[i];
      seats.append(m ? h('div', { class: 'seat' + (m.ready || m.id === r.host ? ' ready' : '') + (m.online ? '' : ' off') },
        h('span', { class: 'dot', style: { background: BALL_COLORS[i % 8] } }), h('span', { class: 'sname', text: m.name + (m.id === session.you ? '（你）' : '') }),
        m.id === r.host ? h('span', { class: 'tag', title: '房主' }, icon('crown'), '房主') : h('span', { class: 'tag', text: m.ready ? '已準備' : '未準備' }),
        !m.online ? h('span', { class: 'tag warn', text: '斷線中' }) : null,
        isHost && m.id !== session.you ? Button({ label: '請出', size: 'tiny', onClick: () => net.send({ t: 'kick', id: m.id }) }) : null)
        : h('div', { class: 'seat empty' }, h('span', { class: 'dot' }), h('span', { class: 'sname', text: '等待玩家加入…' })));
    }
    rc(specs, h('h3', {}, icon('eye'), ` 觀戰 ${sp.length}/${r.maxSpecs}`), sp.length ? h('p', { class: 'note', text: sp.map((m) => m.name + (m.id === session.you ? '（你）' : '')).join('、') }) : h('p', { class: 'note', text: '還沒有人觀戰' }));
    inviteEl.replaceChildren();
    if (r.invite) inviteEl.append(h('h3', { text: '邀請朋友' }), h('div', { class: 'row2' }, Button({ label: '複製加入連結', icon: 'copy', size: 'small', onClick: () => copyText(inviteLink('player')) }), Button({ label: '複製觀戰連結', icon: 'eye', size: 'small', onClick: () => copyText(inviteLink('spec')) }), isHost ? Button({ label: '撤銷並重發', size: 'small', onClick: () => net.send({ t: 'invite', act: 'revoke' }) }) : null));
    actions.replaceChildren();
    if (!isPlayer) actions.append(h('p', { class: 'note', text: session.fallback ? '房間已滿或已開始，你目前是觀戰者。' : '你是觀戰者：可以看全場並聊天。' }));
    else if (isHost) { const ok = players.length >= 2 && players.every((m) => m.id === r.host || m.ready); actions.append(Button({ label: ok ? '開始遊戲' : players.length < 2 ? '至少需要 2 位玩家' : '等待大家準備', variant: 'primary', size: 'big', disabled: !ok, onClick: () => net.send({ t: 'start' }) })); }
    else actions.append(Button({ label: me.ready ? '取消準備' : '準備好了', variant: me.ready ? '' : 'primary', size: 'big', onClick: () => net.send({ t: 'ready', v: !me.ready }) }));
  };
  const sub = (m) => { if (m.t === 'room') draw(); else if (m.t === 'chat') { chat.draw(); session.unread = 0; audio.chat(); } else if (m.t === 'err') toast(m.msg); };
  session.subs.add(sub); session.unread = 0;
  $screen.append(h('section', { class: 'screen room' }, topbar('房間', () => { net.send({ t: 'leave' }); go('online'); }),
    h('div', { class: 'body roomBody' }, h('aside', { class: 'panelSide roomChat' }, h('h3', { text: '聊天室' }), chat),
      panel(ScrollArea(h('div', { class: 'roomMain' }, head, settings, h('h3', { text: '玩家' }), seats, specs, inviteEl), { class: 'roomScroll' }), actions))));
  draw();
  return () => session.subs.delete(sub);
}

// ---------- 畫面：遊戲 ----------
let activeGame = null;
function gameScreen(p) {
  const online = !!p.online;
  let players, meId, mode, diff, seed, size, snapshot = null, cfg = p.cfg || null;
  if (online) {
    const init = p.init; players = init.players.map((x) => ({ id: x.id, name: x.name, kind: 'remote' }));
    meId = session.role === 'player' && players.some((x) => x.id === session.you) ? session.you : null;
    mode = init.mode; diff = init.diff; seed = init.seed; size = init.size;
    if (init.resume) snapshot = { snap: init.snap, stars: init.stars, tiles: init.tiles, state: init.state, tt: init.tt };
  } else { players = p.players; meId = p.meId; mode = p.mode; diff = p.diff; seed = p.seed; size = p.size; }
  size = size || MR.SIZE[mode][diff];
  const who = (name, me) => (me && name !== '你' ? name + '（你）' : name);

  const input = new Input(); input.setScheme(store.get('ctrl'));
  const canvas = h('canvas', { class: 'cv', role: 'img', 'aria-label': '3D 迷宮遊戲畫面' });
  const hudMode = h('span', { class: 'hmode' }), hudTime = h('b', { class: 'htime', text: '0:00' }), hudExtra = h('span', { class: 'hextra' });
  const hudTop = h('div', { class: 'hudTop' }, hudMode, hudTime, hudExtra);
  const mini = h('canvas', { class: 'mini', width: 180, height: 180, 'aria-hidden': 'true' });
  const knob = h('div', { class: 'knob' }), stick = h('div', { class: 'stick', 'aria-label': '虛擬搖桿' }, knob), stickZone = h('div', { class: 'stickZone' }, stick);
  const countEl = h('div', { class: 'countdown', 'aria-live': 'assertive' }), banner = h('div', { class: 'banner', hidden: true });
  const badge = h('span', { class: 'badge', hidden: true });
  const sideTab = h('button', { type: 'button', class: 'btn sideTab', 'aria-label': '開關對局資訊', 'aria-expanded': 'true' }, icon(online ? 'chat' : 'people'), badge);
  const arena = h('div', { class: 'arena' }, canvas, hudTop, mini, stickZone, countEl, banner, sideTab);
  const sumList = h('div', { class: 'sumList' });
  const lvTxt = cfg && cfg.kind === 'level' ? `第 ${cfg.level} 關` : '';
  const sumHead = h('div', { class: 'sumHead' }, h('b', { text: MODE_INFO[mode].name }), h('small', { text: `${MR.DIFFS[diff]}${lvTxt ? '・' + lvTxt : ''}・${size}×${size}` }));
  const chat = online ? ChatBox() : null;
  const side = h('aside', { class: 'panelSide gameSide' }, h('div', { class: 'sideTop' }, sumHead, ScrollArea(sumList, { class: 'sumScroll', label: '排行' })), chat ? h('div', { class: 'sideChat' }, h('h3', { text: '聊天室' }), chat) : null);
  const root = h('section', { class: 'screen gameScreen' + (online ? ' online' : '') + (online ? '' : ' local') }, side, arena);
  $screen.append(root);

  // 版面：寬版左側欄可收合；窄版／直向改為左側抽屜
  const mq = matchMedia('(max-width: 899px), (max-aspect-ratio: 1/1)');
  let sideOpen = !mq.matches;
  const layout = () => { root.classList.toggle('narrow', mq.matches); root.classList.toggle('sideOpen', sideOpen); sideTab.setAttribute('aria-expanded', String(sideOpen)); if (sideOpen) { session.unread = 0; badge.hidden = true; } };
  const onMq = () => { sideOpen = !mq.matches; layout(); };
  mq.addEventListener('change', onMq);
  sideTab.addEventListener('click', () => { sideOpen = !sideOpen; layout(); });
  const miniOn = () => { mini.style.display = store.get('minimap') ? '' : 'none'; };

  let game, resultM = null, pauseM = null, last = null, finished = false;
  const showBanner = (text, btn) => { banner.hidden = false; rc(banner, h('b', { text }), btn); };
  const hooks = {
    onCount(n) { countEl.textContent = n == null ? '' : n === 0 ? '出發！' : String(n); countEl.classList.toggle('go', n === 0); countEl.style.display = n == null ? 'none' : ''; },
    onMe(state, e) {
      if (state === 'finished') showBanner(`抵達終點！第 ${e.place} 名`, null);
      else if (state === 'out') showBanner('你掉下去了…', !online && game.world.players.some((q) => q.alive) ? Button({ label: '直接看結果', size: 'small', onClick: () => { game.fastForward(); banner.hidden = true; } }) : h('small', { text: '可以繼續觀戰' }));
    },
    onHud(hd) {
      last = hd; const w = game.world;
      hudMode.textContent = MODE_INFO[mode].name;
      hudTime.textContent = hd.left != null ? fmt(hd.left) : fmt(hd.t);
      hudTime.classList.toggle('warn', hd.left != null && hd.left < 10);
      let ex = '';
      if (mode === 'race' && hd.grace != null && hd.grace > 0) ex = `衝線倒數 ${Math.ceil(hd.grace)} 秒`;
      else if (mode === 'collapse') ex = `剩 ${hd.alive} 人`;
      else if (mode === 'stars') { const me = game.me(); ex = me ? `你 ${me.score} ★` : ''; }
      hudExtra.textContent = ex;
      const shapes = store.get('shapes');
      sumList.replaceChildren(...hd.rows.map((r) => {
        const val = mode === 'race' ? (r.done ? fmt(r.fin) : r.alive ? '剩 ' + Math.round(r.rem) + ' 格' : '') : mode === 'stars' ? r.score + ' ★' : r.alive ? '存活' : '淘汰';
        return h('button', { type: 'button', class: 'srow' + (r.me ? ' me' : '') + (r.id === hd.follow ? ' fol' : '') + (r.alive ? '' : ' dead'), 'aria-label': `第 ${r.rank} 名 ${r.name} ${val}，點一下鏡頭跟隨`, on: { click: () => game.setFollow(r.me ? null : r.id) } },
          h('span', { class: 'rk', text: String(r.rank) }), h('span', { class: 'dot', style: { background: BALL_COLORS[r.idx % 8] }, text: shapes ? SHAPES[r.idx % 8] : '' }),
          h('span', { class: 'nm', text: who(r.name, r.me) }), h('span', { class: 'val', text: val }));
      }));
    },
    onEnd(info) { showResults(info); },
  };
  game = new Game({ canvas, mode, diff, seed, size, players, meId, online: online ? { net } : null, input, minimapEl: mini, hooks, snapshot });
  activeGame = game; window.__MRGAME = game;
  input.attach(arena, stick); miniOn(); layout();
  if (!meId) { stickZone.style.display = 'none'; input.enabled = false; }
  hooks.onCount(null);
  game._hud();
  if (online) { if (!snapshot || snapshot.state === 'count') { /* 等待伺服器倒數 */ } } else game.startCountdown();
  if (!online) {
    const pb = IconButton({ icon: 'pause', ariaLabel: '暫停', onClick: () => openPause() });
    chromeRight.insertBefore(pb, gearBtn);
  }

  function openPause() {
    if (pauseM || online || game.state !== 'play') return;
    game.pause(true); let why = 'resume';
    pauseM = Modal({
      title: '暫停', class: 'pauseModal', body: h('p', { class: 'note', text: '遊戲已暫停。' }),
      actions: [Button({ label: '繼續', variant: 'primary', onClick: () => pauseM.close('resume') }), Button({ label: '重新開始', onClick: () => { why = 'restart'; pauseM.close('restart'); againLocal(); } }), Button({ label: '回到首頁', onClick: () => { why = 'home'; pauseM.close('home'); go('home'); } })],
      onClose: (w) => { pauseM = null; if (w !== 'restart' && w !== 'home' && activeGame === game) game.pause(false); },
    });
  }
  const againLocal = () => { if (cfg) startLocal(cfg); };
  const backLocal = () => { if (!cfg) return go('home'); if (cfg.kind === 'level') go('levels', { diff: cfg.diff }); else go('setup', { kind: cfg.kind, mode: cfg.mode, diff: cfg.diff, ai: cfg.ais && cfg.ais.length ? cfg.ais : undefined }); };

  function showResults(info) {
    const { world, results, mine } = info, solo = world.players.length === 1;
    let title, lines = [], extra = [], nextBtn = null;
    const mineP = meId ? world.byId.get(meId) : null;
    if (!meId) title = '本局結束';
    else if (mode === 'race') title = mine && mine.dnf ? '時間到，沒能抵達終點' : solo ? '抵達終點！' : mine.place === 1 ? '你第一個抵達！' : `第 ${mine.place} 名`;
    else if (mode === 'stars') title = solo ? '時間到！' : mine.place === 1 ? '你是星星王！' : `第 ${mine.place} 名`;
    else title = solo ? '掉下去了…' : mine.alive ? '你是最後的贏家！' : mine.place === 1 ? '你贏了！' : `第 ${mine.place} 名`;
    // 紀錄與闖關進度（只有單機）
    if (!online && mineP) {
      if (cfg && cfg.kind === 'level' && mode === 'race' && mine && !mine.dnf) {
        const st = MR.levelStars(mine.time, world.maze), saved = store.setLevelStars(cfg.diff, cfg.level, st);
        lines.push(h('p', { class: 'stars big', text: '★'.repeat(st) + '☆'.repeat(3 - st) }), h('p', { class: 'note', text: `完成時間 ${fmtShort(mine.time)}（3 星：${fmtShort(MR.levelPar(world.maze) * 1.35)} 內，2 星：${fmtShort(MR.levelPar(world.maze) * 2.2)} 內）` }));
        if (cfg.level < 100) nextBtn = Button({ label: `下一關（第 ${cfg.level + 1} 關）`, variant: 'primary', onClick: () => { resultM.close(); startLocal(Object.assign({}, cfg, { level: cfg.level + 1 })); } });
        else lines.push(h('p', { class: 'note', text: '這個難度的 100 關全部通過了！' }));
      } else if (cfg && cfg.kind === 'practice' && mine) {
        const key = mode + '-' + diff; let nb = false, val = '';
        if (mode === 'race' && !mine.dnf) { nb = store.recordBest(key, mine.time, true); val = fmtShort(mine.time); }
        else if (mode === 'stars') { nb = store.recordBest(key, mine.score, false); val = mine.score + ' 顆星星'; }
        else if (mode === 'collapse') { nb = store.recordBest(key, mine.time, false); val = '存活 ' + mine.time.toFixed(1) + ' 秒'; }
        if (val) lines.push(h('p', { class: 'big', text: val }));
        if (nb) lines.push(h('p', { class: 'newbest', text: '新的本機紀錄！' }));
      }
    }
    const shapes = store.get('shapes');
    const table = h('div', { class: 'rtable' }, results.map((r) => {
      const pl = world.byId.get(r.id); const v = mode === 'race' ? (r.dnf ? '未完賽' : fmtShort(r.time)) : mode === 'stars' ? r.score + ' ★' : r.alive ? '最後倖存' : '存活 ' + r.time.toFixed(1) + ' 秒';
      return h('div', { class: 'rrow' + (r.id === meId ? ' me' : '') }, h('span', { class: 'rk', text: String(r.place) }), h('span', { class: 'dot', style: { background: BALL_COLORS[pl.idx % 8] }, text: shapes ? SHAPES[pl.idx % 8] : '' }), h('span', { class: 'nm', text: who(pl.name, r.id === meId) }), h('span', { class: 'val', text: v }));
    }));
    let again, back, home;
    if (!online) {
      again = Button({ label: '再來一局', variant: nextBtn ? '' : 'primary', onClick: () => { resultM.close(); againLocal(); } });
      back = Button({ label: '回到房間', title: '回到這個模式的設定／選關畫面', ariaLabel: '回到房間（設定畫面）', onClick: () => { resultM.close(); backLocal(); } });
    } else {
      const isHost = session.room && session.room.host === session.you;
      again = Button({ label: isHost ? '再來一局' : '再來一局（請房主開始）', variant: 'primary', disabled: !meId, onClick: function () { net.send({ t: 'rematch' }); if (!isHost) { this.disabled = true; toast('已通知房主，等房主開始'); } } });
      back = Button({ label: '回到房間', onClick: () => { net.send({ t: 'back' }); resultM.close(); go('room'); } });
    }
    home = Button({ label: '回到首頁', onClick: () => { resultM.close(); if (online) net.send({ t: 'leave' }); go('home'); } });
    resultM = Modal({ title, class: 'resultModal', dismissible: false, transparent: true, body: h('div', { class: 'result' }, ...lines, table, nextBtn ? h('div', { class: 'nextRow' }, nextBtn) : null), actions: [again, back, home] });
  }

  // 設定即時套用
  const offStore = store.on((k) => {
    if (k === 'ctrl' || k === '*') input.setScheme(store.get('ctrl'));
    if (k === 'cam' || k === '*') game.scene.setCam(store.get('cam'));
    if (k === 'shapes' || k === '*') game.scene.setShapes(store.get('shapes'));
    if (k === 'ball' || k === '*') game.scene.setBall(store.get('ball'));
    if (k === 'trail' || k === '*') game.scene.setTrail(store.get('trail'));
    if (k === 'reduce' || k === '*') game.scene.reduce = store.get('reduce');
    if (k === 'minimap' || k === '*') miniOn();
    if (last) hooks.onHud(last);
  });
  const sub = (m) => {
    if (m.t === 'chat') { chat && chat.draw(); if (!sideOpen && !m.sys) { badge.hidden = false; badge.textContent = String(Math.min(9, session.unread)); } else session.unread = 0; if (!m.sys && m.from !== session.you) audio.chat(); }
    else if (m.t === 'init' && online) { if (resultM) resultM.close(); go('game', { online: true, init: m }); }
    else if (m.t === 'room') { /* 名單變動不影響對局 */ }
    else if (m.t === 'err') toast(m.msg);
    else game.net(m);
  };
  if (online) session.subs.add(sub);
  const key = (e) => { if (e.key === 'Escape' && !online && !modalOpen()) { e.preventDefault(); openPause(); } };
  const vis = () => { if (document.hidden && !online) openPause(); };
  addEventListener('keydown', key); document.addEventListener('visibilitychange', vis);
  return () => {
    removeEventListener('keydown', key); document.removeEventListener('visibilitychange', vis); mq.removeEventListener('change', onMq); offStore();
    session.subs.delete(sub); if (resultM) resultM.close(); if (pauseM) pauseM.close('home');
    game.stop(); input.destroy(); if (activeGame === game) activeGame = null;
  };
}

const SCREENS = { home: homeScreen, levels: levelsScreen, setup: setupScreen, online: onlineScreen, room: roomScreen, game: gameScreen };

// ---------- 開機 ----------
function inviteFromHash() {
  const m = /^#\/join\/([A-Za-z0-9]{3,8})\/([A-Za-z0-9]{6,32})$/.exec(location.hash || '');
  return m ? { code: m[1].toUpperCase(), token: m[2] } : null;
}
function boot() { const inv = inviteFromHash(); if (inv) go('online', { invite: inv }); else go('home'); }
// 已開著遊戲時又點了邀請連結：同樣先到大廳確認暱稱（不自動入房）
addEventListener('hashchange', () => { const inv = inviteFromHash(); if (inv && !session.room && current !== 'game') go('online', { invite: inv }); });
window.__MRAPP = { go, startLocal, session, getGame: () => activeGame, store };
boot();
