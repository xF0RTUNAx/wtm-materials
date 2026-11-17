// Точечные правки собранных кусков перевода (2026-11-18): work/<язык>/*.json
//   deno run -A tools/i18n/fix.js <язык> set '<русский ключ>' '<перевод>'     - заменить перевод ключа
//   deno run -A tools/i18n/fix.js <язык> sub '<было>' '<стало>'              - заменить подстроку во всех переводах языка
// Правится и копия в work/<язык>/tr/ не нужна: merge.js читает собранные куски. Повторный zip.js затрёт правку - после него повторить.
const dir = new URL('.', import.meta.url).pathname, [lang, op, a, b] = Deno.args;
let n = 0;
for (const e of Deno.readDirSync(dir + `work/${lang}`)) {
  if (!e.isFile || !e.name.endsWith('.json')) continue;
  const f = dir + `work/${lang}/` + e.name, o = JSON.parse(Deno.readTextFileSync(f)); let ch = false;
  for (const k of Object.keys(o)) {
    if (op === 'set' && k === a) { o[k] = b; ch = true; n++; }
    if (op === 'sub' && o[k].includes(a)) { o[k] = o[k].split(a).join(b); ch = true; n++; }
  }
  if (ch) Deno.writeTextFileSync(f, JSON.stringify(o, null, 1));
}
console.log(`${lang} ${op}: изменено ${n}`);
