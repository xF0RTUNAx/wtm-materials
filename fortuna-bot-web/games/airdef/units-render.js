// Модели и эффекты «Воздушного превосходства»: зенитные комплексы (процедурные, по мотивам реальных машин),
// бомбы и ракеты, взрывы, дымные следы ЗУР, трассы зенитных пушек, ловушки, пожары на разрушенных объектах.
/* global THREE */
import { part, mergeParts, M, latheZ, plateXZ, plateZY, buildMissileGeo } from '../drone/models.js?v=20261027d';
import { makeParticles, radialTex } from '../drone/world.js?v=20261027d';
import { createPlumes, makeFlame, flameTick, motorOf, setFlameLayer } from './plume.js?v=20261027d';
import { FLAME_KIND, makeJetFlame, setJetLayer } from './jetflame.js?v=20261027d';
import { createCmFx } from './cmfx.js?v=20261027d';
import { LNCH } from './launchers.js?v=20261027d';
import { createBook } from './flipbook.js?v=20261027d';
import { makePuffs } from './puffs.js?v=20261027d';

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
    case 'hawk': case 'hawk21': // пусковая M192 на лафете — три ракеты на одной балке
      P.push(part(new THREE.BoxGeometry(2.4, 1, 4), C, M(0, 0.9, 0)), part(new THREE.BoxGeometry(2.2, 2, 4.5), C, M(10, 1.2, 4)));
      T.push(part(new THREE.BoxGeometry(1.4, 1.0, 1.2), C, M(0, 0.5, 0)));
      K.push(part(new THREE.BoxGeometry(2.6, 0.2, 2.2), STEEL, M(0, 0, -0.4)));
      dish = dishGeo(1.4, 0xb8b8a8); dishY = 3.4; break;
    case 'kub':
      hull(P, 6.5, 3, 1.4, C);
      T.push(part(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 12), C, M(0, 0.15, 0)));
      K.push(part(new THREE.BoxGeometry(2.4, 0.15, 2.6), STEEL, M(0, 0, 0.1)));
      dish = plateGeo(2.2, 1.6, C); dishY = 3.8; break;
    case 'osa': // ЗИФ-122 на береговой площадке (пока не пришла модель): диск, тумба, башня и две балки; ракеты — slotGeo
      P.push(part(new THREE.CylinderGeometry(1.9, 1.9, 0.16, 20), 0x77756c, M(0, 0.08, 0)));
      P.push(part(new THREE.CylinderGeometry(0.24, 0.24, 1.4, 10), C, M(0, 0.8, 0)));
      T.push(part(new THREE.BoxGeometry(0.6, 0.9, 0.7), C, M(0, 0.3, 0)));
      for (const [x] of sl) K.push(part(new THREE.BoxGeometry(0.14, 0.18, 2.3), STEEL, M(x, 0.08, -0.15)));
      break;
    case 'zsu234':
      hull(P, 6.5, 3, 1.3, C);
      T.push(part(new THREE.BoxGeometry(2.6, 1.0, 3), C, M(0, 0.5, 0)));
      for (const [x, y] of [[-0.25, -0.12], [0.25, -0.12], [-0.25, 0.16], [0.25, 0.16]]) K.push(part(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), DARK, M(x, y, -1.3, Math.PI / 2)));
      dish = dishGeo(0.8, C); dishY = 3.4; break;
    case 'gepard': case 'skyguard': case 'zu23': case 'phalanx':
      hull(P, 7.5, 3.3, 1.5, C);
      T.push(part(new THREE.BoxGeometry(2.8, 1.4, 3), C, M(0, 0.7, 0)), part(new THREE.BoxGeometry(1.4, 0.8, 0.3), C, M(0, 0.6, -1.65)));
      for (const s of [-1, 1]) K.push(part(new THREE.BoxGeometry(0.5, 0.7, 1.6), C, M(s * 1.6, 0, 0)), part(new THREE.CylinderGeometry(0.09, 0.12, 4, 8), DARK, M(s * 1.6, 0, -2.4, Math.PI / 2)));
      dish = plateGeo(1.8, 0.7, C); dishY = 4.0; break;
    case 'm163':
      hull(P, 5, 2.7, 1.6, SAND);
      T.push(part(new THREE.CylinderGeometry(0.9, 0.9, 0.8, 12), SAND, M(0, 0.2, 0)));
      K.push(part(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8), DARK, M(0, 0, -1.1, Math.PI / 2)));
      dish = dishGeo(0.35, SAND); dishY = 3.3; break;
    case 'roland': case 'rapier':
      hull(P, 6.5, 3.2, 1.5, C);
      T.push(part(new THREE.BoxGeometry(1.6, 1.0, 1.8), C, M(0, 0.5, 0)));
      canBoxes(K, LN.box, sl, C);
      dish = dishGeo(0.9, C); dishY = 3.6; break;
    case 'strela1': case 'strela10': case 'chaparral': // (Chaparral — запасная фигура, пока грузится модель)
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
    case 'pantsir': case 'tunguska': // 8×8 с башней: два пакета по 6 ракет, две спарки пушек, РЛС
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
    case 'iris': case 'sampt': // грузовик с 8 вертикальными контейнерами
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
// dry — двигатель без форсажа (Ту-16, A-10, Harrier…): днём выхлоп почти не виден — короткое слабое свечение, форсажа нет
const flameDry = new THREE.MeshBasicMaterial({ color: lin2(0xff9a3c).multiplyScalar(2), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
// цвет форсажа по двигателю (Mark 2026-10-21; фото и видео — разведчик): blue — чистое бедное горение, светятся газы: голубое ядро,
// сине-фиолетовая середина, розовато-красный конец (НК-25 Ту-22М3, НК-32 Ту-160, АЛ-31Ф/117С семейства Су-27, F100-229 F-15E, F135 F-35);
// sooty — старые двигатели, богатая смесь, светится сажа: жёлто-оранжевый, короткие ромбы; neutral — бело-жёлтое ядро, оранжевый факел
// FLAME_KIND (ключ самолёта → blue / sooty / neutral) — в jetflame.js (общая таблица прежнего attachFlames и запечённого пламени)
const FLAME_COL = { // [ядро, середина, конец] (линейные, ×яркость), ромбы
  blue: [[0.7, 0.85, 1.0], [0.32, 0.42, 1.0], [0.85, 0.3, 0.5], [0.75, 0.88, 1.0]],
  neutral: [[1.0, 0.9, 0.7], [1.0, 0.52, 0.18], [0.8, 0.22, 0.08], [1.0, 0.95, 0.85]],
  sooty: [[1.0, 0.82, 0.45], [1.0, 0.45, 0.1], [0.55, 0.15, 0.05], [1.0, 0.85, 0.6]],
};
const flameGrad = {};
function flameGradMat(kind) { // градиент вдоль факела (z 0 — срез сопла, 1 — конец) и мягкие края (по углу к взгляду)
  const C = FLAME_COL[kind] || FLAME_COL.neutral;
  return new THREE.ShaderMaterial({
    uniforms: { c0: { value: new THREE.Vector3(...C[0]) }, c1: { value: new THREE.Vector3(...C[1]) }, c2: { value: new THREE.Vector3(...C[2]) }, uOp: { value: 0.85 } },
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying float vZ, vRim;
      void main() { vZ = position.z; vec4 mv = modelViewMatrix * vec4(position, 1.0); vRim = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 c0, c1, c2; uniform float uOp; varying float vZ, vRim;
      void main() {
        #include <logdepthbuf_fragment>
        float z = clamp(vZ, 0.0, 1.0); // кончик конуса: z чуть больше 1 → pow от отрицательного = NaN, свечение (bloom) растягивало его в чёрный квадрат
        vec3 c = z < 0.35 ? mix(c0, c1, z / 0.35) : mix(c1, c2, (z - 0.35) / 0.65);
        float a = uOp * pow(clamp(vRim, 0.0, 1.0), 1.3) * pow(1.0 - z, 0.7);
        gl_FragColor = vec4(c * 1.7 * a, a);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
const diaMat = {}, coreMat = {};
// пламя реактивных двигателей — запечённое (jetflame.js: раскал сопла, факел сбоку и в торец, вспышка розжига); API прежний: update(thr, ab),
// dt считаем здесь по часам (≤ 0,1 с). dry — без форсажа, key — ключ самолёта (цвет и особые сопла), own — свой самолёт
export function attachFlames(group, nozzles, r = 1, own = false, dry = false, key = '') {
  const jf = makeJetFlame(group, nozzles, r, key, { dry, own });
  let t0 = 0;
  return {
    update(thr, ab) { const t = performance.now(); const dt = t0 ? Math.min(0.1, Math.max(0, (t - t0) / 1000)) : 1 / 60; t0 = t; jf.update(thr, ab, dt); },
    dispose: () => jf.dispose(),
  };
}
// прежнее пламя — конус, ядро и ромбы (оставлено для стенда «было / стало» tools/airdef-fx/jet-view.html?cmp=)
export function attachFlamesOld(group, nozzles, r = 1, own = false, dry = false, key = '') {
  const kind = FLAME_KIND[key] || 'neutral';
  const mat = dry ? flameDry : own ? flameGradMat(kind) : (flameGrad[kind] || (flameGrad[kind] = flameGradMat(kind)));
  const dMat = diaMat[kind] || (diaMat[kind] = new THREE.MeshBasicMaterial({ color: new THREE.Color(...FLAME_COL[kind][3]).multiplyScalar(1.6), transparent: true, opacity: kind === 'blue' ? 0.5 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const cMat = coreMat[kind] || (coreMat[kind] = new THREE.MeshBasicMaterial({ color: new THREE.Color(...FLAME_COL[kind][0]).multiplyScalar(2.2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); // ядро — в цвет двигателя
  const set = nozzles.map((nz) => {
    // пламя не пишет глубину — рисуется после облаков и дыма (renderOrder), иначе облако позади самолёта его закрашивает
    const outer = new THREE.Mesh(flameGeo, mat), core = new THREE.Mesh(flameGeo, dry ? flameCore : cMat);
    outer.position.copy(nz); core.position.copy(nz); outer.renderOrder = core.renderOrder = 5; outer.userData.fx = core.userData.fx = true; group.add(outer); group.add(core); // fx — не часть модели (зоны повреждений их не режут)
    const dia = [0, 1, 2, 3].map((k) => { const d = new THREE.Mesh(diamondGeo, dMat); d.position.copy(nz); d.position.z += (0.85 + k * 1.15) * r; d.renderOrder = 5; d.userData.fx = true; group.add(d); return d; });
    return { outer, core, dia };
  });
  return {
    update(thr, ab) {
      if (dry) { // короткий тусклый конус, без ядра и «бриллиантов»
        for (const f of set) { f.outer.scale.set(0.7 * r, 0.7 * r, (0.2 + 0.5 * thr) * r * (0.9 + Math.random() * 0.2)); f.core.visible = false; for (const d of f.dia) d.visible = false; }
        return;
      }
      const fw = (ab ? 1.25 : 0.5 + 0.45 * thr) * r;
      for (const f of set) {
        f.outer.scale.set(fw, fw, (ab ? 6 : 0.25 + 1.2 * thr) * r * (0.9 + Math.random() * 0.2));
        f.core.scale.set(0.6 * r, 0.6 * r, (ab ? 3.2 : 0.15 + 0.65 * thr) * r * (0.9 + Math.random() * 0.2));
        for (const d of f.dia) { d.visible = ab; d.scale.set((0.5 + Math.random() * 0.15) * r, (0.5 + Math.random() * 0.15) * r, (0.75 + Math.random() * 0.2) * r); } // ромб Маха — вытянутый вдоль струи, полупрозрачный
      }
      if (own) mat.uniforms.uOp.value = ab ? 0.9 : 0.12 + 0.45 * thr;
      if (kind === 'sooty') for (const f of set) f.dia.forEach((d, k) => { if (k > 1) d.visible = false; }); // старые двигатели — ромбы короче (два)
    },
  };
}

// факел ракетного двигателя: z — срез сопла (хвост — +Z), r — радиус сопла
// факел ракеты — запечённая раскадровка вдоль оси (plume.js); motor — тип двигателя (MOTOR), по умолчанию смесевое твёрдое
export function rocketFlame(group, z, r, motor) { return makeFlame(group, z, r, motor); }
// срез сопла: ось — медиана вершин корпуса в средней трети (стабилизаторы её не сдвигают), срез — 97-й процентиль по +Z среди вершин
// у оси (не выступающие провода и кромки); центр факела — на оси, чуть внутри среза
const NV = new THREE.Vector3();
export function nozzleOf(g, r, ax) { // ax — ось сопла [x, y], если медиана врёт (крыло сверху у Storm Shadow)
  g.updateMatrixWorld(true); const P = [];
  g.traverse((m) => { if (!m.isMesh) return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { NV.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); P.push(NV.x, NV.y, NV.z); } });
  let z0 = 1e9, z1 = -1e9; for (let i = 2; i < P.length; i += 3) { z0 = Math.min(z0, P[i]); z1 = Math.max(z1, P[i]); }
  const L = z1 - z0, xs = [], ys = [];
  for (let i = 0; i < P.length; i += 3) if (P[i + 2] > z0 + L / 3 && P[i + 2] < z1 - L / 3) { xs.push(P[i]); ys.push(P[i + 1]); }
  const med = (a) => { a.sort((u, v) => u - v); return a.length ? a[a.length >> 1] : 0; };
  // ось — по самому хвосту (последние ~3 % длины, середина габаритов): там только корпус и сопло; медиана средней трети — запас
  let tx0 = 1e9, tx1 = -1e9, ty0 = 1e9, ty1 = -1e9, tn = 0; const zt = z1 - Math.max(0.03 * L, 0.04);
  for (let i = 0; i < P.length; i += 3) if (P[i + 2] > zt) { tx0 = Math.min(tx0, P[i]); tx1 = Math.max(tx1, P[i]); ty0 = Math.min(ty0, P[i + 1]); ty1 = Math.max(ty1, P[i + 1]); tn++; }
  const tail = tn >= 6 && tx1 - tx0 < r * 3 && ty1 - ty0 < r * 3 && tx1 - tx0 > r && Math.abs((tx1 - tx0) - (ty1 - ty0)) < 0.2 * Math.max(tx1 - tx0, ty1 - ty0); // в срезе — только корпус (не стабилизаторы во всю ширину)
  const cx = ax ? ax[0] : tail ? (tx0 + tx1) / 2 : med(xs), cy = ax ? ax[1] : tail ? (ty0 + ty1) / 2 : med(ys);
  // радиус корпуса по модели (нижняя четверть расстояний вершин средней трети от оси): паспортный r бывает меньше — у Х-25МЛ и «Бука» в круг r·0,95 не попадал хвост и срез сопла находился на носу
  const ds = xs.map((x, i) => Math.hypot(x - cx, ys[i] - cy)).sort((u, v) => u - v), rb = ds.length ? ds[Math.floor(ds.length * 0.25)] : r, lim = Math.max(r * 0.95, Math.min(rb * 1.2, r * 3));
  const zs = []; for (let i = 0; i < P.length; i += 3) if (Math.hypot(P[i] - cx, P[i + 1] - cy) < lim) zs.push(P[i + 2]);
  zs.sort((u, v) => u - v);
  return { x: cx, y: cy, z: (zs.length ? zs[Math.floor(zs.length * 0.97)] : z1) - 0.05 };
}

// НАР в полёте — одна ракета, а не блок (W.vis у С-8 и Hydra — блок на пилоне: 2 м и 0,5 м в поперечнике): калибр 80 / 70 мм, длина ракеты
const NAR = { s8: { L: 1.5, r: 0.04 }, hydra: { L: 1.45, r: 0.035 } };
export const narVis = (key, W) => ({ kind: 'missile', color: W.vis.color, ...(NAR[key] || { L: 1.4, r: 0.04 }) });
export const narMesh = (key, W, mat) => new THREE.Mesh(weaponGeo('nar:' + key, { vis: narVis(key, W) }), mat);
// ── факел и дым летящего оружия самолёта (relMesh / evMesh в main.js и стенд tools/airdef-fx/weapons-plume.html) ──
const NZC = {}; // сопло по ключу оружия — считаем один раз по готовой модели
// факел оружия w на модели g: срез сопла (w.nzL — в осях модели, +Z к хвосту) и факел по типу двигателя; ev — оружие «Мульти-волны» (evMesh)
export function mountWpnFlame(w, g, ev) {
  const W = w.W, v = W.vis, stub = !!g.userData.stub;
  if (!ev) {
    if (W.kind === 'rocket') { // НАР: факел из среза сопла одной ракеты (калибр 70–80 мм), след — из той же точки (wpnTrail)
      const f = narVis(w.key, W), nz = w.nzL = { x: 0, y: 0, z: f.L / 2 - 0.02 };
      g.userData.flame = rocketFlame(g, nz.z, f.r, motorOf(w.key, 'rocket', false)); g.userData.flame.at(nz.x, nz.y, nz.z); g.userData.fl = 'rocket'; g.userData.fr = f.r; g.userData.flame.owner = w;
      return;
    }
    if (W.kind !== 'agm' && W.kind !== 'arm' && W.kind !== 'cruise') return;
    const nz = w.nzL = NZC[w.key] || nozzleOf(g, v.r, v.nzAx); if (!g.isMesh) NZC[w.key] = nz; // запоминаем только по готовой модели (не по временной)
    g.userData.flame = rocketFlame(g, nz.z, v.r, motorOf(w.key, W.kind, false)); g.userData.flame.at(nz.x, nz.y, nz.z); g.userData.fl = W.kind === 'cruise' ? 'jet' : 'rocket'; g.userData.flame.owner = w;
    return;
  }
  // баллистическая: факел двигателя на разгоне (у сопла — корма, +Z)
  if (W.kind === 'tbm') { const nz = nozzleOf(g, v.r); w.nzL = nz; g.userData.flame = rocketFlame(g, nz.z, v.r, motorOf(w.key, 'tbm', false)); g.userData.flame.move(nz.z); g.children.filter((c) => c.renderOrder === 5).forEach((c) => { c.position.x = nz.x; c.position.y = nz.y; }); g.userData.flame.owner = w; } // факел — из среза сопла
  if (W.kind === 'cruise' && !W.uav && !W.recon && !W.glide) { // крылатая (планирующая бомба — без двигателя): факел из среза сопла — ускоритель на старте, потом маршевый (слабый)
    const nz = w.nzL = v.nz && !stub ? { x: v.nz[0], y: v.nz[1], z: v.nz[2] } : NZC[w.key] || nozzleOf(g, v.r, v.nzAx); if (!stub) NZC[w.key] = nz; // nz — сопло задано в модели вручную; по временной модели не запоминаем
    g.userData.flame = rocketFlame(g, nz.z, v.r, motorOf(w.key, 'cruise', false)); g.userData.flame.at(nz.x, nz.y, nz.z); g.userData.fl = 'jet'; g.userData.flame.owner = w; // пуск с самолёта: запуск двигателя, потом маршевый
  }
}
// ракета ЗРК в полёте: модель комплекса gm ({ missile, booster }) или процедурная; ускоритель — отдельной частью (отвалится в полёте); факел у среза сопла
export function samMissileMesh(m, gm, wMat) {
  const g = new THREE.Group(), L = m.M.L, r = m.M.r;
  let hasBoost = false;
  if (gm) { g.add(gm.missile); if (gm.booster && m.ln && m.ln.stage) { g.add(gm.booster); g.userData.booster = gm.booster; hasBoost = true; } }
  else {
    const geos = samGeos(m.S, m.ln), main = new THREE.Mesh(geos.main, wMat); main.position.z = geos.mainZ; g.add(main);
    if (geos.booster) { const b = new THREE.Mesh(geos.booster, wMat); b.position.z = geos.boosterZ; g.add(b); g.userData.booster = b; hasBoost = true; }
  }
  g.userData.flame = rocketFlame(g, L / 2, hasBoost ? r * m.ln.stageR : r, motorOf(m.unit.key, 'sam', false)); g.userData.flame.owner = m; // факел — по типу двигателя (plume.js); конец ленты дыма — в его сопле
  if (gm) { // готовая модель: сопло ищем по самой модели (один раз на комплекс), а не по паспортной длине
    const key = m.unit.key, nm = NZC['sam:' + key] || (NZC['sam:' + key] = nozzleOf(gm.missile, r));
    const nb = hasBoost ? NZC['samb:' + key] || (NZC['samb:' + key] = nozzleOf(gm.booster, r * m.ln.stageR)) : null;
    g.userData.nzM = nm; const n0 = nb || nm; g.userData.flame.at(n0.x, n0.y, n0.z);
  }
  return g;
}
// факел оружия: баллистика — на разгоне; крылатая (турбореактивный) — вспышка запуска 1,5 с, потом маленький; ракета — пока горит двигатель
export function flameOf(g, w) {
  const f = g.userData.flame, r = w.W.vis.r, k = g.userData.fl;
  if (k === 'jet') f.set(1, r * (w.t < 1.5 ? 0.6 : 0.3));
  else if (k === 'rocket') f.set(w.t < (w.W.burn || 3) ? 1 : 0, g.userData.fr || r * 0.85);
  else f.set(w.phase === 'boost' ? 2 : 0);
}
// срез сопла в мире: w.pos + оси модели после lookAt (+Z — назад по скорости), w.nzL — сопло в осях модели
const TZ = new THREE.Vector3(), TX = new THREE.Vector3(), TY = new THREE.Vector3();
export function wpnNozzle(w, out) {
  TZ.copy(w.dir).negate(); TX.set(0, 1, 0).cross(TZ).normalize(); TY.copy(TZ).cross(TX);
  return out.copy(w.pos).addScaledVector(TZ, w.nzL.z).addScaledVector(TX, w.nzL.x).addScaledVector(TY, w.nzL.y);
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
// Воронки и копоть: все — один вызов отрисовки (кольцевой буфер, новая заменяет самую старую). Без текстур: в шейдере —
// профиль ямы с бруствером (нормаль по наклону, свет солнца), неровный край, комья выброшенной земли, копоть вокруг.
// iA: x, y, z, радиус копоти; iB: радиус ямы (0 — только копоть, на крыше), зерно, глубина (доля радиуса)
function makeCraters(scene, n) {
  const g = new THREE.InstancedBufferGeometry(); const b = new THREE.PlaneGeometry(2, 2); b.rotateX(-Math.PI / 2);
  g.index = b.index; g.setAttribute('position', b.attributes.position);
  const A = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), B = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  A.setUsage(THREE.DynamicDrawUsage); B.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iA', A); g.setAttribute('iB', B); g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0.4, 0.7, 0.4) }, uLight: { value: new THREE.Vector3(1, 1, 1) }, uFog: { value: new THREE.Color() }, uFogD: { value: 0 } },
    vertexShader: `attribute vec4 iA; attribute vec3 iB; varying vec3 vW, vB; varying vec2 vQ; varying float vS, vD;
      void main() { vB = iB; vS = iA.w; vQ = position.xz * iA.w; // vQ — точка от центра воронки, м
        vW = iA.xyz + vec3(position.x * iA.w, 0.0, position.z * iA.w);
        vec4 mv = viewMatrix * vec4(vW, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    // плоскость лежит на высоте верха бруствера; луч взгляда идёт вниз до рельефа (яма + бруствер + земля) — яма объёмная
    fragmentShader: `uniform vec3 uSun, uLight, uFog; uniform float uFogD; varying vec3 vW, vB; varying vec2 vQ; varying float vS, vD;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float sd, rc, dep, rim;
      float xr(vec2 p) { float ang = atan(p.y, p.x); float rag = 1.0 + 0.16 * (vn(vec2(ang * 2.2 + sd, sd)) - 0.5) + 0.08 * (vn(vec2(ang * 7.0 - sd, sd)) - 0.5); return length(p) / (rc * rag); }
      float H(vec2 p) { float x = xr(p); return (x < 1.0 ? -dep * (1.0 - x * x) : 0.0) + rim * exp(-pow((x - 1.0) / 0.36, 2.0)) * (0.8 + 0.4 * vn(p * 0.8 + sd)); }
      void main() {
        sd = vB.y * 13.7; rc = max(vB.x, 0.01); dep = vB.z * rc; rim = vB.x > 0.0 ? 0.3 * dep : 0.0;
        vec2 p0 = vQ;
        vec3 V = normalize(vW - cameraPosition); V.y = min(V.y, -0.03);
        vec2 p = p0; float hitD = 0.0;
        if (vB.x > 0.0) { // трассировка: 28 шагов + уточнение
          float dmax = rim + dep, tmax = min(dmax / -V.y, vS * 1.5 / max(length(V.xz), 1e-3)), t0 = 0.0, t1 = 0.0;
          for (int i = 1; i <= 28; i++) { t1 = tmax * float(i) / 28.0; vec2 q = p0 + V.xz * t1; if (t1 * -V.y >= rim - H(q)) break; t0 = t1; }
          for (int i = 0; i < 5; i++) { float tm = 0.5 * (t0 + t1); vec2 q = p0 + V.xz * tm; if (tm * -V.y >= rim - H(q)) t1 = tm; else t0 = tm; }
          p = p0 + V.xz * t1; hitD = t1;
        }
        float r = length(p), x = xr(p);
        float soot = (1.0 - smoothstep(0.45, 1.0, r / vS * (0.85 + 0.3 * vn(p * 0.35 + sd)))) * (0.55 + 0.45 * vn(p * 1.3 + sd));
        float a = soot * 0.88; vec3 col = vec3(0.035, 0.03, 0.028);
        if (vB.x > 0.0) {
          float e = 0.06 * rc; vec3 n = normalize(vec3(H(p - vec2(e, 0.0)) - H(p + vec2(e, 0.0)), 2.0 * e, H(p - vec2(0.0, e)) - H(p + vec2(0.0, e))));
          vec3 L = normalize(uSun);
          // тень от края: луч к солнцу над рельефом
          float shd = 1.0, h0 = H(p);
          for (int i = 1; i <= 8; i++) { vec2 q = p + L.xz / max(length(L.xz), 1e-3) * rc * 0.28 * float(i); float hy = h0 + L.y / max(length(L.xz), 1e-3) * rc * 0.28 * float(i); if (H(q) > hy) { shd = 0.35; break; } }
          float ins = 1.0 - smoothstep(0.92, 1.02, x), bank = exp(-pow((x - 1.0) / 0.4, 2.0));
          float clods = step(0.82, vn(p * 2.4 + sd)) * (1.0 - smoothstep(1.0, 1.9, x)) * step(0.9, x);
          vec3 earth = mix(vec3(0.05, 0.043, 0.036), vec3(0.13, 0.11, 0.085), smoothstep(0.15, 1.05, x)) * (0.75 + 0.5 * vn(p * 3.0 + sd));
          float sh = 0.38 + 0.7 * max(dot(n, L), 0.0) * shd * smoothstep(-0.05, 0.2, uSun.y);
          vec3 ec = earth * sh * uLight;
          float ea = max(ins, max(bank * 0.9, clods * 0.9));
          col = mix(col, ec, ea / max(ea + a * (1.0 - ea), 1e-3)); a = ea + a * (1.0 - ea);
        }
        if (a < 0.01) discard;
        float fog = 1.0 - exp(-vD * vD * uFogD * uFogD);
        gl_FragColor = vec4(mix(col, uFog, fog), a * (1.0 - fog * 0.5));
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  let head = 0;
  return {
    mat,
    add(x, y, z, soot, pit, depth) {
      const i = head; head = (head + 1) % n; if (g.instanceCount < n) g.instanceCount++;
      A.setXYZW(i, x, y, z, soot); B.setXYZ(i, pit, Math.random() * 100, depth); A.needsUpdate = B.needsUpdate = true;
    },
    clear() { g.instanceCount = 0; head = 0; },
  };
}
export function createFx(scene, P) {
  const softTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
  const smoke = makeParticles(scene, P.particles || 3000, false, softTex);
  const fire = makeParticles(scene, Math.round((P.particles || 3000) * 0.6), true, softTex);
  // остаточный дым взрывов (живёт 45–65 с) — свой запас частиц: в общем его перезаписывали следы ракет и ЛТЦ, и облако пропадало разом (Mark:
  // «слишком резко уходит остаточный дым»); здесь тает линейно до конца жизни
  const LINGER_N = P.fxLo ? 600 : 1200, linger = makeParticles(scene, LINGER_N, false, softTex);
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
  const onTex = (t) => { if (api && api.onTex) api.onTex(t); }; // текстура листа пришла — сразу на видеокарту (main.js; рывок при первом взрыве)
  const EX = createBook(scene, { url: FXU_('explosion'), cols: 8, rows: 7, frames: 50, cell: [1, 1], anchor: [0.5, 0.5], gain: 2.4, onTex }, 48);
  const BL = createBook(scene, { url: FXU_('blast'), cols: 8, rows: 2, frames: 16, cell: [1, 1], anchor: [0.5, 0.5], gain: 2.6, onTex }, 16);
  const FL = createBook(scene, { url: FXU_('flame'), cols: 8, rows: 3, frames: 24, cell: [0.5, 1], anchor: [0.5, 0.92], up: true, loop: true, gain: 2.4, onTex }, 96);
  const books = [EX, BL, FL], LT = new THREE.Vector3();
  // взрывы по типу боевой части (2026-10-23, Mark: «пререндерить взрыв для каждой бомбы по боевой части — красиво, физически правдоподобно»):
  // свои симуляции Mantaflow в Blender (tools/airdef-fx/explode: огненный шар, тёмный дым, «гриб», волна пыли, выброс грунта и комья со шлейфами)
  // → fx/ex_<тип>.ktx2 (сжатые) или .webp, описание листов — fx/explode.json. Тип — по радиусу поражения и виду подрыва (exType); кадр — по
  // ширине съёмки × R / ref, время — по подобию (крупнее — медленнее, √). Пока описание не пришло (или ?exnew=0) — прежние раскадровки и частицы
  const XB = {}, XJ = {}; let LY = null, CB = null, PF = null, lo = true; // PF — клубы дыма следов подбитых (puffs.js, лист ex_puff)
  // дым следа: клуб из Blender, пока лист не пришёл — прежнее пятно (тот же emit; st — с какого места клуба: 0 — свежий, 0,5 — уже рваный)
  // дым повреждений самолётов (zoneTrail, damageSmoke): размер и рост клуба (2026-10-25, Mark: «достаточно великоват» — при росте 4–10 м/с ×2
  // за 3–6 с жизни клуб выходил до 30–120 м, вдвое-вчетверо больше самолёта; теперь ≈ ×0,55: меньше и перерисовки на экране)
  const DS = 0.85, DG = 0.5;
  const trail = (x, y, z, vx, vy, vz, r, g, b, a, s, gr, l, dr, gv, st = 0) => { if (PF && PF.ready) PF.emit(x, y, z, vx, vy, vz, r, g, b, a, s, gr, l, dr, gv, st); else smoke.emit(x, y, z, vx, vy, vz, r, g, b, a, s, gr, l, dr, gv); };
  // столб дыма пожара (fx/ex_burn — снят в Blender как петля): высота — по размеру очага; начинается с разной фазы
  const colAdd = (b) => CB.add(b.pos, XJ.burn.height * Math.min(1.6, Math.max(0.35, b.r / XJ.burn.ref)), 1, { t0: -Math.random() * 4 });
  if (!(typeof location !== 'undefined' && /[?&]exnew=0/.test(location.search)) && typeof fetch === 'function' && typeof document !== 'undefined') {
    fetch(new URL('./fx/explode.json?v=20261027d', import.meta.url)).then((r) => r.json()).then((J) => {
      for (const [t, j] of Object.entries(J)) {
        const u = (e) => new URL(`./fx/ex_${t}${P.fxLo || P.halfFx ? '_lo' : ''}.${e}?v=20261027d`, import.meta.url).href; // телефон и слабые пресеты — вдвое меньше (память)
        if (t === 'puff') { // клубы дыма следов подбитых (tools/airdef-fx/explode/puff.py)
          // по умолчанию (2026-10-24: лист перепечён — клуб заполняет клетку, шаг следа fx.trailStep — «бусин» вдали нет); ?puff=0 — прежние пятна
          if (/[?&]puff=0/.test(location.search)) continue;
          // пул: шаг следа 2,5 м — частиц вдвое больше, чем при 5 м: на «Высоком» и выше до 3000 (быстрый сильно подбитый самолёт с 3–4 зонами не укорачивает следы), на телефонных — как было
          PF = makePuffs(scene, P.fxLo ? Math.min(1500, Math.round((P.particles || 3000) * 0.5)) : Math.min(3000, Math.round((P.particles || 3000) * 0.6)), { ktx: u('ktx2'), url: u('webp'), cols: j.cols, rows: j.rows, frames: j.frames, variants: j.variants, times: j.times, onTex });
          PF.mat.uniforms.scale.value = smoke.mat.uniforms.scale.value; api.mats.push(PF.mat); PF.points.renderOrder = lo ? 1 : 0.46; if (LY) PF.points.layers.set(LY[0]);
          continue;
        }
        if (t === 'burn') { // столб дыма пожара — петля, стоит вертикально (поворот только вокруг вертикали)
          CB = createBook(scene, { ktx: u('ktx2'), url: u('webp'), cols: j.cols, rows: j.rows, frames: j.frames, times: j.times, cell: [0.5, 1], anchor: j.anchor, up: true, loop: true, gain: 2.4, lit: 1.7, soft: 0.05, onTex }, 32);
          XJ.burn = j; books.push(CB); if (LY) { CB.mesh.layers.set(LY[0]); CB.pre.layers.set(LY[0]); }
          for (const b of burning) if (!b.col) b.col = colAdd(b); // пожары, начавшиеся до прихода листа
          continue;
        }
        const b = XB[t] = createBook(scene, { ktx: u('ktx2'), url: u('webp'), cols: j.cols, rows: j.rows, frames: j.frames, times: j.times, cell: [1, 1], anchor: j.anchor, gain: 2.4, lit: 1.7, push: t === 'air' || t === 'plane' ? 0 : 0.3, soft: 0.08, fadeT: j.times[j.frames - 1] * 0.45, onTex }, t === 'light' || t === 'air' ? 48 : 24);
        XJ[t] = j; books.push(b); if (LY) { b.mesh.layers.set(LY[0]); b.pre.layers.set(LY[0]); }
      }
      if (api && api.onNewMats) api.onNewMats(); // новые материалы листов — скомпилировать сразу
    }).catch(() => { /* нет листов — прежние раскадровки */ });
  }
  // EXK — во сколько раз крупнее физического (снято в масштабе: у ФАБ-500 шар ≈ 40 м); ?exk=1 / 2,5 — сравнить (Mark решает)
  const EXK = (typeof location !== 'undefined' && +new URLSearchParams(location.search).get('exk')) || 1.5, LATER = []; // LATER — отложенные эффекты { t — через сколько с, f }
  // 'plane' — сбитый самолёт (main.js down, air.js); 'air' — разрыв ЗУР / перехват любого размера (ревью: крупные ЗУР выглядели «сбитым»)
  const exType = (R, kind) => (kind === 'plane' ? 'plane' : kind === 'air' ? 'air' : R < 20 ? 'light' : R < 40 ? 'medium' : R < 60 ? 'heavy' : 'super');
  const CR = makeCraters(scene, P.craters || 150);
  const PL = createPlumes(scene, P); // дымные ленты ракет (plume.js)
  const CMF = createCmFx(scene, P, PL); // ЛТЦ и облака диполей — запечённые спрайты (cmfx.js)
  let hemi = null, sunL = null;
  const V = new THREE.Vector3();
  let api = null; // сам объект эффектов (explosion вызывают и через обёртки — без this)
  return api = {
    mats: [smoke.mat, fire.mat, linger.mat, ...CMF.mats], // хозяин выставляет uniforms.scale по высоте кадра
    // порядок с облаками (у облаков 0,5): камера ниже облаков — дым и взрывы после них (облака — фон; было: у частиц дыма порядок 0 —
    // далёкое облако ложилось поверх близкого дыма белыми клубками); выше облаков — раньше них (облако между камерой и дымом закрывает его)
    setView(camY) { lo = camY < 2250; smoke.points.renderOrder = fire.points.renderOrder = linger.points.renderOrder = lo ? 1 : 0.46; if (PF) PF.points.renderOrder = lo ? 1 : 0.46; PL.mesh.renderOrder = lo ? 2 : 0.47; for (const b of books) b.mesh.renderOrder = lo ? 0.8 : 0.44; }, // низ облаков — от 2300 м (city-render buildClouds)
    setLayers(fxL, addL) { LY = [fxL, addL]; smoke.points.layers.set(fxL); linger.points.layers.set(fxL); if (PF) PF.points.layers.set(fxL); fire.points.layers.set(addL); PL.mesh.layers.set(fxL); setFlameLayer(addL); setJetLayer(addL); CMF.setLayers(fxL, addL); for (const b of books) { b.mesh.layers.set(fxL); b.pre.layers.set(fxL); } }, // раскадровки огня и взрывов — в проходе дыма: после облаков (фон), до дыма (он закрывает огонь) // дым — в половине разрешения, огонь — поверх (post.js); раскадровки — в основном проходе (там глубина кадра: дома их загораживают)
    // kind: 'air' — в воздухе (подрыв ЗУР, сбитый самолёт), 'ground' — ракета, падение; 'bomb' — бомба (крупнее, вспышка с кольцом, пыль)
    explosion(p, R, kind) {
      if (R < 6) { // мелочь (обломки) — частицами
        fire.emit(p.x, p.y + 1, p.z, 0, 2, 0, 1, 0.7, 0.35, 0.9, R * 1.6, R, 0.3, 0, 0);
        smoke.emit(p.x, p.y + 1, p.z, 0, 3, 0, 0.3, 0.28, 0.26, 0.6, R, R, 2.5, 0.5, 1);
        return;
      }
      const xt = exType(R, kind), xb = XB[xt];
      if (xb && xb.ready) { // лист ещё грузится — прежний взрыв (не пустота) // свой взрыв по типу боевой части: лист кадров; комья грунта — частицами (летят в объёме, в листе — их шлейфы)
        // размер — ×1,5 к физическому: снято в масштабе (у ФАБ-500 шар ≈ 40 м), но с высоты удар должен читаться (прежний кадр был 260 м)
        const j = XJ[xt], k = R / j.ref, H = j.width * k * EXK, rate = Math.min(1.6, Math.max(0.6, Math.sqrt(1 / k)));
        xb.add(p, H, rate);
        if (kind !== 'air' && kind !== 'plane' && R >= 30) api.clods(p, R, kind === 'tbm' ? 1.4 : 1);
        // остаточный дым: появляется, когда лист начинает растворяться (облако уже там), — те же место и размер, висит ещё 15–20 с, сносится ветром
        const T = j.times[j.frames - 1] / rate, P0 = p.clone(), air = kind === 'air' || kind === 'plane';
        // по форме облака в конце листа: «шапка» (плотная, выше), тонкий ствол, светлая пыль у земли; у воздушных — один клуб
        // s1 — размер к концу жизни (у частиц рост задаётся в м/с: s1 «как есть» за 50 с давал клубы в 3–4 км — видеокарта обрезала их прямоугольником)
        const puff = (n0, h0, h1, rr, s0, s1, c, a, life, up) => { const n = Math.max(1, Math.round(n0 / WAVES)); for (let i = 0; i < n; i++) {
          const an = Math.random() * 6.283, d = Math.random() * rr, hh = h0 + Math.random() * (h1 - h0), g = c * (0.85 + Math.random() * 0.3), L = life * (0.8 + Math.random() * 0.4);
          linger.emit(P0.x + Math.cos(an) * d, P0.y + hh, P0.z + Math.sin(an) * d, Math.cos(an) * 1.2, up * (0.6 + Math.random() * 0.8), Math.sin(an) * 1.2, g, g * 0.95, g * 0.88, a, s0, (s1 - s0) / L, L, 0.5, 0.15);
        } };
        // волнами, пока лист растворяется (последние 45 % его времени, S-кривая): дым густеет по мере того, как облако тает — стыка не видно
        const WAVES = 6;
        for (let w = 0; w < WAVES; w++) LATER.push({ t: T * (0.56 + 0.4 * w / (WAVES - 1)), f: () => {
          if (air) { puff(9 + R * 0.12, -H * 0.08, H * 0.08, H * 0.12, H * 0.16, H * 0.38, 0.2, 0.7, 40, 0.3); return; } // висит и медленно тает (как у настоящих разрывов ЗУР)
          puff(14 + R * 0.1, H * 0.25, H * 0.52, H * 0.22, H * 0.22, H * 0.45, 0.19, 0.75, 55, 0.5); // шапка: живёт ≈ 45–65 с, разрастается и редеет (тёмная — как облако листа)
          puff(7, H * 0.06, H * 0.3, H * 0.08, H * 0.14, H * 0.28, 0.22, 0.6, 35, 0.35); // ствол
          puff(8, H * 0.01, H * 0.05, H * 0.22, H * 0.16, H * 0.34, 0.43, 0.5, 35, 0.05); // пыль у земли
        } });
        return;
      }
      const air = kind === 'air' || kind === 'plane', tbm = kind === 'tbm', bomb = kind === 'bomb' || tbm, heavy = !air && (tbm || R >= 45);
      const h = air ? Math.max(14, R * 4.2) : tbm ? R * 7 : heavy ? R * 5.6 : bomb ? R * 4.2 : R * 3.6, fps = air ? 26 : tbm ? 15 : bomb ? 18 : 22;
      V.set(p.x, p.y + (air ? 0 : h * 0.33), p.z); EX.add(V, h, fps, { t0: air ? 0 : 3 / fps }); // у земли — сразу с 4-го кадра: шар растёт, пока вспышка внизу ещё горит
      if (air) return;
      // вспышка у земли ≈ 0,95–1,2 с (было 0,7 — пропадала раньше шара; 1,6–2 — слишком долго)
      if (bomb) { V.set(p.x, p.y + R * 0.3, p.z); BL.add(V, R * (tbm ? 6 : heavy ? 4.2 : 2.6), tbm ? 13 : 17); }
      if (heavy) api.heavyBlast(p, R, tbm);
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
    // тяжёлая боевая часть (≳ 250 кг) и баллистика: вспышка, второй огненный шар, выброс грунта комьями, столб пыли,
    // поднимающийся «грибом», широкая стелющаяся волна пыли и долго висящий тёмный дым
    // комья грунта: летят по дуге и падают (у своих взрывов — объём рядом с листом кадров). Живут до земли (Mark: «ошмётки резко исчезают» —
    // раньше гасли в воздухе), там поднимают облачко пыли, которое медленно оседает
    clods(p0, R, k) {
      const p = p0.clone();
      for (let i = 0; i < 28 * k; i++) {
        const a = Math.random() * 6.283, e = 0.35 + Math.random() * 0.55, s = (25 + Math.random() * 40) * (R / 45) * Math.sqrt(k), vy = s * Math.sin(e) * 1.4, vh = s * Math.cos(e);
        const tf = Math.max(1, (2 * vy) / 9.8 * 0.92); // время полёта (сопротивление воздуха — чуть короче)
        smoke.emit(p.x, p.y + 2, p.z, Math.cos(a) * vh, vy, Math.sin(a) * vh, 0.14, 0.12, 0.1, 0.95, 1.6 + Math.random() * 2, 0.4, tf * 1.5, 0.12, -9.8);
        if (i % 2) continue;
        const L = vh * (1 - Math.exp(-0.12 * tf)) / 0.12, gx = p.x + Math.cos(a) * L, gz = p.z + Math.sin(a) * L; // дальность с сопротивлением (drag 0,12, как у частицы)
        LATER.push({ t: tf, f: () => { const g = 0.4 + Math.random() * 0.08, gy = api.groundH ? api.groundH(gx, gz) : p.y; smoke.emit(gx, gy + 1, gz, 0, 0.6, 0, g, g * 0.93, g * 0.84, 0.4, 2 + Math.random() * 2, 0.6 + Math.random() * 0.4, 8 + Math.random() * 6, 0.6, 0.02); } }); // облачко пыли: до ≈ 8–12 м
      }
    },
    heavyBlast(p, R, tbm) {
      const k = tbm ? 1.4 : 1, h = R * (tbm ? 7 : 5.6);
      fire.emit(p.x, p.y + R * 0.4, p.z, 0, 0, 0, 1, 0.92, 0.75, 1, R * 3.2 * k, R * 2, 0.22, 0, 0); // вспышка
      V.set(p.x + (Math.random() - 0.5) * R * 0.3, p.y + h * 0.45, p.z + (Math.random() - 0.5) * R * 0.3); EX.add(V, h * 0.8, 13, { t0: -0.3 });
      // выбросы грунта лучами: в каждом луче частицы с разной скоростью — тёмная струя по дуге, потом оседает
      const nr = Math.round(10 * k);
      for (let r = 0; r < nr; r++) {
        const a = r / nr * 6.283 + Math.random() * 0.5, e = 0.55 + Math.random() * 0.75, s0 = (45 + Math.random() * 45) * Math.sqrt(R / 45) * k;
        for (let i = 0; i < 9; i++) {
          const s = s0 * (0.25 + i / 9 * 0.75), c = 0.12 + Math.random() * 0.06;
          smoke.emit(p.x, p.y + 2, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, c, c * 0.92, c * 0.85, 0.85, R * 0.06 + 1.5, R * 0.12, 3 + Math.random() * 2.5, 0.35, -9.8);
        }
      }
      for (let i = 0; i < 40 * k; i++) { // комья: летят по дуге и падают
        const a = Math.random() * 6.283, e = 0.35 + Math.random() * 0.55, s = (25 + Math.random() * 40) * (R / 45) * Math.sqrt(k);
        smoke.emit(p.x, p.y + 2, p.z, Math.cos(a) * s * Math.cos(e), s * Math.sin(e) * 1.4, Math.sin(a) * s * Math.cos(e), 0.14, 0.12, 0.1, 0.95, 1.6 + Math.random() * 2, 0.4, 2.5 + Math.random() * 2, 0.12, -9.8);
      }
      for (let i = 0; i < 18 * k; i++) { // столб пыли и дыма: тормозит, но поднимается дальше, расплываясь шапкой
        const a = Math.random() * 6.283, d = Math.random() * R * 0.3, c = 0.3 + Math.random() * 0.12;
        smoke.emit(p.x + Math.cos(a) * d, p.y + 3 + Math.random() * R * 0.3, p.z + Math.sin(a) * d, Math.cos(a) * 3, (14 + Math.random() * 20) * Math.sqrt(R / 45) * k, Math.sin(a) * 3,
          c, c * 0.93, c * 0.85, 0.55, R * 0.4, R * (0.5 + Math.random() * 0.35), 20 + Math.random() * 10, 0.5, 1.1);
      }
      for (let i = 0; i < 34 * k; i++) { // стелющаяся волна пыли у земли
        const a = i / (34 * k) * 6.283 + Math.random() * 0.2, s = (30 + Math.random() * 25) * (R / 45);
        smoke.emit(p.x + Math.cos(a) * R * 0.3, p.y + 2, p.z + Math.sin(a) * R * 0.3, Math.cos(a) * s * 1.3, 0.5 + Math.random() * 2, Math.sin(a) * s * 1.3, 0.5, 0.47, 0.42, 0.6, R * 0.35, R * 0.7, 9 + Math.random() * 5, 1.0, 0.2);
      }
      for (let i = 0; i < 6; i++) { // тёмный дым над местом удара — висит долго
        const a = Math.random() * 6.283;
        smoke.emit(p.x + Math.cos(a) * R * 0.2, p.y + h * (0.35 + Math.random() * 0.3), p.z + Math.sin(a) * R * 0.2, Math.cos(a) * 1.5, 2 + Math.random() * 2, Math.sin(a) * 1.5, 0.14, 0.13, 0.12, 0.45, R * 0.7, R * 0.55, 30 + Math.random() * 10, 0.2, 0.4);
      }
    },
    samTrail(m) { // дымный след ЗУР: у больших ракет — густой белый, у ПЗРК — тонкий серый; после ускорителя (маршевый ЖРД
      // С-75, прямоточный «Куба», маршевая ступень С-125) — тоньше и прозрачнее
      const big = m.M.L > 5, LN = m.ln, sus = LN && (LN.stage || LN.ramjet) && m.tb >= m.M.burn;
      const s = (big ? 9 : m.M.L > 2.5 ? 5 : 2.5) * (sus ? 0.45 : 1), back = sus && LN.stage ? m.M.L * (LN.stage - 0.5) + 0.3 : m.M.L * 0.6;
      const x = m.pos.x - m.dir.x * back, y = m.pos.y - m.dir.y * back, z = m.pos.z - m.dir.z * back;
      const mo = motorOf(m.unit && m.unit.key, 'sam', m.tb >= m.M.burn), rr = LN && LN.stage && !sus ? m.M.r * (LN.stageR || 1) : m.M.r;
      PL.add(m, x, y, z, mo, rr); // сплошная лента дыма по траектории; клубы-частицы ниже — объём (видны и вдоль ленты)
      smoke.emit(x, y, z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, mo.c[0], mo.c[1], mo.c[2], (big ? 0.4 : 0.28) * (sus ? 0.45 : 1) * Math.min(1, mo.a / 0.6), s, s * 0.9, big ? 9 : 5, 0.3, 0.3);
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
    // след из повреждённой зоны самолёта (plane-damage.js): kind 0 — серый дым, 1 — чёрный, 2 — огонь с чёрным дымом, 3 — течь бака (белёсые
    // пряди керосина: тоньше, быстро тают — с середины клуба); v — скорость самолёта
    trailStep: P.fxLo ? 3 : 2.5, // шаг клубов следа из зон (plane-damage.js), м: меньше молодого клуба — след не рвётся на «бусины»; на телефонных пресетах — реже (пул вдвое меньше)
    zoneTrail(p, v, wind, kind, k = 1) {
      // белёсый: в прежнем пуле свет сцены не учитывается — в сумерках и ночью приглушить по освещению (иначе светился бы в темноте; клубы PF — сами по uLight)
      if (kind === 3) { const c = (0.82 + Math.random() * 0.08) * (PF && PF.ready ? 1 : Math.min(1, Math.max(0.25, (LT.x + LT.y + LT.z) / 2.1))); trail(p.x, p.y, p.z, v.x * 0.15 + wind.x + (Math.random() - 0.5) * 2, v.y * 0.15, v.z * 0.15 + wind.z + (Math.random() - 0.5) * 2, c, c, c, (0.2 + 0.25 * k), (1.2 + 1.2 * k) * DS, (3 + 4 * k) * DG, 1.6 + 1.4 * k, 1.8, 0.1, 0.45); return; }
      const c = kind ? 0.1 + Math.random() * 0.06 : 0.45 + Math.random() * 0.1;
      trail(p.x, p.y, p.z, v.x * 0.12 + wind.x + (Math.random() - 0.5) * 2, v.y * 0.12 + 1, v.z * 0.12 + wind.z + (Math.random() - 0.5) * 2, c, c, c * 0.97, (0.35 + 0.3 * k) * (kind ? 1.1 : 0.8), (1.5 + 2 * k) * DS, (4 + 6 * k) * DG, 3 + 3 * k, 1.5, 0.7);
      if (kind === 2) fire.emit(p.x, p.y, p.z, v.x * 0.35, v.y * 0.35, v.z * 0.35, 1, 0.55 + Math.random() * 0.2, 0.18, 0.95, 1.6 + 1.6 * k, 2.5, 0.25, 1.5, 0);
    },
    debrisSmoke(p) { trail(p.x, p.y, p.z, 0, 0.5, 0, 0.6, 0.6, 0.58, 0.35, 1.2, 2, 2.5, 0.2, 0.2); },
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
        trail(x, y, z, a.vel.x * 0.12 + wind.x + (Math.random() - 0.5) * 3, a.vel.y * 0.12 + 1 + Math.random(), a.vel.z * 0.12 + wind.z + (Math.random() - 0.5) * 3,
          c, c, c * 0.97, 0.4 + 0.35 * k, (3 + k * 3) * DS, (7 + k * 9) * DG, 4 + k * 5, 1.6, 0.8);
        if (dark && Math.random() < 0.5) fire.emit(x, y, z, a.vel.x * 0.3, a.vel.y * 0.3, a.vel.z * 0.3, 1, 0.5 + Math.random() * 0.2, 0.15, 0.9, 2.6, 3, 0.22, 2, 0);
      }
    },
    wpnTrail(w, p) { // p — срез сопла (если известен), иначе 2 м за центром
      const x = p ? p.x : w.pos.x - w.dir.x * 2, y = p ? p.y : w.pos.y - w.dir.y * 2, z = p ? p.z : w.pos.z - w.dir.z * 2, k = p && w.W.vis ? Math.min(1, (w.W.kind === 'rocket' ? narVis(w.key, w.W).r : w.W.vis.r) * 2.5) : 1;
      const W = w.W, kind = W.kind === 'tbm' ? 'tbm' : W.kind, mo = motorOf(w.key, kind, false), r = kind === 'rocket' ? narVis(w.key, W).r : W.vis ? W.vis.r : 0.15; // у НАР — калибр ракеты, а не блока
      PL.add(w, x, y, z, mo, r);
      if (mo.a > 0.1) smoke.emit(x, y, z, 0, 0.5, 0, mo.c[0], mo.c[1], mo.c[2], 0.25 * Math.min(1, mo.a / 0.6) * (kind === 'rocket' ? 0.4 : 1), 3 * k, kind === 'rocket' ? 0.4 : 3, kind === 'rocket' ? 3 : 4, 0.3, 0.2); // НАР — мелкие клубы, ≤ 1,5 м (залп 4–20 ракет: большие шары закрывали вертолёт; Mark 2026-10-22 — всё ещё велики)
    },
    // ЛТЦ — каждый кадр, пока горит (спрайт с мерцанием и дымная лента — cmfx.js); пул — самые свежие 64 (32 на слабых)
    flareTick(f, dt) { CMF.tick(f, dt); },
    // выброс ловушек: made — ЛТЦ боя (sim/strike.js; их рисует flareTick), нет — онлайн-клиент: ЛТЦ-«картинки» из тех же точек отстрела;
    // диполи — облако из середины точек отстрела
    cmDrop(a, type, made) {
      if (type === 'flare') { if (made) CMF.arm(made, a); else CMF.cosFlares(a); } else CMF.cloud(a);
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
      const b = { pos: pos.clone(), r, t: 0, fl }; if (CB) b.col = colAdd(b); burning.push(b);
    },
    clearBurning() { LATER.length = 0; if (PF) PF.clear();for (let i = 0; i < LINGER_N; i++) linger.emit(0, -1e5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1e-4, 0, 0); /* остаточный дым прошлого боя — долой (у пула нет clear: все места — мёртвыми частицами) */ burning.length = 0; FL.clear(); PL.clear(); CMF.clear(); if (CB) CB.clear(); }, // новый бой — без пожаров и дымных лент прошлого
    // след взрыва у земли или на крыше: gh — высота земли (city.groundH), bh — высота здания (city.bldAt); kind 'bomb' — яма с
    // бруствером, 'ground' (ракета, снаряд) — ямка поменьше; на крыше — только копоть. Размер — от радиуса поражения R (≈ ∛ массы ВВ).
    // Земля за городом — с холмами: пятно чуть приподнято (на склоне край уходит в грунт)
    crater(p, R, kind, gh, bh) {
      const top = gh + bh;
      if (kind === 'air' || R < 4 || p.y - top > Math.max(6, R * 0.25)) return;
      const roof = bh > 1.5, tbm = kind === 'tbm', bomb = kind === 'bomb' || tbm, heavy = tbm || R >= 45;
      // баллистика бьёт сверху на скорости 2–6 М — воронка глубже и шире; тяжёлые бомбы и ракеты — крупнее обычных
      const pit = roof ? 0 : R * (tbm ? 0.2 : bomb ? (heavy ? 0.16 : 0.13) : heavy ? 0.11 : 0.07), soot = Math.max(pit * 3.4, R * (tbm ? 1.0 : bomb ? (heavy ? 0.58 : 0.46) : heavy ? 0.46 : 0.34));
      const dk = tbm ? 0.46 : bomb ? 0.38 : 0.3; // глубина ямы — доля радиуса
      CR.add(p.x, top + 0.06 + (roof ? 0 : 0.3 * dk * pit + soot * 0.03), p.z, soot, pit, dk); // плоскость — на верху бруствера
    },
    clearCraters() { CR.clear(); },
    wreckSmoke(p) { smoke.emit(p.x, p.y, p.z, 0, 2, 0, 0.15, 0.14, 0.13, 0.6, 6, 7, 5, 0.2, 0.5); fire.emit(p.x, p.y, p.z, 0, 0, 0, 1, 0.5, 0.15, 0.8, 4, 1, 0.3, 0, 0); },
    update(dt) {
      for (let i = LATER.length - 1; i >= 0; i--) if ((LATER[i].t -= dt) <= 0) { const L = LATER[i]; LATER.splice(i, 1); L.f(); }
      smoke.update(dt); fire.update(dt); linger.update(dt); flameTick(dt);
      // раскадровки: освещение дыма — небо и солнце сцены
      if (!hemi) for (const o of scene.children) { if (o.isHemisphereLight) hemi = o; else if (o.isDirectionalLight && !sunL) sunL = o; }
      LT.set(0.6, 0.6, 0.6); if (hemi) LT.set(hemi.color.r, hemi.color.g, hemi.color.b).multiplyScalar(hemi.intensity * 0.55);
      if (sunL) LT.x += sunL.color.r * sunL.intensity * 0.35, LT.y += sunL.color.g * sunL.intensity * 0.35, LT.z += sunL.color.b * sunL.intensity * 0.35;
      for (const b of books) b.update(dt, LT, scene.fog);
      if (PF) PF.update(dt, LT);
      PL.update(dt, LT, null, sunL ? V.copy(sunL.position).sub(sunL.target.position).normalize() : null);
      CMF.update(dt, LT);
      CR.mat.uniforms.uLight.value.copy(LT).multiplyScalar(0.8); if (sunL) CR.mat.uniforms.uSun.value.copy(sunL.position).sub(sunL.target.position).normalize(); // свет ходит за камерой
      if (scene.fog) { CR.mat.uniforms.uFog.value.copy(scene.fog.color); CR.mat.uniforms.uFogD.value = scene.fog.density || 0; }
      for (let i = 0; i < NT; i++) {
        if (tLife[i] <= 0) continue;
        tLife[i] -= dt; const i6 = i * 6, i3 = i * 3;
        if (tLife[i] <= 0) { tPos[i6 + 1] = tPos[i6 + 4] = -9999; continue; }
        for (let k = 0; k < 6; k += 3) { tPos[i6 + k] += tVel[i3] * dt; tPos[i6 + k + 1] += tVel[i3 + 1] * dt - 9.8 * dt * 0.5; tPos[i6 + k + 2] += tVel[i3 + 2] * dt; }
      }
      tGeo.attributes.position.needsUpdate = true;
      // пожары: огонь и столб дыма, со временем слабее
      for (const b of burning) {
        b.t += dt; const k = Math.max(0.25, 1 - b.t / 240);
        for (const f of b.fl) f.a = 0.45 + 0.55 * k; // пламя со временем слабее
        if (b.col) b.col.a = 0.35 + 0.65 * k; // столб дыма — тоже
        if (Math.random() < dt * 3 * k) fire.emit(b.pos.x + (Math.random() - 0.5) * b.r * 0.6, b.pos.y + 2 + Math.random() * b.r * 0.4, b.pos.z + (Math.random() - 0.5) * b.r * 0.6, 0, 10, 0, 1, 0.6, 0.2, 0.9, 0.8, 0, 1.2, 0.3, 0); // искры
        if (Math.random() < dt * (b.col ? 2.5 : 9) * k) { /* со столбом-петлёй — клубов втрое меньше (объём у основания) */ const g = 0.15 + Math.random() * 0.13; smoke.emit(b.pos.x + (Math.random() - 0.5) * b.r, b.pos.y + 6, b.pos.z + (Math.random() - 0.5) * b.r, 3 + Math.random() * 2, 9, 1, g, g * 0.94, g * 0.88, 0.48, b.r * 0.6, b.r * 0.9, 16, 0.05, 1.2); } // клубы разного тона, полупрозрачные (вблизи не сплошное чёрное пятно)
      }
    },
  };
}
