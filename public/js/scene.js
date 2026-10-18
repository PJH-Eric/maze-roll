// 3D 場景：木質玩具迷宮（Three.js）。斜俯視跟隨鏡頭、木紋牆與地板、玻璃彈珠、星星、崩塌地磚。
import * as THREE from '../vendor/three.module.min.js';

export const BALL_COLORS = ['#d94a3d', '#3d7bd9', '#3fae5a', '#f0b323', '#9b59d0', '#f07b2b', '#e86aa6', '#dcdcdc'];
export const BALL_NAMES = ['紅', '藍', '綠', '黃', '紫', '橘', '粉', '白']; // 顯示時再 T()
export const SHAPES = ['●', '■', '▲', '◆', '★', '✚', '⬟', '⬢'];
const R = (typeof window !== 'undefined' && window.MR && window.MR.PHYS.R) || 0.36, T = 0.12, WALL_H = 0.8;
const CAM_DIST = [6.4, 8.6, 12];
const THEMES = (typeof window !== 'undefined' && window.MR && window.MR.DIFF_THEME) || [];

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function grain(base, dark, n, seed) {
  return (g, w, h) => {
    let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const y = r() * h, a = 0.05 + r() * 0.16; g.strokeStyle = dark.replace('A', a.toFixed(2)); g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * (2 + r() * 5));
      g.stroke();
    }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,30,10,${(r() * 0.05).toFixed(3)})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
  };
}
function ballTex(color) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, h * 0.44, w, h * 0.12);
    g.fillStyle = 'rgba(0,0,0,0.28)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(w * (i + 0.5) / 4, h * 0.2, 11, 0, 7); g.fill(); g.beginPath(); g.arc(w * (i + 0.5) / 4, h * 0.8, 11, 0, 7); g.fill(); }
  });
}
export const BALL_TYPES = [{ id: 'glass', name: '玻璃珠' }, { id: 'wood', name: '木球' }, { id: 'steel', name: '鐵球' }, { id: 'rainbow', name: '彩虹球' }]; // 顯示時再 T()
const TRAIL_N = 14;
/** 依球種建立材質：玻璃（預設）、木球（木紋＋玩家色環）、鐵球（金屬）、彩虹球（漸層）。 */
function ballMat(type, color) {
  if (type === 'wood') return new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, map: canvasTex(256, 128, (g, w, h) => {
    grain('#c98f55', 'rgba(70,32,10,A)', 24, 5)(g, w, h); g.fillStyle = color; g.fillRect(0, h * 0.42, w, h * 0.16); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, h * 0.455, w, h * 0.03); }) });
  if (type === 'steel') return new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.95, color: 0xd8dde3, map: canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#e4e8ec'; g.fillRect(0, 0, w, h); g.fillStyle = color; g.fillRect(0, h * 0.44, w, h * 0.12); g.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 6; i++) g.fillRect(0, i * h / 6, w, 2); }) });
  if (type === 'rainbow') return new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.2, map: canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); ['#e8453c', '#f5a623', '#f8e04a', '#4cbf5a', '#3d8ee0', '#8e5bd0', '#e8453c'].forEach((c, i) => gr.addColorStop(i / 6, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, h * 0.44, w, h * 0.12); }) });
  return new THREE.MeshStandardMaterial({ map: ballTex(color), roughness: 0.18, metalness: 0.25 });
}
function labelTex(name, idx, me, shapes) {
  return canvasTex(320, 96, (g, w, h) => {
    g.fillStyle = 'rgba(30,18,10,0.82)'; const x = 4, y = 6, ww = w - 8, hh = h - 12, rr = 20;
    g.beginPath(); g.moveTo(x + rr, y); g.arcTo(x + ww, y, x + ww, y + hh, rr); g.arcTo(x + ww, y + hh, x, y + hh, rr); g.arcTo(x, y + hh, x, y, rr); g.arcTo(x, y, x + ww, y, rr); g.closePath(); g.fill();
    g.lineWidth = me ? 5 : 3; g.strokeStyle = me ? '#ffd24a' : BALL_COLORS[idx % 8]; g.stroke();
    g.fillStyle = BALL_COLORS[idx % 8]; g.font = 'bold 44px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(shapes ? SHAPES[idx % 8] : '●', 46, h / 2 + 2);
    g.fillStyle = '#fff'; g.textAlign = 'left';
    let fs = 40; const fam = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
    g.font = `bold ${fs}px ${fam}`; while (g.measureText(name).width > 214 && fs > 22) { fs -= 2; g.font = `bold ${fs}px ${fam}`; }
    let t = name; while (g.measureText(t).width > 214 && t.length > 1) t = t.slice(0, -1);
    g.fillText(t, 82, h / 2 + 3);
  });
}
function starShape() {
  const s = new THREE.Shape(); const o = 0.38, i = 0.17;
  for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? i : o; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; k ? s.lineTo(x, y) : s.moveTo(x, y); }
  s.closePath(); return s;
}

