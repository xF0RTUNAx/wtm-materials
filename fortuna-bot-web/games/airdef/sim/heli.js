// Лётная модель вертолётов «Воздушного превосходства» (Хеллоуин 2026): тяга несущего винта — вдоль оси диска (наклон
// корпуса), сила тяжести, сопротивление по горизонтали и по вертикали (диск). Скорости и скороподъёмность — SPEED_K = 0,8 от
// реальных, как у самолётов (sim/flight.js); сила тяжести настоящая. Тяга падает с плотностью воздуха так, что на потолке
// (с приростом на поступательной скорости — «косая обдувка», ETL) её хватает ровно на горизонтальный полёт.
// «Аркада» — ручка задаёт скорость (вперёд — до максимальной, отпустили — вертолёт сам тормозит и зависает), газ — вертикальную
// скорость (отпустили — держит высоту), у земли снижение мягче (посадка сама). «Реализм» — ручка задаёт угловую скорость
// (наклон держится, пока не вернёте), шаг винта — тяга (остаётся, где поставили), вихревое кольцо при быстром снижении без
// поступательной скорости, без автоматического торможения.
// Состояние — поля самолёта ядра (pos, vel, yaw, pitch, roll, speed: drone/sim/core.js), углы — порядок YXZ, как у моделей;
// плюс col (шаг 0…1), landed. Повреждения: thrK — доля тяги (двигатели), trotK — рулевой винт (0 — разрушен: вращение от
// реактивного момента), ctrlK — управление. Чистая математика, без THREE: импортируют клиент, сервер и стенд.
export const SPEED_K = 0.8;
const G = 9.81, D2R = Math.PI / 180, ETL = 1.3; // ETL — прирост тяги на поступательной скорости (от зависания к 20+ м/с)
const sigma = (h) => Math.exp(-Math.max(0, h) / 9000);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapPI = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ТТХ (открытые данные): m — нормальная взлётная, кг (с оружием); tw — тяговооружённость у земли на висении (тяга / вес);
// vmax — наибольшая скорость, км/ч (реальная); vc — скороподъёмность у земли, м/с (реальная); ceil — практический
// (динамический) потолок, м; roll / pitch / yaw — наибольшие угловые скорости, °/с; tilt — наибольший наклон
// диска в «Аркаде», °; coax — соосная схема (нет рулевого винта и реактивного момента)
export const HSPECS = {
  h_mi24: { name: 'Ми-24В', side: 'east', m: 11200, tw: 1.3, vmax: 320, vc: 12.5, ceil: 4500, roll: 70, pitch: 40, yaw: 45, tilt: 26 },
  h_mi28: { name: 'Ми-28Н', side: 'east', m: 11200, tw: 1.35, vmax: 300, vc: 13.6, ceil: 5600, roll: 80, pitch: 45, yaw: 60, tilt: 28 },
  h_ka52: { name: 'Ка-52', side: 'east', m: 10400, tw: 1.38, vmax: 300, vc: 10, ceil: 5500, roll: 90, pitch: 45, yaw: 90, tilt: 28, coax: true },
  // 2026-10-21: четыре вертолёта (открытые данные). Ка-50 — легче и быстрее Ка-52 (одноместный, без второго члена экипажа и РЛС); Ми-8МТВ — тяжёлый транспортно-боевой,
  // медленнее Ми-24 (чаще «качает»: меньший наклон диска, вяло по крену); UH-60 — вооружённый (DAP): средний, мощный; RAH-66 — лёгкий и манёвренный
  h_ka50: { name: 'Ка-50', side: 'east', m: 9800, tw: 1.4, vmax: 315, vc: 10, ceil: 5500, roll: 90, pitch: 45, yaw: 95, tilt: 28, coax: true },
  h_mi8: { name: 'Ми-8МТВ', side: 'east', m: 12000, tw: 1.22, vmax: 250, vc: 9, ceil: 4500, roll: 55, pitch: 32, yaw: 45, tilt: 21 },
  h_uh60: { name: 'UH-60 DAP', side: 'west', m: 8500, tw: 1.34, vmax: 296, vc: 8.5, ceil: 5700, roll: 85, pitch: 45, yaw: 65, tilt: 26 },
  h_rah66: { name: 'RAH-66 Comanche', side: 'west', m: 5800, tw: 1.5, vmax: 324, vc: 10, ceil: 4600, roll: 120, pitch: 55, yaw: 85, tilt: 32 },
  h_ah64: { name: 'AH-64D Apache', side: 'west', m: 8000, tw: 1.4, vmax: 280, vc: 12.7, ceil: 6400, roll: 100, pitch: 50, yaw: 70, tilt: 30 },
  h_ah1: { name: 'AH-1W SuperCobra', side: 'west', m: 6690, tw: 1.32, vmax: 282, vc: 8.2, ceil: 5500, roll: 110, pitch: 50, yaw: 70, tilt: 30 },
  h_uh1: { name: 'UH-1H', side: 'west', m: 4100, tw: 1.25, vmax: 205, vc: 8.2, ceil: 3800, roll: 80, pitch: 40, yaw: 60, tilt: 24 },
};
export const isHeli = (key) => !!HSPECS[key];

