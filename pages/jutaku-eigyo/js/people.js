/* ============================================================
 * people.js : 人物（読み込み・モーション・表情・視線・歩行）
 *
 * 人物モデルとモーションは Microsoft Rocketbox Avatar Library（MIT ライセンス）。
 * ============================================================ */
(function () {
  'use strict';
  const T = window.THREE, JE = window.JE, A = JE.assets;
  const P = JE.people = { all: new Map() };
  const REF = { m: 89.5, f: 91.9 };          // モーション収録時の腰の高さ(cm)。体格の違う人物へ合わせるのに使う
  const SIT_Y = { m: 57.9, f: 61.1 };        // 椅子に座ったときの腰の高さ(cm)

  // ───────── 表情（顔のパーツの動かし具合。0〜1） ─────────
  P.MOODS = {
    neutral:   {},
    soft:      { smile: 0.28 },
    happy:     { smile: 0.8, squint: 0.08 },
    delighted: { smile: 1.05, jawOpen: 0.13, browOuterUp: 0.25 },
    curious:   { browOuterUp: 0.4, browInnerUp: 0.15, smile: 0.18 },
    thinking:  { browDown: 0.32, mouthPress: 0.4, squint: 0.15 },
    worried:   { browInnerUp: 0.75, frown: 0.4, mouthPress: 0.2 },
    annoyed:   { browDown: 0.8, frown: 0.5, squint: 0.3, mouthPress: 0.35 },
    surprised: { browOuterUp: 0.8, browInnerUp: 0.5, eyeWide: 0.7, jawOpen: 0.2 },
    sad:       { browInnerUp: 0.85, frown: 0.6 },
  };
  const FACE_KEYS = ['smile', 'frown', 'browDown', 'browInnerUp', 'browOuterUp', 'blink', 'squint', 'eyeWide', 'jawOpen', 'mouthPress', 'pucker', 'v_aa', 'v_ih', 'v_ou', 'v_ee', 'v_oh'];
  const VIS = ['v_aa', 'v_ih', 'v_ou', 'v_ee', 'v_oh'];

  // ───────── モーション ─────────
  // anims.js の中身：骨ごとの回転を一定間隔で記録したもの（16bit 整数）＋腰の位置。
  const quatTracks = {};      // モーション名 → 回転トラック（全員で共用）
  function tracksFor(key) {
    if (quatTracks[key]) return quatTracks[key];
    const c = A.meta.anims.clips[key], bin = A.buffers.anims, rot = new Int16Array(bin, c.rot[0], c.rot[1] / 2);
    const times = new Float32Array(c.frames); for (let i = 0; i < c.frames; i++) times[i] = i * c.dur / (c.frames - 1);
    const list = []; let o = 0;
    for (const [name, n] of c.bones) { const v = new Float32Array(n * 4); for (let k = 0; k < n * 4; k++) v[k] = rot[o + k] / 32767; o += n * 4; list.push({ bone: name, track: new T.QuaternionKeyframeTrack(name + '.quaternion', n === 1 ? [0] : times, v) }); }
    return quatTracks[key] = { c, times, list, pos: new Float32Array(bin, c.pos[0], c.pos[1] / 4) };
  }

  class Avatar {
    constructor(id, gltf, meta) {
      this.id = id; this.meta = meta; this.sex = meta.sex;
      this.root = new T.Group(); this.root.name = 'avatar_' + id;
      this.model = gltf.scene; this.scale = meta.h / meta.rawH; this.model.scale.setScalar(this.scale); this.root.add(this.model);
      this.meshes = []; this.morphMeshes = []; this.bones = {};
      this.model.traverse(o => {
        if (o.isBone || /^Bip01/.test(o.name)) this.bones[o.name] = o;   // 腰の親（Bip01）は骨扱いでないので名前でも拾う
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; this.meshes.push(o);
        const m = o.material; m.envMapIntensity = 0.9;
        if (/opacity/.test(m.name)) { m.transparent = false; m.alphaTest = 0.18; /* 細い前髪が「傷」のように見えないよう、しきい値は低め */ m.alphaToCoverage = JE.gfx.quality !== 'low'; m.side = T.DoubleSide; m.roughness = 0.55; }
        if (o.morphTargetDictionary) this.morphMeshes.push(o);
      });
      this.bip = this.bones.Bip01; this.bipY = this.bip.position.y;
      this.mixer = new T.AnimationMixer(this.model); this.actions = {}; this.base = null; this.cur = null; this.seated = false;
      this.face = {}; this.faceT = {}; for (const k of FACE_KEYS) { this.face[k] = 0; this.faceT[k] = 0; }
      this.mood = 'neutral'; this.blinkT = 1 + Math.random() * 3; this.blinkV = 0; this.speakT = 0; this.visT = 0; this.vis = {}; for (const k of VIS) this.vis[k] = 0; this.visTarget = Object.assign({}, this.vis);
      // 視線：頭・首・目の「まっすぐ前を向いた状態」を覚えておく
      this.gaze = null; this.gazeYaw = 0; this.gazePitch = 0; this.eyeYaw = 0; this.eyePitch = 0; this.gazeW = 0; this.jitter = new T.Vector3(); this.jitterT = 0; this.bob = null;
      this.model.updateMatrixWorld(true);
      const rq = new T.Quaternion();
      this.rest = {}; for (const k of ['Bip01_Head', 'Bip01_Neck', 'Bip01_LEye', 'Bip01_REye']) if (this.bones[k]) this.rest[k] = this.bones[k].getWorldQuaternion(new T.Quaternion()).premultiply(this.root.getWorldQuaternion(rq).invert());
      this.walk = null; this.eyeH = 0; this.updateEyeHeight();
      P.all.set(id, this);
    }
    updateEyeHeight() { const h = this.bones.Bip01_Head; this.model.updateMatrixWorld(true); this.eyeH = h ? h.getWorldPosition(new T.Vector3()).y - this.root.position.y + 0.09 * this.meta.h / 1.7 : this.meta.h * 0.93; }
    // 頭の位置（カメラや視線の目標に使う）
    headPos(out) { out = out || new T.Vector3(); const h = this.bones.Bip01_Head; h.getWorldPosition(out); out.y += 0.08 * this.meta.h / 1.7; return out; }

    // ── モーション ──
    clip(name) {
      const key = (A.meta.anims.clips[this.sex + '_' + name] ? this.sex : 'm') + '_' + name, src = A.meta.anims.clips[key];
      if (!src) return null;
      const t = tracksFor(key), tracks = [];
      for (const q of t.list) if (this.bones[q.bone]) tracks.push(q.track);
      // 腰の位置は、この人の体格に合わせて拡大・縮小する
      const k = this.bipY / REF[key[0]], pv = new Float32Array(t.pos.length);
      for (let i = 0; i < pv.length; i += 3) { pv[i] = t.pos[i] * k; pv[i + 1] = t.pos[i + 1] * k; pv[i + 2] = t.pos[i + 2] * k; }
      tracks.push(new T.VectorKeyframeTrack('Bip01.position', t.times, pv));
      const c = new T.AnimationClip(name, src.dur, tracks); c.userData = { travel: src.travel * 100 * k * this.scale, key };
      return c;
    }
    action(name) { if (!(name in this.actions)) { const c = this.clip(name); this.actions[name] = c ? this.mixer.clipAction(c) : null; if (c) this.actions[name]._clip = c; } return this.actions[name]; }
    _fadeTo(a, fade) {
      if (!a || a === this.cur) return;
      a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setEffectiveTimeScale(1); a.play();
      if (this.cur && !JE.fast && fade > 0) this.cur.crossFadeTo(a, fade, false); else if (this.cur) this.cur.stop();
      this.cur = a;
    }
    // くり返し続ける基本の動き（立って待つ・座る など）
    setBase(name, fade) { const a = this.action(name); if (!a) return this; a.setLoop(T.LoopRepeat, Infinity); a.clampWhenFinished = false; this.base = name; if (this._gestTimer) { this._gestTimer.cancelled = true; this._gestTimer = null; } this._fadeTo(a, fade == null ? 0.45 : fade); a.time = Math.random() * 2; return this; }
    // 1 回だけのしぐさ。終わったら基本の動きへ戻る
    gesture(name, o) {
      o = o || {}; const a = this.action(name); if (!a || JE.fast) return Promise.resolve();
      const fade = o.fade == null ? 0.35 : o.fade, dur = Math.min(o.max || 99, a._clip.duration);
      a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = true; this._fadeTo(a, fade);
      if (this._gestTimer) this._gestTimer.cancelled = true;
      const tk = this._gestTimer = { cancelled: false }, back = this.base;
      return JE.wait(Math.max(0.2, dur - fade)).then(() => { if (!tk.cancelled && this.base === back) { this.cur = a; this._fadeTo2(this.action(back), fade + 0.1); } }).catch(() => {});
    }
    _fadeTo2(a, fade) { if (!a) return; const prev = this.cur; a.reset(); a.setLoop(T.LoopRepeat, Infinity); a.enabled = true; a.setEffectiveWeight(1); a.play(); if (prev && prev !== a) prev.crossFadeTo(a, fade, false); this.cur = a; }

    // ── 立ち位置 ──
    place(x, y, z, ry) { this.seated = false; this.walk = null; this.root.position.set(x, y, z); this.root.rotation.y = ry || 0; return this; }
    sitAt(x, z, ry, seatH) {
      this.seated = true; this.walk = null;
      const sex = A.meta.anims.clips[this.sex + '_sit'] ? this.sex : 'm';
      const pelvis = SIT_Y[sex] * (this.bipY / REF[sex]) * this.scale, bottom = pelvis - 0.103 * this.meta.h / 1.72;
      this.root.position.set(x, Math.max(0, (seatH || 0.455) - bottom), z); this.root.rotation.y = ry || 0;
      return this.setBase('sit', 0);
    }
    // 歩いて移動する。pts は [[x,z], ...] の通り道。終わったら ry の向きを向く。
    async walkPath(pts, o) {
      o = o || {};
      if (JE.fast) { const p = pts[pts.length - 1]; this.root.position.x = p[0]; this.root.position.z = p[1]; if (o.y != null) this.root.position.y = o.y; if (o.ry != null) this.root.rotation.y = o.ry; return; }
      const name = o.clip || 'stroll', a = this.action(name); a.setLoop(T.LoopRepeat, Infinity); this._fadeTo(a, 0.3);
      const speed = a._clip.userData.travel / a._clip.duration;
      await new Promise((res) => { this.walk = { pts: pts.map(p => new T.Vector2(p[0], p[1])), i: 0, speed, res, y: o.y }; });
      this.walk = null;
      if (o.ry != null) this.turnTo(o.ry);
      this.setBase(o.then || this.base || 'idle', 0.4);
    }
    turnTo(ry, dur) { const from = this.root.rotation.y; let d = ry - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return JE.tween(dur == null ? 0.5 : dur, t => { this.root.rotation.y = from + d * t; }, JE.ease.sine, { keep: true }).catch(() => {}); }

    // ── 表情・しゃべり・視線 ──
    setMood(name, amount) { this.mood = name; const m = P.MOODS[name] || {}, k = amount == null ? 1 : amount; for (const key of FACE_KEYS) if (key !== 'blink' && key[0] !== 'v') this.faceT[key] = (m[key] || 0) * k; return this; }
    speak(sec) { this.speakT = Math.max(this.speakT, sec); return this; }
    stopSpeak() { this.speakT = 0; }
    // target: 'camera' / Avatar / Vector3 / null
    lookAt(target) { this.gaze = target; return this; }
    nod(times) { this.bob = { type: 'nod', t: 0, dur: 0.55 * (times || 2), n: times || 2 }; return this; }
    shake(times) { this.bob = { type: 'shake', t: 0, dur: 0.6 * (times || 2), n: times || 2 }; return this; }
    tilt() { this.bob = { type: 'tilt', t: 0, dur: 1.6, n: 1 }; return this; }

    update(dt) {
      // 歩行
      const w = this.walk;
      if (w) {
        const p = this.root.position, tgt = w.pts[w.i], dx = tgt.x - p.x, dz = tgt.y - p.z, d = Math.hypot(dx, dz), step = w.speed * dt;
        if (d <= step * 1.2) { p.x = tgt.x; p.z = tgt.y; if (++w.i >= w.pts.length) { const res = w.res; this.walk = null; res(); } }
        else { p.x += dx / d * step; p.z += dz / d * step; let want = Math.atan2(dx, dz), cur = this.root.rotation.y, dd = want - cur; while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2; this.root.rotation.y = cur + dd * Math.min(1, dt * 7); }
        if (w.y != null) p.y += (w.y - p.y) * Math.min(1, dt * 5);
      }
      this.mixer.update(dt);
      this._updateFace(dt);
      this._updateGaze(dt);
    }
    _updateFace(dt) {
      const f = this.face, k = Math.min(1, dt * 5.5);
      for (const key of FACE_KEYS) if (key !== 'blink' && key[0] !== 'v') f[key] += (this.faceT[key] - f[key]) * k;
      // まばたき
      this.blinkT -= dt; if (this.blinkT <= 0) { this.blinkV = 1; this.blinkT = 2 + Math.random() * 4; if (Math.random() < 0.18) this.blinkT = 0.28; }
      if (this.blinkV > 0) this.blinkV = Math.max(0, this.blinkV - dt * 7.5);
      f.blink = Math.sin(Math.min(1, this.blinkV) * Math.PI);
      // 口の動き（話している間だけ、母音の形をつぎつぎ切り替える）
      let jaw = 0;
      if (this.speakT > 0) { this.speakT -= dt; this.visT -= dt; if (this.visT <= 0) { this.visT = 0.07 + Math.random() * 0.09; for (const v of VIS) this.visTarget[v] = 0; if (Math.random() > 0.16) this.visTarget[VIS[Math.floor(Math.random() * VIS.length)]] = 0.45 + Math.random() * 0.5; } }
      else for (const v of VIS) this.visTarget[v] = 0;
      for (const v of VIS) { this.vis[v] += (this.visTarget[v] - this.vis[v]) * Math.min(1, dt * 22); f[v] = this.vis[v]; jaw += this.vis[v] * 0.12; }
      const out = Object.assign({}, f); out.jawOpen = f.jawOpen + jaw; out.smile = f.smile * (this.speakT > 0 ? 0.8 : 1);
      for (const m of this.morphMeshes) { const d = m.morphTargetDictionary, inf = m.morphTargetInfluences; for (const key of FACE_KEYS) if (key in d) inf[d[key]] = out[key]; }
    }
    _updateGaze(dt) {
      const head = this.bones.Bip01_Head, neck = this.bones.Bip01_Neck; if (!head || !neck) return;
      const R = Avatar._r;
      this.model.updateMatrixWorld(true);
      this.root.getWorldQuaternion(R.rootQ); R.rootQi.copy(R.rootQ).invert();
      let wantYaw = 0, wantPitch = 0, errYaw = 0, errPitch = 0, has = false;
      const tgt = this.gaze === 'camera' ? JE.cam.camera.position : this.gaze && this.gaze.isVector3 ? this.gaze : this.gaze && this.gaze.headPos ? this.gaze.headPos(R.v2) : null;
      if (tgt && !this.walk) {
        has = true;
        // ときどき視線を少しだけずらす（じっと見つめ続けると不自然なので）
        this.jitterT -= dt; if (this.jitterT <= 0) { this.jitterT = 1.2 + Math.random() * 2.6; this.jitter.set((Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.16); }
        head.getWorldPosition(R.hp); R.d.copy(tgt).add(this.jitter).sub(R.hp).applyQuaternion(R.rootQi).normalize();
        head.getWorldQuaternion(R.hq); R.f.set(0, 0, 1).applyQuaternion(R.q.copy(R.rootQi).multiply(R.hq).multiply(R.q2.copy(this.rest.Bip01_Head).invert()));
        const yawD = Math.atan2(R.d.x, R.d.z), pitchD = Math.asin(JE.clamp(R.d.y, -1, 1)), yawF = Math.atan2(R.f.x, R.f.z), pitchF = Math.asin(JE.clamp(R.f.y, -1, 1));
        let dy = yawD - yawF; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        wantYaw = JE.clamp(dy, -1.0, 1.0) * 0.82; wantPitch = JE.clamp(pitchD - pitchF, -0.5, 0.5) * 0.8;
        errYaw = JE.clamp(dy - wantYaw, -0.45, 0.45); errPitch = JE.clamp(pitchD - pitchF - wantPitch, -0.3, 0.3);
      }
      const k = Math.min(1, dt * (has ? 4.2 : 3));
      this.gazeYaw += (wantYaw - this.gazeYaw) * k; this.gazePitch += (wantPitch - this.gazePitch) * k;
      this.eyeYaw += (errYaw - this.eyeYaw) * Math.min(1, dt * 12); this.eyePitch += (errPitch - this.eyePitch) * Math.min(1, dt * 12);
      // うなずき・首ふり・首をかしげる
      let bobYaw = 0, bobPitch = 0, bobRoll = 0;
      if (this.bob) { const b = this.bob; b.t += dt; const u = b.t / b.dur; if (u >= 1) this.bob = null; else { const env = Math.sin(u * Math.PI); if (b.type === 'nod') bobPitch = -Math.abs(Math.sin(u * Math.PI * b.n)) * 0.2 * env - 0.02 * env; else if (b.type === 'shake') bobYaw = Math.sin(u * Math.PI * 2 * b.n) * 0.2 * env; else bobRoll = 0.16 * env; } }
      const yaw = this.gazeYaw + bobYaw, pitch = this.gazePitch + bobPitch;
      if (Math.abs(yaw) < 1e-4 && Math.abs(pitch) < 1e-4 && Math.abs(bobRoll) < 1e-4 && Math.abs(this.eyeYaw) < 1e-4) return;
      // 首に 35%、頭に 65% を振り分けて回す
      const add = (y, p, r) => R.add.setFromEuler(R.e.set(-p, y, r || 0, 'YXZ')).premultiply(R.rootQ).multiply(R.rootQi);
      neck.parent.getWorldQuaternion(R.pq); neck.getWorldQuaternion(R.nq); head.getWorldQuaternion(R.hq);
      add(yaw * 0.35, pitch * 0.35, bobRoll * 0.3); R.nq.premultiply(R.add); neck.quaternion.copy(R.pq.invert()).multiply(R.nq);
      R.hq.premultiply(R.add); add(yaw * 0.65, pitch * 0.65, bobRoll * 0.7); R.hq.premultiply(R.add); head.quaternion.copy(R.q.copy(R.nq).invert()).multiply(R.hq);
      // 目だけで追いかける分
      for (const key of ['Bip01_LEye', 'Bip01_REye']) { const eye = this.bones[key]; if (!eye) continue; R.eq.copy(R.hq).multiply(R.q.copy(this.rest.Bip01_Head).invert()).multiply(this.rest[key]); add(this.eyeYaw, this.eyePitch); R.eq.premultiply(R.add); eye.quaternion.copy(R.q.copy(R.hq).invert()).multiply(R.eq); }
    }
    dispose() { P.all.delete(this.id); if (this.root.parent) this.root.parent.remove(this.root); }
  }
  Avatar._r = { rootQ: new T.Quaternion(), rootQi: new T.Quaternion(), hp: new T.Vector3(), d: new T.Vector3(), f: new T.Vector3(), hq: new T.Quaternion(), nq: new T.Quaternion(), pq: new T.Quaternion(), eq: new T.Quaternion(), q: new T.Quaternion(), q2: new T.Quaternion(), add: new T.Quaternion(), e: new T.Euler(), v2: new T.Vector3() };
  P.Avatar = Avatar;

  // 人物を用意する（同じ人は使い回す）。先に JE.assets.need(['anims','avatar:xxx']) を済ませておくこと。
  const loader = new T.GLTFLoader();
  P.create = async (id) => {
    if (P.all.has(id)) return P.all.get(id);
    const gltf = await loader.parseAsync(A.buffers['avatar:' + id], '');
    return new Avatar(id, gltf, A.meta['avatar:' + id]);
  };
  P.get = (id) => P.all.get(id);
  // お客様の反応（表情＋しぐさ）。kind: great / good / neutral / bad / terrible
  P.react = (a, kind) => {
    if (kind === 'great') { a.setMood('delighted'); a.nod(3); if (!a.seated) a.gesture(Math.random() < 0.5 ? 'nod2' : 'listen_excited', { max: 3.2 }); }
    else if (kind === 'good') { a.setMood('happy'); a.nod(2); if (!a.seated && Math.random() < 0.6) a.gesture('nod', { max: 3 }); }
    else if (kind === 'neutral') { a.setMood('soft'); if (Math.random() < 0.5) a.nod(1); }
    else if (kind === 'bad') { a.setMood('worried'); a.tilt(); a.gesture(a.seated ? 'sit_touch_face' : 'touch_face', { max: 4 }); }
    else if (kind === 'terrible') { a.setMood('annoyed'); a.shake(2); a.gesture(a.seated ? 'sit_shrug' : 'deny', { max: 3.2 }); }
  };
  JE.updaters.add((dt) => { for (const a of P.all.values()) if (a.root.parent && a.root.visible) a.update(dt); });
})();
