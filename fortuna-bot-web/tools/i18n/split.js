// Нарезка английского словаря на куски для перевода на другие языки (2026-11-18): work/src/<часть>-<n>.json - массив [русский ключ, английский].
//   deno run -A tools/i18n/split.js [КБ на кусок, по умолчанию 55]
// Переводчик пишет work/<язык>/<часть>-<n>.json - объект { "русский ключ": "перевод" }; собирает merge.js.
const dir = new URL('.', import.meta.url).pathname, L = dir + '../../games/airdef/lang/';
const PARTS = ['training', 'data', 'guide', 'ui', 'battle'], LIM = (+Deno.args[0] || 55) * 1024;
await Deno.mkdir(dir + 'work/src', { recursive: true });
const list = [];
for (const p of PARTS) {
  const d = (await import(L + 'en-' + p + '.js')).default; let cur = [], size = 0, n = 1;
  const flush = () => { if (!cur.length) return; const f = `${p}-${n}.json`; Deno.writeTextFileSync(dir + 'work/src/' + f, JSON.stringify(cur, null, 1)); list.push([f, cur.length, size]); cur = []; size = 0; n++; };
  for (const [k, v] of Object.entries(d)) { const s = new TextEncoder().encode(k + v).length + 10; if (size + s > LIM) flush(); cur.push([k, v]); size += s; }
  flush();
}
for (const [f, c, s] of list) console.log(f, c, 'строк', Math.round(s / 1024), 'КБ');
console.log('кусков', list.length);