export class Scene3D {
  constructor(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas; this.reduce = !!opts.reduce; this.camMode = 1; this.shapes = !!opts.shapes; this.ballType = opts.ballType || 'glass'; this.trail = opts.trail !== false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 160);
    this.hemi = new THREE.HemisphereLight(0xfff0d8, 0x5a3a24, 1.05); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 1.7); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024); const sc = this.sun.shadow.camera; sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 40; this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.focus = new THREE.Vector3(); this.focusReady = false; this.time = 0;
    this.tex = {}; this.root = null; this.balls = new Map(); this.stars = new Map(); this.parts = [];
    this.shake = 0;
  }
  setCam(i) { this.camMode = i; }
  resize(w, h) {
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.aspect = w / h;
  }
  _clear() {
    if (!this.root) return;
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } });
    this.scene.remove(this.root); this.root = null; this.balls.clear(); this.stars.clear(); this.parts = [];
  }
  /** 依世界建立場景。me 為自己的玩家 id（可為 null：觀戰）。 */
  load(world, me) {
    this._clear();
    const m = world.maze, W = m.w, H = m.h, root = (this.root = new THREE.Group());
    this.scene.add(root); this.world = world; this.me = me; this.maze = m;
    const collapse = world.mode === 'collapse';
    const th = THEMES[Math.max(0, Math.min(4, world.diff | 0))];
    const bg = collapse ? 0x1d130c : th.bg; this.scene.background = new THREE.Color(bg); this.scene.fog = new THREE.Fog(bg, 16, collapse ? 34 : 46);
    const maple = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, grain(th.floor, th.floorLine, 46, 11), [Math.max(1, W / 3), Math.max(1, H / 3)]), roughness: 0.78 });
    const walnut = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, grain(th.wall, th.wallLine, 40, 7)), roughness: 0.62 });
    const table = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, grain(th.table, 'rgba(20,8,2,A)', 50, 3), [40, 40]), roughness: 0.9 });
    // 桌面（崩塌模式放得很深當作深淵）
    const tbl = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), table); tbl.rotation.x = -Math.PI / 2; tbl.position.set(W / 2, collapse ? -14 : -0.32, H / 2); tbl.receiveShadow = !collapse; root.add(tbl);
    if (!collapse) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.3, H + 0.5), maple); board.position.set(W / 2, -0.15, H / 2); board.receiveShadow = true; root.add(board);
    } else {
      this.tileMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.22, 0.96), maple, m.n); this.tileMesh.receiveShadow = true; this.tileMesh.castShadow = true;
      this.tileState = new Uint8Array(m.n); this.tileT = new Float32Array(m.n); this.tileActive = new Set();
      const mat = new THREE.Matrix4(), col = new THREE.Color();
      for (let i = 0; i < m.n; i++) {
        mat.makeTranslation((i % W) + 0.5, -0.11, ((i / W) | 0) + 0.5); this.tileMesh.setMatrixAt(i, mat);
        const v = 0.9 + ((i * 2654435761) % 100) / 700; this.tileMesh.setColorAt(i, col.setRGB(v, v * 0.97, v * 0.93));
      }
      this.tileMesh.instanceMatrix.needsUpdate = true; this.tileMesh.instanceColor.needsUpdate = true; root.add(this.tileMesh);
      if (world.tile) for (let i = 0; i < m.n; i++) if (world.tile[i]) this._tile(i, world.tile[i], true);
    }
    // 牆（實例化）
    const walls = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = m.cells[y * W + x];
      if (c & 1) walls.push([x + 0.5, y, 1 + T, T]);
      if (c & 8) walls.push([x, y + 0.5, T, 1 + T]);
      if (x === W - 1 && (c & 2)) walls.push([x + 1, y + 0.5, T, 1 + T]);
      if (y === H - 1 && (c & 4)) walls.push([x + 0.5, y + 1, 1 + T, T]);
    }
    const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, 1), walnut, walls.length); wm.castShadow = true; wm.receiveShadow = true;
    const mt = new THREE.Matrix4(), sc = new THREE.Vector3(), q = new THREE.Quaternion();
    walls.forEach((w, i) => { mt.compose(new THREE.Vector3(w[0], WALL_H / 2, w[1]), q, sc.set(w[2], 1, w[3])); wm.setMatrixAt(i, mt); });
    wm.instanceMatrix.needsUpdate = true; root.add(wm);
    if (th.trim) { // 神話：牆頂金邊
      const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 1), new THREE.MeshStandardMaterial({ color: th.trim, metalness: 0.6, roughness: 0.3, emissive: 0x4a3600 }), walls.length);
      walls.forEach((w, i) => { mt.compose(new THREE.Vector3(w[0], WALL_H + 0.02, w[1]), q, sc.set(w[2] + 0.02, 1, w[3] + 0.02)); tm.setMatrixAt(i, mt); });
      tm.instanceMatrix.needsUpdate = true; root.add(tm);
    }
    // 終點（競速）
    if (world.mode === 'race') {
      const g = new THREE.Group(); const gc = { x: (m.goal % W) + 0.5, y: ((m.goal / W) | 0) + 0.5 }; g.position.set(gc.x, 0, gc.y);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.46, 28), new THREE.MeshBasicMaterial({ color: 0x1a0d06 })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.012; g.add(hole);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 10, 32), new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.6, roughness: 0.3, emissive: 0x6a4700 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.04; g.add(ring);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0xf4ead2 })); pole.position.set(0.28, 0.42, -0.28); g.add(pole);
      const fg = new THREE.PlaneGeometry(0.42, 0.26); fg.translate(0.21, 0, 0); const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: 0xd4473a, side: THREE.DoubleSide })); flag.position.set(0.29, 0.74, -0.28); g.add(flag);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 2.2, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); beam.position.y = 1.1; g.add(beam);
      root.add(g); this.goal = { g, flag, beam, ring };
    } else this.goal = null;
    // 星星
    if (world.mode === 'stars') { this.starGeo = new THREE.ExtrudeGeometry(starShape(), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 }); this.starGeo.translate(0, 0, -0.035); this.starMat = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.55, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.6 }); world.stars.forEach((s) => this._addStar(s.id, s.c)); }
    // 球
    this.players = world.players;
    this.ballGeo = this.ballGeo || new THREE.SphereGeometry(R, 28, 20);
    world.players.forEach((p) => this._addBall(p));
    this.focusReady = false; this.cacheViewer = null;
    this.particleGeo = new THREE.SphereGeometry(0.035, 6, 4);
  }
  _addBall(p) {
    const idx = p.idx, me = p.id === this.me;
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(this.ballGeo, ballMat(me ? this.ballType : 'glass', BALL_COLORS[idx % 8]));
    mesh.castShadow = true; g.add(mesh);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(p.name, idx, me, this.shapes), depthTest: false, transparent: true }));
    label.scale.set(1.15, 0.345, 1); label.position.y = 1.05; label.renderOrder = 20; g.add(label);
    let ring = null;
    if (me) { ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.2, R * 1.7, 36), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring); }
    const trailMeshes = []; const tmat = new THREE.MeshBasicMaterial({ color: BALL_COLORS[idx % 8], transparent: true, opacity: 0.4, depthWrite: false });
    for (let k = 0; k < TRAIL_N; k++) { const tm = new THREE.Mesh(this.particleGeo, tmat); tm.visible = false; this.root.add(tm); trailMeshes.push(tm); }
    this.root.add(g);
    this.balls.set(p.id, { g, mesh, label, ring, trailMeshes, hist: [], lastTx: p.x, lastTy: p.y, lx: p.x, ly: p.y, fall: 0, fallV: 0, sink: 0, hidden: false, p });
  }
  setBall(type) { // 換球種（只影響自己的球）
    this.ballType = type; if (!this.root) return;
    const b = this.balls.get(this.me); if (!b) return;
    if (b.mesh.material.map) b.mesh.material.map.dispose(); b.mesh.material.dispose();
    b.mesh.material = ballMat(type, BALL_COLORS[b.p.idx % 8]);
  }
  setTrail(on) { this.trail = on; if (!on && this.balls) this.balls.forEach((b) => { b.hist.length = 0; b.trailMeshes.forEach((m) => { m.visible = false; }); }); }
  setShapes(on) { // 色彩輔助：標籤改用形狀區分
    this.shapes = on; if (!this.root) return;
    this.balls.forEach((b) => { b.label.material.map.dispose(); b.label.material.map = labelTex(b.p.name, b.p.idx, b.p.id === this.me, on); b.label.material.needsUpdate = true; });
  }
  _addStar(id, c) {
    const m = this.maze, mesh = new THREE.Mesh(this.starGeo, this.starMat); mesh.castShadow = true;
    mesh.scale.setScalar(1.35); mesh.position.set((c % m.w) + 0.5, 0.46, ((c / m.w) | 0) + 0.5); mesh.userData.ph = (id * 1.7) % 6.28; this.root.add(mesh); this.stars.set(id, mesh);
    mesh.scale.setScalar(0.01); mesh.userData.grow = 0;
  }
  _burst(x, y, z, color, n) {
    if (this.reduce) return;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true }), s = new THREE.Mesh(this.particleGeo, mat);
      s.position.set(x, y, z); const a = Math.random() * 6.28, sp = 1 + Math.random() * 1.6;
      this.root.add(s); this.parts.push({ s, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 2, vz: Math.sin(a) * sp, life: 0.7 + Math.random() * 0.4 });
    }
  }
  _tile(i, s, instant) {
    if (!this.tileMesh) return;
    this.tileState[i] = s; this.tileT[i] = instant ? 9 : 0; this.tileActive.add(i);
  }
  onEvent(e) {
    if (e.e === 'star') {
      const mesh = this.stars.get(e.sid);
      if (mesh) { this._burst(mesh.position.x, 0.4, mesh.position.z, 0xffd24a, 14); this.root.remove(mesh); this.stars.delete(e.sid); }
      if (e.nid != null) this._addStar(e.nid, e.nc);
    } else if (e.e === 'tile') this._tile(e.c, e.s, false);
    else if (e.e === 'finish' && this.goal) this._burst(this.goal.g.position.x, 0.3, this.goal.g.position.z, 0xffd24a, 18);
  }
  /** 每幀：更新球、動畫與鏡頭。followId 為鏡頭跟隨的球。 */
  frame(dt, followId, quick) {
    this.time += dt; const t = this.time;
    // 球
    this.balls.forEach((b) => {
      const p = b.p, g = b.g;
      const dx = p.x - b.lx, dz = p.y - b.ly; b.lx = p.x; b.ly = p.y;
      const dist = Math.hypot(dx, dz);
      // 滾動：頂端朝前進方向轉（接地點相對球心往後），轉角 = 位移 / 半徑，與真實的球一致
      if (dist > 1e-5 && dist < 0.6 && p.alive && !b.sink) { const ax = new THREE.Vector3(dz, 0, -dx).normalize(); b.mesh.rotateOnWorldAxis(ax, dist / R); }
      let y = R, s = 1;
      if (!p.alive) { b.fallV += 9 * dt; b.fall += b.fallV * dt; y = R - b.fall; s = Math.max(0.2, 1 - b.fall * 0.15); if (b.fall > 9) b.hidden = true; }
      if (this.world.mode === 'race' && p.fin != null) { b.sink = Math.min(1, b.sink + dt * 2.2); y = R - b.sink * 0.3; s = 1 - b.sink * 0.45; if (b.sink >= 1) b.hidden = true; }
      g.visible = !b.hidden; g.position.set(p.x, y, p.y); b.mesh.scale.setScalar(s);
      if (this.trail && !this.reduce && p.alive && !b.hidden) {
        if (Math.hypot(p.x - b.lastTx, p.y - b.lastTy) > 0.14) { b.hist.unshift([p.x, p.y]); b.lastTx = p.x; b.lastTy = p.y; if (b.hist.length > TRAIL_N) b.hist.pop(); }
        else if (b.hist.length && dist < 1e-4 && Math.random() < 0.08) b.hist.pop();
        b.trailMeshes.forEach((m, k) => { const h = b.hist[k]; m.visible = !!h; if (h) { m.position.set(h[0], 0.035, h[1]); m.scale.setScalar(3.4 * (1 - k / TRAIL_N) + 0.5); } });
      } else if (b.hist.length) { b.hist.length = 0; b.trailMeshes.forEach((m) => { m.visible = false; }); }
      { const ls = (typeof innerWidth !== 'undefined' && innerWidth < 560) ? 0.76 : 1; b.label.scale.set(1.15 * ls, 0.345 * ls, 1); }
      b.label.position.y = 1.05 + (p.idx % 3) * 0.2 + (R - y) * -0.2; b.label.visible = p.alive || b.fall < 1.5;
      if (b.ring) { b.ring.position.y = 0.02 - (y - R); b.ring.material.opacity = 0.55 + 0.3 * Math.sin(t * 5); b.ring.scale.setScalar(1 + 0.06 * Math.sin(t * 5)); }
    });
    // 星星、終點
    this.stars.forEach((m) => {
      if (m.userData.grow < 1) { m.userData.grow = Math.min(1, m.userData.grow + dt * 3); m.scale.setScalar(Math.max(0.01, m.userData.grow * 1.35)); }
      m.rotation.y = t * 2.2 + m.userData.ph; m.position.y = 0.46 + (this.reduce ? 0 : Math.sin(t * 3 + m.userData.ph) * 0.05);
    });
    if (this.goal) { this.goal.flag.rotation.y = Math.sin(t * 4) * 0.25; this.goal.beam.material.opacity = 0.11 + 0.05 * Math.sin(t * 3); this.goal.ring.rotation.z = t * 0.6; }
    // 崩塌地磚
    if (this.tileMesh && this.tileActive.size) {
      const mt = new THREE.Matrix4(), col = new THREE.Color(), W = this.maze.w, q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
      for (const i of [...this.tileActive]) {
        this.tileT[i] += dt; const s = this.tileState[i], tt = this.tileT[i];
        const cx = (i % W) + 0.5, cz = ((i / W) | 0) + 0.5;
        if (s === 1) {
          const k = this.reduce ? 0 : Math.min(1, tt / 0.6) * 0.025;
          pos.set(cx + Math.sin(tt * 55 + i) * k, -0.11 - Math.min(0.03, tt * 0.01), cz + Math.cos(tt * 61 + i) * k); e.set(0, 0, 0); q.setFromEuler(e); sc.set(1, 1, 1);
          this.tileMesh.setColorAt(i, col.setRGB(0.95 - Math.min(0.3, tt * 0.1), 0.75 - Math.min(0.28, tt * 0.1), 0.6 - Math.min(0.25, tt * 0.1)));
        } else {
          const f = Math.min(tt, 2); const fall = 4 * f * f;
          pos.set(cx + Math.sin(i) * 0.1 * f, -0.11 - fall, cz); e.set(f * 1.2 * Math.sin(i), f * 0.6, f * 1.5 * Math.cos(i)); q.setFromEuler(e); sc.setScalar(Math.max(0.01, 1 - f * 0.35));
          this.tileMesh.setColorAt(i, col.setRGB(0.5, 0.4, 0.33));
          if (tt > 2.2) { sc.setScalar(0.0001); this.tileActive.delete(i); }
        }
        mt.compose(pos, q, sc); this.tileMesh.setMatrixAt(i, mt);
      }
      this.tileMesh.instanceMatrix.needsUpdate = true; if (this.tileMesh.instanceColor) this.tileMesh.instanceColor.needsUpdate = true;
    }
    // 粒子
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt; p.vy -= 9 * dt;
      p.s.position.x += p.vx * dt; p.s.position.y = Math.max(0.02, p.s.position.y + p.vy * dt); p.s.position.z += p.vz * dt; p.s.material.opacity = Math.max(0, p.life * 1.6);
      if (p.life <= 0) { this.root.remove(p.s); p.s.material.dispose(); this.parts.splice(i, 1); }
    }
    // 鏡頭
    const fb = this.balls.get(followId) || this.balls.values().next().value;
    if (fb) {
      const p = fb.p, tx = p.x + p.vx * 0.1, tz = p.y + p.vy * 0.1;
      if (!this.focusReady || quick) { this.focus.set(tx, 0, tz); this.focusReady = true; }
      else { const k = 1 - Math.exp(-5.5 * dt); this.focus.x += (tx - this.focus.x) * k; this.focus.z += (tz - this.focus.z) * k; }
    }
    const asp = this.aspect || 1.6, pitch = (58 * Math.PI) / 180;
    let D = CAM_DIST[this.camMode] * (asp < 1 ? Math.min(1.6, 1 / Math.sqrt(asp) * 1.05) : 1);
    this.camera.position.set(this.focus.x, 0.2 + D * Math.sin(pitch), this.focus.z + D * Math.cos(pitch));
    this.camera.lookAt(this.focus.x, 0.1, this.focus.z - 0.35);
    this.sun.position.set(this.focus.x + 4.5, 11, this.focus.z + 3); this.sun.target.position.set(this.focus.x, 0, this.focus.z);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() { this._clear(); this.renderer.dispose(); }
}
