// Стенд прокачки (games/airdef/progress.js): дерево по веткам и рангам, суммы опыта, часы до ранга IV и до всей ветки при
// типичном темпе, проверка правил паритета (исследовать и купить «жадно» — открываются ли все ранги, не застревает ли).
//   deno run --allow-read tools/airdef-headless/progress-stand.js
import { TREE, BRANCHES, SIDES, SIDE_NAME, RANKS, RANK_NAME, nodesOf, newProgress, research, buy, rankOpen, canBuy, canResearch, battleReward, cardStats, pairOf, loadoutMissing, NODE, treeLayout, DAY_FULL } from '../../games/airdef/progress.js';
import { LOADOUTS } from '../../games/airdef/arsenal.js';

let bad = 0; const ok = (t, c) => { console.log((c ? 'OK   ' : 'FAIL ') + t); if (!c) bad++; };
// темп: типичный вылет «Реализма» ≈ 8 мин — 160 основа + 2 цели + 1 комплекс + возврат → ×1,5
const sortie = battleReward({ min: 8, targets: [1, 1], sams: 1, back: true }, { real: true }).xp;
const PER_H = Math.round(sortie * 60 / 9); // с меню и загрузкой ≈ 9 мин на бой
console.log(`Темп: вылет «Реализма» 8 мин ≈ ${sortie} опыта → ≈ ${PER_H} опыта/ч (серебра столько же)\n`);

console.log('Дерево (★ — стартовое, цена — опыт = серебро):');
for (const b of BRANCHES) {
  console.log(`\n${b.name}`);
  for (const r of RANKS) for (const s of SIDES) { const ns = nodesOf(b.id, s, r); if (ns.length) console.log(`  ${RANK_NAME[r].padEnd(3)} ${SIDE_NAME[s].padEnd(6)} ${ns.map((n) => (n.start ? '★' : '') + n.short + (n.start ? '' : ' ' + n.cost)).join(' · ')}`); }
}

// жадно: покупать самое дешёвое доступное по всем веткам; считать опыт до открытия ранга IV в каждой ветке и до всего
const P = newProgress(); let spent = 0; const at = {};
for (let guard = 0; guard < 500; guard++) {
  const cand = TREE.filter((n) => !n.start && !P.own.includes(n.id) && rankOpen(P, n.branch, n.rank)).sort((a, b) => a.cost - b.cost || a.rank - b.rank);
  const n = cand.find((q) => { const t = { ...newProgress(), xp: 1e9, silver: 1e9, res: [...P.res], own: [...P.own] }; if (!canResearch(t, q.id).ok) return false; t.res.push(q.id); return canBuy(t, q.id).ok; });
  if (!n) break;
  P.xp += n.cost; P.silver += n.cost; research(P, n.id); buy(P, n.id); spent += n.cost;
  for (const b of BRANCHES) if (!at[b.id] && rankOpen(P, b.id, 4)) at[b.id] = spent;
}
ok('всё дерево покупается без тупиков паритета', TREE.every((n) => n.start || P.own.includes(n.id)));
ok('ранг IV открывается во всех ветках', BRANCHES.every((b) => rankOpen(P, b.id, 4)));
console.log('\nСуммы (опыт; серебра столько же):');
for (const b of BRANCHES) {
  const tot = TREE.filter((n) => n.branch === b.id).reduce((s, n) => s + n.cost, 0);
  // ранг IV по одной ветке отдельно: жадно только в ней
  const Q = newProgress(); let sp = 0;
  for (let g = 0; g < 200 && !rankOpen(Q, b.id, 4); g++) {
    const n = TREE.filter((q) => q.branch === b.id && !q.start && !Q.own.includes(q.id) && rankOpen(Q, b.id, q.rank)).sort((a, c) => a.cost - c.cost)
      .find((q) => { const t = { ...newProgress(), xp: 1e9, silver: 1e9, res: [...Q.res], own: [...Q.own] }; if (!canResearch(t, q.id).ok) return false; t.res.push(q.id); return canBuy(t, q.id).ok; });
    if (!n) break; Q.xp += n.cost; Q.silver += n.cost; research(Q, n.id); buy(Q, n.id); sp += n.cost;
  }
  console.log(`  ${b.name.padEnd(11)} до ранга IV ≈ ${String(sp).padStart(6)} (${(sp / PER_H).toFixed(1)} ч; не быстрее ${(sp / DAY_FULL).toFixed(1)} дн., при 2 ч в день — ${(sp / PER_H / 2).toFixed(1)} дн.) · вся ветка ${String(tot).padStart(6)} (${(tot / PER_H).toFixed(1)} ч)`);
}
const all = TREE.reduce((s, n) => s + n.cost, 0);
console.log(`  Всё дерево ${all} опыта ≈ ${(all / PER_H).toFixed(0)} ч · единиц ${TREE.length}, стартовых ${TREE.filter((n) => n.start).length}`);

