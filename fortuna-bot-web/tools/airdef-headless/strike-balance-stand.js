// Стенд баланса удара по объектам (Mark 2026-10-29: «баланс между каждой бомбой и ракетой … у каждой бомбы — эквивалент, смысл качать дальше;
// объекты не разрушаются слишком быстро и не слишком долго»; этап 2 — 2026-11-01). Без браузера, урон — настоящий sim/strike.js blast
// (эквивалент оружия arsenal.js eqOf, прочность объектов city.js OBJ_HP), объекты — три карты (22 цели).
//   deno run -A tools/airdef-headless/strike-balance-stand.js check               — быстрая проверка баланса (набор тестов): «ИТОГ: ошибок нет»
//   deno run -A tools/airdef-headless/strike-balance-stand.js table [T=200]     — оружие × объект: попаданий до гибели точно и разлётом, «по делу»
//   deno run -A tools/airdef-headless/strike-balance-stand.js loads [TL=150]    — готовые подвески: подвесок на задание «Вылета» (3 цели и по силе подвески)
//   deno run -A tools/airdef-headless/strike-balance-stand.js raid  [N=6] [J=4] — налёты ИИ без ПВО («Оборона»): промахи оружия (КВО), заход
//   deno run -A tools/airdef-headless/strike-balance-stand.js raiddef [N=6]     — те же налёты против типовой ПВО: потери целей по волнам
//   deno run -A tools/airdef-headless/strike-balance-stand.js multi [NM=6]      — типовая «Мульти-волна» ИИ по 3 целям, с ПВО и без
//   deno run -A tools/airdef-headless/strike-balance-stand.js all T=200 N=4 NM=8 — всё (≈ 12 мин на 4 ядрах) → strike-balance.json, раздел now
// KEY=before — записать в другой раздел json (замер старой версии игры для сравнения «было → стало»). Страница — strike-balance-page.js.
// Как меряем (table):
//  • точно — каждое попадание в главную точку прицела (city.js objAimXZ(o, −1)), разрыв на крыше; разбита главная — в следующую живую постройку;
//  • разлёт — T боёв (зерно одно): попадание i — в i-ю постройку по очереди (objAimXZ(o, i, u, v): крупные чаще, место на крыше случайное,
//    как ИИ налётов и «Мульти-волна»), к ней — промах оружия (КВО — по виду: свободнопадающие — из замера raid, НАР — разброс залпа с 1,5 км,
//    баллистика — своё КВО из arsenal.js, управляемые — 2 м, спутниковые — 5 м); среднее число попаданий и доля разрывов без урона;
//  • «по делу» — средний урон разрыва с промахом по неразрушимой копии объекта, доля от прямого попадания (эквивалента);
//  • до 120 попаданий — дальше «бесполезно» (>120).
const dir = new URL('.', import.meta.url).pathname;
const IS_WORKER = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
// модули игры — с тем же ?v=, что у sim/strike.js (одна копия arsenal.js на стенд и бой)
const VQ = Deno.readTextFileSync(dir + '../../games/airdef/sim/strike.js').match(/arsenal\.js(\?v=\w+)/)[1];
const G = (p) => import(`../../games/airdef/${p}${VQ}`);
const { buildCity, objAimXZ, objDist, SITES, YARD_K } = await G('city.js');
const { buildWinter } = await G('map-winter.js');
const { buildAutumn } = await G('map-autumn.js');
const { createStrike, MODES, guidedOf } = await G('sim/strike.js');
const { createRaid, RAID_LOADS, RAID_HELI } = await G('sim/raid.js');
const { AG, LOADOUTS, MULTI, THREAT, COMBINED, DEFENSE, eqOf, loadoutTargets, loadoutRole, loadoutEq } = await G('arsenal.js');
const { placeDefense, pickTargets } = await G('mission.js');
const { createCombined, LIM_ON } = await G('sim/combined.js');
const { damageValue } = await G('sim/online-multi.js');

