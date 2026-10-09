// Модели и эффекты «Воздушного превосходства»: зенитные комплексы (процедурные, по мотивам реальных машин),
// бомбы и ракеты, взрывы, дымные следы ЗУР, трассы зенитных пушек, ловушки, пожары на разрушенных объектах.
/* global THREE */
import { part, mergeParts, M, latheZ, plateXZ, plateZY, buildMissileGeo } from '../drone/models.js?v=20261010g';
import { makeParticles, radialTex } from '../drone/world.js?v=20261010g';
import { LNCH } from './launchers.js?v=20261010g';
import { createBook } from './flipbook.js?v=20261010g';

const OLIVE = 0x4f5c3c, OLIVE_D = 0x3c4630, SAND = 0x6e6a4c, NATO = 0x3f4a35, DARK = 0x1d2024, WHITE = 0xd8d8d0, STEEL = 0x707478;

// ═════════════ Зенитные комплексы ═════════════
function hull(P, L, W, H, color, tracked = true) {
  P.push(part(new THREE.BoxGeometry(W, H, L), color, M(0, H / 2 + 0.6, 0)));
  P.push(part(new THREE.BoxGeometry(W * 0.92, H * 0.5, L * 0.25), color, M(0, H * 0.9 + 0.6, -L * 0.42, -0.5))); // скошенный лоб
  if (tracked) for (const s of [-1, 1]) P.push(part(new THREE.BoxGeometry(0.55, 1.0, L * 1.02), DARK, M(s * (W / 2 + 0.2), 0.5, 0)));
  else for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.push(part(new THREE.CylinderGeometry(0.6, 0.6, 0.45, 12), DARK, M(s * (W / 2 + 0.1), 0.6, -L * 0.33 + i * L * 0.33, 0, 0, Math.PI / 2)));
}
const mslVis = (L, r, color) => ({ L, r, nose: 'ogive', noseLen: r * 5, color, fins: [{ at: 0.25, root: L * 0.08, tip: L * 0.04, span: r * 1.6, sweep: L * 0.03 }, { at: 0.86, root: L * 0.1, tip: L * 0.05, span: r * 2.2, sweep: L * 0.04 }] });
// mergeParts красит всё одним цветом на часть; у ракет цвета уже в геометрии — склеиваем отдельно
function merge2(P) {
  const plain = P.filter((p) => !p.keep), colored = P.filter((p) => p.keep);
  const gs = [mergeParts(plain)];
  for (const c of colored) { const g = c.geo.clone(); g.applyMatrix4(c.m); gs.push(g); }
  return mergeGeos(gs);
}
function mergeGeos(gs) {
  let n = 0; for (const g of gs) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of gs) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
