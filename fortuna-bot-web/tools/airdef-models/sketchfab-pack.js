// Пакет для выкладки модели на Sketchfab (делает интегратор; Mark выкладывает сам): папка «<name_en> — Sketchfab» рядом с папкой модели —
// glb и blend, превью, «ТЕКСТ ДЛЯ SKETCHFAB.txt» (название, описание, теги, переключатели — в том же виде, что у Hydra 70 и С-8).
//   deno run -A tools/airdef-models/sketchfab-pack.js "<папка модели с ПАСПОРТ.json>"
// Текст собирается ТОЛЬКО из паспорта (поля sketchfab.title / lead / parts / tags / dimensions и числа модели): без справок об изделии, их не искать
// и не добавлять — описание про форму, масштаб и сборку модели.
const fail = (m) => { console.log('✕ ' + m); Deno.exit(1); };
const ARG = Deno.args.find((a) => !a.startsWith('--'));
if (!ARG) fail('использование: deno run -A sketchfab-pack.js "<папка модели с ПАСПОРТ.json>"');
const DIR = await Deno.realPath(ARG).catch(() => fail(`нет папки ${ARG}`));
let P; try { P = JSON.parse(Deno.readTextFileSync(`${DIR}/ПАСПОРТ.json`)); } catch (e) { fail('нет читаемого ПАСПОРТ.json: ' + e.message); }
const S = P.sketchfab || {};
if (!P.files || !P.files.glb || !P.files.blend || !P.model) fail('в паспорте нет files.glb / files.blend / model');
for (const f of ['title', 'lead', 'parts', 'tags']) if (!S[f] || (Array.isArray(S[f]) && !S[f].length)) fail(`в паспорте нет sketchfab.${f}`);
const files = [P.files.glb, P.files.blend, ...(P.files.previews || [])];
for (const f of files) try { Deno.statSync(`${DIR}/${f}`); } catch { fail(`нет файла ${f} в папке модели`); }
const out = `${DIR.replace(/\/[^/]*$/, '')}/${P.name_en || P.name} — Sketchfab`;
Deno.mkdirSync(out, { recursive: true });
for (const f of files) Deno.copyFileSync(`${DIR}/${f}`, `${out}/${f}`);
const k = (P.model.tris / 1000).toFixed(1), dims = S.dimensions || `length ${P.model.length_m} m, span ${P.model.span_m} m`;
const text = `=== Что вставить в поля Sketchfab ===
Загружать: ${P.files.glb}

NAME (Название):
${S.title}

DESCRIPTION (Описание) — скопировать блок между линиями целиком:
----------------------------------------
${S.lead} Built from scratch in Blender from public reference drawings.

- ~${k}k triangles, game-ready
- Real-world scale (${dims})
- Separate parts: ${S.parts.join(', ')}
- Simple PBR materials, no textures

Made for the mobile game "Air Superiority" by xFORTUNAx.

YouTube: https://youtube.com/@xf0rtunax
----------------------------------------

CATEGORY (Категория): Weapons & Military

TAGS (в поле Tags, по одному, Enter после каждого):
${S.tags.join('  ')}

ПЕРЕКЛЮЧАТЕЛИ — как у Hydra:
Public · Allow comments ON · Age-restricted OFF · Promotional OFF · Created with generative AI tools ON
Download: Free → лицензия: только Attribution (CC BY) → Select

ПРИМЕЧАНИЕ ДЛЯ MARK: картинки-источники (чертежи, схемы окраски) найдены в интернете, их авторы и лицензии не фиксировались; в описании сказано
просто «public reference drawings». Если автор или ограничение известны — допиши в описание строку «Reference: …» или реши, выкладывать ли на CC BY.
Превью — по порядку: ${(P.files.previews || []).join(', ')}.
`;
Deno.writeTextFileSync(`${out}/ТЕКСТ ДЛЯ SKETCHFAB.txt`, text);
console.log(`пакет готов: ${out}\n  файлы: ${files.join(', ')}, ТЕКСТ ДЛЯ SKETCHFAB.txt`);
