// Звук «Воздушного превосходства»: движок и синтез — из «Летки» (drone/audio.js: двигатель, объёмные голоса самолётов
// и ракет, взрывы с задержкой по скорости звука, «гарнитура» для бортовых сигналов). Здесь — звуки этой игры из тех же
// кирпичей (A.noise / A.tone): старт ЗУР, очереди зениток, сброс бомб, тоны СПО и датчика пуска, пульт оператора ПВО.
import { createAudio } from '../drone/audio.js?v=20261024t';

export function createSound() {
  const A = createAudio();
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* приватный режим */ } } };
  let vol = +(ls.get('fortuna_airdef_vol') ?? 0.8); if (!(vol >= 0 && vol <= 1)) vol = 0.8;
  let muted = ls.get('fortuna_airdef_mute') === '1';
  A.setVolume(vol); A.setMuted(muted);
  // записанные звуки (games/airdef/sounds): мотор «Шахеда» — петля для голосов дронов; далёкий взрыв —
  // «Stretched Canvas Bass Drum Granulated» by Puniho (freesound.org, CC BY 3.0). Нет файла — остаётся синтез
  A.loadSample('siren', 'airdef/sounds/siren.mp3?v=20261024t'); A.loadSample('launchAir', 'airdef/sounds/launch_air.mp3?v=20261024t');
  for (const i of [1, 2, 3]) A.loadSample('cold' + i, `airdef/sounds/launch_cold${i}.mp3?v=20261024t`); A.loadSample('prop', 'airdef/sounds/shahed_loop.wav?v=20261024t'); A.loadSample('boomFar', 'airdef/sounds/boom_far.mp3?v=20261024t'); A.setPropSample('prop');
  // нарезка и петли — tools/airdef-sounds/mkloops.py (огибающая пролёта выровнена, стык петли — по ритму хлопков/выстрелов):
  //   винт — «UH-1 Helicopter» by Rmutt (CC0): малые обороты 0:54, большие 1:03–1:07; самолёт — «Jet Plane Flyby» by qubodup (CC0):
  //   подлёт (свист), уход (рёв), пролёт целиком; очередь — «Navy Mk 15 Phalanx CIWS Fast Burst» by qubodup (CC0), запись
  //   перегружена — верх смягчён и тише; вороны — «Flock of Crows» by Fenodyrie (CC0), с 0:24
  for (const [k, f] of [['heliLo', 'heli_lo.wav'], ['heliHi', 'heli_hi.wav'], ['jetFront', 'jet_front.wav'], ['jetRear', 'jet_rear.wav'], ['jetPass', 'jet_pass.mp3'], ['ciws', 'ciws_loop.wav'], ['ciwsTail', 'ciws_tail.mp3'], ['crows', 'crows.mp3'], ['heliFar', 'heli_far.wav'], ['rocketFar', 'rocket_far.wav'], ['intercept', 'intercept.mp3'], ['boomAir', 'boom_air.mp3'],
    ['tu95', 'tu95_loop.wav'], ['patriot', 'patriot_launch.mp3'], ['iskLaunch', 'isk_launch.mp3'], ['iskBoom', 'isk_boom.mp3']]) A.loadSample(k, `airdef/sounds/${f}?v=20261024t`);
  // вторая партия (tools/airdef-sounds/mk2.py): вертолёт вдали — Benboncan «Military Helicopter» (CC BY 4.0); гул ракеты в небе —
  //   qubodup «Far Away Rocket Launch» (CC0); перехват — Invadium «cruise missiles interception» (CC0); из роликов YouTube (решение Mark
  //   2026-10-21): далёкий взрыв, винты Ту-95, пуск Patriot, пуск и взрыв «Искандера»
  // третья партия (mk3.py; лицензия не подтверждена — файлов может не быть, тогда синтез): двигатель F-16 и форсаж, тоны ГСН AIM-9, отстрел ЛТЦ
  for (const [k, f] of [['engIdle', 'eng_idle.wav'], ['engAB', 'eng_ab.wav'], ['abOn', 'ab_on.mp3'], ['seekSearch', 'seek_search.wav'], ['seekTone', 'seek_tone.wav'], ['seekLock', 'seek_lock.wav'], ['flareRec', 'flare.mp3']]) A.loadSample(k, `airdef/sounds/${f}?v=20261024t`);
  A.setEngineLoops({ idle: 'engIdle', ab: 'engAB', tprop: 'tu95' }); // tprop — свой Ту-95: та же запись винтов, что у голосов
  A.setVoiceLoops({ heli: ['heliLo', 'heliHi', 'heliFar'], jet: ['jetFront', 'jetRear'], tprop: ['tu95'], tbm: ['rocketFar'] });
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
    // тон ГСН (записанные петли sk) звучит, только пока growl() зовут каждый кадр (вид оператора ИК-комплекса): не звали — гасим
    frame(dt, o) { if (skN > 0 && --skN === 0) for (const k in sk) { sk[k].stop(0.05); delete sk[k]; } A.frame(dt, o); },
    spatial: A.spatial,
    // тон ИК-ГСН у оператора: запись AIM-9 — поиск (низкое «рычание»), цель в поле (ровный тон), захват (высокая трель); нет записи — синтез
    growl(level, freq) {
      const on = level > 0 && !muted, st = !on ? '' : freq >= 850 ? 'seekLock' : freq >= 520 ? 'seekTone' : 'seekSearch';
      if (!A.sampleDur('seekLock')) { A.growl(level, freq); return; }
      A.growl(0, freq); skN = 3;
      for (const k of ['seekSearch', 'seekTone', 'seekLock']) {
        if (k === st && !sk[k]) sk[k] = A.loop(k, 0, 0, 1, 9000);
        if (sk[k]) sk[k].set(k === st ? Math.min(0.5, level * 7) : 0, 0.04);
      }
    },
    silence() { A.silence(); heliOff(); for (const k in sk) { sk[k].stop(0.05); delete sk[k]; } for (const g of guns.values()) g.h.stop(0.05); guns.clear(); }, // пауза и скрытая вкладка: петли винта и очередей — тоже (кадров нет — сами не погаснут)
    // взрыв на земле: резкий «хлопок» ударной волны, глубокий толчок (инфранизкий тон), тело взрыва (низкий шум с быстрой
    // атакой), раскат с эхом от домов, треск обломков вблизи. Вдали — позже (скорость звука) и глуше (верх съедает воздух)
    explosion(d, size = 1, kind) {
      if (kind === 'tbm' && d < 3000 && A.sample('iskBoom', 1.1 * near(d, 1500), Math.min(4, d / 343), 0.96 + Math.random() * 0.06, 600 + 12000 * Math.exp(-d / 1500), 0.3)) { A.tone('sine', 45, 20, 1.6, 0.7 * near(d, 1500), Math.min(4, d / 343), 0.3); return; } // взрыв «Искандера» (запись)
      const dl0 = Math.min(4, d / 343), far = Math.min(1, Math.max(0, (d - 600) / 1800)); // вдали — записанный раскат, вблизи — синтез
      // малый заряд (НАР: 2–4 кг ВВ, R = 11 → size 0,55; ложные цели) — без глубокого дальнего раската и инфранизкого толчка (Mark 2026-10-22)
      const small = size < 0.6;
      const fs = Math.min(1.8, 0.6 + size * 0.22), sv = Math.min(1.3, 2600 / (d + 1400)) * fs * (0.25 + 0.75 * far);
      const played = !small && A.sample('boomFar', sv, dl0, 1.08 - Math.min(0.3, size * 0.04) + Math.random() * 0.06, 400 + 6000 * Math.exp(-d / 2500), 0.35);
      const dl = dl0, k = Math.max(0.03, near(d, 1200)) * fs * (played ? 1 - 0.7 * far : 1), wet = 0.35 + 0.5 * (1 - k), cut = 300 + 4500 * Math.exp(-d / 1100), big = Math.min(2.5, size / 2);
      if (d < 3000) A.noise('white', 0.035, 0.6 * k, 'highpass', 900, 0.6, dl, 0, false, 0.002);
      if (!small) A.tone('sine', 62, 18, 0.7 + big * 0.4, 0.95 * k, dl, 0.2);
      A.tone('triangle', small ? 140 : 95, small ? 60 : 30, small ? 0.18 : 0.35, 0.4 * k, dl, 0.1);
      A.noise('brown', small ? 0.6 : 1.6 + big * 0.9, 0.85 * k, 'lowpass', Math.min(cut, small ? 1400 : 700), 0.6, dl, wet, false, 0.004);
      A.noise('pink', 1.1 + big * 0.5, 0.42 * k, 'lowpass', cut, 0.5, dl + 0.01, wet, false, 0.006);
      if (small) return; // эхо и раскат — только у больших
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
    // air — запуск двигателя в воздухе после схода с носителя («Кинжал» с МиГ-31): без наземного удара и толчка, с середины записи
    // (рёв маршевого участка), чуть выше (скорость и высота), тише, больше эха (открытое небо); синтез — без инфранизкого удара
    tbmLaunch(d, air) {
      const k = near(d, 2500), w = delayOf(d), wet = 0.4 + 0.5 * (1 - k);
      if (air) {
        if (A.sample('iskLaunch', 0.7 * k, w, 1.08 + Math.random() * 0.05, 300 + 7000 * Math.exp(-d / 3500), 0.55 + 0.35 * (1 - k), 1.6)) return;
        const f = A.noise('pink', 4, 0.4 * k, 'bandpass', 700, 0.5, w, 0.7, false, 0.15); if (f) f.frequency.exponentialRampToValueAtTime(250, f.context.currentTime + w + 4);
        A.noise('crackle', 3, 0.3 * k, 'bandpass', 1100, 0.6, w + 0.1, 0.6, false, 0.2); return;
      }
      if (A.sample('iskLaunch', 1.0 * k, w, 0.97 + Math.random() * 0.06, 400 + 9000 * Math.exp(-d / 3000), wet * 0.6)) { A.tone('sine', 48, 24, 1.2, 0.5 * k, w, 0.3); return; } // запись старта «Искандера»; инфранизкий толчок — синтез
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
      // рядом (до 1200 м) — только синтез: резкий хлопок сразу (задержка звука ужата — Mark 2026-10-21: должен совпадать со вспышкой);
      // дальше — запись подрыва (перехват / далёкий взрыв) по очереди, с места удара (без тихого начала записи), у крупных ниже и тяжелее
      const dl = d < 1200 ? d / 1000 : Math.min(3, d / 343), k = Math.max(0.04, near(d, 1500)) * Math.min(1.4, 0.7 + size * 0.3), wet = 0.3 + 0.5 * (1 - k), cut = 350 + 2500 * Math.exp(-d / 1500);
      if (d >= 1200) {
        const ic = bc++ & 1, rec = ic ? 'intercept' : 'boomAir', rk = Math.min(1.2, 2200 / (d + 900)) * Math.min(1.5, 0.6 + size * 0.35);
        if (A.sample(rec, rk, dl, 1.06 - Math.min(0.25, size * 0.08) + Math.random() * 0.06, 500 + 9000 * Math.exp(-d / 2500), 0.35 + 0.4 * (1 - k), ic ? 0.36 : 0.17)) return;
      }
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
    // отстрел ЛТЦ / диполей: запись как есть — без сдвига высоты, фильтра и эха (Mark 2026-10-21: обработка звучала искусственно)
    hit() { A.hit(); }, flare() { if (!A.sample('flareRec', 0.55, 0, 1, 20000, 0)) A.flare(); }, chaff() { if (!A.sample('flareRec', 0.4, 0, 1, 20000, 0)) A.chaff(); },
    afterburner() { if (!A.sample('abOn', 0.6, 0, 1, 16000, 0.12)) A.afterburner(); },
    // старт зенитной ракеты: хлопок и рёв ускорителя (у больших — долгий и низкий), слышно с задержкой
    samLaunch(d, big, key) {
      const k = near(d, big ? 1500 : 700), w = delayOf(d), wet = 0.3 + 0.5 * (1 - k);
      if (PATRIOT_LIKE.has(key) && A.sample('patriot', 0.9 * k, w, 0.96 + Math.random() * 0.08, 500 + 9000 * Math.exp(-d / 2500), wet * 0.6, 0.42)) return; // горячий старт из контейнера — запись (с 0,42 с: до этого — тихий подход, звук отставал от пуска)
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
    // очередь зенитной пушки (вызывать раз в 0,16 с, пока идёт очередь): отдельные выстрелы с настоящим темпом rof (выстр./с) —
    // у каждого резкий «щелчок» дульной волны (вдали пропадает первым) и глухой удар; стволы не синхронны — выстрелы вразнобой
    // («Шилка»: 4 × 23 мм ≈ 56/с — тяжёлая дробь, а не ровный гул шестистволки); у 35 мм ниже, реже и тяжелее; под очередью — раскат
    aaa(d, cal, rof) {
      const k = near(d, 700), kc = near(d, 300), w = delayOf(d), big = cal > 30, r = rof || (big ? 18 : 25);
      aaaAcc += r * 0.16; const n = Math.min(12, Math.floor(aaaAcc)); aaaAcc -= n;
      for (let i = 0; i < n; i++) {
        const t = w + (i + Math.random() * 0.8) * 0.16 / Math.max(1, n), f = (big ? 85 : 120) * (0.9 + Math.random() * 0.2);
        A.tone('sine', f, f * 0.42, big ? 0.14 : 0.1, (big ? 0.3 : 0.24) * k, t, 0.4);
        A.noise('white', 0.025, (big ? 0.16 : 0.2) * kc, 'bandpass', (big ? 900 : 1300) * (0.85 + Math.random() * 0.3), 1.1, t, 0.25, false, 0.001);
      }
      A.noise('brown', 0.24, 0.5 * k, 'lowpass', big ? 110 : 150, 0.8, w, 0.6);
      A.noise('pink', 0.2, 0.1 * k, 'lowpass', 380, 0.7, w + 0.04, 0.7);
    },
    // шестиствольные 20 мм (Phalanx, Vulcan): записанная очередь петлёй, пока стреляет (зовётся каждый кадр огня),
    // по окончании — эхо очереди. Нет записи — false (звучит синтез aaa)
    gunLoop(id, d, key) {
      const R = GUN_RATE[key]; if (!R || muted) return false;
      const k = near(d, 450), cut = 700 + 9000 * Math.exp(-d / 1600), wet = 0.2 + 0.5 * (1 - k);
      let g = guns.get(id);
      if (!g) { const h = A.loop('ciws', 0, delayOf(d), R * (0.98 + Math.random() * 0.04), cut, wet); if (!h) return false; guns.set(id, g = { h, R, d }); }
      g.last = A.time(); g.d = d; g.h.set(0.5 * k, 0.03); g.h.cut(cut);
      return true;
    },
    // каждый кадр: смолкшие очереди — гасим петлю (с задержкой звука), играем эхо
    gunTick() {
      const t = A.time();
      for (const [id, g] of guns) {
        if (t - g.last < 0.2) continue;
        const dl = delayOf(g.d), k = near(g.d, 450); g.h.stop(0.06, dl); guns.delete(id);
        A.clip('ciwsTail', { vol: 0.55 * k, when: dl + 0.03, rate: g.R, cut: 500 + 6000 * Math.exp(-g.d / 1500), wet: 0.3 + 0.4 * (1 - k), fin: 0.02, fout: 1 });
      }
    },
    // свой вертолёт: s = { on, pw — нагрузка винта 0…1, rate — тип (тяжёлый ниже), speed, rear — камера сзади 0…1 }.
    // Две петли винта — малые и большие обороты — перетекают по нагрузке; вой турбин и низкий «толчок» винта — синтез
    heli(dt, s) {
      if (!s || !s.on || muted || !A.ready) { if (he.lo || he.beds) heliOff(); return; }
      if (!he.lo) he.lo = A.loop('heliLo', 0, 0, 1, 12000, 0.08); if (!he.hi) he.hi = A.loop('heliHi', 0, 0, 1, 12000, 0.08);
      if (!he.beds) he.beds = [A.bed('white', 1, 'bandpass', 5400, 14), A.bed('brown', 1, 'lowpass', 85, 0.8), A.bed('pink', 0.9, 'lowpass', 600, 0.4)];
      he.pw += ((s.pw ?? 0.6) - he.pw) * Math.min(1, dt * 2.5); const pw = Math.max(0, Math.min(1, he.pw)), r = s.rate || 1, v = Math.min(1, (s.speed || 0) / 80);
      if (he.lo) { he.lo.set(0.42 * Math.cos(pw * Math.PI / 2) + 0.03, 0.1); he.lo.rate(r * (0.94 + 0.05 * pw)); }
      if (he.hi) { he.hi.set(0.42 * Math.sin(pw * Math.PI / 2), 0.1); he.hi.rate(r * (0.97 + 0.05 * pw)); }
      const [whine, thump, wind] = he.beds;
      if (whine) { whine.set(0.006 + 0.006 * pw + 0.004 * (1 - (s.rear ?? 0.5)), 0.3); whine.f.frequency.setTargetAtTime(5000 + 900 * pw, A.time(), 0.5); }
      if (thump) thump.set(0.03 + 0.05 * pw, 0.2); if (wind) wind.set(0.004 + 0.03 * v * v, 0.4); // петли ещё грузятся — пока звучит синтез
    },
    // близкий пролёт самолёта: запись пролёта целиком (в ней «над головой» — на 2,6 с); d — промах, м
    jetPass(d, big) {
      const k = Math.min(1, 160 / (d + 60));
      return !!A.clip('jetPass', { vol: 0.75 * k, rate: (big ? 0.85 : 1) * (0.96 + Math.random() * 0.08), cut: 2500 + 12000 * Math.exp(-d / 400), wet: 0.25, fin: 0.3, fout: 2.5 });
    },
    // фон карты в бою: «Туманная топь» — вороны вдали, с разных сторон, с затуханием
    mapAmb(dt, on, kind) {
      if (!on || kind !== 'autumn' || muted || document.hidden) return;
      if ((mamb.t -= dt) > 0) return; mamb.t = rnd(14, 38);
      const dur = rnd(5, 10);
      A.clip('crows', { vol: rnd(0.12, 0.26), rate: rnd(0.94, 1.04), cut: rnd(2400, 4500), wet: rnd(0.45, 0.7), offset: rnd(0, 22.5 - dur * 1.05), dur, fin: rnd(1, 2.2), fout: rnd(2, 3.5), pan: rnd(-0.85, 0.85) });
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
  const PATRIOT_LIKE = new Set(['patriot', 'pac3', 'nasams', 'hawk', 'hawk21']); let bc = 0; // горячий старт из контейнера/направляющей — запись Patriot
  const GUN_RATE = { phalanx: 1, m163: 0.93 }; // M61 20 мм — как в записи (у «Шилки» звук другой — синтез aaa)
  let aaaAcc = 0;
  const sk = {}; let skN = 0; // петли тонов ГСН; skN — сколько кадров ещё звучать без нового вызова growl()
  const guns = new Map(), he = { lo: null, hi: null, beds: null, pw: 0.6 }, mamb = { t: 10 };
  function heliOff() { for (const h of [he.lo, he.hi]) if (h) h.stop(0.35); if (he.beds) for (const b of he.beds) if (b) b.stop(); he.lo = he.hi = he.beds = null; }
  const amb = { on: false, timer: 0, beds: null, next: 0, gust: 0, gustT: 0, mood: 'air', last: '' };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const AMB = { // события: вес по режиму, звук
    jet: [{ air: 5, defense: 3, multi: 2 }, () => { // пролёт вдали: гул нарастает и стихает, полоса «съезжает» (Доплер)
      const t = A.time(), dur = rnd(8, 11), f = A.noise('pink', dur, 0.1, 'bandpass', 300, 0.9, 0, 0.7, false, dur * 0.45);
      if (f) { f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(760, t + dur * 0.45); f.frequency.linearRampToValueAtTime(240, t + dur); }
      A.noise('brown', dur, 0.12, 'lowpass', 140, 0.7, 0.3, 0.6, false, dur * 0.5);
      const w = A.noise('white', dur * 0.8, 0.02, 'bandpass', 2600, 3, 0.4, 0.5, false, dur * 0.35); if (w) w.frequency.linearRampToValueAtTime(1500, t + dur);
    }],
    heli: [{ air: 2, defense: 1, multi: 1 }, () => A.clip('heliFar', { vol: rnd(0.08, 0.15), rate: rnd(0.95, 1.05), cut: rnd(1200, 2600), wet: 0.6, offset: rnd(0, 3), dur: rnd(6.5, 9.5), fin: 2.5, fout: 3, pan: rnd(-0.9, 0.9) })], // патрульный вертолёт вдали (запись Benboncan)
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
