// Зональные повреждения самолёта (чистая логика: клиент, сервер, проверки). Корпус (hp) — как раньше: кончился — сбит.
// Сверх него у самолёта зоны с целостностью 1…0: левое и правое крыло, хвост (киль и стабилизаторы), двигатели (у
// однодвигательных — один, у остальных — левый и правый: четыре и восемь — по бортам), топливные баки. Осколки ложатся
// по зонам по стороне подрыва относительно самолёта (слева — левое крыло, сзади — хвост и двигатели) со случайным разбросом.
// Вид и поведение соразмерны (Mark): что отлетело — так и летит.
//   крыло: меньше подъёмной силы (clK), больше сопротивления, крен к повреждённому (rollBias); ≤ 0,15 — отлетает внешняя треть
//     (консоль): тянет в крен сильно (держать ручку ~на треть хода), но лететь «кое-как» можно;
//   хвост: хуже управление (ctrlK); ≤ 0,15 — отлетает половина хвоста со стороны попадания (стабилизатор, у двухкилевых — киль):
//     управление вдвое хуже, уводит; хвост добит до 0 — отлетает весь: самолёт неуправляем и падает;
//   двигатель: меньше тяги (thrK), < 0,5 — нет форсажа, < 0,3 — горит; бак: < 0,7 — течь (leak, доля в с), < 0,3 — пожар.
// Пожар (fire) и весь оторванный хвост медленно (быстро) съедают корпус — burnRate. События отрыва и пожара — из hitZones.
/* global THREE */
import { tr } from '../i18n.js?v=20261024u';
export const DETACH = 0.15;
const Q = new THREE.Quaternion(), E = new THREE.Euler(), R = new THREE.Vector3();
export const DET_KEYS = ['consL', 'consR', 'tailL', 'tailR', 'tailAll'];

