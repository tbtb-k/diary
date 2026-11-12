#!/usr/bin/env node
/*
 * シナリオと設定のつじつまチェック（ブラウザ不要）。
 * セリフや選択肢を書き換えたあとに実行すると、ID の書きまちがいなどをすぐ見つけられる。
 *   使い方:  node check-data.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['data-config.js', 'data-scenarios.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { CONFIG: C, SCENARIOS: S } = ctx.window.JE, errs = [], RATES = ['great', 'good', 'neutral', 'bad', 'terrible'];
const opt = new Set(C.options.map(o => o.id)), err = (sc, m) => errs.push(`[${sc.id}] ${m}`);
const line = (sc, l, where) => { if (!Array.isArray(l) || typeof l[1] !== 'string') return err(sc, `${where}: セリフの形が違う`); if (!['n', 's'].includes(l[0]) && !sc.cast.find(c => c.key === l[0])) err(sc, `${where}: 話す人「${l[0]}」が出演者にいない`); };
const choice = (sc, c, where) => {
  if (!RATES.includes(c.r)) err(sc, `${where}: 評価 r が不正（${c.r}）`);
  if (!c.t || !c.tip) err(sc, `${where}: t か tip がない`);
  if (c.ng && !C.ng[c.ng]) err(sc, `${where}: ng「${c.ng}」が data-config.js にない`);
  if (c.ng && c.r !== 'terrible') err(sc, `${where}: ng の選択肢は r を terrible に`);
  for (const i of c.reveals || []) if (!sc.needs[i]) err(sc, `${where}: reveals「${i}」が needs にない`);
  (c.reply || []).forEach(l => line(sc, l, where));
};
const step = (sc, d, where) => { (d.say || []).forEach(l => line(sc, l, where)); if (!d.prompt) err(sc, `${where}: prompt がない`); d.choices.forEach((c, i) => choice(sc, c, `${where} 選択肢${i + 1}`)); if (!d.choices.some(c => c.r === 'great')) err(sc, `${where}: great の選択肢がない`); };
for (const sc of S) {
  sc.greet.forEach((d, i) => step(sc, d, `お出迎え${i + 1}`));
  const ids = new Set();
  for (const q of sc.hearing.questions) {
    if (ids.has(q.id)) err(sc, `質問 ID の重複: ${q.id}`); ids.add(q.id);
    (q.a || []).forEach(l => line(sc, l, `質問 ${q.id}`)); for (const i of q.reveals || []) if (!sc.needs[i]) err(sc, `質問 ${q.id}: reveals「${i}」が needs にない`);
    if (q.gate && !q.fail) err(sc, `質問 ${q.id}: gate があるのに fail がない`);
    if (q.follow) q.follow.choices.forEach((c, i) => choice(sc, c, `質問 ${q.id} 深掘り${i + 1}`));
  }
  step(sc, sc.hearing.end, 'ヒアリングの締め');
  const reach = new Set(); for (const q of sc.hearing.questions) { (q.reveals || []).forEach(i => reach.add(i)); if (q.follow) q.follow.choices.forEach(c => (c.reveals || []).forEach(i => reach.add(i))); }
  for (const k in sc.needs) if (!reach.has(k)) err(sc, `ニーズ「${k}」を聞き出せる質問がない`);
  if (sc.tour.spots.length < sc.tour.pick) err(sc, 'ご案内の場所が足りない');
  for (const sp of sc.tour.spots) sp.talks.forEach((t, i) => { choice(sc, t, `ご案内 ${sp.id} ${i + 1}`); if (t.need && !sc.needs[t.need]) err(sc, `ご案内 ${sp.id}: need「${t.need}」が needs にない`); });
  for (const k in sc.plan.map) { if (!sc.needs[k]) err(sc, `plan.map「${k}」が needs にない`); for (const o of sc.plan.map[k]) if (o[0] !== '@' && !opt.has(o)) err(sc, `plan.map ${k}: オプション「${o}」がない`); if (!sc.plan.fit[k] || !sc.plan.miss[k]) err(sc, `plan.fit / plan.miss に「${k}」のセリフがない`); }
  for (const o of sc.plan.nice || []) if (!opt.has(o)) err(sc, `plan.nice: オプション「${o}」がない`);
  if (!C.basePrice[sc.plan.type]) err(sc, 'plan.type が不正'); for (const z of sc.plan.sizeOk) if (!C.basePrice[sc.plan.type].sizes.includes(z)) err(sc, `plan.sizeOk ${z} 坪は選べない広さ`);
  step(sc, sc.plan.present, '金額の伝え方'); sc.closing.forEach((d, i) => step(sc, d, `クロージング${i + 1}`));
  if (sc.closing.filter(d => d.final).length !== 1) err(sc, 'クロージングの final は 1 つだけに');
  for (const k of ['contract', 'next', 'lost']) if (!sc.epilogue[k]) err(sc, `epilogue.${k} がない`);
  const m = sc.money; if (!(m.hope < m.limit) || !(m.reserve <= m.own)) err(sc, 'money の数字のつじつまが合わない');
}
console.log(errs.length ? errs.join('\n') + `\n\n${errs.length} 件の問題があります。` : `問題なし（お客様 ${S.length} 組、オプション ${C.options.length} 件）。`);
process.exit(errs.length ? 1 : 0);
