// ほしくずサバイバーの自動プレイテスト
// 使い方（リポジトリのルートで）: node .claude/skills/daily-game/tests/playtest.js [ゲームのHTML]
// 結果: tests/out/ にスクリーンショットと report.json。問題があれば終了コード 1。
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = path.resolve(process.argv[2] || 'pages/game_hoshikuzu-survivor.html');
const OUT = path.join(__dirname, 'out');
const SEEDS = [1, 2, 3, 4];
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const checks = [];
const shots = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK ' : 'NG '} ${name}${detail ? ' … ' + detail : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- 自動操作（ページの中で動く） ----
// smart: 敵と敵の弾から離れつつ、安全なときはほしくずを拾いに行く
const BOTS = `
window.__bots = {
  idle: () => [0, 0],
  smart(G) {
    const p = G.player; let fx = 0, fy = 0, threat = 0;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy, R = 150 + e.r * 2;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1, w = (R - d) / R, m = e.type === 'boss' ? 4 : e.type === 'elite' ? 2 : 1;
        fx += dx / d * w * w * m; fy += dy / d * w * w * m; threat += w * m;
      }
    }
    for (const b of G.ebullets) {
      const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 < 100 * 100) { const d = Math.sqrt(d2) || 1, w = (100 - d) / 100; fx += dx / d * w * 3; fy += dy / d * w * 3; }
    }
    let best = null, bd = 1e12;
    for (const g of G.gems) { const dx = g.x - p.x, dy = g.y - p.y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = g; } }
    for (const it of G.items) { const dx = it.x - p.x, dy = it.y - p.y, d2 = (dx * dx + dy * dy) * 0.5; if (d2 < bd) { bd = d2; best = it; } }
    if (best && bd < 320 * 320) { const d = Math.sqrt((best.x - p.x) ** 2 + (best.y - p.y) ** 2) || 1, w = threat < 0.6 ? 0.8 : 0.25; fx += (best.x - p.x) / d * w; fy += (best.y - p.y) / d * w; }
    const t = G.t * 0.3; fx += Math.cos(t) * 0.12; fy += Math.sin(t) * 0.12;
    const l = Math.hypot(fx, fy); return l > 0.05 ? [fx / l, fy / l] : [0, 0];
  },
  // 選び方：まだ持っていない武器 → 持っている武器 → 補助、の順
  choose(ids, G) {
    const order = ['pulse', 'chain', 'nova', 'orbit', 'power', 'cool', 'armor', 'regen', 'thrust', 'magnet', 'heal', 'bonus'];
    let bi = 0, bs = 1e9;
    ids.forEach((id, i) => { const s = order.indexOf(id); if (s < bs) { bs = s; bi = i; } });
    return bi;
  },
};`;

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 2, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  if (opts.noStorage) await ctx.addInitScript(() => { const no = () => { throw new Error('storage blocked'); }; Storage.prototype.getItem = no; Storage.prototype.setItem = no; });
  if (opts.seenHow) await ctx.addInitScript(() => { try { localStorage.setItem('hs-seen-how', 'true'); } catch (_) {} });
  const page = await ctx.newPage();
  const tag = opts.tag || `${viewport.width}x${viewport.height}`;
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  await page.goto('file://' + FILE, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
  await page.addScriptTag({ content: BOTS });
  return { ctx, page };
}
async function shot(page, name) {
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f });
  shots.push(f);
}
const visible = (page, id) => page.evaluate(i => !document.getElementById(i).hidden, id);

