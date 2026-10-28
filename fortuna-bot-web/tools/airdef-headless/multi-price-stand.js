// Стенд цен «Мульти-волны» (2026-10-28, Mark: «цена = измеренная сила», один бюджет на все бои): без браузера, как combined-test.js,
// бой «волна против ПВО» на «Северном рубеже» по правилам онлайна (sim/combined.js LIM_ON, strike game 'multi', «Реализм»).
//   deno run -A tools/airdef-headless/multi-price-stand.js atk  [N=40] [J=4]   — сила каждой единицы удара
//   deno run -A tools/airdef-headless/multi-price-stand.js sam  [N=40] [J=4]   — сила каждого ЗРК
//   deno run -A tools/airdef-headless/multi-price-stand.js fair [N=40] [J=4]   — честность: восток против запада при равном бюджете
// N — боёв на точку (разное зерно), J — потоков. Итог — таблица в консоль и JSON в OUT (по умолчанию multi-price-<режим>.json рядом).
// Как меряем:
//  • удар: фон — типовая волна ИИ своей стороны (COMBINED[сторона][2…4]) против типовой ПВО противника того же уровня (DEFENSE, mission.js
//    placeDefense — как одиночная игра); к фону добавляем m единиц типа k (крылатые и дроны — 4–6, баллистика — 2, «исключительная» — 1
//    без другой баллистики); сила k = (ценность объектов, разрушенная волной с k − без k) / m, зерно боя одно и то же (расстановка целей
//    и ПВО совпадает). Наряд — как у ботов онлайна: ложные цели по ПВО, остальное — по трём целям по кругу;
//  • ЗРК: один комплекс (у трёх целей боя, дальний — кольцом у центра, как placeDefense) против типовых волн ИИ уровня 2…4 — сколько
//    единиц удара и носителей сбил и сколько ценности сберёг (разрушено без ПВО − с ним); второй замер — он же в половинной ПВО уровня.
const dir = new URL('.', import.meta.url).pathname;
const IS_WORKER = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
// модули игры — с тем же ?v=, что у sim/combined.js (иначе arsenal.js загрузился бы второй копией)
const V = Deno.readTextFileSync(dir + '../../games/airdef/sim/combined.js').match(/arsenal\.js(\?v=\w+)/)[1];
const G = (p) => import(`../../games/airdef/${p}${V}`);
const { buildWinter } = await G('map-winter.js');
const { createStrike, MODES } = await G('sim/strike.js');
const { createRaid } = await G('sim/raid.js');
const { placeDefense, pickTargets, spotNear } = await G('mission.js');
const { createCombined, LIM_ON } = await G('sim/combined.js');
const { setGround } = await import('../../games/drone/sim/core.js');
const { AG, SAM, COMBINED, DEFENSE, MULTI, SAM_COST, CARRIERS } = await G('arsenal.js');
const { damageValue } = await G('sim/online-multi.js');

const city = buildWinter(1); setGround(city.groundH);
const DT = 0.05, T_MAX = 900;
const OTHER = { east: 'west', west: 'east' };
const EXCL = ['kinzhal', 'iskander', 'arrw'];
const isTbm = (k) => AG[k].kind === 'tbm';
const ech = (k) => (AG[k].uav ? 1 : isTbm(k) ? 3 : 2);
const viaOf = (side, k) => (MULTI.items[side].find(([q]) => q === k) || [])[1] || undefined;
// сколько единиц добавлять при замере удара
export const addN = (k) => (EXCL.includes(k) ? 1 : isTbm(k) ? 2 : AG[k].uav ? 6 : 4);

