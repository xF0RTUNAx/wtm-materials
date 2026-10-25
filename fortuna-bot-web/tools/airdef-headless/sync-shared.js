// Копирует правила прокачки «Воздушного превосходства» (progress.js и то, что он импортирует: арсенал, лётные ТТХ) в
// supabase/functions/_shared/airdef/ — функции Supabase собираются только из папки supabase/functions, а считать цены,
// паритет и награду за бой они должны ровно так же, как игра. Запускать после каждой правки этих файлов (тест
// progress-server-test.js сверяет копии с оригиналами и падает, если забыли):
//   deno run -A tools/airdef-headless/sync-shared.js
const ROOT = new URL('../../', import.meta.url).pathname;
const FILES = [['games/airdef/progress.js', 'progress.js'], ['games/airdef/arsenal.js', 'arsenal.js'], ['games/airdef/sim/flight.js', 'flight.js'], ['games/airdef/sim/flight-fit.js', 'flight-fit.js'], ['games/airdef/sim/heli.js', 'heli.js'], ['games/airdef/rating.js', 'rating.js']]; // heli.js — ТТХ вертолётов (ветка «Вертолёты»)
const OUT = ROOT + 'supabase/functions/_shared/airdef/';
export function shared(src) {
  // пути — плоские (всё в одной папке), версии кэша (?v=…) у локальных файлов функций не нужны
  const body = src.replace(/from '\.\/(?:sim\/)?([\w-]+\.js)\?v=[\w]+'/g, "from './$1'");
  return `// СГЕНЕРИРОВАНО tools/airdef-headless/sync-shared.js из games/airdef — не править здесь\n${body}`;
}
if (import.meta.main) {
  Deno.mkdirSync(OUT, { recursive: true });
  for (const [from, to] of FILES) Deno.writeTextFileSync(OUT + to, shared(Deno.readTextFileSync(ROOT + from)));
  console.log('скопировано в', OUT.replace(ROOT, ''), FILES.map(([, t]) => t).join(', '));
}
export { FILES, OUT, ROOT };
