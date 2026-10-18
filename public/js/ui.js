// 自訂 UI 元件：所有玩家可見的控制項（按鈕、開關、滑桿、選單、捲軸、彈窗、輸入）都在這裡封裝外觀與互動。
// 底層保留語意標籤與 ARIA／鍵盤／焦點，但不顯示瀏覽器預設控制項或原生捲軸。

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'on') for (const ev in v) el.addEventListener(ev, v[ev]);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

const P = {
  gear: '<g><rect x="10.500" y="1.500" width="3" height="5" rx="1.500"/><rect x="10.500" y="17.500" width="3" height="5" rx="1.500"/><rect x="1.500" y="10.500" width="5" height="3" rx="1.500"/><rect x="17.500" y="10.500" width="5" height="3" rx="1.500"/><rect x="10.500" y="1.500" width="3" height="5" rx="1.500" transform="rotate(45 12 12)"/><rect x="10.500" y="17.500" width="3" height="5" rx="1.500" transform="rotate(45 12 12)"/><rect x="1.500" y="10.500" width="5" height="3" rx="1.500" transform="rotate(45 12 12)"/><rect x="17.500" y="10.500" width="5" height="3" rx="1.500" transform="rotate(45 12 12)"/></g><path fill-rule="evenodd" d="M12 4.800a7.200 7.200 0 1 0 0 14.400 7.200 7.200 0 1 0 0-14.400zM12 9.200a2.800 2.800 0 1 1 0 5.600 2.800 2.800 0 1 1 0-5.600z"/>',
  home: '<path d="M3 11.500 12 4l9 7.500M6 10.500V20h12v-9.500M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/>',
  back: '<path d="M14.500 5 7.500 12l7 7" fill="none" stroke="currentColor" stroke-width="2.800" stroke-linecap="round" stroke-linejoin="round"/>',
  star: '<path d="M12 2.600l2.900 6 6.500.9-4.700 4.600 1.100 6.500L12 17.500l-5.800 3.100 1.100-6.500L2.600 9.500l6.500-.9z"/>',
  flag: '<path d="M6 21V3m0 1h11l-2.500 4L17 12H6" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"/>',
  chat: '<path d="M4 5h16v11H10l-5 4v-4H4z" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linejoin="round"/>',
  pause: '<rect x="6" y="5" width="4.200" height="14" rx="1"/><rect x="13.800" y="5" width="4.200" height="14" rx="1"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2.200"/><path d="M5 15V6a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/>',
  eye: '<path d="M2 12s3.600-6.500 10-6.500S22 12 22 12s-3.600 6.500-10 6.500S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.200"/><circle cx="12" cy="12" r="3"/>',
  people: '<circle cx="9" cy="8" r="3.200"/><path d="M3 20c0-3.500 2.700-6 6-6s6 2.500 6 6z"/><circle cx="17" cy="9" r="2.600"/><path d="M16.500 14.200c2.900.2 4.800 2.300 4.800 5.300h-4.300"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.800" stroke-linecap="round"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  minus: '<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  lock: '<rect x="5" y="10.500" width="14" height="10" rx="2"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500" fill="none" stroke="currentColor" stroke-width="2.200"/>',
  crown: '<path d="M3 8l4.500 4L12 5l4.500 7L21 8l-2 11H5z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.600 0l3-3a4 4 0 0 0-5.600-5.600l-1 1M14 10a4 4 0 0 0-5.600 0l-3 3a4 4 0 0 0 5.600 5.600l1-1" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/>',
};
export function icon(name, cls) {
  const s = h('span', { class: 'ico' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
  s.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor">' + (P[name] || '') + '</svg>';
  return s;
}

// ---------- 按鈕 ----------
export function Button(o) {
  const b = h('button', {
    type: 'button', class: 'btn ' + (o.variant || '') + (o.size ? ' ' + o.size : '') + (o.class ? ' ' + o.class : ''),
    'aria-label': o.ariaLabel || null, disabled: o.disabled || null, title: o.title || null,
  });
  if (o.icon) b.append(icon(o.icon));
  if (o.label != null) b.append(h('span', { class: 'lbl', text: o.label }));
  if (o.sub) b.append(h('small', { text: o.sub }));
  if (o.onClick) b.addEventListener('click', (e) => { if (!b.disabled) o.onClick(e); });
  return b;
}
export const IconButton = (o) => Button(Object.assign({ class: 'iconbtn' }, o, { label: null }));

// ---------- 開關 ----------
export function Toggle(o) {
  let val = !!o.value;
  const knob = h('span', { class: 'tknob' });
  const b = h('button', { type: 'button', role: 'switch', class: 'toggle', 'aria-checked': String(val), 'aria-label': o.label }, knob);
  const sync = () => { b.setAttribute('aria-checked', String(val)); b.classList.toggle('on', val); };
  b.addEventListener('click', () => { val = !val; sync(); o.onChange && o.onChange(val); });
  sync();
  const row = h('div', { class: 'row' }, h('span', { class: 'rowLabel', text: o.label }), b);
  row.set = (v) => { val = !!v; sync(); };
  return row;
}

// ---------- 滑桿 ----------
export function Slider(o) {
  const min = o.min != null ? o.min : 0, max = o.max != null ? o.max : 1, step = o.step || 0.05;
  let val = o.value;
  const fill = h('div', { class: 'fill' }), thumb = h('div', { class: 'thumb' });
  const track = h('div', { class: 'track' }, fill, thumb);
  const el = h('div', { class: 'slider', role: 'slider', tabindex: '0', 'aria-label': o.label, 'aria-valuemin': min, 'aria-valuemax': max }, track);
  const sync = () => { const f = (val - min) / (max - min); fill.style.width = f * 100 + '%'; thumb.style.left = f * 100 + '%'; el.setAttribute('aria-valuenow', val.toFixed(2)); el.setAttribute('aria-valuetext', Math.round(f * 100) + '%'); };
  const setFrom = (clientX, commit) => {
    const r = track.getBoundingClientRect();
    let f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    val = Math.round((min + f * (max - min)) / step) * step; val = Math.min(max, Math.max(min, val)); sync();
    o.onChange && o.onChange(val, commit);
  };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); setFrom(e.clientX, false); el.dataset.drag = '1'; });
  el.addEventListener('pointermove', (e) => { if (el.dataset.drag) setFrom(e.clientX, false); });
  el.addEventListener('pointerup', (e) => { if (el.dataset.drag) { delete el.dataset.drag; setFrom(e.clientX, true); } });
  el.addEventListener('keydown', (e) => {
    const k = e.key; let d = 0;
    if (k === 'ArrowRight' || k === 'ArrowUp') d = step; else if (k === 'ArrowLeft' || k === 'ArrowDown') d = -step; else return;
    e.preventDefault(); val = Math.min(max, Math.max(min, +(val + d).toFixed(4))); sync(); o.onChange && o.onChange(val, true);
  });
  sync();
  const row = h('div', { class: 'row sliderRow' }, h('span', { class: 'rowLabel', text: o.label }), el);
  row.set = (v) => { val = v; sync(); };
  return row;
}

