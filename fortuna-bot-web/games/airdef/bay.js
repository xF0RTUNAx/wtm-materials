// Отсеки вооружения (Mark 2026-11-06: «все у кого вооружение в бомболюках, то в игре нужно реализовывать его так физически через бомболюк»).
// Только вид: симуляция, время пуска и траектории те же. Створки открываются при пуске, остальное оружие этой стороны видно в открытом отсеке,
// а пущенное первые доли секунды висит на своей точке и плавно уходит на настоящую траекторию (S.wpns). Описание створок - META.bay в models.js.
/* global THREE */
const OPEN_T = 0.22, CLOSE_T = 0.5, HOLD_OPEN = 1.2; // с: открытие, закрытие, сколько отсек открыт после последнего пуска
const HOLD = 0.24, BLEND = 0.5; // с: оружие на точке (пока открываются створки), переход на траекторию
const AX = new THREE.Vector3(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), M4 = new THREE.Matrix4();
const smooth = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

// obj - модель самолёта (копия с частями створок), root - группа, в осях которой точки подвески; нет описания или частей - обычная модель без отсеков, возвращает null
export function makeBay(obj, meta, root = obj) {
  const B = meta && meta.bay; if (!B) return null;
  // группы створок: точка подвески открывает группу по своему x. Обычно две стороны (sides: L, R), у F-22A ещё боковые отсеки (groups)
  const G = (B.groups || [{ x0: -99, x1: 0, doors: B.sides.L }, { x0: 0, x1: 99, doors: B.sides.R }]).map((g) => {
    const doors = g.doors.map((n) => { const d = B.doors[n], part = obj.getObjectByName(n); return part ? { part, a: new THREE.Vector3(...d[1]).normalize(), rad: d[2] * Math.PI / 180 } : null; });
    return { x0: g.x0, x1: g.x1, doors, k: 0, t: 0, shown: -1 };
  });
  if (G.some((g) => g.doors.some((d) => !d))) return null;
  const queue = [], sideOf = (x) => G.find((g) => x >= g.x0 && x < g.x1) || G[0];
  // барабан (META.bay.drum: Ту-95МС, МКУ на шесть Х-55): часть part крутится вокруг оси axis через точку piv; после пуска - поворот на step°,
  // сход всегда из нижней позиции. Оружие в отсеке (меши точек) крутится вместе с барабаном (drumReg). Геометрия общая у копий модели -
  // поворот не сдвигом геометрии, а положением части: position = piv + q·(p0 − piv)
  const DD = B.drum, dpart = DD && obj.getObjectByName(DD.part), drum = dpart ? { part: dpart, P: new THREE.Vector3(...DD.piv), A: new THREE.Vector3(...DD.axis).normalize(),
    step: (DD.step || 60) * Math.PI / 180, ang: 0, tgt: 0, pend: [], p0: dpart.position.clone(), q0: dpart.quaternion.clone(), ms: [], shown: null } : null;
  const DQ = new THREE.Quaternion(), DV = new THREE.Vector3();
  const drumApply = () => {
    if (drum.shown === drum.ang) return; drum.shown = drum.ang; DQ.setFromAxisAngle(drum.A, drum.ang);
    drum.part.quaternion.copy(DQ).multiply(drum.q0); drum.part.position.copy(DV.copy(drum.p0).sub(drum.P).applyQuaternion(DQ).add(drum.P));
    for (const e of drum.ms) { e.m.position.copy(DV.copy(e.p).sub(drum.P).applyQuaternion(DQ).add(drum.P)); e.m.quaternion.copy(DQ).multiply(e.q); }
  };
  return {
    root,
    drum: !!drum,
    // меш оружия на барабане: его положение сейчас (без поворота) - исходное; дальше крутится вместе с барабаном
    drumReg(m) { if (!drum) return; drum.ms.push({ m, p: m.position.clone(), q: m.quaternion.clone() }); drum.shown = null; drumApply(); },
    drumClear() { if (drum) drum.ms.length = 0; },
    // какую точку пускать: из списка list (номера точек stations) - ту, что сейчас ниже всех; убирает её из списка
    drumPick(list, stations) {
      if (!drum || !list.length) return list.pop(); DQ.setFromAxisAngle(drum.A, drum.ang); let bi = list.length - 1, by = 1e9;
      list.forEach((st, i) => { const p = stations[st]; if (!p) return; const y = DV.set(p.x, p.y, p.z).sub(drum.P).applyQuaternion(DQ).y; if (y < by - 1e-3) { by = y; bi = i; } });
      return list.splice(bi, 1)[0];
    },
    // открыта ли сторона этой точки: 0 - закрыта, 1 - открыта
    open: (x) => sideOf(x).k,
    // пуск с точки p (местные оси самолёта): открыть эту сторону и запомнить точку для летящего оружия
    fired(p) { const s = sideOf(p.x); s.t = HOLD_OPEN; queue.push({ p: p.clone(), at: performance.now() }); while (queue.length > 8) queue.shift(); if (drum) drum.pend.push(0.85); }, // барабан - поворот, когда ракета ушла вниз
    // точка для только что появившегося оружия: самое раннее из ещё не взятых, свежее секунды (ложная цель - не оружие, её запись устаревает здесь)
    take() { const now = performance.now(); while (queue.length) { const q = queue.shift(); if (now - q.at < 1000) return q.p; } return null; },
    update(dt) {
      if (drum) {
        for (let i = drum.pend.length - 1; i >= 0; i--) if ((drum.pend[i] -= dt) <= 0) { drum.pend.splice(i, 1); drum.tgt += drum.step; }
        if (drum.ang !== drum.tgt) { const v = drum.step / 0.7 * dt; drum.ang = Math.abs(drum.tgt - drum.ang) <= v ? drum.tgt : drum.ang + Math.sign(drum.tgt - drum.ang) * v; }
        drumApply();
      }
      for (const s of G) {
        if (s.t > 0) { s.t -= dt; s.k = Math.min(1, s.k + dt / OPEN_T); } else if (s.k > 0) s.k = Math.max(0, s.k - dt / CLOSE_T);
        if (s.k === s.shown) continue; s.shown = s.k;
        const e = smooth(s.k); for (const d of s.doors) d.part.quaternion.setFromAxisAngle(AX.copy(d.a), d.rad * e);
      }
    },
  };
}

// летящее оружие из отсека: каждый кадр после постановки меша по w.pos. true - ещё на точке (мотор не показывать)
export function bayHold(w, g, dt) {
  if (w.bayDone) return false;
  if (w.bayP === undefined) { const b = w.owner && w.owner.bayVis; w.bayP = b ? b.take() : null; w.bayR = b ? b.root : null; w.bayT = 0; }
  if (!w.bayP || !w.bayR) { w.bayDone = true; return false; }
  w.bayT += dt;
  const x = (w.bayT - HOLD) / BLEND; if (x >= 1) { w.bayDone = true; w.bayP = w.bayR = null; return false; }
  w.bayR.updateWorldMatrix(true, false); M4.copy(w.bayR.matrixWorld); M4.decompose(V, Q, S);
  V.copy(w.bayP).applyMatrix4(M4);
  const s = smooth(x); g.position.lerpVectors(V, g.position, s); g.quaternion.copy(Q.slerp(g.quaternion, s));
  return x <= 0;
}
