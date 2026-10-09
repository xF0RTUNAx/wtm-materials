// Звук «Симулятора Летки» — синтез в Web Audio без звуковых файлов.
// Реактивный двигатель собран из тех же составляющих, что и настоящий:
//   • рёв выхлопа — широкополосный «розовый» шум, чем больше тяга, тем выше и громче;
//   • низкий гул — «коричневый» шум ниже 200 Гц (им «давит» форсаж);
//   • вой турбины — узкие полосы шума и неровные обертоны на частоте лопаток (2–4 кГц), сильнее спереди;
//   • высокое шипение струи и треск форсажа (редкие импульсы) — сильнее сзади;
//   • обороты раскручиваются и сбрасываются с запаздыванием, как у турбины.
// Никаких «пил» на сотнях герц — именно они давали звук квадрокоптера.
// Чужие самолёты и ракеты — объёмные голоса (HRTF, эффект Доплера, поглощение высоких частот воздухом).
// Взрывы слышны с задержкой по скорости звука; бортовые сигналы (СПО, захват, ГСН) идут через «гарнитуру».

export function createAudio() {
  let ctx = null, master = null, out = null, reverbIn = null, avionics = null, engBus = null, engVerb = null;
  let muted = false, volume = 1;
  const B = {};     // буферы шумов
  const E = {};     // слои двигателя и окружения
  const voices = [];
  let rpm = 0.55, crackleT = 0, spatialT = 0;
  const spatialWant = [];
  const now = () => ctx.currentTime;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const set = (p, v, tc = 0.06) => { p.setTargetAtTime(v, now(), tc); };

  // ── буферы: белый, розовый, коричневый шум и «треск» ──
  function makeBuffers() {
    const sr = ctx.sampleRate, n = sr * 3;
    const mk = (fill) => { const b = ctx.createBuffer(1, n, sr); fill(b.getChannelData(0)); return b; };
    B.white = mk((d) => { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; });
    B.pink = mk((d) => { // фильтр Келлета
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    });
    B.brown = mk((d) => { let l = 0; for (let i = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    B.crackle = mk((d) => { // редкие резкие импульсы разной силы — «хлопки» несгоревшего топлива в форсаже
      const dec = Math.exp(-1 / (0.0009 * sr)); let env = 0, sg = 1;
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.0022) { const a = Math.random(); env = Math.max(env, a * a * (Math.random() < 0.12 ? 1 : 0.45)); sg = Math.random() < 0.5 ? -1 : 1; }
        d[i] = env * (0.6 * sg + 0.4 * (Math.random() * 2 - 1)); env *= dec;
      }
    });
  }
  function src(buf, rate = 1) {
    const s = ctx.createBufferSource(); s.buffer = B[buf]; s.loop = true; s.playbackRate.value = rate;
    s.start(0, Math.random() * 2.5); return s; // случайное начало — голоса не совпадают по фазе
  }
  const filt = (type, f, q = 0.7, gain = 0) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; if (gain) x.gain.value = gain; return x; };
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      makeBuffers();
      // шина: громкость → мягкий компрессор → выход; общая реверберация (сгенерированный импульс «открытого пространства»)
      out = gain(muted ? 0 : volume); master = ctx.createDynamicsCompressor(); master.threshold.value = -16; master.ratio.value = 3.5; master.knee.value = 12;
      chain(out, master, ctx.destination);
      const conv = ctx.createConvolver(), ir = ctx.createBuffer(2, ctx.sampleRate * 2.6, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3.6) * (i < 400 ? i / 400 : 1); }
      conv.buffer = ir; reverbIn = gain(0.55); chain(reverbIn, filt('lowpass', 3500), conv, out);
      // «гарнитура»: бортовые сигналы звучат как из наушника, а не как игрушка
      avionics = chain(gain(1), filt('highpass', 350), filt('peaking', 1800, 0.9, 5)); avionics.connect(out);
      buildEngine(); buildEnv(); buildVoices();
    } catch (_) { ctx = null; }
  }

  // ── двигатель игрока ──
  function buildEngine() {
    engBus = gain(0); engBus.connect(out); engVerb = gain(0.06); engBus.connect(engVerb); engVerb.connect(reverbIn);
    E.roarF = filt('bandpass', 400, 0.55); E.roarG = gain(); chain(src('pink'), E.roarF, filt('peaking', 180, 0.8, 4), E.roarG, engBus);
    E.rumbF = filt('lowpass', 160, 0.5); E.rumbG = gain(); chain(src('brown', 0.9), E.rumbF, E.rumbG, engBus);
    E.hissG = gain(); chain(src('white'), filt('highpass', 2800, 0.5), filt('lowpass', 8500, 0.5), E.hissG, engBus);
    E.crackSrc = src('crackle'); E.crackG = gain(); chain(E.crackSrc, filt('highpass', 160, 0.6), filt('peaking', 650, 0.8, 3), filt('lowpass', 1900, 0.5), E.crackG, engBus); // «хлопки» без скрежета: верх срезан
    // вой турбины: две узкие полосы шума на частоте лопаток + два неровных обертона с дрожанием
    E.whineG = gain(); E.whineG.connect(engBus);
    E.wBand1 = filt('bandpass', 3000, 22); E.wBand2 = filt('bandpass', 4400, 18);
    chain(src('white', 1.03), E.wBand1, gain(2.2), E.whineG); chain(src('white', 0.97), E.wBand2, gain(1.6), E.whineG);
    const vib = ctx.createOscillator(); vib.frequency.value = 6.3; const vibG = gain(5); vib.connect(vibG); vib.start();
    E.wOsc = [[1, 'sine', 0.05], [1.47, 'sine', 0.03], [0.29, 'triangle', 0.022]].map(([k, type, v]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 3000 * k; vibG.connect(o.frequency);
      const g = gain(v); chain(o, g, E.whineG); o.start(); return { o, k };
    });
    // сверхзвук: низкий гул корпуса (владелец оценил — оставлен как был)
    E.supG = gain(); for (const [f, type] of [[46, 'triangle'], [69.5, 'sine']]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; chain(o, E.supG, engBus); o.start(); }
    // обтекание: мягкий шум, медленно «дышит»; тряска на перегрузке — очень низкий гул
    E.windF = filt('lowpass', 700, 0.3); E.windG = gain(); chain(src('pink', 0.8), E.windF, filt('peaking', 420, 0.7, 4), E.windG, out);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23; E.windLfo = gain(0); chain(lfo, E.windLfo); E.windLfo.connect(E.windG.gain); lfo.start();
    E.buffG = gain(); chain(src('brown', 0.6), filt('lowpass', 75, 0.8), E.buffG, out);
    // пушка: шум, «нарезанный» прямоугольником ~62 Гц — характерное «бррррт» многоствольной пушки
    E.gunG = gain(); const gate = gain(0.5); const sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = 62; const depth = gain(0.5); chain(sq, depth); depth.connect(gate.gain); sq.start();
    const gunMix = gain(1); chain(src('white', 1.2), filt('lowpass', 2600, 0.6), gunMix); chain(src('brown'), filt('lowpass', 220, 0.7), gain(2.5), gunMix);
    chain(gunMix, gate, E.gunG, out); const gv = gain(0.35); E.gunG.connect(gv); gv.connect(reverbIn);
    // ИК-ГСН: «рычание» в наушнике
    E.growlO = ctx.createOscillator(); E.growlO.type = 'triangle'; E.growlO.frequency.value = 400; E.growlG = gain(); chain(E.growlO, E.growlG, avionics); E.growlO.start();
  }
  // ── окружение: дождь по обшивке, ветер у земли ──
  function buildEnv() {
    E.rainG = gain(); chain(src('white', 1.1), filt('bandpass', 1500, 0.4), filt('lowpass', 3200), E.rainG, out);
    E.rainDrum = gain(); chain(src('crackle', 0.35), filt('bandpass', 900, 0.7), E.rainDrum, out); // отдельные капли по фюзеляжу
    E.groundG = gain(); chain(src('brown', 1.4), filt('lowpass', 260, 0.6), E.groundG, out);  // «рёв отражается от земли» на малой высоте
  }

  // ── объёмные голоса: самолёты, ракеты, пролёты в лобби ──
  function buildVoices() {
    for (let i = 0; i < 6; i++) {
      const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 140; pan.maxDistance = 30000; pan.rolloffFactor = 1.1;
      const air = filt('lowpass', 8000, 0.5), g = gain(); chain(air, g, pan, out);
      const roarF = filt('bandpass', 350, 0.6), roarG = gain(1); chain(src('pink', 0.95 + i * 0.02), roarF, roarG, air);
      const rumbG = gain(0.8); chain(src('brown', 0.9 + i * 0.03), filt('lowpass', 170, 0.6), rumbG, air);
      const whF = filt('bandpass', 2600, 12), whG = gain(0); chain(src('white', 1 + i * 0.01), whF, whG, air);
      const crG = gain(0); chain(src('crackle', 0.55 + i * 0.04), filt('highpass', 180), filt('lowpass', 1900, 0.5), crG, air);
      voices.push({ pan, air, g, roarF, roarG, rumbG, whF, whG, crG, o: null });
    }
  }
  // listener — камера; cands — [{ o, kind: 'jet'|'boss'|'msl', pos, vel, fwd?, ab? }]; lvel — скорость слушателя
  function spatial(dt, camera, lvel, cands, active) {
    if (!ctx) return;
    const L = ctx.listener, cp = camera.position, e = camera.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (L.positionX) { L.positionX.value = cp.x; L.positionY.value = cp.y; L.positionZ.value = cp.z; L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz; }
    else { L.setPosition(cp.x, cp.y, cp.z); L.setOrientation(fx, fy, fz, ux, uy, uz); }
    spatialT -= dt;
    if (spatialT <= 0) { // раз в 0,25 с: голоса — ближайшим источникам
      spatialT = 0.25;
      // ближайшие источники (без сортировки и новых массивов: голосов всего 6)
      const want = spatialWant; want.length = 0;
      for (const c of cands) {
        const d = c.pos.distanceTo(cp); if (d > (c.kind === 'msl' ? 4000 : 12000)) continue;
        c._d = d; let i = want.length; while (i > 0 && want[i - 1]._d > d) i--;
        if (i < voices.length) { want.splice(i, 0, c); if (want.length > voices.length) want.pop(); }
      }
      // голос помнит сам источник (v.o), а не запись о нём: записи переиспользуются каждый кадр
      for (const v of voices) if (v.o) { let keep = false; for (const w of want) if (w.o === v.o) { keep = true; break; } if (!keep) { v.o = null; set(v.g.gain, 0, 0.15); } }
      for (const w of want) { let v = null; for (const x of voices) if (x.o === w.o) { v = x; break; } if (!v) for (const x of voices) if (!x.o) { v = x; break; } if (v) v.o = w.o; }
    }
    for (const v of voices) {
      let c = null; if (v.o) for (const x of cands) if (x.o === v.o) { c = x; break; }
      if (!c || !active || muted) { if (v.o) set(v.g.gain, 0, 0.1); if (!c) v.o = null; continue; }
      const p = c.pos;
      if (v.pan.positionX) { v.pan.positionX.value = p.x; v.pan.positionY.value = p.y; v.pan.positionZ.value = p.z; } else v.pan.setPosition(p.x, p.y, p.z);
      const dx = cp.x - p.x, dy = cp.y - p.y, dz = cp.z - p.z, d = Math.hypot(dx, dy, dz) || 1;
      const ax = dx / d, ay = dy / d, az = dz / d;
      const approach = (c.vel.x * ax + c.vel.y * ay + c.vel.z * az) - (lvel ? lvel.x * ax + lvel.y * ay + lvel.z * az : 0);
      const dop = clamp(343 / (343 - clamp(approach, -320, 320)), 0.5, 2.6);
      set(v.air.frequency, 250 + 9000 * Math.exp(-d / 2200)); // воздух «съедает» верх с расстоянием
      if (c.kind === 'msl') { // ракетный двигатель: жёсткий шипящий рёв
        set(v.roarF.frequency, 1300 * dop); v.roarF.Q.value = 0.45; set(v.roarG.gain, 1.6); set(v.rumbG.gain, 0.3);
        set(v.whF.frequency, 4200 * dop); v.whF.Q.value = 1.2; set(v.whG.gain, 1.2); set(v.crG.gain, 0.6); set(v.g.gain, 0.55);
      } else {
        const big = c.kind === 'boss';
        // спереди слышнее вой компрессора, сзади — рёв струи и треск форсажа
        const front = c.fwd ? clamp((c.fwd.x * ax + c.fwd.y * ay + c.fwd.z * az + 1) / 2, 0, 1) : 0.5;
        set(v.roarF.frequency, (big ? 220 : 380) * dop * (c.ab ? 0.8 : 1)); v.roarF.Q.value = 0.6;
        set(v.roarG.gain, (0.7 + 0.6 * (1 - front)) * (c.ab ? 1.6 : 1)); set(v.rumbG.gain, big ? 1.4 : 0.8 + (c.ab ? 0.6 : 0));
        set(v.whF.frequency, (big ? 1900 : 2700) * dop); v.whF.Q.value = 12; set(v.whG.gain, 1.8 * front * front + 0.2);
        set(v.crG.gain, c.ab ? 0.45 * (1 - front) : 0); set(v.g.gain, (big ? 1.3 : 0.9) * (c.gain || 1));
      }
    }
  }

  // Каждый кадр: s = { on, rpmTarget, ab, speed, mach, sup, n, rear (0 — камера спереди, 1 — сзади), agl, rain, lobby }
  function frame(dt, s) {
    if (!ctx) return;
    if (!s.on || muted) { set(engBus.gain, 0, 0.08); for (const k of ['windG', 'buffG', 'rainG', 'rainDrum', 'groundG', 'gunG', 'growlG']) set(E[k].gain, 0, 0.08); E.windLfo.gain.value = 0; return; }
    rpm += (s.rpmTarget - rpm) * Math.min(1, (s.rpmTarget > rpm ? 0.8 : 1.2) * dt); // раскрутка турбины с запаздыванием
    const r = rpm, rear = s.rear, front = 1 - rear, sup = s.sup, ab = s.ab;
    set(engBus.gain, s.lobby ? 3 : 4, 0.2); // слои намеренно «тихие» по отдельности — общий уровень задаёт шина
    // рёв и гул: растут с оборотами, форсаж опускает спектр и добавляет «давление»
    set(E.roarF.frequency, sup ? 190 : (ab ? 260 : 170 + 620 * r * r));
    set(E.roarG.gain, (sup ? 0.05 : 0.018 + 0.07 * r * r * r + (ab ? 0.05 : 0)) * (0.45 + 0.55 * rear), 0.12);
    set(E.rumbF.frequency, 120 + 90 * r); set(E.rumbG.gain, (0.025 + 0.05 * r * r + (ab ? 0.09 : 0)) * (sup ? 0.7 : 1));
    set(E.hissG.gain, sup ? 0.002 : (0.002 + 0.013 * Math.pow(r, 4)) * (0.3 + 0.7 * rear) * (ab ? 0.45 : 1)); // на форсаже шипение тише — главное низ
    set(E.crackG.gain, sup ? 0 : (ab ? 0.028 : r > 0.97 ? 0.006 : 0) * (0.35 + 0.65 * rear), 0.2);
    crackleT -= dt; if (crackleT <= 0) { crackleT = 0.5 + Math.random() * 0.7; set(E.crackSrc.playbackRate, 0.5 + Math.random() * 0.3, 0.3); }
    // вой турбины: частота лопаток по оборотам, спереди громче; на сверхзвуке почти не слышен
    const f = 1700 + 2300 * r;
    set(E.wBand1.frequency, f, 0.1); set(E.wBand2.frequency, f * 1.47, 0.1);
    for (const w of E.wOsc) set(w.o.frequency, f * w.k, 0.1);
    set(E.whineG.gain, (sup ? 0.12 : 0.28 + 0.9 * front) * (0.036 + 0.04 * r) * (ab ? 0.7 : 1));
    set(E.supG.gain, sup ? 0.035 : 0, 0.3);
    // обтекание: громче с квадратом скорости; на сверхзвуке — главный, мягко «дышит»
    const v = s.speed, m = s.mach || 0;
    E.windF.frequency.value = sup ? 520 + clamp(m - 1, 0, 1) * 300 : 380 + clamp(v / 400, 0, 1) * 900;
    set(E.windG.gain, (sup ? 0.05 + clamp(m - 1, 0, 0.8) * 0.03 : 0.004 + clamp(v / 420, 0, 1.3) ** 2 * 0.03) * 1.6);
    E.windLfo.gain.value = sup ? 0.015 : 0.004;
    set(E.buffG.gain, clamp((s.n - 6) * 0.025, 0, 0.1) + (m > 0.95 && m < 1.05 ? 0.05 : 0));
    // у земли рёв отражается: гул и реверберация сильнее
    const low = s.agl !== undefined ? clamp(1 - s.agl / 300, 0, 1) : 0;
    set(E.groundG.gain, low * 0.05 * clamp(v / 250, 0, 1.5)); set(engVerb.gain, 0.06 + 0.3 * low, 0.2);
    set(E.rainG.gain, s.rain * 0.04, 0.3); set(E.rainDrum.gain, s.rain * 0.05, 0.3);
  }

  // ── разовые звуки ──
  function burst(buf, dur, vol, type, freq, q = 0.7, when = 0, wet = 0, dest = out, att = 0.008) {
    if (!ctx || muted) return;
    const t0 = now() + when, s = ctx.createBufferSource(); s.buffer = B[buf]; s.loop = true;
    const f = filt(type, freq, q), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    chain(s, f, g, dest); if (wet) { const w = gain(wet); g.connect(w); w.connect(reverbIn); }
    s.start(t0, Math.random() * 2); s.stop(t0 + dur + 0.05); return f;
  }
  function osc(type, f0, f1, dur, vol, when = 0, wet = 0, dest = out) {
    if (!ctx || muted) return;
    const t0 = now() + when, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    chain(o, g, dest); if (wet) { const w = gain(wet); g.connect(w); w.connect(reverbIn); } o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const A = {
    init, frame, spatial,
    get ready() { return !!ctx; },
    // для отладки: анализатор на общей шине (уровни и спектр)
    tap() { if (!ctx) return null; const an = ctx.createAnalyser(); an.fftSize = 4096; out.connect(an); return an; },
    get state() { return ctx ? ctx.state : 'none'; },
    get muted() { return muted; },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (out) set(out.gain, m ? 0 : volume, 0.05); },
    setVolume(v) { volume = v; if (out && !muted) set(out.gain, v, 0.05); },
    silence() { if (!ctx) return; frame(0, { on: false }); for (const v of voices) set(v.g.gain, 0, 0.05); },
    // бортовой сигнал (СПО, захват, отсчёт) — через «гарнитуру»
    beep(freq, dur, type = 'square', vol = 0.05, slide = 0) {
      if (!ctx || muted) return;
      const t0 = now(), o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
      g.gain.setValueAtTime(vol, t0); g.gain.setValueAtTime(vol, t0 + Math.max(0, dur - 0.02)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      chain(o, g, avionics); o.start(t0); o.stop(t0 + dur + 0.02);
    },
    growl(level, freq) { if (!ctx) return; E.growlG.gain.value = muted ? 0 : level; E.growlO.frequency.value = freq; },
    gun(on) { if (ctx) set(E.gunG.gain, on && !muted ? 0.36 : 0, on ? 0.008 : 0.05); }, // громче прежнего (было 0,22)
    // пуск своей ракеты: хлопок пиропатрона, рёв двигателя уходит вперёд и выше (полоса «съезжает»)
    launch() {
      burst('brown', 0.35, 0.35, 'lowpass', 180, 0.7); burst('white', 0.08, 0.18, 'highpass', 1200, 0.7);
      const f = burst('pink', 2.2, 0.28, 'bandpass', 2400, 0.5, 0.03, 0.4, out, 0.05); if (f) f.frequency.exponentialRampToValueAtTime(500, now() + 2.2);
      burst('white', 1.4, 0.06, 'highpass', 3500, 0.5, 0.03);
    },
    // взрыв на расстоянии d (м): слышен с задержкой d/343 (не больше 2,5 с), вдали — глухой и гулкий
    explosion(d, size = 1) {
      if (!ctx || muted) return;
      const k = clamp(350 / (d + 350), 0.03, 1) * Math.min(1.6, 0.6 + size * 0.25), delay = Math.min(2.5, d / 343), cut = 250 + 5000 * Math.exp(-d / 900), wet = 0.4 + 0.5 * (1 - k);
      if (d < 1500) burst('white', 0.06, 0.4 * k, 'highpass', 1200, 0.6, delay);
      burst('brown', 1.2 + size * 0.35, 0.55 * k, 'lowpass', Math.min(cut, 900), 0.6, delay, wet);
      burst('pink', 0.9 + size * 0.2, 0.35 * k, 'lowpass', cut, 0.5, delay + 0.01, wet);
      osc('sine', 60, 26, 0.9 + size * 0.2, 0.5 * k, delay, 0.3);
      if (d < 800) burst('crackle', 1.1, 0.7 * k, 'bandpass', 1800, 0.6, delay + 0.08); // разлёт обломков
    },
    // попадание по дрону: металлический удар (негармонические обертоны) + глухой толчок
    hit() {
      burst('white', 0.12, 0.3, 'bandpass', 2200, 1.2); burst('brown', 0.35, 0.4, 'lowpass', 160);
      for (const [f, v] of [[523, 0.07], [1311, 0.05], [2267, 0.035], [3120, 0.02]]) osc('sine', f, f * 0.97, 0.45, v);
    },
    flare() { burst('brown', 0.14, 0.25, 'lowpass', 260); burst('white', 0.5, 0.07, 'bandpass', 3200, 0.8, 0.02); },
    chaff() { burst('brown', 0.1, 0.16, 'lowpass', 300); burst('white', 0.25, 0.05, 'lowpass', 5000, 0.5, 0.01); },
    // включение форсажа: глухой «вдох» и хлопок
    afterburner() { burst('brown', 0.9, 0.32, 'lowpass', 200, 0.8, 0, 0.3, out, 0.05); burst('pink', 0.5, 0.05, 'lowpass', 700, 0.7, 0.02, 0, out, 0.04); }, // мягкий «вдох», без щелчка
    // «Ударная волна» N-образной формы: два глухих удара ~0,12 с друг от друга, с эхом (без изменений)
    boom(vol = 0.3) {
      for (const [dt, v] of [[0, 1], [0.12, 0.75]]) { burst('white', 0.9, vol * v, 'lowpass', 180, 0.7, dt, 0.7, out, 0.012); osc('sine', 62, 34, 0.7, vol * v * 0.9, dt, 0.5); }
    },
    subsonic() { burst('pink', 1.2, 0.05, 'lowpass', 800, 0.7, 0, 0.4); },
    // гром: треск разряда (если близко), затем несколько раскатов, отражённых от холмов
    thunder(power) {
      if (power > 0.75) burst('white', 0.3, 0.2 * power, 'lowpass', 2600, 0.7, 0, 0.4);
      for (let i = 0; i < 4; i++) burst('brown', 1.4 + Math.random() * 1.6, (0.4 - i * 0.07) * power, 'lowpass', 90 + Math.random() * 160, 0.7, (power > 0.75 ? 0.08 : 0.2) + i * (0.3 + Math.random() * 0.5), 0.9, out, 0.08);
    },
    chime() { osc('triangle', 660, 660, 0.12, 0.07, 0, 0, avionics); osc('triangle', 990, 990, 0.16, 0.07, 0.07, 0, avionics); },
    // кирпичи для других игр на этом звуке («Воздушное превосходство»): шумовой и тональный всплеск; avio — через «гарнитуру»
    noise(buf, dur, vol, type, freq, q = 0.7, when = 0, wet = 0, avio = false, att = 0.008) { return burst(buf, dur, vol, type, freq, q, when, wet, avio ? avionics : out, att); },
    tone(type, f0, f1, dur, vol, when = 0, wet = 0, avio = false) { osc(type, f0, f1, dur, vol, when, wet, avio ? avionics : out); },
  };
  return A;
}
