/* ============================================================
 * ui.js : 画面の部品（会話・選択肢・解説・カルテ・プランづくり など）
 * ============================================================ */
(function () {
  'use strict';
  const JE = window.JE, el = JE.el, esc = JE.esc;
  const U = JE.ui = { n: {} };
  const N = U.n;
  let advance = null;                 // 「クリックで次へ」で呼ぶ処理
  const pending = new Set();          // 場面が打ち切られたときに止める待ち
  const waitUser = (fn) => new Promise((res, rej) => { const p = { rej }; pending.add(p); fn((v) => { pending.delete(p); res(v); }); });
  U.abortAll = () => { for (const p of pending) p.rej(new JE.Abort()); pending.clear(); advance = null; };

  U.init = () => {
    for (const id of ['title', 'hud', 'steps', 'guest', 'panel', 'studio', 'karte', 'choices', 'dialog', 'tip', 'toast', 'caption', 'fade', 'modal', 'loading', 'labels', 'report']) N[id] = document.getElementById(id);
    const go = () => { if (advance) advance(); };
    N.dialog.addEventListener('click', go); N.tip.addEventListener('click', go);
    document.getElementById('stage').addEventListener('click', go);
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') { if (advance) { e.preventDefault(); advance(); } }
      else if (/^[1-9]$/.test(e.key) && !N.choices.hidden) { const b = N.choices.querySelectorAll('.choice')[+e.key - 1]; if (b) b.click(); }
      else if (e.key === 'Escape') { if (!N.karte.hidden) U.karte.close(); }
    });
    // 会話の文字送り
    JE.updaters.add((dt) => {
      const t = typing; if (!t || t.done) return;
      t.n += dt * (JE.save.settings.textSpeed || 40); const k = Math.min(t.text.length, Math.floor(t.n));
      if (k !== t.shown) { t.shown = k; t.node.textContent = t.text.slice(0, k); }
      if (k >= t.text.length) { t.done = true; N.dialog.classList.add('ready'); }
    });
    JE.updaters.add(() => U.labels.update());
  };

  // ───────── 読み込み表示 ─────────
  U.loading = (p, msg) => { document.getElementById('load-bar').style.width = Math.round(p * 100) + '%'; if (msg) document.getElementById('load-msg').textContent = msg; N.loading.classList.remove('out'); N.loading.hidden = false; };
  U.loadingDone = () => { N.loading.classList.add('out'); setTimeout(() => { if (N.loading.classList.contains('out')) N.loading.hidden = true; }, 700); };
  U.loadingError = (html) => { const e = document.getElementById('load-err'); e.hidden = false; e.innerHTML = html; };

  // ───────── 暗転・見出し ─────────
  U.fade = (on, dur) => { N.fade.style.transitionDuration = (JE.fast ? 0 : (dur == null ? 0.6 : dur)) + 's'; N.fade.style.opacity = on ? 1 : 0; return JE.wait(dur == null ? 0.65 : dur + 0.05).then(() => { if (on) { U.hideDialog(); N.tip.hidden = true; N.choices.hidden = true; } }); };   // 暗転したら、前の場面のセリフ枠は片づける
  U.caption = async (big, small, hold) => { N.caption.querySelector('.big').textContent = big || ''; N.caption.querySelector('.small').textContent = small || ''; if (JE.fast) return; N.caption.classList.add('on'); try { await JE.wait(hold == null ? 2.4 : hold); } finally { N.caption.classList.remove('on'); } await JE.wait(0.7); };
  U.captionOn = (big, small) => { N.caption.querySelector('.big').textContent = big || ''; N.caption.querySelector('.small').textContent = small || ''; N.caption.classList.add('on'); };
  U.captionOff = () => N.caption.classList.remove('on');

  // ───────── 会話 ─────────
  let typing = null;
  // who: { label, cls } / text: セリフ。クリックされるまで待つ。
  U.say = (who, text) => {
    U.log.push([who.label || '', text]);
    if (JE.fast) return Promise.resolve();
    return waitUser((done) => {
      N.choices.hidden = true; N.tip.hidden = true; N.dialog.hidden = false;
      N.dialog.classList.toggle('narr', who.cls === 'narr'); N.dialog.classList.remove('ready');
      const nm = N.dialog.querySelector('.name'); nm.textContent = who.label || ''; nm.className = 'name ' + (who.cls || '');
      const node = N.dialog.querySelector('.text'); node.textContent = '';
      typing = { text, n: 0, shown: 0, done: false, node };
      JE.audio && JE.audio.sfx('tick');
      advance = () => { if (!typing.done) { typing.done = true; node.textContent = text; N.dialog.classList.add('ready'); if (who.onSkip) who.onSkip(); return; } advance = null; done(); };
    });
  };
  U.hideDialog = () => { N.dialog.hidden = true; typing = null; };
  U.log = [];

  // ───────── 選択肢 ─────────
  // items: [{ t }]。選ばれた番号を返す。
  U.choose = (prompt, items) => {
    if (JE.auto) return Promise.resolve(JE.auto.pick(items));
    U._items = items;
    return waitUser((done) => {
      U.hideDialog(); N.tip.hidden = true; N.choices.innerHTML = ''; N.choices.hidden = false;
      N.choices.appendChild(el('div', { class: 'prompt', text: prompt }));
      items.forEach((it, i) => { const b = el('button', { class: 'choice glass', type: 'button' }, '<b>' + (i + 1) + '</b><span>' + esc(it.t) + '</span>'); b.addEventListener('click', () => { N.choices.hidden = true; JE.audio && JE.audio.sfx('select'); done(i); }); N.choices.appendChild(b); });
    });
  };

  // ───────── 先輩の解説 ─────────
  const BADGE = { great: 'ナイス！', good: 'いいね', neutral: 'おしい', bad: '要注意', terrible: 'これは NG' };
  U.tip = (r, text, ng) => {
    if (JE.fast) return Promise.resolve();
    return waitUser((done) => {
      U.hideDialog(); N.choices.hidden = true; N.tip.className = 'glass ' + r; N.tip.hidden = false;
      N.tip.innerHTML = '<div class="head"><span class="badge">' + BADGE[r] + '</span>' + esc(JE.CONFIG.senpai.label) + 'のひとこと</div><p>' + esc(text) + '</p>' + (ng ? '<div class="law"><b>コンプライアンス：' + esc(ng.name) + '</b>' + esc(ng.text) + '</div>' : '') + '<div class="go">クリックで次へ ▼</div>';
      JE.audio && JE.audio.sfx(r === 'great' || r === 'good' ? 'good' : r === 'neutral' ? 'tick' : 'bad');
      advance = () => { advance = null; N.tip.hidden = true; done(); };
    });
  };
  let toastT = 0;
  U.toast = (html, ms) => { N.toast.innerHTML = html; N.toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { N.toast.hidden = true; }, ms || 5200); };

  // ───────── 画面上部 ─────────
  const PHASES = ['お出迎え', 'ヒアリング', 'ご案内', 'ご提案', 'クロージング'];
  U.setPhase = (i) => { N.steps.innerHTML = PHASES.map((p, k) => '<div class="st ' + (k < i ? 'done' : k === i ? 'on' : '') + '"><b>' + (k < i ? '✓' : k + 1) + '</b><span>' + p + '</span></div>').join(''); };
  U.setGuest = (sc, showTrust) => {
    N.guest.hidden = false;
    N.guest.innerHTML = '<div class="ring">' + (showTrust ? '<svg viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="19" fill="none" stroke-width="5"/><circle class="fg" cx="23" cy="23" r="19" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="119.4" stroke-dashoffset="119.4"/></svg><span>信頼</span>' : '<svg viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="19" fill="none" stroke-width="5" stroke-dasharray="3 5"/></svg><span>？</span>') + '</div><div class="who">' + esc(sc.sub) + '<small>' + (showTrust ? esc(sc.level) + '　' + esc(sc.title) : '信頼は表情としぐさで読み取ろう') + '</small></div><div class="delta"></div>';
  };
  let deltaT = 0;
  U.setTrust = (v, d, show) => {
    const fg = N.guest.querySelector('.fg'); if (fg) { fg.style.strokeDashoffset = (119.4 * (1 - v / 100)).toFixed(1); fg.style.stroke = v >= 60 ? 'var(--good)' : v >= 35 ? 'var(--accent)' : 'var(--bad)'; }
    const dl = N.guest.querySelector('.delta'); if (dl && d && show) { dl.textContent = (d > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(d)); dl.className = 'delta ' + (d > 0 ? 'up' : 'down'); clearTimeout(deltaT); deltaT = setTimeout(() => { dl.className = 'delta'; }, 2600); }
  };
  U.hud = (on) => { N.hud.hidden = !on; if (!on) { N.guest.hidden = true; U.karte.close(); } };

  // ───────── 右のパネル ─────────
  U.panel = (html) => { U.hideDialog(); N.tip.hidden = true; N.panel.innerHTML = html; N.panel.hidden = false; JE.cam.setShift(true); return N.panel; };
  U.panelOff = () => { N.panel.hidden = true; N.panel.innerHTML = ''; JE.cam.setShift(false); };

  // ───────── カルテ ─────────
  U.karte = {
    sc: null, st: null, fresh: new Set(),
    bind(sc, st) { this.sc = sc; this.st = st; this.fresh.clear(); this.count(); },
    count() { const n = this.st ? this.st.known.size : 0; document.getElementById('karte-n').textContent = n; },
    add(ids) { for (const id of ids) this.fresh.add(id); this.count(); if (!N.karte.hidden) this.render(); },
    open() { if (!this.sc) return; N.karte.hidden = false; this.render(); },
    close() { N.karte.hidden = true; this.fresh.clear(); },
    toggle() { if (N.karte.hidden) this.open(); else this.close(); },
    render() {
      const sc = this.sc, st = this.st, cats = {};
      for (const id in sc.needs) { const nd = sc.needs[id]; (cats[nd.cat] = cats[nd.cat] || []).push(id); }
      let h = '<header><h2>お客様カルテ</h2><button class="x" type="button" aria-label="閉じる">×</button></header><div class="body"><p style="font-size:12px;color:var(--sub);margin:6px 0 0">' + esc(sc.sub) + '　ヒアリングで分かったことが、ここにたまります。</p>';
      h += '<div class="kcat"><span>来場アンケート</span></div>' + sc.survey.map(s => '<div class="kitem">' + esc(s) + '</div>').join('');
      for (const c in cats) { const ids = cats[c], got = ids.filter(i => st.known.has(i)); h += '<div class="kcat"><span>' + esc(c) + '</span><span>' + got.length + ' / ' + ids.length + '</span></div>';
        h += got.map(i => '<div class="kitem' + (this.fresh.has(i) ? ' new' : '') + '">' + esc(sc.needs[i].label) + '</div>').join('');
        if (got.length < ids.length) h += '<div class="kitem unk">まだ聞けていないことがあります</div>'; }
      N.karte.innerHTML = h + '</div>';
      N.karte.querySelector('.x').addEventListener('click', () => this.close());
    },
  };

  // ───────── 3D 上のラベル ─────────
  U.labels = {
    list: [],
    set(items) { N.labels.innerHTML = ''; this.list = items.map(it => { const e = el('div', { class: 'lbl', text: it.text }); N.labels.appendChild(e); return { e, pos: it.pos }; }); },
    clear() { this.set([]); },
    update() { for (const l of this.list) { const p = JE.project(l.pos); l.e.style.display = p.front ? '' : 'none'; l.e.style.left = p.x.toFixed(1) + 'px'; l.e.style.top = p.y.toFixed(1) + 'px'; } },
  };

  // ───────── 大きな窓 ─────────
  U.modal = (html, o) => { o = o || {}; N.modal.innerHTML = '<div class="sheet' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>'; N.modal.hidden = false; N.modal.scrollTop = 0; return N.modal.firstElementChild; };
  U.closeModal = () => { N.modal.hidden = true; N.modal.innerHTML = ''; };
  // ボタンが押されるまで待つ窓。buttons: [{ id, label, ghost }] → 押された id を返す
  U.ask = (html, buttons, o) => waitUser((done) => {
    const s = U.modal(html + '<div class="actions">' + buttons.map(b => '<button type="button" class="btn' + (b.ghost ? ' ghost' : '') + '" data-id="' + b.id + '">' + esc(b.label) + '</button>').join('') + '</div>', o);
    s.querySelectorAll('.actions [data-id]').forEach(b => b.addEventListener('click', () => { const r = o && o.onButton ? o.onButton(b.dataset.id, s) : undefined; if (r === false) return; U.closeModal(); JE.audio && JE.audio.sfx('select'); done(b.dataset.id); }));
    if (o && o.onMount) o.onMount(s);
    if (JE.auto) { U.closeModal(); done(JE.auto.button ? JE.auto.button(buttons) : buttons[0].id); }
  });

  // ───────── プランづくり（3D の家を見ながら、仕様とお金を組み立てる） ─────────
  // 「この内容で提案する」が押されたら、プランを返す。
  U.studio = (sc, st, plan) => waitUser((done) => {
    const C = JE.CONFIG, money = sc.money, known = st.known;
    const row = (l, v) => '<tr><td>' + l + '</td><td>' + v + '</td></tr>';
    N.studio.innerHTML =
      '<div class="col l glass"><header><h2>① プランをつくる</h2><p>選ぶと、まんなかの家がその場で変わります。</p></header><div class="body" id="st-plan"></div></div>' +
      '<div class="col r glass hide"><header><h2>② 資金計画</h2><p>金額はすべて練習用のサンプル値です。</p></header><div class="body" id="st-money"></div></div>' +
      '<button type="button" class="btn go" id="st-go">この内容で提案する</button>' +
      '<div class="tabs"><button type="button" data-t="l" class="on">① プラン</button><button type="button" data-t="r">② お金</button><button type="button" class="send" data-t="go">提案する</button></div>';
    U.hideDialog(); N.tip.hidden = true; N.studio.hidden = false;
    const L = N.studio.querySelector('#st-plan'), R = N.studio.querySelector('#st-money'), cols = N.studio.querySelectorAll('.col');
    N.studio.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { if (b.dataset.t === 'go') return submit(); cols[0].classList.toggle('hide', b.dataset.t !== 'l'); cols[1].classList.toggle('hide', b.dataset.t !== 'r'); N.studio.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); }));
    const rebuild = (animate) => { JE.lot.setPlan(plan, { animate }); labels(); };
    const labels = () => { const h = JE.lot.house; U.labels.set(C.options.filter(o => plan.options.has(o.id) && h.anchors[o.id]).map(o => ({ text: o.name.replace(/（.*?）/g, ''), pos: h.anchors[o.id] }))); };
    const drawPlan = () => {
      const bp = C.basePrice;
      let h = '<div class="lab">建物のかたち</div><div class="seg" data-k="type">' + Object.keys(bp).map(k => '<button type="button" data-v="' + k + '" class="' + (plan.type === k ? 'on' : '') + '">' + bp[k].name + '</button>').join('') + '</div>';
      h += '<div class="lab">広さ（延床）</div><div class="seg" data-k="size">' + bp[plan.type].sizes.map(s => '<button type="button" data-v="' + s + '" class="' + (plan.size === s ? 'on' : '') + '">' + s + '坪</button>').join('') + '</div>';
      h += '<div class="lab">外観のスタイル</div><div class="seg" data-k="style">' + Object.keys(JE.lot.STYLES).map(k => '<button type="button" data-v="' + k + '" class="' + (plan.style === k ? 'on' : '') + '">' + JE.lot.STYLES[k].name + '</button>').join('') + '</div>';
      let cat = '';
      for (const o of C.options) { if (o.cat !== cat) { cat = o.cat; h += '<div class="lab">オプション：' + cat + '</div>'; }
        h += '<button type="button" class="opt' + (plan.options.has(o.id) ? ' on' : '') + '" data-o="' + o.id + '"><span class="ck">' + (plan.options.has(o.id) ? '✓' : '') + '</span><div><div class="nm">' + esc(o.name) + '<span>+' + o.price + '万円</span></div><div class="bn">' + esc(o.benefit) + '</div></div></button>'; }
      const top = L.scrollTop; L.innerHTML = h; L.scrollTop = top;
      L.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { const k = b.parentNode.dataset.k, v = k === 'size' ? +b.dataset.v : b.dataset.v; if (plan[k] === v) return; plan[k] = v; if (k === 'type') { const sz = bp[v].sizes; plan.size = sz[Math.floor(sz.length / 2)]; } JE.audio && JE.audio.sfx('build'); drawPlan(); drawMoney(); rebuild(true); }));
      L.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => { const id = b.dataset.o, on = !plan.options.has(id); if (on) plan.options.add(id); else plan.options.delete(id); JE.audio && JE.audio.sfx(on ? 'add' : 'tick'); if (id === 'atrium' || id === 'insulation') rebuild(true); else { JE.lot.setOption(id, on); labels(); } drawPlan(); drawMoney(); }));
    };
    const drawMoney = () => {
      const c = JE.calcPlan(sc, plan), rate = C.rates.find(r => r.id === plan.rate);
      let h = '<table class="money">' + row('建物本体（' + C.basePrice[plan.type].name + '・' + plan.size + '坪）', JE.yen(c.base)) + row('オプション（' + plan.options.size + ' 件）', JE.yen(c.opt)) + row('付帯工事', JE.yen(c.site));
      for (const e of c.extras) h += row(esc(e.name), JE.yen(e.price));
      h += row('諸費用（登記・ローン手数料など）', JE.yen(c.fees)) + '<tr class="total"><td>総額</td><td>' + JE.yen(c.total) + '</td></tr></table>';
      h += '<div class="lab">自己資金（頭金）</div><input class="slider" type="range" id="st-down" min="0" max="' + money.own + '" step="50" value="' + plan.down + '"><div class="srow"><span>' + JE.yen(plan.down) + ' を入れる</span><span>手元に残る：' + JE.yen(money.own - plan.down) + '</span></div>';
      h += '<div class="hintbox">' + (known.has('own') ? 'カルテ：' + esc(sc.needs.own.label) : '自己資金のうち「残しておきたい額」は、まだ伺えていません。') + '</div>';
      h += '<div class="lab">金利のタイプ</div><div class="seg" data-k="rate">' + C.rates.map(r => '<button type="button" data-v="' + r.id + '" class="' + (plan.rate === r.id ? 'on' : '') + '">' + r.name + ' ' + r.rate.toFixed(1) + '%</button>').join('') + '</div><div class="srow" style="margin-top:3px"><span>' + esc(rate.note) + '</span></div>';
      h += '<div class="lab">返済期間</div><div class="seg" data-k="term">' + money.terms.map(t => '<button type="button" data-v="' + t + '" class="' + (plan.term === t ? 'on' : '') + '">' + t + '年</button>').join('') + '</div>';
      const max = Math.max(money.limit * 1.25, c.monthlyAll * 1.05), over = c.monthlyAll > money.hope + 0.001, bad = c.monthlyAll > money.limit + 0.001;
      h += '<div class="pay"><div class="srow"><span>借入額 ' + JE.yen(c.loan) + '</span><span>' + rate.rate.toFixed(1) + '%・' + plan.term + '年</span></div><div class="big">' + c.monthlyAll.toFixed(1) + '<small>万円 / 月</small></div>';
      if (money.other) h += '<div class="cmp">うち ' + esc(money.otherName) + '：' + money.other.toFixed(1) + '万円</div>';
      if (known.has('budget')) h += '<div class="gauge"><i style="width:' + Math.min(100, c.monthlyAll / max * 100).toFixed(1) + '%;background:' + (bad ? 'var(--bad)' : over ? 'var(--warn)' : 'var(--good)') + '"></i><u style="left:' + (money.hope / max * 100).toFixed(1) + '%" data-l="ご希望 ' + money.hope + '万"></u></div><div class="cmp">' + (bad ? 'ご希望を大きく超えています。' : over ? 'ご希望を少し超えています。' : 'ご希望の範囲に収まっています。') + '</div>';
      else h += '<div class="cmp" style="color:var(--terra)">月々のご希望額は、まだ伺えていません（ヒアリング未確認）。</div>';
      if (money.rent) h += '<div class="cmp">いまの家賃：' + money.rent.toFixed(1) + '万円 / 月</div>';
      h += '<div class="cmp">返済負担率：<b style="color:' + (c.ratio > C.safeRatio ? 'var(--bad)' : 'var(--good)') + '">' + c.ratio.toFixed(1) + '%</b>（年収 ' + money.income + '万円に対して。目安は ' + C.safeRatio + '% 以内）</div></div>';
      // カルテで分かっているニーズと、いまのプランの対応
      const map = sc.plan.map, ids = Object.keys(map).filter(k => known.has(k));
      h += '<div class="lab">カルテのご要望と、このプラン</div><ul class="needs">' + (ids.length ? ids.map(k => { const ok = JE.needMet(sc, plan, k); return '<li><span class="' + (ok ? 'y' : 'n') + '">' + (ok ? '✓' : '―') + '</span> ' + esc(sc.needs[k].label) + '</li>'; }).join('') : '<li class="n">ヒアリングで聞けたご要望が、ここに並びます。</li>') + '</ul>';
      const top = R.scrollTop; R.innerHTML = h; R.scrollTop = top;
      R.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { const k = b.parentNode.dataset.k; plan[k] = k === 'term' ? +b.dataset.v : b.dataset.v; JE.audio && JE.audio.sfx('tick'); drawMoney(); }));
      const sl = R.querySelector('#st-down'); sl.addEventListener('input', () => { plan.down = +sl.value; drawMoney(); R.querySelector('#st-down').focus(); });
    };
    const submit = () => { N.studio.hidden = true; N.studio.innerHTML = ''; U.labels.clear(); JE.audio && JE.audio.sfx('select'); done(plan); };
    N.studio.querySelector('#st-go').addEventListener('click', submit);
    drawPlan(); drawMoney(); rebuild(false);
    if (JE.auto) { JE.auto.plan(sc, st, plan); submit(); }
  });
})();
