// Задания и расстановка ПВО: общие для вылета (ИИ-ПВО против игрока), фона меню и обучения.
import { CITY, KIND, riverX } from './city.js?v=20261024t';
import { SAM, DEFENSE } from './arsenal.js?v=20261024t';

// без резкого перегиба рельефа: земля нарисована сеткой треугольников (клетка 50–80 м), на гребне или в ложбине она расходится с точной
// высотой карты на метры (на «Северном рубеже» — до 33 м: машина висела в воздухе или стояла под землёй, ракеты — из воздуха). Центр против
// среднего по кресту ±40 м — оценка этого расхождения; сервер и клиент считают одинаково (без сетки)
function flatish(city, x, z) {
  const h = city.groundH, c = h(x, z);
  for (const r of [25, 50, 80]) { const m = (h(x + r, z) + h(x - r, z) + h(x, z + r) + h(x, z - r) + h(x + r, z + r) + h(x - r, z - r) + h(x + r, z - r) + h(x - r, z + r)) / 8; if (Math.abs(c - m) > 0.12 * r / 25) return false; }
  return true;
}
// свободное место на земле: без зданий рядом и не в реке (в горах — не на крутом склоне). strict — для авторасстановки (spotNear, уроки):
// ещё и без перегиба рельефа и дальше от реки; ручную расстановку (оборона, сервер) не ужесточаем — машину и так сажает на сетку земли seat()
export function freeGround(city, x, z, r = 9, strict = false) {
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (city.bldAt(x + dx, z + dz) > 0) return false;
  if (Math.abs(x) >= CITY.HALF - 1200 || Math.abs(z) >= CITY.HALF - 1200) return false;
  if (city.kind === 'winter') return city.slopeAt(x, z) <= 0.32 && (!strict || flatish(city, x, z)); // горы: не на крутом склоне (лёд — можно)
  if (city.kind === 'autumn') return city.slopeAt(x, z) <= 0.32 && !city.waterAt(x, z) && (!strict || flatish(city, x, z)); // холмы: не на круче и не в болото
  return Math.abs(x - riverX(z)) > CITY.RIVER_W / 2 + (strict ? 50 : 15) && (!strict || flatish(city, x, z)); // берег спускается к воде до +35 м от уреза (city.js groundH), машине нужно ещё ~10 м: на откосе висела над рекой
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
    if (freeGround(city, x, z, 9, true)) return [x, z, false];
  }
  // рядом не нашлось: дальше (до трёх радиусов), а если и там нет — лучшее из просмотренного: без домов и воды, с наименьшим перегибом
  // рельефа (раньше — точка (cx + r1, cz) без проверок: на круче «Северного рубежа» машина висела на 20–30 м или стояла в земле)
  let best = null, bs = 1e9;
  for (let k = 0; k < 600; k++) {
    const a = rnd() * Math.PI * 2, d = r0 + rnd() * (r1 * 3 - r0), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (freeGround(city, x, z, 9, true)) return [x, z, false];
    const sc = groundScore(city, x, z); if (sc < bs) { bs = sc; best = [x, z, false]; }
  }
  return best || [cx + r1, cz, false];
}
// чем хуже место для машины: дома и вода — нельзя, иначе перегиб рельефа и крутизна
function groundScore(city, x, z) {
  if (city.bldAt(x, z) > 0 || Math.abs(x) >= CITY.HALF - 1200 || Math.abs(z) >= CITY.HALF - 1200) return 1e9;
  if (city.kind === 'autumn' && city.waterAt(x, z)) return 1e9;
  if ((!city.kind || city.kind === 'city') && Math.abs(x - riverX(z)) < CITY.RIVER_W / 2 + 50) return 1e9;
  const h = city.groundH, c = h(x, z); let e = 0;
  for (const r of [25, 50, 80]) e = Math.max(e, Math.abs(c - (h(x + r, z) + h(x - r, z) + h(x, z + r) + h(x, z - r)) / 4) / r);
  return e + (city.slopeAt ? city.slopeAt(x, z) * 0.1 : 0);
}
// цели: n объектов (мост — один случайный)
// цели — только военные объекты (мосты — часть города, не цель)
export function pickTargets(S, rnd, n = 3, pool = ['tpp', 'oil', 'tv', 'gov', 'port', 'air', 'stad']) {
  // цели города по ключам; на другой карте (зимняя долина — свои ключи) — любые объекты-цели
  let cand = pool.map((k) => S.objects.find((o) => o.key === k)).filter(Boolean);
  if (!cand.length) cand = S.objects.filter((o) => !o.noTarget);
  const out = [];
  while (out.length < Math.min(n, cand.length)) { const o = cand[Math.floor(rnd() * cand.length)]; if (!out.includes(o)) out.push(o); }
  return out;
}
// ИИ-ПВО по набору эпохи и стороны: дальние — кольцом вокруг центра, ближние и пушки — у целей, ПЗРК — на крышах
// o — поправки сложности (difficulty.js): ambush — доля засад, skill — прибавка к опыту расчётов; heli — против вертолёта (Mark 2026-10-22):
// только ближние (досягаемость ≤ 16 км: ПЗРК, пушки, «Оса» / «Тор» / Roland / Rapier…), дальних, средних и глушилок GPS нет; число — с дробной
// частью по жребию (при малом k иначе округлялось бы в ноль), но не меньше трёх комплексов на вылет
export function placeDefense(S, city, rnd, side, era, targets, k = 1, o = {}) {
  let ti = 0;
  const list = DEFENSE[side][era].filter(([key]) => !o.heli || (SAM[key].rmax <= 16000 && SAM[key].type !== 'jammer'));
  const cnt = list.map(([, n0]) => (o.heli ? Math.floor(n0 * k + rnd()) : Math.round(n0 * k)));
  if (o.heli && list.length) for (let i = 0; cnt.reduce((s, c) => s + c, 0) < Math.min(3, list.reduce((s, [, n0]) => s + n0, 0)); i++) cnt[i % cnt.length]++;
  for (let j = 0; j < list.length; j++) for (let i = 0; i < cnt[j]; i++) {
    const key = list[j][0], Sx = SAM[key], tgt = targets[ti++ % targets.length];
    let xz;
    if (Sx.rmax >= 15000) { const a = rnd() * Math.PI * 2, r = 2500 + rnd() * 4000; xz = spotNear(city, rnd, 500 + Math.cos(a) * r, -300 + Math.sin(a) * r, 0, 900, false); }
    else if (Sx.type === 'ir' && Sx.hp <= 15) xz = spotNear(city, rnd, tgt.x, tgt.z, 250, 1600, true);
    else xz = spotNear(city, rnd, tgt.x, tgt.z, 250, 1400, false);
    S.addUnit(key, xz[0], xz[1], { roof: xz[2], ambush: !!Sx.radar && Sx.type !== 'guns' && rnd() < (o.ambush ?? 0.3), skill: Math.min(1, Math.max(0.35, 0.5 + rnd() * 0.45 + (o.skill || 0))), yaw: rnd() * 6.28 });
  }
}
