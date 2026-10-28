// Проверка английского словаря «Воздушного превосходства» (games/airdef/lang/en-*.js):
//   deno run -A tools/i18n/dict-check.js         — ошибки (код выхода 1): кириллица в переводе, «Шахед» / Shahed, лишняя подстановка {N}
//                                                  в переводе, разные HTML-теги в ключе и переводе, повтор ключа в одной части с другим
//                                                  переводом; предупреждения: в переводе нет подстановки ключа (так задумано у окончаний
//                                                  «уничтожен{1}»), один ключ в разных частях с разным переводом (побеждает более поздняя
//                                                  часть — lang/en.js), повтор ключа с тем же переводом
//   deno run -A tools/i18n/dict-check.js --srv   — ещё и ответы функций Supabase и онлайн-сервера, которые клиент показывает через
//                                                  trIf / trFmt: русские строки в кавычках без перевода (кроме console.* и комментариев;
//                                                  куски, которые сервер склеивает, проверять глазами)
import * as acorn from 'npm:acorn@8.12.1';
import * as walk from 'npm:acorn-walk@8.3.3';
const dir = new URL('.', import.meta.url).pathname, L = dir + '../../games/airdef/lang/';
const PARTS = ['training', 'data', 'guide', 'ui', 'battle']; // порядок — как в lang/en.js
const cyr = /[А-Яа-яЁё]/;
const ph = (s) => new Set([...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]));
const tags = (s) => [...s.matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)].map((m) => (m[0][1] === '/' ? '/' : '') + m[1].toLowerCase()).sort().join(',');
const short = (s) => JSON.stringify(s.length > 90 ? s.slice(0, 90) + '…' : s);
let err = 0, warn = 0;
const E = (m) => { err++; console.log('  ОШИБКА', m); }, W = (m) => { warn++; console.log('  внимание', m); };
const owner = {}; // ключ → [часть, перевод]
for (const p of PARTS) {
  const f = L + 'en-' + p + '.js';
  // повторы ключей внутри объекта (JS молча берёт последний)
  walk.simple(acorn.parse(Deno.readTextFileSync(f), { ecmaVersion: 'latest', sourceType: 'module', locations: true }), { ObjectExpression(o) {
    const m = new Map();
    for (const q of o.properties) {
      if (q.type !== 'Property' || q.value.type !== 'Literal') continue;
      const k = q.key.type === 'Literal' ? q.key.value : q.key.name, was = m.get(k);
      if (!was) { m.set(k, [q.loc.start.line, q.value.value]); continue; }
      (was[1] === q.value.value ? W : E)(`en-${p}.js:${q.loc.start.line} повтор ключа (строка ${was[0]})${was[1] === q.value.value ? '' : ' с другим переводом'}: ${short(k)}`);
    }
  } });
  const D = (await import(f)).default;
  for (const [k, v] of Object.entries(D)) {
    if (typeof v !== 'string') { E(`[${p}] перевод не строка: ${short(k)}`); continue; }
    if (cyr.test(v)) E(`[${p}] кириллица в переводе: ${short(k)} → ${short(v)}`);
    if (/shahed|шахед/i.test(v) || /шахед/i.test(k)) E(`[${p}] «Шахед» (по глоссарию — дрон ударный / strike drone): ${short(k)}`);
    const pk = ph(k), pv = ph(v);
    for (const n of pv) if (!pk.has(n)) E(`[${p}] в переводе {${n}}, которого нет в ключе: ${short(k)} → ${short(v)}`);
    for (const n of pk) if (!pv.has(n)) W(`[${p}] в переводе нет {${n}}: ${short(k)} → ${short(v)}`);
    if (tags(k) !== tags(v)) E(`[${p}] HTML-теги ключа и перевода разные: ${short(k)} → ${short(v)}`);
    const o = owner[k];
    if (o && o[1] !== v) W(`один ключ, разный перевод: ${short(k)} — en-${o[0]}: ${short(o[1])}, en-${p}: ${short(v)} (в игре — en-${p})`);
    owner[k] = [p, v];
  }
}
console.log(`словарь: ключей ${Object.keys(owner).length}, ошибок ${err}, предупреждений ${warn}`);

if (Deno.args.includes('--srv')) {
  const R = dir + '../../';
  const files = [];
  for (const e of Deno.readDirSync(R + 'supabase/functions')) {
    if (/^(airdef-|get-airdef-|mp-ticket)/.test(e.name) && e.isDirectory) files.push(`supabase/functions/${e.name}/index.ts`);
  }
  for (const e of Deno.readDirSync(R + 'supabase/functions/_shared')) if (/^airdef.*\.ts$/.test(e.name)) files.push('supabase/functions/_shared/' + e.name);
  for (const n of ['airdef-rooms.js', 'airdef-multi.js', 'airdef-own.js']) files.push('game-server/' + n);
  // игрок этого не видит: склейка (целиком — «С этого аккаунта сайта прогресс уже перенесён. Войдите в аккаунт игры» — в словаре),
  // внутренняя ошибка (наружу — «Внутренняя ошибка сервера»), куски журнала боя (game-server/logs, для разбора)
  const SKIP = new Set(['. Войдите в аккаунт игры', 'airdef_progress: не удалось сохранить (конфликт версий)', ' УНИЧТОЖЕН', ' РУЧН', ' РЛС', ' захват:', ' цель:']);
  let miss = 0;
  for (const f of files) {
    Deno.readTextFileSync(R + f).split('\n').forEach((line, i) => {
      const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, ''); if (/console\.|\blog\(|^\s*\*/.test(code)) return;
      for (const m of code.matchAll(/(["'])((?:(?!\1).)*[А-Яа-яЁё](?:(?!\1).)*)\1/g)) {
        if (owner[m[2]] === undefined && !SKIP.has(m[2])) { miss++; console.log(`  без перевода: ${f}:${i + 1} ${short(m[2])}`); }
      }
    });
  }
  console.log(`ответы сервера: без перевода ${miss} (шаблоны с подстановкой и склеенные куски — смотреть глазами)`);
}
Deno.exit(err ? 1 : 0);