let browser;
(async () => {
  browser = await chromium.launch();
  const report = { file: path.relative(process.cwd(), FILE), date: new Date().toISOString(), sims: [], perf: null };

  // ---- 1. スマホ（390×844）で、実際の画面操作どおりに通す ----
  {
    const { ctx, page } = await open({ width: 390, height: 844 }, { mobile: true, tag: 'phone' });
    await wait(800);
    await shot(page, '01_title_390');
    await page.click('#b-start');
    check('はじめての「あそぶ」で遊び方が出る', await visible(page, 'how'));
    await shot(page, '02_how_390');
    await page.click('#b-how-ok');
    await wait(300);
    check('「はじめる」でゲームが始まる', (await page.evaluate(() => window.__game.scene)) === 'play');
    // 指でスライドして動く
    const before = await page.evaluate(() => window.__game.state());
    await page.mouse.move(195, 600); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(195 + i * 6, 600 - i * 3); await wait(30); }
    await wait(700);
    await shot(page, '03_play_390');
    await page.mouse.up();
    const after = await page.evaluate(() => window.__game.state());
    check('指でスライドすると自機が動く', after.x - before.x > 20, `x: ${before.x} → ${after.x}`);
    // レベルアップ
    await page.evaluate(() => window.__game.debug.addXp(8));
    await page.waitForFunction(() => window.__game.scene === 'levelup', null, { timeout: 3000 }).catch(() => {});
    check('ほしくずが貯まるとレベルアップ画面が出る', await visible(page, 'levelup'));
    await wait(500);
    await shot(page, '04_levelup_390');
    // 引き直し（2回まで）
    const rr0 = await page.textContent('#b-reroll');
    await page.click('#b-reroll'); await wait(500);
    const rr1 = await page.textContent('#b-reroll');
    await page.click('#b-reroll'); await wait(500);
    const rr2 = await page.textContent('#b-reroll');
    check('引き直しができて、2回で打ち止めになる', rr0.includes('2') && rr1.includes('1') && rr2.includes('0') && (await visible(page, 'levelup')) && (await page.$$('#choices .choice')).length === 3, `${rr0} / ${rr1} / ${rr2}`);
    await shot(page, '04b_reroll_390');
    const w0 = await page.evaluate(() => Object.keys(window.__game.state().weapons).length + Object.keys(window.__game.state().passives).length);
    await page.click('#choices .choice');
    await wait(200);
    const st = await page.evaluate(() => window.__game.state());
    check('強化をえらぶとゲームに戻る', st.scene === 'play');
    check('えらんだ強化が反映される', Object.keys(st.weapons).length + Object.keys(st.passives).length > w0 || Object.values(st.weapons).reduce((a, b) => a + b, 0) > 1);
    // 強敵を倒すと一瞬だけ止まる（ヒットストップ）
    const hs = await page.evaluate(() => { const d = window.__game.debug; d.god(true); d.spawn('elite', 1); const ok = d.killOne('elite'); return { ok, fr: window.__game.world().freeze }; });
    check('強敵を倒すと一瞬だけ時間が止まる（ヒットストップ）', hs.ok && hs.fr > 0 && hs.fr <= 0.1, `freeze=${hs.fr}`);
    await page.evaluate(() => window.__game.debug.god(false));
    // 強敵・ボスが画面の外にいると、ふちに矢印が出る
    await page.evaluate(() => { const d = window.__game.debug; d.god(true); d.spawn('elite', 1); });
    await wait(250);
    const ar = await page.evaluate(() => window.__game.state().arrows);
    check('画面の外の強敵に、方向の矢印が出る', ar >= 1, `arrows=${ar}`);
    await page.evaluate(() => { const g = window.__game.world(); g.enemies.filter(e => e.type === 'elite').forEach(e => { e.x = g.player.x + 10; e.y = g.player.y + 10; }); });
    await wait(250);
    const ar2 = await page.evaluate(() => window.__game.state().arrows);
    check('近くに来た強敵の矢印は消える', ar2 === 0, `arrows=${ar2}`);
    await page.evaluate(() => { const g = window.__game.world(); g.enemies.filter(e => e.type === 'elite').forEach(e => { e.dead = true; }); window.__game.debug.god(false); });
    // 分裂する敵：倒すと小さな2体に分かれる
    const sp = await page.evaluate(() => { const d = window.__game.debug, g = window.__game.world(); d.god(true); d.spawn('splitter', 1); const ok = d.killOne('splitter'); return { ok, minis: g.enemies.filter(e => e.type === 'mini' && !e.dead).length }; });
    check('分裂する敵を倒すと小さな敵が2体出る', sp.ok && sp.minis === 2, `minis=${sp.minis}`);
    await page.evaluate(() => { const g = window.__game.world(); g.enemies.forEach(e => { if (e.type === 'mini') e.dead = true; }); window.__game.debug.god(false); });
    // 自爆する敵「ドカン」（Day 12）：近づくと点滅して爆発し、まわりの敵と自機にダメージ。爆発の前に倒せば爆発しない
    const bm = await page.evaluate(() => {
      const d = window.__game.debug, g = window.__game.world(), p = g.player;
      d.give('regen', 0); // ナノリペアの回復でダメージが18未満に見えないように（Day 17）
      g.enemies.forEach(e => { e.dead = true; }); g.enemies.length = 0;
      d.spawn('bomber', 1); const b = g.enemies[g.enemies.length - 1]; b.x = p.x + 50; b.y = p.y; b.hp = 1e6; // 自機の武器に先に倒されないように（爆発のしくみだけを見る）
      d.spawn('drifter', 1); const v = g.enemies[g.enemies.length - 1]; v.x = p.x + 95; v.y = p.y + 20; v.spd = 0;
      const hp0 = p.hp, k0 = g.kills, b0 = g.booms; p.inv = 0;
      window.__game.sim(0.2, () => [0, 0]); const fused = b.fuse != null && !b.dead;
      window.__game.sim(1.0, () => [0, 0]);
      const r = { fused, boomed: g.booms - b0 === 1 && b.dead, victim: v.dead, hurt: hp0 - p.hp, kills: g.kills - k0 };
      d.spawn('bomber', 1); const b2 = g.enemies[g.enemies.length - 1]; b2.x = p.x + 300; b2.y = p.y;
      const b1 = g.booms; d.killOne('bomber'); r.safeKill = b2.dead && g.booms === b1;
      return r;
    });
    check('自爆する敵は近づくと点滅して爆発し、まわりの敵も巻きこむ', bm.fused && bm.boomed && bm.victim && bm.hurt >= 18, `点滅=${bm.fused} 爆発=${bm.boomed} 巻きこみ=${bm.victim} 自機-${bm.hurt}`);
    check('爆発する前に倒した自爆敵は爆発しない', bm.safeKill);
    // 「○体まきこみ！」（Day 19）：爆発で2体以上倒すと大きな文字が出る。1体では出ない
    // 文字は演出なので sim（演出オフ）ではなく、ふつうの時間の流れで確かめる
    const chainSetup = (k) => page.evaluate((k) => {
      const d = window.__game.debug, g = window.__game.world(), p = g.player;
      d.god(true);
      g.enemies.forEach(e => { e.dead = true; }); g.enemies.length = 0;
      d.fxArrays()[1].length = 0;
      d.spawn('bomber', 1); const b = g.enemies[g.enemies.length - 1]; b.x = p.x + 50; b.y = p.y; b.hp = 1e6;
      for (let i = 0; i < k; i++) { d.spawn('drifter', 1); const v = g.enemies[g.enemies.length - 1]; v.x = p.x + 80 + i * 6; v.y = p.y + 30 - i * 12; v.spd = 0; v.hp = 1; }
      b.fuse = 0.001; // 次のフレームの最初（武器より先）に爆発する
    }, k);
    const chainRead = () => page.evaluate(() => {
      const d = window.__game.debug, g = window.__game.world(), big = d.fxArrays()[1].find(n => n.big);
      return { chain: g.lastChain, best: g.chainBest, text: big ? big.text : '' };
    });
    await chainSetup(4); await wait(150); const c4 = await chainRead();
    await shot(page, '04b_chain_390');
    await chainSetup(1); await wait(150); const c1 = await chainRead();
    await page.evaluate(() => window.__game.debug.god(false));
    const ch = { chain4: c4.chain, best: c4.best, text: c4.text, chain1: c1.chain, big1: !!c1.text };
    check('ドカンで2体以上倒すと「○体まきこみ！」が出る（1体では出ない）', ch.chain4 === 4 && ch.text === '4体まきこみ！' && ch.best >= 4 && ch.chain1 === 1 && !ch.big1, JSON.stringify(ch));
    await page.evaluate(() => { const p = window.__game.world().player; p.hp = p.maxHp; });
    // 一時停止
    await page.click('#b-pause');
    check('一時停止できる', await visible(page, 'pause'));
    await shot(page, '05_pause_390');
    const tP = (await page.evaluate(() => window.__game.state())).t; await wait(500);
    check('一時停止中は時間が止まる', (await page.evaluate(() => window.__game.state())).t === tP);
    // 振動のON/OFF（OFFなら navigator.vibrate が呼ばれない。設定は保存される）
    const vb = await page.evaluate(() => {
      let n = 0; try { Object.defineProperty(navigator, 'vibrate', { value: () => { n++; return true; }, configurable: true }); } catch (_) { }
      const b = document.getElementById('b-vib2'); const t0 = b.textContent;
      b.click(); const t1 = b.textContent; const saved = localStorage.getItem('hs-vib');
      return { t0, t1, saved };
    });
    check('振動をOFFにできて、設定が保存される', /ON/.test(vb.t0) && /OFF/.test(vb.t1) && vb.saved === 'false', `${vb.t0} → ${vb.t1} / 保存=${vb.saved}`);
    await page.click('#b-vib2'); // ONにもどす
    check('振動ボタンでONにもどせる', /ON/.test(await page.textContent('#b-vib2')));
    await page.click('#b-resume');
    // 進化の手がかり（Day 22）：カードに「あと何で進化するか」、選ぶと進化するカードは黄色く光る
    const eh = await page.evaluate(() => {
      const d = window.__game.debug, g = window.__game.world(); d.god(true);
      d.give('pulse', 5); d.give('cool', 0);
      const a = d.openLevel(['pulse', 'cool', 'armor']);
      d.give('cool', 1);
      const b = d.openLevel(['pulse', 'power', 'armor']);
      d.give('pulse', 6); d.give('cool', 0);
      const c = d.openLevel(['cool', 'power', 'armor']);
      return { a, b, c };
    });
    await wait(500);
    await shot(page, '04d_evohint_390');
    const ehBox = await page.evaluate(() => { const r = document.querySelector('#choices .choice.evo-now'), e = r && r.querySelector('.evo'); if (!e) return null; const rb = r.getBoundingClientRect(), re = e.getBoundingClientRect(); return { ok: re.right <= rb.right + 0.5 && re.bottom <= rb.bottom + 0.5 && rb.right <= innerWidth }; });
    await page.click('#choices .choice:nth-child(3)'); await wait(200);
    check('カードに進化の手がかりが出て、選ぶと進化するカードは光る',
      /冷却ユニット/.test(eh.a[0].t) && !eh.a[0].now && /進化に必要/.test(eh.a[1].t) && !eh.a[1].now && eh.a[2].t === '' &&
      /これで/.test(eh.b[0].t) && eh.b[0].now && !eh.b[1].now && eh.c[0].now && /パルスストーム/.test(eh.c[0].t) &&
      ehBox && ehBox.ok && (await page.evaluate(() => window.__game.scene)) === 'play',
      `${eh.a[0].t} / ${eh.a[1].t} / ${eh.b[0].t} / ${eh.c[0].t}`);
    await page.evaluate(() => { const d = window.__game.debug; d.give('cool', 0); d.give('pulse', 1); });
    // 進化：パルスLv6＋冷却ユニットで「パルスストーム」
    const ev0 = await page.evaluate(() => { const d = window.__game.debug; d.god(true); d.give('pulse', 6); return window.__game.state().evolved; });
    const ev1 = await page.evaluate(() => { const d = window.__game.debug; d.give('cool', 1); return window.__game.state().evolved; });
    check('パルスLv6＋冷却ユニットで進化する（冷却なしでは進化しない）', ev0 === false && ev1 === true);
    // 出したての敵は射程（380）の外にいるので、自機の近くに置いてから数える（Day 11：待ち時間しだいでNGになることがあった）
    await page.evaluate(() => { const d = window.__game.debug, g = window.__game.world(); d.spawn('drifter', 3); g.enemies.filter(e => !e.dead).slice(-3).forEach((e, i) => { e.x = g.player.x + 160 + i * 20; e.y = g.player.y - 60; }); });
    let eb = 0;
    for (let i = 0; i < 12 && eb < 4; i++) { await wait(150); eb = await page.evaluate(() => window.__game.world().bullets.filter(b => b.evo).length); }
    check('進化後は金色の弾が出る', eb >= 4);
    await page.evaluate(() => { const g = window.__game.world(); g.enemies.forEach(e => { e.dead = true; }); });
    // 進化：オービットLv6＋推進エンジンで「ギャラクシー」（Day 15）。玉が4→6個、輪の上の敵に当たる
    const oe = await page.evaluate(() => {
      const d = window.__game.debug, g = window.__game.world();
      const th = g.passives.thrust || 0; d.give('thrust', 0); d.give('orbit', 6); const s0 = window.__game.state();
      // 前の場面で推進エンジンを選んでいることがあるので、いったん0にしてから確かめる
      d.give('thrust', Math.max(1, th)); const s1 = window.__game.state();
      return { e0: s0.orbEvolved, n0: s0.orbs, e1: s1.orbEvolved, n1: s1.orbs, other: s1.evolved };
    });
    check('オービットLv6＋推進エンジンで進化する（推進なしでは進化しない）', oe.e0 === false && oe.e1 === true && oe.n0 === 4 && oe.n1 === 6 && oe.other === true, `玉 ${oe.n0} → ${oe.n1}`);
    // 輪の上に硬い敵を置き、進化した玉が当たるかを数える（他の武器で倒れないよう、HPを大きくする）
    await page.evaluate(() => { const d = window.__game.debug, g = window.__game.world(); d.spawn('brute', 1); const e = g.enemies[g.enemies.length - 1]; e.hp = e.maxHp = 1e6; e.x = g.player.x + 54 * 1.3 * 1.15; e.y = g.player.y; e.speed = 0; e.kx = e.ky = 0; window.__orbE = e; });
    await wait(700);
    await shot(page, '04c_galaxy_390');
    const oh = await page.evaluate(() => { const e = window.__orbE; const hit = e.hp < e.maxHp; e.dead = true; return hit; });
    check('進化したオービットの玉が、広がった輪の上の敵に当たる', oh);
    // ほしくずをひろう範囲（Day 11：72→80）
    // 前の場面で引力フィールドを選んでいることがあるので、いったん0にしてから確かめる（Day 18）
    const mr = await page.evaluate(() => { const g = window.__game.world(), m = g.passives.magnet || 0; window.__game.debug.give('magnet', 0); const r = g.st.magnetR; window.__game.debug.give('magnet', m); return r; });
    check('ほしくずをひろう範囲が 80 ある（引力フィールドなし）', Math.abs(mr - 80) < 0.01, `magnetR=${mr}`);
    // ほしくずの音階と光の尾（Day 16）：つづけて拾うほど音が上がり（2オクターブで頭打ち）、10個ごとにキラッ、吸い寄せ中は尾が出る
    const gs = await page.evaluate(() => {
      const d = window.__game.debug, g = window.__game.world();
      const f = []; for (let c = 1; c <= 14; c++) f.push(d.gemFreq(c));
      const up = f.slice(0, 11).every((v, i) => i === 0 || v > f[i - 1]), cap = f[10] === f[13], oct2 = Math.abs(f[10] / f[0] - 4) < 0.01;
      g.gemCombo = 0; g.gemComboT = 0; const ch0 = g.gemChains;
      for (let i = 0; i < 20; i++) d.addXp(0);
      const chains = g.gemChains - ch0;
      g.gems.length = 0; // 経験値0のほしくずで尾だけ確かめる（レベルアップ画面を出さない）
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = 50 + (i % 4) * 7; g.gems.push({ x: g.player.x + Math.cos(a) * r, y: g.player.y + Math.sin(a) * r, v: 0, mag: false, ms: 0, dead: false }); }
      return { up, cap, oct2, chains, lo: Math.round(f[0]), hi: Math.round(f[10]) };
    });
    await wait(60);
    const trails = await page.evaluate(() => window.__game.debug.trails());
    await shot(page, '04d_gemtrail_390');
    check('ほしくずをつづけて拾うと音が上がり、10個ごとにキラッ、吸い寄せ中は光の尾が出る', gs.up && gs.cap && gs.oct2 && gs.chains === 2 && trails >= 10, `${gs.lo}Hz→${gs.hi}Hz 頭打ち=${gs.cap} キラッ=${gs.chains}回 尾=${trails}本`);
    // ほしくずのコンボ数（Day 23）：4個までは出ず、5個つづけると自機の近くに「×5」、拾わずにいると消える
    const comboAt = (n) => page.evaluate((n) => { const g = window.__game.world(); g.gems.length = 0; g.gemCombo = n - 1; g.gemComboT = 0.6; window.__game.debug.addXp(0); }, n);
    await comboAt(4); await wait(60); const cb4 = (await page.evaluate(() => window.__game.state())).comboShown;
    await comboAt(5); await wait(60); const cb5 = (await page.evaluate(() => window.__game.state())).comboShown;
    await comboAt(20); await wait(40); const cb20 = (await page.evaluate(() => window.__game.state())).comboShown;
    await shot(page, '04e_gemcombo_390');
    await wait(900); const cbOff = await page.evaluate(() => { const s = window.__game.state(); return { shown: s.comboShown, combo: s.gemCombo }; });
    check('ほしくずを5個つづけて拾うと「×5」が出て、拾わずにいると消える（4個までは出ない）', cb4 === 0 && cb5 === 5 && cb20 === 20 && cbOff.shown === 0 && cbOff.combo === 0, `4個=${cb4} 5個=${cb5} 20個=${cb20} 0.9秒後=${cbOff.shown}`);
    // 粒の上限と後かたづけ（Day 14：画質が下がると上限も下がる／配列を作り直さない）
    const fx = await page.evaluate(() => {
      const d = window.__game.debug, before = d.fxArrays();
      const full = d.burst(2000), cap1 = window.__game.state().partMax;
      d.setQuality(0.5); d.stepFx(1.5);
      const low = d.burst(2000), cap2 = window.__game.state().partMax;
      const left = d.stepFx(1.5);
      d.setQuality(1);
      const same = d.fxArrays().every((a, i) => a === before[i]);
      return { full, cap1, low, cap2, left, same };
    });
    check('光の粒は上限を超えず、画質が下がると上限も下がり、時間で消える', fx.full <= fx.cap1 && fx.cap1 === 700 && fx.low <= fx.cap2 && fx.cap2 === 350 && fx.left < 20 && fx.same, `上限 ${fx.full}/${fx.cap1} → ${fx.low}/${fx.cap2}、1.5秒後 ${fx.left}、配列そのまま=${fx.same}`);
    // 粒は色と明るさごとにまとめて塗る（Day 21：700粒でも塗る回数はひとけた〜数十回）
    await page.evaluate(() => window.__game.debug.burst(2000));
    await wait(80);
    const pb = await page.evaluate(() => { const s = window.__game.state(); return { parts: s.parts, calls: s.partCalls }; });
    await shot(page, '04e_parts_390');
    check('光の粒は色と明るさごとにまとめて塗られる（たくさんあっても塗る回数が少ない）', pb.parts >= 400 && pb.calls >= 1 && pb.calls <= 40, `粒 ${pb.parts} 個 → 塗った回数 ${pb.calls}`);
    await page.evaluate(() => window.__game.debug.stepFx(1.5));
    // ボス
    await page.evaluate(() => { window.__game.debug.god(true); window.__game.debug.give('nova', 3); window.__game.debug.setTime(299); });
    await page.waitForFunction(() => window.__game.state().boss !== null, null, { timeout: 5000 }).catch(() => {});
    check('5:00 でボスが出る', (await page.evaluate(() => window.__game.state())).boss !== null);
    await wait(1200);
    // 遊んでいる最中に実績が取れると、その場で画面の上に小さく出る（Day 20）
    const at = await page.evaluate(() => {
      let have = {}; try { have = JSON.parse(localStorage.getItem('hs-ach') || '{}'); } catch (_) {}
      const t = document.getElementById('achtoast'), r = t.getBoundingClientRect(), bb = document.getElementById('bossbar').getBoundingClientRect();
      return { scene: window.__game.scene, boss: !!have.boss, on: t.classList.contains('on'), text: t.textContent, op: +getComputedStyle(t).opacity,
        fits: r.left >= 0 && r.right <= innerWidth, below: r.top >= bb.bottom - 1, got: window.__game.world().achGot.map(a => a.id) };
    });
    check('遊んでいる最中に実績が取れると、その場で「実績ゲット！」が出る（結果画面を待たない）', at.scene === 'play' && at.boss && at.on && at.op > 0.5 && /実績ゲット/.test(at.text) && at.fits && at.below && at.got.includes('boss'),
      `場面=${at.scene} 保存=${at.boss} 表示=「${at.text}」 はみ出しなし=${at.fits} ボスバーの下=${at.below} この回=${at.got.join(',')}`);
    await shot(page, '06_boss_390');
    // ボス戦中はドカンが出ない／60秒たつとボスが弱って受けるダメージが増える（Day 17）
    const bw = await page.evaluate(() => {
      const g = window.__game, G = g.world();
      G.enemies.forEach(e => { if (e.type === 'bomber') e.dead = true; });
      const hpKeep = G.boss.hp; G.boss.hp = G.boss.maxHp = 1e6;
      g.sim(40, () => [0, 0]);
      const bombers = G.enemies.filter(e => e.type === 'bomber' && !e.dead).length;
      const weak0 = G.boss.weak;
      const barWeak0 = document.getElementById('bossbar').classList.contains('weak');
      let before = 0; for (let i = 0; i < 20; i++) before += g.debug.hitBoss(100);
      G.boss.born = G.t - 59.97;
      return { bombers, weak0, barWeak0, before, hpKeep };
    });
    await wait(500);
    const bw2 = await page.evaluate(() => {
      const g = window.__game, G = g.world();
      let after = 0; for (let i = 0; i < 20; i++) after += g.debug.hitBoss(100);
      const bb = document.getElementById('bossbar'), tag = bb.querySelector('.bw');
      const fillBg = getComputedStyle(document.getElementById('bossfill')).backgroundImage;
      return { weak: G.boss.weak, after, banner: document.getElementById('banner').textContent,
        barWeak: bb.classList.contains('weak'), tagShown: !!tag && getComputedStyle(tag).display !== 'none' && tag.getBoundingClientRect().width > 0,
        tagText: tag ? tag.textContent : '', yellow: /255, 216, 74/.test(fillBg),
        fits: bb.getBoundingClientRect().right <= innerWidth && (!tag || tag.getBoundingClientRect().right <= innerWidth) };
    });
    check('ボス戦中はドカンが出ない', bw.bombers === 0 && !bw.weak0, `40秒でドカン ${bw.bombers}体`);
    const ratio = bw2.after / bw.before;
    check('ボス戦が60秒続くとボスが弱り、受けるダメージが約1.6倍になる', bw2.weak && ratio > 1.4 && ratio < 1.8 && /弱った/.test(bw2.banner), `×${ratio.toFixed(2)} / ${bw2.banner}`);
    check('ボスが弱るとHPバーが黄色に変わり「弱ってる！」の印が出る（弱る前は出ない）', !bw.barWeak0 && bw2.barWeak && bw2.tagShown && bw2.yellow && bw2.fits, `前=${bw.barWeak0} 後=${bw2.barWeak} 印=「${bw2.tagText}」 黄色=${bw2.yellow} はみ出しなし=${bw2.fits}`);
    await shot(page, '06b_boss_weak_390');
    await page.evaluate(() => { const B = window.__game.world().boss; B.hp = B.maxHp = 5400; });
    // ゲームオーバー → 結果 → もう1回
    await page.evaluate(() => { window.__game.debug.god(false); window.__game.debug.hurt(9999); });
    await page.waitForFunction(() => window.__game.scene === 'result', null, { timeout: 8000 }).catch(() => {});
    check('HPが0になると結果画面が出る', await visible(page, 'result'));
    await wait(400);
    const bname = await page.evaluate(() => document.getElementById('res-bname').textContent);
    check('結果画面にビルド名が出る', /型$/.test(bname), bname);
    const achNew = await page.evaluate(() => [...document.querySelectorAll('#res-ach span')].map(x => x.textContent));
    const achHead = await page.evaluate(() => { const h = document.querySelector('#res-ach b'); return h ? h.textContent : ''; });
    check('5:00まで生きのびると、結果画面に「実績ゲット！」が出る', /実績ゲット/.test(achHead) && achNew.length >= 3 && achNew.some(t => /ブラックスターと対面/.test(t)), `${achHead} ${achNew.join(' / ')}`);
    await shot(page, '07_result_390');
    await page.click('#b-retry');
    await wait(300);
    const re = await page.evaluate(() => window.__game.state());
    check('「もう1回」ですぐ始まる', re.scene === 'play' && re.t < 2 && re.hp === re.maxHp);
    // リロードしてもベスト記録が残る
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game);
    const bestText = await page.textContent('#best');
    check('リロードしてもベスト記録が残る', /ベスト/.test(bestText), bestText.trim());
    // 実績：リロード後も残り、タイトルから一覧が見られる。取った実績は2回目には出ない
    const achBtn = await page.textContent('#b-ach');
    const achN = +(achBtn.match(/(\d+) \/ (\d+)/) || [])[1];
    await page.click('#b-ach');
    await wait(300);
    const achList = await page.evaluate(() => ({ got: document.querySelectorAll('#achs li.got').length, all: document.querySelectorAll('#achs li').length, total: window.__game.ACH.length }));
    check('実績がリロード後も残り、タイトルの一覧で見られる', achN >= 3 && (await visible(page, 'ach')) && achList.got === achN && achList.all === achList.total, `${achBtn.trim()} / 一覧 ${achList.got}/${achList.all}`);
    await shot(page, '08_ach_390');
    await page.click('#b-ach-close');
    const again = await page.evaluate(() => { const g = window.__game; g.start(3, true); g.debug.god(true); g.debug.setTime(301); g.debug.god(false); g.debug.hurt(9999); g.hold(false); return true; });
    await page.waitForFunction(() => window.__game.scene === 'result', null, { timeout: 8000 }).catch(() => {});
    const achAgain = await page.evaluate(() => document.querySelectorAll('#res-ach span').length);
    check('一度取った実績は、もう一度「ゲット」と出ない', again && achAgain === 0, `出た数=${achAgain}`);
    await page.click('#b-home');
    await wait(200);
    const fb = await page.evaluate(() => { let u = ''; const o = window.open; window.open = x => { u = x; return null; }; document.getElementById('b-fb1').click(); window.open = o; return u; });
    check('「感想を送る」で GitHub の感想フォームが開く', fb.startsWith('https://github.com/tbtb-k/diary/issues/new?') && /title=/.test(fb));
    await ctx.close();
  }

  // ---- 1b. ボスが出たときの回復（Day 24。ほかのチェックの流れを乱さないよう別のページで） ----
  {
    const { ctx, page } = await open({ width: 390, height: 844 }, { mobile: true, tag: 'bossheal', seenHow: true });
    // ボスが出ると、HPが30回復する（満タンなら回復なし・最大HPは超えない）（Day 24）
    const bh = await page.evaluate(() => {
      const G = window.__game, out = {};
      G.start(5, true); G.debug.setTime(299.5); G.world().player.hp = 40;
      let s = G.sim(1.0, () => [0, 0]); out.low = s.hp; out.boss = s.boss !== null; out.healed = G.world().bossHeal;
      G.start(5, true); G.debug.setTime(299.5);
      s = G.sim(1.0, () => [0, 0]); out.full = s.hp; out.max = s.maxHp; out.fullHealed = G.world().bossHeal;
      return out;
    });
    check('ボスが出ると、HPが30回復する（満タンのときは最大HPを超えない）', bh.boss && bh.healed === 30 && bh.low >= 68 && bh.low <= 70 && bh.full <= bh.max && bh.fullHealed === 0,
      `HP40 → ${bh.low}（回復 ${bh.healed}）／満タン → ${bh.full}/${bh.max}（回復 ${bh.fullHealed}）`);
    // 演出のスクリーンショット（ふつうの時間の流れで）
    await page.evaluate(() => { window.__game.start(7, false); window.__game.debug.give('nova', 3); window.__game.debug.setTime(299.85); window.__game.world().player.hp = 35; });
    await wait(450);
    await shot(page, '06a_bossheal_390');
    await ctx.close();
  }

  // ---- 2. 小さいスマホ（360×640）とパソコン（1280×720）の見た目 ----
  for (const vp of [{ width: 360, height: 640, mobile: true, tag: '360' }, { width: 1280, height: 720, mobile: false, tag: '1280', dpr: 1 }]) {
    const { ctx, page } = await open({ width: vp.width, height: vp.height }, { mobile: vp.mobile, tag: vp.tag, dpr: vp.dpr, seenHow: true });
    await wait(500);
    await shot(page, `11_title_${vp.tag}`);
    await page.evaluate(() => { window.__game.start(7, false); window.__game.debug.god(true); window.__game.debug.give('orbit', 3); window.__game.debug.give('chain', 2); window.__game.debug.spawn('drifter', 40); window.__game.debug.gems(60); });
    await wait(1500);
    await shot(page, `12_play_${vp.tag}`);
    await page.evaluate(() => window.__game.debug.addXp(30));
    await wait(700);
    await shot(page, `13_levelup_${vp.tag}`);
    await page.evaluate(() => { window.__game.world().pendingLevels = 1; });
    await wait(450);
    await page.click('#choices .choice');
    await page.evaluate(() => { window.__game.debug.god(false); window.__game.debug.hurt(9999); });
    await page.waitForFunction(() => window.__game.scene === 'result', null, { timeout: 8000 }).catch(() => {});
    await wait(400);
    await shot(page, `14_result_${vp.tag}`);
    // 横はみ出しの確認
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.screen:not([hidden]) *')].filter(n => { const r = n.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(n => n.className || n.tagName).slice(0, 5));
    check(`${vp.tag}: 画面の横に文字や部品がはみ出していない`, overflow.length === 0, overflow.join(', '));
    await ctx.close();
  }

  // ---- 3. バランス（自動操作で何秒生き延びるか） ----
  {
    const { ctx, page } = await open({ width: 390, height: 844 }, { mobile: true, tag: 'sim', dpr: 1, seenHow: true });
    for (const bot of ['idle', 'smart']) {
      for (const seed of SEEDS) {
        const t0 = Date.now();
        const r = await page.evaluate(([bot, seed]) => {
          window.__game.start(seed, true);
          const s = window.__game.sim(460, window.__bots[bot], window.__bots.choose);
          return s;
        }, [bot, seed]);
        const row = { bot, seed, time: r.t, clear: r.clear, over: r.over, level: r.level, kills: r.kills, score: r.score, boss: r.boss, weapons: r.weapons, passives: r.passives, ms: Date.now() - t0 };
        report.sims.push(row);
        console.log(`   sim ${bot.padEnd(5)} seed${seed}: ${row.clear ? 'CLEAR' : row.over ? 'dead ' : 'alive'} ${String(row.time).padStart(6)}s  Lv${row.level}  kills ${row.kills}  boss ${row.boss}  (${row.ms}ms)`);
      }
    }
    const idle = report.sims.filter(s => s.bot === 'idle'), smart = report.sims.filter(s => s.bot === 'smart');
    const avg = a => a.reduce((x, s) => x + s.time, 0) / a.length;
    report.balance = { idleAvg: Math.round(avg(idle)), smartAvg: Math.round(avg(smart)), smartClears: smart.filter(s => s.clear).length };
    console.log(`   平均：何もしない ${report.balance.idleAvg}s ／ 自動操作 ${report.balance.smartAvg}s（クリア ${report.balance.smartClears}/${smart.length}）`);
    check('何もしないと3分以内に倒される（立っているだけで勝てない）', idle.every(s => !s.clear && s.time < 180), `平均 ${report.balance.idleAvg}s`);
    // ボス戦の長さ（ボスは 5:00 に出る）。design.md の目安 40〜90 秒（Day 11 で追加）
    const bossLen = smart.filter(s => s.clear).map(s => Math.round(s.time - 300));
    check('ボス戦の長さが 40〜90 秒（自動操作でクリアした回）', bossLen.every(x => x >= 40 && x <= 90), bossLen.map(x => x + 's').join(' / '));
    check('自動操作なら平均2分半以上もつ（理不尽に難しくない）', report.balance.smartAvg >= 150, `平均 ${report.balance.smartAvg}s`);

    // ---- 4. 重さ（敵が上限まで出た場面で描画） ----
    await page.evaluate(() => { window.__game.start(9, false); window.__game.debug.god(true); window.__game.debug.setTime(240); ['pulse', 'orbit', 'nova', 'chain'].forEach(w => window.__game.debug.give(w, 6)); window.__game.debug.spawn('drifter', 220); window.__game.debug.spawn('brute', 40); window.__game.debug.gems(300); });
    const perf = await page.evaluate(() => new Promise(res => {
      const ts = []; let last = performance.now();
      function f(now) { ts.push(now - last); last = now; if (ts.length < 120) requestAnimationFrame(f); else res(ts); }
      requestAnimationFrame(f);
    }));
    perf.sort((a, b) => a - b);
    report.perf = { medianFrameMs: +perf[60].toFixed(1), p95FrameMs: +perf[114].toFixed(1), enemies: (await page.evaluate(() => window.__game.state())).enemies };
    console.log(`   重さ：1フレームの中央値 ${report.perf.medianFrameMs}ms / 95% ${report.perf.p95FrameMs}ms（敵 ${report.perf.enemies}体、ヘッドレス環境なので目安）`);
    await shot(page, '21_heavy_390');
    await ctx.close();
  }

  // ---- 5. localStorage が使えない環境でも最後まで遊べる ----
  {
    const { ctx, page } = await open({ width: 390, height: 844 }, { mobile: true, tag: 'nostorage', dpr: 1, noStorage: true });
    await page.click('#b-start');
    await page.click('#b-how-ok');
    await page.evaluate(() => window.__game.debug.hurt(9999));
    await page.waitForFunction(() => window.__game.scene === 'result', null, { timeout: 8000 }).catch(() => {});
    check('保存できない環境でも結果画面まで進む', await visible(page, 'result'));
    await ctx.close();
  }

  await browser.close();
  const size = fs.statSync(FILE).size;
  report.sizeKB = Math.round(size / 1024);
  check('ファイルの大きさが 400KB 以下', size <= 400 * 1024, `${report.sizeKB}KB`);
  check('エラーが0件', errors.length === 0, errors.slice(0, 5).join(' | '));
  report.checks = checks; report.errors = errors; report.screenshots = shots.map(f => path.relative(process.cwd(), f));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const ng = checks.filter(c => !c.ok);
  console.log(`\n${ng.length ? 'NG' : 'ALL OK'}：チェック ${checks.length - ng.length}/${checks.length}　スクリーンショット ${shots.length}枚 → ${path.relative(process.cwd(), OUT)}/`);
  process.exit(ng.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
