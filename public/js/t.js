// 多語系輔助：T（介面文字）、M（伺服器訊息）。語言核心沿用箭頭解密的 i18n.js（zh-Hant / en）。
// 字典以「繁中原文」為鍵，英文放在 locales.js（window.MR_EN）；繁中直接顯示原文。

const fill = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] === undefined || p[k] === null ? m : String(p[k]))) : s);
export const lang = () => (window.I18N ? window.I18N.lang : 'zh-Hant');
/** T('第 {n} 關', { n: 3 })：依目前語言回傳文字；沒有英文條目時退回繁中原文。 */
export function T(zh, p) {
  const en = lang() === 'en' ? (window.MR_EN || {})[zh] : undefined;
  return fill(en !== undefined ? en : zh, p);
}
let patterns = null;
/** 伺服器送來的繁中訊息（含暱稱等變數）：先精確比對，再用字典中帶 {變數} 的條目做樣式比對。 */
export function M(text) {
  if (text == null) return '';
  text = String(text);
  if (lang() !== 'en') return text;
  const EN = window.MR_EN || {};
  if (EN[text] !== undefined) return EN[text];
  if (!patterns) {
    patterns = Object.keys(EN).filter((k) => /\{\w+\}/.test(k)).map((k) => {
      const names = []; const re = k.split(/(\{\w+\})/).map((part) => { if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return '(.+?)'; } return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('');
      return { k, names, size: k.length, re: new RegExp('^' + re + '$') };
    }).sort((a, b) => b.size - a.size);
  }
  for (const it of patterns) { const m = it.re.exec(text); if (m) { const p = {}; it.names.forEach((n, i) => { p[n] = m[i + 1]; }); return fill(EN[it.k], p); } }
  return text;
}
