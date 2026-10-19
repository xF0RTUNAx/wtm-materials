// Стенд лётной модели «Воздушного превосходства» (games/airdef/sim/flight.js): каждому самолёту подбирает сопротивление
// (cd0 и волновой рост aw) так, чтобы максимальная скорость у земли и на 11 км была SPEED_K (0,8) от реальной, пишет
// games/airdef/sim/flight-fit.js и снимает характеристики: максимальная скорость по высотам, разгон, установившийся и
// предельный вираж, скороподъёмность, сваливание. Отчёт — HTML с графиками (путь — аргумент, по умолчанию во временной папке).
//   deno run -A tools/airdef-headless/flight-stand.js [отчёт.html]
import { SPECS, SPEED_K, accel, nMax, vStall, sound, thrust } from '../../games/airdef/sim/flight.js';
const G = 9.81, KMH = 3.6;
const vmaxAt = (s, f, h, m = s.mNorm, ab = true) => { // наибольшая скорость горизонтального полёта: последний корень ускорения
  let best = 0; for (let v = 60; v < 1300; v += 2) if (accel(s, f, v, h, m, 1, 1, ab, 0) > 0) best = v;
  let lo = best, hi = best + 2; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (accel(s, f, mid, h, m, 1, 1, ab, 0) > 0) lo = mid; else hi = mid; }
  return lo;
};
// типичное вредное сопротивление по классу (чистый самолёт): истребители ~0,02, штурмовик — больше, тяжёлые — меньше
const CD0 = { e_su25: 0.03, e_b52: 0.017, e_b1b: 0.017, e_tu160: 0.016, e_tu22m3: 0.018, e_su24: 0.024, e_su17: 0.022, e_f4: 0.023,
  e_tu22m2: 0.018, e_a10: 0.032, e_f111: 0.022, e_tornado: 0.022, e_mig23: 0.022, e_mig27: 0.024, e_f15e: 0.021,
  e_mig21n: 0.021, e_mig25: 0.022, e_su7b: 0.022, e_tu16: 0.019, e_f100: 0.022, e_f117: 0.024, e_buccaneer: 0.022, e_harrier: 0.026, e_b2: 0.012,
  e_yak38: 0.026, e_il28: 0.022, e_tu22: 0.018, e_tu95: 0.02, e_hunter: 0.02, e_etendard: 0.022 };
function fit(s, k) {
  const tSL = SPEED_K * s.vSL / KMH, tAlt = SPEED_K * s.vAlt / KMH, hAlt = 11000;
  const f = { cd0: CD0[k] || 0.02, aw: 1.5, ex: 0.75, vq: 0 };
  for (let it = 0; it < 4; it++) {
    // у земли: без ограничения тяги хватает на большее — ставим предельный напор; не хватает — меньше cd0
    f.vq = 0; const free = vmaxAt(s, f, 0);
    if (free > tSL) { let lo = tSL / SPEED_K * 0.8, hi = tSL / SPEED_K * 1.2; for (let i = 0; i < 40; i++) { f.vq = (lo + hi) / 2; if (vmaxAt(s, f, 0) > tSL) hi = f.vq; else lo = f.vq; } f.vq = (lo + hi) / 2; }
    else { let lo = 0.005, hi = f.cd0; for (let i = 0; i < 40; i++) { f.cd0 = Math.sqrt(lo * hi); if (vmaxAt(s, f, 0) > tSL) lo = f.cd0; else hi = f.cd0; } f.cd0 = Math.sqrt(lo * hi); }
    // на 11 км: волновой рост aw; не хватает тяги и при aw = 0,15 — тяга медленнее падает с высотой (ex ниже)
    if (tAlt / SPEED_K / sound(hAlt) > 0.7) {
      f.ex = 0.75; let lo = 0, hi = 12; for (let i = 0; i < 40; i++) { f.aw = (lo + hi) / 2; if (vmaxAt(s, f, hAlt) > tAlt) lo = f.aw; else hi = f.aw; } f.aw = (lo + hi) / 2;
      if (f.aw < 0.15) { f.aw = 0.15; let a = 0.02, b2 = 0.75; for (let i = 0; i < 40; i++) { f.ex = (a + b2) / 2; if (vmaxAt(s, f, hAlt) > tAlt) a = f.ex; else b2 = f.ex; } f.ex = (a + b2) / 2; }
    }
  }
  return { cd0: +f.cd0.toFixed(5), aw: +f.aw.toFixed(3), ex: +f.ex.toFixed(3), vq: +f.vq.toFixed(1) };
}
// разгон у земли с форсажем (без — у кого его нет): с 400 км/ч·0,8 до 90 % максимума, с
function accelTime(s, f, h = 0) {
  const vmax = vmaxAt(s, f, h); let v = 400 * SPEED_K / KMH, t = 0; const dt = 0.05, ab = s.ab > 0;
  while (v < vmax * 0.9 && t < 600) { v += accel(s, f, v, h, s.mNorm, 1, 1, ab, 0) * dt; t += dt; }
  return t;
}
// установившийся вираж (тяга = сопротивлению при перегрузке n): лучшая угловая скорость по скоростям, °/с, и при какой скорости
function sustTurn(s, f, h) {
  let best = 0, bv = 0;
  for (let v = vStall(s, h, s.mNorm) * 1.05; v < vmaxAt(s, f, h); v += 3) {
    let lo = 1, hi = nMax(s, v, h, s.mNorm); if (accel(s, f, v, h, s.mNorm, hi, 1, s.ab > 0, 0) >= 0) lo = hi;
    else for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (accel(s, f, v, h, s.mNorm, mid, 1, s.ab > 0, 0) >= 0) lo = mid; else hi = mid; }
    const w = SPEED_K * G * Math.sqrt(Math.max(0, lo * lo - 1)) / v * 180 / Math.PI; if (w > best) { best = w; bv = v; }
  }
  return [best, bv];
}
function instTurn(s, h) { let best = 0, bv = 0; for (let v = 80; v < 700; v += 3) { const n = nMax(s, v, h, s.mNorm), w = SPEED_K * G * Math.sqrt(Math.max(0, n * n - 1)) / v * 180 / Math.PI; if (w > best) { best = w; bv = v; } } return [best, bv]; }
// скороподъёмность у земли: наибольшая по скоростям (избыток мощности / вес), м/с
function climb(s, f) { let best = 0; for (let v = 100; v < vmaxAt(s, f, 0); v += 5) best = Math.max(best, v * accel(s, f, v, 0, s.mNorm, 1, 1, s.ab > 0, 0) / G); return best; }