// ---------- 單選晶片 ----------
export function Chips(o) {
  let val = o.value;
  const wrap = h('div', { class: 'chips' + (o.class ? ' ' + o.class : ''), role: 'radiogroup', 'aria-label': o.label || '' });
  const btns = o.options.map((opt) => {
    const b = h('button', { type: 'button', role: 'radio', class: 'chip', 'aria-checked': 'false', tabindex: '-1' }, opt.icon ? icon(opt.icon) : null, h('span', { text: opt.label }), opt.sub ? h('small', { text: opt.sub }) : null);
    b.addEventListener('click', () => { if (opt.disabled) return; val = opt.value; sync(); o.onChange && o.onChange(val); });
    if (opt.disabled) b.disabled = true;
    return b;
  });
  const sync = () => btns.forEach((b, i) => { const on = o.options[i].value === val; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  wrap.addEventListener('keydown', (e) => {
    const i = o.options.findIndex((x) => x.value === val); let n = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % o.options.length; else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + o.options.length) % o.options.length; else return;
    e.preventDefault(); val = o.options[n].value; sync(); btns[n].focus(); o.onChange && o.onChange(val);
  });
  wrap.append(...btns); sync();
  wrap.set = (v) => { val = v; sync(); };
  return wrap;
}

// ---------- 自製下拉選單 ----------
export function Select(o) {
  let val = o.value, pop = null;
  const lbl = h('span', { class: 'selLabel' });
  const btn = h('button', { type: 'button', class: 'select', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': o.label }, lbl, h('span', { class: 'caret', 'aria-hidden': 'true', text: '▾' }));
  const sync = () => { const cur = o.options.find((x) => x.value === val); lbl.textContent = cur ? cur.label : ''; };
  const close = () => { if (!pop) return; pop.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true); };
  const outside = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(); };
  const open = () => {
    pop = h('div', { class: 'popover', role: 'listbox', 'aria-label': o.label });
    o.options.forEach((opt) => {
      const it = h('button', { type: 'button', role: 'option', class: 'opt' + (opt.value === val ? ' on' : ''), 'aria-selected': String(opt.value === val), text: opt.label });
      it.addEventListener('click', () => { val = opt.value; sync(); close(); btn.focus(); o.onChange && o.onChange(val); });
      pop.append(it);
    });
    (document.getElementById('popRoot') || document.body).append(pop);
    const r = btn.getBoundingClientRect(), ph = o.options.length * 40 + 12;
    pop.style.minWidth = r.width + 'px';
    pop.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, r.left)) + 'px';
    const below = innerHeight - r.bottom > ph + 8;
    pop.style.top = below ? r.bottom + 4 + 'px' : Math.max(8, r.top - ph - 4) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    const on = pop.querySelector('.on') || pop.firstChild; on && on.focus();
  };
  btn.addEventListener('click', () => (pop ? close() : open()));
  btn.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) { e.stopPropagation(); close(); } }, true);
  sync();
  btn.set = (v) => { val = v; sync(); };
  btn.destroy = close;
  return btn;
}

