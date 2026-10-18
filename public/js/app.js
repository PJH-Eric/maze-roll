// 迷宮滾球：畫面與流程。所有可見元件皆為 ui.js 的自訂元件。
import { h, icon, Button, IconButton, Toggle, Slider, Chips, Select, ScrollArea, TextInput, Modal, toast, modalOpen, Key } from './ui.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { net, wsUrl } from './net.js';
import { T, M } from './t.js';
import { BALL_COLORS, SHAPES, BALL_TYPES } from './scene.js';

const MR = window.MR;
const $app = document.getElementById('app');
const MODE_INFO = {
  race: { get name() { return T('同圖競速'); }, get sub() { return T('同一座迷宮，先滾到終點旗的人贏'); }, icon: 'flag' },
  stars: { get name() { return T('搶星星'); }, get sub() { return T('90 秒內撿最多星星；被撿走會在別處重生'); }, icon: 'star' },
  collapse: { get name() { return T('地板崩塌'); }, get sub() { return T('踩過的磚會碎裂，掉下去就淘汰，最後留下的人贏'); }, icon: 'crown' },
};
const DIFF_SUB = ['極小・很慢', '小迷宮', '中迷宮', '大迷宮', '巨大迷宮']; // 顯示時再 T()
// 時間一律顯示到小數點第二位（m:ss.cc）
const fmt = (s) => { const cs = Math.floor(Math.max(0, s) * 100 + 1e-6); return Math.floor(cs / 6000) + ':' + String(Math.floor(cs / 100) % 60).padStart(2, '0') + '.' + String(cs % 100).padStart(2, '0'); };
const fmtShort = fmt;
const myName = () => (store.get('name') || '').trim() || T('你');

// ---------- 全域外框：設定入口（右上角）、回大廳（只在首頁）----------
const chrome = h('div', { class: 'chrome' });
const gearBtn = IconButton({ icon: 'gear', ariaLabel: T('設定'), class: 'gear', onClick: () => openSettings() });
const chromeRight = h('div', { class: 'chromeRight' }, gearBtn);
const lobbyLink = h('a', { class: 'btn lobbyLink', href: (window.MR_CONFIG && window.MR_CONFIG.lobbyUrl) || '#', 'aria-label': T('回遊戲大廳') }, icon('home'), h('span', { text: T('遊戲小小島') }));
chrome.append(lobbyLink, chromeRight);
const $screen = h('div', { class: 'screenHost' });
$app.append($screen, chrome);

// ---------- 多語系（核心沿用箭頭解密的 i18n.js：繁體中文／English）----------
const langToggle = window.I18N ? window.I18N.mountToggle({ after: gearBtn }) : null;
const META = { title: '迷宮滾球｜免費線上 3D 滾球迷宮・多人競速', desc: '免費免下載的 3D 木質迷宮滾球遊戲：單人闖關五種難度各 100 關，可對電腦，也能線上最多 4 人競速、搶星星、地板崩塌，支援觀戰與邀請連結，手機平板都能玩。' };
function applyLang() {
  document.title = T(META.title);
  const d = document.querySelector('meta[name="description"]'); if (d) d.setAttribute('content', T(META.desc));
  gearBtn.setAttribute('aria-label', T('設定')); gearBtn.setAttribute('title', T('設定'));
  lobbyLink.setAttribute('aria-label', T('回遊戲大廳')); lobbyLink.lastElementChild.textContent = T('遊戲小小島');
}

let cleanup = null, current = '', ctx = {};
if (window.I18N) window.I18N.onChange(() => { applyLang(); if (current && current !== 'game') go(current, ctx); });
function go(name, params) {
  if (name === 'home' && session.room) net.send({ t: 'leave' }); // 回首頁一定離開房間，避免留下空殼房
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  Array.from(chromeRight.children).forEach((c) => { if (c !== gearBtn && !c.classList.contains('language-controls')) c.remove(); });
  if (langToggle) langToggle.style.display = name === 'game' ? 'none' : '';
  $screen.replaceChildren(); current = name; ctx = params || {};
  lobbyLink.style.display = name === 'home' ? '' : 'none';
  $app.dataset.screen = name;
  const fn = SCREENS[name]; const r = fn(ctx);
  if (typeof r === 'function') cleanup = r;
  audio.bgm(store.get('bgm') && audio.ready());
}
function topbar(title, onBack) {
  return h('header', { class: 'topbar' }, Button({ icon: 'back', label: T('返回'), size: 'small', onClick: onBack }), h('h1', { class: 'title', text: title }), h('span', { class: 'spacer' }));
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
    bgm: Toggle({ label: T('背景音樂'), value: S.get('bgm'), onChange: (v) => { S.set('bgm', v); audio.bgm(v); } }),
    bgmVol: Slider({ label: T('音樂音量'), value: S.get('bgmVol'), onChange: (v) => S.set('bgmVol', v) }),
    sfx: Toggle({ label: T('音效'), value: S.get('sfx'), onChange: (v) => { S.set('sfx', v); if (v) audio.star(); } }),
    sfxVol: Slider({ label: T('音效音量'), value: S.get('sfxVol'), onChange: (v, commit) => { S.set('sfxVol', v); if (commit) audio.star(); } }),
    ctrl: Chips({ label: T('操作方式'), value: S.get('ctrl'), options: [{ value: 'stick', label: T('虛擬搖桿') }, { value: 'drag', label: T('手指拖曳') }, { value: 'tilt', label: T('裝置傾斜') }], onChange: async (v) => { if (v === 'tilt') { const ok = await new Input().enableTilt(); if (!ok) { toast(T('此裝置無法使用傾斜，已改回搖桿')); S.set('ctrl', 'stick'); rows.ctrl.set('stick'); return; } } S.set('ctrl', v); } }),
    vib: Toggle({ label: T('震動回饋'), value: S.get('vib'), onChange: (v) => S.set('vib', v) }),
    cam: Chips({ label: T('鏡頭距離'), value: S.get('cam'), options: [{ value: 0, label: T('近') }, { value: 1, label: T('中') }, { value: 2, label: T('遠') }], onChange: (v) => S.set('cam', v) }),
    minimap: Toggle({ label: T('小地圖'), value: S.get('minimap'), onChange: (v) => S.set('minimap', v) }),
    ball: Chips({ label: T('球種'), value: S.get('ball'), options: BALL_TYPES.map((b) => ({ value: b.id, label: T(b.name) })), onChange: (v) => S.set('ball', v) }),
    trail: Toggle({ label: T('滾動軌跡'), value: S.get('trail'), onChange: (v) => S.set('trail', v) }),
    shapes: Toggle({ label: T('色彩輔助（用形狀區分玩家）'), value: S.get('shapes'), onChange: (v) => S.set('shapes', v) }),
    reduce: Toggle({ label: T('減少動態（關閉粒子、晃動與浮動）'), value: S.get('reduce'), onChange: (v) => S.set('reduce', v) }),
  };
  const sect = (t, ...k) => h('section', { class: 'sect' }, h('h3', { text: t }), ...k);
  const body = h('div', { class: 'settings' },
    sect(T('聲音'), rows.bgm, rows.bgmVol, rows.sfx, rows.sfxVol),
    sect(T('操作'), h('div', { class: 'rowStack' }, h('span', { class: 'rowLabel', text: T('操作方式') }), rows.ctrl), rows.vib, h('p', { class: 'hint' }, T('鍵盤：'), Key('W'), Key('A'), Key('S'), Key('D'), T(' 或方向鍵都能操作。'))),
    sect(T('畫面與輔助'), h('div', { class: 'rowStack' }, h('span', { class: 'rowLabel', text: T('鏡頭距離') }), rows.cam), h('div', { class: 'rowStack' }, h('span', { class: 'rowLabel', text: T('球種（自己的球）') }), rows.ball), rows.trail, rows.minimap, rows.shapes, rows.reduce));
  const g = activeGame && !activeGame.online && activeGame.state === 'play' && !activeGame.paused ? activeGame : null;
  if (g) g.pause(true);
  m = Modal({
    title: T('設定'), body, class: 'settingsModal', onClose: () => { if (g && activeGame === g) g.pause(false); },
    actions: [Button({ label: T('恢復預設'), onClick: () => { S.reset(); m.close('reset'); toast(T('已恢復預設設定')); audio.bgm(S.get('bgm')); } }), Button({ label: T('完成'), variant: 'primary', onClick: () => m.close('ok') })],
  });
  return m;
}

