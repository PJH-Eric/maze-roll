// 本機儲存（設定、闖關進度、最佳紀錄）。localStorage 不可用時退回記憶體，畫面照常運作。
const KEY = 'maze-roll.v1';
const DEFAULT = {
  bgm: true, sfx: true, bgmVol: 0.55, sfxVol: 0.8, vib: true, reduce: false,
  ctrl: 'stick', cam: 1, minimap: true, shapes: false, ball: 'glass', trail: true, name: '', side: true,
  levels: {}, best: {},
};
let mem = null;
function load() {
  if (mem) return mem;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
  mem = Object.assign({}, DEFAULT, raw || {});
  mem.levels = Object.assign({}, mem.levels); mem.best = Object.assign({}, mem.best);
  return mem;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 忽略 */ } }
const subs = new Set();
export const store = {
  get: (k) => load()[k],
  all: () => load(),
  set(k, v) { load()[k] = v; save(); subs.forEach((f) => f(k, v)); },
  reset() { const keep = { levels: load().levels, best: load().best, name: load().name }; mem = Object.assign({}, DEFAULT, keep); save(); subs.forEach((f) => f('*')); },
  on(f) { subs.add(f); return () => subs.delete(f); },
  // 闖關：每個難度一個陣列，值為 0（未過）或 1～3 星
  // 闖關進度的鍵：競速沿用原本的難度編號，逃出模式用 'e' + 難度編號（各自獨立）
  levelKey: (diff, mode) => (mode === 'escape' ? 'e' + diff : diff),
  levelStars(diff, mode) { const a = load().levels[this.levelKey(diff, mode)] || []; return a; },
  unlockedLevel(diff, mode) { const a = load().levels[this.levelKey(diff, mode)] || []; let n = 0; while (n < a.length && a[n] > 0) n++; return Math.min(100, n + 1); },
  totalStars(diff, mode) { return (load().levels[this.levelKey(diff, mode)] || []).reduce((a, b) => a + b, 0); },
  /** 五種難度一開始就全部開放（關卡仍依序解鎖）。 */
  diffUnlocked() { return true; },
  setLevelStars(diff, n, stars, mode) {
    const L = load().levels, k = this.levelKey(diff, mode); const a = (L[k] = (L[k] || []).slice());
    while (a.length < n) a.push(0);
    if ((a[n - 1] || 0) < stars) a[n - 1] = stars; save(); return a[n - 1];
  },
  ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  /** 每日挑戰的連續天數：從今天（今天還沒玩就從昨天）往回數，任一玩法／難度完成就算那天有玩。 */
  dailyStreak(today) {
    const dates = Object.keys(load().best)
      .map((key) => /^daily-(?:race-)?(\d{4}-\d{2}-\d{2})-\d+$/.exec(key))
      .filter(Boolean)
      .map((match) => match[1]);
    const done = new Set(dates);
    const d = new Date(today + 'T00:00:00'); let n = 0; if (!done.has(today)) d.setDate(d.getDate() - 1);
    while (done.has(this.ymd(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },
  // 最佳紀錄：race 越小越好（秒），stars 分數越大越好，collapse 存活秒數越大越好
  getBest(key) { return load().best[key]; },
  recordBest(key, v, lowerIsBetter) {
    const cur = load().best[key];
    if (cur == null || (lowerIsBetter ? v < cur : v > cur)) { load().best[key] = v; save(); return true; }
    return false;
  },
};