// ---------- 自訂捲動區（含自繪捲軸）----------
export function ScrollArea(content, o) {
  o = o || {};
  const view = h('div', { class: 'sa-view', tabindex: '0', role: 'region', 'aria-label': o.label || '可捲動內容' }, content);
  const vTrack = h('div', { class: 'sa-track v', 'aria-hidden': 'true' }, h('div', { class: 'sa-thumb' }));
  const hTrack = h('div', { class: 'sa-track hz', 'aria-hidden': 'true' }, h('div', { class: 'sa-thumb' }));
  const root = h('div', { class: 'sa' + (o.class ? ' ' + o.class : '') }, view, vTrack, o.horizontal ? hTrack : null);
  const vt = vTrack.firstChild, ht = hTrack.firstChild;
  function update() {
    const { scrollTop: st, scrollHeight: sh, clientHeight: ch, scrollLeft: sl, scrollWidth: sw, clientWidth: cw } = view;
    const needV = sh > ch + 1, needH = o.horizontal && sw > cw + 1;
    vTrack.style.display = needV ? '' : 'none'; hTrack.style.display = needH ? '' : 'none';
    root.classList.toggle('scrollable', needV || needH);
    if (needV) { const th = Math.max(28, (ch / sh) * vTrack.clientHeight); vt.style.height = th + 'px'; vt.style.transform = `translateY(${(st / (sh - ch)) * (vTrack.clientHeight - th)}px)`; }
    if (needH) { const tw = Math.max(28, (cw / sw) * hTrack.clientWidth); ht.style.width = tw + 'px'; ht.style.transform = `translateX(${(sl / (sw - cw)) * (hTrack.clientWidth - tw)}px)`; }
  }
  view.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(view);
  new MutationObserver(update).observe(content, { childList: true, subtree: true });
  const drag = (track, thumb, vertical) => {
    thumb.addEventListener('pointerdown', (e) => {
      e.preventDefault(); thumb.setPointerCapture(e.pointerId);
      const start = vertical ? e.clientY : e.clientX, s0 = vertical ? view.scrollTop : view.scrollLeft;
      const move = (ev) => {
        const d = (vertical ? ev.clientY : ev.clientX) - start;
        const room = (vertical ? track.clientHeight - thumb.offsetHeight : track.clientWidth - thumb.offsetWidth) || 1;
        const span = vertical ? view.scrollHeight - view.clientHeight : view.scrollWidth - view.clientWidth;
        if (vertical) view.scrollTop = s0 + (d / room) * span; else view.scrollLeft = s0 + (d / room) * span;
      };
      const up = () => { thumb.removeEventListener('pointermove', move); thumb.removeEventListener('pointerup', up); };
      thumb.addEventListener('pointermove', move); thumb.addEventListener('pointerup', up);
    });
    track.addEventListener('pointerdown', (e) => {
      if (e.target === thumb) return;
      const r = thumb.getBoundingClientRect();
      if (vertical) view.scrollTop += (e.clientY < r.top ? -1 : 1) * view.clientHeight * 0.9; else view.scrollLeft += (e.clientX < r.left ? -1 : 1) * view.clientWidth * 0.9;
    });
  };
  drag(vTrack, vt, true); if (o.horizontal) drag(hTrack, ht, false);
  root.view = view; root.update = update; root.scrollToEnd = () => { view.scrollTop = view.scrollHeight; };
  requestAnimationFrame(update);
  return root;
}

