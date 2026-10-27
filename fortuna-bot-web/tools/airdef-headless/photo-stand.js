// Стенд режима «Съёмка» (2026-10-27): сценарии ПВО и автопилот самолёта в безголовом прогоне (как ui-test.js: заглушки страницы, настоящий код игры).
//   deno run -A tools/airdef-headless/photo-stand.js def   — ПВО: для каждого комплекса стороны (во всех эпохах, где он доступен) N секунд съёмки,
//        время до первого пуска / очереди, число пусков за 60 с, самый долгий простой. pvs — против самолётов (air) и «Мульти-волны» (multi).
//   deno run -A tools/airdef-headless/photo-stand.js air   — самолёт: связки × высота (low/mid/high), N минут: сколько раз «врезался» (в съёмке самолёт
//        неуязвим — игра возвращает его на 150 м: считаем эти возвраты), развороты у границы карты, секунд у края карты и дальше 5 км от района целей.
// Переменные: ENDS=1 (ПВО: только первая эпоха комплекса и IV), MAP=city|autumn|winter (по умолчанию city; карта выбирается при загрузке страницы), SIDE=east|west (ПВО), SECS=секунд на прогон,
//   KEYS=ключи через запятую (комплексы или «эпоха:подвеска»), ERAS=1,2,3,4, PVS=air|multi|both, ALTS=low,mid,high, OUT=файл.jsonl (дописывать).
// Время и случайности — по зерну (повторяемость): Date.now стоит на шаге прогона, Math.random — mulberry.
const ARGS = Deno.args, MODE = ARGS[0] || 'def', ENV = (k, d) => Deno.env.get(k) ?? d;
const DEBUG = +ENV('DEBUG', 0), MAP = ENV('MAP', 'city'), SECS = +ENV('SECS', MODE === 'air' ? 180 : 90), OUT = ENV('OUT', '');
let runNo = +(Deno.env.get('RUN0') ?? 0), REP = +(Deno.env.get('REP') ?? 1); const T0 = Date.UTC(2026, 9, 27, 12);
Date.now = () => T0 + runNo * 9973;
{ let s = 20261027; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));

// ── заглушки страницы ──
const noop = () => {};
const ctx2d = () => new Proxy({ createRadialGradient: () => ({ addColorStop: noop }), createLinearGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }) },
  { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const els = new Map();
function el(id) {
  const e = {
    id, style: {}, dataset: {}, innerHTML: '', textContent: '', width: 300, height: 150, _cls: new Set(), children: [],
    classList: { add: (...c) => c.forEach((x) => e._cls.add(x)), remove: (...c) => c.forEach((x) => e._cls.delete(x)), toggle: (c, on) => { const v = on === undefined ? !e._cls.has(c) : on; if (v) e._cls.add(c); else e._cls.delete(c); return v; }, contains: (c) => e._cls.has(c) },
    addEventListener: (t, f) => { (e._ev ||= {})[t] = f; }, removeEventListener: noop, setPointerCapture: noop, releasePointerCapture: noop,
    lastChild: { innerHTML: '', textContent: '' }, querySelector: () => el('q'), querySelectorAll: () => [], getContext: () => ctx2d(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    appendChild: noop, insertBefore: noop, remove: noop, closest: () => null, focus: noop, offsetWidth: 1, parentNode: null, toBlob: noop, toDataURL: () => '',
  };
  return e;
}
const byId = (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
const store = { fortuna_airdef_setup: JSON.stringify({ game: 'photo', pside: MODE === 'air' ? 'air' : 'def', pmap: MAP, era: 4, side: 'east', diff: 'arcade' }) };
Object.assign(globalThis, {
  window: globalThis, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
  document: { getElementById: byId, createElement: () => el('new'), createElementNS: () => el('ns'), body: el('body'), documentElement: el('html'), addEventListener: noop, hidden: false },
  matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop,
  location: { search: `?test=1&gfx=low&weather=day&map=${MAP}${ENV('QS', '')}`, href: 'http://x/airdef.html' },
});
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, configurable: true, writable: true });
let rafCb = null; globalThis.requestAnimationFrame = (f) => { rafCb = f; return 1; };
class FakeRenderer {
  constructor() { this.shadowMap = { enabled: false, autoUpdate: true }; this.capabilities = { isWebGL2: true, getMaxAnisotropy: () => 4 }; this.toneMapping = 0; this.outputEncoding = 0; this.toneMappingExposure = 1; this.autoClear = true; this._pr = 1; this.domElement = el('c'); this.info = { memory: {}, programs: [], render: { calls: 0, triangles: 0 }, reset() {} }; }
  setPixelRatio(p) { this._pr = p; } getPixelRatio() { return this._pr; } setSize() {} render() {} compile() {} setRenderTarget() {} getRenderTarget() { return null; }
  setScissor() {} setScissorTest() {} setViewport() {} clear() {} getContext() { return {}; } getClearColor(c) { return c; } getClearAlpha() { return 1; } setClearColor() {}
}
THREE.WebGLRenderer = FakeRenderer;

const errors = [];
console.error = (...a) => { errors.push(a.join(' ')); };
await import('../../games/airdef/main.js');
for (let i = 0; i < 300 && !(globalThis.__a && globalThis.__a.state === 'menu'); i++) await new Promise((r) => setTimeout(r, 100));
const C = globalThis.__a;
const { SAM, LOADOUTS, PLANES, AG } = await import('../../games/airdef/arsenal.js?v=20261027b');
const { combinedOk } = await import('../../games/airdef/sim/combined.js?v=20261027b');
const { CITY } = await import('../../games/airdef/city.js?v=20261027b');
let now = 1000; const DT = 1 / 30;
function frame() { now += DT * 1000; const f = rafCb; rafCb = null; C.paused = false; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return false; } return true; }
const out = (o) => { const s = JSON.stringify(o); console.log(s); if (OUT) Deno.writeTextFileSync(OUT, s + '\n', { append: true }); };
const r1 = (v) => Math.round(v * 10) / 10;
const list = (k, d) => (ENV(k, '') ? ENV(k, '').split(',') : d);

