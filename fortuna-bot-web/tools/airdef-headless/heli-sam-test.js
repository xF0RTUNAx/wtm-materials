// Вертолёт против ПВО (2026-10-22, Mark: «ракеты вертолётов промахиваются или не наносят урон — в том числе по ПВО»): вылет Ми-28Н на
// «Туманной топи» в безголовом прогоне (как event-test.js), на открытых местах у объектов — свои «Тор», «Роланд», «Гепард», «Стингер»;
// с тех сторон, откуда машину видно, — «Подскок» (E) с ПТУР «Атака» (3 км) и с НАР С-8 (1,8 км), цель выбрана в контейнере (как клавишей R).
// Проверки: подскок не подменяет выбранную цель; ПТУР пущен в 3/4 подскоков и каждый уничтожает комплекс; НАР: залп в 60 % подскоков, 3/4 залпов — с уроном.
//   deno run -A tools/airdef-headless/heli-sam-test.js
// случайности — по зерну, время стоит (зерно боя в air.js — от Date.now(): цели задания, разброс НАР) — прогон повторяется
{ const T0 = Date.UTC(2026, 9, 22, 12); Date.now = () => T0; }
{ let s = 20261022; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));

// ── заглушки страницы ──
const noop = () => {};
const ctx2d = () => new Proxy({ createRadialGradient: () => ({ addColorStop: noop }), createLinearGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) },
  { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const els = new Map(); const made = [];
function el(id) {
  const e = {
    id, style: {}, dataset: {}, innerHTML: '', textContent: '', width: 300, height: 150, _cls: new Set(), children: [],
    classList: { add: (...c) => c.forEach((x) => e._cls.add(x)), remove: (...c) => c.forEach((x) => e._cls.delete(x)), toggle: (c, on) => { const v = on === undefined ? !e._cls.has(c) : on; if (v) e._cls.add(c); else e._cls.delete(c); return v; }, contains: (c) => e._cls.has(c) },
    addEventListener: (t, f) => { (e._ev ||= {})[t] = f; }, removeEventListener: noop, setPointerCapture: noop, releasePointerCapture: noop,
    querySelector: () => el('q'), querySelectorAll: () => [], getContext: () => ctx2d(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    appendChild: noop, insertBefore: noop, remove: noop, closest: () => null, focus: noop, offsetWidth: 1, parentNode: null,
    toBlob: noop, toDataURL: () => '',
  };
  return e;
}
const byId = (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
const store = { fortuna_airdef_setup: JSON.stringify({ game: 'air', era: 3, side: 'west', lo: 17, diff: 'arcade' }) };
Object.assign(globalThis, {
  window: globalThis, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
  document: { getElementById: byId, createElement: () => { const e = el('new'); made.push(e); return e; }, createElementNS: () => el('ns'), body: el('body'), documentElement: el('html'), addEventListener: noop, hidden: false },
  matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop,
  location: { search: '?test=1&gfx=low&heli=h_mi28&go=air&weather=a_eve', href: 'http://x/airdef.html' },
});
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, configurable: true, writable: true });
let rafCb = null; globalThis.requestAnimationFrame = (f) => { rafCb = f; return 1; };
// рендерер-заглушка: все вызовы WebGL — пустые
class FakeRenderer {
  constructor() { this.shadowMap = { enabled: false, autoUpdate: true }; this.capabilities = { isWebGL2: true, getMaxAnisotropy: () => 4 }; this.toneMapping = 0; this.outputEncoding = 0; this.toneMappingExposure = 1; this.autoClear = true; this._pr = 1; this.domElement = el('c'); }
  setPixelRatio(p) { this._pr = p; } getPixelRatio() { return this._pr; } setSize() {} render() {} compile() {} setRenderTarget() {} getRenderTarget() { return null; }
  setScissor() {} setScissorTest() {} setViewport() {} clear() {} getContext() { return {}; } getClearColor(c) { return c; } getClearAlpha() { return 1; } setClearColor() {}
}
THREE.WebGLRenderer = FakeRenderer;

const errors = [];
const origErr = console.error; console.error = (...a) => { errors.push(a.join(' ')); };
await import('../../games/airdef/main.js');
for (let i = 0; i < 400 && !(globalThis.__a && globalThis.__a.state === 'play'); i++) await new Promise((r) => setTimeout(r, 100));
const { spotNear } = await import('../../games/airdef/mission.js?v=20261028a');
const C = globalThis.__a, A = C.ctrls.air, city = C.city;
let now = 1000;
function frames(n, dt = 1000 / 30) { for (let i = 0; i < n; i++) { now += dt; const f = rafCb; rafCb = null; C.paused = false; try { f(now); } catch (e) { errors.push(`кадр: ${e.stack}`); return false; } } return true; }
const check = (name, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); };
check(`вылет на вертолёте (${A.craft.hm && A.craft.hm.key}) на «Туманной топи», есть ПТУР и НАР`, A.craft.heli && city.kind === 'autumn' && A.loadout.some((l) => l.key === 'ataka') && A.loadout.some((l) => l.key === 's8'));
// свои комплексы: случайные ИИ-расстановки (часто в оврагах) — убрать; новые — у объектов карты, на ровном и открытом месте
for (const u of [...C.S.units]) C.S.removeUnit(u);
let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
const T = city.objects.filter((o) => !o.noTarget), keys = ['tor', 'roland', 'gepard', 'stinger'], units = []; // у объектов карты по порядку (не у целей задания)
for (let i = 0; i < keys.length; i++) { const o = T[i % T.length], [x, z] = spotNear(city, rnd, o.x, o.z, 500, 900, false); units.push(C.S.addUnit(keys[i], x, z, { yaw: rnd() * 6.28 })); }
frames(5);
function trial(u, ang, D, wkey) {
  u.dead = false; u.hp = u.S.hp; u.known = true; u.ammo = 0; u.emit = false; // не стреляет: проверяем только оружие вертолёта
  for (const l of A.loadout) { l.n = l.key === wkey ? (wkey === 'ataka' ? 8 : 2) : 0; l.rs = undefined; }
  for (const w of C.S.wpns) w.dead = true; for (const m of C.S.sams) m.dead = true;
  const x = u.pos.x + Math.sin(ang) * D, z = u.pos.z + Math.cos(ang) * D;
  A.place({ x, y: city.topAt(x, z) + 30, z, yaw: Math.atan2(-(u.pos.x - x), -(u.pos.z - z)) }); A.craft.hp = 100; A.craft.dead = false; A.pop.st = 0;
  Object.assign(A.pod, { tgt: u, lock: null, acq: 0, why: '', chkT: 0 }); // цель выбрана в контейнере (как R / «ЦЕЛЬ»)
  for (let i = 0; i < 4 && !(A.curW() && A.curW().key === wkey); i++) A.nextWeapon();
  frames(20); A.onKey({ code: 'KeyE', repeat: false, preventDefault() {} }, true); A.onKey({ code: 'KeyE', repeat: false, preventDefault() {} }, false);
  const popT = A.pop.tgt, seen = new Set(); let t = 0, maxSt = 0;
  while (t < 40) {
    frames(15); t += 0.5; if (A.pop.st > 0 && A.pop.st < 4) maxSt = Math.max(maxSt, A.pop.st);
    for (const w of C.S.wpns) if (w.owner === A.craft && !seen.has(w)) seen.add(w);
    if (seen.size && [...seen].every((w) => w.dead) && !A.pop.st) break; if (!seen.size && !A.pop.st && t > 3) break;
  }
  const near = seen.size ? Math.min(...[...seen].map((w) => w.pos.distanceTo(u.pos))) : null;
  return { popT, maxSt, fired: seen.size, near, killed: u.dead, dmg: u.S.hp - Math.max(0, u.hp) };
}
const R = { ataka: [], s8: [] };
// стороны, откуда машину видно с 50 м (за холмом подскок честно пишет «цель не показалась» — это не промах оружия): до 4 из 24
const sides = (u, D) => { const out = []; for (let k = 0; k < 24 && out.length < 4; k++) { const a = k * Math.PI / 12, x = u.pos.x + Math.sin(a) * D, z = u.pos.z + Math.cos(a) * D;
  if (city.waterAt(x, z) || Math.hypot(x, z) > 14000) continue; if (city.los(x, city.topAt(x, z) + 50, z, u.pos.x, u.pos.y + 2, u.pos.z, 4)) out.push(+a.toFixed(2)); } return out; };