// ---------- 輸入框 ----------
export function TextInput(o) {
  const inp = h('input', { type: 'text', class: 'field', maxlength: o.maxLength || 40, placeholder: o.placeholder || '', 'aria-label': o.label || o.placeholder || '輸入', autocomplete: 'off', spellcheck: 'false', enterkeyhint: o.enter || 'done' });
  inp.value = o.value || '';
  inp.addEventListener('input', () => o.onInput && o.onInput(inp.value));
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') o.onEnter && o.onEnter(inp.value); });
  return inp;
}

// ---------- 彈窗（焦點鎖定、Esc、返回原焦點）----------
const stack = [];
export function Modal(o) {
  const root = document.getElementById('modalRoot');
  const prev = document.activeElement;
  const titleId = 'mt' + Math.random().toString(36).slice(2, 7);
  const closeBtn = o.dismissible === false ? null : IconButton({ icon: 'close', ariaLabel: '關閉', class: 'modalX', onClick: () => api.close('x') });
  const body = ScrollArea(h('div', { class: 'modalBody' }, o.body), { class: 'modalScroll' });
  const card = h('div', { class: 'modal ' + (o.class || ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'modalHead' }, h('h2', { id: titleId, text: o.title || '' }), closeBtn),
    body, o.actions && o.actions.length ? h('div', { class: 'modalActions' }, o.actions) : null);
  const scrim = h('div', { class: 'scrim' + (o.transparent ? ' soft' : '') }, card);
  const api = {
    el: card, scrim,
    close(why) {
      if (api.closed) return; api.closed = true;
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      scrim.remove(); document.removeEventListener('keydown', key, true);
      if (prev && prev.focus && document.contains(prev)) prev.focus();
      o.onClose && o.onClose(why);
    },
  };
  const key = (e) => {
    if (stack[stack.length - 1] !== api) return;
    if (e.key === 'Escape' && o.dismissible !== false) { e.preventDefault(); e.stopPropagation(); api.close('esc'); }
    else if (e.key === 'Tab') {
      const f = [...card.querySelectorAll('button:not([disabled]),input,[tabindex="0"]')].filter((x) => x.offsetParent);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', key, true);
  if (o.dismissible !== false && !o.noScrimClose) scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) api.close('scrim'); });
  root.append(scrim); stack.push(api);
  requestAnimationFrame(() => { const f = card.querySelector('.primary') || card.querySelector('button:not(.modalX)') || card; f.focus && f.focus({ preventScroll: true }); });
  return api;
}
export const modalOpen = () => stack.length > 0;

// ---------- 提示 ----------
export function toast(text, ms) {
  const root = document.getElementById('toastRoot');
  const t = h('div', { class: 'toast', role: 'status', text });
  root.append(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms || 2200);
}

// ---------- 鍵帽提示 ----------
export const Key = (s) => h('kbd', { class: 'keycap', text: s });
