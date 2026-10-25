// «Съёмка» — свободная камера для красивых кадров. Всё время идёт автобой:
//   «Самолёт» — выбранный самолёт с выбранной подвеской: автопилот летит по целям, сам сбрасывает и пускает, ставит ловушки;
//     урона не получает, опустевшая подвеска пополняется сразу;
//   «ПВО» — выбранный комплекс у цели (неуязвим, быстрая перезарядка) отражает бесконечные налёты: самолёты или «Мульти-волну»;
//   «Мульти-волна» — выбранное оружие (дрон, крылатая ракета с носителем, баллистика с пусковой) снова и снова идёт на город с ИИ-ПВО.
// Камера: «объект» (самолёт, каждое оружие на подвеске — до пуска и в полёте до разрыва, ракета ПВО, комплекс, цель…) ×
// «ракурс» (сзади, сбоку, спереди, снизу, сверху, облёт, пролёт / издалека, «Борт» — камера на самом объекте, «Центр» — объект
// неподвижно в центре кадра). Ракурс подстраивается: тянуть по экрану — вокруг
// объекта (по горизонтали и вертикали), щипок, колесо и ＋/－ — ближе или дальше, «зум» — угол поля зрения.
// ◎ прячет весь интерфейс (тап по экрану — вернуть); скорость ×1 / ×½ / ×¼ / стоп-кадр (камеру можно крутить и на стопе).
/* global THREE */
import { mulberry32 } from './city.js?v=20261025a';
import { AG, SAM, CARRIERS, COMBINED, PLANES, LOADOUTS, multiItems } from './arsenal.js?v=20261025a';
import { placeDefense, pickTargets, spotNear } from './mission.js?v=20261025a';
import { createCombined, combinedOk, LIM, LAUNCH_R } from './sim/combined.js?v=20261025a';
import { RAID_HELI } from './sim/raid.js?v=20261025a';
import { fwdOf } from '../drone/sim/core.js?v=20261025a';
import { weaponHasModel } from './models.js?v=20261025a';
import { tr, trIf } from './i18n.js?v=20261025a';

const PI = Math.PI, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// ракурсы: [азимут от курса (0 — спереди, π — сзади), угол над горизонтом, дальность в длинах объекта, + метров]
// mv — у летящего, st — у стоящего (комплекс, пусковая, объект), py — у оружия на пилоне (в осях самолёта, снаружи от пилона)
const ANG = [
  { k: 'chase', n: tr('Сзади'), mv: [PI - 0.12, 0.13, 3, 10], st: [PI - 0.35, 0.22, 2.4, 8], py: [PI - 0.3, -0.05, 1.1, 1.2] },
  { k: 'side', n: tr('Сбоку'), mv: [PI / 2, 0.05, 2.3, 8], st: [PI / 2, 0.1, 2.6, 6], py: [PI / 2 + 0.2, -0.12, 0.9, 1.2] },
  { k: 'front', n: tr('Спереди'), mv: [0.3, 0.06, 2.8, 12], st: [0.8, 0.16, 2.3, 6], py: [0.5, -0.1, 1.1, 1.4] },
  { k: 'below', n: tr('Снизу'), mv: [2.4, -0.5, 1.6, 6], st: [1.1, -0.02, 1.5, 4], py: [2.6, -0.75, 0.8, 1] },
  { k: 'top', n: tr('Сверху'), mv: [PI - 0.4, 1.2, 2.8, 12], st: [0.6, 1.1, 3, 14], py: [PI - 0.5, 0.9, 1.6, 3] },
  { k: 'orbit', n: tr('Облёт'), mv: [0, 0.2, 2.8, 12], st: [0, 0.22, 2.6, 6], py: [0, 0.1, 1.3, 1.5], spin: 0.35 },
  { k: 'far', n: tr('Пролёт'), fixed: true }, // у стоящего — «Издалека» (длинный фокус)
  // «Борт» — камера закреплена на самом самолёте (ракете): у края крыла, у сопла, над передней кромкой; смотрит вдоль корпуса,
  // голова на стабилизаторе (догоняет повороты с запаздыванием), тряска — от манёвров и скорости. Повторный тап — другое место
  { k: 'mount', n: tr('Борт'), mount: true },
  // «Центр» — камера жёстко за объектом в его осях: самолёт стоит в центре кадра при любых манёврах, крутится мир (удобно для монтажа)
  { k: 'lock', n: tr('Центр'), lock: true },
];
// места камеры «Борт»: off — точка крепления, at — куда смотрит; у самолёта — в долях полуразмаха W и длины L (оси модели: x — правое
// крыло, y — верх, z — к хвосту), у ракеты и бомбы — в радиусах корпуса r и длинах L. Половина — зеркально (левое / правое крыло)
const MOUNTS = {
  plane: [
    { n: tr('край крыла → корпус и сопла'), off: [-0.86, 0.0, 0.02], at: [0, 0, 0.22], up: 0.25 },
    { n: tr('у сопла → вперёд'), off: [-0.42, 0.06, 0.56], at: [0, 0.01, -0.4], up: 0.45 },
    { n: tr('передняя кромка → назад'), off: [-0.5, 0.07, -0.2], at: [-0.08, 0, 0.55], up: 0.4 },
  ],
  wpn: [
    { n: tr('у хвоста → вперёд'), off: [-2.6, 1.3, 0.42], at: [0, 0, -0.55] },
    { n: tr('у носа → назад'), off: [-2.6, 1.3, -0.42], at: [0, 0, 0.6] },
  ],
};
const SPD = [1, 0.5, 0.25, 0], SPD_N = ['×1', '×½', '×¼', '❚❚'];
const FOVS = [0, 40, 28, 18, 11]; // 0 — по ракурсу
export const PH_ALT = { low: 250, mid: 1500, high: 4000 };
const SCOUT = { east: 'scout_e', west: 'scout' };
// что можно снять в «Мульти-волне» за сторону удара: разведчик, дроны, крылатые (с носителем), баллистика
export const photoItems = (att, era) => [...(AG[SCOUT[att]] ? [[SCOUT[att], null]] : []), ...multiItems(att, era).map(([k, via]) => [k, via])];
const LIMQ = { ...LIM, spawnR: LAUNCH_R + 230 * 14 }; // носитель — ближе к рубежу пуска (меньше ждать)

