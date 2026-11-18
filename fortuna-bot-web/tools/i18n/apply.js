// Правки редактора (вычитка на естественность, 2026-11-18): work/<язык>/review/<кусок>.json - объект { "русский ключ": "новый перевод" }
// только для изменённых строк. Применяет их к собранным кускам work/<язык>/*.json и проверяет так же, как merge.js.
//   deno run -A tools/i18n/apply.js <язык> [<кусок>] [--check]
const dir = new URL('.', import.meta.url).pathname, [lang, only] = Deno.args.filter((a) => !a.startsWith('--')), CHECK = Deno.args.includes('--check');
const ph = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => [...s.matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)].map((m) => (m[0][1] === '/' ? '/' : '') + m[1].toLowerCase()).sort().join(',');
const sh = (s) => JSON.stringify(s.length > 70 ? s.slice(0, 70) + '…' : s);
const W = dir + `work/${lang}/`, R = W + 'review/';
let err = 0, ok = 0, miss = 0;
const reviews = [...Deno.readDirSync(R)].map((e) => e.name).filter((n) => n.endsWith('.json') && (!only || n === only + '.json'));
for (const rn of reviews) {
  let fixes; try { fixes = JSON.parse(Deno.readTextFileSync(R + rn)); } catch (x) { console.log(`ОШИБКА ${rn}: не JSON (${x.message.slice(0, 80)})`); err++; continue; }
  const chunk = rn.replace(/\.json$/, ''), f = W + chunk + '.json';
  let o; try { o = JSON.parse(Deno.readTextFileSync(f)); } catch (_) { console.log(`ОШИБКА: нет куска ${chunk}`); err++; continue; }
  for (const [k, t] of Object.entries(fixes)) {
    if (!(k in o)) { miss++; if (miss <= 10) console.log(`  нет ключа в ${chunk}: ${sh(k)}`); continue; }
    const old = o[k];
    if (typeof t !== 'string' || !t.trim()) { console.log(`  ОШИБКА пусто: ${sh(k)}`); err++; continue; }
    if (ph(t) !== ph(old)) { console.log(`  ОШИБКА подстановки ${ph(t)} ≠ ${ph(old)}: ${sh(k)}`); err++; continue; }
    if (tags(t) !== tags(old)) { console.log(`  ОШИБКА теги: ${sh(k)} → ${sh(t)}`); err++; continue; }
    if (lang !== 'uk' && /[А-Яа-яЁёІіЇїЄєҐґ]/.test(t)) { console.log(`  ОШИБКА кириллица: ${sh(t)}`); err++; continue; }
    if (/[—–]/.test(t) || /шахед|шахід|shahed/i.test(t)) { console.log(`  ОШИБКА тире/«Шахед»: ${sh(t)}`); err++; continue; }
    if (t !== old) { o[k] = t; ok++; }
  }
  if (!CHECK) Deno.writeTextFileSync(f, JSON.stringify(o, null, 1));
}
console.log(`${lang}: правок ${ok}, ошибок ${err}, ключей не найдено ${miss}${CHECK ? ' (проверка, не записано)' : ''}`);
Deno.exit(err || miss ? 1 : 0);
