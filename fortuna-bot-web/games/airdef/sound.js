// Звук «Воздушного превосходства»: движок и синтез — из «Летки» (drone/audio.js: двигатель, объёмные голоса самолётов
// и ракет, взрывы с задержкой по скорости звука, «гарнитура» для бортовых сигналов). Здесь — звуки этой игры из тех же
// кирпичей (A.noise / A.tone): старт ЗУР, очереди зениток, сброс бомб, тоны СПО и датчика пуска, пульт оператора ПВО.
import { createAudio } from '../drone/audio.js?v=20261010g';

export function createSound() {
  const A = createAudio();
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* приватный режим */ } } };
  let vol = +(ls.get('fortuna_airdef_vol') ?? 0.8); if (!(vol >= 0 && vol <= 1)) vol = 0.8;
  let muted = ls.get('fortuna_airdef_mute') === '1';
  A.setVolume(vol); A.setMuted(muted);
  const delayOf = (d) => Math.min(2.5, d / 343);
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
    explosion(d, size) { A.explosion(d, size); },
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
    // своё оружие: «клац» замка держателя, у ракет — ещё рёв двигателя
    release(missile) { A.noise('brown', 0.12, 0.3, 'lowpass', 220); A.noise('white', 0.05, 0.12, 'bandpass', 2500, 1.2); if (missile) A.launch(); },
    // свист падающей бомбы рядом с камерой
    whistle(d) { const k = near(d, 300); if (k < 0.15) return; A.tone('sine', 1500, 500, 2.4, 0.04 * k, 0, 0.3); },
    // бортовые сигналы
    click() { A.tone('square', 1800, 1800, 0.025, 0.03, 0, 0, true); },
    lock() { A.beep(1300, 0.08, 'square', 0.05); A.beep(1700, 0.1, 'square', 0.05); },
    unlock2() { A.beep(700, 0.12, 'square', 0.04); },
    deny() { A.beep(240, 0.18, 'square', 0.05); },
    laser(on) { A.beep(on ? 2200 : 1100, 0.06, 'sine', 0.04); },
    alarm() { A.beep(900, 0.15, 'sawtooth', 0.05, -300); },
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
  };
  return S;
}