const ARGS = Object.fromEntries(Deno.args.filter((a) => a.includes('=')).map((a) => a.split('=')));
const CMD = Deno.args.find((a) => !a.includes('=')) || 'table';
const KEY = Deno.env.get('KEY') || 'now';
function rng(seed) { let s = (seed * 2654435761) % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const fxNone = new Proxy({}, { get: () => () => {} });

// ── карты и объекты
const MAPS = [['city', 'Речной узел', buildCity(1)], ['winter', 'Зимняя долина', buildWinter(1)], ['autumn', 'Туманная топь', buildAutumn(1)]];
const OBJS = MAPS.flatMap(([mk, mname, city]) => city.objects.filter((o) => !o.noTarget).map((o) => ({ map: mk, mname, city, id: o.id, key: o.key, name: o.name, value: o.value, hp: o.hp })));

// ── оружие по объектам: всё ударное с боевой частью (ПРР — только по излучающим РЛС, по объектам не идут)
const KINDS = ['bomb', 'lgb', 'tvb', 'agm', 'gps', 'rocket', 'cruise', 'tbm'];
const WPN = Object.entries(AG).filter(([k, W]) => KINDS.includes(W.kind) && W.dmg > 0 && !W.decoyMun && !W.recon).map(([k]) => k);
// НАР с самолёта — свой урон (усиление — только вертолётам): отдельной строкой
const PLANE_NAR = WPN.filter((k) => AG[k].planeDmg).map((k) => k + '@plane');
const WLIST = [...WPN, ...PLANE_NAR];
const wOf = (k) => { const [key, at] = k.split('@'), W = AG[key]; return at === 'plane' ? { ...W, dmg: W.planeDmg, blast: W.planeBlast || W.blast, eq: W.planeEq ?? eqOf(W), short: W.short + ' (самолёт)' } : W; };
// промах (КВО, м) по виду наведения; свободнопадающие — из замера raid (strike-balance.json), пока его нет — 25 м
let CEP_BOMB = 25;
try { const J0 = JSON.parse(Deno.readTextFileSync(dir + 'strike-balance.json')); CEP_BOMB = (J0.now && J0.now.raid ? J0.now.raid.cep.bomb : J0.before && J0.before.raid ? J0.before.raid.cep.bomb : 0) || CEP_BOMB; } catch (_) { /* первый прогон */ }
function missOf(W, rnd) { // → [dx, dz]
  if (W.kind === 'rocket') { const D = 1500, s = W.disp * D; return [(rnd() - 0.5) * 2 * s, (rnd() - 0.5) * 2 * s]; } // залп с 1,5 км: равномерно ±disp по осям
  const cep = W.kind === 'tbm' ? W.cep : W.kind === 'bomb' ? CEP_BOMB : W.kind === 'gps' ? 5 : 2;
  const a = rnd() * 6.283, r = cep * Math.sqrt(-Math.log2(Math.max(1e-9, rnd()))); // медиана промаха = КВО (как sim/strike.js spawnMun у баллистики)
  return [Math.cos(a) * r, Math.sin(a) * r];
}

// ── один «бой»: свежие объекты карты (как createStrike: hpMax, постройки)
const freshStrike = (city) => createStrike({ city, rnd: rng(1), mode: () => MODES.real, aircraft: () => [], laserSpot: () => null, night: 0, hurt() {}, fx: fxNone });
const P = new THREE.Vector3();
function burst(S, city, x, z, W) {
  P.set(x, Math.max(city.topAt(x, z), -4) + 0.5, z);
  return S.blast(P, W.dmg, W.blast, W.short, null, W.ap || 1, eqOf(W), guidedOf(W));
}
// попаданий до гибели объекта: точно (rnd = null) или разлётом; → { n, zero (разрывов без урона) }
const CAP = 120;
function hitsToKill(ob, W, rnd) {
  const S = freshStrike(ob.city), o = S.objects.find((q) => q.id === ob.id), city = ob.city;
  let zero = 0;
  for (let i = 0; i < CAP; i++) {
    const a = rnd ? objAimXZ(o, i, rnd() - 0.5, rnd() - 0.5) : objAimXZ(o, -1);
    let x = a.x, z = a.z; if (rnd) { const [dx, dz] = missOf(W, rnd); x += dx; z += dz; }
    const hp0 = o.hp; burst(S, city, x, z, W); if (o.hp === hp0 && !o.dead) zero++;
    if (o.dead) return { n: i + 1, zero };
  }
  return { n: CAP + 1, zero };
}
function table(T) {
  const rows = {};
  for (const k of WLIST) {
    const W = wOf(k), r = rows[k] = { key: k, short: W.short, kind: W.kind, eq: eqOf(W), guided: guidedOf(W), blast: W.blast, era: W.era, side: W.side, obj: {} };
    for (const ob of OBJS) {
      const exact = hitsToKill(ob, W, null);
      const rnd = rng(1000 + ob.id * 7 + ob.map.length), sc = [];
      let zero = 0, shots = 0;
      for (let t = 0; t < T; t++) { const q = hitsToKill(ob, W, rnd); sc.push(q.n); zero += q.zero; shots += Math.min(q.n, CAP); }
      sc.sort((a, b) => a - b);
      // «по делу»: средний урон одного разрыва с промахом по неразрушимой копии объекта — доля от прямого попадания (эквивалента)
      const S2 = freshStrike(ob.city), o2 = S2.objects.find((q) => q.id === ob.id), NE = 120;
      o2.hp = 1e12; if (o2.bld) for (const B of Object.values(o2.bld)) B.hp = 1e12;
      for (let i = 0; i < NE; i++) { const a = objAimXZ(o2, i, rnd() - 0.5, rnd() - 0.5), [dx, dz] = missOf(W, rnd); burst(S2, ob.city, a.x + dx, a.z + dz, W); }
      r.obj[ob.map + ':' + ob.key] = { exact: exact.n, mean: +(sc.reduce((s, v) => s + v, 0) / T).toFixed(2), p10: sc[Math.floor(T * 0.1)], p90: sc[Math.floor(T * 0.9)], zero: +(zero / shots).toFixed(3),
        eff: +(o2.dmgTaken / NE / eqOf(W)).toFixed(3) };
    }
    r.eff = med(Object.values(r.obj).map((c) => c.eff));
  }
  return rows;
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
function printTable(rows) {
  const keys = OBJS.map((o) => o.map + ':' + o.key);
  console.log('\nОружие (эквивалент / радиус) — попаданий до гибели: точно (мин–медиана–макс по 22 объектам) · разлёт (медиана средних) · без урона, %');
  for (const r of Object.values(rows)) {
    const ex = keys.map((k) => r.obj[k].exact), sc = keys.map((k) => r.obj[k].mean), z = keys.map((k) => r.obj[k].zero);
    const one = ex.filter((n) => n === 1).length, bad = sc.filter((n) => n > 30).length;
    console.log(`${(r.short + ` ${r.eq}/${r.blast}`).padEnd(30)} точно ${String(Math.min(...ex)).padStart(3)}–${String(med(ex)).padStart(3)}–${String(Math.max(...ex)).padStart(3)} · разлёт ${med(sc).toFixed(1).padStart(5)} · без урона ${(100 * med(z)).toFixed(0).padStart(3)} %${one ? ` · с одного: ${one}` : ''}${bad ? ` · >30 попаданий: ${bad}` : ''}`);
  }
}

// ═════════════ loads: готовые подвески — сколько подвесок на задание «Вылета» ═════════════
// 3 случайные цели одной карты; оружие подвески — по очереди, сильное раньше, каждое — в живую цель (разлёт как в table); ПРР, помехи и
// ложные цели по объектам не идут. Пишем, после скольких подвесок погибла 1-я, 2-я, 3-я цель: loads — на 3 цели, mission — на задание
// по силе подвески (arsenal.js loadoutTargets: 1–3). «Реализм» даёт 2 подвески (своя + пополнение), «Аркада» — 3.
const LCAP = 8;
function loadsFor(L, T) {
  const items = L.items.filter(([k]) => KINDS.includes(AG[k].kind) && AG[k].dmg > 0).map(([k, n]) => {
    const key = AG[k].kind === 'rocket' && !L.heli ? k + '@plane' : k;
    return { key, W: wOf(key), n: AG[k].kind === 'rocket' ? n * AG[k].load : n };
  }).sort((a, b) => eqOf(b.W) - eqOf(a.W));
  if (!items.length) return null;
  const rnd = rng(77), per = items.reduce((s, it) => s + it.n, 0), nT = L.plane || L.heli ? loadoutTargets(L) : 3;
  let sumFirst = 0, eu = 0; const kill = [[], [], []];
  for (let t = 0; t < T; t++) {
    const [, , city] = MAPS[t % 3], pool = OBJS.filter((o) => o.city === city), pick = [];
    while (pick.length < 3) { const o = pool[Math.floor(rnd() * pool.length)]; if (!pick.includes(o)) pick.push(o); }
    const S = freshStrike(city), tg = pick.map((ob) => S.objects.find((q) => q.id === ob.id)), shot = tg.map(() => 0), at = [];
    let done = false;
    for (let k = 0; k < LCAP && !done; k++) {
      let used = 0;
      for (const it of items) for (let s = 0; s < it.n && !done; s++) {
        const i = tg.findIndex((o) => !o.dead); if (i < 0) { done = true; break; }
        const o = tg[i], a = objAimXZ(o, shot[i]++, rnd() - 0.5, rnd() - 0.5), [dx, dz] = missOf(it.W, rnd);
        burst(S, city, a.x + dx, a.z + dz, it.W); used++;
        if (o.dead) at.push(k + used / per);
        if (tg.every((q) => q.dead)) done = true;
      }
      if (k === 0) sumFirst += tg.filter((o) => o.dead).length + tg.filter((o) => !o.dead).reduce((s, o) => s + Math.max(0, 1 - o.hp / o.hpMax), 0); // целей за подвеску (с долей недобитой)
    }
    for (let n = 0; n < 3; n++) kill[n].push(at[n] ?? LCAP);
  }
  for (const it of items) eu += it.n * eqOf(it.W);
  const mean = (a) => +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2);
  return { loads: mean(kill[2]), mission: mean(kill[nT - 1]), nT, first: +(sumFirst / T).toFixed(2), eu: Math.round(eu) };
}
function loads(T) {
  const out = [];
  for (const e of [1, 2, 3, 4]) LOADOUTS[e].forEach((L, i) => { const r = loadsFor(L, T); if (r) out.push({ era: e, i, side: L.side, plane: L.plane, heli: !!L.heli, sead: loadoutRole(L) === 'sead', name: L.name, ...r }); });
  // налёт ИИ («Оборона»): подвеска бомбардировщика / ТВ / штурмовика на малой высоте — целей на самолёт
  for (const side of ['east', 'west']) for (const e of [1, 2, 3, 4]) for (const [role, items] of Object.entries(RAID_LOADS[side][e])) {
    if (!['bomber', 'tv', 'low', 'cruise'].includes(role)) continue;
    const r = loadsFor({ items, side }, T); if (r) out.push({ era: e, raid: role, side, name: `налёт ${side === 'east' ? 'Восток' : 'Запад'} ${e}: ${role}`, ...r });
  }
  return out;
}
function printLoads(rows) {
  console.log('\nГотовые подвески: ЕУ подвески · целей за подвеску (разлёт) · подвесок на 3 цели · целей задания и подвесок на него (Реализм — 2, Аркада — 3)');
  const f = (v) => (v >= LCAP ? '>' + LCAP : v.toFixed(2));
  for (const r of rows) console.log(`  ${(r.raid ? '' : 'ранг ' + r.era + ' ') + r.name}`.slice(0, 64).padEnd(66) + `${String(r.eu).padStart(5)} · ${r.first.toFixed(2).padStart(5)} · ${f(r.loads).padStart(5)} · ${r.raid ? '' : r.nT + ': ' + f(r.mission)}`);
}

// ═════════════ raid: налёты ИИ без ПВО (режим «Оборона») ═════════════
// Волны как defense.js (WAVE_N 3, 4, 6, 7, 9, 11; цели — 2 в волнах 1–3, потом 3; урон копится), сторона и эпоха атакующих 1–4, на трёх картах.
// Пишем: промах каждого разрыва ударного оружия до ближайшей постройки цели (objDist; 0 — по постройке), время от начала волны до гибели
// каждой цели, сколько целей и ценности уничтожено к концу волны.
const WAVE_N = [3, 4, 6, 7, 9, 11], DT = 0.05;
export function raidBattle(job) {
  const [, , city] = MAPS.find(([mk]) => mk === job.map), rnd = rng(job.seed);
  const st = { miss: {}, kills: [], waves: [], rel: {} };
  let raid = null, tW = 0, T = 0;
  const fx = {
    // точка прицеливания — как raid.js aimPointOf (своя постройка и место на крыше у каждого самолёта), на момент сброса; по уже уничтоженной цели — не считаем
    wpnRelease: (w) => { const a = w.owner; if (!a || !a.tgt || a.tgt.dead || w.W.kind === 'arm' || !w.W.dmg) return; w._aim = objAimXZ(a.tgt, a.id, ((a.id * 0.37) % 1) - 0.5, ((a.id * 0.71) % 1) - 0.5, { x: 0, z: 0 });
      (st.rel[a.id] = st.rel[a.id] || []).push(Math.round((T - tW) * 10) / 10); },
    wpnEnd: (w) => { if (!w._aim) return; const o = w.owner.tgt; (st.miss[w.key] = st.miss[w.key] || []).push([Math.round(Math.hypot(w.pos.x - w._aim.x, w.pos.z - w._aim.z) * 10) / 10, Math.round(objDist(o, w.pos.x, w.pos.z) * 10) / 10]); },
    objectDestroyed: (o) => st.kills.push([o.key, Math.round(T - tW)]),
  };
  const S = createStrike({ city, rnd, mode: () => MODES.real, aircraft: () => raid.alive(), laserSpot: (a) => (raid ? raid.laserSpot(a) : null), night: 0, fx, hurt: (a, d) => raid.hurt(a, d) });
  raid = createRaid(S, city, rnd, { side: job.side, era: job.era, fx: {}, helis: false });
  const all = S.objects.filter((o) => !o.noTarget);
  // типовая ПВО обороняющейся стороны той же эпохи (DEFENSE, mission.js placeDefense) — у всех объектов карты по кругу (цели волн игрок заранее не знает)
  if (job.def) placeDefense(S, city, rnd, job.side === 'east' ? 'west' : 'east', job.era, all, 1, { same: true });
  for (let wave = 1; wave <= WAVE_N.length; wave++) {
    const alive = all.filter((o) => !o.dead); if (!alive.length) break;
    const pick = []; const n = Math.min(wave > 3 ? 3 : 2, alive.length); while (pick.length < n) { const o = alive[Math.floor(rnd() * alive.length)]; if (!pick.includes(o)) pick.push(o); }
    tW = T; st.kills.length = 0;
    const v0 = pick.reduce((s, o) => s + o.value * Math.max(0, o.hp / o.hpMax), 0);
    raid.spawnWave(WAVE_N[wave - 1], wave, pick);
    let t = 0;
    const busy = () => raid.planes.some((a) => !a.dead && !a.out) || S.wpns.some((w) => !w.dead);
    while (busy() && t < 600) { raid.step(DT); S.step(DT); t += DT; T += DT; }
    const v1 = pick.reduce((s, o) => s + o.value * Math.max(0, o.dead ? 0 : o.hp / o.hpMax), 0);
    st.waves.push({ wave, n: WAVE_N[wave - 1], tgt: pick.map((o) => o.key), dead: pick.filter((o) => o.dead).length, lost: +(1 - v1 / v0).toFixed(3), kills: st.kills.slice(), T: Math.round(t) });
  }
  return st;
}

// ═════════════ multi: типовая «Мульти-волна» ИИ против типовой ПВО (зимняя карта, как стенд цен) ═════════════
// Волна — COMBINED[сторона][уровень 2…4] (что пускает ИИ и бот онлайна), ПВО — DEFENSE[другая][уровень] у трёх целей; объекты разрушаются
// как в игре: сколько ценности уничтожено (damageValue, из ценности 3 целей) и сколько целей добито
export function multiBattle(job) {
  const city = MAPS[1][2], rnd = rng(job.seed), att = job.side, def = att === 'east' ? 'west' : 'east';
  let raid = null;
  const S = createStrike({ city, rnd, mode: () => MODES.real, game: 'multi', aircraft: () => raid.alive(), laserSpot: () => null, night: 0, fx: {}, hurt: (a, d) => raid.hurt(a, d) });
  raid = createRaid(S, city, rnd, { side: att, era: 4, fx: {} });
  const targets = pickTargets(S, rnd, 3);
  if (job.def) placeDefense(S, city, rnd, def, job.lvl, targets, 1, { same: true });
  const comp = COMBINED[att][job.lvl], plan = {}; let j = 0;
  for (const [k, n] of comp) if (AG[k].dmg > 0) plan[k] = { pts: [], alt: null, t: null, sam: false, tgt: null, units: Array.from({ length: n }, () => ({ sam: false, tgt: targets[j++ % 3].id })) };
    else if (AG[k].decoyMun) plan[k] = { pts: [], alt: null, t: null, sam: false, tgt: null, units: Array.from({ length: n }, () => ({ sam: true })) };
  const E = createCombined(S, city, rnd, { side: att, era: 4, raid, comp, plan, lim: LIM_ON });
  E.start(targets);
  let T = 0;
  while ((E.pending() || S.wpns.length) && T < 900) { E.step(DT); raid.step(DT); S.step(DT); T += DT; }
  const v0 = targets.reduce((s, o) => s + o.value, 0);
  return { lost: +(damageValue(targets) / v0).toFixed(3), dead: targets.filter((o) => o.dead).length, T: Math.round(T) };
}
if (IS_WORKER) self.onmessage = (e) => self.postMessage(e.data.jobs.map((j) => ({ id: j.id, r: j.multi ? multiBattle(j) : raidBattle(j) })));
async function runAll(jobs, J) {
  const res = new Array(jobs.length); jobs.forEach((j, i) => { j.id = i; });
  let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(J, jobs.length) }, () => new Promise((resolve) => {
    const w = new Worker(import.meta.url, { type: 'module' });
    const feed = () => { if (next >= jobs.length) { w.terminate(); resolve(); return; } const part = jobs.slice(next, next + 2); next += 2; w.postMessage({ jobs: part }); };
    w.onmessage = (e) => { for (const { id, r } of e.data) res[id] = r; done += e.data.length; if (done % 12 < 2) console.error(`  … ${done}/${jobs.length}, ${Math.round((Date.now() - t0) / 1000)} с`); feed(); };
    w.onerror = (e) => { console.error(e.message); resolve(); };
    feed();
  })));
  return res;
}
async function raid(N, J, DEF = false) {
  const jobs = [];
  for (const [map] of MAPS) for (const side of ['east', 'west']) for (const era of [1, 2, 3, 4]) for (let s = 0; s < N; s++) jobs.push({ map, side, era, seed: 100 + s * 31 + era, def: DEF });
  const res = await runAll(jobs, J);
  // промахи по виду оружия
  const miss = {};
  res.forEach((r) => { for (const [k, L] of Object.entries(r.miss)) (miss[k] = miss[k] || []).push(...L); });
  const byKind = {};
  for (const [k, L] of Object.entries(miss)) (byKind[AG[k].kind] = byKind[AG[k].kind] || []).push(...L);
  const q = (L, p) => { const s = L.slice().sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)]; };
  // промах от точки прицела (медиана — КВО) и до ближайшей постройки (0 — разрыв по постройке); «потеряна» — дальше 300 м от точки
  const sum = (L) => ({ n: L.length, cep: q(L.map((v) => v[0]), 0.5), p90: q(L.map((v) => v[0]), 0.9), lost: +(L.filter((v) => v[0] > 300).length / L.length).toFixed(2),
    on: +(L.filter((v) => v[1] <= 0.01).length / L.length).toFixed(2), near: q(L.map((v) => v[1]), 0.5) });
  const missW = Object.fromEntries(Object.entries(miss).map(([k, L]) => [k, sum(L)]));
  const missK = Object.fromEntries(Object.entries(byKind).map(([k, L]) => [k, sum(L)]));
  // заход: от начала волны до первого сброса; повторный заход — промежуток между сериями одного самолёта (больше 6 с)
  const first = [], again = [];
  res.forEach((r) => { for (const L of Object.values(r.rel)) { first.push(L[0]); for (let i = 1; i < L.length; i++) if (L[i] - L[i - 1] > 6) again.push(L[i] - L[i - 1]); } });
  // волны: по стороне и эпохе — доля потерянной ценности целей и время гибели целей
  const waves = {};
  jobs.forEach((j, i) => { const key = j.side + j.era; const W = waves[key] = waves[key] || WAVE_N.map(() => ({ lost: 0, dead: 0, tgt: 0, kt: [], T: 0, n: 0 }));
    for (const w of res[i].waves) { const x = W[w.wave - 1]; x.lost += w.lost; x.dead += w.dead; x.tgt += w.tgt.length; x.T += w.T; x.n++; for (const [, t] of w.kills) x.kt.push(t); } });
  const wout = {};
  for (const [key, W] of Object.entries(waves)) wout[key] = W.map((x) => ({ lost: x.n ? +(x.lost / x.n).toFixed(2) : null, dead: x.tgt ? +(x.dead / x.tgt).toFixed(2) : null, tKill: x.kt.length ? q(x.kt, 0.5) : null, T: x.n ? Math.round(x.T / x.n) : null, n: x.n }));
  // ни одной цели не осталось к волне k (все уничтожены раньше): сколько волн нужно, чтобы снести весь город без ПВО
  const allDead = {};
  jobs.forEach((j, i) => { const key = j.side + j.era; (allDead[key] = allDead[key] || []).push(res[i].waves.reduce((s, w) => s + w.dead, 0)); });
  return { cep: { bomb: missK.bomb ? missK.bomb.cep : null }, missW, missK, waves: wout, pass: { first: q(first, 0.5), again: again.length ? q(again, 0.5) : null, againN: again.length }, deadTotal: Object.fromEntries(Object.entries(allDead).map(([k, L]) => [k, +(L.reduce((s, v) => s + v, 0) / L.length).toFixed(1)])) };
}
async function multi(N, J) {
  const jobs = [];
  for (const side of ['east', 'west']) for (const lvl of [2, 3, 4]) for (const def of [false, true]) for (let s = 0; s < N; s++) if (COMBINED[side][lvl]) jobs.push({ multi: true, side, lvl, def, seed: 300 + s * 17 + lvl });
  const res = await runAll(jobs, J), out = {};
  jobs.forEach((j, i) => { const k = `${j.side}${j.lvl}${j.def ? '+ПВО' : ''}`, x = out[k] = out[k] || { lost: 0, dead: 0, T: 0, n: 0 }; x.lost += res[i].lost; x.dead += res[i].dead; x.T += res[i].T; x.n++; });
  for (const x of Object.values(out)) { x.lost = +(x.lost / x.n).toFixed(2); x.dead = +(x.dead / x.n).toFixed(2); x.T = Math.round(x.T / x.n); }
  return out;
}
function printMulti(R) {
  console.log('\n«Мульти-волна» ИИ (COMBINED) по 3 целям: доля ценности уничтожена · целей добито из 3 · время, с');
  for (const [k, x] of Object.entries(R)) console.log(`  ${k.padEnd(10)} ${(x.lost * 100).toFixed(0).padStart(3)} % · ${x.dead.toFixed(2)} · ${x.T}`);
}
function printRaid(R) {
  console.log('\nПромах (налёт ИИ без ПВО): вид — разрывов · от точки прицела медиана (КВО) / 90 % · дальше 300 м · по постройке · до постройки (медиана)');
  for (const [k, m] of Object.entries(R.missK)) console.log(`  ${k.padEnd(7)} ${String(m.n).padStart(5)} · ${m.cep} / ${m.p90} м · ${(m.lost * 100).toFixed(0)} % · ${(m.on * 100).toFixed(0)} % · ${m.near} м`);
  console.log(`Заход: до первого сброса ${R.pass.first} с от начала волны; повторный заход — ${R.pass.again} с (${R.pass.againN})`);
  console.log('\nВолны «Обороны» без ПВО: доля ценности целей, потерянная за волну (1…6) · медиана времени гибели цели от начала волны, с');
  for (const [k, W] of Object.entries(R.waves)) console.log(`  ${k.padEnd(6)} ${W.map((x) => (x.lost === null ? '  —  ' : `${(x.lost * 100).toFixed(0).padStart(3)}%${x.tKill !== null ? '/' + x.tKill : ''}`).padEnd(9)).join(' ')} · всего уничтожено целей ${R.deadTotal[k]}`);
}

