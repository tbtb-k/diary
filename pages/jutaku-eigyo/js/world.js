/* ============================================================
 * world.js : 3D の共通部品（形を組み立てる道具・空・木・光の時間帯）
 * ============================================================ */
(function () {
  'use strict';
  const T = window.THREE, JE = window.JE;
  const W = JE.world = {};

  // 面の向きに合わせて、テクスチャを「実寸」で貼る（s メートルで 1 回くり返す）
  function worldUV(geo, s) {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / s, p.getZ(i) / s);
      else if (ax >= az) uv.setXY(i, p.getZ(i) / s, p.getY(i) / s);
      else uv.setXY(i, p.getX(i) / s, p.getY(i) / s);
    }
  }

  // ───────── 形を組み立てる道具 ─────────
  // 動かない物は最後に素材ごとに 1 つへまとめる（描画の回数が減って軽くなる）。
  class Builder {
    constructor() { this.buckets = new Map(); this.m = new T.Matrix4(); this.stack = []; }
    // 以降に作る形を、位置 (x,y,z)・向き ry でまとめて動かす
    at(x, y, z, ry, fn) { this.stack.push(this.m.clone()); this.m.multiply(new T.Matrix4().makeTranslation(x, y, z)); if (ry) this.m.multiply(new T.Matrix4().makeRotationY(ry)); fn(); this.m = this.stack.pop(); return this; }
    add(geo, mat, o) {
      o = o || {};
      geo.applyMatrix4(this.m);
      if (o.uv) worldUV(geo, o.uv);
      const key = mat.uuid + (o.cast === false ? 'n' : 'c') + (o.recv === false ? 'n' : 'r');
      if (!this.buckets.has(key)) this.buckets.set(key, { mat, cast: o.cast !== false, recv: o.recv !== false, list: [] });
      this.buckets.get(key).list.push(geo.index ? geo.toNonIndexed() : geo);
      return this;
    }
    box(mat, x0, x1, y0, y1, z0, z1, o) { const g = new T.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return this.add(g, mat, o); }
    // 角を丸めた箱（中心と大きさで指定）
    rbox(mat, cx, cy, cz, w, h, d, r, o) { const g = new T.RoundedBoxGeometry(w, h, d, 3, Math.min(r || 0.02, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); if (o && o.rot) g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(o.rot[0], o.rot[1], o.rot[2]))); g.translate(cx, cy, cz); return this.add(g, mat, o); }
    cyl(mat, cx, cy, cz, rt, rb, h, seg, o) { const g = new T.CylinderGeometry(rt, rb, h, seg || 20); if (o && o.rot) g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(o.rot[0], o.rot[1], o.rot[2]))); g.translate(cx, cy, cz); return this.add(g, mat, o); }
    sphere(mat, cx, cy, cz, r, o) { const g = new T.SphereGeometry(r, (o && o.seg) || 18, (o && o.seg2) || 12); if (o && o.scale) g.scale(o.scale[0], o.scale[1], o.scale[2]); g.translate(cx, cy, cz); return this.add(g, mat, o); }
    // 壁。axis 'x' は東西に伸びる壁（z=c の位置）、'z' は南北に伸びる壁（x=c の位置）。
    // holes: [{a0,a1,y0,y1}] の四角い穴（窓やドア）をあけられる。
    wall(mat, axis, c, a0, a1, y0, y1, holes, o) {
      const t = (o && o.t) || 0.12, hs = holes || [];
      const seg = (s0, s1, b0, b1) => { if (s1 - s0 < 0.001 || b1 - b0 < 0.001) return; if (axis === 'x') this.box(mat, s0, s1, b0, b1, c - t / 2, c + t / 2, o); else this.box(mat, c - t / 2, c + t / 2, b0, b1, s0, s1, o); };
      // 穴の左右の端で壁をたてに区切り、区切りごとに「穴でない高さ」だけを積む。
      // こうすると、上下に並んだ窓（掃き出し窓の上の高窓など）でも正しく穴があく。
      const xs = [a0, a1]; for (const h of hs) { if (h.a0 > a0 && h.a0 < a1) xs.push(h.a0); if (h.a1 > a0 && h.a1 < a1) xs.push(h.a1); }
      xs.sort((p, q) => p - q);
      for (let i = 0; i < xs.length - 1; i++) {
        const s0 = xs[i], s1 = xs[i + 1], mid = (s0 + s1) / 2; if (s1 - s0 < 0.001) continue;
        const cuts = hs.filter(h => mid > h.a0 && mid < h.a1).map(h => [Math.max(y0, h.y0), Math.min(y1, h.y1)]).sort((p, q) => p[0] - q[0]);
        let y = y0; for (const [c0, c1] of cuts) { seg(s0, s1, y, c0); y = Math.max(y, c1); }
        seg(s0, s1, y, y1);
      }
      return this;
    }
    build(parent) {
      const out = [];
      for (const b of this.buckets.values()) { const g = T.BufferGeometryUtils.mergeGeometries(b.list, false); const m = new T.Mesh(g, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; m.matrixAutoUpdate = false; parent.add(m); out.push(m); for (const l of b.list) l.dispose(); }
      this.buckets.clear(); return out;
    }
  }
  W.Builder = Builder;
  W.worldUV = worldUV;

  // ───────── 空（上から地平線へのグラデーション） ─────────
  W.makeSky = () => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(new T.SphereGeometry(320, 24, 16), new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false }));
    mesh.renderOrder = -10;
    const col = (h) => '#' + h.toString(16).padStart(6, '0');
    mesh.userData.paint = (top, mid, horizon) => { const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, col(top)); gr.addColorStop(0.36, col(mid)); gr.addColorStop(0.5, col(horizon)); gr.addColorStop(0.52, col(horizon)); gr.addColorStop(1, col(horizon)); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); tex.needsUpdate = true; };
    return mesh;
  };
  // ふんわりした雲（板に模様を貼ったもの）
  let cloudTex = null;
  W.makeClouds = (n, seed) => {
    if (!cloudTex) { const nz = JE.mat.makeNoise(77), s = 128, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), d = g.createImageData(s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const u = x / s - 0.5, v = y / s - 0.5, r = Math.hypot(u * 1.0, v * 1.9), f = nz.fbm(x / 20, y / 20, 4); const a = JE.clamp((0.5 - r) * 2.4, 0, 1) * JE.clamp((f - 0.32) * 3, 0, 1); const i = (y * s + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a * 235; }
      g.putImageData(d, 0, 0); cloudTex = new T.CanvasTexture(c); cloudTex.colorSpace = T.SRGBColorSpace; }
    const grp = new T.Group(), r = JE.rng(seed || 5);
    for (let i = 0; i < n; i++) { const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 })); const a = r() * Math.PI * 2, d = 150 + r() * 110, s = 60 + r() * 80; m.position.set(Math.sin(a) * d, 55 + r() * 55, Math.cos(a) * d); m.scale.set(s, s * 0.42, 1); m.lookAt(0, 20, 0); m.renderOrder = -9; grp.add(m); }
    grp.userData.update = (dt) => { grp.rotation.y += dt * 0.004; };
    grp.userData.tint = (color, op) => grp.children.forEach(m => { m.material.color.setHex(color); m.material.opacity = op; });
    return grp;
  };

  // ───────── 木・低木・鉢植え ─────────
  // こんもりした葉のかたまり（球を少し歪ませたもの）
  function blob(r, seed, detail) {
    let g = new T.IcosahedronGeometry(r, detail == null ? 3 : detail); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = T.BufferGeometryUtils.mergeVertices(g, 1e-4);
    const p = g.attributes.position, nz = JE.mat.makeNoise(seed), v = new T.Vector3(), uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 0.8 + nz.fbm(v.x * 1.6 / r + 5, v.y * 1.6 / r + v.z * 1.3 / r + 3, 3) * 0.46; v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z); uv[i * 2] = (Math.atan2(v.z, v.x) / 6.283 + 0.5) * Math.max(1, r * 2.2); uv[i * 2 + 1] = (v.y / r * 0.5 + 0.5) * Math.max(1, r * 1.4); }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
  }
  W.blob = blob;
  // 生け垣：でこぼこのある長い箱
  W.hedge = (b, x0, z0, x1, z1, h, w, seed) => {
    const len = Math.hypot(x1 - x0, z1 - z0), nz = JE.mat.makeNoise(seed || 9); let g = new T.BoxGeometry(len, h, w, Math.max(4, Math.round(len * 2.5)), 4, 3); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = T.BufferGeometryUtils.mergeVertices(g, 1e-4);
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = nz.fbm(x * 1.1 + 3, y * 1.4 + z * 1.2 + 7, 3) - 0.5; p.setXYZ(i, x, y + (y > 0 ? k * 0.35 : 0), z + k * 0.3 * Math.sign(z || 1)); uv[i * 2] = x * 0.9 + z; uv[i * 2 + 1] = y * 0.9; }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.computeVertexNormals(); g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, h / 2 - 0.3, (z0 + z1) / 2); b.add(g, JE.mat.leafDark);
  };
  W.tree = (b, x, z, h, seed, kind) => {
    const M = JE.mat, r = JE.rng(seed || 1), s = h / 5;
    b.at(x, 0, z, r() * 6, () => {
      if (kind === 'conifer') { b.cyl(M.trunk, 0, h * 0.2, 0, 0.07 * s, 0.12 * s, h * 0.4, 8); for (let i = 0; i < 3; i++) { const g = blob((1.05 - i * 0.24) * s, (seed || 1) * 7 + i); g.scale(1, 1.35, 1); g.translate(0, h * (0.45 + i * 0.2), 0); b.add(g, i % 2 ? M.leaf : M.leafDark); } return; }
      const th = h * 0.42; b.cyl(M.trunk, 0, th / 2, 0, 0.09 * s, 0.16 * s, th, 8);
      b.cyl(M.trunk, 0.22 * s, th * 1.05, 0.05 * s, 0.04 * s, 0.07 * s, th * 0.5, 6, { rot: [0, 0, -0.55] });
      b.cyl(M.trunk, -0.2 * s, th * 1.02, -0.08 * s, 0.04 * s, 0.07 * s, th * 0.46, 6, { rot: [0.2, 0, 0.6] });
      const mats = [M.leaf, M.leafLight, M.leafDark];
      for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = (i === 0 ? 0 : 0.55 + r() * 0.5) * s, g = blob((0.95 + r() * 0.5) * s, (seed || 1) * 13 + i); g.scale(1, 0.85, 1); g.translate(Math.cos(a) * d, th + (0.75 + r() * 0.9) * s, Math.sin(a) * d); b.add(g, mats[i % 3]); }
    });
  };
  W.shrub = (b, x, z, s, seed) => { const M = JE.mat, g = blob(s, seed || 3, 2); g.scale(1.15, 0.75, 1.0); g.translate(x, s * 0.55, z); b.add(g, [M.leaf, M.leafLight, M.leafDark][(seed || 0) % 3]); };
  // 室内の観葉植物
  W.plant = (b, x, z, h, seed) => {
    const M = JE.mat, r = JE.rng(seed || 2);
    b.at(x, 0, z, 0, () => {
      b.cyl(M.pot, 0, 0.19, 0, 0.19, 0.14, 0.38, 20); b.cyl(M.soil, 0, 0.375, 0, 0.175, 0.175, 0.02, 20);
      const n = 9; for (let i = 0; i < n; i++) { const a = i / n * 6.28 + r(), lean = 0.25 + r() * 0.5, len = h * (0.55 + r() * 0.45);
        const stem = new T.CylinderGeometry(0.008, 0.012, len, 5); stem.translate(0, len / 2, 0); stem.applyMatrix4(new T.Matrix4().makeRotationZ(-lean)); stem.applyMatrix4(new T.Matrix4().makeRotationY(a)); stem.translate(0, 0.38, 0); b.add(stem, M.leafDark);
        const leaf = new T.SphereGeometry(0.16 + r() * 0.07, 10, 6); leaf.scale(1, 0.06, 0.62); leaf.translate(0.1, 0, 0); leaf.applyMatrix4(new T.Matrix4().makeRotationZ(0.5 - lean)); leaf.translate(Math.sin(lean) * len, Math.cos(lean) * len, 0); leaf.applyMatrix4(new T.Matrix4().makeRotationY(a)); leaf.translate(0, 0.38, 0); b.add(leaf, i % 3 ? M.leaf : M.leafLight); }
    });
  };

  // ───────── 光の時間帯 ─────────
  // dir は「太陽のある方向」。+Z が南（庭側）、+X が東。
  W.TOD = {
    morning:   { dir: [0.55, 0.78, 0.62], sun: 0xfff2dc, sunI: 3.6, sky: [0x4f8fd0, 0x9cc7ec, 0xe4eef4], hemiI: 0.3, hemiSky: 0xdfeaf5, hemiGround: 0xcbb99e, exposure: 0.92, lamps: 0.5, cloud: [0xffffff, 0.9], env: 1.0 },
    noon:      { dir: [-0.18, 0.92, 0.46], sun: 0xfffaf0, sunI: 3.8, sky: [0x3f82cc, 0x8fc0ea, 0xdfeaf2], hemiI: 0.32, hemiSky: 0xe6eef6, hemiGround: 0xcfc0a6, exposure: 0.9, lamps: 0.45, cloud: [0xffffff, 0.92], env: 1.0 },
    afternoon: { dir: [-0.62, 0.62, 0.55], sun: 0xffe6bf, sunI: 3.7, sky: [0x4a86c6, 0xa4c6e2, 0xf0e6d4], hemiI: 0.28, hemiSky: 0xe9e6e0, hemiGround: 0xcdb596, exposure: 0.94, lamps: 0.65, cloud: [0xfff3e0, 0.9], env: 0.95 },
    sunset:    { dir: [-0.8, 0.27, 0.5], sun: 0xffb070, sunI: 3.2, sky: [0x39527f, 0xe89a6a, 0xffc98a], hemiI: 0.2, hemiSky: 0xd7c2c4, hemiGround: 0xb58f6e, exposure: 1.05, lamps: 1.25, cloud: [0xffc09a, 0.85], env: 0.8 },
    night:     { dir: [-0.5, 0.5, 0.35], sun: 0x8aa2d8, sunI: 0.5, sky: [0x0a1226, 0x16254a, 0x2c3a5c], hemiI: 0.1, hemiSky: 0x6f84b5, hemiGround: 0x3a3440, exposure: 1.1, lamps: 2.0, cloud: [0x6a7896, 0.35], env: 0.35 },
  };
  // 場面（Scene）に、太陽・空の明るさ・室内の灯りをまとめて持たせる
  W.lightings = [];
  JE.onQuality = (q) => { for (const L of W.lightings) L.setShadowQuality(q); };
  W.makeLighting = (scene, { shadowBox = 14, shadowSize = 4096, target = [0, 0, 0] } = {}) => {
    const L = { tod: null };
    L.sun = new T.DirectionalLight(0xffffff, 3); L.sun.castShadow = true;
    // 影のきめ細かさは画質に合わせる（画質が途中で変わったら作り直す）
    L.setShadowQuality = (q) => { const size = q === 'high' ? shadowSize : q === 'mid' ? shadowSize / 2 : Math.min(1024, shadowSize / 4); if (L.sun.shadow.mapSize.x === size) return; L.sun.shadow.mapSize.setScalar(size); if (L.sun.shadow.map) { L.sun.shadow.map.dispose(); L.sun.shadow.map = null; } };
    L.setShadowQuality(JE.gfx.quality); W.lightings.push(L);
    Object.assign(L.sun.shadow.camera, { left: -shadowBox, right: shadowBox, top: shadowBox, bottom: -shadowBox, near: 1, far: 90 });
    L.sun.shadow.bias = -0.0004; L.sun.shadow.normalBias = 0.035; L.sun.shadow.radius = 2.2;
    L.sun.target.position.set(target[0], target[1], target[2]); scene.add(L.sun, L.sun.target);
    L.hemi = new T.HemisphereLight(0xffffff, 0xccbba0, 0.8); scene.add(L.hemi);
    L.sky = W.makeSky(); scene.add(L.sky);
    L.clouds = W.makeClouds(9, 5); scene.add(L.clouds);
    L.lamps = [];            // { light, base } 室内の灯り
    L.glow = [];             // 灯りに合わせて光らせる素材
    L.cur = null;
    const lerpHex = (a, b, t) => new T.Color(a).lerp(new T.Color(b), t);
    L.apply = (p) => {
      L.cur = p; const d = new T.Vector3(p.dir[0], p.dir[1], p.dir[2]).normalize();
      L.sun.position.copy(L.sun.target.position).addScaledVector(d, 40); L.sun.color.set(p.sun); L.sun.intensity = p.sunI;
      L.hemi.intensity = p.hemiI; L.hemi.color.set(p.hemiSky); L.hemi.groundColor.set(p.hemiGround);
      L.sky.userData.paint(new T.Color(p.sky[0]).getHex(), new T.Color(p.sky[1]).getHex(), new T.Color(p.sky[2]).getHex());
      L.clouds.userData.tint(new T.Color(p.cloud[0]).getHex(), p.cloud[1]);
      for (const l of L.lamps) l.light.intensity = l.base * p.lamps;
      for (const g of L.glow) g.mat.emissiveIntensity = g.base * (0.35 + p.lamps * 0.65);
      JE.gfx.renderer.toneMappingExposure = p.exposure; scene.environmentIntensity = p.env;
      if (L.onApply) L.onApply(p, d);
    };
    const mixP = (a, b, t) => ({ dir: a.dir.map((v, i) => v + (b.dir[i] - v) * t), sun: lerpHex(a.sun, b.sun, t), sunI: JE.lerp(a.sunI, b.sunI, t), sky: a.sky.map((v, i) => lerpHex(v, b.sky[i], t)), hemiI: JE.lerp(a.hemiI, b.hemiI, t), hemiSky: lerpHex(a.hemiSky, b.hemiSky, t), hemiGround: lerpHex(a.hemiGround, b.hemiGround, t), exposure: JE.lerp(a.exposure, b.exposure, t), lamps: JE.lerp(a.lamps, b.lamps, t), cloud: [lerpHex(a.cloud[0], b.cloud[0], t), JE.lerp(a.cloud[1], b.cloud[1], t)], env: JE.lerp(a.env, b.env, t) });
    L.mix = mixP;
    L.set = (name) => { L.tod = name; L.apply(W.TOD[name]); };
    // 時間帯をなめらかに変える
    L.go = (name, dur) => { const from = L.cur, to = W.TOD[name]; L.tod = name; return JE.tween(dur == null ? 2 : dur, t => L.apply(mixP(from, to, t)), JE.ease.inOut, { keep: true }); };
    L.update = (dt) => L.clouds.userData.update(dt);
    return L;
  };
  // 室内の灯り（影は落とさない点光源）
  W.lamp = (L, scene, x, y, z, intensity, color, dist) => { const p = new T.PointLight(color || 0xffe2bd, intensity, dist || 7, 1.6); p.position.set(x, y, z); scene.add(p); L.lamps.push({ light: p, base: intensity }); return p; };
})();
