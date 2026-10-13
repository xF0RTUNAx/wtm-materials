// Звук «Воздушного превосходства»: движок и синтез — из «Летки» (drone/audio.js: двигатель, объёмные голоса самолётов
// и ракет, взрывы с задержкой по скорости звука, «гарнитура» для бортовых сигналов). Здесь — звуки этой игры из тех же
// кирпичей (A.noise / A.tone): старт ЗУР, очереди зениток, сброс бомб, тоны СПО и датчика пуска, пульт оператора ПВО.
import { createAudio } from '../drone/audio.js?v=20261020i';

export function createSound() {
  const A = createAudio();
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* приватный режим */ } } };
  let vol = +(ls.get('fortuna_airdef_vol') ?? 0.8); if (!(vol >= 0 && vol <= 1)) vol = 0.8;
  let muted = ls.get('fortuna_airdef_mute') === '1';
  A.setVolume(vol); A.setMuted(muted);
  // записанные звуки (games/airdef/sounds): мотор «Шахеда» — петля для голосов дронов; далёкий взрыв —
  // «Stretched Canvas Bass Drum Granulated» by Puniho (freesound.org, CC BY 3.0). Нет файла — остаётся синтез
  A.loadSample('siren', 'airdef/sounds/siren.mp3?v=20261020i'); A.loadSample('launchAir', 'airdef/sounds/launch_air.mp3?v=20261020i');
  for (const i of [1, 2, 3]) A.loadSample('cold' + i, `airdef/sounds/launch_cold${i}.mp3?v=20261020i`); A.loadSample('prop', 'airdef/sounds/shahed_loop.wav?v=20261020i'); A.loadSample('boomFar', 'airdef/sounds/boom_far.mp3?v=20261020i'); A.setPropSample('prop');
  const delayOf = (d) => Math.min(2.5, d / 343);
  let sirenEnd = 0, sirenV = null; // до какого времени звучит сирена воздушной тревоги
  // записи вертикального старта: [хлопок выброса, начало рёва двигателя], с (по огибающей громкости)
  const COLD_SYNC = [[0.3, 0.65], [0.2, 0.6], [0.15, 0.75]];
  const near = (d, ref = 600) => Math.min(1, ref / (d + ref));
  // СПО: свои ритмы на обзор, захват, пуск; датчик пуска — сирена
  const rw = { known: new Set(), beepT: 0, mwsT: 0, state: '' };
  const S = {
    A,
    get muted() { return muted; },
    get volume() { return vol; },
    unlock() { A.init(); A.resume(); },
    setMuted(m) { muted = m; A.setMuted(m); ls.set('fortuna_airdef_mute', m ? '1' : '0'); },
    setVolume(v) { vol = v; A.setVolume(v); ls.set('fortuna_airdef_vol', String(v)); },
    frame: A.frame, spatial: A.spatial, silence: A.silence, growl: A.growl,
    // взрыв на земле: резкий «хлопок» ударной волны, глубокий толчок (инфранизкий тон), тело взрыва (низкий шум с быстрой
    // атакой), раскат с эхом от домов, треск обломков вблизи. Вдали — позже (скорость звука) и глуше (верх съедает воздух)
    explosion(d, size = 1) {
      const dl0 = Math.min(4, d / 343), far = Math.min(1, Math.max(0, (d - 600) / 1800)); // вдали — записанный раскат, вблизи — синтез
      const fs = Math.min(1.8, 0.6 + size * 0.22), sv = Math.min(1.3, 2600 / (d + 1400)) * fs * (0.25 + 0.75 * far);
      const played = A.sample('boomFar', sv, dl0, 1.08 - Math.min(0.3, size * 0.04) + Math.random() * 0.06, 400 + 6000 * Math.exp(-d / 2500), 0.35);
      const dl = dl0, k = Math.max(0.03, near(d, 1200)) * fs * (played ? 1 - 0.7 * far : 1), wet = 0.35 + 0.5 * (1 - k), cut = 300 + 4500 * Math.exp(-d / 1100), big = Math.min(2.5, size / 2);
      if (d < 3000) A.noise('white', 0.035, 0.6 * k, 'highpass', 900, 0.6, dl, 0, false, 0.002);
      A.tone('sine', 62, 18, 0.7 + big * 0.4, 0.95 * k, dl, 0.2);
      A.tone('triangle', 95, 30, 0.35, 0.4 * k, dl, 0.1);
      A.noise('brown', 1.6 + big * 0.9, 0.85 * k, 'lowpass', Math.min(cut, 700), 0.6, dl, wet, false, 0.004);
      A.noise('pink', 1.1 + big * 0.5, 0.42 * k, 'lowpass', cut, 0.5, dl + 0.01, wet, false, 0.006);
      A.noise('brown', 3.5 + big * 1.5, 0.4 * k, 'lowpass', 110, 0.7, dl + 0.15, 0.9, false, 0.35); // раскат
      A.noise('pink', 1.4, 0.13 * k, 'lowpass', 380, 0.5, dl + 0.45 + d / 4000, 1); // эхо от домов
      A.noise('pink', 1.8, 0.08 * k, 'lowpass', 260, 0.5, dl + 1.1 + d / 3000, 1);
      if (d < 900) A.noise('crackle', 1.3, 0.55 * k, 'bandpass', 2200, 0.6, dl + 0.06); // обломки
    },
    // пуск крылатой ракеты с самолёта: щелчок замка, свист падения, запуск двигателя — нарастающий вой и шипение
    cruiseLaunch(d) {
      const k = near(d, 900), w = delayOf(d), wet = 0.3 + 0.5 * (1 - k);
      A.noise('brown', 0.15, 0.35 * k, 'lowpass', 260, 0.7, w);
      A.tone('sawtooth', 380, 2400, 2.2, 0.06 * k, w + 0.6, wet); A.tone('sine', 1200, 4200, 2.4, 0.05 * k, w + 0.6, wet);
      const f = A.noise('pink', 2.6, 0.32 * k, 'bandpass', 600, 0.6, w + 0.55, wet, false, 0.25); if (f) f.frequency.exponentialRampToValueAtTime(1800, f.context.currentTime + w + 3);
      A.noise('white', 1.8, 0.1 * k, 'highpass', 3500, 0.6, w + 0.7, wet, false, 0.2);
    },
    // старт баллистической ракеты: глухой удар зажигания, долгий рёв с «треском» факела, уходит вверх — глуше
    tbmLaunch(d) {
      const k = near(d, 2500), w = delayOf(d), wet = 0.4 + 0.5 * (1 - k);
      A.tone('sine', 48, 24, 1.2, 0.9 * k, w, 0.3);
      A.noise('brown', 7, 0.95 * k, 'lowpass', 140, 0.7, w, wet, false, 0.15);
      const f = A.noise('pink', 7.5, 0.5 * k, 'bandpass', 520, 0.5, w + 0.05, wet, false, 0.3); if (f) f.frequency.exponentialRampToValueAtTime(160, f.context.currentTime + w + 7.5);
      A.noise('crackle', 6, 0.45 * k, 'bandpass', 950, 0.6, w + 0.2, wet, false, 0.3);
      A.noise('pink', 3, 0.15 * k, 'lowpass', 300, 0.5, w + 2.2 + d / 3000, 1);
    },
    // сирена воздушной тревоги: двухтональный «вой» (подъём — держит — спад), kind 'tbm' — чаще и выше
    // записанная сирена (47 с, сама затихает): пока звучит — повторно не включается; возвращает, сколько ещё звучать (с)
    // restart — звучит уже — плавно погасить и начать заново (реализм: баллистика во время тревоги по крылатым)
    siren(kind, restart = false) {
      const dur = A.sampleDur('siren');
      if (dur) {
        const left = sirenEnd - A.time(); if (left > 0.5 && !restart) return left;
        if (left > 0.5 && sirenV && sirenV.vol) { const g = sirenV.vol.gain, t = A.time(); g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.4); try { sirenV.stop(t + 0.45); } catch (_) { /* уже */ } }
        const v = A.sample('siren', 0.55, left > 0.5 ? 0.35 : 0, 1, 20000, 0.15); if (v) { sirenV = v; sirenEnd = A.time() + dur + (left > 0.5 ? 0.35 : 0); return dur; }
      }
      const tb = kind === 'tbm', lo = tb ? 420 : 300, hi = tb ? 900 : 760, per = tb ? 2.2 : 4.5, n = tb ? 4 : 2, pts = [[0, lo]];
      for (let i = 0; i < n; i++) { const t0 = i * per; pts.push([t0 + per * 0.45, hi], [t0 + per * 0.6, hi], [t0 + per, lo]); }
      A.sweep('sawtooth', pts, 0.07, 0, 0.6); A.sweep('square', pts.map(([t, f]) => [t, f * 1.5]), 0.025, 0, 0.6);
      return pts[pts.length - 1][0];
    },
    // подрыв боевой части ЗУР в воздухе: резкий хлопок (ударная волна), раскат и эхо от города; в воздухе слышно далеко
    samBurst(d, size = 1) {
      const dl = Math.min(3, d / 343), k = Math.max(0.04, near(d, 1500)) * Math.min(1.4, 0.7 + size * 0.3), wet = 0.3 + 0.5 * (1 - k), cut = 350 + 2500 * Math.exp(-d / 1500);
      if (d < 4000) A.noise('white', 0.05, 0.5 * k, 'highpass', 1800, 0.7, dl);
      A.noise('brown', 0.8 + 0.3 * size, 0.6 * k, 'lowpass', cut, 0.6, dl, wet);
      A.tone('sine', 72, 30, 1.2, 0.4 * k, dl, 0.4);
      A.noise('pink', 1.6, 0.16 * k, 'lowpass', 320, 0.5, dl + 0.35 + d / 3000, 0.9); // эхо
    },
    // гибель самолёта: взрыв, огненный шар (гул), второй взрыв топлива, треск разлетающихся обломков
    planeKill(d) {
      S.samBurst(d, 2.2);
      const dl = Math.min(3, d / 343), k = Math.max(0.04, near(d, 1500));
      A.noise('pink', 1.8, 0.35 * k, 'bandpass', 480, 0.6, dl + 0.15, 0.5);
      A.noise('brown', 1.5, 0.45 * k, 'lowpass', 260, 0.6, dl + 0.45, 0.6);
      A.tone('sine', 55, 28, 1.4, 0.35 * k, dl + 0.45, 0.5);
      if (d < 2500) A.noise('crackle', 1.6, 0.35 * k, 'bandpass', 1500, 0.6, dl + 0.2);
    },
    hit() { A.hit(); }, flare() { A.flare(); }, chaff() { A.chaff(); }, afterburner() { A.afterburner(); },
    // старт зенитной ракеты: хлопок и рёв ускорителя (у больших — долгий и низкий), слышно с задержкой
    samLaunch(d, big) {
      const k = near(d, big ? 1500 : 700), w = delayOf(d), wet = 0.3 + 0.5 * (1 - k);
      A.noise('brown', big ? 2.6 : 1.1, 0.5 * k, 'lowpass', big ? 160 : 260, 0.7, w, wet, false, 0.02);
      const f = A.noise('pink', big ? 3.4 : 1.5, 0.34 * k, 'bandpass', big ? 700 : 1300, 0.5, w + 0.02, wet, false, 0.06);
      if (f) f.frequency.exponentialRampToValueAtTime(big ? 300 : 600, f.context.currentTime + w + (big ? 3.4 : 1.5)); // ракета уходит — рёв глуше
      if (d < 2000) A.noise('white', 0.1, 0.2 * k, 'highpass', 1500, 0.6, w);
    },
    // «холодный» старт и стартовый двигатель ПЗРК: глухой хлопок газогенератора и шипение — без рёва двигателя
    eject(d, big) {
      const k = near(d, big ? 900 : 300), w = delayOf(d);
      A.tone('sine', big ? 70 : 140, big ? 30 : 60, big ? 0.35 : 0.15, 0.4 * k, w, 0.5);
      A.noise('brown', big ? 0.5 : 0.18, 0.45 * k, 'lowpass', big ? 240 : 500, 0.7, w, 0.5);
      A.noise('white', big ? 0.7 : 0.25, 0.08 * k, 'bandpass', 3000, 0.8, w + 0.03, 0.4);
    },
    // очередь зенитной пушки (вызывать раз в ~0,15 с, пока идёт очередь): частый «треск» + гул
    // очередь — глухие частые удары (низкий «тук» на выстрел + раскат), у 35 мм ниже и тяжелее, вдали — гулкое эхо
    aaa(d, cal) {
      const k = near(d, 700), w = delayOf(d), big = cal > 30, n = big ? 3 : 4, step = 0.16 / n;
      for (let i = 0; i < n; i++) A.tone('sine', big ? 72 : 95, big ? 34 : 45, 0.13, 0.32 * k, w + i * step, 0.45);
      A.noise('brown', 0.24, 0.55 * k, 'lowpass', big ? 110 : 150, 0.8, w, 0.6);
      A.noise('crackle', 0.16, 0.35 * k, 'bandpass', big ? 420 : 600, 0.6, w, 0.5);
      A.noise('pink', 0.2, 0.12 * k, 'lowpass', 380, 0.7, w + 0.04, 0.7);
    },
    // своё оружие: «клац» замка держателя, у ракет — запись пуска (нет записи — синтез)
    release(missile) { A.noise('brown', 0.12, 0.3, 'lowpass', 220); A.noise('white', 0.05, 0.12, 'bandpass', 2500, 1.2); if (missile && !S.airLaunch(0)) A.launch(); },
    // пуск ракеты с самолёта (ПРР, ракеты «воздух — земля»): запись, с задержкой и глуше вдали
    airLaunch(d) { return A.sample('launchAir', 0.85 * near(d, 900), delayOf(d), 0.97 + Math.random() * 0.06, 500 + 9000 * Math.exp(-d / 2000), 0.25 + 0.4 * (1 - near(d, 900)), 0.18); }, // с начала звука (0,18 с — тишина)
    // вертикальный («холодный») старт ЗУР как у С-300 / С-400: одна из трёх записей, случайно; играет до конца.
    // Нет записей — прежний синтез (хлопок газогенератора). small — малые ракеты («Тор»): тише и чуть выше
    coldLaunch(d, small) {
      // в каждой записи: хлопок выброса (pop) и запуск двигателя (рёв) — запись идёт с хлопка в момент выброса, а двигатель
      // ракеты в игре включается, когда в записи начинается рёв: возвращаем этот промежуток (с) — по нему ставится зажигание
      const i = 1 + Math.floor(Math.random() * 3), [pop, roar] = COLD_SYNC[i - 1], rate = (small ? 1.12 : 1) * (0.97 + Math.random() * 0.06);
      if (A.sample('cold' + i, (small ? 0.6 : 0.95) * near(d, small ? 900 : 1600), delayOf(d), rate, 500 + 9000 * Math.exp(-d / 2500), 0.3 + 0.4 * (1 - near(d, 1500)), Math.max(0, pop - 0.02))) return { gap: (roar - pop) / rate };
      S.eject(d, !small); return null;
    },
    // свист падающей бомбы рядом с камерой
    whistle(d) { const k = near(d, 300); if (k < 0.15) return; A.tone('sine', 1500, 500, 2.4, 0.04 * k, 0, 0.3); },
    // бортовые сигналы
    click() { A.tone('square', 1800, 1800, 0.025, 0.03, 0, 0, true); },
    lock() { A.beep(1300, 0.08, 'square', 0.05); A.beep(1700, 0.1, 'square', 0.05); },
    unlock2() { A.beep(700, 0.12, 'square', 0.04); },
    deny() { A.beep(240, 0.18, 'square', 0.05); },
    laser(on) { A.beep(on ? 2200 : 1100, 0.06, 'sine', 0.04); },
    alarm() { A.beep(900, 0.15, 'sawtooth', 0.05, -300); },
    help() { [880, 1320, 1760].forEach((f, i) => setTimeout(() => A.beep(f, 0.11, 'triangle', 0.07), i * 130)); }, // «нужна помощь» союзника — три восходящих тона
    good() { A.chime(); },
    // каждый кадр в бою за самолёт: list — rwr(a), mws — датчик пуска
    rwrTick(dt, list, mws) {
      let st = '';
      for (const e of list) { if (!rw.known.has(e.u.id)) { rw.known.add(e.u.id); A.beep(1050, 0.07, 'square', 0.04); A.beep(1050, 0.07, 'square', 0.04); } if (e.state === 'launch') st = 'launch'; else if (e.state === 'track' && st !== 'launch') st = 'track'; }
      if (rw.known.size > list.length * 2 + 4) rw.known = new Set(list.map((e) => e.u.id));
      rw.beepT -= dt;
      if (st === 'launch' && rw.beepT <= 0) { rw.beepT = 0.16; A.beep(rw.state === 'a' ? 1800 : 1250, 0.07, 'square', 0.055); rw.state = rw.state === 'a' ? 'b' : 'a'; }
      else if (st === 'track' && rw.beepT <= 0) { rw.beepT = 0.42; A.beep(1450, 0.18, 'square', 0.045); }
      rw.mwsT -= dt;
      if (mws.length && rw.mwsT <= 0) { rw.mwsT = 0.6; A.beep(780, 0.25, 'sawtooth', 0.05, 380); }
    },
    resetRwr() { rw.known.clear(); rw.beepT = rw.mwsT = 0; },
    // эмбиент главного меню: ветер порывами, далёкий гул города; изредка — пролёт самолёта вдали, далёкий раскат, старт ЗУР
    // за горизонтом, птицы в затишье. mood — выбранный режим ('air' — чаще самолёты, 'defense' — пуски, 'multi' — раскаты)
    ambient(on, mood) { amb.mood = mood || amb.mood; if (on === amb.on) return; amb.on = on; clearInterval(amb.timer); amb.timer = 0; if (on) { amb.next = 3 + Math.random() * 3; amb.timer = setInterval(ambTick, 250); } else if (amb.beds) { for (const b of amb.beds) b.stop(); amb.beds = null; } },
  };
  const amb = { on: false, timer: 0, beds: null, next: 0, gust: 0, gustT: 0, mood: 'air', last: '' };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const AMB = { // события: вес по режиму, звук
    jet: [{ air: 5, defense: 3, multi: 2 }, () => { // пролёт вдали: гул нарастает и стихает, полоса «съезжает» (Доплер)
      const t = A.time(), dur = rnd(8, 11), f = A.noise('pink', dur, 0.1, 'bandpass', 300, 0.9, 0, 0.7, false, dur * 0.45);
      if (f) { f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(760, t + dur * 0.45); f.frequency.linearRampToValueAtTime(240, t + dur); }
      A.noise('brown', dur, 0.12, 'lowpass', 140, 0.7, 0.3, 0.6, false, dur * 0.5);
      const w = A.noise('white', dur * 0.8, 0.02, 'bandpass', 2600, 3, 0.4, 0.5, false, dur * 0.35); if (w) w.frequency.linearRampToValueAtTime(1500, t + dur);
    }],
    boom: [{ air: 1, defense: 2, multi: 4 }, () => { if (!A.sample('boomFar', rnd(0.12, 0.22), 0, rnd(0.8, 0.95), 900, 0.7)) A.noise('brown', 3, 0.25, 'lowpass', 120, 0.7, 0, 0.8, false, 0.05); A.tone('sine', 50, 24, 1.6, 0.12, 0, 0.6); }],
    sam: [{ air: 1, defense: 3, multi: 2 }, () => S.samLaunch(rnd(4000, 6500), Math.random() < 0.5)],
    birds: [{ air: 2, defense: 2, multi: 1 }, () => { const n = 2 + Math.floor(Math.random() * 4), f0 = rnd(2800, 3800); for (let i = 0; i < n; i++) { const w = i * rnd(0.12, 0.3); A.tone('sine', f0 * rnd(0.95, 1.08), f0 * rnd(1.15, 1.35), 0.07, 0.012, w, 0.4); A.tone('sine', f0 * 1.2, f0 * 0.9, 0.05, 0.008, w + 0.08, 0.4); } }],
  };
  function ambTick() {
    if (!A.ready || muted) return;
    if (!amb.beds) amb.beds = [A.bed('pink', 0.7, 'lowpass', 480, 0.5), A.bed('brown', 0.8, 'lowpass', 105, 0.6), A.bed('pink', 1, 'bandpass', 2400, 0.4)].filter(Boolean);
    const hid = document.hidden, [wind, hum, air] = amb.beds;
    amb.gustT -= 0.25; if (amb.gustT <= 0) { amb.gustT = rnd(2, 6); amb.gust = rnd(0.35, 1); } // порыв ветра
    if (wind) { wind.set(hid ? 0 : 0.035 + 0.06 * amb.gust, 1.4); wind.f.frequency.setTargetAtTime(300 + 450 * amb.gust, A.time(), 1.4); }
    if (hum) hum.set(hid ? 0 : 0.07, 1); if (air) air.set(hid ? 0 : 0.004 + 0.01 * amb.gust, 1.4);
    if (hid || (amb.next -= 0.25) > 0) return;
    const pool = Object.entries(AMB).filter(([k]) => k !== amb.last), tot = pool.reduce((s, [, [w]]) => s + (w[amb.mood] || 1), 0); let r = Math.random() * tot;
    for (const [k, [w, play]] of pool) { r -= w[amb.mood] || 1; if (r <= 0) { amb.last = k; play(); break; } }
    amb.next = rnd(6, 13);
  }
  return S;
}