// производные коэффициенты: kd — горизонтальное сопротивление (на наибольшем наклоне — ровно vmax), kv — вертикальное (на
// полном шаге у земли — ровно vc), ex — спад тяги с плотностью (на потолке с ETL — тяга = весу)
export function heliModel(key, opts = {}) {
  const s = HSPECS[key]; if (!s) return null;
  const vmax = SPEED_K * s.vmax / 3.6, vc = SPEED_K * s.vc, tilt = s.tilt * D2R;
  return {
    key, s, arcade: !!opts.arcade, vmax, vc, tilt,
    kd: G * Math.tan(tilt) / (vmax * vmax),
    kv: G * (s.tw - 1) / (vc * vc),
    ex: Math.log(s.tw * ETL) * 9000 / s.ceil,
    rollR: s.roll * D2R, pitchR: s.pitch * D2R, yawR: s.yaw * D2R,
  };
}
// наибольшая тяга / масса, м/с²: высота, поступательная скорость vh, доля тяги
export function tmaxAcc(hm, h, vh, thrK = 1) {
  const etl = 1 + (ETL - 1) * smooth(6, 22, vh) * (1 - 0.35 * smooth(0.75 * hm.vmax, 1.1 * hm.vmax, vh)); // на большой скорости прирост уходит
  return hm.s.tw * G * Math.pow(sigma(h), hm.ex) * etl * thrK;
}
// ось диска (вверх корпуса) в мире: Ry·Rx·Rz·(0, 1, 0)
export function upOf(a, out = {}) {
  const sp = Math.sin(a.pitch), cp = Math.cos(a.pitch), sy = Math.sin(a.yaw), cy = Math.cos(a.yaw), sr = Math.sin(a.roll), cr = Math.cos(a.roll);
  out.x = -sr * cy + cr * sp * sy; out.y = cr * cp; out.z = sr * sy + cr * sp * cy; return out;
}
export function heliInit(a) { a.col = a.col ?? 0.75; a.landed = !!a.landed; a.wy = 0; a.wp = 0; a.wr = 0; a.n = 1; }

