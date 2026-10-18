// 操作輸入：虛擬搖桿（預設）、手指拖曳、裝置傾斜、鍵盤。回傳 -1..1 的傾斜向量。
export class Input {
  constructor() {
    this.keys = new Set(); this.stick = [0, 0]; this.drag = [0, 0]; this.tilt = [0, 0]; this.scheme = 'stick'; this.enabled = true;
    this.beta0 = 45; this.tiltOn = false; this.area = null; this.stickEl = null; this._dragOrigin = null; this._stickId = null; this._dragId = null;
    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    this._kd = (e) => { if (typing(e)) return; const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { this.keys.add(k); if (k.startsWith('arrow')) e.preventDefault(); } };
    this._ku = (e) => this.keys.delete(e.key.toLowerCase());
    this._blur = () => this.keys.clear();
    this._ori = (e) => { if (e.gamma == null) return; this.tilt = [clamp(e.gamma / 22), clamp((e.beta - this.beta0) / 22)]; this._beta = e.beta; };
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku); addEventListener('blur', this._blur);
  }
  destroy() { removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('blur', this._blur); removeEventListener('deviceorientation', this._ori); }
  setScheme(s) { this.scheme = s; this.stick = [0, 0]; this.drag = [0, 0]; this._refresh(); }
  /** area：整個遊戲主區（拖曳用）；stickEl：搖桿外框（含 .knob 子節點）。 */
  attach(area, stickEl) {
    this.area = area; this.stickEl = stickEl;
    const knob = stickEl.querySelector('.knob');
    const setKnob = (x, y) => { knob.style.transform = `translate(${x * 38}%, ${y * 38}%)`; };
    const calc = (e) => {
      const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
      let x = (e.clientX - cx) / rad, y = (e.clientY - cy) / rad; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      const dz = 0.1, mm = Math.hypot(x, y); if (mm < dz) return [0, 0];
      const s = (mm - dz) / (1 - dz); return [(x / mm) * Math.min(1, s * 1.15), (y / mm) * Math.min(1, s * 1.15)];
    };
    stickEl.addEventListener('pointerdown', (e) => { e.preventDefault(); stickEl.setPointerCapture(e.pointerId); this._stickId = e.pointerId; this.stick = calc(e); setKnob(this.stick[0], this.stick[1]); stickEl.classList.add('active'); });
    stickEl.addEventListener('pointermove', (e) => { if (e.pointerId !== this._stickId) return; this.stick = calc(e); setKnob(this.stick[0], this.stick[1]); });
    const end = (e) => { if (e.pointerId !== this._stickId) return; this._stickId = null; this.stick = [0, 0]; setKnob(0, 0); stickEl.classList.remove('active'); };
    stickEl.addEventListener('pointerup', end); stickEl.addEventListener('pointercancel', end);
    area.addEventListener('pointerdown', (e) => {
      if (this.scheme !== 'drag' || e.target.closest('button,.panelSide,.modal,.stickZone,.chatBox')) return;
      this._dragId = e.pointerId; this._dragOrigin = [e.clientX, e.clientY]; this.drag = [0, 0];
    });
    area.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._dragId || !this._dragOrigin) return;
      const dx = (e.clientX - this._dragOrigin[0]) / 55, dy = (e.clientY - this._dragOrigin[1]) / 55; const m = Math.hypot(dx, dy);
      this.drag = m > 1 ? [dx / m, dy / m] : [dx, dy];
    });
    const dend = (e) => { if (e.pointerId === this._dragId) { this._dragId = null; this._dragOrigin = null; this.drag = [0, 0]; } };
    area.addEventListener('pointerup', dend); area.addEventListener('pointercancel', dend);
    this._refresh();
  }
  _refresh() { if (this.stickEl) this.stickEl.parentElement.style.display = this.scheme === 'stick' ? '' : 'none'; if (this.scheme === 'tilt') this.enableTilt(); }
  async enableTilt() {
    if (this.tiltOn) return true;
    try {
      const D = window.DeviceOrientationEvent;
      if (D && typeof D.requestPermission === 'function') { const r = await D.requestPermission(); if (r !== 'granted') return false; }
      addEventListener('deviceorientation', this._ori); this.tiltOn = true; return true;
    } catch (e) { return false; }
  }
  calibrate() { if (this._beta != null) this.beta0 = this._beta; }
  vec() {
    if (!this.enabled) return [0, 0];
    let kx = 0, ky = 0; const k = this.keys;
    if (k.has('arrowleft') || k.has('a')) kx -= 1; if (k.has('arrowright') || k.has('d')) kx += 1;
    if (k.has('arrowup') || k.has('w')) ky -= 1; if (k.has('arrowdown') || k.has('s')) ky += 1;
    if (kx || ky) { const m = Math.hypot(kx, ky); return [kx / m, ky / m]; }
    if (this.scheme === 'stick') return this.stick;
    if (this.scheme === 'drag') return this.drag;
    if (this.scheme === 'tilt') return this.tilt;
    return [0, 0];
  }
}
const clamp = (v) => Math.max(-1, Math.min(1, v));