// ═════════════ check: быстрая проверка баланса (набор тестов) ═════════════
// Правила этапа 2 (Mark 2026-11-01): ни одно оружие, кроме GBU-57, не сносит средний объект одним прямым попаданием; ФАБ-500 — 2 прямых на
// средний объект; ПТУР — до 10, НАР вертолёта — до 40 на средний; эквивалент — по правилу 100 · R / 47, кроме исключений с eq; любая готовая
// ударная подвеска выполняет задание по силе подвески за 3 подвески («Аркада») и меньше — точно в цель
function check() {
  let bad = 0; const fail = (t) => { bad++; console.log('  ОШИБКА: ' + t); };
  const MED = OBJS.filter((o) => o.hp === 200);
  const EXC = new Set(['s8', 'hydra', 'ofab250', 'gbu57', 'jassm', 'kh59mk2']);
  for (const k of WPN) { const W = AG[k], rule = Math.max(5, Math.round(20 * W.blast / 47) * 5); if (!EXC.has(k) && W.eq !== undefined) fail(`${k}: своё eq без причины`); if (EXC.has(k) !== (W.eq !== undefined)) fail(`${k}: исключение без eq`); if (!EXC.has(k) && eqOf(W) !== rule) fail(`${k}: эквивалент ${eqOf(W)}, по правилу ${rule}`); }
  for (const k of WLIST) {
    const W = wOf(k), ex = MED.map((ob) => hitsToKill(ob, W, null).n), lo = Math.min(...ex), hi = Math.max(...ex);
    if (k !== 'gbu57' && lo <= 1) fail(`${W.short}: средний объект — с одного попадания`);
    if (k === 'fab500' && (lo !== 2 || hi !== 2)) fail(`ФАБ-500: на средний объект ${lo}–${hi} прямых (ждём 2)`);
    if (['hellfire', 'ataka', 'shturm'].includes(k) && hi > 10) fail(`${W.short}: на средний объект до ${hi} (больше 10)`);
    if (['s8', 'hydra'].includes(k) && hi > 40) fail(`${W.short}: на средний объект до ${hi} (больше 40)`);
    if (['fab500', 'hellfire', 's8', 'kh55', 'gbu57'].includes(k)) console.log(`${W.short.padEnd(18)} эквивалент ${String(eqOf(W)).padStart(3)} · на средний объект ${lo}–${hi} прямых`);
  }
  for (const e of [1, 2, 3, 4]) for (const L of LOADOUTS[e]) {
    if (loadoutRole(L) === 'sead') continue;
    const items = L.items.filter(([k]) => KINDS.includes(AG[k].kind) && AG[k].dmg > 0);
    if (!items.length) { fail(`${L.name}: ударная подвеска без оружия по объектам`); continue; }
    const nT = loadoutTargets(L), eu = loadoutEq(L), need = nT * 200; // задание — nT средних объектов
    if (eu * 3 < need) fail(`${L.name}: ${eu} ЕУ — задание из ${nT} целей не выполнить и за 3 подвески`);
  }
  return bad;
}

