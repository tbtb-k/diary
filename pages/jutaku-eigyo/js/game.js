/* ============================================================
 * game.js : ゲームの進行（タイトル → 5 つの場面 → 結果）と採点
 * ============================================================ */
(function () {
  'use strict';
  const T = window.THREE, JE = window.JE, U = JE.ui, C = JE.CONFIG, P = JE.people, esc = JE.esc;
  const G = JE.game = { sc: null, st: null, cast: {}, guests: [], senpai: null, hint: '', phase: '' };
  const qs = new URLSearchParams(location.search);

  // ───────── 保存（このブラウザの中だけに残る。外へは送らない） ─────────
  const KEY = 'jutaku-eigyo-v1';
  const blank = () => ({ name: '', settings: { learn: true, sound: true, quality: 'auto', textSpeed: 40 }, results: {}, seenAbout: false });
  JE.save = (() => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.settings) return Object.assign(blank(), s, { settings: Object.assign(blank().settings, s.settings) }); } catch (e) { /* 保存が使えない環境でもそのまま遊べる */ } return blank(); })();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(JE.save)); } catch (e) { /* 何もしない */ } };

  // ───────── お金とプランの計算 ─────────
  JE.calcPlan = (sc, plan) => {
    const base = JE.basePrice(plan.type, plan.size); let opt = 0; for (const o of C.options) if (plan.options.has(o.id)) opt += o.price;
    const extras = sc.money.extras || [], ex = extras.reduce((s, e) => s + e.price, 0), site = C.siteWork;
    const fees = Math.round((base + opt + site + ex) * C.feesRate), total = base + opt + site + ex + fees, loan = Math.max(0, total - plan.down);
    const rate = C.rates.find(r => r.id === plan.rate).rate, monthly = JE.monthly(loan, rate, plan.term), monthlyAll = monthly + (sc.money.other || 0);
    return { base, opt, site, extras, fees, total, loan, monthly, monthlyAll, ratio: monthlyAll * 12 / sc.money.income * 100 };
  };
  // そのニーズが、いまのプランで満たされているか（'@hiraya' のような指定は建物のかたち）
  JE.needMet = (sc, plan, id) => (sc.plan.map[id] || []).some(k => k[0] === '@' ? plan.type === k.slice(1) : plan.options.has(k));
  function evalPlan(sc, plan) {
    const c = JE.calcPlan(sc, plan), map = sc.plan.map, m = sc.money; let wAll = 0, wGot = 0; const met = [], missed = [];
    for (const k in map) { const w = sc.needs[k].w; wAll += w; if (JE.needMet(sc, plan, k)) { wGot += w; met.push(k); } else missed.push(k); }
    const byW = (a, b) => sc.needs[b].w - sc.needs[a].w; met.sort(byW); missed.sort(byW);
    const needed = new Set([].concat(...Object.values(map)).filter(k => k[0] !== '@')), nice = new Set(sc.plan.nice || []);
    const extra = C.options.filter(o => plan.options.has(o.id) && !needed.has(o.id) && !nice.has(o.id));
    const typeOk = plan.type === sc.plan.type, lo = Math.min(...sc.plan.sizeOk), hi = Math.max(...sc.plan.sizeOk), sizeOk = plan.size >= lo && plan.size <= hi;
    const fit = JE.clamp(wGot / wAll - (typeOk ? 0 : 0.25) - (sizeOk ? 0 : 0.1) - 0.07 * extra.length, 0, 1);
    const mo = c.monthlyAll, budget = mo <= m.hope + 0.001 ? 1 : mo <= m.limit ? 1 - 0.6 * (mo - m.hope) / (m.limit - m.hope) : mo <= m.limit * 1.12 ? 0.25 : 0;
    return { c, fit, met, missed, extra, typeOk, sizeOk, budget, reserveOk: m.own - plan.down >= m.reserve - 0.001, over: mo > m.hope + 0.001, wayOver: mo > m.limit + 0.001 };
  }
  JE.evalPlan = evalPlan;

  // ───────── 評価ごとの効果 ─────────
  const RATE = { great: { trust: 8, pts: 3 }, good: { trust: 4, pts: 2 }, neutral: { trust: 0, pts: 1 }, bad: { trust: -6, pts: 0 }, terrible: { trust: -11, pts: 0 } };
  const RANK = { great: 4, good: 3, neutral: 2, bad: 1, terrible: 0 };
  const YOU = { label: 'あなた', cls: 'you' };
  const tick = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const baseMood = (t) => t >= 72 ? 'happy' : t >= 50 ? 'soft' : t >= 32 ? 'neutral' : 'worried';

  function newState(sc) {
    const score = {}; for (const a of C.axes) score[a.id] = { g: 0, m: 0 };
    return { trust: sc.trust, score, known: new Set(), ng: [], log: [], hints: 0, flags: {}, turns: sc.hearingTurns, asked: new Set(), plan: null, ev: null, finalR: null, tech: { g: 0, m: 0 } };
  }
  const addScore = (axis, g, m) => { const s = G.st.score[axis]; s.g += g; s.m += m; };
  function addTrust(d) { const st = G.st; if (!d) return; st.trust = JE.clamp(st.trust + d, 0, 100); U.setTrust(st.trust, d, G.sc.showTrust); }
  function reveal(ids) { const st = G.st, fresh = (ids || []).filter(i => G.sc.needs[i] && !st.known.has(i)); if (!fresh.length) return; fresh.forEach(i => st.known.add(i)); U.karte.add(fresh); JE.audio.sfx('reveal'); U.toast('<b>カルテに追加</b>' + fresh.map(i => esc(G.sc.needs[i].label)).join('　／　'), 4200); }
  function settle() { const t = G.st.trust, run = JE.run; JE.wait(2.4).then(() => { if (run === JE.run) for (const a of G.guests) a.setMood(baseMood(t)); }).catch(() => {}); }
  function react(r, key) { G.guests.forEach(a => { const main = !key || G.cast[key] === a; P.react(a, main ? r : r === 'great' ? 'good' : r === 'terrible' ? 'bad' : r); }); }
  const firstSpeaker = (lines) => { for (const l of lines || []) if (G.cast[l[0]]) return l[0]; return null; };

  // ───────── カメラ：話している人へ少し寄る ─────────
  let baseShot = null;
  const setBase = (def, dur) => { baseShot = { pos: def.pos.slice(), look: def.look.slice(), fov: def.fov }; return dur === 0 ? JE.cam.set(baseShot) : JE.cam.shot(baseShot, dur == null ? 1.6 : dur); };
  function focus(av) {
    if (!baseShot || JE.fast) return; const h = av.headPos(new T.Vector3()), b = baseShot, k = 0.55;
    JE.cam.shot({ pos: [b.pos[0] + (h.x - b.look[0]) * 0.18, b.pos[1], b.pos[2] + (h.z - b.look[2]) * 0.1], look: [b.look[0] + (h.x - b.look[0]) * k, b.look[1] + (h.y - b.look[1]) * k, b.look[2] + (h.z - b.look[2]) * k], fov: b.fov * 0.9 }, 1.1).catch(() => {});
  }
  const unfocus = () => { if (baseShot && !JE.fast) JE.cam.shot(baseShot, 1.2).catch(() => {}); };

  // ───────── 会話 ─────────
  const TALK = { happy: 'talk_relaxed', delighted: 'talk_excited', worried: 'talk_nervous', annoyed: 'talk', thinking: 'think', sad: 'talk_nervous' };
  async function talk(lines) {
    for (const ln of lines || []) {
      const who = ln[0], text = ln[1], mood = ln[2], len = text.length / (JE.save.settings.textSpeed || 40) + 0.4;
      if (who === 'n') { unfocus(); await U.say({ label: '', cls: 'narr' }, text); continue; }
      if (who === 's') { const s = G.senpai, on = s && s.root.visible; if (on) { s.speak(len); if (Math.random() < 0.6) s.gesture(Math.random() < 0.5 ? 'talk' : 'present_r', { max: 3.6 }); } else unfocus();
        await U.say({ label: C.senpai.label, cls: 'senpai', onSkip: () => s && s.stopSpeak() }, text); if (s) s.stopSpeak(); continue; }
      const av = G.cast[who], m = G.sc.cast.find(c => c.key === who);
      if (av) { if (mood) av.setMood(mood); av.speak(len); av.lookAt('camera'); for (const o of G.guests) if (o !== av) o.lookAt(Math.random() < 0.55 ? av : 'camera'); focus(av);
        if (!av.seated && Math.random() < 0.7) av.gesture(TALK[mood] || 'talk', { max: 3.4 }); else if (av.seated && mood === 'thinking') av.gesture('sit_think', { max: 4 }); }
      await U.say({ label: m ? m.label : '', onSkip: () => av && av.stopSpeak() }, text);
      if (av) { av.stopSpeak(); for (const o of G.guests) o.lookAt('camera'); }
    }
  }

  // ───────── 選択の場面 ─────────
  async function applyChoice(ch, axis, o) {
    o = o || {}; const st = G.st, R = RATE[ch.r];
    unfocus(); await U.say(YOU, ch.t);
    addTrust(ch.trust != null ? ch.trust : R.trust);
    if (!o.noScore) addScore(axis, R.pts, 3);
    if (axis === 'hearing') { st.tech.g += R.pts; st.tech.m += 3; }
    if (ch.set) Object.assign(st.flags, ch.set);
    if (ch.turns) st.turns = Math.max(2, st.turns + ch.turns);
    if (ch.ng) st.ng.push({ id: ch.ng, t: ch.t });
    react(ch.r, firstSpeaker(ch.reply));
    await talk(ch.reply);
    if (ch.reveals) reveal(ch.reveals);
    st.log.push({ phase: G.phase, r: ch.r, t: ch.t, tip: ch.tip, ng: ch.ng, axis });
    if (ch.tip && (JE.save.settings.learn || ch.ng)) await U.tip(ch.r, ch.tip, ch.ng ? C.ng[ch.ng] : null);
    settle();
  }
  async function step(def, axis, o) {
    await talk(def.say); G.hint = def.hint || '';
    const order = shuffle(def.choices.map((_, i) => i)), pick = await U.choose(def.prompt, order.map(i => def.choices[i]));
    const ch = def.choices[order[pick]]; await applyChoice(ch, axis, o); return ch;
  }

  // ───────── 人物の準備 ─────────
  const inScene = (a, scene) => { if (a.root.parent !== scene) scene.add(a.root); a.root.visible = true; };
  const hideAll = () => { for (const a of P.all.values()) a.root.visible = false; };
  async function loadCast(sc) {
    const keys = ['anims', 'avatar:' + C.senpai.avatar, ...sc.cast.map(c => 'avatar:' + c.avatar)];
    U.loading(0.05, sc.sub + 'をお迎えする準備をしています…');
    await JE.assets.need(keys, (p) => U.loading(0.05 + p * 0.8, sc.sub + 'をお迎えする準備をしています…'));
    G.cast = {}; G.guests = [];
    for (const c of sc.cast) { const a = await P.create(c.avatar); G.cast[c.key] = a; G.guests.push(a); await tick(); }
    G.senpai = await P.create(C.senpai.avatar);
    U.loading(1, '準備ができました'); await tick();
    // 成約演出で登場する職人さんは、裏で読み込んでおく
    JE.assets.need(['avatar:worker_a', 'avatar:worker_b']).catch(() => {});
    hideAll(); U.loadingDone();
  }
  function seatGuests() {
    const seats = JE.house.seats.north, n = G.guests.length, idx = n === 3 ? [0, 1, 2] : n === 2 ? [0, 1] : [1];
    G.guests.forEach((a, i) => { inScene(a, JE.house.scene); a.sitAt(seats[idx[i]][0], seats[idx[i]][1], 0); a.lookAt('camera'); a.setMood(baseMood(G.st.trust)); });
    const cx = idx.reduce((s, i) => s + seats[i][0], 0) / idx.length;
    return { pos: [cx, 1.2, 2.5], look: [cx, 1.08, 0.85], fov: n === 3 ? 42 : 38 };
  }
  function standGuests(spot, anim) { G.guests.forEach((a, i) => { const g = spot.guests[i]; inScene(a, JE.house.scene); a.place(g[0], g[1], g[2], g[3]); a.setBase(anim || 'idle', 0); a.lookAt('camera'); a.setMood(baseMood(G.st.trust)); }); }
  const useHouse = (tod) => { JE.scene = JE.house.scene; if (tod) JE.house.setTime(tod); };

  // ═════════ 場面 0：ブリーフィング ═════════
  async function phaseBrief(sc) {
    G.phase = 'ブリーフィング'; U.hud(false); useHouse('morning'); hideAll();
    const s = G.senpai; inScene(s, JE.house.scene); s.place(0.6, 0, -0.15, 0); s.setBase('idle', 0); s.lookAt('camera'); s.setMood('soft');
    setBase({ pos: [0.6, 1.3, 2.15], look: [0.6, 1.43, -0.15], fov: 38 }, 0);
    JE.audio.music(true); await U.fade(false, 0.8);
    const html = '<div class="eyebrow">' + esc(sc.level) + '　' + esc(sc.title) + '</div><h2>' + esc(sc.sub) + '</h2><p style="color:var(--sub)">' + esc(sc.theme) + '</p>' +
      '<div class="survey"><div class="card"><h4>来場アンケート</h4><ul>' + sc.survey.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><div class="people">' + sc.cast.map(c => '<span>' + esc(c.label) + '（' + c.age + '）' + '</span>').join('') + '</div></div>' +
      '<div class="card"><h4>今日の学習ポイント</h4><ul>' + sc.goals.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div></div>';
    await U.ask(html, [{ id: 'go', label: '先輩の話を聞く' }]);
    await talk(sc.brief);
    await U.fade(true, 0.6); s.root.visible = false;
  }

  // ═════════ 場面 1：お出迎え ═════════
  async function phaseGreet(sc) {
    const st = G.st, H = JE.house, spot = H.spots.entrance; G.phase = 'お出迎え';
    U.hud(true); U.setPhase(0); U.setGuest(sc, sc.showTrust); U.setTrust(st.trust, 0, false); U.karte.bind(sc, st);
    useHouse('morning');
    G.guests.forEach((a, i) => { inScene(a, H.scene); a.place(7.5 + i * 0.75, -0.18, -1.36 + (i % 2 ? 0.14 : -0.12), -Math.PI / 2); a.setBase('idle', 0); a.lookAt('camera'); a.setMood('neutral'); });
    setBase(spot.cam, 0);
    await U.fade(false, 0.8);
    await Promise.all(G.guests.map((a, i) => JE.wait(i * 0.85).then(() => a.walkPath([[6.5, -1.36], [spot.guests[i][0], spot.guests[i][2]]], { ry: spot.guests[i][3], then: 'idle' }))));
    G.guests.forEach(a => a.setMood(baseMood(st.trust)));
    for (const def of sc.greet) await step(def, 'rapport');
    await U.fade(true, 0.6);
  }

  // ═════════ 場面 2：ヒアリング ═════════
  // 質問の一覧から 1 つ選んでもらう
  function pickQuestion(sc, list) {
    const st = G.st;
    if (JE.auto) return Promise.resolve(JE.auto.question(sc, st, list));
    return new Promise((res, rej) => {
      const run = JE.run, cats = []; for (const q of sc.hearing.questions) if (!cats.includes(q.cat)) cats.push(q.cat);
      let h = '<header><h2>質問をえらぶ <span>あと ' + st.turns + ' 回</span></h2><p>全部は聞けません。何を、どの順番で聞きますか？</p></header><div class="body">';
      for (const c of cats) { h += '<div class="cat">' + esc(c) + '</div>'; for (const q of sc.hearing.questions) if (q.cat === c) h += '<button type="button" class="q' + (list.includes(q) ? '' : ' done') + '" data-q="' + q.id + '">' + esc(q.t) + (q.gate >= 40 ? '<small>ふみこんだ質問</small>' : '') + '</button>'; }
      const p = U.panel(h + '</div>');
      p.querySelectorAll('.q').forEach(b => b.addEventListener('click', () => { if (run !== JE.run) return rej(new JE.Abort()); U.panelOff(); JE.audio.sfx('select'); res(sc.hearing.questions.find(q => q.id === b.dataset.q)); }));
    });
  }
  // いちばんうまく聞けた場合に分かる量（採点の基準にする）
  function bestCoverage(sc) {
    const w = (ids) => (ids || []).reduce((s, i) => s + (sc.needs[i] ? sc.needs[i].w : 0), 0), seen = new Set(), vals = [];
    for (const q of sc.hearing.questions) { const ids = (q.reveals || []).concat(...((q.follow && q.follow.choices) || []).map(c => c.reveals || [])).filter(i => !seen.has(i)); vals.push({ q, ids, v: w(ids) }); }
    vals.sort((a, b) => b.v - a.v); let total = 0, n = 0; const got = new Set();
    for (const x of vals) { if (n >= sc.hearingTurns) break; const fresh = x.ids.filter(i => !got.has(i)); if (!fresh.length) continue; fresh.forEach(i => got.add(i)); total += w(fresh); n++; }
    return total;
  }
  async function phaseHearing(sc) {
    const st = G.st, H = JE.house; G.phase = 'ヒアリング'; U.setPhase(1);
    useHouse('noon'); setBase(seatGuests(), 0); G.hint = '「いまの住まい → 暮らし → 時期・土地 → お金」の順が基本。お金と決め方は、場があたたまってから。';
    await U.fade(false, 0.8);
    await talk(sc.hearing.intro);
    while (st.turns > 0) {
      const open = sc.hearing.questions.filter(q => !st.asked.has(q.id) && !((q.reveals || []).length && q.reveals.every(i => st.known.has(i))));
      if (!open.length) break;
      const q = await pickQuestion(sc, open); st.asked.add(q.id); st.turns--;
      await U.say(YOU, '「' + q.t + '」');
      if (q.gate && st.trust < q.gate) {            // まだ信頼が足りず、はぐらかされる
        const f = q.fail; addTrust(f.trust != null ? f.trust : -6); st.tech.m += 3; react('bad', firstSpeaker(f.a)); await talk(f.a);
        st.log.push({ phase: G.phase, r: 'bad', t: q.t, tip: f.tip, axis: 'hearing' });
        if (JE.save.settings.learn) await U.tip('bad', f.tip); settle(); continue;
      }
      addTrust(2); react('neutral', firstSpeaker(q.a)); await talk(q.a); reveal(q.reveals);
      if (q.follow) { G.hint = '相手の言葉を受け止めてから、もう一歩だけ聞いてみよう。'; const order = shuffle(q.follow.choices.map((_, i) => i)), k = await U.choose(q.follow.prompt, order.map(i => q.follow.choices[i])); await applyChoice(q.follow.choices[order[k]], 'hearing', { noScore: true }); }
      else { st.tech.g += 2; st.tech.m += 2; }
      G.hint = '「いまの住まい → 暮らし → 時期・土地 → お金」の順が基本。お金と決め方は、場があたたまってから。';
    }
    await step(sc.hearing.end, 'hearing', { noScore: true });
    // 採点：どれだけ大事なことを聞けたか（6 割）＋聞き方（4 割）
    const got = [...st.known].reduce((s, i) => s + sc.needs[i].w, 0), cov = Math.min(1, got / bestCoverage(sc)), tech = st.tech.m ? st.tech.g / st.tech.m : 0;
    st.cov = cov; st.score.hearing = { g: Math.round((0.6 * cov + 0.4 * tech) * 100), m: 100 };
    await U.fade(true, 0.6);
  }

  // ═════════ 場面 3：モデルハウスのご案内 ═════════
  function pickSpot(sc, left, done) {
    if (JE.auto) return Promise.resolve(JE.auto.spot(sc, G.st, sc.tour.spots.filter(s => !done.has(s.id))));
    return new Promise((res, rej) => {
      const run = JE.run;
      let h = '<header><h2>ご案内する場所 <span>あと ' + left + ' か所</span></h2><p>カルテを思い出して、このお客様に見てほしい場所を選びましょう。</p></header><div class="body">';
      sc.tour.spots.forEach((s, i) => { h += '<button type="button" class="q spot' + (done.has(s.id) ? ' done' : '') + '" data-s="' + s.id + '"><em>' + (i + 1) + '</em><strong>' + esc(s.name) + '</strong></button>'; });
      const p = U.panel(h + '</div>');
      p.querySelectorAll('.q').forEach(b => b.addEventListener('click', () => { if (run !== JE.run) return rej(new JE.Abort()); U.panelOff(); JE.audio.sfx('select'); res(sc.tour.spots.find(s => s.id === b.dataset.s)); }));
    });
  }
  async function phaseTour(sc) {
    const st = G.st, H = JE.house; G.phase = 'ご案内'; U.setPhase(2);
    useHouse('afternoon'); standGuests(H.spots.living, 'look_around'); G.guests.forEach(a => a.lookAt(new T.Vector3(-4, 3, 3.8)));
    setBase({ pos: [2.2, 1.65, 3.0], look: [-2.6, 1.35, 0.2], fov: 56 }, 0);
    G.hint = '設備の名前や数字より、「このご家族の暮らしがどう変わるか」。カルテに答えがある。';
    await U.fade(false, 0.8); await talk(sc.tour.intro);
    const done = new Set();
    for (let i = 0; i < sc.tour.pick; i++) {
      const s = await pickSpot(sc, sc.tour.pick - i, done); done.add(s.id);
      await U.fade(true, 0.35);
      const spot = H.spots[s.id]; standGuests(spot, 'idle'); const gz = new T.Vector3(spot.gaze[0], spot.gaze[1], spot.gaze[2]); G.guests.forEach((a, k) => { a.lookAt(gz); if (k === 0) a.gesture('look_around', { max: 3.5 }); });
      setBase(spot.cam, 0); await U.fade(false, 0.45);
      await U.say({ label: '', cls: 'narr' }, s.name + 'へご案内した。');
      const order = shuffle(s.talks.map((_, k) => k)), pick = await U.choose('ここでは、何を伝える？', order.map(k => s.talks[k]));
      G.guests.forEach(a => a.lookAt('camera'));
      await applyChoice(s.talks[order[pick]], 'proposal');
    }
    await U.fade(true, 0.6);
  }

  // ═════════ 場面 4：プランと資金計画のご提案 ═════════
  async function phasePlan(sc) {
    const st = G.st, bp = C.basePrice; G.phase = 'ご提案'; U.setPhase(3); hideAll();
    await U.caption(sc.plan.when, 'プランと資金計画のご提案');
    const plan = { type: 'two', size: 32, style: 'modern', options: new Set(), down: 0, rate: 'variable', term: sc.money.terms[0] };
    JE.scene = JE.lot.scene; JE.lot.showFinished(plan, 'afternoon'); baseShot = null;
    JE.cam.startOrbit({ center: new T.Vector3(-1, 2.6, 0.5), radius: innerWidth < 820 ? 32 : 26, height: 8.5, angle: 0.55, speed: 0.045, fov: 36 });
    G.hint = 'カルテのご要望に ✓ が付くように。ただし、頼まれていない物まで足すと「売りつけ」になる。月々の返済も忘れずに。';
    await U.fade(false, 0.8); await talk(sc.plan.intro);
    await U.studio(sc, st, plan);
    st.plan = plan; const ev = st.ev = evalPlan(sc, plan), c = ev.c;
    // テーブルに戻って、お客様に見ていただく
    await U.fade(true, 0.6); JE.cam.orbit = null; useHouse('afternoon'); setBase(seatGuests(), 0); await U.fade(false, 0.7);
    await U.say(YOU, '「こちらが、今回のご提案です」');
    const lines = [];
    if (!ev.typeOk && !sc.plan.map.stairs) lines.push([['h', '平屋ですか……。うちの敷地と予算で、建てられるんでしょうか。', 'worried'], 'bad']);
    ev.met.slice(0, 3).forEach(k => { if (sc.plan.fit[k]) lines.push([sc.plan.fit[k], 'great']); });
    ev.missed.slice(0, 2).forEach(k => { if (sc.plan.miss[k]) lines.push([sc.plan.miss[k], 'bad']); });
    if (ev.extra.length) lines.push([sc.plan.extra, 'bad']);
    if (!ev.sizeOk) lines.push([['h', plan.size > Math.max(...sc.plan.sizeOk) ? 'こんなに広い家が、うちに必要でしょうか……。' : 'この広さで、足りるでしょうか……。', 'worried'], 'bad']);
    const mo = c.monthlyAll.toFixed(1);
    lines.push(ev.wayOver ? [['h', '月々 ' + mo + ' 万円……。これは、とても無理です。', 'annoyed'], 'terrible'] : ev.over ? [['h', '月々 ' + mo + ' 万円ですか。希望より、少し高いですね……。', 'worried'], 'bad'] : [['h', '月々 ' + mo + ' 万円。これなら、やっていけそうです。', 'happy'], 'good']);
    if (!ev.reserveOk) lines.push([['h', '貯金をほとんど入れる計画なんですね……。手元にも残しておきたいのですが。', 'worried'], 'bad']);
    for (const [ln, r] of lines) { react(r, ln[0]); await talk([ln]); }
    addTrust(Math.round((ev.fit - 0.5) * 26 + (ev.budget - 0.5) * 16 - (ev.reserveOk ? 0 : 6)));
    addScore('proposal', Math.round(ev.fit * 9), 9); addScore('finance', Math.round(ev.budget * 5) + (ev.reserveOk ? 1 : 0), 6);
    // 先輩のまとめ
    const unknownMiss = ev.missed.filter(k => !st.known.has(k)), knownMiss = ev.missed.filter(k => st.known.has(k)), r = ev.fit >= 0.85 && !ev.over ? 'great' : ev.fit >= 0.6 ? 'good' : ev.fit >= 0.4 ? 'neutral' : 'bad';
    let tip = '提案に入れられたご要望は ' + (ev.met.length + ev.missed.length) + ' 件中 ' + ev.met.length + ' 件。';
    if (unknownMiss.length) tip += 'ヒアリングで聞けていなかった「' + sc.needs[unknownMiss[0]].label + '」は、提案にも入らなかった。聞けたことだけが武器になる。';
    else if (knownMiss.length) tip += 'カルテにあった「' + sc.needs[knownMiss[0]].label + '」が抜けていた。提案の前にカルテを見直そう。';
    else tip += '聞いたことが、きちんと提案に生きている。';
    if (ev.extra.length) tip += '頼まれていない「' + ev.extra[0].name + '」などは、予算を圧迫し「売りつけ」に見える。';
    if (ev.wayOver) tip += '月々の返済がご希望を大きく超えた。どんなに良い家でも、払えなければ提案にならない。'; else if (ev.over) tip += '月々の返済がご希望を少し超えた。優先順位の低い物から見直そう。';
    if (!ev.reserveOk) tip += '手元に残したいお金まで頭金に入れてしまった。';
    st.log.push({ phase: G.phase, r, t: 'プランと資金計画のご提案', tip, axis: 'proposal' });
    if (JE.save.settings.learn) await U.tip(r, tip); settle();
    G.phase = '金額の伝え方'; await step(sc.plan.present, 'finance');
  }

  // ═════════ 場面 5：クロージング ═════════
  async function phaseClosing(sc) {
    const st = G.st; G.phase = 'クロージング'; U.setPhase(4);
    JE.house.goTime('sunset', 3).catch(() => {});
    for (const def of sc.closing) { if (def.when === 'over' && !st.ev.over) continue; const ch = await step(def, 'closing'); if (def.final) st.finalR = ch.r; }
    await U.fade(true, 0.7);
  }

  // ═════════ 結果 ═════════
  function judge(sc, st) {
    const pct = (s) => s.m ? Math.round(s.g / s.m * 100) : 0, axes = {}; for (const a of C.axes) axes[a.id] = pct(st.score[a.id]);
    const avg = C.axes.reduce((s, a) => s + axes[a.id], 0) / C.axes.length, total = Math.max(0, Math.round(avg - 5 * st.ng.length));
    const rank = total >= 88 ? 'S' : total >= 75 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D';
    const S = 0.5 * st.trust + 0.2 * axes.proposal + 0.15 * axes.finance + 0.15 * axes.closing - 6 * st.ng.length;
    const outcome = S >= 68 && st.ng.length <= 1 && RANK[st.finalR] >= 3 ? 'contract' : S >= 48 ? 'next' : 'lost';
    return { axes, total, rank, outcome, S: Math.round(S) };
  }
  const OUT = { contract: 'ご成約', next: '継続検討（次回のお約束なし）', lost: '失注' };
  function feedback(st) {
    const seen = new Set(), uniq = (l) => l.filter(x => x.tip && !seen.has(x.tip) && seen.add(x.tip));
    const goods = uniq(st.log.filter(x => x.r === 'great')).slice(0, 4);
    const bads = uniq(st.log.filter(x => !x.ng && RANK[x.r] <= 2).sort((a, b) => RANK[a.r] - RANK[b.r])).slice(0, 4);
    return { goods, bads };
  }
  function senpaiSays(sc, res, st) {
    const weak = C.axes.slice().sort((a, b) => res.axes[a.id] - res.axes[b.id])[0];
    let s = res.rank === 'S' ? '文句なしだ。お客様の話を最後まで聞き、聞いたことで提案し、誠実に数字を出した。これができる営業は、紹介で仕事が回るようになる。'
      : res.rank === 'A' ? 'よくやった。大事なところは押さえられている。あと一歩は「' + weak.name + '」。' + weak.desc + '、ここを磨こう。'
      : res.rank === 'B' ? '悪くない。ただ、「' + weak.name + '」で取りこぼした。' + weak.desc + '。もう一度やってみると、見える景色が変わるはずだ。'
      : '落ち込むな。最初はみんなここからだ。まずは「' + weak.name + '」――' + weak.desc + '――から意識してみよう。';
    if (st.ng.length) s += '　それと、コンプライアンスに関わる発言が ' + st.ng.length + ' 件あった。これは成績より大事なことだ。下の解説を必ず読んでくれ。';
    if (res.outcome === 'contract') s += '　' + sc.family + '様の家が建った日のことを、忘れるなよ。';
    return s;
  }
  function radar(axes) {
    const n = C.axes.length, R = 86, cx = 120, cy = 112, pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    let g = ''; for (const k of [0.25, 0.5, 0.75, 1]) g += '<polygon points="' + C.axes.map((_, i) => pt(i, R * k).map(v => v.toFixed(1)).join(',')).join(' ') + '" fill="none" stroke="rgba(37,33,28,.14)"/>';
    C.axes.forEach((a, i) => { const p = pt(i, R), l = pt(i, R + 17); g += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="rgba(37,33,28,.14)"/><text x="' + l[0].toFixed(1) + '" y="' + (l[1] + 4).toFixed(1) + '" font-size="11" text-anchor="middle" fill="#6c655b">' + a.name + '</text>'; });
    const poly = C.axes.map((a, i) => pt(i, R * Math.max(0.04, axes[a.id] / 100)).map(v => v.toFixed(1)).join(',')).join(' ');
    return '<svg viewBox="0 0 240 216" width="100%" role="img" aria-label="5 項目の評価"><g>' + g + '</g><polygon points="' + poly + '" fill="rgba(47,93,80,.28)" stroke="#2f5d50" stroke-width="2"/></svg>';
  }
  function resultHTML(sc, st, res) {
    const fb = feedback(st), c = st.ev.c, opts = C.options.filter(o => st.plan.options.has(o.id)).map(o => o.name.replace(/（.*?）/g, ''));
    let h = '<div class="result-top"><div class="rank" style="--deg:' + (res.total * 3.6) + 'deg"><b>' + res.rank + '</b><small>' + res.total + ' 点</small></div><div><div class="eyebrow">' + esc(sc.level) + '　' + esc(sc.sub) + '</div><div class="outcome ' + res.outcome + '">' + OUT[res.outcome] + '</div><p style="color:var(--sub);font-size:13px">' + esc(sc.epilogue[res.outcome].split('\n')[0]) + '</p></div></div>';
    h += '<div class="senpai-says"><b>' + esc(C.senpai.label) + 'より</b>' + esc(senpaiSays(sc, res, st)) + '</div>';
    h += '<div class="cols"><div><h3>5 つの力</h3>' + radar(res.axes) + C.axes.map(a => '<div class="axis"><div class="t">' + a.name + '<span>' + res.axes[a.id] + '</span></div><div class="b"><i data-w="' + res.axes[a.id] + '"></i></div><small>' + a.desc + '</small></div>').join('') + '</div><div>';
    if (st.ng.length) { h += '<h3 style="color:var(--ng)">コンプライアンス（必ず読んでください）</h3>'; const seen = new Set(); for (const n of st.ng) { h += '<div class="fb ng"><small>あなたの発言</small>' + esc(n.t) + (seen.has(n.id) ? '' : '<small style="margin-top:6px;color:#5a1820"><b>' + esc(C.ng[n.id].name) + '</b>：' + esc(C.ng[n.id].text) + '</small>'); seen.add(n.id); h += '</div>'; } h += '<p style="font-size:11.5px;color:var(--sub)">' + esc(C.ngNote) + '</p>'; }
    h += '<h3>よかったところ</h3>' + (fb.goods.length ? fb.goods.map(x => '<div class="fb g"><small>' + esc(x.phase) + '</small>' + esc(x.tip) + '</div>').join('') : '<p style="color:var(--sub);font-size:13px">次は「ナイス！」をもらえる選択を探してみよう。</p>');
    h += '<h3>次に生かすところ</h3>' + (fb.bads.length ? fb.bads.map(x => '<div class="fb b"><small>' + esc(x.phase) + '</small>' + esc(x.tip) + '</div>').join('') : '<p style="color:var(--sub);font-size:13px">大きな取りこぼしはありませんでした。</p>');
    h += '<h3>あなたの提案</h3><div class="fb"><small>' + C.basePrice[st.plan.type].name + '・' + st.plan.size + '坪・' + JE.lot.STYLES[st.plan.style].name + '</small>総額 ' + JE.yen(c.total) + '／月々 ' + c.monthlyAll.toFixed(1) + ' 万円（ご希望 ' + sc.money.hope + ' 万円）<small>' + (opts.length ? esc(opts.join('、')) : 'オプションなし') + '</small><small>カルテに書けたこと：' + st.known.size + ' / ' + Object.keys(sc.needs).length + ' 件　ヒント：' + st.hints + ' 回</small></div>';
    return h + '</div></div>';
  }
  function saveResult(sc, st, res) {
    const fb = feedback(st), rec = { total: res.total, rank: res.rank, outcome: res.outcome, axes: res.axes, ng: st.ng.map(n => ({ id: n.id, t: n.t })), hints: st.hints, known: st.known.size, needs: Object.keys(sc.needs).length, date: new Date().toISOString().slice(0, 10), goods: fb.goods.map(x => x.tip), bads: fb.bads.map(x => x.tip), plays: 1 };
    const old = JE.save.results[sc.id]; rec.plays = (old ? old.plays || 1 : 0) + 1; rec.best = Math.max(res.total, old ? old.best || old.total : 0); rec.bestRank = !old || res.total >= (old.best || old.total) ? res.rank : old.bestRank || old.rank;
    JE.save.results[sc.id] = rec; persist();
  }

  // 成約したときの演出：家が建ち、ご家族へ引き渡す
  const STAGE = { ground: ['着工', '更地に、建物の位置を示す縄が張られる'], foundation: ['基礎工事', ''], frame: ['上棟', '柱が立ち、梁がかかる'], roof: ['屋根工事', ''], walls: ['外壁工事', ''], finish: ['仕上げ・外構', ''], done: ['完成', ''] };
  async function ending(sc) {
    const st = G.st, Lt = JE.lot; hideAll(); JE.scene = Lt.scene; baseShot = null;
    await JE.assets.need(['avatar:worker_a', 'avatar:worker_b']).catch(() => {});
    const workers = []; for (const id of ['worker_a', 'worker_b']) if (JE.assets.buffers['avatar:' + id]) workers.push(await P.create(id));
    Lt.setTime('morning'); await U.fade(false, 0.9);
    const h = await Lt.timelapse({ type: st.plan.type, size: st.plan.size, style: st.plan.style, options: st.plan.options }, { workers, onStage: (s) => { const t = STAGE[s]; if (!JE.fast) U.captionOn(t[0], t[1]); if (s === 'frame') JE.audio.sfx('build'); if (s === 'done') JE.audio.sfx('success'); } });
    await JE.wait(1.6); U.captionOff();
    // お引き渡し：家の前にご家族が並ぶ
    await U.fade(true, 0.6);
    const d = h.door, n = G.guests.length;
    G.guests.forEach((a, i) => { inScene(a, Lt.scene); a.place(d.x - 0.5 + (i - (n - 1) / 2) * 0.82, 0, d.z + 2.6 + (i % 2) * 0.25, 0); a.setBase('idle', 0); a.lookAt('camera'); a.setMood('delighted'); });
    const s = G.senpai; inScene(s, Lt.scene); s.place(d.x + 2.1, 0, d.z + 3.0, -0.5); s.setBase('idle', 0); s.lookAt(G.guests[0]); s.setMood('happy');
    JE.cam.orbit = null; setBase({ pos: [d.x + 0.9, 1.55, d.z + 8.2], look: [d.x - 0.3, 1.5, d.z + 2.4], fov: 40 }, 0);
    await U.fade(false, 0.8); JE.audio.sfx('success');
    G.guests.forEach((a, i) => JE.wait(0.3 + i * 0.4).then(() => a.gesture(i === n - 1 && n === 3 ? 'cheer' : 'wave', { max: 4 })).catch(() => {}));
    await U.caption('お引き渡し', sc.family + '様、おめでとうございます', 2.6);
    await talk(sc.thanks);
    G.guests.forEach(a => a.gesture('clap', { max: 4 }));
    await JE.wait(1.2);
  }
  async function phaseResult(sc) {
    const st = G.st, res = judge(sc, st); G.phase = '結果'; U.hud(false); U.hideDialog(); hideAll();
    saveResult(sc, st, res);
    await U.caption(sc.epilogue[res.outcome], '', res.outcome === 'contract' ? 3.6 : 3.0);
    if (res.outcome === 'contract') await ending(sc);
    else { useHouse('sunset'); const s = G.senpai; inScene(s, JE.house.scene); s.place(0.6, 0, -0.15, 0); s.setBase('idle', 0); s.lookAt('camera'); s.setMood('soft'); setBase({ pos: [0.6, 1.3, 2.15], look: [0.6, 1.43, -0.15], fov: 38 }, 0); await U.fade(false, 0.8); }
    window.__result = { id: sc.id, total: res.total, rank: res.rank, outcome: res.outcome, axes: res.axes, ng: st.ng.length, trust: Math.round(st.trust), S: res.S, known: st.known.size, monthly: +st.ev.c.monthlyAll.toFixed(2), fit: +st.ev.fit.toFixed(2) };
    for (;;) {
      const idx = JE.SCENARIOS.indexOf(sc), next = JE.SCENARIOS[idx + 1], btns = [];
      if (next && res.outcome === 'contract') btns.push({ id: 'next', label: '次のお客様へ（' + next.level + '）' });
      btns.push({ id: 'retry', label: 'もう一度挑戦する', ghost: btns.length > 0 }, { id: 'report', label: '研修レポートを印刷', ghost: true }, { id: 'title', label: 'タイトルへ', ghost: true });
      const a = await U.ask(resultHTML(sc, st, res), btns, { wide: true, onMount: (s) => setTimeout(() => s.querySelectorAll('.axis i').forEach(i => { i.style.width = i.dataset.w + '%'; }), 60), onButton: (id) => { if (id === 'report') { G.printReport(); return false; } } });
      if (a === 'retry') return G.start(sc.id);
      if (a === 'next') return G.start(next.id);
      if (!JE.save.seenAbout && res.outcome === 'contract') { JE.save.seenAbout = true; persist(); await G.about(true); }
      return G.title();
    }
  }

  // ───────── 1 組ぶんの進行 ─────────
  G.start = async (id) => {
    const sc = JE.SCENARIOS.find(s => s.id === id); JE.newRun(); U.abortAll(); const run = JE.run;
    document.getElementById('title').hidden = true; U.closeModal(); U.panelOff(); U.labels.clear(); U.hideDialog(); document.getElementById('studio').hidden = true; U.captionOff(); JE.cam.orbit = null;
    G.sc = sc; G.st = newState(sc); U.log.length = 0; window.__result = null;
    try {
      await U.fade(true, 0.5); await loadCast(sc); if (run !== JE.run) return;
      await phaseBrief(sc); await phaseGreet(sc); await phaseHearing(sc); await phaseTour(sc); await phasePlan(sc); await phaseClosing(sc); await phaseResult(sc);
    } catch (e) { if (!(e && e.isAbort)) { console.error(e); window.__error = String(e && e.stack || e); U.fade(false, 0.3); U.toast('<b>エラー</b>うまく進められませんでした。ページを読み込み直してください。', 9000); } }
  };

  // ───────── タイトル ─────────
  G.title = async () => {
    JE.newRun(); U.abortAll(); const run = JE.run;
    U.hud(false); U.hideDialog(); U.panelOff(); U.closeModal(); U.labels.clear(); U.captionOff(); document.getElementById('studio').hidden = true; document.getElementById('choices').hidden = true; document.getElementById('tip').hidden = true;
    hideAll(); JE.scene = JE.lot.scene; baseShot = null;
    JE.lot.showFinished({ type: 'two', size: 32, style: 'natural', options: ['solar', 'deck', 'garden', 'carport'] }, 'sunset');
    JE.cam.startOrbit({ center: new T.Vector3(-1, 2.8, 1), radius: 24, height: 6.5, angle: 0.5, speed: 0.035, fov: 36 });
    const el = document.getElementById('title'), res = JE.save.results;
    el.innerHTML = '<div class="brand"><div class="co">' + esc(C.company) + '　新人営業研修</div><h1>' + esc(C.title) + '</h1><div class="tag">' + esc(C.subtitle) + '</div><p class="lead">あなたは、住宅会社に入社したばかりの営業担当。モデルハウスでお客様をお迎えし、お話を聞き、暮らしに合う家を提案します。<br>最後に、あなたが提案した家が建ちます。</p></div>' +
      '<div><div class="cards">' + JE.SCENARIOS.map((s, i) => { const r = res[s.id]; return '<button type="button" class="scard glass" data-s="' + s.id + '"><span class="lv l' + (i + 1) + '">' + esc(s.level) + '</span><h3>' + esc(s.title) + '</h3><p>' + esc(s.sub) + '　／　' + esc(s.theme) + '</p><div class="best' + (r ? '' : ' none') + '">' + (r ? '最高 ' + (r.bestRank || r.rank) + ' ランク（' + (r.best || r.total) + ' 点）' + (r.outcome === 'contract' ? '・ご成約' : '') : 'まだ挑戦していません') + '</div></button>'; }).join('') + '</div>' +
      '<div class="row"><button type="button" class="btn ghost small" data-a="how">あそびかた</button><button type="button" class="btn ghost small" data-a="report">研修レポート</button><button type="button" class="btn ghost small" data-a="guide">講師用ガイド</button><button type="button" class="btn ghost small" data-a="settings">設定</button><button type="button" class="btn ghost small" data-a="about">このゲームは AI が作りました</button></div>' +
      '<div class="foot">' + esc(C.company) + esc(C.companyNote) + '　金額・金利はすべて練習用のサンプル値です。　記録はこのブラウザの中だけに保存され、外部には送信されません。</div></div>';
    el.hidden = false;
    el.querySelectorAll('.scard').forEach(b => b.addEventListener('click', () => { JE.audio.unlock(); JE.audio.sfx('select'); G.start(b.dataset.s); }));
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => { JE.audio.unlock(); JE.audio.sfx('tick'); ({ how: G.how, report: G.printReport, guide: G.askGuide, settings: G.settings, about: () => G.about(false) })[b.dataset.a](); }));
    JE.audio.music(false);
    if (run === JE.run) await U.fade(false, 0.9).catch(() => {});
  };

  // ───────── 小さな画面たち ─────────
  G.how = () => U.ask('<div class="eyebrow">あそびかた</div><h2>お客様 1 組につき、5 つの場面</h2><ol class="steps-ai"><li><b>お出迎え</b>　最初のひと言で、安心してもらう。</li><li><b>ヒアリング</b>　質問は数に限りがある。何を、どの順番で聞くか。聞けたことは「カルテ」にたまる。</li><li><b>ご案内</b>　モデルハウスの中から 3 か所を選び、そのご家族に合った伝え方をする。</li><li><b>ご提案</b>　家のかたち・広さ・オプションと、資金計画を組み立てる。選ぶと 3D の家がその場で変わる。</li><li><b>クロージング</b>　お客様の迷いや不安に応え、次の一歩を決める。</li></ol><p style="font-size:13px;color:var(--sub)">セリフはクリック（または Enter・スペース）で進みます。選択肢は数字キーでも選べます。迷ったら右上の「ヒント」を。選ぶたびに先輩が理由を教えてくれます（設定で切り替え可）。</p>', [{ id: 'ok', label: 'わかった' }]).catch(() => {});
  G.settings = () => {
    const s = JE.save.settings, sw = (k, on) => '<button type="button" class="btn small ' + (on ? '' : 'ghost') + '" data-k="' + k + '">' + (on ? 'オン' : 'オフ') + '</button>';
    const draw = () => '<div class="eyebrow">設定</div><h2>設定</h2>' +
      '<div class="set"><div><b>お名前</b><small>研修レポートに印刷されます（このブラウザの中だけに保存）</small></div><input class="field" id="set-name" style="max-width:240px" maxlength="24" value="' + esc(JE.save.name) + '" placeholder="例：山田 太郎"></div>' +
      '<div class="set"><div><b>先輩のひとこと</b><small>選ぶたびに、理由を解説します（オフでも、コンプライアンスの解説は出ます）</small></div>' + sw('learn', s.learn) + '</div>' +
      '<div class="set"><div><b>音</b><small>効果音と BGM</small></div>' + sw('sound', s.sound) + '</div>' +
      '<div class="set"><div><b>画質</b><small>動きが重いときは「軽い」に</small></div><div class="seg" style="max-width:300px">' + [['auto', '自動'], ['high', 'きれい'], ['mid', '標準'], ['low', '軽い']].map(q => '<button type="button" data-q="' + q[0] + '" class="' + (s.quality === q[0] ? 'on' : '') + '">' + q[1] + '</button>').join('') + '</div></div>' +
      '<div class="set"><div><b>文字の速さ</b></div><div class="seg" style="max-width:300px">' + [[24, 'ゆっくり'], [40, 'ふつう'], [90, 'はやい']].map(q => '<button type="button" data-t="' + q[0] + '" class="' + (s.textSpeed === q[0] ? 'on' : '') + '">' + q[1] + '</button>').join('') + '</div></div>';
    const mount = (el) => {
      const nm = el.querySelector('#set-name'); nm.addEventListener('input', () => { JE.save.name = nm.value.trim(); persist(); });
      el.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { s[b.dataset.k] = !s[b.dataset.k]; persist(); JE.audio.refresh(); redraw(); }));
      el.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { s.quality = b.dataset.q; persist(); JE.gfx.auto = s.quality === 'auto'; JE.gfx.setQuality(s.quality === 'auto' ? (JE.gfx.isMobile ? 'low' : 'high') : s.quality); redraw(); }));
      el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { s.textSpeed = +b.dataset.t; persist(); redraw(); }));
    };
    let sheet = null; const redraw = () => { const body = sheet.querySelector('.actions'); sheet.innerHTML = draw(); sheet.appendChild(body); mount(sheet); };
    return U.ask(draw(), [{ id: 'ok', label: '閉じる' }], { onMount: (el) => { sheet = el; mount(el); } }).catch(() => {});
  };
  // 「このゲームは AI が作りました」
  G.about = (first) => {
    const m = C.making || {};
    return U.ask('<div class="eyebrow">' + (first ? 'じつは' : 'このゲームについて') + '</div><h2>このゲームは、AI が作りました。</h2><p>プログラムも、モデルハウスも、3 組のお客様のセリフも、採点のしくみも。人が書いたコードは 1 行もありません。人がしたのは、やりたいことを言葉で伝えることでした。</p>' +
      '<div class="making"><div><b>' + (m.lines || '―') + '</b><small>AI が書いたプログラムの行数</small></div><div><b>0</b><small>人が書いたコードの行数</small></div><div><b>' + (m.messages || '―') + '</b><small>作る内容について人が送ったメッセージ</small></div><div><b>10 人</b><small>3D の出演者（モーション ' + (m.motions || 67) + ' 本）</small></div></div>' +
      '<h3>最初に人が送った依頼</h3><div class="quote">' + esc(m.prompt || '') + '</div>' +
      '<h3>AI がやったこと</h3><ol class="steps-ai"><li><b>先に計画を見せて、了承をもらった。</b>　場面の流れ、採点、会社で使うための工夫をまとめて提案。</li><li><b>「人物をリアルに」と言われ、その場で試作して見せた。</b>　使える人物モデルを探し、実際に表示した画像で確認してもらってから着手。</li><li><b>3D の舞台を作った。</b>　床の木目や壁の質感は画像ファイルを使わず計算で生成。家は選んだプランから組み立てる。</li><li><b>営業のシナリオを書いた。</b>　聞く順番、深掘り、暮らしの言葉、資金計画、コンプライアンス。</li><li><b>自分でテストした。</b>　全員ぶんを自動で最後まで遊び、画面を撮って見た目を確かめ、直した。</li></ol>' +
      '<h3>AI にうまく頼むコツ（このゲームの作り方から）</h3><ul class="plain"><li><b>目的を伝える。</b>「何を作るか」だけでなく「誰が、何のために使うか」。</li><li><b>先に計画を出させる。</b>作る前に方向をそろえると、やり直しが減る。</li><li><b>気になる所は、遠慮なく具体的に言う。</b>「人物が微妙」→「リアルにしたい」。</li></ul>' +
      '<p style="font-size:12px;color:var(--sub);margin-top:14px">制作：Claude Code（Anthropic）　／　3D エンジン：three.js（MIT）　／　人物モデルとモーション：Microsoft Rocketbox Avatar Library（MIT）</p>',
      [{ id: 'ok', label: first ? 'へえ！' : '閉じる' }], { wide: true }).catch(() => {});
  };
  // 講師用ガイドは答えが載っているので、開く前にひとこと確かめる
  G.askGuide = () => U.ask('<div class="eyebrow">講師・研修担当の方へ</div><h2>講師用ガイドを印刷しますか？</h2><p>3 組のお客様それぞれについて、ニーズの一覧、各場面の模範解答と解説、提案の目安をまとめた資料です。</p><p style="color:var(--bad)">答えが載っているので、受講者の方は、まず自分の力で挑戦してからご覧ください。</p>', [{ id: 'print', label: '印刷する' }, { id: 'cancel', label: 'やめる', ghost: true }]).then(a => { if (a === 'print') G.printGuide(); }).catch(() => {});
  // 研修レポート（印刷用）
  G.printReport = () => {
    const r = JE.save.results, done = JE.SCENARIOS.filter(s => r[s.id]);
    if (!done.length) { U.toast('<b>研修レポート</b>まだ記録がありません。お客様を 1 組、最後まで接客すると印刷できます。'); return; }
    let h = '<h1>' + esc(C.title) + '　研修レポート</h1><div class="meta"><span>' + esc(C.company) + '　新人営業研修（' + esc(C.subtitle) + '）</span><span>受講者：' + esc(JE.save.name || '＿＿＿＿＿＿＿＿') + '　　出力日：' + new Date().toISOString().slice(0, 10) + '</span></div>';
    h += '<h2>成績のまとめ</h2><table><tr><th>お客様</th><th>結果</th><th>評価</th>' + C.axes.map(a => '<th>' + a.name + '</th>').join('') + '<th>NG 発言</th><th>挑戦回数</th></tr>' + done.map(s => { const x = r[s.id]; return '<tr><td>' + esc(s.level) + '：' + esc(s.sub) + '</td><td>' + OUT[x.outcome] + '</td><td>' + x.rank + '（' + x.total + ' 点）</td>' + C.axes.map(a => '<td>' + x.axes[a.id] + '</td>').join('') + '<td>' + x.ng.length + ' 件</td><td>' + (x.plays || 1) + ' 回</td></tr>'; }).join('') + '</table><small>各項目は 100 点満点。評価は直近の挑戦のもの。</small>';
    for (const s of done) { const x = r[s.id]; h += '<div class="scn"><h2>' + esc(s.level) + '：' + esc(s.sub) + '（' + x.date + '）</h2><p><b>テーマ</b>　' + esc(s.theme) + '　／　カルテに書けたこと ' + x.known + ' / ' + x.needs + ' 件　／　ヒント ' + x.hints + ' 回</p>';
      h += '<table><tr><th style="width:50%">よかったところ</th><th>次に生かすところ</th></tr><tr><td>' + (x.goods.length ? '<ul>' + x.goods.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '―') + '</td><td>' + (x.bads.length ? '<ul>' + x.bads.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '―') + '</td></tr></table>';
      if (x.ng.length) h += '<table><tr><th>コンプライアンスに関わる発言</th><th style="width:55%">解説</th></tr>' + x.ng.map(n => '<tr><td>' + esc(n.t) + '</td><td><b>' + esc(C.ng[n.id].name) + '</b>：' + esc(C.ng[n.id].text) + '</td></tr>').join('') + '</table>';
      h += '</div>'; }
    h += '<p><small>' + esc(C.ngNote) + '　金額・金利はすべて練習用のサンプル値です。</small></p><div class="sign"><div>受講者 所感</div><div>指導担当 コメント</div><div>確認印</div></div>';
    document.getElementById('report').innerHTML = h;
    if (!JE.fast) setTimeout(() => window.print(), 60);
  };
  // 講師用ガイド（模範解答と解説）。シナリオのデータからその場で作るので、書き換えても内容がずれない。
  G.printGuide = () => {
    const best = (cs) => cs.slice().sort((a, b) => RANK[b.r] - RANK[a.r])[0], ngs = (cs) => cs.filter(c => c.ng);
    const stepRow = (label, def) => { const b = best(def.choices); return '<tr><td>' + esc(label) + '</td><td>' + esc(b.t) + '</td><td>' + esc(b.tip || '') + (ngs(def.choices).length ? '<br><small>NG：' + ngs(def.choices).map(c => esc(C.ng[c.ng].name)).join('、') + ' に当たる選択肢あり</small>' : '') + '</td></tr>'; };
    const optName = (k) => k[0] === '@' ? C.basePrice[k.slice(1)].name + 'にする' : (C.options.find(o => o.id === k) || { name: k }).name;
    let h = '<h1>' + esc(C.title) + '　講師用ガイド（模範解答と解説）</h1><div class="meta"><span>' + esc(C.company) + '　新人営業研修</span><span>※ 受講者には配らないでください</span></div><p><small>各場面で最も評価の高い選択と、その理由です。金額・金利はすべて練習用のサンプル値です。' + esc(C.ngNote) + '</small></p>';
    for (const sc of JE.SCENARIOS) {
      const m = sc.money;
      h += '<div class="chapter"><h2>' + esc(sc.level) + '：' + esc(sc.title) + '（' + esc(sc.sub) + '）</h2><p><b>テーマ</b>　' + esc(sc.theme) + '<br><b>学習ポイント</b>　' + sc.goals.map(esc).join('／') + '</p>';
      h += '<table><tr><th style="width:16%">分類</th><th>お客様の事情・ニーズ</th><th style="width:8%">重み</th><th style="width:32%">提案での対応</th></tr>' + Object.keys(sc.needs).map(k => { const n = sc.needs[k]; return '<tr><td>' + esc(n.cat) + '</td><td>' + esc(n.label) + '</td><td>' + n.w + '</td><td>' + (sc.plan.map[k] ? sc.plan.map[k].map(optName).map(esc).join(' または ') : '（情報として生かす）') + '</td></tr>'; }).join('') + '</table>';
      h += '<table><tr><th style="width:16%">お出迎え</th><th style="width:40%">模範</th><th>解説</th></tr>' + sc.greet.map(d => stepRow(d.prompt, d)).join('') + '</table>';
      h += '<table><tr><th style="width:34%">ヒアリングの質問（' + sc.hearingTurns + ' 回まで）</th><th style="width:22%">分かること</th><th>深掘りの模範・注意</th></tr>' + sc.hearing.questions.map(q => { const f = q.follow ? best(q.follow.choices) : null, ids = (q.reveals || []).concat(f && f.reveals ? f.reveals : []); return '<tr><td>' + esc(q.t) + (q.gate ? '<br><small>信頼が育つ前に聞くと、はぐらかされる</small>' : '') + '</td><td>' + (ids.length ? ids.map(i => esc(sc.needs[i].label)).join('<br>') : '―') + '</td><td>' + (f ? esc(f.t) + '<br><small>' + esc(f.tip) + '</small>' : q.fail ? '<small>' + esc(q.fail.tip) + '</small>' : '―') + '</td></tr>'; }).join('') + stepRow('締めくくり', sc.hearing.end).replace('<td>締めくくり</td>', '<td>ヒアリングの締めくくり</td>') + '</table>';
      h += '<table><tr><th style="width:16%">ご案内（' + sc.tour.pick + ' か所）</th><th style="width:40%">模範</th><th>解説</th></tr>' + sc.tour.spots.map(sp => stepRow(sp.name, { choices: sp.talks })).join('') + '</table>';
      h += '<p><b>ご提案の目安</b>　' + C.basePrice[sc.plan.type].name + '・' + sc.plan.sizeOk.join('〜') + ' 坪（' + esc(sc.plan.typeNote) + '）／月々のご希望 ' + m.hope + ' 万円（上限 ' + m.limit + ' 万円）／自己資金 ' + m.own + ' 万円のうち ' + m.reserve + ' 万円は残す' + (m.other ? '／' + esc(m.otherName) + ' ' + m.other + ' 万円を含む' : '') + '</p>';
      h += '<table><tr><th style="width:16%">金額・クロージング</th><th style="width:40%">模範</th><th>解説</th></tr>' + stepRow('金額の伝え方', sc.plan.present) + sc.closing.map(d => stepRow(d.final ? '次の一歩' : d.say.filter(l => l[0] !== 'n').map(l => l[1]).join(' ').slice(0, 26) + '…', d)).join('') + '</table></div>';
    }
    document.getElementById('report').innerHTML = h;
    if (!JE.fast) setTimeout(() => window.print(), 60);
  };
  function menu() {
    if (!G.sc || document.getElementById('hud').hidden) return;
    JE.paused = true;
    U.ask('<div class="eyebrow">一時停止</div><h2>メニュー</h2><p style="color:var(--sub)">' + esc(G.sc.level) + '　' + esc(G.sc.sub) + '　／　' + esc(G.phase) + '</p>', [{ id: 'resume', label: 'つづける' }, { id: 'settings', label: '設定', ghost: true }, { id: 'title', label: 'タイトルへ戻る', ghost: true }])
      .then(async (a) => { JE.paused = false; if (a === 'title') { await U.fade(true, 0.4).catch(() => {}); G.title(); } else if (a === 'settings') G.settings(); }).catch(() => { JE.paused = false; });
  }

  // ───────── 自動プレイ（テスト用）：?auto=best|mid|worst ─────────
  function makeAuto(strat) {
    const val = (r) => RANK[r] == null ? 2 : RANK[r];
    return {
      strat,
      pick(items) { let b = 0; items.forEach((it, i) => { const a = val(it.r), c = val(items[b].r); if (strat === 'best' ? a > c : strat === 'worst' ? a < c : Math.abs(a - 2) < Math.abs(c - 2)) b = i; }); return b; },
      question(sc, st, list) {
        const w = (q) => (q.reveals || []).concat(...((q.follow && q.follow.choices) || []).map(c => c.reveals || [])).filter(i => !st.known.has(i)).reduce((s, i) => s + (sc.needs[i] ? sc.needs[i].w : 0), 0);
        if (strat === 'worst') return list.slice().sort((a, b) => (b.gate || 0) - (a.gate || 0))[0];
        if (strat === 'mid') return list[0];
        const ok = list.filter(q => !q.gate || st.trust >= q.gate); return (ok.length ? ok : list).slice().sort((a, b) => w(b) - w(a) || (a.gate || 0) - (b.gate || 0))[0];
      },
      spot(sc, st, list) { if (strat !== 'best') return strat === 'worst' ? list[list.length - 1] : list[0]; const v = (s) => Math.max(...s.talks.map(t => val(t.r) * 10 + (t.need && sc.needs[t.need] ? sc.needs[t.need].w : 0))); return list.slice().sort((a, b) => v(b) - v(a))[0]; },
      plan(sc, st, plan) {
        const m = sc.money;
        if (strat === 'worst') { plan.type = sc.plan.type === 'two' ? 'hiraya' : 'two'; plan.size = C.basePrice[plan.type].sizes.slice(-1)[0]; C.options.forEach(o => plan.options.add(o.id)); plan.down = m.own; plan.rate = 'fixed'; plan.term = m.terms[m.terms.length - 1]; return; }
        plan.type = sc.plan.type; plan.size = sc.plan.sizeOk[0]; plan.rate = 'variable'; plan.term = m.terms[0]; plan.down = strat === 'best' ? m.own - m.reserve : m.own;
        const needs = Object.keys(sc.plan.map).sort((a, b) => sc.needs[b].w - sc.needs[a].w), use = strat === 'best' ? needs : needs.slice(0, Math.ceil(needs.length / 2));
        for (const k of use) { const o = sc.plan.map[k].find(x => x[0] !== '@'); if (o) plan.options.add(o); }
        if (strat === 'best') for (const k of needs.slice().reverse()) { if (JE.calcPlan(sc, plan).monthlyAll <= m.hope) break; const o = sc.plan.map[k].find(x => x[0] !== '@'); if (o) plan.options.delete(o); }
      },
      button(buttons) { return (buttons.find(b => b.id === 'go' || b.id === 'ok' || b.id === 'title') || buttons[buttons.length - 1]).id; },
    };
  }

  // ───────── 起動 ─────────
  G.boot = async () => {
    U.init();
    document.getElementById('btn-karte').addEventListener('click', () => { JE.audio.sfx('tick'); U.karte.toggle(); });
    document.getElementById('btn-hint').addEventListener('click', () => { if (!G.st) return; G.st.hints++; JE.audio.sfx('tick'); U.toast('<b>' + esc(C.senpai.label) + '</b>' + esc(G.hint || 'カルテを見直してみよう。答えは、お客様の言葉の中にある。'), 7000); });
    document.getElementById('btn-menu').addEventListener('click', menu);
    addEventListener('pointerdown', () => JE.audio.unlock(), { once: true });
    try {
      if (!window.THREE || !JE.gfx || !JE.house || !JE.lot || !JE.people) throw new Error('プログラムの一部を読み込めませんでした。HTML と「jutaku-eigyo」フォルダが同じ場所にあるか確かめて、ページを読み込み直してください。');
      U.loading(0.06, '3D エンジンを起動しています…'); await tick();
      const cv = document.getElementById('stage'), test = document.createElement('canvas').getContext('webgl2');
      if (!test) throw new Error('このブラウザでは 3D（WebGL2）を表示できません。Chrome・Edge・Safari・Firefox の新しい版でお試しください。');
      JE.gfx.init(cv);
      U.loading(0.2, '床や壁の質感をつくっています…'); await tick(); JE.mat.init();
      U.loading(0.45, 'モデルハウスを建てています…'); await tick(); JE.house.build();
      U.loading(0.72, '街並みをつくっています…'); await tick(); JE.lot.build();
      U.loading(0.95, 'もうすぐです…'); await tick();
      JE.startLoop();
      const auto = qs.get('auto'); if (auto) { JE.auto = makeAuto(auto); JE.save.settings.sound = false; }
      if (qs.get('sc')) { U.loadingDone(); G.start(qs.get('sc')); } else { await G.title(); U.loadingDone(); }
      window.__ready = true;
    } catch (e) { console.error(e); window.__error = String(e && e.stack || e); U.loadingError(esc(e.message || String(e))); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', G.boot); else G.boot();
})();
