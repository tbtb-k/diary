#!/usr/bin/env node
/*
 * 人物モデルとモーションを、ゲームで読み込める形に変換するスクリプト。
 *
 *   元データ : Microsoft Rocketbox Avatar Library（MIT ライセンス）の FBX / TGA
 *   出力     : ../models/avatar_<id>.js  … 人物 1 人ぶん（GLB を base64 で包んだもの）
 *              ../models/anims.js        … 全モーション（独自の軽量形式）
 *
 * 使い方は README.md の「人物データを作り直す」を参照。
 *   node build-assets.cjs info    --src <Rocketbox の Assets フォルダ> --three <node_modules/three>
 *   node build-assets.cjs avatars --src ... --three ... [--only senpai,c1_wife]
 *   node build-assets.cjs anims   --src ... --three ...
 *
 * JS ファイルに base64 で包むのは、Web サーバーなしで HTML をダブルクリックしただけでも
 * 動くようにするため（file:// ではふつうのデータ読み込みがブラウザに止められる）。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(opt('src', ''));
const THREE_DIR = path.resolve(opt('three', ''));
const OUT = path.resolve(opt('out', path.join(__dirname, '..', 'models')));
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;

// ───────── 出演者 ─────────
// sex はモーションの男女の使い分け、h は身長(m)。
const CAST = [
  { id: 'senpai',     src: 'Professions/Business_Male_02',     sex: 'm', h: 1.76 },
  { id: 'c1_husband', src: 'Adults/Male_Adult_09',             sex: 'm', h: 1.72 },
  { id: 'c1_wife',    src: 'Adults/Female_Adult_05',           sex: 'f', h: 1.58 },
  { id: 'c1_child',   src: 'Children/Male_Child_01',           sex: 'm', h: 1.28 },
  { id: 'c2_husband', src: 'Adults/Male_Adult_10',             sex: 'm', h: 1.74 },
  { id: 'c2_wife',    src: 'Adults/Female_Adult_03',           sex: 'f', h: 1.61 },
  { id: 'c3_husband', src: 'Adults/Male_Adult_03',             sex: 'm', h: 1.70 },
  { id: 'c3_wife',    src: 'Professions/Business_Female_03',   sex: 'f', h: 1.56 },
  { id: 'worker_a',   src: 'Professions/Construction_Male_02', sex: 'm', h: 1.73 },
  { id: 'worker_b',   src: 'Professions/Construction_Male_06', sex: 'm', h: 1.78 },
];

// ───────── モーション ─────────
// g: 'mf' は男女それぞれ、'm' は男性版だけを全員で共用。
// len: 切り出す長さ(秒)。元は 30 秒を超えるものが多いので、使う分だけにして容量を抑える。
// loop: 繰り返し再生用に、終わりを始まりの姿勢へなじませる秒数。
const S = 'all_animations_max_motextr_static', XY = 'all_animations_max_motextr_xy';
const ANIMS = [
  // 立ち：待機
  { id: 'idle',          f: 'idle_neutral_01',        g: 'mf', len: 9, loop: 1.0 },
  { id: 'idle2',         f: 'idle_neutral_02',        g: 'mf', len: 9, loop: 1.0 },
  { id: 'breathe',       f: 'idle_breathe_01',        g: 'mf', len: 6, loop: 0.8 },
  { id: 'look_around',   f: 'idle_look_around_01',    g: 'mf', len: 9, loop: 1.0 },
  { id: 'touch_face',    f: 'idle_touch_face_01',     g: 'mf', len: 7, loop: 0.8 },
  // 立ち：話す
  { id: 'talk',          f: 'gestic_talk_neutral_01', g: 'mf', len: 9, loop: 0.9 },
  { id: 'talk_relaxed',  f: 'gestic_talk_relaxed_01', g: 'mf', len: 9, loop: 0.9 },
  { id: 'talk_excited',  f: 'gestic_talk_excited_01', g: 'mf', len: 8, loop: 0.9 },
  { id: 'talk_nervous',  f: 'gestic_talk_nervous_01', g: 'mf', len: 8, loop: 0.9 },
  // 立ち：聞く（うなずく・首を振る・など）
  { id: 'nod',           f: 'gestic_listen_accept_01',  g: 'mf', len: 6, loop: 0.8 },
  { id: 'nod2',          f: 'gestic_listen_accept_02',  g: 'mf', len: 6, loop: 0.8 },
  { id: 'deny',          f: 'gestic_listen_deny_01',    g: 'mf', len: 6, loop: 0.8 },
  { id: 'listen',        f: 'gestic_listen_neutral_01', g: 'mf', len: 8, loop: 0.9 },
  { id: 'listen_excited',f: 'gestic_listen_excited_01', g: 'mf', len: 6, loop: 0.8 },
  { id: 'listen_nervous',f: 'gestic_listen_nervous_01', g: 'mf', len: 7, loop: 0.8 },
  { id: 'listen_relaxed',f: 'gestic_listen_relaxed_01', g: 'mf', len: 8, loop: 0.9 },
  // 立ち：しぐさ
  { id: 'think',         f: 'gestic_thoughtful_01',   g: 'mf', len: 7, loop: 0.8 },
  { id: 'shrug',         f: 'gestic_shrug_01',        g: 'mf', len: 5, loop: 0.7 },
  { id: 'laugh',         f: 'gestic_laugh_low',       g: 'mf', len: 5, loop: 0.7 },
  { id: 'wave',          f: 'wave_01',                g: 'mf', len: 5, loop: 0.7 },
  { id: 'clap',          f: 'claphands_01',           g: 'mf', len: 5, loop: 0.7 },
  { id: 'cheer',         f: 'cheer_01',               g: 'mf', len: 5, loop: 0.7 },
  { id: 'present_r',     f: 'gestic_presentation_right_01', g: 'm', len: 8, loop: 0.9 },
  { id: 'present_l',     f: 'gestic_presentation_left_01',  g: 'm', len: 8, loop: 0.9 },
  // テーブルに着席
  { id: 'sit',           f: 'sit_table_idle_neutral_01', g: 'mf', len: 9, loop: 1.0 },
  { id: 'sit_breathe',   f: 'sit_table_breathe_01',      g: 'mf', len: 6, loop: 0.8 },
  { id: 'sit_think',     f: 'sit_table_gestic_thoughtful', g: 'mf', len: 7, loop: 0.8 },
  { id: 'sit_shrug',     f: 'sit_table_gestic_shrug_01', g: 'mf', len: 5, loop: 0.7 },
  { id: 'sit_look',      f: 'sit_table_idle_look_around', g: 'mf', len: 8, loop: 0.9 },
  { id: 'sit_relaxed',   f: 'sit_table_idle_relaxed_01', g: 'mf', len: 8, loop: 0.9 },
  { id: 'sit_touch_face',f: 'sit_table_idle_touch_face', g: 'mf', len: 7, loop: 0.8 },
  { id: 'sit_nervous',   f: 'sit_table_idle_nervous_01', g: 'm',  len: 7, loop: 0.8 },
  // 歩き（元データがちょうど1周期。前進ぶんを取り除いてその場で足踏みする形にし、移動はゲーム側で行う）
  { id: 'walk',          f: 'walk_neutral',   dir: XY, g: 'mf', detrend: true, fps: 24 },
  { id: 'stroll',        f: 'walk_stroll_01', dir: XY, g: 'mf', detrend: true, fps: 24 },
  // 職人さんの作業
  { id: 'work_mid',      f: 'work_mid',   g: 'm', len: 8, loop: 0.9 },
  { id: 'work_table',    f: 'work_table', g: 'm', len: 8, loop: 0.9 },
];

// ───────── TGA（無圧縮 / RLE の 24・32bit）を読む ─────────
function readTGA(file) {
  const b = fs.readFileSync(file);
  const idLen = b[0], type = b[2], w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17];
  const ch = bpp / 8; let p = 18 + idLen;
  if (b[1] !== 0 || (type !== 2 && type !== 10) || (ch !== 3 && ch !== 4)) throw new Error('未対応の TGA: ' + file);
  const px = Buffer.alloc(w * h * ch);
  if (type === 2) b.copy(px, 0, p, p + w * h * ch);
  else { let o = 0; while (o < px.length) { const c = b[p++], n = (c & 127) + 1; if (c & 128) { for (let i = 0; i < n; i++) { b.copy(px, o, p, p + ch); o += ch; } p += ch; } else { b.copy(px, o, p, p + n * ch); o += n * ch; p += n * ch; } } }
  for (let i = 0; i < px.length; i += ch) { const t = px[i]; px[i] = px[i + 2]; px[i + 2] = t; } // BGR → RGB
  return { w, h, ch, px, topDown: !!(desc & 0x20) };
}

async function webp(file, { size, quality, alpha, invertGreen }) {
  const sharp = require('sharp');
  const t = readTGA(file);
  let px = t.px, ch = t.ch;
  if (!alpha && ch === 4) { const o = Buffer.alloc(t.w * t.h * 3); for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { o[j] = px[i]; o[j + 1] = px[i + 1]; o[j + 2] = px[i + 2]; } px = o; ch = 3; }
  if (invertGreen) for (let i = 1; i < px.length; i += ch) px[i] = 255 - px[i];
  let img = sharp(px, { raw: { width: t.w, height: t.h, channels: ch } });
  // FBX の UV は「画像の左下が原点」、glTF は「左上が原点」。UV はそのまま使うので、画像のほうを上下逆にして合わせる。
  // 左下原点の TGA は下の行から並んでいるので、そのまま読めば上下逆の画像になる。上から並ぶ TGA だけ反転する。
  if (t.topDown) img = img.flip();
  if (size && size < t.w) img = img.resize(size, size, { kernel: 'lanczos3' });
  return img.webp({ quality, alphaQuality: 90, effort: 6, smartSubsample: true }).toBuffer();
}

async function openPage() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR', String(e)));
  // サーバーは立てず、ページからの読み込みをローカルのファイルで直接返す。
  await page.route('http://convert.local/**', route => {
    const u = decodeURIComponent(new URL(route.request().url()).pathname);
    const f = u.startsWith('/three/') ? path.join(THREE_DIR, u.slice(7)) : u.startsWith('/src/') ? path.join(SRC, u.slice(5)) : path.join(__dirname, u);
    fs.readFile(f, (e, d) => e ? route.fulfill({ status: 404, body: 'not found' }) : route.fulfill({ status: 200, contentType: f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: d }));
  });
  await page.goto('http://convert.local/convert.html');
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  return { browser, page };
}

const writePack = (file, key, buf, meta) => {
  fs.mkdirSync(OUT, { recursive: true });
  const head = '/* Microsoft Rocketbox Avatar Library (c) 2020 Microsoft - MIT License. このファイルは tools/build-assets.cjs が生成したもの。 */\n';
  fs.writeFileSync(path.join(OUT, file), head + `(window.JE_ASSETS=window.JE_ASSETS||{})[${JSON.stringify(key)}]={meta:${JSON.stringify(meta)},data:"${buf.toString('base64')}"};\n`);
};