// Шаг. u — команды: cx (вправо +), cy (вперёд +), col (газ −1…1: вниз / вверх), yaw (педали −1…1: вправо +) или yawTo (курс,
// рад — наведение камерой: нос за взглядом), pitchTo (угол взгляда, рад; «Аркада»: вниз — нос за ним). env — { groundY: высота земли под вертолётом, gear: высота центра над землёй
// стоя на шасси, groundAhead: «Аркада» — самая высокая земля на пути за ближайшие ≈ 2,5 с }. Возвращает null или событие: { touch: скорость удара (м/с) } —
// коснулись земли (решает вызывающий: посадка или авария), 'lift' — оторвались.
const UP = {};
export function heliStep(a, hm, u, dt, env = {}) {
  const s = hm.s, ctrl = a.ctrlK ?? 1;
  const cY = Math.cos(a.yaw), sY = Math.sin(a.yaw);
  // скорость в осях курса: f — вперёд (нос — в −Z при yaw 0), r — вправо
  const vf = -a.vel.x * sY - a.vel.z * cY, vr = a.vel.x * cY - a.vel.z * sY, vh = Math.hypot(a.vel.x, a.vel.z);
  const agl = env.groundY !== undefined ? a.pos.y - env.groundY - (env.gear ?? 2) : 1e9;
  const tA = tmaxAcc(hm, a.pos.y, vh, a.thrK ?? 1);
  // «Аркада» (2026-10-22: врезались в склон на полной скорости — склон рос быстрее набора): нужный набор, чтобы пройти землю впереди
  // за 2,5 с с той же высотой над ней (не ниже 4 м, запас не больше 10 м — полёт «на брюхе» за рельефом не мешает); не успеваем — сбавляем
  // скорость вперёд. Только на скорости (висение и посадка — как было)
  const climb = hm.arcade && env.groundAhead !== undefined && agl < 1e8
    ? (env.groundAhead + (env.gear ?? 2) + Math.max(4, Math.min(agl, 10)) - a.pos.y) / 2.5 * smooth(8, 18, vh) : 0;
  // ── ориентация ──
  if (hm.arcade) {
    // ручка — желаемая скорость: вперёд до наибольшей (наклон с упреждением — сколько нужно, чтобы держать эту скорость, плюс
    // поправка по ошибке), вбок на висении — до 18 м/с; на скорости ручка вбок — крен до ~45° (вираж); отпустили — тормозит
    const wantF = clamp(u.cy, -0.35, 1) * hm.vmax * (climb > 0.6 * hm.vc ? clamp(0.6 * hm.vc / climb, 0.3, 1) : 1), wantR = clamp(u.cx, -1, 1) * 18;
    const ff = (v) => Math.sign(v) * Math.atan(hm.kd * v * v / G);
    let pd = -clamp(ff(wantF) + clamp((wantF - vf) / 14, -1, 1) * hm.tilt, -hm.tilt * 1.15, hm.tilt * 1.15);
    const pdSpd = pd; // наклон для заданной скорости — у земли не ограничивается (ограничение резало скорость ниже 30 м на 25–40 %, ревью 2026-10-22)
    // взгляд вниз круче ~7° (наведение камерой) — нос за ним, до 1,3 наибольшего наклона: прицеливание НАР и ПТУР по земле
    // (вертолёт при этом разгоняется — как на пологом пикировании)
    if (u.pitchTo !== undefined && u.pitchTo < -0.12) pd = Math.min(pd, Math.max(u.pitchTo, -hm.tilt * 1.3));
    if (u.pitchHold && u.pitchTo !== undefined) pd = clamp(u.pitchTo, -hm.tilt * 1.3, hm.tilt); // ИИ: нос точно по прицелу (залп НАР)
    // у земли нос вниз за прицелом — не круче, чем успеваем выйти (2026-10-22: пикирование на цель носом −35° на 4 м — тяги на выход не хватало)
    if (agl < 60 && pd < pdSpd) pd = Math.max(pd, Math.min(pdSpd, -hm.tilt * 1.3 * clamp(agl / 60, 0.35, 1)));
    const bank = smooth(15, 35, vf);
    // у земли (ниже 40 м) крен — не больше, чем держит тяга (вертикальной составляющей хватает на вес с запасом 15 %): в вираже 45°
    // проседал на 1,5–3,5 м/с и касался земли; выше и при запасе тяги — вираж как был
    const bmax = agl < 40 ? Math.acos(Math.min(1, G * 1.15 / Math.max(tA * Math.cos(a.pitch), G * 1.15))) : 9; // и наклон носа на скорости съедает вертикальную тягу
    const rd = clamp((1 - bank) * -clamp(ff(wantR) + clamp((wantR - vr) / 9, -1, 1) * hm.tilt, -hm.tilt, hm.tilt) + bank * -clamp(u.cx, -1, 1) * 0.8, -bmax, bmax);
    a.wp = clamp((pd - a.pitch) * 3, -hm.pitchR, hm.pitchR) * ctrl;
    a.wr = clamp((rd - a.roll) * 3.5, -hm.rollR, hm.rollR) * ctrl;
  } else {
    // ручка — угловая скорость (с лёгким демпфированием); ориентация держится сама — как у вертолёта с триммером.
    // u.stab — мягкая стабилизация (Mark 2026-10-21, «Реализм» игрока): ручку отпустили — сам плавно выходит в горизонт,
    // на малой скорости ещё и гасит снос (лёгкий наклон против скорости), как автопилот-«помощник» настоящих вертолётов
    const slow = 1 - smooth(10, 25, vh), freeP = u.stab && Math.abs(u.cy) < 0.05, freeR = u.stab && Math.abs(u.cx) < 0.05;
    const tp = freeP ? clamp((clamp(vf * 0.015, -0.12, 0.12) * slow - a.pitch) * 1.2, -hm.pitchR * 0.4, hm.pitchR * 0.4) : u.cy * -hm.pitchR * 0.8;
    const tr = freeR ? clamp((clamp(vr * 0.015, -0.15, 0.15) * slow - a.roll) * 1.4, -hm.rollR * 0.4, hm.rollR * 0.4) : u.cx * -hm.rollR * 0.8;
    a.wp += (tp * ctrl - a.wp) * Math.min(1, 6 * dt);
    a.wr += (tr * ctrl - a.wr) * Math.min(1, 6 * dt);
  }
  a.pitch = clamp(a.pitch + a.wp * dt, -1.0, 1.0); a.roll = clamp(a.roll + a.wr * dt, -1.2, 1.2);
  // ── курс: педали / взгляд; на скорости — флюгер (киль) и согласованный вираж по крену ──
  const fast = smooth(12, 35, vh);
  let wy;
  if (u.yawTo !== undefined) wy = clamp(wrapPI(u.yawTo - a.yaw) * 2.5, -hm.yawR, hm.yawR) * ctrl;
  else wy = -clamp(u.yaw || 0, -1, 1) * hm.yawR * ctrl;
  wy = wy * (1 - 0.6 * fast) + fast * G * Math.tan(a.roll) / Math.max(vh, 12); // крен вправо (roll < 0) — нос вправо (yaw убывает)
  if (vh > 8 && u.yawTo === undefined) wy += fast * clamp(wrapPI(Math.atan2(-a.vel.x, -a.vel.z) - a.yaw), -0.6, 0.6) * 1.2 * (vf > 0 ? 1 : 0); // флюгер: нос к потоку
  if (!s.coax && (a.trotK ?? 1) < 1) wy += (1 - (a.trotK ?? 1)) * (0.3 + 2.2 * a.col) * (1 - 0.8 * fast); // рулевой винт разбит — реактивный момент крутит
  a.wy += (wy - a.wy) * Math.min(1, 5 * dt); a.yaw = wrapPI(a.yaw + a.wy * dt);
  // ── шаг винта (тяга) ──
  upOf(a, UP);
  if (hm.arcade) {
    // газ — вертикальная скорость; отпустили — держит высоту; у земли снижение не быстрее ~половины высоты в секунду
    let vyc = clamp(u.col || 0, -1, 1) * (u.col > 0 ? hm.vc : 1.3 * hm.vc);
    if (agl < 40) vyc = Math.max(vyc, -Math.max(1.2, agl * 0.45));
    if (climb > 0) vyc = Math.max(vyc, Math.min(climb * 1.6, 1.3 * hm.vc)); // облёт рельефа: земля впереди выше — набор сам
    const need = G + (vyc - a.vel.y) * 1.8 + hm.kv * a.vel.y * Math.abs(a.vel.y);
    a.col = clamp(need / Math.max(UP.y, 0.3) / tA, 0, 1);
  } else {
    a.col = clamp(a.col + (u.col || 0) * 0.55 * dt, 0, 1);
  }
  let T = a.col * tA;
  // вихревое кольцо («Реализм»): быстрое снижение почти без поступательной скорости — тяга проваливается
  if (!hm.arcade && a.vel.y < -6 && vh < 12) T *= 1 - 0.35 * smooth(6, 11, -a.vel.y) * (1 - smooth(6, 12, vh));
  // влияние земли: у самой земли (до ~ диаметра винта) тяги больше
  if (agl < 15) T *= 1 + 0.12 * (1 - agl / 15);
  a.n = T / G;
  // ── силы ──
  const ax = UP.x * T - hm.kd * a.vel.x * vh - (vh > hm.vmax ? hm.kd * 3 * (vh - hm.vmax) * a.vel.x : 0);
  const az = UP.z * T - hm.kd * a.vel.z * vh - (vh > hm.vmax ? hm.kd * 3 * (vh - hm.vmax) * a.vel.z : 0);
  const ay = UP.y * T - G - hm.kv * a.vel.y * Math.abs(a.vel.y);
  if (a.landed) {
    // стоит на земле: держит, пока тяга меньше веса; скольжения нет
    a.vel.x = a.vel.z = 0; a.vel.y = Math.max(0, a.vel.y + ay * dt);
    a.pitch += (0 - a.pitch) * Math.min(1, 4 * dt); a.roll += (0 - a.roll) * Math.min(1, 4 * dt);
    if (ay > 0.3) { a.landed = false; a.pos.y += a.vel.y * dt; a.speed = Math.abs(a.vel.y); return 'lift'; }
    a.vel.y = 0; a.speed = 0; return null;
  }
  a.vel.x += ax * dt; a.vel.y += ay * dt; a.vel.z += az * dt;
  a.pos.x += a.vel.x * dt; a.pos.y += a.vel.y * dt; a.pos.z += a.vel.z * dt;
  a.speed = Math.hypot(a.vel.x, a.vel.y, a.vel.z);
  if (env.groundY !== undefined && a.pos.y - (env.gear ?? 2) < env.groundY) {
    const hit = { touch: Math.hypot(a.vel.y, 0.5 * vh), vh, vy: -a.vel.y, tilt: Math.max(Math.abs(a.pitch), Math.abs(a.roll)) };
    a.pos.y = env.groundY + (env.gear ?? 2);
    return hit;
  }
  return null;
}
// посадка или авария по касанию: мягко (вертикально до 3,5 м/с, вбок до 6 м/с, наклон до ~17°) — сели; до 7 м/с — жёсткая
// посадка (урон); сильнее — авария
export function touchVerdict(hit) {
  if (hit.vy < 3.5 && hit.vh < 6 && hit.tilt < 0.3) return 'land';
  if (hit.vy < 7 && hit.vh < 10 && hit.tilt < 0.45) return 'hard';
  return 'crash';
}
export function heliLand(a) { a.landed = true; a.vel.x = a.vel.y = a.vel.z = 0; a.speed = 0; a.wp = a.wr = a.wy = 0; }