// ── ПВО ──
if (MODE === 'def') {
  const sides = ENV('SIDE', 'both') === 'both' ? ['east', 'west'] : [ENV('SIDE')], eras = list('ERAS', ['1', '2', '3', '4']).map(Number), pvss = ENV('PVS', 'both') === 'both' ? ['air', 'multi'] : [ENV('PVS')];
  const only = list('KEYS', null);
  for (const side of sides) for (const era of eras) for (const key of Object.keys(SAM)) {
    const S0 = SAM[key]; if (S0.side !== side || S0.era > era || (only && !only.includes(key))) continue;
    if (ENV('ENDS', '') && era !== S0.era && era !== 4) continue; // ENDS=1 — только первая эпоха комплекса и последняя (вдвое быстрее)
    for (const pvs of pvss) for (let rep = 0; rep < REP; rep++) {
      const att = side === 'east' ? 'west' : 'east';
      if (pvs === 'multi' && !combinedOk(att, era)) continue;
      runNo++;
      C.toMenu(); for (let i = 0; i < 3; i++) frame();
      Object.assign(C.setup, { game: 'photo', pside: 'def', pvs, era, side, psam: key }); C.start('photo');
      const hero = C.S.units[C.S.units.length - 1];
      if (!hero || hero.key !== key) { out({ mode: 'def', map: MAP, side, era, key, pvs, err: 'герой не найден' }); continue; }
      const ev = [], seen = new Set(); let wasGun = false, t = 0, ok = true, killed = 0;
      for (let i = 0; i < SECS * 30 && ok; i++) {
        ok = frame(); t += DT;
        for (const m of C.S.sams) if (m.unit === hero && !seen.has(m.id)) { seen.add(m.id); ev.push(t); }
        if (hero.gunOn && !wasGun) ev.push(t); wasGun = !!hero.gunOn;
        if (DEBUG && i % 90 === 0) { // раз в 3 с: ближайшая цель комплекса, захват, реакция
          const ts = [...C.raid.alive(), ...C.S.wpns.filter((w) => !w.dead && w.ev)]; let n = null, bd = 1e12; for (const q of ts) { const d = q.pos.distanceTo(hero.pos); if (d < bd) { bd = d; n = q; } }
          if (DEBUG === 3) console.log('     ' + C.raid.planes.filter((q) => !q.dead && !q.out).map((q) => `${q.role}/${q.phase} ${Math.round(q.pos.distanceTo(hero.pos))}м load ${(q.load || []).map((l) => l.key + l.n).join(',')} sOut ${q.sOut} bombs ${C.S.wpns.filter((w) => w.owner === q && !w.dead).length} t${Math.round(q.t)}`).join(' | '));
          if (DEBUG === 4) console.log('     ' + C.S.sams.filter((m) => m.unit === hero).map((m) => `${m.dead ? 'x' : ''}m${m.id} цель ${m.target && (m.target.W ? m.target.key : m.target.role)} t${m.t.toFixed(0)} lost ${m.lost} ${Math.round(m.pos.distanceTo(hero.pos))}м cool ${hero.cool.toFixed(1)} hold ${hero.hold} man ${hero.manual}`).join(' | '));
          if (DEBUG === 2) console.log('     ' + ts.map((q) => ({ d: q.pos.distanceTo(hero.pos), s: `${q.W ? q.key : q.role + '/' + q.phase}:${Math.round(q.pos.distanceTo(hero.pos))}м agl${Math.round(q.pos.y - C.city.groundH(q.pos.x, q.pos.z))}` })).sort((x, y) => x.d - y.d).slice(0, 5).map((x) => x.s).join(' | '));
          console.log(`  t${t.toFixed(0)} самолётов ${C.raid.alive().length}/${C.raid.planes.length} оружия ${C.S.wpns.filter((w) => !w.dead && w.ev).length} ближняя ${n ? (n.W ? n.key : n.role) + ' ' + Math.round(bd) + ' м, над землёй ' + Math.round(n.pos.y - C.city.groundH(n.pos.x, n.pos.z)) : '-'} track ${hero.track ? (hero.track.W ? hero.track.key : hero.track.role) : '-'} seeT ${hero.seeT.toFixed(1)} react ${hero.reactT.toFixed(1)} ammo ${Math.round(hero.ammo)} reload ${hero.reloadT.toFixed(0)} emit ${hero.emit}`);
        }
      }
      const first = ev.length ? ev[0] : null, n60 = ev.filter((x) => x <= 60).length;
      let gap = first === null ? SECS : first; for (let i = 1; i < ev.length; i++) gap = Math.max(gap, ev[i] - ev[i - 1]); if (ev.length) gap = Math.max(gap, SECS - ev[ev.length - 1]);
      out({ mode: 'def', map: MAP, side, era, key, pvs, run: runNo, first: first === null ? null : r1(first), n60, total: ev.length, maxGap: r1(gap), jam: S0.type === 'jammer' || undefined });
    }
  }
}

