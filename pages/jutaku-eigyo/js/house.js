/* ============================================================
 * house.js : モデルハウスの室内（接客・ヒアリング・ご案内の舞台）
 *
 * 座標の決まり：+Z が南（庭側）、+X が東（玄関側）、Y が高さ。単位はメートル。
 *   LDK        x:-6〜3   z:-3.2〜3.8   （西側 x<-1.6 のリビングは吹き抜け）
 *   畳コーナー  x:-6〜-3.5 z:-3.2〜-0.7 （35cm の小上がり）
 *   玄関        x:3〜6.2  z:-3.2〜0.6
 *   家事室      x:3〜6.2  z:0.72〜3.8
 * ============================================================ */
(function () {
  'use strict';
  const T = window.THREE, JE = window.JE, W = JE.world;
  const H = JE.house = {};
  const X0 = -6, X1 = 3, Z0 = -3.2, Z1 = 3.8, CH = 2.6, HH = 5.0, XV = -1.6, ZV = -0.7, EX = 6.2, EZ = 0.6, UZ = 0.72, DOMA = -0.18;
  const PI = Math.PI;

  H.build = () => {
    const M = JE.mat, scene = H.scene = new T.Scene(), b = new W.Builder();
    const noShadow = { cast: false }, noCast = { cast: false };

    // ───────── 床 ─────────
    b.box(M.floor, X0, X1, -0.12, 0, Z0, Z1, { uv: 2.4, cast: false });
    b.box(M.floor, X1, 4.9, -0.12, 0, Z0, EZ, { uv: 2.4, cast: false });
    b.box(M.tile, 4.9, EX, -0.32, DOMA, Z0, EZ, { uv: 1.2, cast: false });
    b.box(M.walnut, 4.86, 4.9, DOMA, 0.001, Z0 + 0.06, EZ - 0.06, { uv: 1.5 });
    b.box(M.porch, X1, EX, -0.12, 0, UZ, Z1, { uv: 1.8, cast: false });

    // ───────── 天井 ─────────
    b.box(M.ceiling, XV, X1, CH, CH + 0.16, Z0, Z1);
    b.box(M.ceiling, X0, XV, CH, CH + 0.16, Z0, ZV);
    b.box(M.ceiling, X0 - 0.2, XV, HH, HH + 0.16, ZV, Z1 + 0.2);
    b.box(M.ceiling, X1, EX, CH, CH + 0.16, Z0, Z1);
    // 吹き抜けの上の壁と、あらわしの梁
    b.wall(M.wall, 'z', XV + 0.06, ZV, Z1, CH, HH, null, { uv: 2.2 });
    b.wall(M.wall, 'x', ZV - 0.06, X0, XV + 0.12, CH, HH, null, { uv: 2.2 });
    for (const bx of [-5.1, -3.8, -2.5]) b.box(M.oak, bx - 0.07, bx + 0.07, HH - 0.26, HH, ZV, Z1, { uv: 1.6 });

    // ───────── 外まわりの壁（窓・ドアの穴つき） ─────────
    const uvw = { uv: 2.2 };
    b.wall(M.wall, 'x', Z1, X0, XV, -0.3, HH, [{ a0: -5.5, a1: -2.1, y0: 0, y1: 2.25 }, { a0: -5.5, a1: -2.1, y0: 2.7, y1: 4.5 }], uvw);
    b.wall(M.wall, 'x', Z1, XV, X1, -0.3, CH + 0.16, [{ a0: -1.0, a1: 2.4, y0: 0, y1: 2.25 }], uvw);
    b.wall(M.wall, 'z', X0, ZV, Z1, -0.3, HH, [{ a0: 0.6, a1: 2.9, y0: 3.25, y1: 4.4 }], uvw);
    b.wall(M.wall, 'z', X0, Z0, ZV, -0.3, CH + 0.16, [{ a0: -2.7, a1: -1.2, y0: 0.58, y1: 1.3 }], uvw);
    b.wall(M.wall, 'x', Z0, X0, X1, -0.3, CH + 0.16, [{ a0: -5.55, a1: -4.0, y0: 1.0, y1: 2.1 }, { a0: -3.15, a1: -1.85, y0: 1.2, y1: 1.72 }, { a0: -0.35, a1: 1.55, y0: 1.12, y1: 1.72 }], uvw);
    b.wall(M.wall, 'z', X1, Z0, Z1, -0.3, CH + 0.16, [{ a0: -1.95, a1: -0.35, y0: 0, y1: 2.25 }, { a0: 1.7, a1: 2.75, y0: 0, y1: 2.15 }], uvw);
    // 玄関
    b.wall(M.wall, 'x', Z0, X1, EX, -0.4, CH + 0.16, [{ a0: 3.5, a1: 5.7, y0: 1.92, y1: 2.28 }], uvw);
    b.wall(M.wall, 'z', EX, Z0, EZ, -0.4, CH + 0.16, [{ a0: -1.9, a1: -0.9, y0: DOMA, y1: 2.2 }, { a0: -0.74, a1: -0.36, y0: DOMA + 0.06, y1: 2.2 }], uvw);
    b.wall(M.wall, 'x', (EZ + UZ) / 2, X1, EX, -0.4, CH + 0.16, null, { uv: 2.2, t: 0.12 });
    // 家事室
    b.wall(M.wall, 'z', EX, EZ, Z1, -0.3, CH + 0.16, [{ a0: 1.6, a1: 3.0, y0: 1.05, y1: 2.0 }], uvw);
    b.wall(M.wall, 'x', Z1, X1, EX, -0.3, CH + 0.16, null, uvw);

    // 窓：枠・ガラス・たて桟
    const win = (axis, c, a0, a1, y0, y1, n, o) => {
      const f = 0.045, d = 0.07, bar = (s0, s1, t0, t1) => axis === 'x' ? b.box(M.frame, s0, s1, t0, t1, c - d / 2, c + d / 2) : b.box(M.frame, c - d / 2, c + d / 2, t0, t1, s0, s1);
      bar(a0, a1, y0, y0 + f); bar(a0, a1, y1 - f, y1); bar(a0, a0 + f, y0, y1); bar(a1 - f, a1, y0, y1);
      for (let i = 1; i < (n || 1); i++) { const m = a0 + (a1 - a0) * i / n; bar(m - f / 2, m + f / 2, y0, y1); }
      if (o && o.hbar) bar(a0, a1, o.hbar - f / 2, o.hbar + f / 2);
      const g = axis === 'x' ? new T.BoxGeometry(a1 - a0, y1 - y0, 0.012) : new T.BoxGeometry(0.012, y1 - y0, a1 - a0);
      g.translate(axis === 'x' ? (a0 + a1) / 2 : c, (y0 + y1) / 2, axis === 'x' ? c : (a0 + a1) / 2); b.add(g, M.glass, { cast: false, recv: false });
    };
    win('x', Z1, -5.5, -2.1, 0, 2.25, 4); win('x', Z1, -5.5, -2.1, 2.7, 4.5, 4);
    win('x', Z1, -1.0, 2.4, 0, 2.25, 4);
    win('z', X0, 0.6, 2.9, 3.25, 4.4, 3); win('z', X0, -2.7, -1.2, 0.58, 1.3, 2);
    win('x', Z0, -3.15, -1.85, 1.2, 1.72, 2); win('x', Z0, -0.35, 1.55, 1.12, 1.72, 3);
    win('x', Z0, 3.5, 5.7, 1.92, 2.28, 1); win('z', EX, -0.74, -0.36, DOMA + 0.06, 2.2, 1); win('z', EX, 1.6, 3.0, 1.05, 2.0, 2);
    // 巾木（壁の足もとの細い板）
    const skirt = (x0, x1, z0, z1) => b.box(M.white, x0, x1, 0, 0.06, z0, z1, noCast);
    skirt(XV, -1.0, Z1 - 0.075, Z1 - 0.06); skirt(2.4, X1, Z1 - 0.075, Z1 - 0.06); skirt(-1.3, -0.95, Z0 + 0.06, Z0 + 0.075);
    skirt(X1 - 0.075, X1 - 0.06, -0.35, 1.7); skirt(X1 - 0.075, X1 - 0.06, 2.75, Z1); skirt(X0 + 0.06, X0 + 0.075, ZV, 0.1);

    // レースのカーテン（窓の両わきに寄せてある）
    const curtainMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.62, side: T.DoubleSide });
    const curtain = (x0, x1, y1, z) => { const g = new T.PlaneGeometry(x1 - x0, y1 - 0.03, 22, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 34) * 0.035); g.computeVertexNormals(); g.translate((x0 + x1) / 2, (y1 + 0.03) / 2, z); b.add(g, curtainMat, { cast: false }); b.box(M.frame, x0 - 0.05, x1 + 0.05, y1, y1 + 0.02, z - 0.01, z + 0.01, noCast); };
    curtain(-5.95, -5.42, 2.36, Z1 - 0.2); curtain(-2.18, -1.68, 2.36, Z1 - 0.2); curtain(-1.52, -0.98, 2.36, Z1 - 0.2); curtain(2.42, 2.94, 2.36, Z1 - 0.2);

    // ───────── 照明器具（形だけ。光は下のほうで足す） ─────────
    const pendant = (x, y, z, kind) => {
      b.cyl(M.black, x, (CH + y) / 2 + 0.06, z, 0.004, 0.004, CH - y - 0.12, 5, noCast);
      if (kind === 'cone') { const g = new T.ConeGeometry(0.17, 0.2, 24, 1, true); g.translate(x, y + 0.1, z); b.add(g, M.blackMatte); const g2 = new T.ConeGeometry(0.165, 0.195, 24, 1, true); g2.translate(x, y + 0.1, z); b.add(g2, M.brass, noCast); b.sphere(M.bulb, x, y + 0.03, z, 0.045, noCast); }
      else if (kind === 'washi') b.sphere(M.paper, x, y, z, 0.24, { cast: false, seg: 24, seg2: 16 });
      else { b.cyl(M.brass, x, y + 0.09, z, 0.03, 0.045, 0.1, 16); b.sphere(M.bulb, x, y, z, 0.06, noCast); }
    };
    const downlight = (x, y, z) => b.cyl(M.bulb, x, y - 0.004, z, 0.045, 0.045, 0.008, 16, { cast: false, recv: false });
    for (const x of [-0.6, 0.6, 1.8]) for (const z of [-2.2, -0.2]) downlight(x, CH, z);
    for (const p of [[-0.9, 3.0], [2.3, 3.0], [2.3, 0.6], [-0.9, 0.2], [-4.75, -1.95], [-2.5, -1.4], [3.7, -2.2], [5.5, -2.2], [3.7, -0.3], [4.6, 1.6], [4.6, 3.0]]) downlight(p[0], CH, p[1]);

    // ───────── ダイニング（商談テーブル） ─────────
    const chair = (x, z, ry, mat) => b.at(x, 0, z, ry, () => {
      b.rbox(mat || M.oak, 0, 0.445, 0, 0.44, 0.04, 0.43, 0.018);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(M.black, sx * 0.19, 0.215, sz * 0.18, 0.013, 0.011, 0.43, 8, { rot: [sz * 0.06, 0, -sx * 0.06] });
      for (const sx of [-1, 1]) b.cyl(M.black, sx * 0.19, 0.64, -0.2, 0.012, 0.012, 0.4, 8, { rot: [-0.12, 0, 0] });
      b.rbox(mat || M.oak, 0, 0.78, -0.225, 0.44, 0.13, 0.03, 0.014, { rot: [-0.12, 0, 0] });
    });
    const TBL = { x: 0.6, z: 1.55 };
    b.rbox(M.oak, TBL.x, 0.705, TBL.z, 1.95, 0.04, 0.92, 0.015, { uv: 1.2 });
    for (const sx of [-0.78, 0.78]) { b.box(M.black, TBL.x + sx - 0.02, TBL.x + sx + 0.02, 0, 0.69, TBL.z - 0.34, TBL.z - 0.30); b.box(M.black, TBL.x + sx - 0.02, TBL.x + sx + 0.02, 0, 0.69, TBL.z + 0.30, TBL.z + 0.34); b.box(M.black, TBL.x + sx - 0.02, TBL.x + sx + 0.02, 0.65, 0.69, TBL.z - 0.34, TBL.z + 0.34); }
    H.seats = { north: [[-0.05, 0.84], [0.6, 0.84], [1.25, 0.84]], south: [[0.25, 2.26], [0.95, 2.26]] };
    for (const s of H.seats.north) chair(s[0], s[1], 0);
    for (const s of H.seats.south) chair(s[0], s[1], PI);
    // テーブルの上：資料・タブレット・お茶・花
    b.box(M.white, 0.2, 0.42, 0.726, 0.732, 1.72, 2.02); b.box(M.color(0x2f5d50), 0.215, 0.405, 0.732, 0.735, 1.74, 1.86, noCast);
    b.box(M.white, 0.5, 0.71, 0.726, 0.729, 1.75, 2.04); b.rbox(M.screen, 0.98, 0.731, 1.9, 0.27, 0.01, 0.19, 0.004);
    for (const cx of [-0.02, 0.62, 1.26]) { b.cyl(M.whiteGloss, cx, 0.729, 1.3, 0.062, 0.055, 0.007, 20, noCast); b.cyl(M.whiteGloss, cx, 0.762, 1.3, 0.038, 0.03, 0.06, 20); b.cyl(M.color(0x8a9a52), cx, 0.787, 1.3, 0.033, 0.033, 0.004, 16, noCast); }
    b.cyl(M.pot, 1.42, 0.79, 1.55, 0.035, 0.05, 0.13, 16); for (let i = 0; i < 5; i++) { const a = i * 1.26; b.cyl(M.leafDark, 1.42 + Math.cos(a) * 0.03, 0.93, 1.55 + Math.sin(a) * 0.03, 0.003, 0.003, 0.2, 4, { rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] }); b.sphere(i % 2 ? M.color(0xe9b7a0) : M.color(0xf2e6c8), 1.42 + Math.cos(a) * 0.06, 1.03, 1.55 + Math.sin(a) * 0.06, 0.028); }
    for (const x of [0.0, 0.6, 1.2]) pendant(x, 1.62, TBL.z, 'cone');

    // ───────── キッチン（アイランド＋背面カウンター） ─────────
    b.box(M.oak, -0.7, 1.9, 0.08, 0.86, -1.62, -0.78, { uv: 1.3 }); b.box(M.blackMatte, -0.66, 1.86, 0, 0.08, -1.58, -0.82);
    b.rbox(M.quartz, 0.6, 0.88, -1.2, 2.68, 0.04, 0.92, 0.008, { uv: 1.4 });
    b.box(M.steel, 0.95, 1.5, 0.9, 0.903, -1.46, -1.04, noCast); b.box(M.blackMatte, 0.99, 1.46, 0.9, 0.905, -1.42, -1.08, noCast);
    b.cyl(M.black, 1.22, 1.06, -1.5, 0.013, 0.013, 0.32, 10); b.cyl(M.black, 1.22, 1.21, -1.41, 0.012, 0.012, 0.19, 10, { rot: [PI / 2, 0, 0] }); b.cyl(M.black, 1.22, 1.18, -1.32, 0.012, 0.012, 0.06, 10);
    b.box(M.glassDark, -0.42, 0.32, 0.9, 0.904, -1.5, -0.98, noCast);
    b.box(M.steel, -0.47, 0.37, 1.93, 2.0, -1.52, -0.96); b.box(M.steel, -0.2, 0.1, 2.0, CH, -1.36, -1.12);
    // 背面カウンターと吊り戸棚、冷蔵庫
    b.box(M.oak, -0.9, 2.18, 0.08, 0.86, -3.14, -2.55, { uv: 1.3 }); b.box(M.blackMatte, -0.86, 2.14, 0, 0.08, -3.1, -2.58);
    b.rbox(M.quartz, 0.64, 0.88, -2.84, 3.1, 0.04, 0.62, 0.008, { uv: 1.4 });
    for (let i = 0; i < 5; i++) b.box(M.black, -0.86 + i * 0.616 + 0.24, -0.86 + i * 0.616 + 0.38, 0.78, 0.79, -2.548, -2.54, noCast);
    b.box(M.white, -0.9, -0.42, 1.42, 2.32, -3.14, -2.78); b.box(M.white, 1.62, 2.18, 1.42, 2.32, -3.14, -2.78);
    b.box(M.oak, -0.42, 1.62, 1.84, 1.87, -3.14, -2.86, { uv: 1.3 });
    b.box(M.color(0x9b9fa5, { metalness: 0.75, roughness: 0.35 }), 2.26, 2.95, 0, 1.86, -3.14, -2.46); b.box(M.black, 2.28, 2.3, 0.9, 1.6, -2.458, -2.44, noCast);
    // カウンターの上の小物
    b.rbox(M.blackMatte, -0.6, 1.05, -2.92, 0.24, 0.32, 0.3, 0.02); b.cyl(M.steel, -0.6, 0.94, -2.76, 0.035, 0.035, 0.06, 12);
    b.rbox(M.color(0xe8e2d6), 1.9, 1.01, -2.9, 0.34, 0.2, 0.26, 0.04);
    b.box(M.walnut, -0.2, -0.17, 0.9, 1.22, -3.08, -2.82, { uv: 0.6 }); b.box(M.oak, -0.15, -0.13, 0.9, 1.14, -3.08, -2.86, { uv: 0.6 });
    for (let i = 0; i < 4; i++) { b.cyl(M.color([0xe9dfc8, 0x8a5a3c, 0xcfd6c4, 0x3d3a36][i]), 0.2 + i * 0.16, 1.95, -3.0, 0.05, 0.05, 0.14, 14); b.cyl(M.oak, 0.2 + i * 0.16, 2.03, -3.0, 0.052, 0.052, 0.02, 14); }
    for (let i = 0; i < 3; i++) b.cyl(M.whiteGloss, 1.15 + i * 0.01, 1.89 + i * 0.012, -3.0, 0.1, 0.07, 0.012, 20);
    b.cyl(M.pot, 0.1, 0.96, -1.05, 0.11, 0.08, 0.1, 18); for (let i = 0; i < 4; i++) b.sphere([M.color(0xd8a63a), M.color(0xc9552f), M.color(0x8fae3e), M.color(0xd8a63a)][i], 0.1 + Math.cos(i * 1.7) * 0.045, 1.03, -1.05 + Math.sin(i * 1.7) * 0.045, 0.042);
    const stool = (x, z) => b.at(x, 0, z, 0, () => { b.cyl(M.oak, 0, 0.66, 0, 0.17, 0.17, 0.035, 22); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.cyl(M.black, Math.cos(a) * 0.15, 0.325, Math.sin(a) * 0.15, 0.011, 0.011, 0.66, 8, { rot: [Math.sin(a) * 0.09, 0, -Math.cos(a) * 0.09] }); } const g = new T.TorusGeometry(0.165, 0.008, 6, 24); g.rotateX(PI / 2); g.translate(0, 0.24, 0); b.add(g, M.black); });
    stool(-0.35, -0.48); stool(1.55, -0.48);

    // ───────── スタディカウンター（北の壁ぎわ） ─────────
    b.box(M.oak, -3.38, -1.72, 0.7, 0.74, -3.14, -2.6, { uv: 1.2 }); b.box(M.oak, -3.38, -3.34, 0, 0.7, -3.14, -2.62, { uv: 1.2 }); b.box(M.oak, -1.76, -1.72, 0, 0.7, -3.14, -2.62, { uv: 1.2 });
    b.box(M.oak, -3.38, -1.72, 1.93, 1.96, -3.14, -2.88, { uv: 1.2 });
    const bookCols = [0xb5533c, 0x2f5d50, 0xe3d9c6, 0x3f4f6b, 0xd8a63a, 0x7b8c8f, 0xf1ede4, 0x8a5a3c];
    const books = (x0, x1, y, z, seed) => { const r = JE.rng(seed); let x = x0; while (x < x1 - 0.05) { const w = 0.022 + r() * 0.03, h = 0.17 + r() * 0.08; b.box(M.color(bookCols[Math.floor(r() * bookCols.length)]), x, x + w, y, y + h, z - 0.07 - r() * 0.02, z + 0.07, noCast); x += w + 0.003; } };
    books(-3.3, -2.75, 1.96, -3.0, 4); books(-2.3, -1.8, 1.96, -3.0, 9);
    b.cyl(M.pot, -2.52, 2.02, -3.0, 0.06, 0.045, 0.12, 14); b.sphere(M.leaf, -2.52, 2.14, -3.0, 0.09, { scale: [1, 0.8, 1] });
    b.rbox(M.color(0x9aa0a6, { metalness: 0.6, roughness: 0.4 }), -2.15, 0.748, -2.86, 0.32, 0.014, 0.22, 0.005); b.box(M.screen, -2.31, -1.99, 0.755, 0.96, -2.99, -2.98, noCast);
    b.cyl(M.black, -3.12, 0.755, -2.95, 0.06, 0.07, 0.02, 16); b.cyl(M.black, -3.12, 0.93, -2.95, 0.008, 0.008, 0.34, 6, { rot: [0.3, 0, 0] }); { const g = new T.ConeGeometry(0.07, 0.09, 16, 1, true); g.rotateX(PI); g.translate(-3.12, 1.07, -2.86); b.add(g, M.black); }
    b.box(M.white, -2.9, -2.68, 0.742, 0.746, -2.95, -2.66, noCast); b.cyl(M.color(0x3f4f6b), -2.6, 0.79, -3.02, 0.035, 0.03, 0.09, 12);
    // 壁のコルクボードと、子どもの絵
    b.box(M.color(0xc9a878), -1.62, -1.02, 1.1, 1.75, -3.132, -3.12, noCast); { const cols = [0xf2c84b, 0x6fb1d6, 0xe98a6c, 0x9ccc8a]; for (let i = 0; i < 4; i++) b.box(M.color(cols[i], { roughness: 1 }), -1.57 + (i % 2) * 0.27, -1.35 + (i % 2) * 0.27, 1.16 + Math.floor(i / 2) * 0.29, 1.4 + Math.floor(i / 2) * 0.29, -3.119, -3.115, noCast); }
    chair(-2.95, -2.28, PI + 0.15); chair(-2.15, -2.3, PI - 0.1);

    // ───────── 畳コーナー（小上がり） ─────────
    const TP = 0.35;
    b.box(M.oak, X0 + 0.06, -3.5, 0, TP - 0.03, Z0 + 0.06, ZV, { uv: 1.4 });
    const tat2 = M.tatami.clone(); tat2.map = M.tatami.map.clone(); tat2.map.rotation = PI / 2; tat2.map.needsUpdate = true; tat2.normalMap = M.tatami.normalMap.clone(); tat2.normalMap.rotation = PI / 2; tat2.color = new T.Color(0xf2f0e2);
    { const xs = [X0 + 0.07, -4.745, -3.51], zs = [Z0 + 0.07, -1.95, ZV - 0.01]; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) b.box((i + j) % 2 ? M.tatami : tat2, xs[i] + 0.006, xs[i + 1] - 0.006, TP - 0.03, TP, zs[j] + 0.006, zs[j + 1] - 0.006, { uv: 1.0, cast: false }); }
    for (let i = 0; i < 3; i++) { const z0 = ZV - 0.02 - (i + 1) * 0.8, z1 = z0 + 0.78; b.box(M.oak, -3.5, -3.488, 0.03, TP - 0.05, z0, z1, { uv: 1.4, cast: false }); b.box(M.black, -3.487, -3.48, 0.2, 0.215, (z0 + z1) / 2 - 0.09, (z0 + z1) / 2 + 0.09, noCast); }
    b.box(M.oak, -3.5, -3.18, 0, 0.17, -2.5, -1.6, { uv: 1.4 });
    b.cyl(M.walnut, -4.75, TP + 0.3, -1.9, 0.38, 0.38, 0.035, 28); b.cyl(M.walnut, -4.75, TP + 0.145, -1.9, 0.07, 0.16, 0.29, 14);
    b.rbox(M.color(0x3f4f6b, { roughness: 1 }), -4.75, TP + 0.035, -1.2, 0.5, 0.07, 0.5, 0.03); b.rbox(M.color(0x7b8c8f, { roughness: 1 }), -5.4, TP + 0.035, -1.9, 0.5, 0.07, 0.5, 0.03, { rot: [0, 0.2, 0] });
    b.cyl(M.potDark, -4.7, TP + 0.36, -1.95, 0.05, 0.035, 0.08, 12); b.cyl(M.trunk, -4.7, TP + 0.55, -1.95, 0.004, 0.004, 0.34, 4, { rot: [0.2, 0, 0.25] });
    // 障子の窓（やわらかく光る）と飾り棚
    b.box(M.paper, -5.55, -4.0, 1.0, 2.1, Z0 + 0.03, Z0 + 0.045, { cast: false });
    for (let i = 0; i <= 4; i++) b.box(M.walnut, -5.55 + i * 0.3875 - 0.008, -5.55 + i * 0.3875 + 0.008, 1.0, 2.1, Z0 + 0.045, Z0 + 0.06, noCast);
    for (let i = 0; i <= 3; i++) b.box(M.walnut, -5.55, -4.0, 1.0 + i * 0.3667 - 0.008, 1.0 + i * 0.3667 + 0.008, Z0 + 0.045, Z0 + 0.06, noCast);
    b.box(M.walnut, -5.9, -3.56, TP + 0.5, TP + 0.535, Z0 + 0.06, Z0 + 0.3, { uv: 1 }); b.cyl(M.pot, -3.8, TP + 0.63, Z0 + 0.19, 0.045, 0.06, 0.19, 14);
    pendant(-4.75, 1.95, -1.95, 'washi');

    // ───────── リビング（吹き抜け） ─────────
    b.box(M.accent, X0 + 0.06, X0 + 0.085, 0, CH, -0.1, 3.3, { uv: 1.8, cast: false });
    b.box(M.walnut, X0 + 0.085, X0 + 0.5, 0.28, 0.56, 0.35, 2.85, { uv: 1.2 });
    b.box(M.screen, X0 + 0.09, X0 + 0.12, 0.84, 1.68, 0.86, 2.34); b.box(M.blackMatte, X0 + 0.12, X0 + 0.2, 0.6, 0.67, 1.1, 2.1);
    books(-5.86, -5.6, 0.56, 0.6, 14); b.cyl(M.pot, -5.72, 0.64, 2.65, 0.07, 0.05, 0.16, 14); b.sphere(M.leafLight, -5.72, 0.8, 2.65, 0.11, { scale: [1, 0.9, 1] });
    b.box(M.rug, -5.35, -2.85, 0, 0.014, 0.3, 2.95, { uv: 1.0, cast: false });
    const sofa = (x, z, ry) => b.at(x, 0, z, ry, () => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(M.walnut, sx * 1.1, 0.06, sz * 0.38, 0.025, 0.02, 0.12, 8);
      b.rbox(M.sofa, 0, 0.22, 0, 2.4, 0.2, 0.96, 0.05, { uv: 0.8 });
      b.rbox(M.sofa, 0, 0.5, -0.42, 2.4, 0.62, 0.14, 0.06, { uv: 0.8 });
      for (const sx of [-1, 1]) { b.rbox(M.sofa, sx * 1.13, 0.42, 0.02, 0.15, 0.46, 0.94, 0.06, { uv: 0.8 }); b.rbox(M.sofa, sx * 0.53, 0.41, 0.06, 1.03, 0.17, 0.8, 0.07, { uv: 0.8 }); b.rbox(M.sofa, sx * 0.53, 0.68, -0.28, 1.0, 0.4, 0.18, 0.08, { uv: 0.8, rot: [-0.16, 0, 0] }); }
      b.rbox(M.cushionGreen, -0.84, 0.66, -0.12, 0.42, 0.42, 0.13, 0.06, { rot: [-0.35, 0.3, 0.08], uv: 0.5 }); b.rbox(M.cushionTerra, 0.8, 0.64, -0.12, 0.38, 0.38, 0.12, 0.06, { rot: [-0.3, -0.25, -0.1], uv: 0.5 });
      // 足を伸ばせる部分（カウチ）
      b.rbox(M.sofa, -0.67, 0.22, 0.95, 1.06, 0.2, 0.94, 0.05, { uv: 0.8 }); b.rbox(M.sofa, -0.67, 0.41, 0.95, 1.0, 0.17, 0.9, 0.07, { uv: 0.8 });
      for (const sz of [0.6, 1.36]) b.cyl(M.walnut, -1.1, 0.06, sz, 0.025, 0.02, 0.12, 8);
    });
    sofa(-3.0, 1.6, -PI / 2);
    b.rbox(M.walnut, -4.45, 0.36, 1.45, 0.62, 0.035, 1.05, 0.015, { uv: 1.0 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(M.black, -4.45 + sx * 0.25, 0.17, 1.45 + sz * 0.45, 0.011, 0.011, 0.34, 8);
    b.box(M.color(0xe3d9c6), -4.6, -4.36, 0.378, 0.4, 1.12, 1.44, noCast); b.box(M.color(0x2f5d50), -4.58, -4.38, 0.4, 0.42, 1.15, 1.42, noCast); b.cyl(M.potDark, -4.4, 0.44, 1.78, 0.05, 0.065, 0.13, 14);
    // 大きなリングの照明（吹き抜け）
    { const g = new T.TorusGeometry(0.72, 0.022, 8, 60); g.rotateX(PI / 2); g.translate(-4.0, 3.25, 1.55); b.add(g, M.brass); const g2 = new T.TorusGeometry(0.72, 0.014, 6, 60); g2.rotateX(PI / 2); g2.translate(-4.0, 3.228, 1.55); b.add(g2, M.bulb, noCast); for (let i = 0; i < 3; i++) { const a = i * 2.094; b.cyl(M.black, -4.0 + Math.cos(a) * 0.72, (3.25 + HH) / 2, 1.55 + Math.sin(a) * 0.72, 0.003, 0.003, HH - 3.25, 4, noCast); } }
    // フロアランプ（テレビ壁の北のすみ）
    b.at(-5.6, 0, -0.25, 0, () => { b.cyl(M.black, 0, 0.012, 0, 0.15, 0.16, 0.024, 20); b.cyl(M.black, 0, 0.72, 0, 0.011, 0.011, 1.42, 8); b.cyl(M.paper, 0, 1.52, 0, 0.17, 0.2, 0.32, 24, { cast: false }); b.sphere(M.bulb, 0, 1.5, 0, 0.05, noCast); });
    W.plant(b, -5.5, 3.3, 1.35, 3); W.plant(b, 2.6, 3.35, 1.0, 5);
    // 壁のアート
    b.box(M.black, XV + 0.125, XV + 0.14, 3.1, 4.1, 0.5, 1.9, noCast); b.box(M.color(0xe9e2d4, { roughness: 1 }), XV + 0.14, XV + 0.146, 3.14, 4.06, 0.54, 1.86, noCast); b.cyl(M.color(0xc9764f, { roughness: 1 }), XV + 0.148, 3.66, 1.05, 0.26, 0.26, 0.004, 28, { rot: [0, 0, PI / 2], cast: false }); b.box(M.color(0x2f5d50, { roughness: 1 }), XV + 0.146, XV + 0.15, 3.3, 3.7, 1.2, 1.7, noCast);

    // ───────── 玄関 ─────────
    b.box(M.oak, 3.14, 4.8, 0.28, 1.06, Z0 + 0.06, Z0 + 0.44, { uv: 1.3 }); b.box(M.bulb, 3.2, 4.74, 0.262, 0.275, Z0 + 0.1, Z0 + 0.4, { cast: false, recv: false });
    for (let i = 1; i < 4; i++) b.box(M.blackMatte, 3.14 + i * 0.415 - 0.003, 3.14 + i * 0.415 + 0.003, 0.3, 1.04, Z0 + 0.44, Z0 + 0.443, noCast);
    b.box(M.white, 4.96, 6.1, DOMA, 2.2, Z0 + 0.06, Z0 + 0.46);
    b.cyl(M.potDark, 3.5, 1.16, Z0 + 0.25, 0.06, 0.08, 0.2, 14); for (let i = 0; i < 6; i++) b.cyl(M.color(0xc9a878, { roughness: 1 }), 3.5 + Math.cos(i) * 0.03, 1.5, Z0 + 0.25 + Math.sin(i * 2) * 0.03, 0.004, 0.004, 0.5, 4, { rot: [Math.sin(i * 2) * 0.2, 0, -Math.cos(i) * 0.2] });
    b.rbox(M.oak, 4.3, 1.075, Z0 + 0.25, 0.34, 0.02, 0.2, 0.008);
    b.box(M.black, 3.45, 4.35, 0.35, 2.05, EZ - 0.075, EZ - 0.06, noCast); b.box(M.mirror, 3.48, 4.32, 0.38, 2.02, EZ - 0.079, EZ - 0.074, { cast: false, recv: false });
    b.rbox(M.oak, 5.5, DOMA + 0.4, 0.26, 1.1, 0.045, 0.36, 0.015, { uv: 1 }); for (const sx of [-0.45, 0.45]) b.box(M.black, 5.5 + sx - 0.015, 5.5 + sx + 0.015, DOMA, DOMA + 0.38, 0.12, 0.4);
    for (let i = 0; i < 3; i++) for (const s of [-0.065, 0.065]) b.rbox(M.color([0xb9afa1, 0x7b8c8f, 0xd9cfc0][i], { roughness: 1 }), 4.62, 0.03, -1.9 + i * 0.46 + s, 0.25, 0.05, 0.1, 0.03);
    pendant(4.55, 1.98, -1.35, 'bulb'); W.plant(b, 3.35, 0.2, 1.15, 8);
    // 玄関ドア（外へ開いた状態）
    const door = H.door = new T.Group(); door.position.set(EX, DOMA, -1.9);
    { const leaf = new T.Mesh(new T.BoxGeometry(0.05, 2.36, 1.0), M.walnut); leaf.position.set(0, 1.18, 0.5); leaf.castShadow = true; door.add(leaf);
      const slit = new T.Mesh(new T.BoxGeometry(0.056, 1.7, 0.09), M.glassDark); slit.position.set(0, 1.25, 0.24); door.add(slit);
      for (const sx of [-0.045, 0.045]) { const hd = new T.Mesh(new T.CylinderGeometry(0.014, 0.014, 0.9, 10), M.black); hd.position.set(sx, 1.1, 0.86); door.add(hd); } }
    door.rotation.y = 1.78; scene.add(door);
    b.box(M.frame, EX - 0.05, EX + 0.05, DOMA, 2.24, -1.94, -1.9); b.box(M.frame, EX - 0.05, EX + 0.05, DOMA, 2.24, -0.9, -0.86); b.box(M.frame, EX - 0.05, EX + 0.05, 2.2, 2.24, -1.94, -0.86);

    // ───────── 家事室（ランドリー＋パントリー） ─────────
    b.box(M.white, 3.25, 5.0, 0.08, 0.84, UZ + 0.06, 1.38); b.box(M.oak, 3.22, 5.03, 0.84, 0.88, UZ + 0.06, 1.42, { uv: 1.3 });
    for (let i = 1; i < 3; i++) b.box(M.blackMatte, 3.25 + i * 0.583 - 0.003, 3.25 + i * 0.583 + 0.003, 0.1, 0.82, 1.38, 1.383, noCast);
    b.rbox(M.whiteGloss, 5.4, 0.44, 1.1, 0.66, 0.88, 0.64, 0.03); b.cyl(M.glassDark, 5.4, 0.46, 1.425, 0.2, 0.2, 0.03, 28, { rot: [PI / 2, 0, 0] }); b.cyl(M.steel, 5.4, 0.46, 1.43, 0.225, 0.225, 0.02, 28, { rot: [PI / 2, 0, 0] });
    b.box(M.oak, 5.03, 5.78, 1.18, 1.21, UZ + 0.06, 1.42, { uv: 1.3 }); b.rbox(M.whiteGloss, 5.4, 1.53, 1.1, 0.64, 0.62, 0.6, 0.03); b.cyl(M.glassDark, 5.4, 1.53, 1.405, 0.17, 0.17, 0.03, 28, { rot: [PI / 2, 0, 0] });
    b.rbox(M.color(0xd9c6a3, { roughness: 1 }), 3.7, 1.0, 1.05, 0.42, 0.24, 0.3, 0.04); b.rbox(M.white, 4.4, 0.93, 1.05, 0.34, 0.1, 0.26, 0.03); b.rbox(M.color(0xcfd9d6, { roughness: 1 }), 4.4, 1.02, 1.05, 0.33, 0.08, 0.25, 0.03);
    b.cyl(M.steel, 4.6, 1.98, 3.36, 0.012, 0.012, 2.5, 8, { rot: [0, 0, PI / 2] }); for (const sx of [3.4, 5.8]) b.cyl(M.steel, sx, 2.29, 3.36, 0.008, 0.008, 0.62, 6);
    { const cols = [0xf3efe7, 0xbcd0e0, 0xf3efe7, 0xe6c9bd, 0xcfd9c4, 0xf3efe7]; for (let i = 0; i < 6; i++) { const x = 3.75 + i * 0.36; b.rbox(M.color(cols[i], { roughness: 1 }), x, 1.6, 3.36, 0.03, 0.62, 0.42, 0.012); b.cyl(M.black, x, 1.94, 3.36, 0.003, 0.003, 0.08, 4); } }
    for (let i = 0; i < 4; i++) { const y = 0.42 + i * 0.5; b.box(M.oak, X1 + 0.06, 3.42, y, y + 0.025, 2.86, 3.74, { uv: 1.2 }); const r = JE.rng(60 + i); for (let k = 0; k < 4; k++) { const z = 2.96 + k * 0.2; if (i === 0) b.rbox(M.color(0xd9c6a3, { roughness: 1 }), 3.24, y + 0.13, z + 0.02, 0.26, 0.2, 0.17, 0.02); else b.cyl(M.color([0xe9dfc8, 0xc9552f, 0x8fae3e, 0xf2c84b, 0x8a5a3c, 0xf5f3ee][Math.floor(r() * 6)]), 3.24, y + 0.025 + 0.07 + r() * 0.03, z, 0.055, 0.055, 0.14 + r() * 0.06, 12); } }
    b.box(M.oak, 5.66, EX - 0.06, 0.84, 0.88, 1.5, 3.1, { uv: 1.3 }); b.cyl(M.color(0xc9a878, { roughness: 1 }), 5.85, 0.24, 2.3, 0.22, 0.18, 0.46, 18);

    // ───────── 外：ウッドデッキ・庭・ポーチ ─────────
    b.box(M.lawn, -60, 60, -0.6, -0.3, -60, 60, { uv: 7, cast: false });
    b.box(M.deck, -5.9, 2.9, -0.28, -0.03, Z1 + 0.06, 6.7, { uv: 1.6 }); b.box(M.deck, -1.6, 0.6, -0.3, -0.17, 6.7, 7.1, { uv: 1.6 });
    for (const dx of [-4.6, -3.3]) b.at(dx, -0.03, 5.5, dx < -4 ? 2.6 : 3.4, () => { b.rbox(M.color(0xe8e2d6, { roughness: 1 }), 0, 0.3, 0, 0.62, 0.12, 0.62, 0.04); b.rbox(M.color(0xe8e2d6, { roughness: 1 }), 0, 0.55, -0.27, 0.62, 0.42, 0.1, 0.04, { rot: [-0.25, 0, 0] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(M.walnut, sx * 0.26, 0.12, sz * 0.26, 0.018, 0.018, 0.24, 6); });
    b.cyl(M.walnut, -3.95, 0.2, 5.75, 0.22, 0.22, 0.03, 20); b.cyl(M.black, -3.95, 0.08, 5.75, 0.012, 0.012, 0.22, 6);
    b.box(M.concrete, -6.3, -5.5, -0.3, 0.22, 6.9, 7.5, { uv: 1.5 }); W.shrub(b, -5.9, 7.2, 0.55, 2); b.box(M.concrete, 2.0, 2.9, -0.3, 0.22, 6.9, 7.5, { uv: 1.5 }); W.shrub(b, 2.45, 7.2, 0.5, 4);
    // 生け垣と木立ち
    W.hedge(b, -18, 13.2, 16, 13.4, 1.9, 1.1, 3);
    W.tree(b, -8.5, 10.5, 6.2, 3); W.tree(b, -1.5, 11.8, 5.2, 7); W.tree(b, 5.5, 10.2, 6.8, 11); W.tree(b, -13, 6, 7, 13); W.tree(b, 11, 12, 6, 17, 'conifer'); W.tree(b, -4.5, 16, 7.5, 19); W.tree(b, 2.5, 17, 8, 23); W.tree(b, -11, 15, 8, 29, 'conifer');
    W.tree(b, -10.5, -1, 6.5, 31); W.tree(b, -9, 3.8, 4.6, 37);
    W.hedge(b, -16, -8.2, 14, -8.0, 2.1, 1.1, 7); W.hedge(b, -12.6, -8, -12.4, 13, 2.0, 1.1, 11);
    W.tree(b, -4.8, -6.6, 5.4, 51); W.tree(b, 0.9, -7.0, 4.6, 53); W.tree(b, -8.6, -5.8, 6.2, 57); W.tree(b, 3.6, -11, 8, 59, 'conifer'); W.tree(b, -2, -12, 8.5, 61); W.tree(b, -15, -4, 8, 63, 'conifer');
    W.shrub(b, -2.4, -5.0, 0.6, 3); W.shrub(b, 0.2, -4.6, 0.5, 5); W.shrub(b, -8.0, -1.9, 0.7, 6); W.shrub(b, -7.6, -2.9, 0.5, 8);
    // 玄関ポーチとアプローチ
    b.box(M.porch, EX, 8.6, -0.32, DOMA, -2.9, 0.2, { uv: 1.4 }); b.box(M.porch, 8.6, 9.0, -0.4, DOMA - 0.1, -2.6, -0.1, { uv: 1.4 });
    b.box(M.ceiling, EX, 8.5, 2.42, 2.56, -3.0, 0.3); b.box(M.walnut, 8.28, 8.42, DOMA, 2.42, -2.92, -2.78, { uv: 1.2 });
    for (let i = 0; i < 6; i++) b.box(M.concrete, 9.3 + i * 0.95, 10.0 + i * 0.95, -0.33, -0.27, -1.75 + Math.sin(i) * 0.12, -0.95 + Math.sin(i) * 0.12, { uv: 1.2 });
    W.shrub(b, 7.2, 0.9, 0.5, 5); W.shrub(b, 8.2, 1.1, 0.42, 6); W.shrub(b, 9.6, -3.3, 0.6, 7); W.tree(b, 10.5, 2.6, 4.4, 41); W.tree(b, 13, -5, 6.5, 43); W.tree(b, 17, 1, 7, 47, 'conifer');
    W.hedge(b, 19.5, -12, 19.8, 12, 1.9, 1.1, 5);
    b.cyl(M.potDark, 6.75, DOMA + 0.2, -2.5, 0.2, 0.15, 0.4, 18); W.shrub(b, 6.75, -2.5, 0.01, 0); b.sphere(M.leaf, 6.75, DOMA + 0.62, -2.5, 0.28, { scale: [1, 1.2, 1] });
    // 遠くの家並み
    const farHouse = (x, z, w, d, h, col, ry) => b.at(x, -0.3, z, ry || 0, () => { b.box(M.color(col, { roughness: 1 }), -w / 2, w / 2, 0, h, -d / 2, d / 2, noCast); const g = new T.CylinderGeometry(0.001, w * 0.74, h * 0.42, 4, 1); g.rotateY(PI / 4); g.scale(1, 1, d / w); g.translate(0, h + h * 0.21, 0); b.add(g, M.color(0x4a4d55, { roughness: 0.9 }), noCast); });
    farHouse(-16, 27, 9, 8, 5.6, 0xe6dfd2, 0.1); farHouse(-2, 30, 8, 8, 5.8, 0xd9d2c4, -0.05); farHouse(13, 28, 9, 7, 5.4, 0xcfc9be, 0.08); farHouse(31, 3, 8, 9, 5.6, 0xe0d8ca, 1.5); farHouse(30, -14, 8, 8, 5.4, 0xd5cdc0, 1.6); farHouse(-26, 4, 8, 9, 5.6, 0xdcd6ca, 1.5);

    b.build(scene);

    // ───────── 光 ─────────
    const L = H.light = W.makeLighting(scene, { shadowBox: 13, shadowSize: 4096, target: [0, 0, 1] });
    W.lamp(L, scene, 0.6, 1.5, 1.55, 3.2, 0xffd9a8, 6);       // ダイニングのペンダント
    W.lamp(L, scene, 0.6, 2.25, -1.9, 4.2, 0xffe6c8, 7);      // キッチン
    W.lamp(L, scene, -4.0, 3.1, 1.55, 6.5, 0xffe0b8, 10);     // リビングのリング照明
    W.lamp(L, scene, -4.75, 1.85, -1.95, 2.6, 0xffdcae, 5);   // 畳コーナー
    W.lamp(L, scene, -2.5, 1.6, -2.5, 2.0, 0xffe6c8, 4.5);    // スタディカウンター
    W.lamp(L, scene, 4.4, 1.9, -1.3, 3.6, 0xffe0b8, 6);       // 玄関
    W.lamp(L, scene, 4.6, 2.2, 2.3, 3.6, 0xfff0dc, 6);        // 家事室
    L.glow.push({ mat: JE.mat.bulb, base: 2.4 }, { mat: JE.mat.paper, base: 0.2 });

    H.setTime = (name) => { L.set(name); H.captureEnv(); };
    H.goTime = async (name, dur) => { await L.go(name, dur); H.captureEnv(); };
    // 部屋の中の明るさを写し取って、物の映り込みや間接光に使う
    H.captureEnv = () => {
      const old = scene.environment, hid = H.hideForEnv ? H.hideForEnv() : null;
      const rt = JE.gfx.pmrem.fromScene(scene, 0.04, 0.1, 120, { size: JE.gfx.quality === 'low' ? 64 : 128, position: new T.Vector3(-0.8, 1.5, 0.9) });
      scene.environment = rt.texture; if (hid) hid(); if (old && H._envRT) H._envRT.dispose(); H._envRT = rt;
    };
    JE.updaters.add((dt) => { if (JE.scene === scene) L.update(dt); });

    // ───────── 立ち位置とカメラ（場面ごと） ─────────
    // guests は [x, y, z, 向き]。向き 0 で南（+Z）を向く。
    const face = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);
    H.spots = {
      entrance: { cam: { pos: [3.3, 1.52, -0.62], look: [5.6, 1.15, -1.5], fov: 50 }, guests: [[5.5, DOMA, -1.72, -1.5], [5.62, DOMA, -1.02, -1.72], [5.05, DOMA, -1.32, -1.6]], senpai: [3.95, 0, -0.35, 1.2] },
      table: { cam: { pos: [0.6, 1.2, 2.5], look: [0.6, 1.08, 0.85], fov: 42 }, seats: H.seats.north, senpai: [-0.75, 0, 2.05, 2.5] },
      kitchen: { cam: { pos: [2.55, 1.52, 0.35], look: [0.55, 1.12, -0.6], fov: 46 }, guests: [[0.15, 0, -0.18, 2.6], [0.95, 0, -0.3, 2.2], [1.55, 0, 0.1, 1.9]], gaze: [0.6, 1.0, -1.2] },
      living: { cam: { pos: [-0.7, 1.5, 0.3], look: [-3.0, 1.7, 3.4], fov: 54 }, guests: [[-2.2, 0, 2.95, 2.5], [-1.75, 0, 3.25, 2.8], [-2.75, 0, 3.2, 2.3]], gaze: [-4.2, 3.2, 3.8] },
      tatami: { cam: { pos: [-2.35, 1.5, 0.9], look: [-4.3, 1.0, -1.3], fov: 46 }, guests: [[-3.05, 0, -0.9, -2.2], [-3.75, 0, -0.25, -2.6], [-2.75, 0, -0.2, -2.3]], gaze: [-4.75, 0.6, -1.9] },
      study: { cam: { pos: [-0.2, 1.5, 0.1], look: [-2.4, 1.05, -2.3], fov: 46 }, guests: [[-2.95, 0, -0.95, -2.9], [-2.45, 0, -1.55, 2.85], [-1.75, 0, -1.6, -2.6]], gaze: [-2.5, 0.9, -2.9] },
      utility: { cam: { pos: [3.45, 1.52, 2.95], look: [4.9, 1.15, 1.75], fov: 52 }, guests: [[4.55, 0, 2.05, 2.75], [5.15, 0, 2.5, -2.6], [4.05, 0, 2.55, 2.9]], gaze: [5.3, 1.1, 1.1] },
    };
    H.face = face;
    // ご案内のときの体の向き：「見せたい物」と「カメラ（＝あなた）」の中間を向かせる。
    // こうすると、物を見るときも、あなたの話を聞くときも、首を自然に振るだけで済む。
    H.standRy = (spot, g) => {
      if (!spot.gaze) return g[3];
      const toCam = Math.atan2(spot.cam.pos[0] - g[0], spot.cam.pos[2] - g[2]), toGaze = Math.atan2(spot.gaze[0] - g[0], spot.gaze[2] - g[2]);
      let d = toGaze - toCam; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      return toCam + d * 0.42;
    };
    return scene;
  };
})();