function openHow() {
  const sec = (t, ...k) => h('section', { class: 'sect' }, h('h3', { text: t }), ...k);
  const m = Modal({
    title: T('怎麼玩'), class: 'howModal',
    body: h('div', { class: 'how' },
      sec(T('基本操作'), h('p', {}, T('推動搖桿（或按 '), Key('W'), Key('A'), Key('S'), Key('D'), T('／方向鍵）讓球往那個方向滾。牆會擋住球，撞牆會減速，慢慢控制比硬衝更快。'))),
      sec(T('同圖競速'), h('p', { text: T('所有人用同一座迷宮、從同一個起點出發，先滾進終點旗洞的人贏。第一名到達後，其他人還有 15 秒可以衝線；球和球不會互相碰撞，可以穿過去。') })),
      sec(T('搶星星'), h('p', { text: T('迷宮裡散落著星星，碰到就得 1 分，星星被撿走後會在別處重新出現。90 秒內分數最高的人贏；同分時，比較早拿到最後一顆的人名次較前。') })),
      sec(T('地板崩塌'), h('p', { text: T('你踩過的地磚會先晃動，接著碎裂掉下去。一直停在原地也會掉！規劃好路線，不要把自己困在死路裡，最後還站著的人贏。拖太久時，場地會自己隨機碎裂。') })),
      sec(T('闖關模式'), h('p', { text: T('五種難度各 100 關，依序解鎖。依完成時間評 1～3 顆星。') })),
      sec(T('線上對戰'), h('p', { text: T('每房最多 4 位玩家、20 位觀戰者。房主可以複製邀請連結給朋友；朋友打開連結後確認暱稱就能加入。觀戰者可以看全場並聊天。') }))),
    actions: [Button({ label: T('知道了'), variant: 'primary', onClick: () => m.close('ok') })],
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
      h('h1', { class: 'gameTitle', text: T('迷宮滾球') }),
      h('p', { class: 'sub', text: T('3D 木質迷宮・推著小球衝向終點') }),
      h('div', { class: 'menu' },
        menuBtn('flag', T('闖關模式'), T('單人・五種難度各 100 關'), () => go('levels'), 'primary'),
        menuBtn('star', T('自由練習'), T('一個人・三種玩法・計時'), () => go('setup', { kind: 'practice' })),
        menuBtn('people', T('對電腦'), T('1～7 位電腦・各自選難度'), () => go('setup', { kind: 'vsai' })),
        menuBtn('link', T('線上對戰'), T('最多 4 人・觀戰・邀請連結'), () => go('online')),
        Button({ label: T('怎麼玩'), variant: 'ghost', onClick: openHow }))), { class: 'homeScroll' })));
}