// ── самолёт ──
if (MODE === 'air') {
  const PALT = { low: 250, mid: 1500, high: 4000 };
  const alts = list('ALTS', ['low', 'mid', 'high']);
  const combos = list('KEYS', ['4:0', '4:4', '2:11', '3:13', '1:6']).map((s) => s.split(':').map(Number)); // эпоха:подвеска
  for (const [era, lo] of combos) for (const palt of alts) for (let rep = 0; rep < REP; rep++) {
    runNo++;
    C.toMenu(); for (let i = 0; i < 3; i++) frame();
    Object.assign(C.setup, { game: 'photo', pside: 'air', era, side: LOADOUTS[era][lo].side === 'west' ? 'east' : 'west', palt, lo }); C.start('photo'); // ПВО города — противоположная сторона
    const A = C.ctrls.air, cr = A.craft, crashes = [], saySeen = []; let t = 0, ok = true;
    const hist = [];
    C.say = (m) => { if (/Учебный вылет: высоту вернули/.test(m)) { crashes.push(t); if (DEBUG) console.log(`  ВРЕЗАНИЕ t${t.toFixed(1)}: ` + hist.map((h) => h.join(' ')).join(' | ')); } };
    let yaw0 = cr.yaw, flips = 0, nearEdge = 0, far5 = 0, maxFar = 0, minClr = 1e9, farRun = 0, maxFarRun = 0, outside = 0, hit0 = 0;
    const tg = () => A.game.targets.filter((o) => !o.dead);
    for (let i = 0; i < SECS * 30 && ok; i++) {
      ok = frame(); t += DT;
      const p = cr.pos, e = Math.max(Math.abs(p.x), Math.abs(p.z));
      if (Math.abs(Math.atan2(Math.sin(cr.yaw - yaw0), Math.cos(cr.yaw - yaw0))) > 2.5) flips++; yaw0 = cr.yaw;
      if (e > CITY.HALF) outside += DT; if (e > CITY.HALF - 2500) nearEdge += DT;
      let d = 1e9; for (const o of tg()) d = Math.min(d, Math.hypot(o.x - p.x, o.z - p.z)); if (d < 1e9) { maxFar = Math.max(maxFar, d); if (d > 5000) { far5 += DT; farRun += DT; maxFarRun = Math.max(maxFarRun, farRun); } else farRun = 0; }
      minClr = Math.min(minClr, p.y - C.city.topAt(p.x, p.z));
      if (i % 8 === 0) { hist.push([t.toFixed(1), Math.round(p.x), Math.round(p.z), 'y' + Math.round(p.y), 'agl' + Math.round(p.y - C.city.topAt(p.x, p.z)), 'p' + cr.pitch.toFixed(2), 'v' + Math.round(cr.speed), 'vy' + Math.round(cr.vel.y)]); if (hist.length > 10) hist.shift(); }
      if (DEBUG && i % 150 === 0) console.log(`  t${t.toFixed(0)} до ближней цели ${d < 1e9 ? Math.round(d) : '-'} м, целей ${tg().length}, пос. ${Math.round(p.x)},${Math.round(p.z)} h ${Math.round(p.y)} v ${Math.round(cr.speed)} оружие в воздухе ${C.S.wpns.filter((w) => w.owner === cr && !w.dead).length}`);
    }
    out({ mode: 'air', map: MAP, run: runNo, era, lo, plane: cr.model || (LOADOUTS[era][lo] && LOADOUTS[era][lo].plane), palt, secs: SECS, crashes: crashes.length, flips, outside: r1(outside), nearEdge: r1(nearEdge), far5: r1(far5), maxFarKm: r1(maxFar / 1000), maxFarRun: r1(maxFarRun), minClr: Math.round(minClr), crashAt: crashes.slice(0, 6).map(r1) });
  }
}

