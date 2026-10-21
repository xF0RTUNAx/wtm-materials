// Ловушки самолётов и вертолётов: где у машины точки отстрела ЛТЦ и диполей, сколько ЛТЦ в залпе (2026-10-21, решение Mark).
// Только данные и функции — без three.js и DOM: файл читают и клиент (sim/strike.js, отрисовка), и онлайн-сервер.
//   flare — есть ли ЛТЦ (false — старые машины: на кнопку выбрасываются только диполи, облако — из хвостовой части);
//   salvo — ЛТЦ за одно нажатие; at — точки отстрела в осях модели игры (метры, нос в −Z, после центровки — как stations / nozzles в
//   models.js; сняты по готовым моделям); dir — единичный вектор выброса для каждой точки. Залп больше числа точек — точки по кругу.
//   Диполи (облако) — из середины точек at.
const CM = {
@@TABLE@@
};

// модели нет в таблице — по классу: Восток (сверху хвоста), Запад (снизу), вертолёт (хвостовая балка)
const DEF = {
  east: { flare: true, salvo: 2, at: [[-0.4, 0.6, 4], [0.4, 0.6, 4]], dir: [[-0.55, 0.82, 0.1], [0.55, 0.82, 0.1]] },
  west: { flare: true, salvo: 2, at: [[-0.45, -0.9, 4], [0.45, -0.9, 4]], dir: [[-0.35, -0.92, 0.1], [0.35, -0.92, 0.1]] },
  heli: { flare: true, salvo: 2, at: [[-0.3, 0, 4.5], [0.3, 0, 4.5]], dir: [[-0.97, -0.2, 0.05], [0.97, -0.2, 0.05]] },
};
export const cmOf = (key, side = 'east') => CM[key] || (/^h_/.test(key || '') ? DEF.heli : side === 'west' ? DEF.west : DEF.east);
// чем больше залп, тем чаще ловушки уводят ГСН: ×(1 + 0,1·(залп − 2)), не больше ×1,4
export const cmBoost = (salvo) => Math.min(1.4, 1 + 0.1 * Math.max(0, salvo - 2));
// ключ модели машины: у ИИ-налёта — model, у самолёта игрока и онлайн-лётчика — plane
export const cmKey = (a) => a.model || a.plane || '';
// поворот вектора из осей модели в мир: крен → тангаж → курс (порядок YXZ — как у моделей и в fwdOf)
function rot(a, v, o) {
  const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw), sp = Math.sin(a.pitch), cp = Math.cos(a.pitch), sr = Math.sin(a.roll || 0), cr = Math.cos(a.roll || 0);
  const x1 = v[0] * cr - v[1] * sr, y1 = v[0] * sr + v[1] * cr, y2 = y1 * cp - v[2] * sp, z2 = y1 * sp + v[2] * cp;
  o[0] = x1 * cy + z2 * sy; o[1] = y2; o[2] = -x1 * sy + z2 * cy; return o;
}
// точка i залпа и направление выброса в мире (pos, dir — выходные массивы [x, y, z])
export function cmWorld(a, cm, i, pos, dir) {
  const k = i % cm.at.length;
  rot(a, cm.at[k], pos); pos[0] += a.pos.x; pos[1] += a.pos.y; pos[2] += a.pos.z; rot(a, cm.dir[k], dir);
}
// середина точек отстрела в мире — место облака диполей
export function cmCenter(a, cm, out) {
  const c = [0, 0, 0]; for (const p of cm.at) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  const n = cm.at.length; rot(a, [c[0] / n, c[1] / n, c[2] / n], out); out[0] += a.pos.x; out[1] += a.pos.y; out[2] += a.pos.z; return out;
}
export { CM };
