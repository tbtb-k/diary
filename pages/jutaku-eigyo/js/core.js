/* ============================================================
 * はじめての一棟 ― 住宅営業3Dシミュレーター
 * core.js : 土台（時間の管理・データ読み込み・描画・カメラ）
 * ============================================================ */
(function () {
  'use strict';
  const T = window.THREE;
  const JE = window.JE = window.JE || {};
  const qs = new URLSearchParams(location.search);

  // ───────── 便利な小道具 ─────────
  JE.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  JE.lerp = (a, b, t) => a + (b - a) * t;
  JE.ease = {
    lin: t => t,
    inOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
    outBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    sine: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
  };
  // 毎回同じ並びになる乱数（木の配置などを固定するため）
  JE.rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  JE.$ = (sel, root) => (root || document).querySelector(sel);
  JE.el = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };
  JE.esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  JE.yen = (man) => Math.round(man).toLocaleString('ja-JP') + '万円';

  // ───────── 時間の管理（待つ・なめらかに変える） ─────────
  // run は「いま進行中の場面」の番号。タイトルへ戻るなどで番号が変わると、
  // 古い場面の待ち時間や動きはその場で打ち切られる（Abort）。
  JE.Abort = class extends Error { constructor() { super('abort'); this.isAbort = true; } };
  JE.run = 0;
  JE.fast = qs.get('fast') === '1';       // 自動テスト用：待ち時間や演出を飛ばす
  JE.time = 0;
  const tweens = new Set(), waits = new Set();
  JE.newRun = () => { JE.run++; for (const w of waits) w.rej(new JE.Abort()); waits.clear(); for (const t of tweens) if (!t.keep) { t.rej(new JE.Abort()); tweens.delete(t); } return JE.run; };
  JE.wait = (sec) => new Promise((res, rej) => { if (JE.fast || sec <= 0) return res(); waits.add({ t: sec, res, rej }); });
  // fn(0→1) を dur 秒かけて呼ぶ。keep:true は場面が切り替わっても最後まで続ける。
  JE.tween = (dur, fn, ease, opt) => new Promise((res, rej) => {
    if (JE.fast || dur <= 0) { fn(1); return res(); }
    fn(0); tweens.add({ t: 0, dur, fn, ease: ease || JE.ease.inOut, res, rej, keep: opt && opt.keep });
  });
  JE.to = (obj, props, dur, ease, opt) => { const from = {}; for (const k in props) from[k] = obj[k]; return JE.tween(dur, t => { for (const k in props) obj[k] = from[k] + (props[k] - from[k]) * t; }, ease, opt); };
  function stepTimers(dt) {
    for (const w of waits) { w.t -= dt; if (w.t <= 0) { waits.delete(w); w.res(); } }
    for (const tw of tweens) { tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(tw.ease(k)); if (k >= 1) { tweens.delete(tw); tw.res(); } }
  }

  // ───────── データの読み込み ─────────
  // 人物やモーションは base64 を包んだ JS ファイル。script タグで読むので、
  // Web サーバーに置いても、フォルダごとコピーして HTML を直接開いても動く。
  const A = JE.assets = { base: 'jutaku-eigyo/', buffers: {}, meta: {}, pending: {} };
  A.file = (key) => 'models/' + (key === 'anims' ? 'anims.js' : key.replace('avatar:', 'avatar_') + '.js');
  A.loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error('読み込めませんでした: ' + src)); document.head.appendChild(s); });
  const decode = (b64) => { const bin = atob(b64); const n = bin.length; const u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  A.need = async (keys, onProgress) => {
    let done = 0; const total = keys.length;
    await Promise.all(keys.map(key => {
      if (!A.pending[key]) A.pending[key] = (async () => {
        await A.loadScript(A.base + A.file(key));
        const pack = window.JE_ASSETS && window.JE_ASSETS[key];
        if (!pack) throw new Error('データが壊れています: ' + key);
        A.meta[key] = pack.meta; A.buffers[key] = decode(pack.data);
        delete window.JE_ASSETS[key];   // 元の文字列はもう不要なのでメモリを空ける
      })();
      return A.pending[key].then(() => { done++; if (onProgress) onProgress(done / total, key); });
    }));
  };

  // ───────── 描画 ─────────
  const G = JE.gfx = { quality: 'high', frameMs: 16, slowFrames: 0 };
  G.init = (canvas) => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
    G.isMobile = isMobile;
    const r = G.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: qs.get('shot') === '1' });
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFShadowMap;
    G.pmrem = new T.PMREMGenerator(r);
    G.maxAniso = r.capabilities.getMaxAnisotropy();
    const saved = qs.get('q') || (JE.save && JE.save.settings && JE.save.settings.quality) || 'auto';
    G.auto = saved === 'auto';
    G.setQuality(G.auto ? (isMobile ? 'low' : 'high') : saved);
    addEventListener('resize', G.resize);
  };
  G.setQuality = (q) => {
    G.quality = q; const r = G.renderer;
    G.pixelRatio = Math.min(devicePixelRatio || 1, q === 'high' ? 2 : q === 'mid' ? 1.5 : 1);
    r.setPixelRatio(G.pixelRatio);
    r.shadowMap.enabled = true;
    G.composer = null;
    if (q !== 'low') {
      const size = r.getDrawingBufferSize(new T.Vector2());
      const rt = new T.WebGLRenderTarget(size.x, size.y, { type: T.HalfFloatType, samples: q === 'high' ? 4 : 2 });
      const c = G.composer = new T.EffectComposer(r, rt);
      G.renderPass = new T.RenderPass(new T.Scene(), new T.PerspectiveCamera());
      c.addPass(G.renderPass);
      // 物と物のすき間にできる、やわらかい影（高画質のときだけ）
      G.ao = null;
      if (q === 'high' && qs.get('ao') !== '0') { G.ao = new T.GTAOPass(new T.Scene(), new T.PerspectiveCamera(), size.x, size.y); G.ao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 12 }); G.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 }); G.ao.blendIntensity = 0.85; c.addPass(G.ao);
        // ガラス・カーテン・髪の毛など、透けている物は影づけの計算から外す（外さないと窓が真っ黒になる）
        G.ao._overrideVisibility = function () { const cache = this._visibilityCache; this.scene.traverse(o => { if (!o.visible) return; const m = o.material; if (o.isPoints || o.isLine || o.userData.noAO || (o.isMesh && m && !Array.isArray(m) && (m.transparent || m.alphaTest > 0 || m.isMeshBasicMaterial))) { o.visible = false; cache.push(o); } }); }; }
      G.bloom = new T.UnrealBloomPass(new T.Vector2(size.x, size.y), 0.22, 0.75, 0.92);
      c.addPass(G.bloom);
      c.addPass(new T.OutputPass());
    }
    G.resize();
    if (JE.onQuality) JE.onQuality(q);
  };
  G.resize = () => {
    const r = G.renderer; if (!r) return;
    const w = innerWidth, h = innerHeight;
    r.setSize(w, h, false);
    if (G.composer) { G.composer.setPixelRatio(G.pixelRatio); G.composer.setSize(w, h); }
    if (JE.cam) { JE.cam.camera.aspect = w / h; JE.cam.camera.updateProjectionMatrix(); }
  };
  G.render = (scene, camera) => {
    if (G.composer) { G.renderPass.scene = scene; G.renderPass.camera = camera; if (G.ao) { G.ao.scene = scene; G.ao.camera = camera; } G.composer.render(); }
    else G.renderer.render(scene, camera);
  };
  // 動きが重い端末では、画質を自動で一段ずつ下げる
  function autoQuality(ms) {
    G.frameMs += (ms - G.frameMs) * 0.05;
    if (!G.auto || JE.fast) return;
    if (G.frameMs > 42) { if (++G.slowFrames > 90) { G.slowFrames = 0; G.frameMs = 20; const next = G.quality === 'high' ? 'mid' : G.quality === 'mid' ? 'low' : null; if (next) G.setQuality(next); } }
    else G.slowFrames = 0;
  }

  // ───────── カメラ ─────────
  const C = JE.cam = {
    camera: new T.PerspectiveCamera(40, innerWidth / innerHeight, 0.08, 400),
    pos: new T.Vector3(0, 1.6, 6), look: new T.Vector3(0, 1.2, 0), fov: 40,
    drift: 1, shake: 0, t: 0, orbit: null,
  };
  const v3 = (a) => a.isVector3 ? a.clone() : new T.Vector3(a[0], a[1], a[2]);
  // 縦長の画面では左右が切れるので、少し広角にして補う
  const fovFix = (f) => { const a = innerWidth / innerHeight; return a >= 1.45 ? f : JE.clamp(f * (1 + (1.45 - a) * 0.9), f, 84); };
  // 右側（スマホでは下側）にパネルが出ているあいだ、映像を少しずらして人物が隠れないようにする
  C.shift = 0; C.shiftT = 0; C.setShift = (on) => { C.shiftT = on ? 1 : 0; };
  C.set = (def) => { C.orbit = null; C.pos.copy(v3(def.pos)); C.look.copy(v3(def.look)); C.fov = def.fov || C.fov; C.apply(0); };
  C.shot = (def, dur, ease) => {
    C.orbit = null;
    const p0 = C.pos.clone(), l0 = C.look.clone(), f0 = C.fov, p1 = v3(def.pos), l1 = v3(def.look), f1 = def.fov || C.fov;
    return JE.tween(dur == null ? 1.4 : dur, t => { C.pos.lerpVectors(p0, p1, t); C.look.lerpVectors(l0, l1, t); C.fov = f0 + (f1 - f0) * t; }, ease || JE.ease.inOut);
  };
  // 対象のまわりをゆっくり回る（タイトルやプラン提案の画面で使う）
  // swing: [最小角, 最大角] を渡すと、ぐるっと 1 周せず、その範囲をゆっくり行き来する（家の正面側だけを見せたいとき）
  C.startOrbit = (o) => { C.orbit = Object.assign({ center: new T.Vector3(0, 2, 0), radius: 22, height: 7, angle: 0.6, speed: 0.04, fov: 34, swing: null, phase: 0 }, o); const b = C.orbit; if (b.swing) b.phase = Math.asin(JE.clamp((b.angle - (b.swing[0] + b.swing[1]) / 2) / ((b.swing[1] - b.swing[0]) / 2), -1, 1)); C.fov = b.fov; };
  const tmp = new T.Vector3();
  C.apply = (dt) => {
    C.t += dt;
    if (C.orbit) { const o = C.orbit; if (o.swing) { o.phase += o.speed * dt * 2.2; o.angle = (o.swing[0] + o.swing[1]) / 2 + (o.swing[1] - o.swing[0]) / 2 * Math.sin(o.phase); } else o.angle += o.speed * dt; C.pos.set(o.center.x + Math.sin(o.angle) * o.radius, o.height, o.center.z + Math.cos(o.angle) * o.radius); C.look.copy(o.center); }
    const cam = C.camera, d = C.orbit ? 0 : C.drift, t = C.t;
    // 手持ちカメラのような、ごくわずかな揺れ
    cam.position.copy(C.pos); cam.position.x += Math.sin(t * 0.31) * 0.012 * d; cam.position.y += Math.sin(t * 0.43 + 1.3) * 0.008 * d; cam.position.z += Math.cos(t * 0.27 + 0.4) * 0.012 * d;
    tmp.copy(C.look); tmp.x += Math.sin(t * 0.23 + 2.1) * 0.006 * d; tmp.y += Math.cos(t * 0.37) * 0.005 * d;
    cam.lookAt(tmp);
    const f = fovFix(C.fov); if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
    C.shift += (C.shiftT - C.shift) * Math.min(1, (dt || 0.016) * 4);
    if (C.shift > 0.003) { const w = innerWidth, h = innerHeight; if (w > 820) cam.setViewOffset(w, h, C.shift * 0.13 * w, 0, w, h); else cam.setViewOffset(w, h, 0, C.shift * 0.2 * h, w, h); }
    else if (cam.view && cam.view.enabled) cam.clearViewOffset();
  };

  // 3D 上の位置を画面の座標に直す（吹き出しやラベルの位置合わせに使う）
  JE.project = (p) => { tmp.copy(p).project(C.camera); return { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight, front: tmp.z < 1 }; };

  // ───────── メインループ ─────────
  JE.scene = null;                 // いま映している場面（three.js の Scene）
  JE.updaters = new Set();         // 毎フレーム呼ぶ処理
  JE.paused = false;
  JE.speed = +qs.get('speed') || 1;             // 確認用：時間の進み方を速める
  JE.noRender = qs.get('norender') === '1';   // 自動テスト用：描画を省いて速く進める
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = Math.min(0.1, (now - last) / 1000); last = now;
    if (JE.paused) return;
    const dt = raw * JE.speed; JE.time += dt;
    stepTimers(dt);
    for (const u of JE.updaters) u(dt);
    C.apply(dt);
    if (JE.scene && !JE.noRender) { const t0 = performance.now(); G.render(JE.scene, C.camera); autoQuality(Math.max(raw * 1000, performance.now() - t0)); }
  }
  JE.startLoop = () => { last = performance.now(); requestAnimationFrame(frame); };
  // 自動テストやスクリーンショット用：時間を手動で進めて 1 枚描く
  JE.stepManual = (dt, n, draw) => { for (let i = 0; i < (n || 1); i++) { JE.time += dt; stepTimers(dt); for (const u of JE.updaters) u(dt); C.apply(dt); } if (JE.scene && draw !== false) G.render(JE.scene, C.camera); };
})();