const FIT = {}, rows = [];
for (const [k, s] of Object.entries(SPECS)) {
  const f = FIT[k] = fit(s, k);
  const v0 = vmaxAt(s, f, 0), v5 = vmaxAt(s, f, 5000), v11 = vmaxAt(s, f, 11000), vMil = vmaxAt(s, f, 0, s.mNorm, false);
  const env = []; for (let h = 0; h <= 18000; h += 1000) env.push([h, vmaxAt(s, f, h) * KMH]);
  const acc = []; { let v = 400 * SPEED_K / KMH, t = 0; while (t <= 60) { acc.push([t, v * KMH]); for (let i = 0; i < 20; i++) v += accel(s, f, v, 0, s.mNorm, 1, 1, s.ab > 0, 0) * 0.05; t += 1; } }
  const [st, stv] = sustTurn(s, f, 3000), [it, itv] = instTurn(s, 3000);
  rows.push({ k, s, f, v0, v5, v11, vMil, t90: accelTime(s, f), st, stv, it, itv, climb: climb(s, f), vs: vStall(s, 0, s.mNorm), env, acc, tw: thrust(s, 0, 0, 1, s.ab > 0) / (s.mNorm * G) });
}
Deno.writeTextFileSync(new URL('../../games/airdef/sim/flight-fit.js', import.meta.url),
  `// Создано tools/airdef-headless/flight-stand.js — не править руками: подобранное сопротивление самолётов (скорости — ${SPEED_K} реальных)\nexport const FIT = ${JSON.stringify(FIT)};\n`);