async function buildAvatars() {
  const { NodeIO } = require('@gltf-transform/core');
  const { EXTTextureWebP } = require('@gltf-transform/extensions');
  const { weld, prune, sparse } = require('@gltf-transform/functions');
  const { browser, page } = await openPage();
  for (const c of CAST) {
    if (ONLY && !ONLY.includes(c.id)) continue;
    const name = path.basename(c.src), dir = path.join(SRC, 'Avatars', c.src);
    const res = await page.evaluate(u => window.convertAvatar(u), `/src/Avatars/${c.src}/Export/${name}_facial.fbx`);
    const io = new NodeIO().registerExtensions([EXTTextureWebP]);
    const doc = await io.readBinary(new Uint8Array(Buffer.from(res.glb, 'base64')));
    doc.createExtension(EXTTextureWebP).setRequired(true);
    const texDir = path.join(dir, 'Textures');
    for (const mat of doc.getRoot().listMaterials()) {
      const mn = mat.getName();                       // 例: m008_body / m008_head / m008_opacity
      const part = mn.replace(/^[a-z]+\d+_/i, '');
      const isHair = part === 'opacity';
      const colorFile = path.join(texDir, mn + '_color.tga'), normalFile = path.join(texDir, mn + '_normal.tga');
      if (fs.existsSync(colorFile)) mat.setBaseColorTexture(doc.createTexture(mn + '_color').setMimeType('image/webp')
        .setImage(await webp(colorFile, { size: 1024, quality: isHair ? 88 : 84, alpha: isHair })));
      if (!isHair && fs.existsSync(normalFile)) mat.setNormalTexture(doc.createTexture(mn + '_normal').setMimeType('image/webp')
        .setImage(await webp(normalFile, { size: 1024, quality: 80, invertGreen: !!opt('invert-green', '') })));
      mat.setMetallicFactor(0).setRoughnessFactor(part === 'head' ? 0.62 : isHair ? 0.5 : 0.8);
      if (isHair) mat.setAlphaMode('MASK').setAlphaCutoff(0.42).setDoubleSided(true);
    }
    await doc.transform(weld(), sparse(), prune());
    const glb = Buffer.from(await io.writeBinary(doc));
    const meta = { id: c.id, sex: c.sex, h: c.h, rawH: +res.log.height.toFixed(2), src: 'Microsoft Rocketbox / ' + name };
    writePack(`avatar_${c.id}.js`, 'avatar:' + c.id, glb, meta);
    console.log(c.id.padEnd(11), (glb.length / 1024).toFixed(0).padStart(6) + ' KB ', res.log.parts.join(' | '), ' h=' + res.log.height.toFixed(1), 'bones=' + res.log.bones);
  }
  await browser.close();
}