// колёсное шасси: кабина впереди (−Z), платформа, колёса по бортам
function truck(P, L, W, color, axles = 4) {
  P.push(part(new THREE.BoxGeometry(W, 1.0, L), color, M(0, 1.3, 0)));
  P.push(part(new THREE.BoxGeometry(W * 0.95, 1.6, 2.4), color, M(0, 2.4, -L / 2 + 1.2)));
  P.push(part(new THREE.BoxGeometry(W * 0.9, 0.5, 0.06), 0x1d2a33, M(0, 2.7, -L / 2 - 0.02)));
  for (const sx of [-1, 1]) for (let i = 0; i < axles; i++) P.push(part(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12), DARK, M(sx * (W / 2 + 0.05), 0.55, -L / 2 + 1.4 + i * (L - 2.4) / Math.max(1, axles - 1), 0, 0, Math.PI / 2)));
}
// пакет транспортно-пусковых контейнеров: n штук рядами, el — угол возвышения
function canisters(P, nx, ny, len, r, x0, y0, z0, el, color) {
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = x0 + (i - (nx - 1) / 2) * r * 2.3, y = y0 + j * r * 2.3;
    P.push(part(new THREE.CylinderGeometry(r, r, len, 12), color, M(x, y + Math.sin(el) * len / 2, z0 + Math.cos(el) * len / 2, Math.PI / 2 - el)));
  }
}
function dishGeo(r, color) {
  return mergeParts([part(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), color, M(0, 0, 0, Math.PI / 2)),
    part(new THREE.CylinderGeometry(0.08, 0.08, r * 1.2, 6), DARK, M(0, 0, -r * 0.3, Math.PI / 2))]);
}
function plateGeo(w, h, color) { return mergeParts([part(new THREE.BoxGeometry(w, h, 0.25), color, M()), part(new THREE.BoxGeometry(0.3, 0.3, 1.2), DARK, M(0, -h / 2, 0.5))]); }
function soldier(P, x, z, color) {
  P.push(part(new THREE.CylinderGeometry(0.22, 0.25, 1.1, 8), color, M(x, 0.55, z)));
  P.push(part(new THREE.SphereGeometry(0.17, 8, 6), 0xc9a27e, M(x, 1.25, z)));
  P.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8), color, M(x, 1.37, z)));
}
// модель: { body — корпус (неподвижный), dish — антенна (вращается при обзоре, null — нет), dishY, dishXZ — где стоит антенна,
// turret / cradle — поворотная башня и качающаяся часть пусковой (оси — launchers.js), slotGeo — ракета на направляющей
// или крышка контейнера (видна, пока слот заряжен) }
const CACHE = {};
// контейнеры по слотам: круглые / квадратные; у «Тора» — только люки ячеек в крыше башни
function canBoxes(K, B, slots, color) {
  for (const [x, y, z] of slots) {
    if (B.cells) K.push(part(new THREE.BoxGeometry(B.r * 2.1, B.r * 2.1, 0.1), DARK, M(x, y, z - B.len / 2 + 0.04)));
    else if (B.sq) K.push(part(new THREE.BoxGeometry(B.r * 2, B.r * 2, B.len), color, M(x, y, z)));
    else K.push(part(new THREE.CylinderGeometry(B.r, B.r, B.len, 12), color, M(x, y, z, Math.PI / 2)));
  }
}
const railBeams = (K, slots, r, L, w = 0.14) => { for (const [x, y, z] of slots) K.push(part(new THREE.BoxGeometry(w, 0.14, L * 0.75), STEEL, M(x, y - r - 0.09, z))); };
export function unitModel(key, S) {
  if (CACHE[key]) return CACHE[key];
  const P = [], T = [], K = [], east = S.side === 'east', C = east ? OLIVE : NATO, LN = LNCH[key];
  let dish = null, dishY = 4;
  const ms = S.msl ? S.msl : null, sl = LN ? LN.L[0].slots : [];
  switch (key) {
    case 's75': // три пусковые СМ-63 по одной ракете (поворот и подъём направляющей) + кабина станции наведения
      for (const Ld of LN.L) P.push(part(new THREE.CylinderGeometry(2.4, 2.8, 0.8, 16), C, M(Ld.tp[0], 0.4, Ld.tp[2])));
      T.push(part(new THREE.BoxGeometry(1.4, 1.6, 2.2), C, M(0, 0.8, 0)));
      K.push(part(new THREE.BoxGeometry(0.5, 0.36, 9), STEEL, M(0, 0.18, -1.2)));
      P.push(part(new THREE.BoxGeometry(2.6, 2.4, 6), C, M(0, 1.2, 22)));
      dish = plateGeo(3.6, 1.2, C); dishY = 3.4; break;
    case 's125': // пусковая 5П73: четыре ракеты — две над балками, две под ними
      P.push(part(new THREE.CylinderGeometry(2.2, 2.6, 0.8, 16), C, M(0, 0.4, 0)), part(new THREE.BoxGeometry(2.6, 2.4, 6), C, M(-12, 1.2, 5)));
      T.push(part(new THREE.BoxGeometry(2.2, 1.6, 1.6), C, M(0, 0.9, 0)));
      for (const x of [-0.72, 0.72]) K.push(part(new THREE.BoxGeometry(0.22, 0.24, 5), STEEL, M(x, 0, -0.6)));
      dish = plateGeo(3, 1.6, C); dishY = 3.6; break;
    case 'hawk': // пусковая M192 на лафете — три ракеты на одной балке
      P.push(part(new THREE.BoxGeometry(2.4, 1, 4), C, M(0, 0.9, 0)), part(new THREE.BoxGeometry(2.2, 2, 4.5), C, M(10, 1.2, 4)));
      T.push(part(new THREE.BoxGeometry(1.4, 1.0, 1.2), C, M(0, 0.5, 0)));
      K.push(part(new THREE.BoxGeometry(2.6, 0.2, 2.2), STEEL, M(0, 0, -0.4)));
      dish = dishGeo(1.4, 0xb8b8a8); dishY = 3.4; break;
    case 'kub':
      hull(P, 6.5, 3, 1.4, C);
      T.push(part(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 12), C, M(0, 0.15, 0)));
      K.push(part(new THREE.BoxGeometry(2.4, 0.15, 2.6), STEEL, M(0, 0, 0.1)));
      dish = plateGeo(2.2, 1.6, C); dishY = 3.8; break;
    case 'osa':
      hull(P, 9, 2.8, 1.8, C, false);
      T.push(part(new THREE.BoxGeometry(2, 1.2, 2.2), C, M(0, 0.6, 0)));
      canBoxes(K, LN.box, sl, C);
      dish = plateGeo(2, 0.9, C); dishY = 4.4; break;
    case 'zsu234':
      hull(P, 6.5, 3, 1.3, C);
      T.push(part(new THREE.BoxGeometry(2.6, 1.0, 3), C, M(0, 0.5, 0)));
      for (const [x, y] of [[-0.25, -0.12], [0.25, -0.12], [-0.25, 0.16], [0.25, 0.16]]) K.push(part(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), DARK, M(x, y, -1.3, Math.PI / 2)));
      dish = dishGeo(0.8, C); dishY = 3.4; break;
    case 'gepard':
      hull(P, 7.5, 3.3, 1.5, C);
      T.push(part(new THREE.BoxGeometry(2.8, 1.4, 3), C, M(0, 0.7, 0)), part(new THREE.BoxGeometry(1.4, 0.8, 0.3), C, M(0, 0.6, -1.65)));
      for (const s of [-1, 1]) K.push(part(new THREE.BoxGeometry(0.5, 0.7, 1.6), C, M(s * 1.6, 0, 0)), part(new THREE.CylinderGeometry(0.09, 0.12, 4, 8), DARK, M(s * 1.6, 0, -2.4, Math.PI / 2)));
      dish = plateGeo(1.8, 0.7, C); dishY = 4.0; break;
    case 'm163':
      hull(P, 5, 2.7, 1.6, SAND);
      T.push(part(new THREE.CylinderGeometry(0.9, 0.9, 0.8, 12), SAND, M(0, 0.2, 0)));
      K.push(part(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8), DARK, M(0, 0, -1.1, Math.PI / 2)));
      dish = dishGeo(0.35, SAND); dishY = 3.3; break;
    case 'roland':
      hull(P, 6.5, 3.2, 1.5, C);
      T.push(part(new THREE.BoxGeometry(1.6, 1.0, 1.8), C, M(0, 0.5, 0)));
      canBoxes(K, LN.box, sl, C);
      dish = dishGeo(0.9, C); dishY = 3.6; break;
    case 'strela1': case 'strela10':
      hull(P, 6.5, 2.9, 1.3, C);
      T.push(part(new THREE.BoxGeometry(1.4, 0.8, 1.4), C, M(0, 0.4, 0)));
      canBoxes(K, LN.box, sl, C);
      break;
    case 's300': case 's400': // пусковая на колёсном шасси: 4 контейнера подняты вертикально + машина с плоской РЛС на вышке
      truck(P, 12, 3, C);
      P.push(part(new THREE.BoxGeometry(0.3, 0.5, 6), STEEL, M(-1.1, 2.0, 2.6)), part(new THREE.BoxGeometry(0.3, 0.5, 6), STEEL, M(1.1, 2.0, 2.6)));
      canBoxes(K, LN.box, sl, C);
      P.push(part(new THREE.BoxGeometry(2.6, 2.6, 7), C, M(18, 1.6, 4)), part(new THREE.CylinderGeometry(0.25, 0.35, 16, 8), STEEL, M(18, 9, 6)));
      dish = plateGeo(4.2, 3.2, C); dishY = 17; break;
    case 'patriot': case 'pac3': // пусковая-полуприцеп: поворотная платформа с контейнерами под 38° + РЛС с неподвижной решёткой
      truck(P, 11, 2.8, SAND, 3);
      T.push(part(new THREE.BoxGeometry(2.2, 0.4, 2.2), SAND, M(0, 0.2, 0)), part(new THREE.BoxGeometry(0.3, 1.0, 0.6), STEEL, M(-1.0, 0.5, 0)), part(new THREE.BoxGeometry(0.3, 1.0, 0.6), STEEL, M(1.0, 0.5, 0)));
      canBoxes(K, LN.box, sl, 0xc8c4b0);
      P.push(part(new THREE.BoxGeometry(2.8, 2.6, 6), SAND, M(-14, 1.6, 5)), part(new THREE.BoxGeometry(3.4, 3.2, 0.4), 0x8c8a74, M(-14, 3.6, 2, -0.35)));
      break;
    case 'buk': case 'bukm3':
      hull(P, 7.5, 3.2, 1.5, C);
      T.push(part(new THREE.BoxGeometry(2.4, 1.0, 3), C, M(0, 0.5, 0)));
      if (key === 'bukm3') canBoxes(K, LN.box, sl, C);
      else railBeams(K, sl, ms.r, ms.L);
      dish = plateGeo(2.2, 1.8, C); dishY = 4.4; break;
    case 'tor': case 'torm2': // крупная башня с вертикальными ячейками и плоской РЛС сверху
      hull(P, 7, 3.3, 1.5, C);
      P.push(part(new THREE.BoxGeometry(2.8, 2.6, 3.2), C, M(0, 3.4, 0.6)), part(new THREE.BoxGeometry(1.6, 1.2, 0.3), C, M(0, 3.6, -1.1)));
      canBoxes(K, LN.box, sl, C);
      dish = plateGeo(2.8, 1.2, C); dishY = 5.6; break;
    case 'pantsir': // 8×8 с башней: два пакета по 6 ракет, две спарки пушек, РЛС
      truck(P, 11, 3, C);
      T.push(part(new THREE.BoxGeometry(2.4, 1.6, 2.4), C, M(0, 0.8, 0)));
      canBoxes(K, LN.box, sl, C);
      for (const [x, y] of LN.guns) for (const dy of [-0.12, 0.12]) K.push(part(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), DARK, M(x, y + dy, -1.0, Math.PI / 2)));
      dish = plateGeo(1.8, 1.0, C); dishY = 4.6; break;
    case 'nasams': // прицеп с поворотной пусковой: 6 контейнеров под 29° + РЛС на мачте
      P.push(part(new THREE.BoxGeometry(2.4, 0.6, 5), NATO, M(0, 1.0, 0)));
      for (const sx of [-1, 1]) P.push(part(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), DARK, M(sx * 1.25, 0.5, 0.6, 0, 0, Math.PI / 2)));
      T.push(part(new THREE.BoxGeometry(1.6, 0.3, 1.6), NATO, M(0, 0.15, 0)));
      canBoxes(K, LN.box, sl, NATO);
      P.push(part(new THREE.CylinderGeometry(0.12, 0.15, 5, 8), STEEL, M(8, 2.5, 0)));
      dish = plateGeo(1.6, 1.1, NATO); dishY = 5.5; break;
    case 'iris': // грузовик с 8 вертикальными контейнерами
      truck(P, 9, 2.6, NATO, 3); canBoxes(K, LN.box, sl, NATO);
      P.push(part(new THREE.CylinderGeometry(0.12, 0.15, 4, 8), STEEL, M(-10, 2, 0)));
      dish = plateGeo(1.8, 1.2, NATO); dishY = 4.5; break;
    case 'skynex': // башня с револьверной пушкой и сенсорами
      P.push(part(new THREE.BoxGeometry(3, 1.2, 3.6), NATO, M(0, 0.6, 0)));
      T.push(part(new THREE.BoxGeometry(1.8, 1.4, 2), NATO, M(0, 0.7, 0)));
      K.push(part(new THREE.CylinderGeometry(0.1, 0.13, 3.6, 8), DARK, M(0, 0, -1.8, Math.PI / 2)));
      dish = plateGeo(1.2, 0.9, NATO); dishY = 3.0; break;
    case 'avenger': // «Хаммер» с турелью и двумя пакетами по 4 ракеты
      P.push(part(new THREE.BoxGeometry(2.2, 1.0, 4.6), SAND, M(0, 1.1, 0)), part(new THREE.BoxGeometry(2.1, 0.8, 1.6), SAND, M(0, 1.9, -0.8)));
      for (const sx of [-1, 1]) for (const z of [-1.5, 1.5]) P.push(part(new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12), DARK, M(sx * 1.05, 0.42, z, 0, 0, Math.PI / 2)));
      T.push(part(new THREE.CylinderGeometry(0.6, 0.6, 0.6, 12), SAND, M(0, 0, 0)));
      canBoxes(K, LN.box, sl, SAND);
      break;
    case 'gpsjam': case 'gpsjamw': // машина РЭБ с антенной мачтой и решётками
      truck(P, 9, 2.6, C, 3); P.push(part(new THREE.BoxGeometry(2.5, 2.2, 5), C, M(0, 2.9, 1.5)));
      P.push(part(new THREE.CylinderGeometry(0.1, 0.14, 9, 8), STEEL, M(0, 8.2, 2.5)));
      for (const y of [8, 10, 12]) P.push(part(new THREE.BoxGeometry(1.6, 0.08, 0.08), STEEL, M(0, y, 2.5)));
      break;
    default: { // ПЗРК: наводчик с трубой (поворачивается за целью) и второй номер
      const cl = east ? 0x55603f : 0x5a5a40;
      soldier(T, 0, 0, cl); soldier(P, 0.6, 0.3, cl);
      K.push(part(new THREE.CylinderGeometry(LN.tube.r, LN.tube.r, LN.tube.len, 8), 0x3e4a2e, M(0, sl[0][1], sl[0][2], Math.PI / 2)));
      P.push(part(new THREE.BoxGeometry(0.5, 0.35, 0.8), 0x3e4a2e, M(0.9, 0.18, -0.6)));
    }
  }
  // на направляющих видна сама ракета; у контейнеров — крышка на срезе (сорвана — слот пуст)
  let slotGeo = null;
  if (LN && ms && sl.length) {
    if (LN.box && !LN.box.cells) slotGeo = mergeParts([part(LN.box.sq ? new THREE.BoxGeometry(LN.box.r * 1.9, LN.box.r * 1.9, 0.06) : new THREE.CylinderGeometry(LN.box.r * 0.95, LN.box.r * 0.95, 0.06, 12), 0x9a9a88, M(0, 0, -LN.box.len / 2 - 0.02, LN.box.sq ? 0 : Math.PI / 2))]);
    else if (LN.box && LN.box.cells) slotGeo = mergeParts([part(new THREE.BoxGeometry(LN.box.r * 2, LN.box.r * 2, 0.06), C, M(0, 0, -LN.box.len / 2 - 0.02))]);
    else if (LN.mode !== 'tube') slotGeo = samFullGeo(S, LN);
  }
  const geo = (Q) => (Q.length ? (Q.some((p) => p.keep) ? merge2(Q) : mergeParts(Q)) : null);
  return (CACHE[key] = { body: geo(P), dish, dishY, dishXZ: (LN && LN.dish) || [0, 0], turret: geo(T), cradle: geo(K), slotGeo, LN });
}