// проверки правил
const S = newProgress();
ok('старт: «Операция» эпохи I доступна обеим сторонам', SIDES.every((s) => LOADOUTS[1].filter((L) => L.side === s).filter((L) => !loadoutMissing(S, L).length).length >= 2));
ok('старт: ранг II закрыт там, где в ранге I есть что купить', BRANCHES.every((b) => rankOpen(S, b.id, 2) === !TREE.some((n) => n.branch === b.id && n.rank === 1 && !n.start)));
{ const T = { ...newProgress(), xp: 1e6, silver: 1e6 }; research(T, 'pvo:s125'); const r = buy(T, 'pvo:s125'); ok('покупка: С-125 за серебро', r.ok && T.silver === 1e6 - NODE['pvo:s125'].cost); }
{ const T = { ...newProgress(), xp: 1e6, silver: 1e6 }; for (const id of ['pvo:kub', 'pvo:osa', 'pvo:igla']) research(T, id); ok('ранг II закрыт до паритета ранга I', !research(T, 'pvo:kub').ok); }
{ // разрыв: три восточных ранга II без западных — третий нельзя
  const T = { ...newProgress(), xp: 1e6, silver: 1e6, own: ['pvo:s125', 'air:e_su17', 'air:f18'] };
  for (const id of ['pvo:kub', 'pvo:osa', 'pvo:igla']) research(T, id); buy(T, 'pvo:kub'); buy(T, 'pvo:osa'); const r = buy(T, 'pvo:igla');
  ok(`паритет внутри ранга: 3-я восточная без западных — нельзя («${r.why}»)`, !r.ok);
}
{ const T = { ...newProgress(), xp: 1e6, silver: 1e6, own: ['wpn:gbu10', 'wpn:bomb1000', 'wpn:fab250', 'wpn:fab100', 'wpn:kh58', 'wpn:kh29t', 'wpn:gbu12', 'wpn:agm88'] }; const r = research(T, 'wpn:kab500s'); ok(`линия: КАБ-500С без КАБ-500Л нельзя («${r.why}»)`, !r.ok && rankOpen(T, 'wpn', 3)); }
ok('линии: предыдущая — та же ветка и сторона, ранг не выше', TREE.every((n) => !n.parent || (NODE[n.parent].side === n.side && NODE[n.parent].rank <= n.rank)));
ok('раскладка: каждая единица в дереве ровно один раз', BRANCHES.every((b) => SIDES.every((s) => { const L = treeLayout(b.id, s); return L.cells.length === nodesOf(b.id, s).length && new Set(L.cells.map((c) => c.row + ':' + c.col)).size === L.cells.length; })));
ok('у каждой единицы есть аналог другой стороны', TREE.every((n) => { const p = pairOf(n); return p && p.side !== n.side; }));
ok('у каждой единицы есть ТТХ для карточки', TREE.every((n) => cardStats(n).length >= 2));
const miss = TREE.filter((n) => { const p = pairOf(n); return !p || p.side === n.side; }).map((n) => n.id); if (miss.length) console.log('  без аналога:', miss.join(' '));
const nost = TREE.filter((n) => cardStats(n).length < 2).map((n) => n.id); if (nost.length) console.log('  мало ТТХ:', nost.join(' '));
{ const r = battleReward({ min: 10, targets: [1] }, { real: false, arcade: true }); ok(`аркада: 10 мин и цель → ${r.xp} (×0,5)`, r.xp === 130); }
{ const r = battleReward({ min: 3, targets: Array(40).fill(2) }, { real: true }); ok(`одиночная: предел на минуту (${r.xp})`, r.xp <= 400 * 3 * 1.5); }
{ const r = battleReward({ min: 10, targets: [1] }, { real: true, dayXp: 9000 }); ok(`после 9000 за день ×0,3 (${r.xp})`, r.xp === Math.round(260 * 1.5 * 0.3)); }
{ const r = battleReward({ min: 12, downs: 3, win: true }, { online: true, real: true, firstWin: true }); ok(`онлайн: победа, первая за день (${r.xp})`, r.xp === Math.round((240 + 75 + 200) * 1.5 * 1.5)); }
console.log(bad ? `\nИТОГ: ошибок ${bad}` : '\nИТОГ: всё прошло');
