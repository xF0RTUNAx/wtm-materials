// Задания и расстановка ПВО: общие для вылета (ИИ-ПВО против игрока), фона меню и обучения.
import { CITY, KIND, riverX } from './city.js?v=20261012c';
import { SAM, DEFENSE } from './arsenal.js?v=20261012c';

// свободное место на земле: без зданий рядом и не в реке
export function freeGround(city, x, z, r = 9) {
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (city.bldAt(x + dx, z + dz) > 0) return false;
  return Math.abs(x - riverX(z)) > CITY.RIVER_W / 2 + 15 && Math.abs(x) < CITY.HALF - 1200 && Math.abs(z) < CITY.HALF - 1200;
}
// крыша, на которую можно поставить ПЗРК (не стеклянная башня, не частный дом, не выше 90 м)
export function roofOk(city, i) { const B = city.B; return B.h[i] >= 12 && B.h[i] <= 90 && B.y0[i] === 0 && B.k[i] !== KIND.GLASS && B.k[i] !== KIND.HOUSE; }
export function buildingAt(city, x, z) {
  const B = city.B;
  for (let i = 0; i < B.n; i++) if (Math.abs(x - B.x[i]) < B.w[i] / 2 && Math.abs(z - B.z[i]) < B.d[i] / 2) return i;
  return -1;
}
export function spotNear(city, rnd, cx, cz, r0, r1, roof) {
  if (roof) {
    const B = city.B;
    for (let tries = 0; tries < 800; tries++) {
      const i = Math.floor(rnd() * B.n), d = Math.hypot(B.x[i] - cx, B.z[i] - cz);
      if (d < r0 || d > r1 || !roofOk(city, i)) continue;
      return [B.x[i], B.z[i], true];
    }
  }
  for (let k = 0; k < 300; k++) {
    const a = rnd() * Math.PI * 2, d = r0 + rnd() * (r1 - r0), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (freeGround(city, x, z)) return [x, z, false];
  }
  return [cx + r1, cz, false];
}
// цели: n объектов (мост — один случайный)
// цели — только военные объекты (мосты — часть города, не цель)
export function pickTargets(S, rnd, n = 3, pool = ['tpp', 'oil', 'tv', 'gov', 'port', 'air', 'stad']) {
  const keys = [];
  while (keys.length < Math.min(n, pool.length)) { const k = pool[Math.floor(rnd() * pool.length)]; if (!keys.includes(k)) keys.push(k); }
  return keys.map((k) => S.objects.find((o) => o.key === k));
}
// ИИ-ПВО по набору эпохи и стороны: дальние — кольцом вокруг центра, ближние и пушки — у целей, ПЗРК — на крышах
export function placeDefense(S, city, rnd, side, era, targets, k = 1) {
  let ti = 0;
  for (const [key, n0] of DEFENSE[side][era]) for (let i = 0; i < Math.round(n0 * k); i++) {
    const Sx = SAM[key], tgt = targets[ti++ % targets.length];
    let xz;
    if (Sx.rmax >= 15000) { const a = rnd() * Math.PI * 2, r = 2500 + rnd() * 4000; xz = spotNear(city, rnd, 500 + Math.cos(a) * r, -300 + Math.sin(a) * r, 0, 900, false); }
    else if (Sx.type === 'ir' && Sx.hp <= 15) xz = spotNear(city, rnd, tgt.x, tgt.z, 250, 1600, true);
    else xz = spotNear(city, rnd, tgt.x, tgt.z, 250, 1400, false);
    S.addUnit(key, xz[0], xz[1], { roof: xz[2], ambush: !!Sx.radar && Sx.type !== 'guns' && rnd() < 0.3, skill: 0.5 + rnd() * 0.45, yaw: rnd() * 6.28 });
  }
}
