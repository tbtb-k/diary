/* ============================================================
 * materials.js : 質感（床の木目・壁・布など）を、画像ファイルなしで計算して作る
 * ============================================================ */
(function () {
  'use strict';
  const T = window.THREE, JE = window.JE;
  const M = JE.mat = {};

  // ───────── ノイズ（自然なムラを作るための乱数模様） ─────────
  function makeNoise(seed) {
    const r = JE.rng(seed), N = 256, g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const s = t => t * t * (3 - 2 * t);
    // px, py を渡すと、その周期でくり返す（タイルとして並べても継ぎ目が出ない）
    const n = (x, y, px, py) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; px = px || N; py = py || N;
      const a = (((xi % px) + px) % px) & 255, b = ((((xi + 1) % px) + px) % px) & 255, c = ((((yi % py) + py) % py) & 255) * N, d = (((((yi + 1) % py) + py) % py) & 255) * N; const u = s(xf), v = s(yf);
      return (g[a + c] * (1 - u) + g[b + c] * u) * (1 - v) + (g[a + d] * (1 - u) + g[b + d] * u) * v; };
    // u,v は 0〜1。sx,sy は 1 周あたりの模様の細かさ（整数）
    n.tile = (u, v, sx, sy, oct) => { let val = 0, amp = 0.5, t = 0; sx = Math.max(1, Math.round(sx)); sy = Math.max(1, Math.round(sy || sx)); for (let i = 0; i < (oct || 4); i++) { val += n(u * sx, v * sy, sx, sy) * amp; t += amp; amp *= 0.5; sx *= 2; sy *= 2; } return val / t; };
    n.fbm = (x, y, oct) => { let v = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < (oct || 4); i++) { v += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; } return v / t; };
    return n;
  }
  M.makeNoise = makeNoise;

  // w×h の画像を 1 ピクセルずつ計算する。fn(x,y) は [r,g,b,高さ] を 0〜1 で返す。
  // 色の画像と、凹凸（ノーマルマップ）の画像を同時に作る。
  function bake(w, h, fn, { repeat = [1, 1], normal = 0, rough = null } = {}) {
    const col = new Uint8ClampedArray(w * h * 4), hgt = new Float32Array(w * h), rgh = rough ? new Uint8ClampedArray(w * h * 4) : null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = fn(x / w, y / h, x, y), i = (y * w + x) * 4;
      col[i] = p[0] * 255; col[i + 1] = p[1] * 255; col[i + 2] = p[2] * 255; col[i + 3] = 255; hgt[y * w + x] = p[3] == null ? 0.5 : p[3];
      if (rgh) { const rv = rough(p) * 255; rgh[i] = rgh[i + 1] = rgh[i + 2] = rv; rgh[i + 3] = 255; }
    }
    const tex = (data, srgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = Math.min(8, JE.gfx.maxAniso || 4); if (srgb) t.colorSpace = T.SRGBColorSpace; return t; };
    const out = { map: tex(col, true) };
    if (normal) {
      const nd = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const l = hgt[y * w + ((x + w - 1) % w)], r = hgt[y * w + ((x + 1) % w)], u = hgt[((y + h - 1) % h) * w + x], d = hgt[((y + 1) % h) * w + x];
        let nx = (l - r) * normal, ny = (d - u) * normal, nz = 1; const len = Math.hypot(nx, ny, nz); const i = (y * w + x) * 4;
        nd[i] = (nx / len * 0.5 + 0.5) * 255; nd[i + 1] = (ny / len * 0.5 + 0.5) * 255; nd[i + 2] = (nz / len * 0.5 + 0.5) * 255; nd[i + 3] = 255;
      }
      out.normalMap = tex(nd, false);
    }
    if (rgh) out.roughnessMap = tex(rgh, false);
    return out;
  }
  M.bake = bake;
  const hex = (c) => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

  // ───────── 板張り（フローリング・ウッドデッキ） ─────────
  // rows: 板の列数、base: 板の色、vary: 板ごとの色の差
  function planks({ seed = 1, size = 1024, rows = 16, base = 0xc8a57a, dark = 0x9a7650, vary = 0.16, gap = 0.004, gapDark = 0.72, grain = 1, bump = 1.2, repeat }) {
    const n = makeNoise(seed), r = JE.rng(seed + 7), A = hex(base), B = hex(dark);
    const rowsInfo = []; for (let i = 0; i < rows; i++) { const cuts = []; let x = r() * 0.5; while (x < 1.5) { cuts.push(x); x += 0.32 + r() * 0.3; } rowsInfo.push({ cuts, off: r() * 10 }); }
    const tone = new Map();
    return bake(size, size, (u, v) => {
      const row = Math.min(rows - 1, Math.floor(v * rows)), fv = v * rows - row, ri = rowsInfo[row];
      let k = 0, edge = 1; for (let i = 0; i < ri.cuts.length; i++) { const d = Math.abs(((u - ri.cuts[i]) % 1 + 1.5) % 1 - 0.5); if (d < edge) edge = d; if (((u % 1) + 1) % 1 >= ((ri.cuts[i] % 1) + 1) % 1) k = i; }
      const key = row * 100 + k; if (!tone.has(key)) tone.set(key, [r(), r()]); const tn = tone.get(key);
      const g1 = n.tile(u + ri.off * 0.1, v + tn[0], 3, rows * 9, 4), g2 = n.tile(u + tn[1], v, 26, rows * 60, 2);
      let c = mix(A, B, JE.clamp((g1 - 0.5) * 1.6 * grain + 0.35 + (tn[0] - 0.5) * vary * 3, 0, 1) * 0.75);
      c = mul(c, 0.93 + g2 * 0.14 + (tn[1] - 0.5) * vary);
      const gapV = Math.min(fv, 1 - fv), isGap = gap > 0 && (gapV < gap * rows * 0.5 || edge < gap * 0.3);
      if (isGap) c = mul(c, gapDark);
      return [c[0], c[1], c[2], isGap ? 0.25 : 0.55 + g2 * 0.08];
    }, { repeat, normal: bump, rough: p => 0.38 + (1 - p[3]) * 0.45 });
  }

  // ───────── 塗り壁・コンクリートなど、細かいムラのある面 ─────────
  function plaster({ seed = 3, size = 512, base = 0xf2eee6, amount = 0.035, scale = 22, bump = 0.6, repeat }) {
    const n = makeNoise(seed), A = hex(base);
    return bake(size, size, (u, v) => { const g = n.tile(u, v, scale, scale, 4), f = n.tile(u, v, scale * 6, scale * 6, 2); const k = 1 + (g - 0.5) * amount * 2 + (f - 0.5) * amount; return [A[0] * k, A[1] * k, A[2] * k, 0.5 + (g - 0.5) * 0.5 + (f - 0.5) * 0.3]; }, { repeat, normal: bump });
  }

  // ───────── 布（ソファ・クッション・ラグ） ─────────
  function fabric({ seed = 5, size = 512, base = 0xb7ada0, weave = 110, amount = 0.1, repeat }) {
    const n = makeNoise(seed), A = hex(base);
    return bake(size, size, (u, v) => { const w = (Math.sin(u * weave * Math.PI * 2) * 0.5 + 0.5) * (Math.sin(v * weave * Math.PI * 2 + Math.PI) * 0.5 + 0.5); const g = n.tile(u, v, 30, 30, 3); const k = 1 - amount + w * amount * 1.4 + (g - 0.5) * 0.12; return [A[0] * k, A[1] * k, A[2] * k, w * 0.6 + g * 0.4]; }, { repeat, normal: 1.4 });
  }

  // ───────── 畳 ─────────
  function tatami({ seed = 9, size = 512, repeat }) {
    const n = makeNoise(seed), A = hex(0xb9b488), B = hex(0xa39d70);
    return bake(size, size, (u, v) => { const line = Math.sin(v * 220 * Math.PI) * 0.5 + 0.5, g = n.tile(u, v, 6, 90, 3); const c = mix(A, B, line * 0.35 + (g - 0.5) * 0.5); return [c[0], c[1], c[2], line]; }, { repeat, normal: 1.2 });
  }

  // ───────── タイル（玄関の土間・ポーチ） ─────────
  function tiles({ seed = 11, size = 512, nx = 2, ny = 2, base = 0x8d8a84, grout = 0x5d5b57, vary = 0.07, repeat }) {
    const n = makeNoise(seed), A = hex(base), Gr = hex(grout), r = JE.rng(seed), tone = []; for (let i = 0; i < nx * ny; i++) tone.push(r());
    return bake(size, size, (u, v) => { const tx = u * nx, ty = v * ny, fx = tx - Math.floor(tx), fy = ty - Math.floor(ty), e = Math.min(fx, 1 - fx, fy, 1 - fy); const id = (Math.floor(tx) % nx) + (Math.floor(ty) % ny) * nx; const g = n.tile(u, v, 14, 14, 4), f = n.tile(u, v, 70, 70, 2);
      if (e < 0.012) return [Gr[0], Gr[1], Gr[2], 0.2];
      const k = 1 + (tone[id] - 0.5) * vary * 2 + (g - 0.5) * 0.16 + (f - 0.5) * 0.06; return [A[0] * k, A[1] * k, A[2] * k, 0.6 + (f - 0.5) * 0.1]; }, { repeat, normal: 1.6 });
  }

  // ───────── 人工大理石（キッチンの天板） ─────────
  function quartz({ seed = 13, size = 512, repeat }) {
    const n = makeNoise(seed), A = hex(0xf4f2ee), V = hex(0xb9b4ac);
    return bake(size, size, (u, v) => { const w = n.tile(u, v, 3, 3, 4), vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 1 + w * 2.6) * Math.PI)), 26); const c = mix(A, V, JE.clamp(vein * 0.55 + (w - 0.5) * 0.12, 0, 1)); return [c[0], c[1], c[2], 0.5]; }, { repeat });
  }

  // ───────── 芝生・土 ─────────
  function ground({ seed = 17, size = 512, a = 0x6f9a4a, b = 0x4f7a36, scale = 30, repeat }) {
    const n = makeNoise(seed), A = hex(a), B = hex(b);
    return bake(size, size, (u, v) => { const g = n.tile(u, v, scale, scale, 4), f = n(u * 240, v * 240, 240, 240); const c = mix(A, B, JE.clamp(g * 1.2 - 0.1 + (f - 0.5) * 0.5, 0, 1)); return [c[0], c[1], c[2], f]; }, { repeat, normal: 1.0 });
  }

  // ───────── 木の葉（明るい所と暗い所がまだらに混ざる） ─────────
  function foliage({ seed = 27, size = 256, a = 0x4f7d3c, b = 0x2f5a2c, repeat }) {
    const n = makeNoise(seed), A = hex(a), B = hex(b);
    return bake(size, size, (u, v) => { const g = n.tile(u, v, 9, 9, 3), f = n(u * 46, v * 46, 46, 46); const k = JE.clamp(g * 1.5 - 0.25 + (f - 0.5) * 0.7, 0, 1); const c = mix(B, A, k); return [c[0], c[1], c[2], k]; }, { repeat, normal: 3.2 });
  }

  // ───────── たて筋（ガルバリウムの外壁・屋根） ─────────
  function ribs({ seed = 19, size = 256, base = 0x33363b, n: count = 8, repeat }) {
    const nz = makeNoise(seed), A = hex(base);
    return bake(size, size, (u, v) => { const f = (u * count) % 1, ridge = f < 0.12 ? 1 : f < 0.2 ? 0.5 : 0; const g = nz.tile(u, v, 8, 8, 3); const k = 0.92 + ridge * 0.14 + (g - 0.5) * 0.06; return [A[0] * k, A[1] * k, A[2] * k, ridge]; }, { repeat, normal: 2.5 });
  }

  // ───────── 素材の一覧 ─────────
  // 初期化は描画の準備が済んでから（最大の異方性フィルタ値を使うため）。
  M.init = () => {
    const std = (o) => new T.MeshStandardMaterial(o);
    const tx = (o, k) => Object.assign({}, o, k);
    const floorT = planks({ seed: 2, rows: 16, base: 0xcfae84, dark: 0xa68058, repeat: [1, 1] });
    M.floor = std(tx(floorT, { roughness: 1, metalness: 0, envMapIntensity: 0.9 }));
    const deckT = planks({ seed: 21, size: 512, rows: 8, base: 0x9a6d47, dark: 0x6f4a2e, vary: 0.2, gap: 0.012, gapDark: 0.5, bump: 2.2 });
    M.deck = std(tx(deckT, { roughness: 1 }));
    const walnutT = planks({ seed: 31, size: 512, rows: 3, base: 0x7a5538, dark: 0x4f3421, vary: 0.1, gap: 0, grain: 1.3 });
    M.walnut = std({ map: walnutT.map, roughness: 0.55 });
    const oakT = planks({ seed: 33, size: 512, rows: 3, base: 0xd3b48b, dark: 0xb08c60, vary: 0.08, gap: 0, grain: 1.1 });
    M.oak = std({ map: oakT.map, roughness: 0.6 });
    const wallT = plaster({ seed: 3, base: 0xf3efe7, repeat: [2, 2] });
    M.wall = std(tx(wallT, { roughness: 0.95 }));
    M.ceiling = std({ color: 0xf7f4ee, roughness: 1 });
    const accentT = plaster({ seed: 41, base: 0xb9b0a2, amount: 0.07, scale: 9, bump: 1.4, repeat: [2, 2] });
    M.accent = std(tx(accentT, { roughness: 0.9 }));
    const concT = plaster({ seed: 43, base: 0xb6b4ae, amount: 0.06, scale: 12, bump: 0.9, repeat: [2, 2] });
    M.concrete = std(tx(concT, { roughness: 0.9 }));
    const fabT = fabric({ seed: 5, base: 0xb9afa1, repeat: [3, 3] });
    M.sofa = std(tx(fabT, { roughness: 1 }));
    const fab2 = fabric({ seed: 6, base: 0x6f7f76, repeat: [2, 2] });
    M.cushionGreen = std(tx(fab2, { roughness: 1 }));
    const fab3 = fabric({ seed: 8, base: 0xc9764f, repeat: [2, 2] });
    M.cushionTerra = std(tx(fab3, { roughness: 1 }));
    const rugT = fabric({ seed: 7, base: 0xdcd5c8, weave: 60, amount: 0.16, repeat: [4, 3] });
    M.rug = std(tx(rugT, { roughness: 1 }));
    const tatT = tatami({ repeat: [1, 2] });
    M.tatami = std(tx(tatT, { roughness: 0.95 }));
    const tileT = tiles({ base: 0x8f8c86, repeat: [2, 2] });
    M.tile = std(tx(tileT, { roughness: 0.7 }));
    const porchT = tiles({ seed: 12, base: 0xa39e95, repeat: [3, 3] });
    M.porch = std(tx(porchT, { roughness: 0.85 }));
    const qT = quartz({});
    M.quartz = std({ map: qT.map, roughness: 0.22, envMapIntensity: 1.2 });
    const lawnT = ground({ a: 0x5f8443, b: 0x4c7036, scale: 9, repeat: [1, 1] });
    M.lawn = std(tx(lawnT, { roughness: 1 }));
    const soilT = ground({ seed: 23, a: 0x8a7458, b: 0x6d5a43, scale: 18, repeat: [6, 6] });
    M.soil = std(tx(soilT, { roughness: 1 }));
    const asphaltT = plaster({ seed: 47, base: 0x4a4b4e, amount: 0.12, scale: 60, bump: 1.2, repeat: [8, 8] });
    M.asphalt = std(tx(asphaltT, { roughness: 0.95 }));

    M.white = std({ color: 0xf5f3ee, roughness: 0.6 });
    M.whiteGloss = std({ color: 0xfafafa, roughness: 0.25 });
    M.black = std({ color: 0x1b1b1d, roughness: 0.5, metalness: 0.4 });
    M.blackMatte = std({ color: 0x232325, roughness: 0.85 });
    M.steel = std({ color: 0xc9ccd0, roughness: 0.32, metalness: 0.9 });
    M.frame = std({ color: 0x2a2b2e, roughness: 0.45, metalness: 0.6 });
    M.brass = std({ color: 0xb8935a, roughness: 0.35, metalness: 0.9 });
    M.glass = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 1.6, depthWrite: false });
    M.glassDark = std({ color: 0x0c0d10, roughness: 0.08, metalness: 0.6 });
    M.mirror = std({ color: 0xdfe6ea, roughness: 0.03, metalness: 1 });
    M.paper = std({ color: 0xfbf7ec, roughness: 0.95, emissive: 0xfff4dd, emissiveIntensity: 0.12, transparent: true, opacity: 0.93 });
    const lf = (a, b, seed) => std(tx(foliage({ seed, a, b }), { roughness: 0.85, side: T.DoubleSide }));
    M.leaf = lf(0x4f7d3c, 0x2c5229, 27); M.leafLight = lf(0x7da552, 0x4c7a38, 28); M.leafDark = lf(0x3b6534, 0x1f4324, 29);
    M.trunk = std({ color: 0x5b4636, roughness: 0.95 });
    M.pot = std({ color: 0xe6e1d8, roughness: 0.7 });
    M.potDark = std({ color: 0x44423f, roughness: 0.8 });
    M.bulb = std({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 2.4, roughness: 0.4 });
    M.screen = std({ color: 0x0a0b0d, roughness: 0.15, metalness: 0.3 });
    M.ribs = (color, rep) => { const t = ribs({ base: color, repeat: rep || [8, 1] }); return std(tx(t, { roughness: 0.5, metalness: 0.55 })); };
    M.stucco = (color) => { const t = plaster({ seed: 51, base: color, amount: 0.05, scale: 26, bump: 1.1, repeat: [3, 2] }); return std(tx(t, { roughness: 0.95 })); };
    M.planks = planks; M.plaster = plaster; M.tiles = tiles;
    M.color = (c, o) => std(Object.assign({ color: c, roughness: 0.7 }, o || {}));
  };
})();
