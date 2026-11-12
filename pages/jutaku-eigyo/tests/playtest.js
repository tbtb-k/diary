#!/usr/bin/env node
/*
 * 自動テスト：3 組のお客様を「うまい人・ふつうの人・へたな人」の 3 通りで最後まで遊び、
 *   ・途中でエラーが出ないこと
 *   ・うまい人は成約、へたな人は失注になること（採点が壊れていないこと）
 * を確かめる。
 *
 *   使い方:  node playtest.js            （全部）
 *            node playtest.js s1 best    （1 つだけ）
 *
 * Playwright が必要（Claude Code のクラウド環境には最初から入っている）。
 */
const path = require('path');
const { chromium } = require('playwright');
const page = 'file://' + path.resolve(__dirname, '..', '..', 'game_jutaku-eigyo.html');
const only = process.argv.slice(2);
const cases = [];
for (const sc of ['s1', 's2', 's3']) for (const strat of ['best', 'mid', 'worst']) if (!only.length || (only[0] === sc && (!only[1] || only[1] === strat))) cases.push([sc, strat]);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const [sc, strat] of cases) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    p.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    p.on('console', m => { if (m.type() === 'error') errs.push('console.error ' + m.text().slice(0, 300)); });
    await p.goto(`${page}?auto=${strat}&sc=${sc}&fast=1&q=low&norender=1`);
    // ページ側は外部通信や eval を禁止しているので、こちらから一定間隔で状態を見に行く
    let done = false;
    for (let i = 0; i < 360 && !done; i++) { await p.waitForTimeout(500); done = await p.evaluate(() => !!(window.__result || window.__error)); }
    const r = await p.evaluate(() => ({ result: window.__result, error: window.__error, log: (window.JE && JE.ui && JE.ui.log || []).length }));
    const want = strat === 'best' ? 'contract' : strat === 'worst' ? 'lost' : null;
    const ok = done && r.result && !r.error && !errs.length && (!want || r.result.outcome === want) && (strat !== 'best' || r.result.ng === 0);
    if (!ok) failed++;
    console.log((ok ? 'OK  ' : 'NG  ') + sc + ' ' + strat.padEnd(5), r.result ? JSON.stringify(r.result) : '(結果なし)', 'セリフ数=' + r.log);
    if (r.error) console.log('    error:', r.error.slice(0, 600));
    for (const e of errs.slice(0, 5)) console.log('   ', e);
    await p.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} 件が失敗しました。` : `\nすべて成功（${cases.length} 件）。`);
  process.exit(failed ? 1 : 0);
})();