for (const wkey of ['ataka', 's8']) for (const u of units) for (const ang of sides(u, wkey === 'ataka' ? 3000 : 1800)) {
  const r = trial(u, ang, wkey === 'ataka' ? 3000 : 1800, wkey); R[wkey].push({ u, ang, ...r });
  console.log(`  ${wkey.padEnd(5)} ${u.key.padEnd(8)} ∠${ang}: ${r.popT && r.popT !== u ? 'ПОДСКОК ВЗЯЛ ДРУГУЮ ЦЕЛЬ, ' : ''}${r.fired ? `пущено ${r.fired}, ближний разрыв ${r.near.toFixed(0)} м → ${r.killed ? 'уничтожен' : `урон ${r.dmg.toFixed(0)}`}` : r.maxSt >= 2 ? 'увидел, пуска нет' : 'цель не показалась'}`);
}
const all = [...R.ataka, ...R.s8], at = R.ataka.filter((r) => r.fired), nr = R.s8.filter((r) => r.fired);
check(`подскок берёт цель контейнера (подмен: ${all.filter((r) => r.popT && r.popT !== r.u).length})`, all.every((r) => !r.popT || r.popT === r.u));
check(`ПТУР: пущено ${at.length} из ${R.ataka.length}, уничтожено ${at.filter((r) => r.killed).length}`, R.ataka.length >= 8 && at.length >= R.ataka.length * 0.75 && at.every((r) => r.killed));
check(`ПТУР: увидел цель — пустил (без пуска при видимой цели: ${R.ataka.filter((r) => !r.fired && r.maxSt >= 2).length})`, R.ataka.every((r) => r.fired || r.maxSt < 2));
check(`НАР: залпов ${nr.length} из ${R.s8.length}, уничтожено ${nr.filter((r) => r.killed).length}, с уроном ${nr.filter((r) => r.dmg > 0).length}`, R.s8.length >= 8 && nr.length >= R.s8.length * 0.6 && nr.filter((r) => r.dmg > 0).length >= nr.length * 0.75);
console.log(errors.length ? `\nИТОГ: ошибок ${errors.length}\n${errors.slice(0, 5).join('\n')}` : '\nИТОГ: ошибок нет');
Deno.exit(errors.length ? 1 : 0);
