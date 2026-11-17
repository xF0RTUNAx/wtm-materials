// Сборка словаря языка из кусков перевода (см. split.js) и проверка (2026-11-18).
//   deno run -A tools/i18n/merge.js <uk|de|es|fr> [--check]   (--check - только проверка, файлы игры не пишутся)
// Пишет games/airdef/lang/<язык>-<часть>.js (ключи - в порядке английского словаря) и lang/<язык>.js.
// Ошибки: нет перевода ключа, подстановки {N} или HTML-теги не совпадают с ключом, кириллица (de/es/fr), «Шахед»/Shahed, длинное тире.
const dir = new URL('.', import.meta.url).pathname, L = dir + '../../games/airdef/lang/';
const ALL = ['training', 'data', 'guide', 'ui', 'battle'], lang = Deno.args[0], CHECK = Deno.args.includes('--check');
const ONLY = (Deno.args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean); // --only=ui,battle - проверить только эти части (с --check)
const PARTS = ONLY.length ? ALL.filter((p) => ONLY.includes(p)) : ALL;
if (ONLY.length && !CHECK) { console.log('--only - только вместе с --check'); Deno.exit(2); }
if (!['uk', 'de', 'es', 'fr'].includes(lang)) { console.log('язык: uk, de, es, fr'); Deno.exit(2); }
const NAME = { uk: 'Украинский', de: 'Немецкий', es: 'Испанский', fr: 'Французский' }[lang];
const ph = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => [...s.matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)].map((m) => (m[0][1] === '/' ? '/' : '') + m[1].toLowerCase()).sort().join(',');
const sh = (s) => JSON.stringify(s.length > 80 ? s.slice(0, 80) + '…' : s);
let err = 0, miss = 0; const E = (m) => { err++; if (err <= 60) console.log('  ОШИБКА', m); };
const ver = (Deno.readTextFileSync(L + 'en.js').match(/\?v=(\w+)/) || [])[1];
for (const p of PARTS) {
  const en = (await import(L + 'en-' + p + '.js')).default, got = {};
  let files = []; try { files = [...Deno.readDirSync(dir + `work/${lang}`)].map((e) => e.name).filter((n) => n.startsWith(p + '-') && n.endsWith('.json')).sort(); } catch (_) { /* папки ещё нет */ }
  for (const n of files) { // кусок можно писать частями: ui-2.json, ui-2.b.json…
    try { Object.assign(got, JSON.parse(Deno.readTextFileSync(dir + `work/${lang}/` + n))); } catch (x) { E(`${lang}/${n}: не читается JSON (${x.message.slice(0, 80)})`); }
  }
  const out = [];
  for (const [k, v] of Object.entries(en)) {
    const t = got[k];
    if (typeof t !== 'string' || !t) { miss++; if (miss <= 40) console.log(`  нет перевода (${p}):`, sh(k)); continue; }
    if (ph(t) !== ph(v) && ph(t) !== ph(k)) E(`${p}: подстановки ${ph(t)} ≠ ${ph(v)}: ${sh(k)}`);
    if (tags(t) !== tags(k)) E(`${p}: теги не те: ${sh(k)} → ${sh(t)}`);
    if (lang !== 'uk' && /[А-Яа-яЁёІіЇїЄєҐґ]/.test(t)) E(`${p}: кириллица: ${sh(t)}`);
    if (/шахед|шахід|shahed/i.test(t)) E(`${p}: «Шахед» запрещён: ${sh(t)}`);
    if (/[—–]/.test(t)) E(`${p}: длинное тире: ${sh(t)}`);
    out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(t)},`);
  }
  const extra = Object.keys(got).filter((k) => !(k in en)); if (extra.length) E(`${p}: лишние ключи (${extra.length}), напр. ${sh(extra[0])}`);
  if (!CHECK) Deno.writeTextFileSync(L + `${lang}-${p}.js`, `// ${NAME} словарь: часть «${p}» (см. lang/${lang}.js). Ключ - русская строка как в коде, значение - перевод; {0}, {1}… - подстановки.\n// Собрано tools/i18n/merge.js из tools/i18n/work/${lang}/ - править здесь или там и пересобрать.\nexport default {\n${out.join('\n')}\n};\n`);
}
if (!CHECK) Deno.writeTextFileSync(L + `${lang}.js`, `// ${NAME} словарь «русская строка → перевод» (i18n.js); части - как у английского (lang/en.js), порядок тот же. Нет строки - английская.\n${ALL.map((p) => `import ${p} from './${lang}-${p}.js?v=${ver}';`).join('\n')}\nexport default { ...training, ...data, ...guide, ...ui, ...battle };\n`);
console.log(`${lang}: ошибок ${err}, без перевода ${miss}${CHECK ? ' (только проверка)' : ' - файлы записаны'}`);
Deno.exit(err || miss ? 1 : 0);