// ── кнопка «Пуск» (F): нажатие сразу после старта и раз в 3 с; ожидание — от нажатия до появления ракеты / бомбы / очереди ──
const press = () => C.ctrl.onKey({ code: 'KeyF', repeat: false, preventDefault() {} }, true);
const PRESSES = +ENV('PRESSES', 5);
// n кадров подряд; cond() проверяется после каждого — вернуть число кадров до первого true (или null)
const waitFor = (cond, max = 45) => { for (let f = 0; f <= max; f++) { if (cond()) return f; if (f < max) frame(); } return null; };
if (MODE === 'fdef') {
  const sides = ENV('SIDE', 'both') === 'both' ? ['east', 'west'] : [ENV('SIDE')], eras = list('ERAS', ['1', '2', '3', '4']).map(Number), pvss = ENV('PVS', 'both') === 'both' ? ['air', 'multi'] : [ENV('PVS')];
  const only = list('KEYS', null);
  for (const side of sides) for (const era of eras) for (const key of Object.keys(SAM)) {
    const S0 = SAM[key]; if (S0.side !== side || S0.era > era || (only && !only.includes(key))) continue;
    if (ENV('ENDS', '') && era !== S0.era && era !== 4) continue;
    for (const pvs of pvss) {
      const att = side === 'east' ? 'west' : 'east';
      if (pvs === 'multi' && !combinedOk(att, era)) continue;
      runNo++;
      C.toMenu(); for (let i = 0; i < 3; i++) frame();
      Object.assign(C.setup, { game: 'photo', pside: 'def', pvs, era, side, psam: key }); C.start('photo');
      const hero = C.S.units[C.S.units.length - 1];
      if (!hero || hero.key !== key) { out({ mode: 'fdef', map: MAP, side, era, key, pvs, err: 'герой не найден' }); continue; }
      const waits = []; let cam = null;
      frame();
      for (let i = 0; i < PRESSES; i++) {
        let top = -1; for (const m of C.S.sams) if (m.unit === hero && m.id > top) top = m.id;
        const wasGun = !!hero.gunOn; if (S0.type === 'guns') { hero.gunOn = false; hero.gunForce = 0; }
        press();
        const w = waitFor(() => { for (const m of C.S.sams) if (m.unit === hero && m.id > top) return true; return S0.type === 'guns' && hero.gunOn; });
        waits.push(w === null ? null : w / 30);
        for (let f = 0; f < 90; f++) frame();
      }
      const ok = waits.filter((x) => x !== null);
      out({ mode: 'fdef', map: MAP, side, era, key, pvs, presses: PRESSES, fired: ok.length, maxWait: ok.length ? r1(Math.max(...ok) * 100) / 100 : null, waits: waits.map((x) => (x === null ? 'нет' : x)), jam: S0.type === 'jammer' || undefined });
    }
  }
}
if (MODE === 'fair') {
  const combos = list('KEYS', ['4:0', '4:4', '2:11', '3:13', '1:6']).map((s) => s.split(':').map(Number));
  for (const [era, lo] of combos) for (const subj of list('SUBJ', ['ship', 'st'])) {
    runNo++;
    C.toMenu(); for (let i = 0; i < 3; i++) frame();
    Object.assign(C.setup, { game: 'photo', pside: 'air', era, side: LOADOUTS[era][lo].side === 'west' ? 'east' : 'west', palt: ENV('PALT', 'mid'), lo }); C.start('photo');
    const A = C.ctrls.air, cr = A.craft;
    for (let i = 0; i < 90; i++) frame(); // самолёт летит к цели
    if (subj === 'st') { C.ctrl.onKey({ code: 'ArrowDown', preventDefault() {} }, true); frame(); } // объект съёмки — оружие на первом пилоне
    const waits = [], dists = [], keys = []; let decoys = 0;
    for (let i = 0; i < PRESSES; i++) {
      let top = -1; for (const w of C.S.wpns) if (w.owner === cr && w.id > top) top = w.id;
      let nw = null; const ld0 = A.loadout.map((l) => l.key + l.n).join(','); press();
      const w = waitFor(() => { for (const q of C.S.wpns) if (q.owner === cr && q.id > top) { nw = q; return true; } return false; });
      waits.push(w === null ? null : w / 30); keys.push(nw ? nw.key : null); const ld1 = A.loadout.map((l) => l.key + l.n).join(','); if (!nw && ld0 !== ld1) { keys[keys.length - 1] = 'ложная цель'; decoys++; } else if (DEBUG && !nw) console.log('  нет оружия после нажатия:', ld0, '→', ld1, 'dead', cr.dead, 'over', A.game.over);
      for (let f = 0; f < 15; f++) frame();
      dists.push(nw && !nw.dead ? Math.round(C.camera.position.distanceTo(nw.pos)) : null);
      for (let f = 0; f < 75; f++) frame();
    }
    const ok = waits.filter((x) => x !== null);
    out({ mode: 'fair', map: MAP, era, lo, plane: LOADOUTS[era][lo].plane, subj, presses: PRESSES, fired: ok.length + decoys, maxWait: ok.length ? Math.max(...ok) : null, camNear: dists.filter((d) => d !== null && d < 120).length, dists, keys });
  }
}
if (MODE === 'fmulti') {
  const { photoItems } = await import('../../games/airdef/photo.js?v=20261027b');
  for (const side of (ENV('SIDE', 'both') === 'both' ? ['east', 'west'] : [ENV('SIDE')])) {
    const att = side === 'east' ? 'west' : 'east';
    for (const [k, via] of photoItems(att)) {
      if (list('KEYS', null) && !list('KEYS', null).includes(k)) continue;
      runNo++;
      C.toMenu(); for (let i = 0; i < 3; i++) frame();
      Object.assign(C.setup, { game: 'photo', pside: 'multi', era: 4, side, pmun: k }); C.start('photo');
      const waits = []; frame();
      for (let i = 0; i < PRESSES; i++) {
        let top = -1; for (const w of C.S.wpns) if (w.ev && w.key === k && w.id > top) top = w.id;
        press();
        const w = waitFor(() => C.S.wpns.some((q) => q.ev && q.key === k && q.id > top), 60);
        waits.push(w === null ? null : w / 30);
        for (let f = 0; f < 90; f++) frame();
      }
      const ok = waits.filter((x) => x !== null);
      out({ mode: 'fmulti', map: MAP, side, key: k, via: via || undefined, presses: PRESSES, fired: ok.length, maxWait: ok.length ? Math.max(...ok) : null, waits: waits.map((x) => (x === null ? 'нет' : x)) });
    }
  }
}
if (errors.length) console.log('ОШИБКИ:', errors.slice(0, 5).join(' | ').slice(0, 800));
Deno.exit(errors.length ? 1 : 0);
