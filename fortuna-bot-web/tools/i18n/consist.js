// Сверка названий кнопок в подсказках с самими кнопками (2026-11-18): в длинной русской строке «Пуск» в ёлочках - название кнопки;
// если короткая строка «Пуск» есть в словаре, в переводе длинной должно стоять её переведённое название.
//   deno run -A tools/i18n/consist.js <язык> [--all]   (по work/<язык>/*.json; --all - печатать все, иначе первые 80)
const dir = new URL('.', import.meta.url).pathname, lang = Deno.args[0], ALL = Deno.args.includes('--all');
const D = {};
for (const e of Deno.readDirSync(dir + `work/${lang}`)) if (e.isFile && e.name.endsWith('.json')) Object.assign(D, JSON.parse(Deno.readTextFileSync(dir + `work/${lang}/` + e.name)));
const norm = (s) => s.toLowerCase().replace(/[«»„“"']/g, '').replace(/\s+/g, ' ').trim();
let n = 0, bad = 0; const seen = new Map();
for (const [k, t] of Object.entries(D)) {
  for (const m of k.matchAll(/«([^«»]{1,28})»/g)) {
    const lab = m[1]; const tl = D[lab]; if (!tl || tl === lab || /\{\d\}/.test(lab)) continue; // нет такой кнопки в словаре
    n++;
    if (norm(t).includes(norm(tl))) continue;
    bad++; const key = lab + ' → ' + tl; seen.set(key, (seen.get(key) || []).concat([t.slice(0, 110)]));
  }
}
let shown = 0;
for (const [key, ex] of [...seen.entries()].sort((a, b) => b[1].length - a[1].length)) { if (!ALL && shown++ >= 80) break; console.log(`${ex.length}× ${key}\n    напр.: ${ex[0]}`); }
console.log(`${lang}: упоминаний кнопок ${n}, расходятся ${bad} (${seen.size} названий)`);