// ---------- 畫面：闖關 ----------
function levelsScreen(p) {
  const dOpen = () => true; // 五種難度皆可直接選擇，不需星星門檻
  let diff = p.diff != null && dOpen(p.diff) ? p.diff : Math.max(0, MR.DIFFS.findIndex((_, i) => dOpen(i) && store.levelStars(i).filter((x) => x > 0).length < 100));
  const grid = h('div', { class: 'levelGrid' }), prog = h('p', { class: 'note' });
  const sa = ScrollArea(h('div', { class: 'levelWrap' }, grid), { class: 'levelScroll', label: T('關卡列表') });
  const draw = () => {
    const stars = store.levelStars(diff), un = store.unlockedLevel(diff), done = stars.filter((x) => x > 0).length, tot = stars.reduce((a, b) => a + b, 0);
    grid.dataset.diff = String(diff); grid.style.setProperty('--dtheme', MR.DIFF_THEME[diff].accent);
    const nx = '';
    const progTxt = T('{wood}・已通過 {done}/100 關・共 {tot} 顆星{nx}・迷宮大小 {x5}×{x6} ～ {x7}×{x8}', { wood: T(MR.DIFF_THEME[diff].wood), done, tot, nx, x5: MR.levelSize(diff, 1), x6: MR.levelSize(diff, 1), x7: MR.levelSize(diff, 100), x8: MR.levelSize(diff, 100) });
    prog.textContent = ''; progTxt.split(/[・·]\s*/).forEach((seg, k) => { if (k) prog.appendChild(document.createTextNode(' · ')); prog.appendChild(h('span', { class: 'nw', text: seg })); });
    grid.replaceChildren();
    for (let n = 1; n <= 100; n++) {
      const locked = n > un, s = stars[n - 1] || 0;
      const b = h('button', { type: 'button', class: 'lv' + (locked ? ' locked' : '') + (s ? ' done' : '') + (n === un ? ' next' : ''), disabled: locked || null, 'aria-label': T('第 {n} 關{x2}', { n, x2: locked ? T('（未解鎖）') : s ? T('，{s} 顆星', { s }) : '' }) },
        h('b', { text: String(n) }), locked ? icon('lock') : h('span', { class: 'stars', text: '★'.repeat(s) + '☆'.repeat(3 - s) }));
      if (!locked) b.addEventListener('click', () => startLocal({ kind: 'level', mode: 'race', diff, level: n, ais: [] }));
      grid.append(b);
      if (n === un) setTimeout(() => b.scrollIntoView({ block: 'center' }), 30);
    }
  };
  const chips = Chips({ label: T('難度'), value: diff, options: MR.DIFFS.map((d, i) => ({ value: i, label: T(d), disabled: !dOpen(i), sub: T(MR.DIFF_THEME[i].wood) })), onChange: (v) => { diff = v; draw(); sa.view.scrollTop = 0; } });
  $screen.append(h('section', { class: 'screen levels' }, topbar(T('闖關模式'), () => go('home')), h('div', { class: 'body' }, panel(chips, prog, sa))));
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
    best.textContent = v == null ? T('還沒有紀錄，來挑戰看看！') : S.mode === 'race' ? T('本機最佳：{x1}', { x1: fmtShort(v) }) : S.mode === 'stars' ? T('本機最佳：{v} 顆星星', { v }) : T('本機最佳：存活 {x1} 秒', { x1: v.toFixed(2) });
  };
  const drawComps = () => {
    countLbl.textContent = T('{n} 位電腦', { n: S.count }); compList.replaceChildren();
    for (let i = 0; i < S.count; i++) {
      compList.append(h('div', { class: 'comp' }, h('span', { class: 'dot', style: { background: BALL_COLORS[(i + 1) % 8] } }), h('span', { class: 'cname', text: T('電腦 {n}', { n: i + 1 }) }),
        Select({ label: T('電腦 {x1} 難度', { x1: i + 1 }), value: S.ai[i] != null ? S.ai[i] : 1, options: MR.AI_NAMES.map((n, k) => ({ value: k, label: T(n) })), onChange: (v) => { S.ai[i] = v; } })));
    }
  };
  const modeChips = Chips({ label: T('玩法'), value: S.mode, options: MR.MODES.map((m) => ({ value: m, label: MODE_INFO[m].name, icon: MODE_INFO[m].icon })), onChange: (v) => { S.mode = v; modeDesc.textContent = MODE_INFO[v].sub; showBest(); } });
  const diffChips = Chips({ label: T('迷宮難度'), value: S.diff, options: MR.DIFFS.map((d, i) => ({ value: i, label: T(d), sub: T(DIFF_SUB[i]) })), onChange: (v) => { S.diff = v; showBest(); } });
  const stepper = vsai ? h('div', { class: 'stepper' }, IconButton({ icon: 'minus', ariaLabel: T('減少一位電腦'), onClick: () => { if (S.count > 1) { S.count--; drawComps(); } } }), countLbl, IconButton({ icon: 'plus', ariaLabel: T('增加一位電腦'), onClick: () => { if (S.count < 7) { S.count++; while (S.ai.length < S.count) S.ai.push(1); drawComps(); } } })) : null;
  const sections = [h('h3', { text: T('玩法') }), modeChips, modeDesc, h('h3', { text: T('迷宮難度') }), diffChips, vsai ? h('h3', { text: T('電腦對手') }) : best, vsai ? stepper : null, vsai ? compList : null];
  $screen.append(h('section', { class: 'screen setup' }, topbar(vsai ? T('對電腦') : T('自由練習'), () => go('home')),
    h('div', { class: 'body' }, panel(ScrollArea(h('div', { class: 'setupBody' }, ...sections), { class: 'setupScroll' }),
      h('div', { class: 'panelActions' }, Button({ label: T('開始遊戲'), variant: 'primary', size: 'big', onClick: () => startLocal({ kind: p.kind, mode: S.mode, diff: S.diff, ais: vsai ? S.ai.slice(0, S.count) : [] }) }))))));
  showBest(); if (vsai) drawComps();
}

