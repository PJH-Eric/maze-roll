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
  levelStars(diff) { const a = load().levels[diff] || []; return a; },
  unlockedLevel(diff) { const a = load().levels[diff] || []; let n = 0; while (n < a.length && a[n] > 0) n++; return Math.min(100, n + 1); },
  totalStars(diff) { return (load().levels[diff] || []).reduce((a, b) => a + b, 0); },
  /** 第一個難度一開始就開放；其餘需在前一個難度累積足夠星星。 */
  diffUnlocked(diff, need) { return diff <= 0 || this.totalStars(diff - 1) >= need; },
  setLevelStars(diff, n, stars) {
    const L = load().levels; const a = (L[diff] = (L[diff] || []).slice());
    while (a.length < n) a.push(0);
    if ((a[n - 1] || 0) < stars) a[n - 1] = stars; save(); return a[n - 1];
  },
  // 最佳紀錄：race 越小越好（秒），stars 分數越大越好，collapse 存活秒數越大越好
  getBest(key) { return load().best[key]; },
  recordBest(key, v, lowerIsBetter) {
    const cur = load().best[key];
    if (cur == null || (lowerIsBetter ? v < cur : v > cur)) { load().best[key] = v; save(); return true; }
    return false;
  },
};