export function createPhoto(C, ctrls) {
  const { $, city, camera, setup } = C;
  const V3 = () => new THREE.Vector3();
  const st = { br: 'air', subs: [], subj: 0, ang: 0, adj: { az: 0, el: 0, k: 1 }, fi: 0, spd: 0, clean: false, simT: 0, spin: 0, snap: true,
    hero: null, targets: [], wave: 1, endT: 0, evNext: false, mk: null, via: null, att: 'west', era: 2, rel: new Map(), prevSt: new Map(), fol: {},
    fb: { p: null, s: -1 }, mount: 0, shW: 0, shT: 0, shipW: 6, airTgt: null, cmT: 0, auT: 0, kind: 'mv', capT: 0, shipL: 16 };
  let rnd = Math.random, sayKeep = null;
  const sizeOf = new Map(), BX = new THREE.Box3(), TMP = V3(), TMP2 = V3(), UP = new THREE.Vector3(0, 1, 0);
  function unitR(u) {
    if (sizeOf.has(u.id)) return sizeOf.get(u.id);
    const g = C.unitMeshes.get(u.id); if (!g) return 6;
    const r = Math.max(2.5, BX.setFromObject(g).getSize(TMP).length() * 0.5); sizeOf.set(u.id, r); return r;
  }
  const newest = (arr, ok) => { let m = null; for (const q of arr) if (!q.dead && ok(q) && (!m || q.id > m.id)) m = q; return m; };
  const lenOf = (o) => (o.W ? (o.W.vis ? o.W.vis.L : 5) : o.M ? o.M.L : o.len || 17);
  const kmh = (o) => Math.round((o.speed || (o.vel ? o.vel.length() : 0)) * 3.6);
  const agl = (p) => Math.round(p.y - city.groundH(p.x, p.z));
  const hTxt = (p) => { const h = agl(p); return h > 9999 ? tr('{0} км', [(h / 1000).toFixed(0)]) : tr('{0} м', [h]); };

  // ── объект в кадре: R — точка привязки, курс F, длина L ──
  const R = { kind: 'mv', pos: V3(), F: V3(), U: V3(), L: 10, side: 1, v: 0, cap: '', look: V3(), Q: new THREE.Quaternion(), plane: false, W: 0, r: 0.2 };
  const EU = new THREE.Euler(), M4 = new THREE.Matrix4(), ZERO = new THREE.Vector3();
  function setMv(o, cap) {
    R.kind = 'mv'; R.pos.copy(o.pos); R.L = lenOf(o); R.side = 1; R.cap = cap; R.v = o.speed || (o.vel ? o.vel.length() : 0);
    R.plane = !o.W && !o.M && o.yaw !== undefined; R.W = R.plane ? (o === (ctrls.air && ctrls.air.craft) ? st.shipW : R.L * 0.45) : 0;
    R.r = o.W && o.W.vis ? o.W.vis.r : o.M && o.M.r ? o.M.r : Math.max(0.12, R.L * 0.035);
    if (R.plane) { fwdOf(o, R.F); R.Q.setFromEuler(EU.set(o.pitch, o.yaw, o.roll || 0, 'YXZ')); } // самолёт — по носу, с креном
    else { if (o.vel && o.vel.lengthSq() > 4) R.F.copy(o.vel).normalize(); else if (o.dir) R.F.copy(o.dir).normalize(); else R.F.set(0, 0, -1); qLook(R.F, UP); }
  }
  // ориентация «нос в −Z» по направлению f и верху u (у ракет и бомб — без крена)
  function qLook(f, u) { M4.lookAt(ZERO, f, u); R.Q.setFromRotationMatrix(M4); }
  function setSt(pos, fx, fz, L, cap) { R.kind = 'st'; R.pos.copy(pos); R.F.set(fx, 0, fz); if (R.F.lengthSq() < 1e-6) R.F.set(0, 0, -1); R.F.normalize(); R.L = L; R.side = 1; R.v = 0; R.cap = cap; }
  function setUnit(u, cap) { const r = unitR(u), tp = u.track && !u.track.dead ? u.track.pos : null; setSt(TMP2.copy(u.pos).setY(u.pos.y + r * 0.3), tp ? tp.x - u.pos.x : Math.sin(u.yaw), tp ? tp.z - u.pos.z : Math.cos(u.yaw), r * 2, cap); }
  function setObj(o, from, cap) { const g = city.groundH(o.x, o.z), top = city.topAt(o.x, o.z); setSt(TMP2.set(o.x, (g + top) / 2 + 4, o.z), from ? from.x - o.x : 1, from ? from.z - o.z : 0.3, clamp(Math.max(o.w || 40, o.d || 40) * 0.6, 30, 220), cap); }
  function hold(p, cap) { R.kind = 'hold'; R.look.copy(p); R.cap = cap; }
  // ведём объект до разрыва и ещё 2,5 с смотрим на место (камера стоит), потом — следующий
  function follow(key, pick) {
    const f = st.fol[key] || (st.fol[key] = { o: null, deadT: -1, p: V3() });
    if (f.o && f.o.dead && f.deadT < 0) { f.deadT = st.simT; f.p.copy(f.o.pos); }
    if (f.o && f.deadT >= 0 && st.simT - f.deadT > 2.5) { f.o = null; f.deadT = -1; }
    if (!f.o) { const o = pick(); if (o) { f.o = o; f.deadT = -1; } }
    return f;
  }
  function showF(f, capFn) { if (!f.o) return false; if (f.deadT >= 0) hold(f.p, capFn(f.o, true)); else setMv(f.o, capFn(f.o, false)); return true; }
  const munCap = (w, dead) => `${trIf(w.W.name)}${w.decoy ? tr(' (ложная цель)') : ''}${dead ? tr(' — разрыв') : tr(' · {0} км/ч · {1}', [kmh(w), hTxt(w.pos)])}`;
  const samCap = (m, dead) => tr('Ракета {0}{1}', [trIf(m.S.short), dead ? tr(' — подрыв') : tr(' · {0} км/ч · до цели {1} км', [kmh(m), m.target ? (m.pos.distanceTo(m.target.pos) / 1000).toFixed(1) : '—'])]);

  function resolve() {
    const S = C.S, sub = st.subs[st.subj] || st.subs[0]; R.fb = false;
    if (st.br === 'air') {
      const A = ctrls.air, cr = A.craft, ship = () => setMv(cr, tr('{0} · {1} км/ч · {2}', [st.planeName, kmh(cr), hTxt(cr.pos)]));
      if (sub.id === 'ship') { ship(); R.L = st.shipL; return; }
      if (sub.id === 'st') { // оружие на пилоне; сброшено — летим за ним до разрыва, потом — снова пилон (подвеску пополнят)
        const r = st.rel.get(sub.st);
        if (r) {
          if (r.o.dead && r.deadT < 0) { r.deadT = st.simT; r.p.copy(r.o.pos); }
          if (r.deadT >= 0 && st.simT - r.deadT > 3) st.rel.delete(sub.st);
          else { if (r.deadT >= 0) hold(r.p, munCap(r.o, true)); else setMv(r.o, munCap(r.o, false)); return; }
        }
        A.poseShip();
        const m = A.pylons().find((q) => q.userData.st === sub.st);
        if (!m) { ship(); R.L = st.shipL; R.fb = true; return; }
        R.kind = 'py'; m.getWorldPosition(R.pos); R.F.set(0, 0, -1).applyQuaternion(A.ship.quaternion); R.U.set(0, 1, 0).applyQuaternion(A.ship.quaternion); R.Q.copy(A.ship.quaternion); R.plane = false;
        R.L = AG[sub.key].vis ? AG[sub.key].vis.L : 4; R.r = AG[sub.key].vis ? AG[sub.key].vis.r : 0.2; R.side = m.position.x < 0 ? -1 : 1; R.v = cr.speed;
        R.cap = `${trIf(AG[sub.key].name)} · ${m.visible ? tr('на подвеске') : A.loadout.some((l) => l.st.includes(sub.st)) ? tr('во внутреннем отсеке') : tr('пилон пуст — ждём пополнения')}`;
        return;
      }
      if (sub.id === 'sam') { if (!showF(follow('sam', () => newest(S.sams, (m) => m.target === cr)), samCap)) { ship(); R.L = st.shipL; R.cap = tr('Ракета ПВО: пока не пускали — пока самолёт'); R.fb = true; } return; }
      if (sub.id === 'pvo') { // комплекс: который ведёт самолёт, иначе ближайший
        const f = st.fol.pvo || (st.fol.pvo = { o: null });
        const trk = S.units.find((u) => !u.dead && u.track === cr && u.S.type !== 'jammer');
        if (trk) f.o = trk; else if (!f.o || f.o.dead) { let bd = 1e12; f.o = null; for (const u of S.units) { if (u.dead || u.S.type === 'jammer') continue; const d = u.pos.distanceToSquared(cr.pos); if (d < bd) { bd = d; f.o = u; } } }
        if (f.o) { setUnit(f.o, `${trIf(f.o.S.name)}${f.o.track === cr ? tr(' · ведёт самолёт') : ''}`); return; }
        ship(); R.L = st.shipL; R.fb = true; return;
      }
      const o = st.airTgt || A.game.targets[0]; if (o) { setObj(o, cr.pos, `${trIf(o.name)}${o.dead ? tr(' — уничтожен') : ''}`); return; }
      ship(); R.L = st.shipL; return;
    }
    if (st.br === 'def') {
      const u = st.hero;
      const unit = (why) => setUnit(u, `${trIf(u.S.name)}${why ? ' · ' + why : ''}`);
      if (!u) { R.kind = 'hold'; R.look.set(0, 200, 0); R.cap = ''; return; }
      if (sub.id === 'unit') { unit(u.track ? tr('цель на сопровождении') : u.reloadT > 0 ? tr('перезарядка {0} с', [Math.ceil(u.reloadT)]) : tr('поиск')); return; }
      if (sub.id === 'msl') { if (!showF(follow('msl', () => newest(S.sams, (m) => m.unit === u)), samCap)) { unit(tr('ждём пуска')); R.fb = true; } return; }
      if (sub.id === 'trk') { const t = u.track && !u.track.dead && (!u.track.W || weaponHasModel(u.track.key, u.track.W)) ? u.track : null; if (t) setMv(t, tr('Цель {0}: {1}', [trIf(u.S.short), t.W ? munCap(t, false) : tr('{0} · {1} км/ч · {2}', [t.carrierName ? trIf(t.carrierName) : tr('самолёт'), kmh(t), hTxt(t.pos)])])); else { unit(tr('целей нет')); R.fb = true; } return; }
      if (sub.id === 'plane') { if (!showF(follow('plane', () => { const ps = C.raid.alive().filter((a) => a.role !== 'decoy'); return ps.length ? ps[Math.floor(rnd() * ps.length)] : null; }), (a, dead) => `${a.carrierName ? trIf(a.carrierName) : tr('Ударник налёта')}${dead ? tr(' — сбит') : tr(' · {0} км/ч · {1}', [kmh(a), hTxt(a.pos)])}`)) { unit(tr('ждём налёта')); R.fb = true; } return; }
      if (sub.id === 'heli') { if (!showF(follow('heli', () => { const hs = C.raid.alive().filter((a) => a.heli); return hs.length ? hs[Math.floor(rnd() * hs.length)] : null; }), (a, dead) => tr('Вертолёт налёта{0}', [dead ? tr(' — сбит') : tr(' · {0} км/ч · {1}', [kmh(a), hTxt(a.pos)])]))) { unit(tr('ждём вертолёта')); R.fb = true; } return; }
      if (sub.id === 'mun') { if (!showF(follow('mun', () => newest(S.wpns, (w) => w.ev && !w.W.recon && weaponHasModel(w.key, w.W))), munCap)) { unit(tr('ждём волну')); R.fb = true; } return; }
      const o = st.targets[0]; setObj(o, u.pos, tr('{0} — прикрывает {1}', [trIf(o.name), trIf(u.S.short)])); return;
    }
    // «Мульти-волна»
    const ev = C.ev, W = AG[st.mk];
    const src = () => {
      if (!ev) return false;
      const a = ev.carriers.find((q) => !q.dead && !q.out && q.phase !== 'wait');
      if (a) { setMv(a, `${trIf(a.carrierName)} · ${a.salvo.length ? tr('пуск {0}/{1}', [a.n0 - a.salvo.length, a.n0]) : tr('уходит')} · ${hTxt(a.pos)}`); R.L = a.len || 20; return true; }
      const L = ev.launchers[0];
      if (L) { setSt(TMP2.copy(L.pos).setY(L.pos.y + 3), Math.sin(L.yaw), Math.cos(L.yaw), 13, tr('{0} · пущено {1}/{2}', [trIf(L.name), L.fired, L.n0])); return true; }
      return false;
    };
    const tgt = (cap) => { const w = st.fol.mun && st.fol.mun.o, aim = w && w.aim ? w.aim : null; const o = st.targets[0]; if (aim) setSt(TMP2.copy(aim).setY(aim.y + 6), w.pos.x - aim.x, w.pos.z - aim.z, 60, cap || tr('Точка прицеливания')); else setObj(o, null, cap || trIf(o.name)); };
    const wait = () => { const a = ev && ev.carriers.find((q) => !q.dead && !q.out); return a && a.phase === 'wait' ? tr('носитель вылетит через {0} с', [Math.ceil(a.delay)]) : tr('ждём пуска'); };
    if (sub.id === 'src') { if (!src()) { tgt(`${trIf(W.short)}: ${wait()}`); R.fb = true; } return; }
    if (sub.id === 'mun') { if (!showF(follow('mun', () => newest(C.S.wpns, (w) => w.ev && w.key === st.mk && !w.decoy) || newest(C.S.wpns, (w) => w.ev && w.key === st.mk)), munCap)) { R.fb = true; if (!src()) tgt(`${trIf(W.short)}: ${wait()}`); } return; }
    if (sub.id === 'isam') { if (!showF(follow('isam', () => newest(C.S.sams, (m) => m.target && m.target.ev)), samCap)) { if (!(weaponHasModel(st.mk, AG[st.mk]) && showF(follow('mun', () => newest(C.S.wpns, (w) => w.ev && w.key === st.mk)), munCap))) tgt(tr('ПВО: пока не стреляли')); R.fb = true; } return; }
    tgt();
  }

  // ── камера ──
  const gAt = (x, z) => Math.max(city.groundH(x, z), city.autumn ? city.autumn.WY : -1e9); // земля или вода болота
  const Fs = V3(), Rv = V3(), Uv = V3(), DIR = V3(), WANT = V3(), LW = V3(), OFF = V3(), LOFF = V3(), prevPos = V3(), lookS = V3();
  let curDist = 30, hadPos = false;
  function cameraUpdate(dt) {
    if (st.br === 'air') ctrls.air.poseShip(); // модель — в точку самолёта до кадра (иначе «прыгает»)
    resolve();
    const A = ANG[st.ang];
    if (R.kind !== st.kind) { st.kind = R.kind; farName(); }
    const fov = (shot && shot.f) || FOVS[st.fi] || (A.fixed ? (R.kind === 'st' ? 11 : 32) : A.mount ? 70 : 55); // «Борт» — широкий угол, как экшн-камера
    if (Math.abs(camera.fov - fov) > 0.01 && !(A.fixed && R.kind !== 'st' && st.fb.t > 0 && !FOVS[st.fi] && !(shot && shot.f))) C.setFov(fov); // пролёт: провожаем — фокус свой (ниже)
    if (shot && shot.cam) { const q = shot.cam, g = shot.cg; camera.position.set(q[0], q[1] + (g ? gAt(q[0], q[2]) : 0), q[2]); camera.up.set(0, 1, 0); camera.lookAt(q[3], q[4] + (g ? gAt(q[3], q[5]) : 0), q[5]); return; } // камера в точке [x, y, z, куда x, y, z]; cg — высоты (y) над землёй, а не абсолютные
    if (R.kind === 'hold') { lookS.lerp(R.look, 1 - Math.exp(-dt * 4)); camera.up.set(0, 1, 0); camera.lookAt(lookS); return; }
    const snap = st.snap || !hadPos || prevPos.distanceToSquared(R.pos) > 400 * 400; st.snap = false; prevPos.copy(R.pos); hadPos = true;
    if (snap || R.kind === 'py') Fs.copy(R.F); else Fs.lerp(R.F, 1 - Math.exp(-dt * 5)).normalize();
    Rv.crossVectors(Fs, R.kind === 'py' ? R.U : UP); if (Rv.lengthSq() < 1e-4) Rv.set(1, 0, 0); Rv.normalize(); Uv.crossVectors(Rv, Fs).normalize();
    if (A.fixed && R.kind !== 'st') { // пролёт: точка впереди по курсу, объект проходит мимо; прошёл — новая точка
      // прошёл мимо — ещё 5,5 с провожаем его сзади (камера стоит, поле зрения сужается вслед), потом — новая точка
      const fb = st.fb, ahead = fb.p ? TMP.copy(R.pos).sub(fb.p).dot(Fs) : 0;
      if (fb.p && ahead > R.L * 6 + 40) fb.t = (fb.t || 0) + dt; else if (fb.p) fb.t = 0;
      if (snap || !fb.p || fb.s !== st.subj || fb.t > 5.5 || R.pos.distanceTo(fb.p) > 9000) {
        fb.t = 0;
        const lead = clamp(R.v * 3.2, 80, 1600), sd = Math.sin(st.adj.az) < -0.01 ? -1 : 1;
        fb.p = (fb.p || V3()).copy(R.pos).addScaledVector(Fs, lead).addScaledVector(Rv, (R.L * 2.5 + 18) * st.adj.k * sd).addScaledVector(UP, R.L * 0.3 + st.adj.el * 80);
        fb.p.y = Math.max(fb.p.y, city.topAt(fb.p.x, fb.p.z) + 1.5); fb.s = st.subj; lookS.copy(R.pos);
      }
      camera.position.copy(fb.p); lookS.lerp(R.pos, 1 - Math.exp(-dt * 12)); camera.up.set(0, 1, 0); camera.lookAt(lookS);
      curDist = camera.position.distanceTo(R.pos);
      if (fb.t > 0 && !FOVS[st.fi] && !(shot && shot.f)) { const want = clamp(2 * Math.atan(R.L * 1.6 / curDist) * 180 / PI, 6, fov); C.setFov(camera.fov + (want - camera.fov) * (1 - Math.exp(-dt * 2))); } // уходит — «длинный фокус»: самолёт не тает в точку
      return;
    }
    if ((A.mount || A.lock) && R.kind !== 'st') { mountCam(A, dt, snap); return; }
    let az, el, dist;
    if (A.fixed) { az = 0.9 + st.adj.az; el = clamp(0.08 + st.adj.el, -0.25, 1.4); dist = (R.L * 30 + 250) * st.adj.k; } // издалека, длинным фокусом
    else {
      const p = R.kind === 'py' ? A.py : R.kind === 'st' ? A.st : A.mv;
      if (A.spin) st.spin += dt * A.spin * (R.kind === 'st' ? 0.35 : 1);
      az = p[0] + st.adj.az + (A.spin ? st.spin : 0); el = clamp(p[1] + st.adj.el, -1.45, 1.45); dist = (p[2] * R.L + p[3]) * st.adj.k;
    }
    DIR.copy(Fs).multiplyScalar(Math.cos(el) * Math.cos(az)).addScaledVector(Rv, Math.cos(el) * Math.sin(az) * R.side).addScaledVector(Uv, Math.sin(el));
    WANT.copy(DIR).multiplyScalar(dist);
    if (R.kind === 'st') LW.copy(Uv).multiplyScalar(R.L * 0.12); else LW.copy(Fs).multiplyScalar(A.k === 'front' ? 0 : R.L * 0.5);
    if (snap) { OFF.copy(WANT); LOFF.copy(LW); } else { const k = 1 - Math.exp(-dt * (R.kind === 'py' ? 12 : 5)); OFF.lerp(WANT, k); LOFF.lerp(LW, k); }
    camera.position.copy(R.pos).add(OFF);
    const top = city.topAt(camera.position.x, camera.position.z) + 1; if (camera.position.y < top) camera.position.y = top;
    camera.up.copy(R.kind === 'py' ? Uv : UP); lookS.copy(R.pos).add(LOFF); camera.lookAt(lookS);
    curDist = OFF.length();
  }

  // «Борт» и «Центр»: Q — ориентация объекта, Qs — головы камеры (стабилизатор догоняет), тряска — от скорости поворота и скорости
  const Qs = new THREE.Quaternion(), Qp = new THREE.Quaternion(), QT = new THREE.Quaternion(), OFFL = V3(), ATL = V3(), UPL = V3(), MAT = new THREE.Matrix4();
  const wob = (t, a) => Math.sin(t * 7.3 + a) * 0.5 + Math.sin(t * 13.1 + a * 2.1) * 0.3 + Math.sin(t * 23.7 + a * 3.7) * 0.2; // «шум» из синусов
  function mountCam(A, dt, snap) {
    const run = SPD[st.spd]; st.shT += dt * run;
    const rate = snap ? 0 : 2 * Math.acos(Math.min(1, Math.abs(Qp.dot(R.Q)))) / Math.max(dt * run, 1e-3); Qp.copy(R.Q);
    st.shW += ((Math.min(rate, 2.5) * 0.9 + Math.min(R.v, 400) / 400 * 0.35) - st.shW) * (1 - Math.exp(-dt * 3)); // сила тряски, сглаженная
    if (A.lock) { // жёстко в осях объекта, без запаздывания
      const az = 0.35 + st.adj.az, el = clamp(0.2 + st.adj.el, -1.4, 1.4), d = (R.L * 1.5 + 4) * st.adj.k;
      OFFL.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).applyQuaternion(R.Q);
      camera.position.copy(R.pos).add(OFFL); camera.up.set(0, 1, 0).applyQuaternion(R.Q); camera.lookAt(R.pos);
      curDist = d; R.cap2 = ''; return;
    }
    const set = R.plane ? MOUNTS.plane : MOUNTS.wpn, i = st.mount % (set.length * 2), m = set[i % set.length], sd = i >= set.length ? -1 : 1;
    const W = R.plane ? R.W : 0, L = R.L, r = R.r;
    if (R.plane) { OFFL.set(m.off[0] * W * sd, m.off[1] * L + m.up, m.off[2] * L); ATL.set(m.at[0] * W * sd, m.at[1] * L, m.at[2] * L); }
    else { // на пилоне — под ракетой с наружной стороны (сверху крыло и соседние пилоны)
      const py = R.kind === 'py', s2 = py ? (R.side < 0 ? 1 : -1) : sd, up = py ? -1 : 1;
      OFFL.set(m.off[0] * r * s2 - 0.15 * s2, (m.off[1] * r + 0.06) * up, m.off[2] * L); ATL.set(m.at[0], m.at[1], m.at[2] * L);
    }
    // голова: направление в осях объекта (+ подстройка пальцем) → мировое; стабилизатор догоняет поворот самолёта
    MAT.lookAt(OFFL, ATL, UPL.set(0, 1, 0)); QT.setFromRotationMatrix(MAT);
    QT.multiply(TQ.setFromEuler(EU.set(clamp(st.adj.el, -1, 1) * 0.6, -st.adj.az * 0.6, 0, 'YXZ')));
    QT.premultiply(R.Q);
    if (snap) Qs.copy(QT); else Qs.slerp(QT, 1 - Math.exp(-dt * 9));
    // тряска: мелкое дрожание головы и точки крепления
    const a = st.shW * 0.006 + 0.0008, t = st.shT;
    Qs.multiply(TQ.setFromEuler(EU.set(wob(t, 0.3) * a, wob(t, 1.7) * a, wob(t, 4.1) * a * 0.6, 'YXZ')));
    camera.position.copy(OFFL).applyQuaternion(R.Q).add(R.pos).addScaledVector(Uv, wob(t * 1.3, 2.9) * st.shW * 0.05);
    camera.quaternion.copy(Qs); camera.up.set(0, 1, 0).applyQuaternion(Qs);
    curDist = Math.max(1.6, OFFL.length() * 0.5); R.cap2 = m.n;
  }
  const TQ = new THREE.Quaternion();

  // ── автобой ──
  function airTick(dt) {
    const A = ctrls.air, cr = A.craft, S = C.S;
    let alive = A.game.targets.filter((o) => !o.dead);
    if (!alive.length) { // цели разбиты — новые из уцелевших объектов
      const pool = S.objects.filter((o) => !o.dead && !o.noTarget); if (!pool.length) { newBattle(); return; }
      pool.sort(() => rnd() - 0.5); alive = pool.slice(0, 3); A.retarget(alive);
    }
    if (!st.airTgt || st.airTgt.dead || !alive.includes(st.airTgt)) {
      let bd = 1e12; for (const o of alive) { const d = (o.x - cr.pos.x) ** 2 + (o.z - cr.pos.z) ** 2; if (d < bd) { bd = d; st.airTgt = o; } }
      A.demo({ pt: { x: st.airTgt.x, z: st.airTgt.z }, alt: PH_ALT[setup.palt] || PH_ALT.mid });
    }
    // пуск: какой пилон опустел — за тем оружием и летит камера этого пилона
    const cur = new Map(); for (const l of A.loadout) for (const s of l.st) cur.set(s, l.key);
    for (const [s, key] of st.prevSt) if (!cur.has(s)) { const w = newest(S.wpns, (q) => q.owner === cr && q.key === key); if (w) st.rel.set(s, { o: w, deadT: -1, p: V3() }); }
    st.prevSt = cur;
    // подвеска пуста и в воздухе своего нет — сразу полная; ловушки — при пуске по самолёту
    if ((st.auT += dt) > 0.25) {
      st.auT = 0;
      if (!A.loadout.some((l) => l.n > 0 && AG[l.key].kind !== 'ecm') && !S.wpns.some((w) => w.owner === cr && !w.dead)) { A.rearm(); st.prevSt = new Map(); for (const l of A.loadout) for (const s of l.st) st.prevSt.set(s, l.key); }
      if (cr.cmFlare < 20) cr.cmFlare = cr.cmChaff = 60;
      if ((st.cmT -= 0.25) <= 0 && S.mws(cr).length) { A.cm(); st.cmT = 1.5; }
    }
  }
  function defTick(dt) {
    const u = st.hero;
    if (u && u.reloadT > 5) u.reloadT = 5; // в кадре — почаще пуски
    if (st.vsMulti) evTick(dt, startEvDef);
    else if (C.raid.planes.filter((a) => !a.dead && !a.out).length < 2) { st.wave++; const al = st.targets.filter((o) => !o.dead); C.raid.spawnWave(3 + (st.wave % 3), 2 + (st.wave % 2), al.length ? al : st.targets, 7500 + rnd() * 2500); }
  }
  // волна кончилась (пусков больше не будет, всё долетело) — через 4 с новая; кадр без старых пусковых — сброс C.ev на шаг
  function evTick(dt, again) {
    if (st.evNext) { st.evNext = false; again(); return; }
    if (!C.ev) return;
    C.ev.step(dt);
    if (C.ev.pending() || C.S.wpns.some((w) => w.ev && !w.dead) || C.ev.carriers.some((a) => !a.dead && !a.out)) { st.endT = 0; return; }
    if ((st.endT += dt) > 4) { st.endT = 0; C.ev = null; st.evNext = true; }
  }
  // ПВО против волны: расписание сжато для съёмки — дроны сразу, крылатые через ~15 с, баллистика через ~45 с
  function startEvDef() {
    const plan = {}; for (const [k] of COMBINED[st.att][st.era]) if (!AG[k].recon) plan[k] = { t: AG[k].uav ? 0 : AG[k].kind === 'tbm' ? 45 : 15 };
    C.ev = createCombined(C.S, city, rnd, { side: st.att, era: st.era, raid: C.raid, lim: LIMQ, plan }); C.ev.start(st.targets); evModels();
  }
  function startEvMulti() {
    const W = AG[st.mk], n = W.recon ? 1 : W.kind === 'tbm' ? 2 : st.via ? Math.min(4, CARRIERS[st.via].cap) : 4;
    C.ev = createCombined(C.S, city, rnd, { side: st.att, era: st.era, raid: C.raid, lim: LIMQ, comp: [[st.mk, n, W.uav ? 1 : W.kind === 'tbm' ? 3 : 2, st.via || undefined]], plan: { [st.mk]: { t: 2 } } });
    C.ev.start(st.targets); evModels();
  }
  // готовые модели ракет, пусковых и носителей удара — загрузить (сами они грузятся по требованию)
  function evModels() { if (C.evPreload) C.evPreload(C.ev.comp); if (C.evReady) C.evReady(C.ev); }

  // ── бой ──
  const subsAir = () => {
    const A = ctrls.air, out = [{ id: 'ship', n: st.planeName }];
    for (const l of A.loadout) { if (AG[l.key].kind === 'ecm' || !weaponHasModel(l.key, AG[l.key])) continue; /* без готовой модели — камеру не подводим */ l.st0.forEach((s, j) => out.push({ id: 'st', st: s, key: l.key, n: `${trIf(AG[l.key].short)}${l.st0.length > 1 ? ' ' + (j + 1) : ''}` })); }
    return [...out, { id: 'sam', n: tr('Ракета ПВО') }, { id: 'pvo', n: tr('Комплекс ПВО') }, { id: 'tgt', n: tr('Цель') }];
  };
  function newBattle() {
    { const sd = new URLSearchParams(location.search).get('seed'); rnd = mulberry32(sd ? +sd : (Date.now() & 0xfffff) ^ 0x7a11); } // ?seed= — тот же бой (сравнение кадров)
    st.rel.clear(); st.prevSt = new Map(); st.fol = {}; st.airTgt = null; st.hero = null; st.wave = 1; st.endT = 0; st.evNext = false; sizeOf.clear(); st.snap = true; hadPos = false;
    st.era = setup.era;
    if (st.br === 'air') {
      const A = ctrls.air;
      A.start({ invuln: true, noEnd: true, noIntro: true, reload: true, photo: true, lastGame: 'photo' });
      A.pod.show = false; A.game.opts.photo = true;
      for (const l of A.loadout) for (const s of l.st) st.prevSt.set(s, l.key);
      { const L = LOADOUTS[setup.era][setup.lo]; st.planeName = (L && trIf(PLANES[L.plane])) || tr('Самолёт'); } // модель может ещё грузиться — имя из подвески
      { const b = BX.setFromObject(A.ship).getSize(TMP); st.shipL = clamp(Math.max(b.x, b.z), 8, 40) || 16; st.shipW = clamp(b.x / 2, 3, 30) || 6; }
      st.subs = subsAir();
    } else if (st.br === 'def') {
      const key = SAM[setup.psam] && SAM[setup.psam].side === setup.side && SAM[setup.psam].era <= setup.era ? setup.psam : Object.keys(SAM).find((k) => SAM[k].side === setup.side && SAM[k].era <= setup.era);
      const Sx = SAM[key];
      st.att = setup.side === 'east' ? 'west' : 'east'; st.vsMulti = setup.pvs === 'multi' && combinedOk(st.att, st.era);
      const S = C.newBattle({ defSide: setup.side, era: st.era, rnd });
      C.hooks = { unitDmgK: 0 }; // в кадре ПВО не выбивают — съёмка не обрывается
      st.targets = pickTargets(S, rnd, 3);
      placeDefense(S, city, rnd, setup.side, st.era, st.targets, 0.5);
      const t0 = st.targets[0], roof = Sx.type === 'ir' && Sx.hp <= 15, xz = spotNear(city, rnd, t0.x, t0.z, roof ? 150 : 350, roof ? 900 : 1100, roof);
      st.hero = S.addUnit(key, xz[0], xz[1], { roof: xz[2], skill: 0.95, yaw: rnd() * 6.28 });
      C.syncUnits();
      if (st.vsMulti) startEvDef(); else C.raid.spawnWave(4, 2, st.targets, 7000);
      st.subs = [{ id: 'unit', n: trIf(Sx.short) }, { id: 'msl', n: tr('Его ракета') }, { id: 'trk', n: tr('Его цель') }, st.vsMulti ? { id: 'mun', n: tr('Ракеты и дроны') } : { id: 'plane', n: tr('Самолёт налёта') }, ...(!st.vsMulti && RAID_HELI[st.att] && RAID_HELI[st.att][st.era] ? [{ id: 'heli', n: tr('Вертолёт налёта') }] : []), { id: 'tgt', n: tr('Объект') }];
    } else {
      st.att = setup.side === 'east' ? 'west' : 'east';
      const items = photoItems(st.att, st.era), it = items.find(([k]) => k === setup.pmun) || items[0];
      const S = C.newBattle({ defSide: setup.side, era: st.era, rnd });
      C.hooks = { unitDmgK: 0 };
      st.targets = pickTargets(S, rnd, 3);
      placeDefense(S, city, rnd, setup.side, st.era, st.targets, 0.8);
      C.syncUnits();
      st.mk = it ? it[0] : null; st.via = it ? it[1] : null;
      if (st.mk) startEvMulti();
      const W = AG[st.mk] || { short: '—' };
      st.subs = [...(st.via || (W.kind === 'tbm' && !W.air) ? [{ id: 'src', n: st.via ? trIf(CARRIERS[st.via].name) : tr('Пусковая') }] : []), ...(st.mk && weaponHasModel(st.mk, W) ? [{ id: 'mun', n: trIf(W.short) }] : []), { id: 'isam', n: tr('Ракета ПВО') }, { id: 'tgt', n: tr('Цель') }];
    }
    if (st.subj >= st.subs.length) st.subj = 0;
    renderUi();
  }

  // ── интерфейс ──
  const ui = $('photoUi'), zone = $('photoZone');
  function farName() { const b = $('phAng').querySelector('[data-a="6"]'); if (b) b.textContent = st.kind === 'st' ? tr('Издалека') : tr('Пролёт'); }
  function renderUi() {
    $('phSubj').innerHTML = st.subs.map((s, i) => `<button data-s="${i}" class="${i === st.subj ? 'on' : ''}">${s.n}</button>`).join('');
    $('phAng').innerHTML = ANG.map((a, i) => `<button data-a="${i}" class="${i === st.ang ? 'on' : ''}">${a.n}</button>`).join('');
    farName(); sideTxt();
  }
  function sideTxt() { $('phSpd').textContent = SPD_N[st.spd]; $('phZoom').textContent = FOVS[st.fi] ? `${FOVS[st.fi]}°` : tr('ЗУМ'); }
  const resetAdj = () => { st.adj.az = 0; st.adj.el = 0; st.adj.k = 1; st.fb.p = null; };
  function setClean(on) { st.clean = on; document.body.classList.toggle('clean', on); }
  const pick = (dir, list) => (dir + list.length) % list.length;
  function act(a) {
    if (a === 'near') st.adj.k = clamp(st.adj.k * 0.8, 0.3, 4);
    else if (a === 'far') st.adj.k = clamp(st.adj.k * 1.25, 0.3, 4);
    else if (a === 'zoom') st.fi = (st.fi + 1) % FOVS.length;
    else if (a === 'speed') st.spd = (st.spd + 1) % SPD.length;
    else if (a === 'reset') { resetAdj(); st.fi = 0; st.snap = true; }
    else if (a === 'new') newBattle();
    else if (a === 'hide') setClean(true);
    st.fb.p = null; sideTxt(); C.snd.click();
  }
  ui.addEventListener('pointerdown', (e) => e.stopPropagation());
  ui.addEventListener('click', (e) => {
    const s = e.target.closest('[data-s]'), a = e.target.closest('[data-a]'), b = e.target.closest('[data-ph]');
    if (s) { st.subj = +s.dataset.s; st.snap = true; st.fb.p = null; st.spin = 0; renderUi(); C.snd.click(); }
    else if (a) { if (+a.dataset.a === st.ang && ANG[st.ang].mount) st.mount++; st.ang = +a.dataset.a; resetAdj(); st.snap = true; st.spin = 0; renderUi(); C.snd.click(); } // «Борт» ещё раз — следующее место крепления
    else if (b) act(b.dataset.ph);
  });
  // тянуть — вокруг объекта, два пальца — ближе/дальше, короткий тап при скрытом интерфейсе — вернуть его
  const ptr = new Map(); let tap0 = null, pinch0 = 0;
  const pd = () => { const [a, b] = [...ptr.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  zone.addEventListener('pointerdown', (e) => {
    try { zone.setPointerCapture(e.pointerId); } catch (_) { /* нет */ }
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.size === 1) tap0 = { t: performance.now(), m: 0 }; else { tap0 = null; if (ptr.size === 2) pinch0 = pd(); }
  });
  zone.addEventListener('pointermove', (e) => {
    const p = ptr.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptr.size === 1) { st.adj.az -= dx * 0.006; st.adj.el = clamp(st.adj.el + dy * 0.004, -1.2, 1.2); if (tap0) tap0.m += Math.abs(dx) + Math.abs(dy); if (ANG[st.ang].fixed) st.fb.p = null; }
    else if (ptr.size === 2) { const d = pd(); if (pinch0) st.adj.k = clamp(st.adj.k * pinch0 / d, 0.3, 4); pinch0 = d; }
  });
  const up = (e) => {
    if (!ptr.has(e.pointerId)) return;
    if (tap0 && ptr.size === 1 && tap0.m < 8 && performance.now() - tap0.t < 350 && st.clean) setClean(false);
    ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; if (!ptr.size) tap0 = null;
  };
  zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
  zone.addEventListener('wheel', (e) => { st.adj.k = clamp(st.adj.k * (e.deltaY > 0 ? 1.1 : 0.9), 0.3, 4); e.preventDefault(); }, { passive: false });

  // съёмка кадров для фона меню (tools/airdef-shots/capture.js): ?shot={s: объект (id или key подвески), a: ракурс, az/el/k —
  // подстройка, ox/oy — сдвиг объекта в кадре (рад), f — поле зрения, t — не раньше стольких секунд боя, max — предел}. До t время ×4; объект на месте (не запасной) —
  // стоп-кадр, через ~1,2 с window.__shot = 'ready' (не дождались к max — 'timeout')
  let shot = null; try { const q = C.Q.get('shot'); if (q) shot = JSON.parse(q); } catch (_) { shot = null; }
  function shotApply() {
    if (!shot) return;
    const i = st.subs.findIndex((x) => x.id === shot.s || x.key === shot.s); if (i >= 0) st.subj = i;
    const j = ANG.findIndex((x) => x.k === shot.a); if (j >= 0) st.ang = j;
    st.mount = shot.m || 0; st.adj.az = shot.az || 0; st.adj.el = shot.el || 0; st.adj.k = shot.k || 1; st.snap = true; setClean(true); window.__shot = 'wait'; st.shotT = -1;
  }
  function shotTick(dt) {
    if (!shot || window.__shot === 'ready' || window.__shot === 'timeout') return;
    if (st.shotT >= 0) { if ((st.shotT += dt) > 1.2) window.__shot = 'ready'; return; }
    if (st.simT > (shot.max || 240)) { window.__shot = 'timeout'; return; }
    if (st.simT >= (shot.t || 0) && !R.fb && R.kind !== 'hold') { // объект в кадре; d — ещё столько секунд полёта (ракета успевает оставить след)
      if (st.seenT === undefined) st.seenT = st.simT;
      if (st.simT - st.seenT >= (shot.d || 0)) { st.spd = 3; st.shotT = 0; } // стоп-кадр, камера доезжает
    } else st.seenT = undefined;
  }
  const api = {
    timeK: () => (shot && st.shotT < 0 && st.simT < (shot.t || 0) ? 4 : 1),
    get craft() { return st.br === 'air' ? ctrls.air.craft : null; }, fps60: true, // на телефоне — 60 к/с (плавные кадры)
    start() {
      st.br = setup.pside === 'def' || setup.pside === 'multi' ? setup.pside : 'air';
      sayKeep = C.say; C.say = () => {}; // сообщения боя в кадре не нужны
      document.body.classList.add('photo'); setClean(false); st.spd = 0; st.fi = 0; resetAdj(); st.subj = 0; st.ang = 0;
      C.lastGame = 'photo'; newBattle(); shotApply();
    },
    stop() {
      if (st.br === 'air') ctrls.air.stop();
      if (sayKeep) { C.say = sayKeep; sayKeep = null; }
      C.ev = null; document.body.classList.remove('photo', 'clean'); camera.up.set(0, 1, 0);
    },
    update(dt) {
      st.simT += dt;
      if (st.br === 'air') { ctrls.air.update(dt); airTick(dt); } else if (st.br === 'def') defTick(dt); else evTick(dt, startEvMulti);
    },
    dtK: () => SPD[st.spd],
    camera(dt) { cameraUpdate(dt); if (shot && (shot.ox || shot.oy)) { camera.rotateY(shot.ox || 0); camera.rotateX(-(shot.oy || 0)); } shotTick(dt); }, // ox, oy — сдвиг объекта в кадре, рад (вправо / вверх): композиция не по центру
    hud(dt, t) {
      if (st.br === 'air') ctrls.air.hud(dt, t); // пламя форсажа и видимость модели
      if (!st.clean && (st.capT -= dt) <= 0) { st.capT = 0.2; $('phCap').textContent = R.cap + (ANG[st.ang].mount && R.cap2 ? tr(' · камера: {0} (тап по «Борт» — другое место)', [R.cap2]) : ''); }
    },
    onKey(e, down) {
      if (!down) return;
      const c = e.code;
      if (c === 'ArrowRight' || c === 'ArrowLeft') { st.ang = pick(st.ang + (c === 'ArrowRight' ? 1 : -1), ANG); resetAdj(); st.snap = true; st.spin = 0; renderUi(); }
      else if (c === 'ArrowDown' || c === 'ArrowUp') { st.subj = pick(st.subj + (c === 'ArrowDown' ? 1 : -1), st.subs); st.snap = true; st.fb.p = null; renderUi(); }
      else if (c === 'KeyH') setClean(!st.clean);
      else if (c === 'Equal' || c === 'NumpadAdd') act('near');
      else if (c === 'Minus' || c === 'NumpadSubtract') act('far');
      else if (c === 'KeyZ') act('zoom');
      else if (c === 'Space') { st.spd = st.spd === 3 ? 0 : 3; sideTxt(); e.preventDefault(); }
      else if (c === 'Digit1' || c === 'Digit2' || c === 'Digit3') { st.spd = +c.slice(5) - 1; sideTxt(); }
      else if (c === 'KeyR') act('reset');
      else if (c === 'KeyN') act('new');
    },
    modelsReady() { if (st.br === 'air') { ctrls.air.modelsReady(); const b = BX.setFromObject(ctrls.air.ship).getSize(TMP); st.shipL = clamp(Math.max(b.x, b.z), 8, 40) || 16; } }, // модель самолёта догрузилась — вместо макета
    focus: () => camera.position,
    near: () => clamp(curDist * 0.15, 0.25, 3),
    resize() {},
    finish: () => C.toMenu(),
    pauseHelp: () => (C.IS_TOUCH ? tr('Тяните по экрану — камера вокруг объекта, два пальца — ближе или дальше. Внизу — что снимать и ракурс, справа — ＋/－, зум, скорость (×½, ×¼, стоп-кадр), ⟲ — ракурс по умолчанию, ↻ — новый бой, ◎ — спрятать интерфейс (тап по экрану — вернуть).')
      : tr('Мышь: тянуть — камера вокруг объекта, колесо — ближе/дальше · ←/→ — ракурс · ↑/↓ — объект · +/− — дальность · Z — зум · 1/2/3 — скорость ×1/×½/×¼ · Пробел — стоп-кадр · R — ракурс по умолчанию · N — новый бой · H — спрятать интерфейс')),
  };
  return api;
}
