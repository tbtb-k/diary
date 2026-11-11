/* ============================================================
 * lot.js : 敷地と「提案する家」の外観
 *   ・プラン（平屋/2階建て・広さ・外観スタイル・オプション）から家を組み立てる
 *   ・更地から完成までの建築タイムラプス
 * 家の正面は南（+Z）＝道路側。単位はメートル。
 * ============================================================ */
(function () {
  'use strict';
  const T = window.THREE, JE = window.JE, W = JE.world;
  const L = JE.lot = { house: null, plan: null };
  const PI = Math.PI, MOD = 0.91;                     // 木造住宅の基本寸法（910mm）
  const HX = -1.0, HZ = -1.6;                         // 家の中心
  const snap = (v) => Math.max(MOD * 4, Math.round(v / MOD) * MOD);
  const matCache = {}, cached = (key, fn) => matCache[key] || (matCache[key] = fn());

  L.STYLES = {
    modern:  { name: 'モダン',   roof: 'shed',  wall: 0x35383d, wallKind: 'ribs',   accent: 0xb98a5a, roofCol: 0x2b2d31, frame: 0x1e1f22, over: 0.3 },
    natural: { name: 'ナチュラル', roof: 'gable', wall: 0xf1ece2, wallKind: 'stucco', accent: 0xc9a06c, roofCol: 0x6f5a4c, frame: 0xf4f1ea, over: 0.6 },
    wa:      { name: '和モダン',  roof: 'gable', wall: 0x2e2c2a, wallKind: 'stucco', accent: 0x8a6240, roofCol: 0x3a3c40, frame: 0x26221e, over: 0.95 },
  };
  // プランから寸法を決める
  L.dims = (plan) => {
    const floors = plan.type === 'hiraya' ? 1 : 2, area = plan.size * 3.3058 / floors;
    const Wd = snap(Math.sqrt(area * (floors === 1 ? 1.5 : 1.3))), D = snap(area / Wd), st = L.STYLES[plan.style] || L.STYLES.modern;
    const base = 0.5, fh = 2.8, top = base + floors * fh;
    return { floors, W: Wd, D, base, fh, top, st, slope: st.roof === 'shed' ? 0.17 : 0.42, x0: HX - Wd / 2, x1: HX + Wd / 2, z0: HZ - D / 2, z1: HZ + D / 2 };
  };

  // ───────── 家を組み立てる ─────────
  // 返り値 { group, stages:{名前:[Object3D…]}, options:{id:Group}, anchors:{id:Vector3}, glow:[material], dims }
  L.makeHouse = (plan, o) => {
    o = o || {};
    const M = JE.mat, d = L.dims(plan), st = d.st, opt = plan.options || new Set(), has = (k) => opt.has ? opt.has(k) : opt.indexOf(k) >= 0;
    const group = new T.Group(), stages = {}, options = {}, anchors = {};
    // 外壁などの素材は、同じ色なら使い回す（毎回作ると画像の計算で待たされるため）
    const wallMat = cached('wall' + plan.style, () => st.wallKind === 'ribs' ? M.ribs(st.wall, [6, 1]) : M.stucco(st.wall));
    const accent = cached('accent' + plan.style, () => { const tx = M.planks({ seed: 71, size: 256, rows: 5, base: st.accent, dark: new T.Color(st.accent).multiplyScalar(0.72).getHex(), gap: 0.02, gapDark: 0.6, bump: 1.5 }); for (const k in tx) { tx[k].rotation = PI / 2; } return new T.MeshStandardMaterial(Object.assign({ roughness: 0.75 }, tx)); });   // たて張りの板
    const roofMat = cached('roof' + plan.style, () => M.ribs(st.roofCol, [10, 1])), frameMat = cached('frame' + plan.style, () => M.color(st.frame, { roughness: 0.5, metalness: 0.4 }));
    // 窓ガラス：昼は空を映し、夜は室内の明かりで光る
    const glass = new T.MeshStandardMaterial({ color: has('insulation') ? 0x4a625e : 0x4a5a6c, roughness: 0.06, metalness: 0.62, emissive: 0xffb866, emissiveIntensity: 0, envMapIntensity: 1.2 });
    const stage = (name, fn) => { const b = new W.Builder(), g = new T.Group(); g.name = name; fn(b); b.build(g); for (const m of g.children) m.matrixAutoUpdate = true; group.add(g); (stages[name] = stages[name] || []).push(g); return g; };
    const { x0, x1, z0, z1, base, top, W: Wd, D } = d, cx = HX, cz = HZ;

    // 正面（南）の窓とドアの配置
    const doorX = x1 - 1.55, bigW = Math.min(3.4, Wd * 0.38), bigX = x0 + 0.9 + bigW / 2, atrium = has('atrium') && d.floors === 2;
    const southHoles = [{ a0: doorX - 0.5, a1: doorX + 0.5, y0: base, y1: base + 2.25, door: true }, { a0: bigX - bigW / 2, a1: bigX + bigW / 2, y0: base + 0.02, y1: atrium ? base + d.fh + 2.0 : base + 2.2, n: 3 }];
    if (Wd > 9.5) southHoles.push({ a0: cx - 0.2, a1: cx + 1.4, y0: base + 0.02, y1: base + 2.2, n: 2 });
    if (d.floors === 2) { if (!atrium) southHoles.push({ a0: bigX - 0.9, a1: bigX + 0.9, y0: base + d.fh + 0.9, y1: base + d.fh + 2.0, n: 2 }); southHoles.push({ a0: x1 - 2.6, a1: x1 - 0.9, y0: base + d.fh + 0.9, y1: base + d.fh + 2.0, n: 2 }); }
    const sideHoles = (zc) => { const hs = [{ a0: zc - 0.6, a1: zc + 0.6, y0: base + 1.0, y1: base + 2.0, n: 2 }]; if (d.floors === 2) hs.push({ a0: zc - 0.5, a1: zc + 0.5, y0: base + d.fh + 1.0, y1: base + d.fh + 1.9, n: 1 }); return hs; };
    const northHoles = [{ a0: cx - Wd * 0.3 - 0.45, a1: cx - Wd * 0.3 + 0.45, y0: base + 1.3, y1: base + 2.0, n: 1 }, { a0: cx + Wd * 0.2 - 0.6, a1: cx + Wd * 0.2 + 0.6, y0: base + 1.2, y1: base + 2.0, n: 2 }];
    if (d.floors === 2) northHoles.push({ a0: cx - 0.5, a1: cx + 0.5, y0: base + d.fh + 1.1, y1: base + d.fh + 1.9, n: 1 });

    // 屋根の高さ
    const shed = st.roof === 'shed', ridge = shed ? top + D * d.slope : top + (D / 2) * d.slope, ov = st.over;

    // ── 基礎 ──
    stage('foundation', b => { b.box(M.concrete, x0 - 0.04, x1 + 0.04, 0, base - 0.06, z0 - 0.04, z1 + 0.04, { uv: 2 }); });

    // ── 骨組み（柱・梁・たる木）。タイムラプスのときだけ作る ──
    if (o.frame) {
      const wood = M.color(0xdcc39a, { roughness: 0.8 }), fr = stages.frame = [];
      const post = (x, y0, y1, z) => { const m = new T.Mesh(new T.BoxGeometry(0.105, y1 - y0, 0.105), wood); m.position.set(x, (y0 + y1) / 2, z); m.castShadow = true; m.userData.kind = 'post'; m.userData.floorY = y0; group.add(m); fr.push(m); };
      const beam = (xa, za, xb, zb, y) => { const len = Math.hypot(xb - xa, zb - za), m = new T.Mesh(new T.BoxGeometry(len, 0.21, 0.105), wood); m.position.set((xa + xb) / 2, y, (za + zb) / 2); m.rotation.y = -Math.atan2(zb - za, xb - xa); m.castShadow = true; m.userData.kind = 'beam'; m.userData.floorY = y; group.add(m); fr.push(m); };
      const nx = Math.round(Wd / (MOD * 2)), nz = Math.round(D / (MOD * 2));
      for (let f = 0; f < d.floors; f++) {
        const y0 = base + f * d.fh, y1 = y0 + d.fh - 0.2;
        for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { const edge = i === 0 || i === nx || j === 0 || j === nz; if (edge || (i % 2 === 0 && j % 2 === 0)) post(x0 + Wd * i / nx, y0, y1, z0 + D * j / nz); }
        for (let j = 0; j <= nz; j += (nz % 2 ? 1 : 2)) beam(x0, z0 + D * j / nz, x1, z0 + D * j / nz, y1 + 0.1);
        for (let i = 0; i <= nx; i += (nx % 2 ? 1 : 2)) beam(x0 + Wd * i / nx, z0, x0 + Wd * i / nx, z1, y1 + 0.1);
      }
      // たる木
      const nr = Math.round(Wd / MOD);
      for (let i = 0; i <= nr; i++) { const x = x0 + Wd * i / nr; const mk = (za, ya, zb, yb) => { const len = Math.hypot(zb - za, yb - ya), m = new T.Mesh(new T.BoxGeometry(0.06, 0.12, len), wood); m.position.set(x, (ya + yb) / 2 + 0.06, (za + zb) / 2); m.rotation.x = -Math.atan2(yb - ya, zb - za); m.castShadow = true; m.userData.kind = 'rafter'; m.userData.floorY = top; group.add(m); fr.push(m); };
        if (shed) mk(z0 - ov, ridge + ov * d.slope, z1 + ov, top - ov * d.slope); else { mk(z0 - ov, top - ov * d.slope, cz, ridge); mk(cz, ridge, z1 + ov, top - ov * d.slope); } }
    }

    // ── 屋根 ──
    stage('roof', b => {
      const slab = (za, ya, zb, yb) => { const len = Math.hypot(zb - za, yb - ya), g = new T.BoxGeometry(Wd + ov * 2, 0.14, len); g.rotateX(-Math.atan2(yb - ya, zb - za)); g.translate(cx, (ya + yb) / 2 + 0.2, (za + zb) / 2); W.worldUV(g, 4.5); b.add(g, roofMat); };
      if (shed) slab(z0 - ov, ridge + ov * d.slope, z1 + ov, top - ov * d.slope);
      else { slab(z0 - ov, top - ov * d.slope, cz + 0.03, ridge + 0.012); slab(cz - 0.03, ridge + 0.012, z1 + ov, top - ov * d.slope); b.box(M.color(st.roofCol, { roughness: 0.5, metalness: 0.5 }), x0 - ov, x1 + ov, ridge + 0.2, ridge + 0.3, cz - 0.12, cz + 0.12); }
      // 軒どい
      b.cyl(M.color(st.frame, { roughness: 0.5, metalness: 0.5 }), cx, top - ov * d.slope + 0.1, z1 + ov + 0.05, 0.05, 0.05, Wd + ov * 2, 8, { rot: [0, 0, PI / 2] });
    });

    // ── 外壁 ──
    const wallFace = (name, fn) => stage('walls', fn).userData.face = name;
    wallFace('south', b => { b.wall(wallMat, 'x', z1, x0, x1, base - 0.08, top, southHoles, { uv: 3 });
      // 玄関まわりの木のアクセント
      b.box(accent, doorX - 1.15, doorX + 1.15, base - 0.05, base + 2.75, z1 + 0.06, z1 + 0.09, { uv: 1.6 }); });
    wallFace('north', b => { b.wall(wallMat, 'x', z0, x0, x1, base - 0.08, shed ? ridge : top, northHoles, { uv: 3 }); });
    const gableEnd = (b, x) => { const s = new T.Shape(); if (shed) { s.moveTo(-D / 2, 0); s.lineTo(D / 2, 0); s.lineTo(D / 2, ridge - top); s.lineTo(-D / 2, 0); } else { s.moveTo(-D / 2, 0); s.lineTo(D / 2, 0); s.lineTo(0, ridge - top); s.lineTo(-D / 2, 0); }
      const g = new T.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }); g.rotateY(PI / 2); g.translate(x - 0.06, top, cz); W.worldUV(g, 3); b.add(g, wallMat); };
    // 片流れは北が高い。妻面（東西）は三角/台形の壁を足す
    wallFace('east', b => { b.wall(wallMat, 'z', x1, z0, z1, base - 0.08, top, sideHoles(cz + 0.3), { uv: 3 }); gableEnd(b, x1); });
    wallFace('west', b => { b.wall(wallMat, 'z', x0, z0, z1, base - 0.08, top, sideHoles(cz - 0.2), { uv: 3 }); gableEnd(b, x0); });
    // 室内がのぞけないよう、内側に暗い箱を入れる
    stage('walls', b => { b.box(M.color(0x15171a, { roughness: 1 }), x0 + 0.13, x1 - 0.13, base, top - 0.05, z0 + 0.13, z1 - 0.13, { cast: false, recv: false }); });

    // ── 窓・玄関ドア ──
    stage('windows', b => {
      const winAt = (axis, c, h, out) => { const f = 0.05, dd = 0.1, off = out * 0.03;
        const bar = (s0, s1, t0, t1) => axis === 'x' ? b.box(frameMat, s0, s1, t0, t1, c + off - dd / 2, c + off + dd / 2) : b.box(frameMat, c + off - dd / 2, c + off + dd / 2, t0, t1, s0, s1);
        bar(h.a0, h.a1, h.y0, h.y0 + f); bar(h.a0, h.a1, h.y1 - f, h.y1); bar(h.a0, h.a0 + f, h.y0, h.y1); bar(h.a1 - f, h.a1, h.y0, h.y1);
        for (let i = 1; i < (h.n || 1); i++) { const m = h.a0 + (h.a1 - h.a0) * i / h.n; bar(m - f / 2, m + f / 2, h.y0, h.y1); }
        if (h.y1 - h.y0 > 3) bar(h.a0, h.a1, base + d.fh - 0.1, base + d.fh + 0.1);
        const g = axis === 'x' ? new T.BoxGeometry(h.a1 - h.a0, h.y1 - h.y0, 0.02) : new T.BoxGeometry(0.02, h.y1 - h.y0, h.a1 - h.a0); g.translate(axis === 'x' ? (h.a0 + h.a1) / 2 : c, (h.y0 + h.y1) / 2, axis === 'x' ? c : (h.a0 + h.a1) / 2); b.add(g, glass, { cast: false }); };
      for (const h of southHoles) if (!h.door) winAt('x', z1, h, 1);
      for (const h of northHoles) winAt('x', z0, h, -1);
      for (const h of sideHoles(cz + 0.3)) winAt('z', x1, h, 1);
      for (const h of sideHoles(cz - 0.2)) winAt('z', x0, h, -1);
      // 玄関ドア
      b.box(M.walnut, doorX - 0.5, doorX + 0.5, base, base + 2.25, z1 - 0.03, z1 + 0.04, { uv: 1.2 }); b.box(glass, doorX - 0.32, doorX - 0.24, base + 0.3, base + 2.0, z1 + 0.035, z1 + 0.045, { cast: false });
      b.cyl(M.steel, doorX + 0.36, base + 1.1, z1 + 0.08, 0.015, 0.015, 0.7, 8);
      // 玄関ポーチとひさし
      b.box(M.porch, doorX - 1.3, doorX + 1.3, 0, base - 0.02, z1, z1 + 1.5, { uv: 1.4 }); b.box(M.porch, doorX - 1.0, doorX + 1.0, 0, base * 0.5, z1 + 1.5, z1 + 1.85, { uv: 1.4 });
      b.box(frameMat, doorX - 1.3, doorX + 1.3, base + 2.55, base + 2.65, z1, z1 + 1.35);
      b.sphere(M.bulb, doorX - 0.85, base + 2.0, z1 + 0.1, 0.07, { cast: false });
      if (plan.style === 'wa') for (let i = 0; i < 9; i++) b.box(accent, doorX + 1.3 + i * 0.12, doorX + 1.36 + i * 0.12, base - 0.05, base + 2.6, z1 + 0.5, z1 + 0.56, { uv: 1.2 });
      // 2 階のバルコニー手すり
      if (d.floors === 2 && !atrium) { b.box(frameMat, bigX - 1.5, bigX + 1.5, base + d.fh - 0.1, base + d.fh, z1, z1 + 0.9); for (let i = 0; i <= 12; i++) b.box(frameMat, bigX - 1.5 + i * 0.25 - 0.012, bigX - 1.5 + i * 0.25 + 0.012, base + d.fh, base + d.fh + 1.0, z1 + 0.87, z1 + 0.9); b.box(frameMat, bigX - 1.5, bigX + 1.5, base + d.fh + 1.0, base + d.fh + 1.05, z1 + 0.85, z1 + 0.92); }
    });

    // ── オプション（表示・非表示を切り替えられる部品） ──
    const option = (id, anchor, fn) => { const b = new W.Builder(), g = new T.Group(); g.name = 'opt_' + id; if (fn) { fn(b); b.build(g); } g.visible = has(id); group.add(g); options[id] = g; anchors[id] = new T.Vector3(anchor[0], anchor[1], anchor[2]); };
    const roofY = (z) => shed ? top + (z1 - z) * d.slope : top + (D / 2 - Math.abs(z - cz)) * d.slope;
    option('solar', [cx, roofY(cz + D * 0.25) + 0.6, cz + D * 0.25], b => {
      const zA = shed ? z0 + 0.5 : cz + 0.35, zB = z1 - 0.2, cols = Math.max(3, Math.floor((Wd - 1.2) / 1.05)), rows = Math.max(1, Math.floor((zB - zA) / 1.75)), pm = new T.MeshStandardMaterial({ color: 0x0e1a33, roughness: 0.16, metalness: 0.85, envMapIntensity: 1.6 });
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const zc = zA + (j + 0.5) * (zB - zA) / rows, len = (zB - zA) / rows - 0.06, g = new T.BoxGeometry(1.0, 0.04, len); g.rotateX(Math.atan(d.slope)); g.translate(cx + (i - (cols - 1) / 2) * 1.05, roofY(zc) + 0.32, zc); b.add(g, pm); }
    });
    option('battery', [x1 + 0.3, base + 1.3, cz - D * 0.25], b => { b.rbox(M.white, x1 + 0.28, base + 0.55, cz - D * 0.25, 0.32, 1.0, 0.75, 0.03); b.box(M.concrete, x1 + 0.08, x1 + 0.5, 0, base + 0.05, cz - D * 0.25 - 0.45, cz - D * 0.25 + 0.45); });
    option('deck', [bigX, 0.9, z1 + 1.6], b => { b.box(M.deck, bigX - bigW / 2 - 0.5, bigX + bigW / 2 + 0.5, 0.1, base - 0.04, z1 + 0.02, z1 + 2.6, { uv: 1.6 }); b.box(M.deck, bigX - 0.8, bigX + 0.8, 0.05, base * 0.45, z1 + 2.6, z1 + 2.95, { uv: 1.6 }); for (const dx of [-0.7, 0.7]) { b.rbox(M.color(0xe8e2d6, { roughness: 1 }), bigX + dx, base + 0.28, z1 + 1.3, 0.6, 0.12, 0.6, 0.04); b.rbox(M.color(0xe8e2d6, { roughness: 1 }), bigX + dx, base + 0.52, z1 + 1.02, 0.6, 0.4, 0.1, 0.04); } });
    option('carport', [x1 + 3.2, 2.9, z1 + 3.5], b => { const px0 = x1 + 0.9, px1 = x1 + 6.4, pz0 = z1 + 0.6, pz1 = z1 + 6.0; for (const z of [pz0 + 0.3, pz1 - 0.3]) b.box(M.frame, px1 - 0.25, px1 - 0.13, 0, 2.5, z - 0.06, z + 0.06); b.box(M.frame, px0, px1, 2.5, 2.58, pz0, pz1); b.box(M.color(0xcfd6dc, { roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.55 }), px0 + 0.05, px1 - 0.05, 2.58, 2.6, pz0 + 0.05, pz1 - 0.05, { cast: false }); });
    option('garden', [x0 - 1.6, 1.2, z1 + 2.0], b => { b.box(M.walnut, x0 - 3.0, x0 - 0.6, 0, 0.3, z1 + 0.6, z1 + 3.4, { uv: 1.4 }); b.box(M.soil, x0 - 2.9, x0 - 0.7, 0.28, 0.32, z1 + 0.7, z1 + 3.3, { uv: 1, cast: false }); for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) W.shrub(b, x0 - 2.5 + i * 0.75, z1 + 1.0 + j * 0.62, 0.2, i * 4 + j); for (let i = 0; i < 4; i++) b.cyl(M.concrete, x0 - 0.2 + i * 0.05, 0.03, z1 + 1.2 + i * 0.75, 0.24, 0.24, 0.05, 12); W.tree(b, x0 - 2.2, z1 - 2.5, 3.4, 81); });
    option('barrierfree', [doorX - 2.4, 0.9, z1 + 1.9], b => { const g = new T.BoxGeometry(3.4, 0.06, 1.1); g.rotateZ(Math.atan2(base - 0.04, 3.4)); g.translate(doorX - 2.95, (base - 0.04) / 2, z1 + 0.75); b.add(g, M.porch); for (const x of [doorX - 4.5, doorX - 2.9, doorX - 1.35]) b.cyl(M.steel, x, 0.6 + (x - (doorX - 4.6)) * 0.13, z1 + 1.3, 0.018, 0.018, 0.95, 8); b.cyl(M.steel, doorX - 2.95, 1.22, z1 + 1.3, 0.02, 0.02, 3.3, 8, { rot: [0, 0, PI / 2 + 0.135] }); });
    // 外から見えない設備は、位置だけ決めておく（画面上のラベルで示す）
    const inside = { kitchen_open: [x1 - 2.2, base + 1.4, z1], pantry: [x1, base + 1.5, cz - 0.6], study: [cx + 0.6, base + 1.5, z1], office: [d.floors === 2 ? x1 - 1.75 : x0, base + (d.floors === 2 ? d.fh + 1.5 : 1.5), d.floors === 2 ? z1 : cz], laundry: [x0, base + 1.5, cz - D * 0.3], storage: [d.floors === 2 ? bigX : x0 + 1, base + (d.floors === 2 ? d.fh + 1.5 : 2.3), z1], atrium: [bigX, base + d.fh + 0.6, z1], insulation: [x1, base + (d.floors === 2 ? d.fh : 1) + 1.0, z1 - 0.5], quake: [x0, base + 0.4, z1], floorheat: [bigX + 0.4, base + 0.25, z1], tatami: [x0, base + 1.2, cz + D * 0.2], guest: [d.floors === 2 ? x0 : x1, base + (d.floors === 2 ? d.fh + 1.4 : 1.8), cz] };
    for (const k in inside) option(k, inside[k], null);
    group.userData = { dims: d };
    return { group, stages, options, anchors, glow: [glass], dims: d, door: new T.Vector3(doorX, base, z1 + 1.9) };
  };

  // 車（丸みのある箱の組み合わせ）
  function makeCar(color) {
    const M = JE.mat, b = new W.Builder(), g = new T.Group(), body = new T.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.6, envMapIntensity: 1.4 });
    b.rbox(body, 0, 0.62, 0, 1.78, 0.62, 4.3, 0.16); b.rbox(M.glassDark, 0, 1.12, -0.25, 1.6, 0.56, 2.35, 0.2); b.rbox(body, 0, 1.36, -0.3, 1.5, 0.08, 1.7, 0.03);
    for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) { b.cyl(M.blackMatte, sx * 0.84, 0.33, sz, 0.33, 0.33, 0.24, 20, { rot: [0, 0, PI / 2] }); b.cyl(M.steel, sx * 0.97, 0.33, sz, 0.18, 0.18, 0.02, 14, { rot: [0, 0, PI / 2] }); }
    for (const sx of [-0.6, 0.6]) { b.rbox(M.bulb, sx, 0.72, 2.14, 0.34, 0.1, 0.05, 0.02, { cast: false }); b.rbox(M.color(0xb0261e, { emissive: 0x7a0f0a, emissiveIntensity: 0.6 }), sx, 0.75, -2.14, 0.34, 0.1, 0.05, 0.02, { cast: false }); }
    b.build(g); return g;
  }

  // ───────── 敷地の場面 ─────────
  L.build = () => {
    const M = JE.mat, scene = L.scene = new T.Scene(), b = new W.Builder();
    // 地面・道路
    b.box(M.lawn, -90, 90, -0.4, -0.02, -90, 90, { uv: 7, cast: false });
    b.box(M.asphalt, -90, 90, -0.3, 0.0, 10.2, 16.8, { uv: 5, cast: false }); b.box(M.concrete, -90, 90, -0.2, 0.08, 9.4, 10.2, { uv: 2 }); b.box(M.concrete, -90, 90, -0.2, 0.08, 16.8, 17.6, { uv: 2 });
    for (let i = -8; i < 9; i++) b.box(M.white, i * 9, i * 9 + 4, 0.001, 0.006, 13.4, 13.6, { cast: false });
    // 隣の区画との境（低い塀）
    b.box(M.concrete, -10.1, -9.9, 0, 0.75, -10, 9.4, { uv: 2 }); b.box(M.concrete, 10.9, 11.1, 0, 0.75, -10, 9.4, { uv: 2 }); b.box(M.concrete, -10.1, 11.1, 0, 0.75, -10.1, -9.9, { uv: 2 });
    // ご近所の家
    const nb = (plan, x, z, ry) => { const h = L.makeHouse(plan), piv = new T.Group(); piv.position.set(x, 0, z); piv.rotation.y = ry || 0; h.group.position.set(-HX, 0, -HZ); piv.add(h.group); scene.add(piv); L.neighbors.push(h); };
    L.neighbors = [];
    nb({ type: 'two', size: 32, style: 'natural', options: [] }, -21, -1.5); nb({ type: 'two', size: 30, style: 'modern', options: [] }, 22.5, -1.5); nb({ type: 'hiraya', size: 26, style: 'wa', options: [] }, -19, -24); nb({ type: 'two', size: 34, style: 'natural', options: [] }, 3, -25); nb({ type: 'two', size: 30, style: 'wa', options: [] }, 25, -25);
    nb({ type: 'two', size: 32, style: 'modern', options: [] }, -16, 30, PI); nb({ type: 'two', size: 30, style: 'natural', options: [] }, 4, 30, PI); nb({ type: 'hiraya', size: 28, style: 'natural', options: [] }, 24, 30, PI);
    // 街路樹・生け垣
    for (const x of [-34, -27, 31, 38]) W.tree(b, x, 8.2, 6.5, x + 50);
    for (const x of [-30, -8, 14, 34]) W.tree(b, x, 19.5, 7, x + 90);
    W.tree(b, -14, -14, 8, 5); W.tree(b, 14, -15, 9, 9, 'conifer'); W.tree(b, -32, -12, 9, 12); W.tree(b, 36, -8, 8, 14); W.tree(b, -6, -40, 10, 15); W.tree(b, 16, -42, 11, 16, 'conifer'); W.tree(b, -36, 28, 9, 21); W.tree(b, 38, 30, 10, 22);
    W.hedge(b, -40, -38, 40, -38, 2.4, 1.4, 21); W.hedge(b, -46, -38, -46, 44, 2.4, 1.4, 22); W.hedge(b, 46, -38, 46, 44, 2.4, 1.4, 23);
    b.build(scene);

    // 建築前の敷地（土）と、完成後の庭（芝・アプローチ・植栽）
    const soil = L.soil = new T.Mesh(new T.BoxGeometry(20.6, 0.06, 19.2), M.soil.clone()); W.worldUV(soil.geometry, 5); soil.position.set(0.5, 0.0, -0.4); soil.receiveShadow = true; soil.material.transparent = true; scene.add(soil);
    const garden = L.garden = new T.Group(); scene.add(garden);
    L.stakes = new T.Group(); scene.add(L.stakes);
    L.car = makeCar(0xe9ecef); scene.add(L.car);
    L.houseRoot = new T.Group(); scene.add(L.houseRoot);

    const lt = L.light = W.makeLighting(scene, { shadowBox: 24, shadowSize: 4096, target: [0, 0, 0] });
    lt.sun.shadow.camera.far = 120;
    L.setTime = (name) => { lt.set(name); L.captureEnv(); };
    L.captureEnv = () => { const old = L._envRT; const rt = JE.gfx.pmrem.fromScene(scene, 0.03, 0.5, 400, { size: JE.gfx.quality === 'low' ? 64 : 128, position: new T.Vector3(0, 9, 6) }); scene.environment = rt.texture; L._envRT = rt; if (old) old.dispose(); };
    JE.updaters.add((dt) => { if (JE.scene === scene) lt.update(dt); });
    return scene;
  };

  // 庭（家の大きさに合わせて作り直す）
  function buildGarden(h) {
    const M = JE.mat, g = L.garden, d = h.dims, b = new W.Builder();
    while (g.children.length) { const c = g.children.pop(); c.geometry && c.geometry.dispose(); }
    // アプローチ（道路から玄関へ）
    const dx = h.door.x; for (let i = 0; i < 6; i++) b.box(M.concrete, dx - 0.55 + Math.sin(i * 1.3) * 0.12, dx + 0.55 + Math.sin(i * 1.3) * 0.12, 0.0, 0.05, h.door.z + 0.4 + i * 1.05, h.door.z + 1.25 + i * 1.05, { uv: 1.4 });
    b.box(M.concrete, d.x1 + 0.9, d.x1 + 6.4, 0, 0.04, d.z1 + 0.6, 9.4, { uv: 2.5, cast: false });      // 駐車スペース
    // 門柱とポスト、植栽
    b.box(M.accent, dx - 1.9, dx - 1.5, 0, 1.45, 8.6, 8.9, { uv: 1.2 }); b.box(M.black, dx - 1.85, dx - 1.55, 0.9, 1.1, 8.9, 8.93); b.sphere(M.bulb, dx - 1.7, 1.3, 8.92, 0.05, { cast: false });
    W.tree(b, d.x0 - 0.3, d.z1 + 4.6, 4.4, 71); W.shrub(b, dx - 2.4, 8.4, 0.5, 2); W.shrub(b, d.x0 + 1.5, d.z1 + 0.7, 0.45, 4); W.shrub(b, d.x0 + 0.4, d.z1 + 0.8, 0.55, 6); W.shrub(b, d.x0 - 1.2, 8.3, 0.6, 7); W.shrub(b, d.x0 - 3.4, 8.2, 0.5, 9);
    W.hedge(b, -9.4, -9.2, 10.4, -9.2, 1.5, 0.8, 31);
    b.build(g);
    L.car.position.set(d.x1 + 2.4, 0.02, d.z1 + 3.4); L.car.rotation.y = 0;
  }

  // ───────── プランを反映する ─────────
  // animate: true なら、組み上がるような短い動きを付ける
  L.setPlan = (plan, o) => {
    o = o || {};
    const old = L.house; L.plan = { type: plan.type, size: plan.size, style: plan.style, options: new Set(plan.options) };
    const h = L.house = L.makeHouse(L.plan, { frame: o.frame });
    if (old) { L.houseRoot.remove(old.group); old.group.traverse(m => { if (m.geometry) m.geometry.dispose(); }); }
    L.houseRoot.add(h.group); buildGarden(h);
    if (o.animate && !JE.fast) {
      const order = ['foundation', 'walls', 'windows', 'roof']; let i = 0;
      for (const name of order) for (const g of h.stages[name] || []) { const dly = (i++) * 0.045, y = name === 'roof' ? 1.2 : name === 'foundation' ? 0 : -0.5; g.position.y = y; g.scale.setScalar(0.985); JE.wait(dly).then(() => JE.tween(0.5, t => { g.position.y = y * (1 - t); g.scale.setScalar(0.985 + 0.015 * t); }, JE.ease.outBack, { keep: true })).catch(() => {}); }
    }
    return h;
  };
  // オプションの出し入れ（ポンと現れる）
  L.setOption = (id, on) => {
    const h = L.house; if (!h) return; if (on) L.plan.options.add(id); else L.plan.options.delete(id);
    const g = h.options[id]; if (!g) return;
    if (on && g.children.length && !JE.fast) { g.visible = true; g.position.y = 1.2; JE.tween(0.55, t => { g.position.y = 1.2 * (1 - t); }, JE.ease.outBack, { keep: true }).catch(() => {}); }
    else { g.visible = on; g.position.y = 0; }
  };
  // 夜の窓明かり
  L.setGlow = (v) => { if (L.house) for (const m of L.house.glow) m.emissiveIntensity = v; for (const n of L.neighbors) for (const m of n.glow) m.emissiveIntensity = v * 0.8; };

  // ───────── 建築タイムラプス ─────────
  // onStage(名前) で画面の見出しを切り替えられる。workers は職人さんの Avatar の配列（省略可）。
  L.timelapse = async (plan, { onStage, workers } = {}) => {
    const lt = L.light, say = (s) => onStage && onStage(s);
    const h = L.setPlan(plan, { frame: true }), d = h.dims;
    const hide = (list) => (list || []).forEach(g => g.visible = false);
    for (const k in h.stages) hide(h.stages[k]); for (const k in h.options) h.options[k].visible = false;
    L.garden.visible = false; L.car.visible = false; L.soil.visible = true; L.soil.material.opacity = 1; L.setGlow(0);
    // 地縄（建物の位置を示すロープ）
    const M = JE.mat; while (L.stakes.children.length) L.stakes.remove(L.stakes.children[0]);
    { const b = new W.Builder(); for (const [x, z] of [[d.x0, d.z0], [d.x1, d.z0], [d.x0, d.z1], [d.x1, d.z1]]) b.box(M.oak, x - 0.03, x + 0.03, 0, 0.5, z - 0.03, z + 0.03); b.box(M.white, d.x0, d.x1, 0.32, 0.335, d.z0 - 0.008, d.z0 + 0.008); b.box(M.white, d.x0, d.x1, 0.32, 0.335, d.z1 - 0.008, d.z1 + 0.008); b.box(M.white, d.x0 - 0.008, d.x0 + 0.008, 0.32, 0.335, d.z0, d.z1); b.box(M.white, d.x1 - 0.008, d.x1 + 0.008, 0.32, 0.335, d.z0, d.z1); b.build(L.stakes); }
    L.stakes.visible = true;
    lt.set('morning'); L.captureEnv();
    JE.cam.startOrbit({ center: new T.Vector3(HX, 2.4, HZ + 1), radius: 27, height: 9.5, angle: 0.75, speed: 0.07, fov: 36 });
    if (workers) workers.forEach((w, i) => { scene_add(w); w.place(i ? d.x1 + 1.6 : d.x0 + 2.0, 0, i ? d.z1 + 1.4 : d.z1 + 2.2, i ? -2.2 : 2.6); w.setBase(i ? 'work_table' : 'work_mid', 0); w.lookAt(null); w.setMood('neutral'); w.root.visible = true; });
    function scene_add(w) { if (w.root.parent !== L.scene) L.scene.add(w.root); }
    say('ground'); await JE.wait(2.2);
    // 基礎
    say('foundation'); for (const g of h.stages.foundation) { g.visible = true; g.scale.y = 0.001; JE.tween(1.6, t => { g.scale.y = Math.max(0.001, t); }, JE.ease.out, { keep: true }).catch(() => {}); }
    await JE.wait(1.2); L.stakes.visible = false; await JE.wait(1.3);
    // 骨組み：柱が立ち、梁がかかり、たる木が並ぶ
    say('frame'); lt.go('noon', 5);
    const fr = (h.stages.frame || []).slice().sort((a, b2) => (a.userData.floorY - b2.userData.floorY) || (a.userData.kind === 'post' ? -1 : 1) - (b2.userData.kind === 'post' ? -1 : 1) || (a.position.x - b2.position.x));
    fr.forEach((m, i) => { m.visible = false; const y = m.position.y, post = m.userData.kind === 'post', dly = i * (4.6 / fr.length);
      JE.wait(dly).then(() => { m.visible = true; if (post) { const full = m.scale.y; return JE.tween(0.45, t => { m.scale.y = Math.max(0.001, t) * full; m.position.y = y - (1 - t) * (m.geometry.parameters.height / 2); }, JE.ease.out, { keep: true }); } return JE.tween(0.5, t => { m.position.y = y + (1 - t) * 2.2; }, JE.ease.out, { keep: true }); }).catch(() => {}); });
    await JE.wait(5.4);
    // 屋根
    say('roof'); for (const g of h.stages.roof) { g.visible = true; g.position.y = 5; JE.tween(1.3, t => { g.position.y = 5 * (1 - t); }, JE.ease.out, { keep: true }).catch(() => {}); }
    await JE.wait(1.9);
    // 外壁：面ごとに下からせり上がる
    say('walls'); lt.go('afternoon', 4);
    h.stages.walls.forEach((g, i) => { g.visible = true; g.scale.y = 0.001; JE.wait(i * 0.4).then(() => JE.tween(1.1, t => { g.scale.y = Math.max(0.001, t); }, JE.ease.out, { keep: true })).catch(() => {}); });
    await JE.wait(2.6); for (const m of fr) m.visible = false;
    for (const g of h.stages.windows) { g.visible = true; g.scale.setScalar(0.96); JE.tween(0.6, t => g.scale.setScalar(0.96 + 0.04 * t), JE.ease.outBack, { keep: true }).catch(() => {}); }
    await JE.wait(1.2);
    // 設備・外構
    say('finish');
    let k = 0; for (const id of plan.options) { const g = h.options[id]; if (g && g.children.length) { JE.wait(k++ * 0.35).then(() => L.setOption(id, true)).catch(() => {}); } }
    await JE.wait(0.6 + k * 0.35);
    L.garden.visible = true; L.garden.scale.set(1, 0.001, 1); JE.tween(1.4, t => { L.garden.scale.y = Math.max(0.001, t); L.soil.material.opacity = 1 - t; }, JE.ease.out, { keep: true }).catch(() => {});
    L.car.visible = true; const cz = L.car.position.z; L.car.position.z = 13.4; JE.tween(1.6, t => { L.car.position.z = 13.4 + (cz - 13.4) * t; }, JE.ease.out, { keep: true }).catch(() => {});
    if (workers) workers.forEach(w => { w.root.visible = false; });
    await JE.wait(1.8); L.soil.visible = false;
    // 夕暮れ、窓に明かりがともる
    say('done'); lt.go('sunset', 3.2); await JE.wait(1.6);
    JE.tween(2.2, t => L.setGlow(t * 1.0), JE.ease.inOut, { keep: true }).catch(() => {});
    await JE.wait(2.4); L.captureEnv();
    return h;
  };
  // すぐに完成形を見せる（タイトル・プラン提案）
  L.showFinished = (plan, tod) => { const h = L.setPlan(plan); L.garden.visible = true; L.garden.scale.set(1, 1, 1); L.car.visible = true; L.soil.visible = false; L.stakes.visible = false; L.setTime(tod || 'afternoon'); L.setGlow(tod === 'sunset' ? 0.9 : tod === 'night' ? 1.3 : 0); return h; };
})();
