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

// Экономный звук (слабый или «придушенный» процессор: на Android при низком заряде частоты снижаются, синтез не успевает —
// треск и обрывы): вдвое ниже частота дискретизации, больший буфер вывода, короткая моно-реверберация, панорама без HRTF.
// Включается сам при заряде ≤ 35 % без зарядки (Battery API — Chrome / Android) или вручную: localStorage fortuna_audio_eco = '1' / '0'.
let ECO = null; // null — ещё не знаем (решится к первому касанию)
try { const v = localStorage.getItem('fortuna_audio_eco'); if (v === '1' || v === '0') ECO = v === '1'; } catch (_) { /* приватный режим */ }
if (ECO === null && navigator.getBattery) navigator.getBattery().then((b) => { if (ECO === null) ECO = !b.charging && b.level <= 0.35; }).catch(() => {});
// выбор в «Настройках»: 'auto' | 'on' | 'off' (применяется при следующем запуске игры — звук пересоздаётся при загрузке)
export function audioEcoMode() { try { const v = localStorage.getItem('fortuna_audio_eco'); return v === '1' ? 'on' : v === '0' ? 'off' : 'auto'; } catch (_) { return 'auto'; } }
export function setAudioEcoMode(m) { try { if (m === 'auto') localStorage.removeItem('fortuna_audio_eco'); else localStorage.setItem('fortuna_audio_eco', m === 'on' ? '1' : '0'); } catch (_) { /* нет */ } }
export const ECO_SELECT = (id) => `<label class="chk">Звук для слабого устройства <select id="${id}">${[['auto', 'авто (при заряде ≤ 35 %)'], ['on', 'включён — если трещит'], ['off', 'выключен']].map(([k, n]) => `<option value="${k}" ${audioEcoMode() === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label><p class="hint">Меньше нагрузка на процессор: убирает треск и обрывы на планшетах и телефонах в режиме экономии. Применится после перезапуска игры.</p>`;
export function createAudio() {
  let ctx = null, master = null, out = null, reverbIn = null, avionics = null, engBus = null, engVerb = null;
  let muted = false, volume = 1;
  const B = {};     // буферы шумов
  const E = {};     // слои двигателя и окружения
  const voices = [];
  // записанные звуки (файлы): имя → { url, buf }; грузятся после создания контекста. prop — петля мотора дрона в голосах
  const SAMPLES = {}; let propSample = null;
  function loadSample(name, url) {
    const S0 = SAMPLES[name] = SAMPLES[name] || { url, buf: null, busy: false };
    if (!ctx || S0.buf || S0.busy) return;
    S0.busy = true;
    fetch(url).then((r) => r.arrayBuffer()).then((ab) => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)))
      .then((b) => { S0.buf = b; if (name === propSample) attachProp(); }).catch(() => { S0.busy = false; });
  }
  // петля мотора дрона в каждом голосе: свой сдвиг начала и чуть разные обороты — повтор не слышен, дроны звучат по-разному
  function attachProp() {
    const S0 = SAMPLES[propSample]; if (!S0 || !S0.buf) return;
    for (const v of voices) {
      if (v.ps) continue;
      const s0 = ctx.createBufferSource(); s0.buffer = S0.buf; s0.loop = true; v.psRate = 0.95 + Math.random() * 0.1; s0.playbackRate.value = v.psRate;
      v.psG = gain(0); chain(s0, v.psG, v.air); s0.start(0, Math.random() * S0.buf.duration); v.ps = s0;
    }
  }
  // записанные петли в объёмных голосах (по желанию игры, у «Летки» нет): kind → [имена петель]; heli — [малые, большие обороты],
  // jet — [спереди (свист компрессора), сзади (рёв струи)]. Пока записи нет — голос звучит синтезом
  let voiceLoops = {}, engLoops = null; // engLoops — записи своего двигателя { idle, ab } (по желанию игры; «Летка» — синтез)
  const EL = {}; // их источники и громкость в шине двигателя
  function vLoop(v, name) {
    v.lp = v.lp || {}; if (v.lp[name]) return v.lp[name];
    const S0 = SAMPLES[name]; if (!S0 || !S0.buf || ctx.eco) return null; // экономный звук — без записей в голосах (синтез)
    const s0 = ctx.createBufferSource(); s0.buffer = S0.buf; s0.loop = true; const g = gain(0); chain(s0, g, v.air); s0.start(0, Math.random() * S0.buf.duration);
    return (v.lp[name] = { s: s0, g, r: 0.97 + Math.random() * 0.06 });
  }
  // ненужные петли голоса — тише и стоп (не крутить вхолостую: до 24 источников); понадобятся — создадутся снова
  const vLoopsOff = (v, keep) => { if (v.lp) for (const k in v.lp) if (!keep.includes(k)) { const L = v.lp[k]; set(L.g.gain, 0, 0.1); try { L.s.stop(now() + 0.6); } catch (_) { /* уже */ } L.s.onended = () => { try { L.g.disconnect(); } catch (_) { /* уже */ } }; delete v.lp[k]; } };
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
      const eco = ECO === true, AC = window.AudioContext || window.webkitAudioContext;
      try { ctx = eco ? new AC({ latencyHint: 'playback', sampleRate: 24000 }) : new AC({ latencyHint: 'interactive' }); } catch (_) { ctx = new AC(); }
      ctx.eco = eco;
      makeBuffers();
      // шина: громкость → мягкий компрессор → выход; общая реверберация (сгенерированный импульс «открытого пространства»)
      out = gain(muted ? 0 : volume); master = ctx.createDynamicsCompressor(); master.threshold.value = -16; master.ratio.value = 3.5; master.knee.value = 12;
      chain(out, master, ctx.destination);
      const conv = ctx.createConvolver(), nch = ctx.eco ? 1 : 2, ir = ctx.createBuffer(nch, ctx.sampleRate * (ctx.eco ? 1.1 : 2.6), ctx.sampleRate); // экономный — короче и моно
      for (let ch = 0; ch < nch; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3.6) * (i < 400 ? i / 400 : 1); }
      conv.buffer = ir; reverbIn = gain(0.55); chain(reverbIn, filt('lowpass', 3500), conv, out);
      // «гарнитура»: бортовые сигналы звучат как из наушника, а не как игрушка
      avionics = chain(gain(1), filt('highpass', 350), filt('peaking', 1800, 0.9, 5)); avionics.connect(out);
      buildEngine(); buildEnv(); buildVoices();
      for (const [n, S0] of Object.entries(SAMPLES)) loadSample(n, S0.url); // заказанные до создания контекста
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
    // турбовинтовой (Ту-95, s.tprop): гул соосных винтов — частота лопастей и её обертоны, «биения» двух рядов (~2 Гц)
    E.tpG = gain(0); E.tpF = filt('lowpass', 420, 0.9); E.tpAM = gain(0.75);
    E.tpO = [[52, 'sawtooth'], [78, 'sawtooth'], [105, 'triangle']].map(([f, type]) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; chain(o, E.tpF); o.start(); return o; });
    { const l = ctx.createOscillator(), lg = gain(0.25); l.frequency.value = 2.1; chain(l, lg); lg.connect(E.tpAM.gain); l.start(); }
    chain(E.tpF, E.tpAM, E.tpG, engBus);
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
      const pan = ctx.createPanner(); pan.panningModel = ctx.eco ? 'equalpower' : 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 140; pan.maxDistance = 30000; pan.rolloffFactor = 1.1;
      const air = filt('lowpass', 8000, 0.5), g = gain(); chain(air, g, pan, out);
      const roarF = filt('bandpass', 350, 0.6), roarG = gain(1); chain(src('pink', 0.95 + i * 0.02), roarF, roarG, air);
      const rumbG = gain(0.8); chain(src('brown', 0.9 + i * 0.03), filt('lowpass', 170, 0.6), rumbG, air);
      const whF = filt('bandpass', 2600, 12), whG = gain(0); chain(src('white', 1 + i * 0.01), whF, whG, air);
      const crG = gain(0); chain(src('crackle', 0.55 + i * 0.04), filt('highpass', 180), filt('lowpass', 1900, 0.5), crG, air);
      // поршневой мотор дрона (prop): пила по частоте вспышек + «квадрат» на полторы частоты, через фильтр — «мопедный» звук;
      // дрожание оборотов — медленный LFO по частоте. Для остальных голосов prG = 0
      const po = ctx.createOscillator(), po2 = ctx.createOscillator(), pf = filt('lowpass', 1400, 1.6), prG = gain(0), p2g = gain(0.45);
      po.type = 'sawtooth'; po2.type = 'square'; po.frequency.value = 110; po2.frequency.value = 165;
      const wob = ctx.createOscillator(), wobG = gain(3); wob.frequency.value = 5.5 + i * 0.4; chain(wob, wobG); wobG.connect(po.frequency); wobG.connect(po2.frequency);
      chain(po, pf); chain(po2, p2g, pf); chain(pf, prG, air); po.start(); po2.start(); wob.start();
      voices.push({ pan, air, g, roarF, roarG, rumbG, whF, whG, crG, po, po2, pf, prG, ph: i * 1.7, o: null });
    }
  }
  // listener — камера; cands — [{ o, kind: 'jet'|'boss'|'msl'|'prop'|'tprop', pos, vel, fwd?, ab? }]; lvel — скорость слушателя (prop — поршневой мотор дрона, tprop — турбовинтовой: Ту-95)
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
        const d = c.pos.distanceTo(cp); if (d > (c.kind === 'msl' ? 4000 : c.kind === 'tbm' ? 25000 : c.kind === 'prop' ? 5000 : c.kind === 'heli' ? 7000 : c.kind === 'tprop' ? 9000 : 12000)) continue;
        c._d = d; let i = want.length; while (i > 0 && want[i - 1]._d > d) i--;
        if (i < voices.length) { want.splice(i, 0, c); if (want.length > voices.length) want.pop(); }
      }
      // голос помнит сам источник (v.o), а не запись о нём: записи переиспользуются каждый кадр
      for (const v of voices) if (v.o) { let keep = false; for (const w of want) if (w.o === v.o) { keep = true; break; } if (!keep) { v.o = null; set(v.g.gain, 0, 0.15); } }
      for (const w of want) { let v = null; for (const x of voices) if (x.o === w.o) { v = x; break; } if (!v) for (const x of voices) if (!x.o) { v = x; break; } if (v) v.o = w.o; }
    }
    for (const v of voices) {
      let c = null; if (v.o) for (const x of cands) if (x.o === v.o) { c = x; break; }
      if (!c || !active || muted) { if (v.o) set(v.g.gain, 0, 0.1); if (!c) v.o = null; set(v.prG.gain, 0, 0.1); if (v.psG) set(v.psG.gain, 0, 0.1); vLoopsOff(v, []); continue; }
      if (c.kind !== 'prop' && c.kind !== 'tprop') { set(v.prG.gain, 0, 0.1); if (v.psG) set(v.psG.gain, 0, 0.1); }
      const VL = voiceLoops[c.kind]; vLoopsOff(v, VL || []);
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
      } else if (c.kind === 'tprop') { // турбовинтовой (Ту-95): низкий гул соосных винтов, издалека — «гудение», вой турбин тихий
        const wob = 1 + 0.02 * Math.sin(performance.now() / 470 + v.ph), f = 54 * dop * wob;
        set(v.po.frequency, f); set(v.po2.frequency, f * 1.5); set(v.pf.frequency, 380 + 600 * Math.exp(-d / 1800)); set(v.prG.gain, 0.8);
        if (v.psG) set(v.psG.gain, 0);
        const tl = VL && vLoop(v, VL[0]); // запись винтов (Ту-95) — синтез тише
        if (tl) { set(tl.g.gain, 1.6); set(tl.s.playbackRate, tl.r * dop * wob); set(v.prG.gain, 0.15); }
        set(v.roarF.frequency, 650 * dop); v.roarF.Q.value = 0.8; set(v.roarG.gain, 0.3); set(v.rumbG.gain, tl ? 0.4 : 1.0);
        set(v.whF.frequency, 1300 * dop); v.whF.Q.value = 8; set(v.whG.gain, 0.25); set(v.crG.gain, 0); set(v.g.gain, 1.3 * (c.gain || 1));
      } else if (c.kind === 'tbm') { // баллистика: разгон — рёв двигателя (синтез) + гул в небе (запись), после выгорания — только гул вдали,
        // на спуске двигателя нет — свист и шум воздуха (раньше на спуске снова звучал «двигатель»)
        const rl = VL && vLoop(v, VL[0]), eng = c.pw || 0, air = c.air || 0;
        if (rl) { set(rl.g.gain, 1.5 * (1 - air) * (0.5 + 0.5 * eng)); set(rl.s.playbackRate, rl.r * clamp(dop, 0.7, 1.4)); }
        set(v.roarF.frequency, (air ? 2200 : 1300) * dop); v.roarF.Q.value = air ? 1.4 : 0.45; set(v.roarG.gain, 1.6 * eng + 0.5 * air); set(v.rumbG.gain, 0.3 * eng);
        set(v.whF.frequency, 4200 * dop); v.whF.Q.value = 1.2; set(v.whG.gain, 1.2 * eng + 0.9 * air); set(v.crG.gain, 0.6 * eng); set(v.g.gain, 0.6 * (c.gain || 1));
      } else if (c.kind === 'heli') { // вертолёт: записанный гул винта — малые и большие обороты по нагрузке (c.pw 0…1); нет записи — глухие хлопки синтезом
        const lo = VL && vLoop(v, VL[0]), hi = VL && vLoop(v, VL[1]), pw = clamp(c.pw ?? 0.6, 0, 1), k = c.rate || 1;
        const far = VL && VL[2] && vLoop(v, VL[2]), fk = far ? clamp((d - 700) / 1800, 0, 1) : 0; // вдали — запись дальнего вертолёта (глухие хлопки, эхо)
        if (far) { set(far.g.gain, 1.7 * fk); set(far.s.playbackRate, far.r * k * dop); }
        if (lo && hi) {
          set(lo.g.gain, 1.5 * Math.cos(pw * Math.PI / 2) * (1 - fk)); set(hi.g.gain, 1.5 * Math.sin(pw * Math.PI / 2) * (1 - fk));
          set(lo.s.playbackRate, lo.r * k * dop * (0.95 + 0.04 * pw)); set(hi.s.playbackRate, hi.r * k * dop * (0.98 + 0.04 * pw));
          set(v.roarG.gain, 0); set(v.rumbG.gain, 0.25); set(v.whG.gain, 0);
        } else { set(v.roarF.frequency, 260 * dop); v.roarF.Q.value = 1; set(v.roarG.gain, 0.5); set(v.rumbG.gain, 1.1); set(v.whF.frequency, 5200 * dop); v.whF.Q.value = 14; set(v.whG.gain, 0.15); }
        set(v.crG.gain, 0); set(v.g.gain, 1.1 * (c.gain || 1));
      } else if (c.kind === 'prop') { // поршневой мотор с толкающим винтом: «мопедный» тон (генераторы) + немного шума винта
        const wob = 1 + 0.03 * Math.sin(performance.now() / 1300 + v.ph); // обороты «гуляют»
        if (v.ps) { // записанный мотор (петля): высота — по допплеру; синтез и шум — выключены
          set(v.ps.playbackRate, v.psRate * dop * wob); set(v.psG.gain, 1.6); set(v.prG.gain, 0); set(v.roarG.gain, 0); set(v.rumbG.gain, 0.08); set(v.crG.gain, 0);
        } else {
          const f = 108 * dop * wob;
          set(v.po.frequency, f); set(v.po2.frequency, f * 1.5); set(v.pf.frequency, 900 + 1400 * Math.exp(-d / 1500)); set(v.prG.gain, 0.5);
          set(v.roarF.frequency, 420 * dop); v.roarF.Q.value = 1.2; set(v.roarG.gain, 0.25); set(v.rumbG.gain, 0.15); set(v.crG.gain, 0.35);
        }
        set(v.whG.gain, 0); set(v.g.gain, 0.9 * (c.gain || 1));
      } else {
        const big = c.kind === 'boss';
        // спереди слышнее вой компрессора, сзади — рёв струи и треск форсажа
        const front = c.fwd ? clamp((c.fwd.x * ax + c.fwd.y * ay + c.fwd.z * az + 1) / 2, 0, 1) : 0.5;
        set(v.roarF.frequency, (big ? 220 : 380) * dop * (c.ab ? 0.8 : 1)); v.roarF.Q.value = 0.6;
        set(v.roarG.gain, (0.7 + 0.6 * (1 - front)) * (c.ab ? 1.6 : 1)); set(v.rumbG.gain, big ? 1.4 : 0.8 + (c.ab ? 0.6 : 0));
        set(v.whF.frequency, (big ? 1900 : 2700) * dop); v.whF.Q.value = 12; set(v.whG.gain, 1.8 * front * front + 0.2);
        set(v.crG.gain, c.ab ? 0.45 * (1 - front) : 0); set(v.g.gain, (big ? 1.3 : 0.9) * (c.gain || 1));
        // записи пролёта: спереди — свист, сзади — рёв; синтез остаётся тише — даёт форсаж и «тело» большого
        const fr = VL && vLoop(v, VL[0]), rr = VL && vLoop(v, VL[1]);
        if (fr && rr) {
          set(fr.g.gain, 1.6 * Math.sin(front * Math.PI / 2)); set(rr.g.gain, 1.7 * Math.cos(front * Math.PI / 2) * (c.ab ? 1.3 : 1));
          set(fr.s.playbackRate, fr.r * dop * (big ? 0.85 : 1)); set(rr.s.playbackRate, rr.r * dop * (big ? 0.8 : 1));
          set(v.roarG.gain, (0.25 + 0.3 * (1 - front)) * (c.ab ? 1.6 : 1)); set(v.whG.gain, 0.5 * front * front + 0.05);
        }
      }
    }
  }

  // Каждый кадр: s = { on, rpmTarget, ab, speed, mach, sup, n, rear (0 — камера спереди, 1 — сзади), agl, rain, lobby }
  function frame(dt, s) {
    if (!ctx) return;
    if (!s.on || muted) { set(engBus.gain, 0, 0.08); for (const k in EL) set(EL[k].g.gain, 0, 0.08); for (const k of ['windG', 'buffG', 'rainG', 'rainDrum', 'groundG', 'gunG', 'growlG']) set(E[k].gain, 0, 0.08); E.windLfo.gain.value = 0; return; }
    rpm += (s.rpmTarget - rpm) * Math.min(1, (s.rpmTarget > rpm ? 0.8 : 1.2) * dt); // раскрутка турбины с запаздыванием
    const r = rpm, rear = s.rear, front = 1 - rear, sup = s.sup, ab = s.ab, tp = !!s.tprop;
    // записи двигателя (малый газ — тон растёт с оборотами; форсаж — свой рёв поверх): синтез при них тише
    let rec = false;
    if (engLoops && !tp) for (const k of ['idle', 'ab']) { if (!EL[k] && SAMPLES[engLoops[k]] && SAMPLES[engLoops[k]].buf) { const s0 = ctx.createBufferSource(); s0.buffer = SAMPLES[engLoops[k]].buf; s0.loop = true; const g = gain(0); chain(s0, g, engBus); s0.start(0, Math.random() * s0.buffer.duration); EL[k] = { s0, g }; } }
    if (EL.idle) { rec = true; const k = clamp((r - 0.55) / 0.45, 0, 1); set(EL.idle.g.gain, tp ? 0 : (0.05 + 0.06 * k) * (ab ? 0.55 : 1) * (0.75 + 0.25 * front), 0.15); set(EL.idle.s0.playbackRate, 0.86 + 0.42 * k, 0.25); }
    if (EL.ab) set(EL.ab.g.gain, ab && !tp && !sup ? 0.13 * (0.6 + 0.4 * rear) : 0, ab ? 0.12 : 0.3);
    set(E.tpG.gain, tp ? 0.035 + 0.06 * r : 0, 0.2);
    if (tp) { const ff = 46 + 22 * r; set(E.tpO[0].frequency, ff, 0.2); set(E.tpO[1].frequency, ff * 1.5, 0.2); set(E.tpO[2].frequency, ff * 2.02, 0.2); }
    set(engBus.gain, s.lobby ? 3 : 4, 0.2); // слои намеренно «тихие» по отдельности — общий уровень задаёт шина
    // рёв и гул: растут с оборотами, форсаж опускает спектр и добавляет «давление»
    set(E.roarF.frequency, sup ? 190 : (ab ? 260 : 170 + 620 * r * r));
    set(E.roarG.gain, (sup ? 0.05 : 0.018 + 0.07 * r * r * r + (ab ? 0.05 : 0)) * (0.45 + 0.55 * rear) * (rec ? 0.55 : 1), 0.12);
    set(E.rumbF.frequency, 120 + 90 * r); set(E.rumbG.gain, (0.025 + 0.05 * r * r + (ab ? 0.09 : 0)) * (sup ? 0.7 : 1));
    set(E.hissG.gain, sup ? 0.002 : (0.002 + 0.013 * Math.pow(r, 4)) * (0.3 + 0.7 * rear) * (ab ? 0.45 : 1)); // на форсаже шипение тише — главное низ
    set(E.crackG.gain, sup || tp ? 0 : (ab ? 0.028 : r > 0.97 ? 0.006 : 0) * (0.35 + 0.65 * rear), 0.2);
    crackleT -= dt; if (crackleT <= 0) { crackleT = 0.5 + Math.random() * 0.7; set(E.crackSrc.playbackRate, 0.5 + Math.random() * 0.3, 0.3); }
    // вой турбины: частота лопаток по оборотам, спереди громче; на сверхзвуке почти не слышен
    const f = tp ? 900 + 700 * r : 1700 + 2300 * r; // у турбовинтового турбина ниже и тише (главное — винты)
    set(E.wBand1.frequency, f, 0.1); set(E.wBand2.frequency, f * 1.47, 0.1);
    for (const w of E.wOsc) set(w.o.frequency, f * w.k, 0.1);
    set(E.whineG.gain, (sup ? 0.12 : 0.28 + 0.9 * front) * (0.036 + 0.04 * r) * (ab ? 0.7 : 1) * (tp ? 0.4 : 1) * (rec ? 0.35 : 1));
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
  // сирена и т. п.: держит громкость (нарастание 0,4 с, спад 0,8 с), частота — по точкам [[время, Гц], …] (линейно)
  function sweep(type, pts, vol, when = 0, wet = 0, dest = out) {
    if (!ctx || muted) return;
    const t0 = now() + when, dur = pts[pts.length - 1][0], o = ctx.createOscillator(), g = ctx.createGain(), f = filt('lowpass', 2400, 0.7); o.type = type;
    o.frequency.setValueAtTime(pts[0][1], t0); for (const [t, hz] of pts.slice(1)) o.frequency.linearRampToValueAtTime(hz, t0 + t);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.4); g.gain.setValueAtTime(vol, t0 + dur - 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    chain(o, f, g, dest); if (wet) { const w = gain(wet); g.connect(w); w.connect(reverbIn); } o.start(t0); o.stop(t0 + dur + 0.05);
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
    growl(level, freq) { if (!ctx || !Number.isFinite(level) || !Number.isFinite(freq)) return; E.growlG.gain.value = muted ? 0 : level; E.growlO.frequency.value = freq; },
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
    sweep(type, pts, vol, when = 0, wet = 0) { sweep(type, pts, vol, when, wet); },
    // непрерывный фон (петля шума через фильтр): set(громкость, сек. сглаживания), stop() — затухает и освобождается
    bed(buf, rate, type, freq, q = 0.7) {
      if (!ctx) return null;
      const s = src(buf, rate), f = filt(type, freq, q), g = gain(0); chain(s, f, g, out);
      return { f, set(v, tc = 1) { set(g.gain, muted ? 0 : v, tc); }, stop() { set(g.gain, 0, 0.3); setTimeout(() => { try { s.stop(); s.disconnect(); g.disconnect(); } catch (_) { /* уже */ } }, 2000); } };
    },
    loadSample, setPropSample(name) { propSample = name; if (ctx) attachProp(); }, setVoiceLoops(map) { voiceLoops = map || {}; }, setEngineLoops(m) { engLoops = m || null; },
    // петля записи (свой винт, очередь пушки): set(громкость, сглаж.), rate(скорость), cut(срез верха Гц), stop(затухание с, когда с)
    loop(name, vol = 0, when = 0, rate = 1, cut = 20000, wet = 0) {
      const S0 = SAMPLES[name]; if (!ctx || !S0 || !S0.buf) return null;
      const t0 = now() + when, s0 = ctx.createBufferSource(), g = gain(0), f = filt('lowpass', cut, 0.6); s0.buffer = S0.buf; s0.loop = true; s0.playbackRate.value = rate;
      chain(s0, f, g, out); let w = null; if (wet) { w = gain(wet); g.connect(w); w.connect(reverbIn); }
      g.gain.setValueAtTime(0, t0); g.gain.setTargetAtTime(muted ? 0 : vol, t0, 0.02); s0.start(t0, Math.random() * S0.buf.duration);
      let dead = false;
      return {
        set(v, tc = 0.08) { if (!dead) g.gain.setTargetAtTime(muted ? 0 : v, Math.max(now(), t0), tc); },
        rate(r, tc = 0.1) { if (!dead) s0.playbackRate.setTargetAtTime(r, now(), tc); },
        cut(fq, tc = 0.2) { if (!dead) f.frequency.setTargetAtTime(fq, now(), tc); },
        stop(fade = 0.08, when2 = 0) {
          if (dead) return; dead = true; const t = Math.max(now() + when2, t0);
          g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, fade / 3);
          try { s0.stop(t + fade * 2 + 0.05); } catch (_) { /* уже */ } s0.onended = () => { try { g.disconnect(); if (w) w.disconnect(); } catch (_) { /* уже */ } };
        },
      };
    },
    sampleDur(name) { const S0 = SAMPLES[name]; return S0 && S0.buf ? S0.buf.duration : 0; },
    time() { return ctx ? ctx.currentTime : 0; },
    // разовый записанный звук: громкость, задержка, скорость (ниже — «тяжелее»), срез верха, доля в реверберации
    sample(name, vol, when = 0, rate = 1, cut = 20000, wet = 0, offset = 0) { // offset — с какого места записи (с)
      const S0 = SAMPLES[name]; if (!ctx || muted || !S0 || !S0.buf) return false;
      const t0 = now() + when, s0 = ctx.createBufferSource(), g = gain(vol), f = filt('lowpass', cut, 0.6); s0.buffer = S0.buf; s0.playbackRate.value = rate;
      chain(s0, f, g, out); if (wet) { const w = gain(wet); g.connect(w); w.connect(reverbIn); } s0.start(t0, offset); s0.vol = g; return s0; // голос — чтобы можно было погасить (vol — его громкость)
    },
    // кусок записи с плавным входом и выходом, со своей стороны (pan −1…1): фон — вороны вдали и т. п.
    clip(name, { vol = 0.2, when = 0, rate = 1, cut = 20000, wet = 0, offset = 0, dur = 0, fin = 0.5, fout = 1, pan = 0 } = {}) {
      const S0 = SAMPLES[name]; if (!ctx || muted || !S0 || !S0.buf) return false;
      const len = Math.min(dur || 1e9, (S0.buf.duration - offset) / rate), t0 = now() + when, s0 = ctx.createBufferSource(), g = gain(0), f = filt('lowpass', cut, 0.6);
      s0.buffer = S0.buf; s0.playbackRate.value = rate; let node = g;
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); chain(g, p); node = p; }
      chain(s0, f, g); node.connect(out); if (wet) { const w = gain(wet); node.connect(w); w.connect(reverbIn); }
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + fin); g.gain.setValueAtTime(vol, t0 + Math.max(fin, len - fout)); g.gain.linearRampToValueAtTime(0, t0 + len);
      s0.start(t0, offset); s0.stop(t0 + len + 0.05); return s0;
    },
  };
  return A;
}