// ═════════════ Ракеты ЗРК: целиком и по ступеням ═════════════
// У ракет с отделяемым ускорителем (С-75, С-125, «Панцирь») — маршевая ступень спереди и толстый ускоритель с большим
// оперением сзади; в полёте ускоритель отваливается отдельной моделью.
const SGEO = {};
function boosterGeo(S, LN) {
  const L = S.msl.L * (1 - LN.stage), rb = S.msl.r * (LN.stageR || 1.45), P = [];
  P.push(part(latheZ([[S.msl.r * 0.85, -L / 2], [rb, -L / 2 + Math.min(0.3, L * 0.12)], [rb, L / 2 - 0.05], [rb * 0.82, L / 2]], 14), S.msl.color));
  for (let k = 0; k < 4; k++) P.push(part(new THREE.BoxGeometry(0.03, rb * 2.2, L * 0.4), new THREE.Color(S.msl.color).multiplyScalar(0.86).getHex(), M(0, 0, L * 0.25, 0, 0, Math.PI / 4 + k * Math.PI / 2).multiply(M(0, rb + rb * 1.05, 0))));
  return mergeParts(P);
}
// { main — маршевая ступень (или вся ракета), mainZ — её центр, booster, boosterZ }
export function samGeos(S, LN) {
  const key = S.short;
  if (SGEO[key]) return SGEO[key];
  const ms = S.msl;
  if (!LN || !LN.stage) return (SGEO[key] = { main: buildMissileGeo(mslVis(ms.L, ms.r, ms.color)), mainZ: 0, booster: null });
  const Lm = ms.L * LN.stage, Lb = ms.L - Lm;
  return (SGEO[key] = { main: buildMissileGeo(mslVis(Lm, ms.r, ms.color)), mainZ: -ms.L / 2 + Lm / 2, booster: boosterGeo(S, LN), boosterZ: ms.L / 2 - Lb / 2 });
}
export function samFullGeo(S, LN) {
  const g = samGeos(S, LN);
  if (!g.booster) return g.main;
  const a = g.main.clone(), b = g.booster.clone(); a.translate(0, 0, g.mainZ); b.translate(0, 0, g.boosterZ);
  return mergeGeos([a, b]);
}

