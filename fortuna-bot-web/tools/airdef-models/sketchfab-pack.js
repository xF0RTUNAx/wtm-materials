// Пакет для выкладки модели на Sketchfab (делает СБОРЩИК после того, как Mark принял модель; Mark выкладывает сам): папка «<name_en> — Sketchfab» рядом с
// папкой модели — glb и blend, превью, «ТЕКСТ ДЛЯ SKETCHFAB.txt» (название, описание, теги, переключатели — в том же виде, что у Hydra 70 и С-8).
//   deno run -A tools/airdef-models/sketchfab-pack.js "<папка модели с ПАСПОРТ.json и ОТЧЁТ.json>"
// Текст собирается из отчёта (поля sketchfab.title / lead / parts / tags / dimensions и числа модели). based — модель на чужой основе (CC BY): строка с автором и
// ссылкой вместо «Built from scratch…» (лицензия основы требует указать автора; «с нуля» было бы неправдой) — «Стрела-1» на БРДМ-2 zhek, 2026-10-24. Основной чат (Fable / Opus) этот файл и пакет не трогает.
const fail = (m) => { console.log('✕ ' + m); Deno.exit(1); };
const ARG = Deno.args.find((a) => !a.startsWith('--'));
if (!ARG) fail('использование: deno run -A sketchfab-pack.js "<папка модели с ПАСПОРТ.json и ОТЧЁТ.json>"');
const DIR = await Deno.realPath(ARG).catch(() => fail(`нет папки ${ARG}`));
const read = (f) => { try { return JSON.parse(Deno.readTextFileSync(`${DIR}/${f}`)); } catch (e) { return fail(`нет читаемого ${f}: ${e.message}`); } };
const P = read('ПАСПОРТ.json'), R = read('ОТЧЁТ.json'), S = R.sketchfab || {};
if (!P.files || !P.files.glb || !P.files.blend || !R.model) fail('в паспорте нет files.glb / files.blend или в отчёте нет model');
for (const f of ['title', 'lead', 'parts', 'tags']) if (!S[f] || (Array.isArray(S[f]) && !S[f].length)) fail(`в отчёте нет sketchfab.${f}`);
const upload = S.glb || P.files.glb; // файл для Sketchfab: у моделей с текстурами и анимацией — свой (sketchfab.glb в отчёте), иначе игровой
const previews = R.previews || [], files = [...new Set([upload, P.files.blend, ...previews])];
for (const f of files) try { Deno.statSync(`${DIR}/${f}`); } catch { fail(`нет файла ${f} в папке модели`); }
const out = `${DIR.replace(/\/[^/]*$/, '')}/${R.name_en || P.name} — Sketchfab`;
Deno.mkdirSync(out, { recursive: true });
for (const f of files) Deno.copyFileSync(`${DIR}/${f}`, `${out}/${f}`);
const GAME = 'https://fortunawtm.com/fortuna-bot-web/games/airdef.html'; // ссылка на игру — в каждом описании модели (Mark 2026-10-22)
const k = (R.model.tris / 1000).toFixed(1), dims = S.dimensions || `length ${R.model.length_m} m, span ${R.model.span_m} m`;
const text = `=== Что вставить в поля Sketchfab ===
Загружать: ${upload}

NAME (Название):
${S.title}

DESCRIPTION (Описание) — скопировать блок между линиями целиком:
----------------------------------------
${S.lead} ${S.based || 'Built from scratch in Blender from public reference drawings.'}

- ~${k}k triangles, game-ready
- Real-world scale (${dims})
- Separate parts: ${S.parts.join(', ')}
- ${S.textures ? 'PBR materials with ' + S.textures : 'Simple PBR materials, no textures'}${S.animation ? '\n- Animation: ' + S.animation : ''}

Made for the mobile game "Air Superiority" by xFORTUNAx.
Play the game in your browser: ${GAME}

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
Превью — по порядку: ${previews.join(', ')}.
`;
Deno.writeTextFileSync(`${out}/ТЕКСТ ДЛЯ SKETCHFAB.txt`, text);
console.log(`пакет готов: ${out}\n  файлы: ${files.join(', ')}, ТЕКСТ ДЛЯ SKETCHFAB.txt`);
