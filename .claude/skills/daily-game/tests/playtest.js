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
    const w0 = await page.evaluate(() => Object.keys(window.__game.state().weapons).length + Object.keys(window.__game.state().passives).length);
    await page.click('#choices .choice');
    await wait(200);
    const st = await page.evaluate(() => window.__game.state());
    check('強化をえらぶとゲームに戻る', st.scene === 'play');
    check('えらんだ強化が反映される', Object.keys(st.weapons).length + Object.keys(st.passives).length > w0 || Object.values(st.weapons).reduce((a, b) => a + b, 0) > 1);
    // 一時停止
    await page.click('#b-pause');
    check('一時停止できる', await visible(page, 'pause'));
    await shot(page, '05_pause_390');
    const tP = (await page.evaluate(() => window.__game.state())).t; await wait(500);
    check('一時停止中は時間が止まる', (await page.evaluate(() => window.__game.state())).t === tP);
    await page.click('#b-resume');
    // ボス
    await page.evaluate(() => { window.__game.debug.god(true); window.__game.debug.give('nova', 3); window.__game.debug.setTime(299); });
    await page.waitForFunction(() => window.__game.state().boss !== null, null, { timeout: 5000 }).catch(() => {});
    check('5:00 でボスが出る', (await page.evaluate(() => window.__game.state())).boss !== null);
    await wait(1200);
    await shot(page, '06_boss_390');
    // ゲームオーバー → 結果 → もう1回
    await page.evaluate(() => { window.__game.debug.god(false); window.__game.debug.hurt(9999); });
    await page.waitForFunction(() => window.__game.scene === 'result', null, { timeout: 8000 }).catch(() => {});
    check('HPが0になると結果画面が出る', await visible(page, 'result'));
    await wait(400);
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
    const fb = await page.evaluate(() => { let u = ''; const o = window.open; window.open = x => { u = x; return null; }; document.getElementById('b-fb1').click(); window.open = o; return u; });
    check('「感想を送る」で GitHub の感想フォームが開く', fb.startsWith('https://github.com/tbtb-k/diary/issues/new?') && /title=/.test(fb));
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