// ═════════════ Ударные самолёты ИИ ═════════════
// Обобщённые образы (не конкретные машины): восточный — тяжёлый фронтовой бомбардировщик с двумя двигателями
// и стреловидным крылом, западный — ударный истребитель. Нос — в −Z, как у «Изделия».
const SGEO2 = {};
// bare — без нарисованной подвески (самолёт игрока: оружие висит отдельными моделями на пилонах stations)
export function strikerGeo(side, bare = false) {
  const key = side + (bare ? '_b' : '');
  if (SGEO2[key]) return SGEO2[key];
  const east = side === 'east', L = east ? 22 : 19, R = east ? 1.35 : 1.2, n = -L / 2, C = east ? 0x8a9382 : 0x7f8a94, D = 0x2a2e33, P = [];
  const prof = [[0.001, n], [R * 0.3, n + L * 0.04], [R * 0.62, n + L * 0.12], [R * 0.9, n + L * 0.24], [R, n + L * 0.4], [R, n + L * 0.82], [R * 0.9, n + L]];
  P.push(part(latheZ(prof, 20), C, M(0, 0, 0, 0, 0, 0, east ? 1.25 : 1.1, 0.85, 1)));
  P.push(part(latheZ(prof.slice(0, 3), 20), east ? 0x5a6157 : 0x4a525a, M(0, 0, 0, 0, 0, 0, east ? 1.26 : 1.11, 0.86, 1))); // радиопрозрачный нос
  P.push(part(new THREE.SphereGeometry(R * 0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x1d2a33, M(0, R * 0.62, n + L * 0.2, 0, 0, 0, 0.8, 0.7, 2.2))); // фонарь
  const wl = east ? [[0.9, -1.6], [8.2, 4.4], [8.2, 5.6], [0.9, 4.8]] : [[0.9, -1.2], [5.6, 3.0], [5.6, 4.6], [0.9, 5.4]];
  for (const s of [1, -1]) P.push(part(plateXZ(wl.map(([x, z]) => [x * s, z]), 0.22), C, M(0, east ? R * 0.35 : -R * 0.25, 0)));
  const tz = L / 2 - L * 0.26, fin = [[tz, 0], [tz + L * 0.24, 0], [tz + L * 0.27, L * 0.22], [tz + L * 0.17, L * 0.22]];
  P.push(part(plateZY(fin, 0.16), C, M(0, R * 0.55, 0)));
  for (const s of [1, -1]) P.push(part(plateXZ([[0.4 * s, tz + L * 0.06], [L * 0.19 * s, tz + L * 0.16], [L * 0.19 * s, tz + L * 0.21], [0.4 * s, tz + L * 0.22]], 0.12), C, M(0, 0, 0)));
  for (const s of [1, -1]) {
    P.push(part(new THREE.BoxGeometry(R * 0.7, R * 0.95, L * 0.32), C, M(R * 0.95 * s, -R * 0.15, n + L * 0.42)));
    P.push(part(new THREE.CylinderGeometry(R * 0.45, R * 0.4, L * 0.06, 14, 1, true), 0x3b3e42, M(R * 0.48 * s, 0, L / 2 + L * 0.02, Math.PI / 2)));
  }
  // подвеска под крылом и фюзеляжем (просто тёмные «бомбы»)
  if (!bare) for (const x of [-3, 3, -1.2, 1.2]) P.push(part(latheZ([[0.001, -1.4], [0.22, -1.0], [0.24, 0.9], [0.12, 1.3]], 10), 0x55604a, M(x, -R * 0.9, 1.2)));
  // пилоны: 3 под каждым крылом и 2 под фюзеляжем (порядок как у «Изделия»: L3 L2 L1 Ф1 Ф2 R1 R2 R3)
  const wy = east ? R * 0.35 - 0.6 : -R * 0.25 - 0.6, span = wl[1][0], stations = [];
  for (const f of [0.82, 0.58, 0.34]) { const x = -span * f, le = wl[0][1] + (wl[1][1] - wl[0][1]) * (Math.abs(x) - wl[0][0]) / (span - wl[0][0]); stations.push(new THREE.Vector3(x, wy, le + 1.6)); }
  stations.push(new THREE.Vector3(-0.7, -R * 0.85 - 0.3, 1.5), new THREE.Vector3(0.7, -R * 0.85 - 0.3, 1.5));
  for (let i = 2; i >= 0; i--) stations.push(stations[i].clone().setX(-stations[i].x));
  if (bare) for (const st of stations) P.push(part(new THREE.BoxGeometry(0.14, 0.35, 1.5), D, M(st.x, st.y + 0.32, st.z)));
  return (SGEO2[key] = { geo: mergeParts(P), nozzles: [-1, 1].map((s) => new THREE.Vector3(R * 0.48 * s, 0, L / 2 + L * 0.03)), stations, L, R, nr: R * 0.42 });
}

// ═════════════ Пламя двигателя (как в «Симуляторе Летки») ═════════════
// конус пламени (оранжевый, ярче 1 — светится в HDR), бело-голубое ядро, на форсаже — «ромбы» скачков уплотнения.
// Малый газ — короткое, узкое и тусклое; полный — длиннее; форсаж — длинный факел.
const lin2 = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const flameMat = new THREE.MeshBasicMaterial({ color: lin2(0xff9a3c).multiplyScalar(3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const flameCore = new THREE.MeshBasicMaterial({ color: lin2(0xcfe6ff).multiplyScalar(4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const flameGeo = new THREE.ConeGeometry(0.5, 1, 16, 1, true); flameGeo.rotateX(Math.PI / 2); flameGeo.translate(0, 0, 0.5);
const diamondGeo = new THREE.SphereGeometry(0.26, 10, 8);
export function attachFlames(group, nozzles, r = 1, own = false) {
  const mat = own ? flameMat.clone() : flameMat;
  const set = nozzles.map((nz) => {
    // пламя не пишет глубину — рисуется после облаков и дыма (renderOrder), иначе облако позади самолёта его закрашивает
    const outer = new THREE.Mesh(flameGeo, mat), core = new THREE.Mesh(flameGeo, flameCore);
    outer.position.copy(nz); core.position.copy(nz); outer.renderOrder = core.renderOrder = 5; group.add(outer); group.add(core);
    const dia = [0, 1, 2, 3].map((k) => { const d = new THREE.Mesh(diamondGeo, flameCore); d.position.copy(nz); d.position.z += (0.85 + k * 1.15) * r; d.renderOrder = 5; group.add(d); return d; });
    return { outer, core, dia };
  });
  return {
    update(thr, ab) {
      const fw = (ab ? 1.25 : 0.5 + 0.45 * thr) * r;
      for (const f of set) {
        f.outer.scale.set(fw, fw, (ab ? 6 : 0.25 + 1.2 * thr) * r * (0.9 + Math.random() * 0.2));
        f.core.scale.set(0.6 * r, 0.6 * r, (ab ? 3.2 : 0.15 + 0.65 * thr) * r * (0.9 + Math.random() * 0.2));
        for (const d of f.dia) { d.visible = ab; d.scale.setScalar((0.8 + Math.random() * 0.3) * r); }
      }
      if (own) mat.opacity = ab ? 0.9 : 0.12 + 0.45 * thr;
    },
  };
}

// факел ракетного двигателя: z — срез сопла (хвост — +Z), r — радиус сопла
export function rocketFlame(group, z, r) {
  const outer = new THREE.Mesh(flameGeo, flameMat), core = new THREE.Mesh(flameGeo, flameCore);
  outer.position.z = core.position.z = z; outer.renderOrder = core.renderOrder = 5; group.add(outer); group.add(core);
  return {
    // k: 0 — двигатель не работает, 1 — маршевый режим, 2 — стартовый (ускоритель): длинный и широкий факел
    set(k, rr = r) {
      outer.visible = core.visible = k > 0; if (!k) return;
      const f = 0.85 + Math.random() * 0.3, w = rr * (k > 1 ? 2.6 : 1.8);
      outer.scale.set(w, w, rr * (k > 1 ? 26 : 12) * f); core.scale.set(w * 0.5, w * 0.5, rr * (k > 1 ? 11 : 5) * f);
    },
    move(z2) { outer.position.z = core.position.z = z2; },
  };
}

// ═════════════ Бомбы и ракеты ═════════════
function bombGeo(v) {
  const L = v.L, r = v.r, n = -L / 2, P = [];
  const prof = [[0.001, n], [r * 0.55, n + L * 0.08], [r * 0.9, n + L * 0.2], [r, n + L * 0.32], [r, n + L * 0.66], [r * 0.6, n + L * 0.9], [r * 0.45, n + L]];
  P.push(part(latheZ(prof, 14), v.color));
  if (v.band) P.push(part(latheZ([[r + 0.003, n + L * 0.12], [r + 0.003, n + L * 0.16]], 14), v.band));
  // хвостовое оперение
  for (let k = 0; k < 4; k++) P.push(part(new THREE.BoxGeometry(0.02, r * 1.4, L * 0.22), v.color, M(0, 0, n + L * 0.86, 0, 0, Math.PI / 4 + k * Math.PI / 2).multiply(M(0, r * 0.8, 0))));
  if (v.kind === 'lgb' || v.kind === 'tvb') {
    // головка и передние рули (у лазерной — «кольцо» датчика)
    P.push(part(latheZ([[0.001, n - L * 0.18], [r * 0.4, n - L * 0.16], [r * 0.45, n]], 12), v.kind === 'lgb' ? 0xb8b8b0 : 0x2a3540));
    for (let k = 0; k < 4; k++) P.push(part(new THREE.BoxGeometry(0.015, r * 0.9, L * 0.08), v.color, M(0, 0, n - L * 0.05, 0, 0, Math.PI / 4 + k * Math.PI / 2).multiply(M(0, r * 0.55, 0))));
  }
  return mergeParts(P);
}
const WGEO = {};
export function weaponGeo(key, W) {
  if (WGEO[key]) return WGEO[key];
  const v = W.vis;
  if (v.kind === 'cruise') { // крылатая ракета / ложная цель: гранёный корпус, крыло под корпусом, киль, воздухозаборник
    const L = v.L, r = v.r, P = [];
    P.push(part(new THREE.BoxGeometry(r * 2.2, r * 1.6, L * 0.8), v.color, M(0, 0, L * 0.05)));
    P.push(part(new THREE.ConeGeometry(r * 1.2, L * 0.22, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), v.color, M(0, 0, -L * 0.45)));
    P.push(part(new THREE.BoxGeometry(L * 0.7, 0.03, L * 0.12), v.color, M(0, -r * 0.6, 0)));
    P.push(part(new THREE.BoxGeometry(0.03, r * 1.6, L * 0.12), v.color, M(0, r * 1.2, L * 0.4)));
    P.push(part(new THREE.BoxGeometry(r, r * 0.6, L * 0.25), 0x2a2e33, M(0, -r * 0.9, L * 0.15)));
    return (WGEO[key] = mergeParts(P));
  }
  if (v.kind === 'pod') return (WGEO[key] = mergeParts([part(latheZ([[0.001, -v.L / 2], [v.r * 0.8, -v.L * 0.4], [v.r, -v.L * 0.2], [v.r, v.L * 0.35], [v.r * 0.6, v.L / 2]], 14), v.color),
    part(new THREE.BoxGeometry(0.02, v.r * 1.2, v.L * 0.2), v.color, M(0, -v.r, v.L * 0.3))]));
  if (v.kind === 'missile') return (WGEO[key] = buildMissileGeo({ L: v.L, r: v.r, nose: v.dome ? 'dome' : 'ogive', noseLen: v.r * 4, color: v.color, domeColor: 0x1d2a34,
    fins: [{ at: 0.3, root: v.L * 0.12, tip: v.L * 0.05, span: v.r * 2, sweep: v.L * 0.05 }, { at: 0.85, root: v.L * 0.1, tip: v.L * 0.05, span: v.r * 1.8, sweep: v.L * 0.04 }] }));
  return (WGEO[key] = bombGeo(v));
}

// ═════════════ Эффекты ═════════════
// взрывы, следы, пожары: частицы из «Летки» (makeParticles: обычные — дым, аддитивные — огонь и вспышки)
export function createFx(scene, P) {
  const softTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
  const smoke = makeParticles(scene, P.particles || 3000, false, softTex);
  const fire = makeParticles(scene, Math.round((P.particles || 3000) * 0.6), true, softTex);
  // трассы пушек: отрезки в одном буфере
  const NT = 400, tPos = new Float32Array(NT * 6), tLife = new Float32Array(NT), tVel = new Float32Array(NT * 3);
  const tGeo = new THREE.BufferGeometry(); tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  const tracers = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  tracers.frustumCulled = false; scene.add(tracers);
  let tHead = 0;
  const burning = []; // постоянные пожары: { pos, r, t, fl — языки пламени (раскадровка) }
  // раскадровки: огненный шар с дымом (ohyhei), вспышка с ударным кольцом и пламя (Explosion FX Free, heyheythere);
  // на слабых пресетах — вдвое меньше (P.fxLo)
  const FXU_ = (f) => new URL(`./fx/${f}${P.fxLo ? '_lo' : ''}.png`, import.meta.url).href;
  const EX = createBook(scene, { url: FXU_('explosion'), cols: 8, rows: 7, frames: 50, cell: [1, 1], anchor: [0.5, 0.5], gain: 2.4 }, 48);
  const BL = createBook(scene, { url: FXU_('blast'), cols: 8, rows: 2, frames: 16, cell: [1, 1], anchor: [0.5, 0.5], gain: 2.6 }, 16);
  const FL = createBook(scene, { url: FXU_('flame'), cols: 8, rows: 3, frames: 24, cell: [0.5, 1], anchor: [0.5, 0.92], up: true, loop: true, gain: 2.4 }, 96);
  const books = [EX, BL, FL], LT = new THREE.Vector3();
  let hemi = null, sunL = null;
  const clouds = [];  // облака диполей: блёстки ещё 3 с
  const V = new THREE.Vector3();
  return {
    mats: [smoke.mat, fire.mat], // хозяин выставляет uniforms.scale по высоте кадра
    setLayers(fxL, addL) { smoke.points.layers.set(fxL); fire.points.layers.set(addL); }, // дым — в половине разрешения, огонь — поверх (post.js); раскадровки — в основном проходе (там глубина кадра: дома их загораживают)
    // kind: 'air' — в воздухе (подрыв ЗУР, сбитый самолёт), 'ground' — ракета, падение; 'bomb' — бомба (крупнее, вспышка с кольцом, пыль)
    explosion(p, R, kind) {
      if (R < 6) { // мелочь (обломки) — частицами
        fire.emit(p.x, p.y + 1, p.z, 0, 2, 0, 1, 0.7, 0.35, 0.9, R * 1.6, R, 0.3, 0, 0);
        smoke.emit(p.x, p.y + 1, p.z, 0, 3, 0, 0.3, 0.28, 0.26, 0.6, R, R, 2.5, 0.5, 1);
        return;
      }
      const air = kind === 'air', bomb = kind === 'bomb';
      const h = air ? Math.max(14, R * 4.2) : bomb ? R * 4.2 : R * 3.6, fps = air ? 26 : bomb ? 18 : 22;
      V.set(p.x, p.y + (air ? 0 : h * 0.33), p.z); EX.add(V, h, fps);
      if (air) return;
      if (bomb) { V.set(p.x, p.y + R * 0.3, p.z); BL.add(V, R * 2.6, 26); }
      // пыль от земли — низким кольцом; тёмный дым остаётся висеть после огненного шара
      const k = bomb ? 1 : 0.6, nd = Math.round((10 + R * 0.3) * k);
      for (let i = 0; i < nd; i++) {
        const a = Math.random() * 6.283, s = (10 + Math.random() * 16) * (R / 30 + 0.5);
        smoke.emit(p.x, p.y + 1.5, p.z, Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s, 0.44, 0.4, 0.34, 0.6, R * 0.35, R * 0.7, 2.5 + Math.random() * 2, 1.6, 0.2);
      }
      for (let i = 0; i < 2 + R * 0.05; i++) { // лёгкий остаток дыма (основной — в самой раскадровке)
        const a = Math.random() * 6.283, s = 3 + Math.random() * 5;
        smoke.emit(p.x + Math.cos(a) * R * 0.3, p.y + h * 0.4, p.z + Math.sin(a) * R * 0.3, Math.cos(a) * s, 4 + Math.random() * 4, Math.sin(a) * s, 0.3, 0.28, 0.26, 0.3, R * 0.4, R * 0.6, 5 + Math.random() * 3, 0.5, 1);
      }
    },
    samTrail(m) { // дымный след ЗУР: у больших ракет — густой белый, у ПЗРК — тонкий серый; после ускорителя (маршевый ЖРД
      // С-75, прямоточный «Куба», маршевая ступень С-125) — тоньше и прозрачнее
      const big = m.M.L > 5, LN = m.ln, sus = LN && (LN.stage || LN.ramjet) && m.tb >= m.M.burn;
      const s = (big ? 9 : m.M.L > 2.5 ? 5 : 2.5) * (sus ? 0.45 : 1), back = sus && LN.stage ? m.M.L * (LN.stage - 0.5) + 0.3 : m.M.L * 0.6;
      const x = m.pos.x - m.dir.x * back, y = m.pos.y - m.dir.y * back, z = m.pos.z - m.dir.z * back;
      smoke.emit(x, y, z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0.86, 0.86, 0.84, (big ? 0.55 : 0.4) * (sus ? 0.45 : 1), s, s * 0.9, big ? 9 : 5, 0.3, 0.3);
      fire.emit(x, y, z, 0, 0, 0, 1, 0.75, 0.4, 0.9, s * 0.45, 0, 0.06, 0, 0);
    },
    // ── старт ЗУР ──
    // горячий старт: вспышка у хвоста, струя назад, облако пыли и дыма у пусковой, которое долго висит
    launchHot(p, d, big, dust) {
      const k = big ? 1.6 : 1;
      fire.emit(p.x - d.x * 3, p.y - d.y * 3, p.z - d.z * 3, 0, 0, 0, 1, 0.85, 0.55, 1, 10 * k, 8, 0.25, 0, 0);
      for (let i = 0; i < 18 * k; i++) {
        const sp = 10 + Math.random() * 25;
        smoke.emit(p.x - d.x * 4, p.y - d.y * 4, p.z - d.z * 4, -d.x * sp + (Math.random() - 0.5) * 10, -d.y * sp * 0.4 + Math.random() * 3, -d.z * sp + (Math.random() - 0.5) * 10,
          0.9, 0.89, 0.86, 0.6, 3 * k, 3.5 * k, 5 + Math.random() * 5, 1.2, 0.4);
      }
      if (dust) for (let i = 0; i < 22 * k; i++) {
        const a = Math.random() * 6.283, sp = 8 + Math.random() * 16;
        smoke.emit(dust.x, dust.y + 0.5, dust.z, Math.cos(a) * sp, 0.5 + Math.random() * 2, Math.sin(a) * sp, 0.62, 0.57, 0.5, 0.55, 2.5 * k, 3 * k, 6 + Math.random() * 6, 1.6, 0.25);
      }
    },
    // «холодный» старт: газогенератор выбивает ракету и крышку контейнера — серо-белый клуб газа над пусковой без пламени
    launchCold(p, d, big) {
      const k = big ? 1.5 : 0.8;
      for (let i = 0; i < 22 * k; i++) {
        const a = Math.random() * 6.283, sp = 3 + Math.random() * 9;
        smoke.emit(p.x, p.y, p.z, Math.cos(a) * sp + d.x * 6, d.y * (4 + Math.random() * 10), Math.sin(a) * sp + d.z * 6, 0.82, 0.82, 0.8, 0.7, 1.6 * k, 2.6 * k, 3 + Math.random() * 3, 1.5, 0.6);
      }
      for (let i = 0; i < 5; i++) smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 14, 8 + Math.random() * 10, (Math.random() - 0.5) * 14, 0.15, 0.15, 0.14, 0.9, 0.35, 0, 2.5, 0.2, -9); // обломки крышки
    },
    // ПЗРК: стартовый двигатель выталкивает ракету — хлопок и облачко у среза трубы и сзади
    launchTube(p, d) {
      for (let i = 0; i < 8; i++) smoke.emit(p.x - d.x * 1.2, p.y - d.y * 1.2, p.z - d.z * 1.2, -d.x * (6 + Math.random() * 10) + (Math.random() - 0.5) * 3, Math.random() * 2, -d.z * (6 + Math.random() * 10) + (Math.random() - 0.5) * 3, 0.85, 0.85, 0.83, 0.5, 0.6, 1.4, 2 + Math.random() * 2, 1.5, 0.2);
      for (let i = 0; i < 4; i++) smoke.emit(p.x, p.y, p.z, d.x * 4 + (Math.random() - 0.5) * 2, d.y * 4, d.z * 4 + (Math.random() - 0.5) * 2, 0.85, 0.85, 0.83, 0.45, 0.4, 1, 1.5, 1.5, 0.2);
      fire.emit(p.x, p.y, p.z, 0, 0, 0, 1, 0.9, 0.7, 0.6, 1.2, 0, 0.06, 0, 0);
    },
    // запуск двигателя в воздухе: вспышка и кольцо дыма
    ignite(p, d, big) {
      const k = big ? 1.6 : 0.5;
      fire.emit(p.x, p.y, p.z, 0, 0, 0, 1, 0.88, 0.6, 1, 9 * k, 10 * k, 0.22, 0, 0);
      const ax = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), u = ax.cross(d).normalize(), w = d.clone().cross(u);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * 6.283, sp = (6 + Math.random() * 4) * k * 1.4;
        smoke.emit(p.x, p.y, p.z, (u.x * Math.cos(a) + w.x * Math.sin(a)) * sp - d.x * 8, (u.y * Math.cos(a) + w.y * Math.sin(a)) * sp - d.y * 8, (u.z * Math.cos(a) + w.z * Math.sin(a)) * sp - d.z * 8,
          0.9, 0.9, 0.88, 0.6, 2 * k, 3 * k, 4 + Math.random() * 3, 1.4, 0.3);
      }
    },
    // газовые рули склоняют ракету («Тор»): короткие струи у носа
    jet(p, d) {
      if (Math.random() < 0.5) return;
      const s = (Math.random() - 0.5) * 2;
      smoke.emit(p.x + d.x * 1.2, p.y + d.y * 1.2, p.z + d.z * 1.2, (Math.random() - 0.5) * 16, s * 5, (Math.random() - 0.5) * 16, 0.86, 0.86, 0.84, 0.5, 0.5, 1.6, 1.2, 2, 0.2);
    },
    // отделение ускорителя: хлопок и клуб дыма в точке разделения
    stage(p, d) {
      fire.emit(p.x, p.y, p.z, 0, 0, 0, 1, 0.8, 0.5, 0.8, 4, 4, 0.15, 0, 0);
      for (let i = 0; i < 8; i++) smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 10 - d.x * 15, (Math.random() - 0.5) * 10 - d.y * 15, (Math.random() - 0.5) * 10 - d.z * 15, 0.85, 0.85, 0.83, 0.55, 2, 3, 4, 1.2, 0.2);
    },
    debrisSmoke(p) { smoke.emit(p.x, p.y, p.z, 0, 0.5, 0, 0.6, 0.6, 0.58, 0.35, 1.2, 2, 2.5, 0.2, 0.2); },
    // подбитый самолёт (прочность frac < 0,5): шлейф из хвоста — частица получает часть скорости самолёта и быстро
    // тормозит в воздухе (след ложится по траектории), сносится ветром и поднимается; ниже 25 % — чёрный дым и языки огня.
    // Частиц — по пройденному пути (каждые ~3,5 м), чтобы шлейф не рвался на скорости.
    damageSmoke(a, dt, frac, wind) {
      if (frac >= 0.5 || a.dead) return;
      const sp = a.vel.length(); if (sp < 1) return;
      const k = 1 - frac / 0.5, dark = frac < 0.25, fx = a.vel.x / sp, fy = a.vel.y / sp, fz = a.vel.z / sp, back = (a.r || 10) * 0.7;
      const n = Math.min(10, Math.ceil(sp * dt / 3.5));
      for (let i = 0; i < n; i++) {
        const o = back + sp * dt * (i / n), x = a.pos.x - fx * o, y = a.pos.y - fy * o, z = a.pos.z - fz * o, c = dark ? 0.12 + Math.random() * 0.08 : 0.42 + Math.random() * 0.12;
        smoke.emit(x, y, z, a.vel.x * 0.12 + wind.x + (Math.random() - 0.5) * 3, a.vel.y * 0.12 + 1 + Math.random(), a.vel.z * 0.12 + wind.z + (Math.random() - 0.5) * 3,
          c, c, c * 0.97, 0.4 + 0.35 * k, 3 + k * 3, 7 + k * 9, 4 + k * 5, 1.6, 0.8);
        if (dark && Math.random() < 0.5) fire.emit(x, y, z, a.vel.x * 0.3, a.vel.y * 0.3, a.vel.z * 0.3, 1, 0.5 + Math.random() * 0.2, 0.15, 0.9, 2.6, 3, 0.22, 2, 0);
      }
    },
    wpnTrail(w) {
      smoke.emit(w.pos.x - w.dir.x * 2, w.pos.y - w.dir.y * 2, w.pos.z - w.dir.z * 2, 0, 0.5, 0, 0.8, 0.8, 0.78, 0.35, 3, 3, 4, 0.3, 0.2);
      fire.emit(w.pos.x - w.dir.x * 2, w.pos.y - w.dir.y * 2, w.pos.z - w.dir.z * 2, 0, 0, 0, 1, 0.7, 0.35, 0.9, 1.6, 0, 0.05, 0, 0);
    },
    // ЛТЦ — каждый кадр, пока горит: слепящее ядро, узкий огненный хвост (частицы живут доли секунды — хвост вытягивается
    // по траектории и укорачивается, когда ловушка тормозит), белый дымный след; с выгоранием всё тускнеет и сужается
    flareTick(f, dt) {
      const k = Math.max(0, Math.min(1, f.life / (f.max || 3.5))), p = f.pos, v = f.vel;
      fire.emit(p.x, p.y, p.z, v.x * 0.2, v.y * 0.2, v.z * 0.2, 1, 0.97, 0.85, k, 0.8 + 3.2 * k, -2, 0.06, 0, 0);
      fire.emit(p.x, p.y, p.z, 0, 0, 0, 1, 0.72 + 0.2 * k, 0.32, 0.85 * k, 0.4 + 1.6 * k, -1, 0.06 + 0.22 * k, 0, 0);
      f.smT = (f.smT || 0) - dt;
      if (f.smT <= 0) { f.smT = 0.035; smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6, 0.94, 0.94, 0.93, 0.55 * k + 0.1, 1.2, 3.2, 3.5 + Math.random(), 0.25, 0.25); }
    },
    flareFlash(p) { fire.emit(p.x, p.y, p.z, 0, 0, 0, 1, 0.9, 0.7, 1, 7, 6, 0.1, 0, 0); },
    // диполи: пачка разлетается серебристым облаком, медленно оседает и поблёскивает
    chaffBurst(p, v) {
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * 6.283, e = (Math.random() - 0.5) * 2, sp = 6 + Math.random() * 16;
        smoke.emit(p.x, p.y, p.z, v.x * 0.25 + Math.cos(a) * sp, v.y * 0.25 + e * sp * 0.5, v.z * 0.25 + Math.sin(a) * sp, 0.72, 0.75, 0.8, 0.42, 0.35 + Math.random() * 0.4, 0.15, 4 + Math.random() * 3, 1.4, -1.2);
      }
      clouds.push({ p: p.clone(), v: v.clone().multiplyScalar(0.25), t: 0 });
    },
    // очередь: несколько трасс от комплекса к цели с разбросом (попадания — ближе к цели)
    gunFire(from, to, hits, dt) {
      if (Math.random() > dt * 12) return;
      for (let k = 0; k < 2; k++) {
        const i = tHead = (tHead + 1) % NT, i6 = i * 6;
        V.copy(to).sub(from); const d = V.length(); V.normalize();
        const spread = hits > 0 && k === 0 ? 4 : 25 + d * 0.012;
        V.x += (Math.random() - 0.5) * spread / d; V.y += (Math.random() - 0.5) * spread / d; V.z += (Math.random() - 0.5) * spread / d; V.normalize();
        tPos[i6] = from.x; tPos[i6 + 1] = from.y + 2.5; tPos[i6 + 2] = from.z;
        tPos[i6 + 3] = from.x + V.x * 18; tPos[i6 + 4] = from.y + 2.5 + V.y * 18; tPos[i6 + 5] = from.z + V.z * 18;
        tVel[i * 3] = V.x * 950; tVel[i * 3 + 1] = V.y * 950; tVel[i * 3 + 2] = V.z * 950; tLife[i] = Math.min(3, (d + 400) / 950);
      }
    },
    // пожар: несколько языков пламени (раскадровка, вразнобой) + столб дыма частицами (ветер, солнце, рост)
    burn(pos, r) {
      const n = Math.max(1, Math.min(4, Math.round(r / 9))), fl = [];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, d = i ? r * (0.2 + Math.random() * 0.25) : 0;
        V.set(pos.x + Math.cos(a) * d, pos.y - 0.5, pos.z + Math.sin(a) * d);
        fl.push(FL.add(V, Math.max(8, r * (1 + Math.random() * 0.4)) * (i ? 0.75 : 1), 20 + Math.random() * 6, { t0: -Math.random() * 0.4 }));
      }
      burning.push({ pos: pos.clone(), r, t: 0, fl });
    },
    clearBurning() { burning.length = 0; FL.clear(); },
    wreckSmoke(p) { smoke.emit(p.x, p.y, p.z, 0, 2, 0, 0.15, 0.14, 0.13, 0.6, 6, 7, 5, 0.2, 0.5); fire.emit(p.x, p.y, p.z, 0, 0, 0, 1, 0.5, 0.15, 0.8, 4, 1, 0.3, 0, 0); },
    update(dt) {
      smoke.update(dt); fire.update(dt);
      // раскадровки: освещение дыма — небо и солнце сцены
      if (!hemi) for (const o of scene.children) { if (o.isHemisphereLight) hemi = o; else if (o.isDirectionalLight && !sunL) sunL = o; }
      LT.set(0.6, 0.6, 0.6); if (hemi) LT.set(hemi.color.r, hemi.color.g, hemi.color.b).multiplyScalar(hemi.intensity * 0.55);
      if (sunL) LT.x += sunL.color.r * sunL.intensity * 0.35, LT.y += sunL.color.g * sunL.intensity * 0.35, LT.z += sunL.color.b * sunL.intensity * 0.35;
      for (const b of books) b.update(dt, LT, scene.fog);
      for (let i = 0; i < NT; i++) {
        if (tLife[i] <= 0) continue;
        tLife[i] -= dt; const i6 = i * 6, i3 = i * 3;
        if (tLife[i] <= 0) { tPos[i6 + 1] = tPos[i6 + 4] = -9999; continue; }
        for (let k = 0; k < 6; k += 3) { tPos[i6 + k] += tVel[i3] * dt; tPos[i6 + k + 1] += tVel[i3 + 1] * dt - 9.8 * dt * 0.5; tPos[i6 + k + 2] += tVel[i3 + 2] * dt; }
      }
      tGeo.attributes.position.needsUpdate = true;
      for (let i = clouds.length - 1; i >= 0; i--) {
        const c = clouds[i]; c.t += dt; c.v.multiplyScalar(1 - 1.4 * dt); c.v.y -= 1.2 * dt; c.p.addScaledVector(c.v, dt);
        const R = 4 + c.t * 9;
        if (Math.random() < dt * 40) fire.emit(c.p.x + (Math.random() - 0.5) * R, c.p.y + (Math.random() - 0.5) * R * 0.6, c.p.z + (Math.random() - 0.5) * R, 0, -1, 0, 0.85, 0.9, 1, 0.9, 0.5, 0, 0.12, 0, 0);
        if (c.t > 3.5) clouds.splice(i, 1);
      }
      // пожары: огонь и столб дыма, со временем слабее
      for (const b of burning) {
        b.t += dt; const k = Math.max(0.25, 1 - b.t / 240);
        for (const f of b.fl) f.a = 0.45 + 0.55 * k; // пламя со временем слабее
        if (Math.random() < dt * 3 * k) fire.emit(b.pos.x + (Math.random() - 0.5) * b.r * 0.6, b.pos.y + 2 + Math.random() * b.r * 0.4, b.pos.z + (Math.random() - 0.5) * b.r * 0.6, 0, 10, 0, 1, 0.6, 0.2, 0.9, 0.8, 0, 1.2, 0.3, 0); // искры
        if (Math.random() < dt * 9 * k) smoke.emit(b.pos.x + (Math.random() - 0.5) * b.r, b.pos.y + 6, b.pos.z + (Math.random() - 0.5) * b.r, 3 + Math.random() * 2, 9, 1, 0.12, 0.11, 0.1, 0.7, b.r * 0.6, b.r * 0.9, 16, 0.05, 1.2);
      }
    },
  };
}