export function initDamage(a) {
  const n = a.fm ? a.fm.s.n : 2;
  a.dz = { wingL: 1, wingR: 1, tail: 1, eng: n > 1 ? [1, 1] : [1], fuel: 1 };
  a.det = { consL: false, consR: false, tailL: false, tailR: false, tailAll: false }; // что уже отлетело
  a.fire = 0; // 0 — нет, 1 — двигатель, 2 — бак
  applyDamage(a);
  return a.dz;
}
// урон dmg (в единицах прочности, корпус ~100) из точки from (или null — равномерно); rnd — случайные 0…1
export function hitZones(a, dmg, from, rnd = Math.random) {
  if (!a.dz) initDamage(a);
  let side = 0, back = 0;
  if (from) {
    Q.setFromEuler(E.set(a.pitch, a.yaw, a.roll, 'YXZ')).invert();
    R.copy(from).sub(a.pos).applyQuaternion(Q); // оси самолёта: x — вправо, z — к хвосту
    const L = Math.max(5, a.r || 8); side = Math.max(-1, Math.min(1, R.x / L)); back = Math.max(-1, Math.min(1, R.z / L));
  }
  const D = a.dz, eL = D.eng.length > 1;
  const w = { wingL: 0.3 + 1.2 * Math.max(0, -side), wingR: 0.3 + 1.2 * Math.max(0, side), tail: 0.15 + Math.max(0, back), eng: 0.2 + 0.8 * Math.max(0, back), fuel: 0.35 };
  let sum = 0; for (const k in w) { w[k] *= 0.6 + 0.8 * rnd(); sum += w[k]; }
  const f = dmg / 100 * 3, ev = []; // зоны слабее корпуса: два близких подрыва с одной стороны — консоль может оторваться
  const cut = (k, v) => Math.max(0, v - f * w[k] / sum);
  D.wingL = cut('wingL', D.wingL); D.wingR = cut('wingR', D.wingR); D.tail = cut('tail', D.tail); D.fuel = cut('fuel', D.fuel);
  if (eL) { const k = side < 0 ? 0 : side > 0 ? 1 : rnd() < 0.5 ? 0 : 1; D.eng[k] = cut('eng', D.eng[k]); } else D.eng[0] = cut('eng', D.eng[0]);
  const T = a.det;
  if (!T.consL && D.wingL <= DETACH) { T.consL = true; ev.push('consL'); }
  if (!T.consR && D.wingR <= DETACH) { T.consR = true; ev.push('consR'); }
  if (!T.tailL && !T.tailR && D.tail <= DETACH) { const s = side < 0 || (side === 0 && rnd() < 0.5) ? 'tailL' : 'tailR'; T[s] = true; ev.push(s); }
  if (!T.tailAll && D.tail <= 0) { T.tailAll = true; T.tailL = T.tailR = true; ev.push('tailAll'); }
  const fire0 = a.fire;
  if (!a.fire && D.eng.some((e) => e < 0.3)) a.fire = 1;
  if (!a.fire && D.fuel < 0.3 && rnd() < 0.5) a.fire = 2;
  if (a.fire && !fire0) ev.push('fire');
  applyDamage(a);
  return ev;
}
// состояние зон → поля самолёта для лётной модели (крен — в долях своей скорости крена: тяжёлому так же трудно, как лёгкому)
export function applyDamage(a) {
  const D = a.dz; if (!D) return;
  const T = a.det, wl = D.wingL, wr = D.wingR, t = D.tail, rr = a.fm ? a.fm.rollRate : 3;
  a.clK = 1 - 0.15 * (2 - wl - wr) - (T.consL ? 0.12 : 0) - (T.consR ? 0.12 : 0);
  a.dmgDrag = 1 + 0.2 * (2 - wl - wr) + 0.1 * (1 - t) + (T.consL ? 0.15 : 0) + (T.consR ? 0.15 : 0) + (T.tailL || T.tailR ? 0.1 : 0);
  // крен к повреждённому крылу: до отрыва — немного, оторванная консоль — держать ручку ~на треть хода; половина хвоста — уводит
  a.rollBias = rr * (0.1 * ((1 - wl) - (1 - wr)) + (T.consL ? 0.22 : 0) - (T.consR ? 0.22 : 0) + (T.tailAll ? 0 : (T.tailL ? 0.06 : 0) - (T.tailR ? 0.06 : 0)));
  a.ctrlK = T.tailAll ? 0.15 : T.tailL || T.tailR ? 0.55 : 0.5 + 0.5 * t;
  a.thrK = D.eng.reduce((s, e) => s + Math.max(0, Math.min(1, (e - 0.15) / 0.55)), 0) / D.eng.length;
  a.noAB = D.eng.some((e) => e < 0.5);
  a.leak = D.fuel < 0.7 ? (0.7 - D.fuel) * 0.012 : 0;
  // вертолёт (sim/heli.js): крылья — консоли с пилонами (сопротивление), хвост — балка и рулевой винт: повреждён — реактивный
  // момент закручивает (trotK), разрушен — неуправляемое вращение; у соосного (Ка-52) рулевого нет — хвост бьёт по управлению
  if (a.heli) {
    const coax = a.hm && a.hm.s.coax;
    a.trotK = coax ? 1 : T.tailAll ? 0 : T.tailL || T.tailR ? 0.35 : Math.min(1, 0.4 + 0.6 * t);
    a.ctrlK = T.tailAll ? (coax ? 0.4 : 0.6) : 0.6 + 0.4 * t; a.rollBias = 0; a.clK = 1;
  }
}
// сколько корпуса в секунду съедают пожар и разрушенный хвост (неуправляемый самолёт — падает)
export const burnRate = (a) => (a.dz ? (a.fire ? 1.4 : 0) + (a.det.tailAll ? 6 : 0) : 0);
// сводка для сети и HUD: [крыло Л, крыло П, хвост, двиг. Л (или единственный), двиг. П, бак] в сотых, отлетевшее (биты), пожар
export const dmgPack = (a) => (a.dz ? [Math.round(a.dz.wingL * 99), Math.round(a.dz.wingR * 99), Math.round(a.dz.tail * 99), Math.round(a.dz.eng[0] * 99), Math.round((a.dz.eng[1] ?? a.dz.eng[0]) * 99), Math.round(a.dz.fuel * 99), DET_KEYS.reduce((m, k, i) => m | (a.det[k] ? 1 << i : 0), 0), a.fire] : null);
export function dmgUnpack(a, p) {
  if (!p) return []; if (!a.dz) initDamage(a);
  const D = a.dz, ev = [], was = { ...a.det }, fire0 = a.fire;
  D.wingL = p[0] / 99; D.wingR = p[1] / 99; D.tail = p[2] / 99; D.eng[0] = p[3] / 99; if (D.eng.length > 1) D.eng[1] = p[4] / 99; D.fuel = p[5] / 99;
  DET_KEYS.forEach((k, i) => { a.det[k] = !!(p[6] & (1 << i)); }); a.fire = p[7] || 0;
  for (const k of DET_KEYS) if (a.det[k] && !was[k]) ev.push(k);
  if (a.fire && !fire0) ev.push('fire');
  applyDamage(a);
  return ev;
}
// состояние корпуса словами (вместо процентов): [от прочности, название, цвет]
export const HULL = [[90, tr('Исправен'), '#86efac'], [70, tr('Лёгкие повреждения'), '#d9f99d'], [45, tr('Повреждён'), '#fde047'], [25, tr('Тяжёлые повреждения'), '#fb923c'], [10, tr('Критично'), '#f87171'], [0, tr('Разваливается'), '#ef4444']];
export const hullState = (hp) => HULL.find(([v]) => hp >= v) || HULL[HULL.length - 1];
// что повреждено — коротко (для строки состояния)
export function dmgBrief(a) {
  const D = a.dz; if (!D) return '';
  const T = a.det, out = [];
  const cw = a.heli ? tr('пилон') : tr('крыло'), cc = a.heli ? tr('нет пилона') : tr('нет законцовки');
  if (T.consL) out.push(cc + tr(' Л')); else if (D.wingL < 0.6) out.push(cw + tr(' Л'));
  if (T.consR) out.push(cc + tr(' П')); else if (D.wingR < 0.6) out.push(cw + tr(' П'));
  if (a.heli) { if (T.tailAll) out.push(tr('нет хвостовой балки')); else if (T.tailL || T.tailR || D.tail < 0.6) out.push(a.hm && a.hm.s.coax ? tr('хвост') : tr('рулевой винт')); }
  else if (T.tailAll) out.push(tr('нет хвоста')); else if (T.tailL || T.tailR) out.push(tr('пол-хвоста')); else if (D.tail < 0.6) out.push(tr('хвост'));
  if (D.eng.some((e) => e < 0.6)) out.push(D.eng.length > 1 && D.eng.every((e) => e < 0.6) ? tr('оба двигателя') : tr('двигатель'));
  if (a.fire) out.push(tr('ПОЖАР')); else if (D.fuel < 0.7) out.push(tr('течь'));
  return out.join(', ');
}