function rng(seed) { let s = (seed * 2654435761) % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// состав [[ключ, n]] → comp для createCombined (с разведчиком) и наряд как у ботов онлайна (airdef-multi.js botAttack)
function wave(side, list, targets) {
  const comp = [[side === 'east' ? 'scout_e' : 'scout', 1, 1]], plan = {};
  let j = 0;
  for (const [k, n] of list) {
    if (!n) continue;
    comp.push([k, n, ech(k), viaOf(side, k)]);
    plan[k] = { pts: [], alt: null, t: null, sam: false, tgt: null, units: Array.from({ length: n }, () => (AG[k].decoyMun ? { sam: true } : { sam: false, tgt: targets[j++ % targets.length].id })) };
  }
  return { comp, plan };
}
// один комплекс — как placeDefense: дальний (≥ 15 км) — кольцом у центра, ПЗРК — на крыше у цели, остальные — у цели
function placeOne(S, rnd, key, tgt) {
  const Sx = SAM[key]; let xz;
  if (Sx.rmax >= 15000) { const a = rnd() * Math.PI * 2, r = 2500 + rnd() * 4000; xz = spotNear(city, rnd, 500 + Math.cos(a) * r, -300 + Math.sin(a) * r, 0, 900, false); }
  else if (Sx.type === 'ir' && Sx.hp <= 15) xz = spotNear(city, rnd, tgt.x, tgt.z, 250, 1600, true);
  else xz = spotNear(city, rnd, tgt.x, tgt.z, 250, 1400, false);
  return S.addUnit(key, xz[0], xz[1], { roof: xz[2], ambush: false, skill: 0.75, yaw: rnd() * 6.28 });
}

// бой. job: { att, list: [[ключ, n]], seed, def: { lvl, k } | null (без ПВО), sam: ключ | null (+ один комплекс), samN, real }
// Замер (real нет): объекты неразрушимы — иначе волна по трём целям упирается в их ценность (цели кончились — добавка «ничего не даёт»);
// попаданию засчитывается ценность объекта × доля его прочности, но не больше самого объекта (одна боевая часть — не больше одного объекта).
// real — как в игре (для проверки честности): объекты разрушаются, итог — damageValue
export function battle(job) {
  const rnd = rng(job.seed), att = job.att, def = OTHER[att];
  const st = { launched: {}, inter: {}, del: {} }, pend = [];
  const fx = {
    wpnRelease: (w) => { st.launched[w.key] = (st.launched[w.key] || 0) + 1; },
    objectHit: (o, amount) => { pend.push(o, amount); },
    wpnEnd: (w, r) => {
      if (r.intercepted) st.inter[w.key] = (st.inter[w.key] || 0) + 1;
      for (let i = 0; i < pend.length; i += 2) { const o = pend[i]; st.del[w.key] = (st.del[w.key] || 0) + o.value * Math.min(1, pend[i + 1] / o.hpMax); }
      pend.length = 0;
    },
  };
  let raid = null;
  const S = createStrike({ city, rnd, mode: () => MODES.real, game: 'multi', aircraft: () => raid.alive(), laserSpot: () => null, night: 0, fx, hurt: (a, d) => raid.hurt(a, d) });
  if (!job.real) for (const o of S.objects) { o.hp = 1e12; if (o.bld) for (const B of Object.values(o.bld)) B.hp = 1e12; }
  raid = createRaid(S, city, rnd, { side: att, era: 4, fx: {} });
  const targets = pickTargets(S, rnd, job.nt || 3);
  if (job.def) placeDefense(S, city, rnd, def, job.def.lvl, targets, job.def.k ?? 1);
  const extra = [];
  if (job.sam) for (let i = 0; i < (job.samN || 1); i++) extra.push(placeOne(S, rnd, job.sam, targets[i % targets.length]));
  // своя расстановка (проверка честности): [[ключ, n]] — как бот онлайна, целей атаки не знает: дальние — между центром и объектами,
  // остальные — у объектов по кругу (airdef-multi.js botDefense)
  if (job.defList) {
    const objs = S.objects.filter((o) => !o.noTarget); let g = Math.floor(rnd() * objs.length);
    for (const [key, n] of job.defList) for (let i = 0; i < n; i++) {
      const tgt = objs[g++ % objs.length], Sx = SAM[key], man = Sx.type === 'ir' && Sx.hp <= 15;
      const xz = Sx.rmax >= 15000 ? spotNear(city, rnd, tgt.x * 0.5, tgt.z * 0.5, 600, 2500, false) : spotNear(city, rnd, tgt.x, tgt.z, 250, man ? 1600 : 1400, man);
      S.addUnit(key, xz[0], xz[1], { roof: xz[2], ambush: false, skill: 0.75, yaw: rnd() * 6.28 });
    }
  }
  const { comp, plan } = wave(att, job.list, targets);
  const E = createCombined(S, city, rnd, { side: att, era: 4, raid, comp, plan, lim: LIM_ON });
  E.start(targets);
  let T = 0;
  while ((E.pending() || S.wpns.length) && T < T_MAX) { E.step(DT); raid.step(DT); S.step(DT); T += DT; }
  const carriers = E.carriers.map((a) => [a.load[0].key, a.dead ? 1 : 0, a.salvo.length]); // [ключ, сбит, не пущено]
  const del = Object.values(st.del).reduce((s, v) => s + v, 0);
  return { value: job.real ? damageValue(S.objects) : del, del: st.del, dead: S.objects.filter((o) => o.dead).length, T: Math.round(T), launched: st.launched, inter: st.inter, carriers,
    samLost: S.units.filter((u) => u.dead).length, samN: S.units.length, extraDead: extra.filter((u) => u.dead).length };
}

// ── параллельно: J потоков (Web Worker с тем же файлом)
if (IS_WORKER) {
  self.onmessage = (e) => { const out = e.data.map((j) => ({ id: j.id, r: battle(j) })); self.postMessage(out); };
}
// CACHE=файл.jsonl — каждый сыгранный бой дописывается туда; при повторном запуске (оборвался прогон) уже сыгранные не повторяются
const jobKey = (j) => JSON.stringify([j.att, j.list, j.seed, j.def || null, j.sam || null, j.samN || 0, !!j.real, j.nt || 3, j.defList || null]);
async function runAll(jobs, J) {
  const res = new Array(jobs.length), chunk = 6, CACHE = Deno.env.get('CACHE'), seen = new Map();
  if (CACHE) try { for (const line of Deno.readTextFileSync(CACHE).split('\n')) if (line) { const [k, r] = JSON.parse(line); seen.set(k, r); } } catch (_) { /* нет файла — с начала */ }
  jobs.forEach((j, i) => { j.id = i; const r = seen.get(jobKey(j)); if (r) res[i] = r; });
  const todo = jobs.filter((j) => !res[j.id]);
  if (seen.size) console.error(`  из кэша: ${jobs.length - todo.length}, осталось ${todo.length}`);
  let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(J, todo.length) }, () => new Promise((resolve) => {
    const w = new Worker(import.meta.url, { type: 'module' });
    const feed = () => { if (next >= todo.length) { w.terminate(); resolve(); return; } const part = todo.slice(next, next + chunk); next += chunk; w.postMessage(part); };
    w.onmessage = (e) => {
      for (const { id, r } of e.data) { res[id] = r; if (CACHE) Deno.writeTextFileSync(CACHE, JSON.stringify([jobKey(jobs[id]), r]) + '\n', { append: true }); }
      done += e.data.length; if (done % 60 < chunk) console.error(`  … ${done}/${todo.length}, ${Math.round((Date.now() - t0) / 1000)} с`); feed();
    };
    w.onerror = (e) => { console.error(e.message); resolve(); };
    feed();
  })));
  return res;
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
export { runAll, mean, sd, OTHER, EXCL, wave, rng };

