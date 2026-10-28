// Цены и потолки «Мульти-волны» (Mark 2026-10-28): игра совпадает с итогом стенда (multi-prices.json), потолки режут план, бесполезные
// в режиме комплексы не продаются.   deno run -A tools/airdef-headless/multi-price-test.js
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const V = Deno.readTextFileSync(dir + '../../games/airdef/sim/combined.js').match(/arsenal\.js(\?v=\w+)/)[1];
const { AG, SAM, THREAT, MULTI, multiItems, multiCap, multiSamCost, multiSamCap, multiSamOk } = await import(`../../games/airdef/arsenal.js${V}`);
const M = await import(`../../games/airdef/sim/online-multi.js${V}`);
const P = JSON.parse(Deno.readTextFileSync(dir + 'multi-prices.json'));
let fails = 0;
const ok = (name, v) => { console.log(`${v ? 'OK  ' : 'FAIL'} ${name}`); if (!v) fails++; };
const items = ['east', 'west'].flatMap((s) => multiItems(s).map(([k]) => k));
ok(`бюджет удара ${MULTI.budget} = стенд ${P.budget}, ПВО ${MULTI.sam} = ${P.samBudget}`, MULTI.budget === P.budget && MULTI.sam === P.samBudget);
ok('цена каждой единицы удара = стенд (THREAT ↔ multi-prices.json atk)', items.every((k) => THREAT[k] === P.atk[k] && THREAT[k] > 0));
ok('потолок каждой единицы удара = стенд (баллистика — правилом tbmCheck)', items.every((k) => (AG[k].kind === 'tbm' ? multiCap(k) >= 99 : multiCap(k) === P.cap[k])));
const sams = Object.keys(SAM);
ok(`бесполезные в режиме не продаются: ${MULTI.samOff.join(', ')}`, MULTI.samOff.every((k) => !M.samOk(k, SAM[k] ? SAM[k].side : 'east')));
ok('у каждого продаваемого ЗРК — цена и потолок стенда', sams.filter(multiSamOk).every((k) => multiSamCost(k) === P.sam[k] && multiSamCap(k) === P.samCap[k]));
ok('у каждого ЗРК стенда (кроме убранных) есть модель в игре', Object.keys(P.sam).filter((k) => !MULTI.samOff.includes(k)).every((k) => !!SAM[k]));
const n = Object.fromEntries(items.filter((k) => AG[k].side === 'east').map((k) => [k, 40]));
const cp = M.cleanPlan({ n, cfg: {} }, 'east', new Set(), 1e5);
ok('план режется по потолку типа (cleanPlan)', Object.entries(cp.n).every(([k, c]) => c === Math.min(M.UNIT_CAP, multiCap(k))) && cp.n.shahed === 12 && cp.n.kh55d === 8 && cp.n.kalibr === 10);
console.log(fails ? `ИТОГ: ошибок ${fails}` : 'ИТОГ: всё прошло');
Deno.exit(fails ? 1 : 0);
