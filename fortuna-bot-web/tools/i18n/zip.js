// Перевод куска без переписывания русских ключей (2026-11-18): переводчик пишет work/<язык>/tr/<кусок>.json - МАССИВ переводов в том же
// порядке, что строки work/src/<кусок>.json (можно частями: <кусок>.1.json, <кусок>.2.json… - склеиваются по номеру), затем
//   deno run -A tools/i18n/zip.js <язык> <кусок>      (кусок - имя без .json, например ui-2)
// собирает work/<язык>/<кусок>.json { русский ключ: перевод } и проверяет этот кусок (подстановки, теги, кириллица, тире, «Шахед»).
const dir = new URL('.', import.meta.url).pathname, [lang, chunk] = Deno.args;
if (!lang || !chunk) { console.log('zip.js <язык> <кусок>'); Deno.exit(2); }
const src = JSON.parse(Deno.readTextFileSync(dir + `work/src/${chunk}.json`));
const T = dir + `work/${lang}/tr/`;
const files = [...Deno.readDirSync(T)].map((e) => e.name).filter((n) => n === chunk + '.json' || new RegExp(`^${chunk}\\.\\d+\\.json$`).test(n))
  .sort((a, b) => (+(a.split('.').slice(-2, -1)[0]) || 0) - (+(b.split('.').slice(-2, -1)[0]) || 0));
let arr = []; for (const f of files) { const a = JSON.parse(Deno.readTextFileSync(T + f)); if (!Array.isArray(a)) { console.log(f, '- не массив'); Deno.exit(1); } arr = arr.concat(a); }
console.log(`файлы: ${files.join(', ')}; строк перевода ${arr.length} из ${src.length}`);
const ph = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => [...s.matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)].map((m) => (m[0][1] === '/' ? '/' : '') + m[1].toLowerCase()).sort().join(',');
const sh = (s) => JSON.stringify(String(s).length > 70 ? String(s).slice(0, 70) + '…' : s);
let err = 0; const E = (i, m) => { err++; if (err <= 40) console.log(`  #${i} ${m}`); };
const out = {};
src.forEach(([k, en], i) => {
  const t = arr[i]; if (typeof t !== 'string' || !t) { E(i, `нет перевода: ${sh(k)}`); return; }
  if (ph(t) !== ph(en) && ph(t) !== ph(k)) E(i, `подстановки ${ph(t)} ≠ ${ph(en)}: ${sh(k)} → ${sh(t)}`);
  if (tags(t) !== tags(k)) E(i, `теги: ${sh(k)} → ${sh(t)}`);
  if (lang !== 'uk' && /[А-Яа-яЁёІіЇїЄєҐґ]/.test(t)) E(i, `кириллица: ${sh(t)}`);
  if (/шахед|шахід|shahed/i.test(t)) E(i, `«Шахед» запрещён: ${sh(t)}`);
  if (/[—–]/.test(t)) E(i, `длинное тире: ${sh(t)}`);
  out[k] = t;
});
if (arr.length > src.length) E(src.length, `лишние строки перевода: ${arr.length - src.length} (сдвиг порядка?)`);
// грубая проверка сдвига: длина перевода против английского
let odd = 0; src.forEach(([, en], i) => { const t = arr[i]; if (typeof t === 'string' && en.length > 25 && (t.length > en.length * 2.6 || t.length < en.length * 0.35)) { odd++; if (odd <= 8) console.log(`  проверь #${i} (длина): EN ${sh(en)} → ${sh(t)}`); } });
Deno.writeTextFileSync(dir + `work/${lang}/${chunk}.json`, JSON.stringify(out, null, 1));
console.log(`${lang}/${chunk}: ошибок ${err}, подозрительных по длине ${odd}; записано ${Object.keys(out).length}`);
Deno.exit(err ? 1 : 0);