// ═════════════ запуск ═════════════
// ═════════════ запуск ═════════════
if (!IS_WORKER) {
  const OUT = dir + 'strike-balance.json';
  if (CMD === 'check') { const bad = check(); console.log(bad ? `\nИТОГ: ошибок ${bad}` : '\nИТОГ: ошибок нет'); Deno.exit(bad ? 1 : 0); }
  let J = {}; try { J = JSON.parse(Deno.readTextFileSync(OUT)); } catch (_) { /* новый */ }
  const T = +(ARGS.T || 200), N = +(ARGS.N || 6), JN = +(ARGS.J || 4);
  const Jm = J[KEY] = J[KEY] || {};
  if (CMD === 'multi' || CMD === 'all') { console.error(`multi (${KEY})`); Jm.multi = await multi(+(ARGS.NM || 6), JN); printMulti(Jm.multi); }
  if (CMD === 'raiddef' || CMD === 'all') { console.error(`raid + ПВО (${KEY})`); Jm.raidDef = await raid(N, JN, true); printRaid(Jm.raidDef); }
  if (CMD === 'raid' || CMD === 'all') { console.error(`raid (${KEY}): ${N} боёв на сторону × эпоху × карту`); Jm.raid = await raid(N, JN); printRaid(Jm.raid); if (Jm.raid.cep.bomb) CEP_BOMB = Jm.raid.cep.bomb; }
  if (CMD === 'table' || CMD === 'all') { console.error(`table (${KEY}): разлёт — ${T} боёв на пару, КВО свободнопадающих ${CEP_BOMB} м`); Jm.table = table(T); Jm.cepBomb = CEP_BOMB; printTable(Jm.table); }
  if (CMD === 'loads' || CMD === 'all') { const TL = +(ARGS.TL || 150); console.error(`loads (${KEY}): ${TL} заданий на подвеску`); Jm.loads = loads(TL); printLoads(Jm.loads); }
  Jm.stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  J.objects = Jm.objects = OBJS.map((o) => ({ map: o.map, mname: o.mname, key: o.key, name: o.name, value: o.value, hp: o.hp }));
  Deno.writeTextFileSync(OUT, JSON.stringify(J));
  console.error('→ ' + OUT);
}
