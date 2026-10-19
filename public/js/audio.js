// 音訊：全部用 WebAudio 即時合成（木琴風 BGM 與音效），不依賴外部素材，沒有授權問題。
// 第一次使用者手勢後解鎖；背景音樂與音效各自獨立開關／音量。
import { store } from './store.js';

let ctx = null, master = null, bgmGain = null, sfxGain = null, noiseBuf = null, rollNode = null, bgmTimer = null, step = 0, nextT = 0;
const NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]; // C 大調五聲
const PROG = [[0, 2, 4], [1, 3, 5], [2, 4, 6], [3, 5, 7]];

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  try {
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); sfxGain = ctx.createGain(); bgmGain.connect(master); sfxGain.connect(master);
    const len = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    applyVol(); return true;
  } catch (e) { ctx = null; return false; }
}
function applyVol() {
  if (!ctx) return;
  bgmGain.gain.value = store.get('bgm') ? store.get('bgmVol') * 0.5 : 0;
  sfxGain.gain.value = store.get('sfx') ? store.get('sfxVol') : 0;
}
function tone(freq, t, dur, vol, type, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || sfxGain); o.start(t); o.stop(t + dur + 0.05);
}
function mallet(freq, t, vol) { // 木琴：基音 + 高八度短促泛音
  tone(freq, t, 0.45, vol, 'sine', bgmGain); tone(freq * 4, t, 0.09, vol * 0.35, 'triangle', bgmGain);
}
function schedule() {
  if (!ctx || !bgmTimer) return;
  while (nextT < ctx.currentTime + 0.35) {
    const bar = Math.floor(step / 8) % PROG.length, k = step % 8, chord = PROG[bar];
    if (k % 2 === 0) mallet(NOTES[chord[(k / 2) % 3]] / 2, nextT, 0.5);
    const mel = [0, 2, 1, 2, 0, 1, 2, 1][k]; if (k !== 3 && k !== 7) mallet(NOTES[chord[mel]] * (k % 4 === 1 ? 1 : 2), nextT, 0.28);
    nextT += 0.27; step++;
  }
}
function sfxOn() { return ensure() && store.get('sfx'); }

export const audio = {
  ready() { return !!ctx; },
  unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); applyVol(); },
  refresh() { applyVol(); },
  bgm(on) {
    if (!ensure()) return;
    if (on && !bgmTimer) { step = 0; nextT = ctx.currentTime + 0.1; bgmTimer = setInterval(schedule, 120); }
    else if (!on && bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  },
  click() { if (!sfxOn()) return; tone(660, ctx.currentTime, 0.08, 0.25, 'triangle'); },
  beep(final, high = final) { if (!sfxOn()) return; tone(high ? 1046 : 523, ctx.currentTime, final ? 0.4 : 0.15, 0.4, 'square'); },
  star() { if (!sfxOn()) return; const t = ctx.currentTime; [784, 988, 1319].forEach((f, i) => tone(f, t + i * 0.06, 0.2, 0.3, 'triangle')); },
  starOther() { if (!sfxOn()) return; tone(880, ctx.currentTime, 0.12, 0.12, 'triangle'); },
  thud(v) { if (!sfxOn()) return; const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = 380; g.gain.setValueAtTime(Math.min(0.5, 0.08 * v), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + 0.12); },
  crack() { if (!sfxOn()) return; const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 1800; g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + 0.08); },
  fall() { if (!sfxOn()) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.7); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.8); },
  win() { if (!sfxOn()) return; const t = ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.11, 0.35, 0.35, 'triangle')); },
  lose() { if (!sfxOn()) return; const t = ctx.currentTime; [392, 330, 262].forEach((f, i) => tone(f, t + i * 0.16, 0.35, 0.3, 'triangle')); },
  finish() { if (!sfxOn()) return; const t = ctx.currentTime; [659, 880].forEach((f, i) => tone(f, t + i * 0.09, 0.3, 0.3, 'triangle')); },
  chat() { if (!sfxOn()) return; tone(988, ctx.currentTime, 0.07, 0.15, 'sine'); },
  /** 滾動聲：連續低頻雜訊，音量與音高隨速度改變（每幀呼叫）。 */
  roll(speed) {
    if (!ctx || !store.get('sfx')) { if (rollNode) { rollNode.g.gain.value = 0; } return; }
    if (!rollNode) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 220; f.Q.value = 0.8; g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(sfxGain); s.start(); rollNode = { s, f, g };
    }
    const v = Math.min(1, speed / 3.6);
    rollNode.g.gain.value = v * 0.09; rollNode.f.frequency.value = 160 + v * 380;
  },
  vibrate(ms) { if (store.get('vib') && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* 不支援 */ } } },
};
store.on(() => audio.refresh());