// ── отчёт ──
const r0 = (x) => Math.round(x), r1 = (x) => x.toFixed(1);
const COL = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#808000', '#000075', '#e6beff', '#aaffc3', '#ffd8b1', '#800000', '#a9a9a9', '#fabebe', '#bcf60c', '#008080'];
function svgChart(series, xMax, yMax, xLab, yLab, xStep, yStep, w = 760, h = 360) {
  const L = 56, B = 34, X = (x) => L + x / xMax * (w - L - 10), Y = (y) => h - B - y / yMax * (h - B - 10);
  let g = '';
  for (let x = 0; x <= xMax; x += xStep) g += `<line x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(yMax)}" class="gr"/><text x="${X(x)}" y="${h - 14}" class="ax" text-anchor="middle">${x}</text>`;
  for (let y = 0; y <= yMax; y += yStep) g += `<line x1="${X(0)}" y1="${Y(y)}" x2="${X(xMax)}" y2="${Y(y)}" class="gr"/><text x="${L - 6}" y="${Y(y) + 4}" class="ax" text-anchor="end">${y}</text>`;
  const lines = series.map((s, i) => `<polyline fill="none" stroke="${COL[i % COL.length]}" stroke-width="2" points="${s.pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(Math.min(y, yMax)).toFixed(1)}`).join(' ')}"><title>Как летают самолёты</title></polyline>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="ch">${g}${lines}<text x="${L}" y="12" class="ax">${yLab}</text><text x="${w - 10}" y="${h - 2}" class="ax" text-anchor="end">${xLab}</text></svg>`;
}
const legend = rows.map((r, i) => `<span class="lg"><i style="background:${COL[i % COL.length]}"></i>${r.s.name}</span>`).join('');
const tbl = rows.map((r) => `<tr><td>${r.s.name}</td><td>${r.s.side === 'east' ? 'Восток' : 'Запад'}</td><td>${r0(r.s.vSL)} → <b>${r0(r.v0 * KMH)}</b></td><td>${r0(r.v5 * KMH)}</td><td>${r0(r.s.vAlt)} → <b>${r0(r.v11 * KMH)}</b></td><td>${r0(r.vMil * KMH)}</td><td>${r1(r.tw)}</td><td>${r0(r.t90)}</td><td>${r1(r.st)} <span class="d">(${r0(r.stv * KMH)})</span></td><td>${r1(r.it)} <span class="d">(${r0(r.itv * KMH)})</span></td><td>${r0(r.climb)}</td><td>${r0(r.vs * KMH)}</td><td>${r.s.g}</td><td>${r.s.roll}</td></tr>`).join('');
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Лётные характеристики</title>
<style>:root{--bg:#111418;--fg:#e8eaed;--mut:#9aa0a6;--ln:#2a2f36}@media (prefers-color-scheme:light){:root:not([data-theme=dark]){--bg:#fafafa;--fg:#1d1f22;--mut:#5f6368;--ln:#ddd}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px;max-width:1200px}h1{font-size:20px}h2{font-size:16px;margin-top:28px}
.wrap{overflow-x:auto}table{border-collapse:collapse;font-size:13px;white-space:nowrap}td,th{border-bottom:1px solid var(--ln);padding:5px 8px;text-align:right}td:first-child,th:first-child{text-align:left}th{color:var(--mut);font-weight:500;vertical-align:bottom;white-space:normal;max-width:110px}
.d{color:var(--mut)}.ch{width:100%;max-width:820px;height:auto}.gr{stroke:var(--ln);stroke-width:1}.ax{fill:var(--mut);font-size:11px}.lg{display:inline-block;margin:2px 10px 2px 0;font-size:12px}.lg i{display:inline-block;width:12px;height:3px;margin-right:5px;vertical-align:middle}p{color:var(--mut);max-width:820px}</style></head><body>
<h1>Как летают самолёты в «Воздушном превосходстве»</h1>
<p>В игре все скорости — 80 % от настоящих. Так бой не превращается в гонку, а разница между машинами остаётся. В столбцах скорости слева настоящая цифра, справа жирным — та, что будет в игре. Считали для обычного боевого веса и полного форсажа (у Су-25 и B-52 его нет, там максимальный режим двигателей). Виражи сняты на высоте 3 км. «Без потери скорости» — сколько градусов в секунду самолёт может крутить сколько угодно долго. «На пределе» — сколько он выжмет коротким рывком, теряя скорость. В скобках — скорость, на которой это получается лучше всего.</p>
<div class="wrap"><table><tr><th>Самолёт</th><th>Сторона</th><th>Макс. у земли, км/ч</th><th>на 5 км</th><th>на 11 км</th><th>у земли без форсажа</th><th>тяга / вес</th><th>разгон с 320 км/ч до 90 % макс., с</th><th>вираж без потери скорости, °/с</th><th>вираж на пределе, °/с</th><th>скороподъёмность, м/с</th><th>сваливание, км/ч</th><th>перегрузка</th><th>крен, °/с</th></tr>${tbl}</table></div>
<h2>Максимальная скорость по высоте (в игре), км/ч</h2>${svgChart(rows.map((r) => ({ name: r.s.name, pts: r.env.map(([h, v]) => [h / 1000, v]) })), 18, 2600, 'высота, км', 'км/ч', 2, 400)}<div>${legend}</div>
<h2>Разгон у земли с 320 км/ч, км/ч</h2>${svgChart(rows.map((r) => ({ name: r.s.name, pts: r.acc })), 60, 1400, 'секунды', 'км/ч', 10, 200)}<div>${legend}</div>
</body></html>`;
const out = Deno.args[0] || (await Deno.makeTempDir()) + '/flight.html';
Deno.writeTextFileSync(out, html);
for (const r of rows) console.log(r.k.padEnd(10), 'у земли', r0(r.v0 * KMH), 'на 11 км', r0(r.v11 * KMH), 'разгон', r0(r.t90), 'с', 'вираж', r1(r.st), '/', r1(r.it), '°/с', 'cd0', r.f.cd0, 'aw', r.f.aw, 'ex', r.f.ex, 'vq', r0(r.f.vq * KMH));
console.log('отчёт:', out);