if (!IS_WORKER && import.meta.main) {
  const mode = Deno.args[0] || 'atk';
  const arg = (n, d) => { const a = Deno.args.find((x) => x.startsWith(n + '=')); return a ? +a.split('=')[1] : d; };
  const N = arg('N', 40), J = arg('J', 4), LVLS = [2, 3, 4];
  const OUT = Deno.env.get('OUT') || `${dir}multi-price-${mode}.json`;
  if (mode === 'atk') {
    // фон: волна уровня; для баллистики — без своей баллистики
    const bg = (side, lvl, noTbm) => COMBINED[side][lvl].filter(([k]) => !AG[k].recon && !(noTbm && isTbm(k))).map(([k, n]) => [k, n]);
    const jobs = [];
    for (const att of ['east', 'west']) for (const lvl of LVLS) for (let s = 1; s <= N; s++) {
      const seed = s * 1000 + lvl * 10 + (att === 'east' ? 1 : 2);
      for (const noTbm of [false, true]) jobs.push({ att, seed, def: { lvl }, list: bg(att, lvl, noTbm), tag: { kind: 'base', att, lvl, s, noTbm } });
      for (const [k] of MULTI.items[att]) {
        const m = addN(k), base = bg(att, lvl, isTbm(k)), list = base.map((e) => e.slice()), e = list.find(([q]) => q === k);
        if (e) e[1] += m; else list.push([k, m]);
        jobs.push({ att, seed, def: { lvl }, list, tag: { kind: 'add', att, lvl, s, k, m, noTbm: isTbm(k) } });
      }
    }
    console.error(`удар: ${jobs.length} боёв, ${J} потоков`);
    const res = await runAll(jobs, J);
    const base = new Map(); jobs.forEach((j, i) => { if (j.tag.kind === 'base') base.set(`${j.att}|${j.tag.lvl}|${j.tag.s}|${j.tag.noTbm}`, res[i]); });
    const rows = [];
    for (const att of ['east', 'west']) for (const [k, via, step, line] of MULTI.items[att]) {
      const row = { att, k, via: via || null, step, line, m: addN(k), lvl: {} };
      for (const lvl of LVLS) {
        const d = [], dir = [], surv = [], car = [];
        jobs.forEach((j, i) => {
          if (j.tag.kind !== 'add' || j.tag.k !== k || j.att !== att || j.tag.lvl !== lvl) return;
          const b = base.get(`${att}|${lvl}|${j.tag.s}|${j.tag.noTbm}`), r = res[i];
          d.push((r.value - b.value) / j.tag.m);
          dir.push((r.del[k] || 0) / j.list.find(([q]) => q === k)[1]); // своё: что разрушили сами единицы k, на одну
          const L = r.launched[k] || 0, I = r.inter[k] || 0, Lb = b.launched[k] || 0, Ib = b.inter[k] || 0;
          surv.push(L - Lb > 0 ? 1 - (I - Ib) / (L - Lb) : 0);
          car.push(r.carriers.filter(([q, dead, left]) => q === k && dead).reduce((s, [, , left]) => s + left, 0) / j.tag.m); // не пущено с носителей, доля
        });
        row.lvl[lvl] = { v: mean(d), sd: sd(d), se: sd(d) / Math.sqrt(d.length), dir: mean(dir), dirSe: sd(dir) / Math.sqrt(dir.length), surv: mean(surv), lost: mean(car) };
      }
      row.v = mean(LVLS.map((l) => row.lvl[l].v)); row.dir = mean(LVLS.map((l) => row.lvl[l].dir));
      rows.push(row);
    }
    const bases = {}; for (const att of ['east', 'west']) for (const lvl of LVLS) { const a = [...base].filter(([key]) => key.startsWith(`${att}|${lvl}|`) && key.endsWith('false')).map(([, r]) => r.value); bases[`${att}${lvl}`] = { v: mean(a), sd: sd(a) }; }
    Deno.writeTextFileSync(OUT, JSON.stringify({ N, rows, bases }, null, 1));
    console.log('фон (волна ИИ против ПВО того же уровня), ценность разрушенного:', Object.entries(bases).map(([k, b]) => `${k} ${b.v.toFixed(0)}±${b.sd.toFixed(0)}`).join(' · '));
    console.log('сторона  ключ        +m   прибавка волны: ур.2 / 3 / 4      среднее | своё: ур.2 / 3 / 4   среднее | дошло %   не пущено');
    for (const r of rows) console.log(`${r.att.padEnd(6)} ${r.k.padEnd(10)} ${String(r.m).padStart(3)} ${LVLS.map((l) => `${r.lvl[l].v.toFixed(1).padStart(6)}±${r.lvl[l].se.toFixed(1).padEnd(4)}`).join(' ')}  ${r.v.toFixed(1).padStart(6)} | ${LVLS.map((l) => r.lvl[l].dir.toFixed(1).padStart(5)).join(' ')}  ${r.dir.toFixed(1).padStart(6)} | ${LVLS.map((l) => Math.round(r.lvl[l].surv * 100)).join('/')}   ${LVLS.map((l) => r.lvl[l].lost.toFixed(2)).join('/')}`);
  }
  if (mode === 'sam') {
    const jobs = [];
    for (const def of ['east', 'west']) {
      const att = OTHER[def], sams = Object.keys(SAM).filter((k) => SAM[k].side === def && SAM_COST[k]);
      for (const lvl of LVLS) for (let s = 1; s <= N; s++) {
        const seed = s * 1000 + lvl * 10 + (def === 'east' ? 3 : 4), list = COMBINED[att][lvl].filter(([k]) => !AG[k].recon).map(([k, n]) => [k, n]);
        jobs.push({ att, seed, def: null, list, tag: { kind: 'none', def, lvl, s } });
        jobs.push({ att, seed, def: { lvl, k: 0.5 }, list, tag: { kind: 'half', def, lvl, s } });
        for (const k of sams) {
          jobs.push({ att, seed, def: null, sam: k, list, tag: { kind: 'solo', def, lvl, s, k } });
          jobs.push({ att, seed, def: { lvl, k: 0.5 }, sam: k, list, tag: { kind: 'add', def, lvl, s, k } });
        }
      }
    }
    console.error(`ПВО: ${jobs.length} боёв, ${J} потоков`);
    const res = await runAll(jobs, J);
    const key = (t, kind) => `${kind}|${t.def}|${t.lvl}|${t.s}`, ref = new Map();
    jobs.forEach((j, i) => { if (j.tag.kind === 'none' || j.tag.kind === 'half') ref.set(key(j.tag, j.tag.kind), res[i]); });
    const rows = [];
    for (const def of ['east', 'west']) for (const k of Object.keys(SAM).filter((q) => SAM[q].side === def && SAM_COST[q])) {
      const row = { def, k, cost: SAM_COST[k], era: SAM[k].era, lvl: {} };
      for (const lvl of LVLS) {
        const kill = [], car = [], save = [], add = [], lost = [];
        jobs.forEach((j, i) => {
          if (j.tag.k !== k || j.tag.lvl !== lvl || j.tag.def !== def) return;
          const r = res[i];
          if (j.tag.kind === 'solo') {
            const b = ref.get(key(j.tag, 'none'));
            kill.push(Object.entries(r.inter).reduce((s, [q, n]) => s + (AG[q].recon ? 0 : n), 0));
            car.push(r.carriers.filter(([, dead]) => dead).length);
            save.push(b.value - r.value); lost.push(r.extraDead);
          } else add.push(ref.get(key(j.tag, 'half')).value - r.value);
        });
        row.lvl[lvl] = { kill: mean(kill), car: mean(car), save: mean(save), saveSe: sd(save) / Math.sqrt(save.length), add: mean(add), addSe: sd(add) / Math.sqrt(add.length), lost: mean(lost) };
      }
      row.save = mean(LVLS.map((l) => row.lvl[l].save)); row.add = mean(LVLS.map((l) => row.lvl[l].add));
      rows.push(row);
    }
    const refs = {}; for (const def of ['east', 'west']) for (const lvl of LVLS) for (const kind of ['none', 'half']) { const a = [...ref].filter(([q]) => q.startsWith(`${kind}|${def}|${lvl}|`)).map(([, r]) => r.value); refs[`${kind}-${def}${lvl}`] = { v: mean(a), sd: sd(a) }; }
    Deno.writeTextFileSync(OUT, JSON.stringify({ N, rows, refs }, null, 1));
    console.log('без ПВО / половина ПВО уровня:', Object.entries(refs).map(([k, b]) => `${k} ${b.v.toFixed(0)}`).join(' · '));
    console.log('ПВО    ключ       цена  сбил(2/3/4)       носит.   сберёг один (2/3/4)        в половине ПВО (2/3/4)      погиб');
    for (const r of rows) console.log(`${r.def.padEnd(5)} ${r.k.padEnd(9)} ${String(r.cost).padStart(4)}  ${LVLS.map((l) => r.lvl[l].kill.toFixed(1).padStart(4)).join(' ')}   ${LVLS.map((l) => r.lvl[l].car.toFixed(1)).join('/')}  ${LVLS.map((l) => `${r.lvl[l].save.toFixed(0).padStart(4)}±${r.lvl[l].saveSe.toFixed(0).padEnd(3)}`).join(' ')}  ${LVLS.map((l) => `${r.lvl[l].add.toFixed(0).padStart(4)}±${r.lvl[l].addSe.toFixed(0).padEnd(3)}`).join(' ')}  ${LVLS.map((l) => r.lvl[l].lost.toFixed(2)).join('/')}`);
  }
  // ── честность при равном бюджете: случайные «игроцкие» волны и расстановки по ценам из PRICES (JSON: budget, atk, cap, samBudget, sam, samCap),
  // восток бьёт по ПВО запада и наоборот, у каждого боя свои случайные составы. mono — вся волна из одного типа (сколько пустит потолок)
  if (mode === 'fair' || mode === 'mono') {
    const P = JSON.parse(Deno.readTextFileSync(Deno.env.get('PRICES') || dir + 'multi-prices.json'));
    const tbmOk = (n, k) => { if (!isTbm(k)) return true; const t = Object.entries(n).reduce((s, [q, c]) => s + (isTbm(q) ? c : 0), 0); if (EXCL.includes(k)) return t === 0; return t < 2 && !EXCL.some((q) => n[q]); };
    const fill = (keys, price, cap, budget, rnd, okX = () => true, burstN = () => 3) => {
      const n = {}; let left = budget;
      const ok = (k) => price[k] != null && price[k] <= left && (n[k] || 0) < (cap[k] ?? 99) && okX(n, k);
      for (let g = 0; g < 400; g++) {
        const c = keys.filter(ok); if (!c.length) break;
        const k = c[Math.floor(rnd() * c.length)], b = 1 + Math.floor(rnd() * burstN(k));
        for (let i = 0; i < b && ok(k); i++) { n[k] = (n[k] || 0) + 1; left -= price[k]; }
      }
      return Object.entries(n);
    };
    const waveOf = (side, rnd) => fill(MULTI.items[side].map(([k]) => k), P.atk, P.cap || {}, P.budget, rnd, tbmOk);
    const defOf = (side, rnd) => fill(Object.keys(SAM).filter((k) => SAM[k].side === side && P.sam[k] != null), P.sam, P.samCap || {}, P.samBudget, rnd, () => true, (k) => (SAM[k].type === 'ir' && SAM[k].hp <= 15 ? 4 : 2));
    const cost = (list, price) => list.reduce((s, [k, n]) => s + price[k] * n, 0);
    const jobs = [];
    if (mode === 'fair') {
      for (let s = 1; s <= N; s++) for (const att of ['east', 'west']) for (const real of [false, true]) {
        const rw = rng(s * 31 + 7), rd = rng(s * 57 + 3); // зерно состава — общее для обеих сторон боя s
        jobs.push({ att, seed: s * 1000 + 5, list: waveOf(att, rw), defList: defOf(OTHER[att], rd), real, nt: real ? 3 : 3, tag: { s, real } });
      }
    } else {
      for (const att of ['east', 'west']) for (const [k] of MULTI.items[att]) {
        const n = {}; while (P.atk[k] <= P.budget - cost(Object.entries(n), P.atk) && (n[k] || 0) < (P.cap?.[k] ?? 99) && tbmOk(n, k)) n[k] = (n[k] || 0) + 1;
        for (let s = 1; s <= N; s++) jobs.push({ att, seed: s * 1000 + 6, list: Object.entries(n), defList: defOf(OTHER[att], rng(s * 57 + 3)), tag: { s, k, n: n[k] } });
      }
      for (let s = 1; s <= N; s++) for (const att of ['east', 'west']) jobs.push({ att, seed: s * 1000 + 6, list: waveOf(att, rng(s * 31 + 7)), defList: defOf(OTHER[att], rng(s * 57 + 3)), tag: { s, k: 'mix' } });
    }
    console.error(`${mode}: ${jobs.length} боёв, ${J} потоков`);
    const res = await runAll(jobs, J);
    const pick = (f) => jobs.map((j, i) => [j, res[i]]).filter(([j]) => f(j));
    if (mode === 'fair') {
      const out = {};
      for (const real of [false, true]) for (const att of ['east', 'west']) {
        const a = pick((j) => j.att === att && j.tag.real === real).map(([, r]) => r.value);
        out[`${att}${real ? '-real' : ''}`] = { v: mean(a), se: sd(a) / Math.sqrt(a.length) };
      }
      const ex = pick((j) => !j.tag.real && j.tag.s <= 3).map(([j, r]) => `${j.att}: ${j.list.map(([k, n]) => `${k}×${n}`).join(' ')} (${cost(j.list, P.atk)}) против ${j.defList.map(([k, n]) => `${k}×${n}`).join(' ')} (${cost(j.defList, P.sam)}) → ${Math.round(r.value)}`);
      Deno.writeTextFileSync(OUT, JSON.stringify({ N, out }, null, 1));
      console.log(ex.join('\n'));
      console.log(`волна востока по ПВО запада: удар ${out.east.v.toFixed(0)}±${out.east.se.toFixed(0)}, разрушено ${out['east-real'].v.toFixed(0)}±${out['east-real'].se.toFixed(0)}`);
      console.log(`волна запада по ПВО востока: удар ${out.west.v.toFixed(0)}±${out.west.se.toFixed(0)}, разрушено ${out['west-real'].v.toFixed(0)}±${out['west-real'].se.toFixed(0)}`);
      console.log(`запад / восток: удар ×${(out.west.v / out.east.v).toFixed(2)}, разрушено ×${(out['west-real'].v / out['east-real'].v).toFixed(2)}`);
    } else {
      const mix = {}; for (const att of ['east', 'west']) mix[att] = mean(pick((j) => j.att === att && j.tag.k === 'mix').map(([, r]) => r.value));
      console.log(`смешанная волна (случайная): восток ${mix.east.toFixed(0)}, запад ${mix.west.toFixed(0)}`);
      for (const att of ['east', 'west']) for (const [k] of MULTI.items[att]) {
        const p = pick((j) => j.att === att && j.tag.k === k), a = p.map(([, r]) => r.value);
        console.log(`${att.padEnd(5)} ${k.padEnd(9)} ×${String(p[0][0].tag.n).padEnd(3)} ${mean(a).toFixed(0).padStart(5)}±${(sd(a) / Math.sqrt(a.length)).toFixed(0).padEnd(3)} ×${(mean(a) / mix[att]).toFixed(2)} от смешанной`);
      }
    }
  }
}