// ---------- 單機開局 ----------
function startLocal(cfg) {
  const players = [{ id: 'me', name: myName(), kind: 'human' }];
  cfg.ais.forEach((lv, i) => players.push({ id: 'ai' + (i + 1), name: T('電腦{x1}・{AI_NAMES_lv_}', { x1: i + 1, AI_NAMES_lv_: T(MR.AI_NAMES[lv]) }), kind: 'ai', ai: lv }));
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
    go('online', { notice: m.t === 'closed' ? (M(m.reason) || T('房間已結束')) : m.why === 'kicked' ? T('你被房主請出房間了') : '' });
  }
  if (m.t === 'init' && (current === 'room')) go('game', { online: true, init: m });
});
const inviteLink = (kind) => { const r = session.room; if (!r || !r.invite) return ''; return location.origin + location.pathname + '#/join/' + r.code + '/' + (kind === 'spec' ? r.invite.ts : r.invite.tp); };
function copyText(text) {
  const done = () => toast(T('已複製連結'));
  const fallback = () => { const m = Modal({ title: T('複製連結'), body: h('div', {}, h('p', { class: 'note', text: T('請長按選取下面的連結後複製：') }), h('div', { class: 'linkBox', text })), actions: [Button({ label: T('完成'), variant: 'primary', onClick: () => m.close() })] }); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}

// ---------- 聊天元件 ----------
const QUICK = ['加油！', '好險～', '漂亮！', '再來一局！', 'GG']; // 顯示時再 T()
function ChatBox() {
  const list = h('div', { class: 'chatList', role: 'log', 'aria-live': 'polite' });
  const sa = ScrollArea(list, { class: 'chatScroll', label: T('聊天訊息') });
  const input = TextInput({ placeholder: T('輸入訊息…'), maxLength: 80, label: T('聊天輸入'), enter: 'send', onEnter: () => send() });
  const send = () => { const t = input.value.trim(); if (!t) return; net.send({ t: 'chat', text: t }); input.value = ''; };
  const draw = () => {
    list.replaceChildren(...session.chat.slice(-60).map((c) => c.sys ? h('div', { class: 'msg sys', text: M(c.text) }) :
      h('div', { class: 'msg' + (c.from === session.you ? ' mine' : '') }, h('b', { text: c.name + (c.role === 'spec' ? T('（觀戰）') : '') }), h('span', { text: M(c.text) }))));
    requestAnimationFrame(() => sa.scrollToEnd());
  };
  const root = h('div', { class: 'chatBox' }, sa,
    h('div', { class: 'quick' }, QUICK.map((q) => Button({ label: T(q), size: 'tiny', onClick: () => net.send({ t: 'chat', text: q }) }))),
    h('div', { class: 'chatIn' }, input, Button({ label: T('送出'), size: 'small', variant: 'primary', onClick: send })));
  root.draw = draw; draw();
  return root;
}

// ---------- 畫面：線上大廳 ----------
const MODE_SHORT = { get race() { return T('競速'); }, get stars() { return T('搶星星'); }, get collapse() { return T('崩塌'); } };
function onlineScreen(p) {
  let rooms = [], invite = p.invite || null, peek = null, joining = false;
  const status = h('div', { class: 'status' });
  const nameIn = TextInput({ placeholder: T('輸入暱稱（可留空）'), maxLength: 12, value: store.get('name'), label: T('暱稱'), onInput: (v) => store.set('name', v.trim()) });
  const listEl = h('div', { class: 'roomList' });
  const inviteBox = h('div', { class: 'inviteBox' });
  const notice = p.notice ? h('p', { class: 'notice', role: 'alert', text: p.notice }) : null;
  const nm = () => nameIn.value.trim();
  const drawStatus = () => {
    const st = net.state, map = { idle: T('尚未連線'), connecting: T('連線中…（伺服器第一次喚醒可能要等幾十秒）'), reconnecting: T('重新連線中…'), online: T('已連線'), offline: T('無法連線'), nourl: T('尚未設定線上伺服器') };
    status.className = 'status ' + st; status.textContent = map[st] || st;
  };
  const drawRooms = () => {
    listEl.replaceChildren();
    if (net.state === 'nourl') { listEl.append(h('p', { class: 'empty', text: T('這個版本還沒有設定線上伺服器（GAME_SERVER_URL），目前只能玩單機模式。') })); return; }
    if (!rooms.length) { listEl.append(h('p', { class: 'empty', text: net.state === 'online' ? T('目前沒有房間。按「快速加入」會自動幫你開一間！') : T('連線後會顯示房間列表。') })); return; }
    for (const r of rooms) {
      const full = r.players >= r.max || r.state !== 'waiting';
      listEl.append(h('div', { class: 'roomRow' },
        h('div', { class: 'ri' }, h('b', { text: T('{host} 的房間', { host: r.host }) }), h('small', { text: T('{mode_}・{diff_}・{x3}・{players}/{max} 人{x6}', { mode_: MODE_SHORT[r.mode], diff_: T(MR.DIFFS[r.diff]), x3: r.state === 'waiting' ? T('等待中') : T('遊戲中'), players: r.players, max: r.max, x6: r.specs ? '・' + T('{n} 人觀戰', { n: r.specs }) : '' }) })),
        Button({ label: T('加入'), size: 'small', variant: 'primary', disabled: full || joining, onClick: () => net.send({ t: 'join', code: r.code, name: nm(), role: 'player' }) }),
        Button({ label: T('觀戰'), size: 'small', icon: 'eye', onClick: () => net.send({ t: 'join', code: r.code, name: nm(), role: 'spec' }) })));
    }
  };
  const drawInvite = () => {
    inviteBox.replaceChildren(); if (!invite) return;
    const bad = { invalid: T('邀請連結無效，請向朋友再要一次。'), revoked: T('這個邀請連結已被房主撤銷，請向朋友再要一個新的。'), closed: T('這個房間已經結束了。') };
    if (peek && !peek.ok) { inviteBox.append(h('div', { class: 'inviteCard bad' }, h('p', { text: bad[peek.reason] || T('無法使用這個邀請。') }), Button({ label: T('知道了'), onClick: () => { invite = null; peek = null; clearHash(); drawInvite(); } }))); return; }
    if (!peek) { inviteBox.append(h('div', { class: 'inviteCard' }, h('p', { text: net.state === 'online' ? T('正在確認邀請…') : T('連線後會確認邀請…') }))); return; }
    const r = peek.room;
    inviteBox.append(h('div', { class: 'inviteCard' },
      h('h3', { text: T('你收到房間邀請') }),
      h('p', { text: T('{host} 的房間・{mode_}・{diff_}・{players}/{max} 人', { host: r.host, mode_: MODE_SHORT[r.mode], diff_: T(MR.DIFFS[r.diff]), players: r.players, max: r.max }) }),
      h('p', { class: 'note', text: peek.role === 'spec' ? T('你將以「觀戰者」身分加入。確認暱稱後按加入。') : r.state === 'waiting' ? T('你將以「玩家」身分加入。確認暱稱後按加入。') : T('遊戲進行中，你會先以觀戰者身分加入。') }),
      Button({ label: peek.role === 'spec' ? T('確認並觀戰') : T('確認並加入'), variant: 'primary', onClick: () => { joining = true; net.send({ t: 'join', code: invite.code, token: invite.token, name: nm() }); } })));
  };
  const clearHash = () => { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 略 */ } };
  const sub = (m) => {
    if (m.t === '_state') { drawStatus(); drawRooms(); if (m.state === 'online' && invite && !peek) net.send({ t: 'peek', code: invite.code, token: invite.token }); drawInvite(); }
    else if (m.t === 'rooms') { rooms = m.rooms; drawRooms(); }
    else if (m.t === 'peek') { peek = m; drawInvite(); }
    else if (m.t === 'joined') { clearHash(); }
    else if (m.t === 'err') { joining = false; toast(M(m.msg) || T('發生錯誤')); if (invite && ['invalid', 'revoked', 'closed'].includes(m.code)) { peek = { ok: false, reason: m.code }; drawInvite(); } drawRooms(); }
  };
  net.on(sub); const off = () => net.handlers.delete(sub);
  const createRoom = () => {
    let mode = 'race', diff = 2, mm;
    const body = h('div', {}, h('h3', { text: T('玩法') }), Chips({ label: T('玩法'), value: mode, options: MR.MODES.map((m) => ({ value: m, label: MODE_INFO[m].name })), onChange: (v) => { mode = v; } }),
      h('h3', { text: T('迷宮難度') }), Chips({ label: T('難度'), value: diff, options: MR.DIFFS.map((d, i) => ({ value: i, label: T(d) })), onChange: (v) => { diff = v; } }), h('p', { class: 'note', text: T('進房後房主還可以再調整。') }));
    mm = Modal({ title: T('建立房間'), body, actions: [Button({ label: T('取消'), onClick: () => mm.close() }), Button({ label: T('建立'), variant: 'primary', onClick: () => { net.send({ t: 'create', name: nm(), mode, diff }); mm.close(); } })] });
  };
  $screen.append(h('section', { class: 'screen online' }, topbar(T('線上對戰'), () => go('home')),
    h('div', { class: 'body' }, panel(ScrollArea(h('div', { class: 'onlineBody' },
      notice, status, inviteBox,
      h('div', { class: 'nickRow' }, h('label', { class: 'rowLabel', text: T('暱稱') }), nameIn),
      h('div', { class: 'row2' },
        Button({ label: T('快速加入'), variant: 'primary', icon: 'flag', onClick: () => net.send({ t: 'quick', name: nm() }) }),
        Button({ label: T('建立房間'), icon: 'plus', onClick: createRoom }),
        Button({ label: T('重新整理'), size: 'small', onClick: () => net.send({ t: 'rooms' }) })),
      h('h3', { text: T('公開房間') }), listEl), { class: 'onlineScroll' })))));
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
    rc(head, h('div', {}, h('small', { text: T('房間代碼') }), h('b', { class: 'code', text: r.code })), Button({ label: T('離開房間'), size: 'small', onClick: () => { net.send({ t: 'leave' }); go('online'); } }));
    rc(settings,
      h('h3', { text: T('玩法') }), Chips({ label: T('玩法'), value: r.mode, options: MR.MODES.map((m) => ({ value: m, label: MODE_INFO[m].name, disabled: !isHost })), onChange: (v) => net.send({ t: 'set', mode: v }) }),
      h('p', { class: 'note', text: MODE_INFO[r.mode].sub }),
      h('h3', { text: T('迷宮難度') }), Chips({ label: T('難度'), value: r.diff, options: MR.DIFFS.map((d, i) => ({ value: i, label: T(d), disabled: !isHost })), onChange: (v) => net.send({ t: 'set', diff: v }) }),
      isHost ? null : h('p', { class: 'note', text: T('只有房主能更改設定。') }));
    seats.replaceChildren();
    for (let i = 0; i < r.max; i++) {
      const m = players[i];
      seats.append(m ? h('div', { class: 'seat' + (m.ready || m.id === r.host ? ' ready' : '') + (m.online ? '' : ' off') },
        h('span', { class: 'dot', style: { background: BALL_COLORS[i % 8] } }), h('span', { class: 'sname', text: m.name + (m.id === session.you ? T('（你）') : '') }),
        m.id === r.host ? h('span', { class: 'tag', title: T('房主') }, icon('crown'), T('房主')) : h('span', { class: 'tag', text: m.ready ? T('已準備') : T('未準備') }),
        !m.online ? h('span', { class: 'tag warn', text: T('斷線中') }) : null,
        isHost && m.id !== session.you ? Button({ label: T('請出'), size: 'tiny', onClick: () => net.send({ t: 'kick', id: m.id }) }) : null)
        : h('div', { class: 'seat empty' }, h('span', { class: 'dot' }), h('span', { class: 'sname', text: T('等待玩家加入…') })));
    }
    rc(specs, h('h3', {}, icon('eye'), T(' 觀戰 {length}/{maxSpecs}', { length: sp.length, maxSpecs: r.maxSpecs })), sp.length ? h('p', { class: 'note', text: sp.map((m) => m.name + (m.id === session.you ? T('（你）') : '')).join(T('、')) }) : h('p', { class: 'note', text: T('還沒有人觀戰') }));
    inviteEl.replaceChildren();
    if (r.invite) {
      const row = (label, kind, ico) => h('div', { class: 'linkRow' }, h('div', { class: 'linkLbl' }, icon(ico), h('span', { text: label })),
        h('div', { class: 'linkUrl', role: 'textbox', 'aria-readonly': 'true', 'aria-label': label, tabindex: '0', text: inviteLink(kind) }),
        Button({ label: T('複製'), icon: 'copy', size: 'small', onClick: () => copyText(inviteLink(kind)) }));
      inviteEl.append(h('h3', { text: T('邀請朋友') }), row(T('加入連結（玩家）'), 'player', 'link'), row(T('觀戰連結'), 'spec', 'eye'), isHost ? h('div', { class: 'row2' }, Button({ label: T('撤銷並重發'), size: 'small', onClick: () => net.send({ t: 'invite', act: 'revoke' }) })) : null);
    }
    actions.replaceChildren();
    if (!isPlayer) actions.append(h('p', { class: 'note', text: session.fallback ? T('房間已滿或已開始，你目前是觀戰者。') : T('你是觀戰者：可以看全場並聊天。') }));
    else if (isHost) { const ok = players.length >= 2 && players.every((m) => m.id === r.host || m.ready); actions.append(Button({ label: ok ? T('開始遊戲') : players.length < 2 ? T('至少需要 2 位玩家') : T('等待大家準備'), variant: 'primary', size: 'big', disabled: !ok, onClick: () => net.send({ t: 'start' }) })); }
    else actions.append(Button({ label: me.ready ? T('取消準備') : T('準備好了'), variant: me.ready ? '' : 'primary', size: 'big', onClick: () => net.send({ t: 'ready', v: !me.ready }) }));
  };
  const sub = (m) => { if (m.t === 'room') draw(); else if (m.t === 'chat') { chat.draw(); session.unread = 0; audio.chat(); } else if (m.t === 'err') toast(M(m.msg)); };
  session.subs.add(sub); session.unread = 0;
  $screen.append(h('section', { class: 'screen room' }, topbar(T('房間'), () => { net.send({ t: 'leave' }); go('online'); }),
    h('div', { class: 'body roomBody' }, h('aside', { class: 'panelSide roomChat' }, h('h3', { text: T('聊天室') }), chat),
      panel(ScrollArea(h('div', { class: 'roomMain' }, head, inviteEl, settings, h('h3', { text: T('玩家') }), seats, specs), { class: 'roomScroll' }), actions))));
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
  const who = (name, me) => (me && name !== T('你') ? name + T('（你）') : name);

  const input = new Input(); input.setScheme(store.get('ctrl'));
  const canvas = h('canvas', { class: 'cv', role: 'img', 'aria-label': T('3D 迷宮遊戲畫面') });
  const hudMode = h('span', { class: 'hmode' }), hudTime = h('b', { class: 'htime', text: '0:00' }), hudExtra = h('span', { class: 'hextra' });
  const hudTop = h('div', { class: 'hudTop' }, hudMode, hudTime, hudExtra);
  const mini = h('canvas', { class: 'mini', width: 240, height: 240, 'aria-hidden': 'true' });
  const miniBtn = h('button', { type: 'button', class: 'miniBtn', 'aria-label': T('放大小地圖'), title: T('放大小地圖') }, mini, h('span', { class: 'miniZoom', 'aria-hidden': 'true' }, icon('zoom')));
  miniBtn.addEventListener('pointerdown', (e) => e.stopPropagation()); // 不要觸發搖桿
  const knob = h('div', { class: 'knob' }), stick = h('div', { class: 'stick', 'aria-label': T('虛擬搖桿') }, knob), stickZone = h('div', { class: 'stickZone' }, stick);
  const countEl = h('div', { class: 'countdown', 'aria-live': 'assertive' }), banner = h('div', { class: 'banner', hidden: true });
  const badge = h('span', { class: 'badge', hidden: true });
  const sideTab = h('button', { type: 'button', class: 'btn sideTab', 'aria-label': T('開關對局資訊'), 'aria-expanded': 'true' }, icon(online ? 'chat' : 'people'), badge);
  const respawnBtn = h('button', { type: 'button', class: 'btn respawnBtn', 'aria-label': T('回到起點（R）'), title: T('回到起點（R）') }, icon('undo'), h('span', { class: 'rl', text: T('回起點') }));
  const arena = h('div', { class: 'arena' }, canvas, hudTop, miniBtn, respawnBtn, stickZone, countEl, banner, sideTab);
  const sumList = h('div', { class: 'sumList' });
  const lvTxt = cfg && cfg.kind === 'level' ? T('第 {level} 關', { level: cfg.level }) : '';
  const sumHead = h('div', { class: 'sumHead' }, h('b', { text: MODE_INFO[mode].name }), h('small', { text: `${T(MR.DIFFS[diff])}${lvTxt ? '・' + lvTxt : ''}・${size}×${size}` }));
  const chat = online ? ChatBox() : null;
  const side = h('aside', { class: 'panelSide gameSide' }, h('div', { class: 'sideTop' }, sumHead, ScrollArea(sumList, { class: 'sumScroll', label: T('排行') })), chat ? h('div', { class: 'sideChat' }, h('h3', { text: T('聊天室') }), chat) : null);
  const root = h('section', { class: 'screen gameScreen' + (online ? ' online' : '') + (online ? '' : ' local') }, side, arena);
  $screen.append(root);

  // 版面：寬版左側欄可收合；窄版／直向改為左側抽屜
  const mq = matchMedia('(max-width: 899px), (max-aspect-ratio: 1/1)');
  let sideOpen = !mq.matches;
  const layout = () => { root.classList.toggle('narrow', mq.matches); root.classList.toggle('sideOpen', sideOpen); sideTab.setAttribute('aria-expanded', String(sideOpen)); if (sideOpen) { session.unread = 0; badge.hidden = true; } };
  const onMq = () => { sideOpen = !mq.matches; layout(); };
  mq.addEventListener('change', onMq);
  sideTab.addEventListener('click', () => { sideOpen = !sideOpen; layout(); });
  const miniOn = () => { miniBtn.style.display = store.get('minimap') ? '' : 'none'; };

  let game, resultM = null, pauseM = null, last = null, finished = false;
  const showBanner = (text, btn) => { banner.hidden = false; rc(banner, h('b', { text }), btn); };
  const hooks = {
    onCount(n) { countEl.textContent = n == null ? '' : n === 0 ? T('出發！') : String(n); countEl.classList.toggle('go', n === 0); countEl.style.display = n == null ? 'none' : ''; },
    onMe(state, e) {
      if (state === 'finished') showBanner(T('抵達終點！第 {place} 名', { place: e.place }), null);
      else if (state === 'out') showBanner(T('你掉下去了…'), !online && game.world.players.some((q) => q.alive) ? Button({ label: T('直接看結果'), size: 'small', onClick: () => { game.fastForward(); banner.hidden = true; } }) : h('small', { text: T('可以繼續觀戰') }));
    },
    onHud(hd) {
      last = hd; const w = game.world;
      hudMode.textContent = MODE_INFO[mode].name;
      hudTime.textContent = hd.left != null ? fmt(hd.left) : fmt(hd.t);
      hudTime.classList.toggle('warn', hd.left != null && hd.left < 10);
      let ex = '';
      if (mode === 'race' && hd.grace != null && hd.grace > 0) ex = T('衝線倒數 {x1} 秒', { x1: Math.ceil(hd.grace) });
      else if (mode === 'collapse') ex = T('剩 {alive} 人', { alive: hd.alive });
      else if (mode === 'stars') { const me = game.me(); ex = me ? T('你 {score} ★', { score: me.score }) : ''; }
      hudExtra.textContent = ex;
      const shapes = store.get('shapes');
      sumList.replaceChildren(...hd.rows.map((r) => {
        const val = mode === 'race' ? (r.done ? fmt(r.fin) : r.alive ? T('剩 {n} 格', { n: Math.round(r.rem) }) : '') : mode === 'stars' ? r.score + ' ★' : r.alive ? T('存活') : T('淘汰');
        return h('button', { type: 'button', class: 'srow' + (r.me ? ' me' : '') + (r.id === hd.follow ? ' fol' : '') + (r.alive ? '' : ' dead'), 'aria-label': T('第 {rank} 名 {name} {val}，點一下鏡頭跟隨', { rank: r.rank, name: r.name, val }), on: { click: () => game.setFollow(r.me ? null : r.id) } },
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
    const pb = IconButton({ icon: 'pause', ariaLabel: T('暫停'), onClick: () => openPause() });
    chromeRight.insertBefore(pb, chromeRight.firstChild);
  }

  function openPause() {
    if (pauseM || online || game.state !== 'play') return;
    game.pause(true); let why = 'resume';
    pauseM = Modal({
      title: T('暫停'), class: 'pauseModal', body: h('p', { class: 'note', text: T('遊戲已暫停。') }),
      actions: [Button({ label: T('繼續'), variant: 'primary', onClick: () => pauseM.close('resume') }), Button({ label: T('重新開始'), onClick: () => { why = 'restart'; pauseM.close('restart'); againLocal(); } }), Button({ label: T('回到首頁'), onClick: () => { why = 'home'; pauseM.close('home'); go('home'); } })],
      onClose: (w) => { pauseM = null; if (w !== 'restart' && w !== 'home' && activeGame === game) game.pause(false); },
    });
  }
  // 小地圖放大：在畫面中央看整張迷宮（單機會先暫停，關閉後繼續）
  let mapM = null;
  const openMap = () => {
    if (mapM || modalOpen() || game.state === 'ended') return;
    const big = h('canvas', { class: 'bigMap', width: 720, height: 720, role: 'img', 'aria-label': T('迷宮地圖') });
    const w = game.world, dots = w.players.map((p) => h('span', { class: 'lgItem' }, h('i', { class: 'lgDot' + (p.id === meId ? ' me' : ''), style: { background: BALL_COLORS[p.idx % 8] } }), h('span', { text: who(p.name, p.id === meId) })));
    const legend = h('div', { class: 'mapLegend' }, ...dots, w.mode === 'race' ? h('span', { class: 'lgItem' }, icon('flag'), h('span', { text: T('終點') })) : null, w.stars ? h('span', { class: 'lgItem' }, icon('star'), h('span', { text: T('星星') })) : null);
    const wasPlaying = !online && game.state === 'play' && !game.paused; if (wasPlaying) game.pause(true);
    game.bigMapEl = big;
    mapM = Modal({ title: T('迷宮地圖'), class: 'mapModal', body: h('div', { class: 'mapBody' }, big, legend, h('p', { class: 'hint', text: T('點一下空白處或按 Esc 關閉') })),
      actions: [Button({ label: T('關閉'), variant: 'primary', onClick: () => mapM.close('ok') })],
      onClose: () => { game.bigMapEl = null; mapM = null; window.dispatchEvent(new Event('mapclose')); try { document.querySelectorAll('.scrim').forEach((e) => e.dispatchEvent(new Event('mapclose'))); } catch (e) {} if (wasPlaying && activeGame === game && !pauseM) game.pause(false); } });
    game._drawMini(big);
    const fit = () => { // 依可用空間縮放地圖，確保不出現捲軸：先放到最大，有溢出就扣掉溢出量
      const body = big.parentElement, view = body && (body.closest('.sa-view') || body.parentElement); if (!view) return;
      let sz = Math.max(120, Math.min(540, body.clientWidth - 24)); big.style.width = sz + 'px';
      for (let i = 0; i < 5; i++) { const over = view.scrollHeight - view.clientHeight; if (over <= 0 || sz <= 120) break; sz = Math.max(120, sz - over - 1); big.style.width = sz + 'px'; }
    };
    const onRs = () => fit(); window.addEventListener('resize', onRs); const prevClose = mapM.onClose;
    requestAnimationFrame(() => { fit(); setTimeout(fit, 260); setTimeout(fit, 800); });
    mapM.scrim.addEventListener('mapclose', () => window.removeEventListener('resize', onRs));
    mapM.scrim.addEventListener('click', (e) => { if (e.target === mapM.scrim || e.target.closest('.mapBody') && !e.target.closest('button')) mapM.close('tap'); });
  };
  miniBtn.addEventListener('click', openMap);
  const doRespawn = () => { if (game.respawn()) { respawnBtn.disabled = true; respawnBtn.classList.add('cool'); setTimeout(() => { respawnBtn.disabled = false; respawnBtn.classList.remove('cool'); }, 1000); } };
  respawnBtn.addEventListener('pointerdown', (e) => e.stopPropagation()); respawnBtn.addEventListener('click', doRespawn);
  const rsVis = () => { const me = game.me(); respawnBtn.style.display = meId && me && me.alive && !(game.world.mode === 'race' && me.fin != null) && game.state === 'play' ? '' : 'none'; };
  const rsT = setInterval(rsVis, 250); rsVis();
  const againLocal = () => { if (cfg) startLocal(cfg); };
  const backLocal = () => { if (!cfg) return go('home'); if (cfg.kind === 'level') go('levels', { diff: cfg.diff }); else go('setup', { kind: cfg.kind, mode: cfg.mode, diff: cfg.diff, ai: cfg.ais && cfg.ais.length ? cfg.ais : undefined }); };

  function showResults(info) {
    const { world, results, mine } = info, solo = world.players.length === 1;
    let title, lines = [], extra = [], nextBtn = null, newBest = false, bestTxt = '', isLevel = false;
    const mineP = meId ? world.byId.get(meId) : null;
    if (!meId) title = T('本局結束');
    else if (mode === 'race') title = mine && mine.dnf ? T('時間到，沒能抵達終點') : solo ? T('抵達終點！') : mine.place === 1 ? T('你第一個抵達！') : T('第 {place} 名', { place: mine.place });
    else if (mode === 'stars') title = solo ? T('時間到！') : mine.place === 1 ? T('你是星星王！') : T('第 {place} 名', { place: mine.place });
    else title = solo ? T('掉下去了…') : mine.alive ? T('你是最後的贏家！') : mine.place === 1 ? T('你贏了！') : T('第 {place} 名', { place: mine.place });
    // 紀錄與闖關進度（只有單機）
    if (!online && mineP) {
      if (cfg && cfg.kind === 'level' && mode === 'race' && mine && !mine.dnf) {
        const st = MR.levelStars(mine.time, world.maze), saved = store.setLevelStars(cfg.diff, cfg.level, st);
        const lk = 'lv-' + cfg.diff + '-' + cfg.level; newBest = store.recordBest(lk, mine.time, true); bestTxt = fmtShort(store.getBest(lk)); isLevel = true;
        lines.push(h('p', { class: 'resLevel', text: T(MR.DIFFS[cfg.diff]) + ' · ' + T('第 {x1} 關', { x1: cfg.level }) }),
          h('div', { class: 'resStars', role: 'img', 'aria-label': st + ' / 3 ' + T('星星') }, [0, 1, 2].map((i) => h('span', { class: 'rs' + (i < st ? ' on' : ''), style: { animationDelay: (0.15 + i * 0.18) + 's' } }, icon('star')))));
        if (cfg.level < 100) nextBtn = Button({ label: T('下一關（第 {x1} 關）', { x1: cfg.level + 1 }), variant: 'primary', onClick: () => { resultM.close(); startLocal(Object.assign({}, cfg, { level: cfg.level + 1 })); } });
        else lines.push(h('p', { class: 'note', text: T('這個難度的 100 關全部通過了！') }));
      } else if (cfg && cfg.kind === 'practice' && mine) {
        const key = mode + '-' + diff; let nb = false, val = '';
        if (mode === 'race' && !mine.dnf) { nb = store.recordBest(key, mine.time, true); val = fmtShort(mine.time); }
        else if (mode === 'stars') { nb = store.recordBest(key, mine.score, false); val = T('{n} 顆星星', { n: mine.score }); }
        else if (mode === 'collapse') { nb = store.recordBest(key, mine.time, false); val = T('存活 {t} 秒', { t: mine.time.toFixed(2) }); }
        if (nb) newBest = true;
        const bst = store.getBest(key);
        if (bst != null) bestTxt = mode === 'race' ? fmtShort(bst) : mode === 'stars' ? T('{n} 顆星星', { n: bst }) : T('存活 {t} 秒', { t: (+bst).toFixed(2) });
      }
    }
    const shapes = store.get('shapes');
    const table = h('div', { class: 'rtable' }, results.map((r) => {
      const pl = world.byId.get(r.id); const v = mode === 'race' ? (r.dnf ? T('未完賽') : fmtShort(r.time)) : mode === 'stars' ? r.score + ' ★' : r.alive ? T('最後倖存') : T('存活 {t} 秒', { t: r.time.toFixed(2) });
      return h('div', { class: 'rrow' + (r.id === meId ? ' me' : '') }, h('span', { class: 'rk', text: String(r.place) }), h('span', { class: 'dot', style: { background: BALL_COLORS[pl.idx % 8] }, text: shapes ? SHAPES[pl.idx % 8] : '' }), h('span', { class: 'nm', text: who(pl.name, r.id === meId) }), h('span', { class: 'val', text: v }));
    }));
    let again, back, home;
    if (!online) {
      again = Button({ label: T('再來一局'), variant: nextBtn ? '' : 'primary', onClick: () => { resultM.close(); againLocal(); } });
      back = Button({ label: T('回到房間'), title: T('回到這個模式的設定／選關畫面'), ariaLabel: T('回到房間（設定畫面）'), onClick: () => { resultM.close(); backLocal(); } });
    } else {
      const isHost = session.room && session.room.host === session.you;
      again = Button({ label: isHost ? T('再來一局') : T('再來一局（請房主開始）'), variant: 'primary', disabled: !meId, onClick: function () { net.send({ t: 'rematch' }); if (!isHost) { this.disabled = true; toast(T('已通知房主，等房主開始')); } } });
      back = Button({ label: T('回到房間'), onClick: () => { net.send({ t: 'back' }); resultM.close(); go('room'); } });
    }
    home = Button({ label: T('回到首頁'), onClick: () => { resultM.close(); if (online) net.send({ t: 'leave' }); go('home'); } });
    const tiles = [];
    if (meId && mine) {
      if (!isLevel) tiles.push({ k: T('名次'), v: mode === 'race' && mine.dnf ? '—' : mine.place + ' / ' + world.players.length });
      const mainV = mode === 'race' ? (mine.dnf ? T('未完賽') : fmtShort(mine.time)) : mode === 'stars' ? mine.score + ' ★' : mine.alive ? T('最後倖存') : T('{t} 秒', { t: mine.time.toFixed(2) });
      tiles.push({ k: mode === 'race' ? T('用時') : mode === 'stars' ? T('星星數') : T('存活時間'), v: mainV, badge: newBest ? T('新紀錄') : '' });
      if (bestTxt) tiles.push({ k: isLevel ? T('本關最佳') : T('本機最佳'), v: bestTxt, span: !isLevel });
    }
    const tileEl = tiles.length ? h('dl', { class: 'resStats' }, tiles.map((t) => h('div', { class: 'resStat' + (t.span ? ' span' : '') }, h('dt', {}, h('span', { text: t.k }), t.badge ? h('b', { class: 'resBadgeTag', text: t.badge }) : null), h('dd', { text: t.v })))) : null;
    const won = !!meId && (mode === 'race' ? !!mine && !mine.dnf && (solo || mine.place === 1) : mode === 'stars' ? !!mine && (solo || mine.place === 1) : !!mine && (solo ? false : (mine.alive || mine.place === 1)));
    const hero = h('div', { class: 'resHero' }, h('div', { class: 'resBadge', 'aria-hidden': 'true' }, icon(mode === 'race' ? 'flag' : mode === 'stars' ? 'star' : 'crown')), lines.length ? h('div', { class: 'resLines' }, ...lines) : null);
    resultM = Modal({ title, class: 'resultModal m-' + mode + (won ? ' win' : ' lose'), dismissible: false, transparent: true, body: h('div', { class: 'result' }, hero, tileEl, table, nextBtn ? h('div', { class: 'nextRow' }, nextBtn) : null), actions: [again, back, home] });
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
    else if (m.t === 'err') toast(M(m.msg));
    else game.net(m);
  };
  if (online) session.subs.add(sub);
  const key = (e) => { if ((e.key === 'r' || e.key === 'R') && !e.repeat && !modalOpen() && !(e.target && /input|textarea/i.test(e.target.tagName))) { doRespawn(); return; }
    if (e.key === 'Escape' && !online && !modalOpen()) { e.preventDefault(); openPause(); } };
  const vis = () => { if (document.hidden && !online) openPause(); };
  addEventListener('keydown', key); document.addEventListener('visibilitychange', vis);
  return () => {
    clearInterval(rsT); removeEventListener('keydown', key); document.removeEventListener('visibilitychange', vis); mq.removeEventListener('change', onMq); offStore();
    session.subs.delete(sub); if (mapM) mapM.close('home'); if (resultM) resultM.close(); if (pauseM) pauseM.close('home');
    game.stop(); input.destroy(); if (activeGame === game) activeGame = null;
  };
}

const SCREENS = { home: homeScreen, levels: levelsScreen, setup: setupScreen, online: onlineScreen, room: roomScreen, game: gameScreen };

// ---------- 開機 ----------
function inviteFromHash() {
  const m = /^#\/join\/([A-Za-z0-9]{3,8})\/([A-Za-z0-9]{6,32})$/.exec(location.hash || '');
  return m ? { code: m[1].toUpperCase(), token: m[2] } : null;
}
function boot() { applyLang(); const inv = inviteFromHash(); if (inv) go('online', { invite: inv }); else go('home'); }
// 已開著遊戲時又點了邀請連結：同樣先到大廳確認暱稱（不自動入房）
addEventListener('hashchange', () => { const inv = inviteFromHash(); if (inv && !session.room && current !== 'game') go('online', { invite: inv }); });
window.__MRAPP = { go, startLocal, session, getGame: () => activeGame, store };
boot();