async function animInfo() {
  const { browser, page } = await openPage();
  for (const a of ANIMS) for (const sx of a.g === 'mf' ? ['m', 'f'] : ['m']) {
    const u = `/src/Animations/${a.dir || S}/${sx}_${a.f}.max.fbx`;
    const r = await page.evaluate(u => window.animInfo(u), u).catch(e => ({ error: String(e).slice(0, 80) }));
    console.log((sx + '_' + a.id).padEnd(18), JSON.stringify(r));
  }
  await browser.close();
}

async function buildAnims() {
  const { browser, page } = await openPage();
  const index = {}; const chunks = []; let off = 0;
  const push = (b) => { const buf = Buffer.from(b, 'base64'); const o = off; chunks.push(buf); off += buf.length; if (off % 4) { const pad = Buffer.alloc(4 - off % 4); chunks.push(pad); off += pad.length; } return [o, buf.length]; };
  for (const a of ANIMS) for (const sx of a.g === 'mf' ? ['m', 'f'] : ['m']) {
    const u = `/src/Animations/${a.dir || S}/${sx}_${a.f}.max.fbx`;
    const r = await page.evaluate(([u, o]) => window.convertAnim(u, o), [u, { start: a.start || 0, len: a.len, fps: a.fps || 12, loop: a.loop, cycle: a.cycle, detrend: a.detrend }]);
    index[sx + '_' + a.id] = { dur: +r.dur.toFixed(4), frames: r.frames, bones: r.bones.map(b => [b.name, b.n]), rot: push(r.rot), pos: push(r.pos), travel: +(r.travel / 100).toFixed(4) };
    console.log((sx + '_' + a.id).padEnd(18), r.dur.toFixed(2) + 's', r.frames + 'f', 'anim bones=' + r.bones.filter(b => b.n > 1).length, r.travel ? 'travel=' + (r.travel / 100).toFixed(2) + 'm' : '');
  }
  await browser.close();
  const bin = Buffer.concat(chunks);
  writePack('anims.js', 'anims', bin, { clips: index });
  console.log('anims.js', (bin.length / 1024).toFixed(0) + ' KB (binary)');
}

({ avatars: buildAvatars, anims: buildAnims, info: animInfo }[cmd] || (async () => console.log('usage: build-assets.cjs info|avatars|anims --src <Assets> --three <three>')))()
  .catch(e => { console.error(e); process.exit(1); });
