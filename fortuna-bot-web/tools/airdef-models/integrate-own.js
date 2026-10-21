// Встраивание готовой модели от сборщика (чат на Sonnet) в игру — механические шаги интегратора (чат на Fable / Opus).
//   deno run -A tools/airdef-models/integrate-own.js "<папка модели с ПАСПОРТ.json>" [--dry] [--no-thumb]
// Папка модели — ~/Downloads/Воздушное превосходство/Модели/Свои/<название>/: <база>.glb, <база>.blend, build.py, превью, ПАСПОРТ.json
// (поля паспорта — own/_kit/passport.example.json; база и ключ — латиница, цифры и «_»). С --dry печатает план и проверки, ничего не пишет.
// Сначала всё читается и проверяется (ничего не записано, пока не прошли все проверки текста), потом:
//  1. копирует glb и blend в tools/airdef-models/own/, скрипты сборки и паспорт — в own/<база>-build/;
//  2. prepare.js: запись ключа CONFIG — на собственную модель (нос −Z, own: true); нет записи — добавляет после w_nar_s8;
//  3. запускает prepare.js для ключа → games/airdef/models/<ключ>.glb;
//  4. models.js: версия файла в блоке GLB_V_OWN (+1 к последней букве, только если файл игры изменился) и комментарий строки ключа в META;
//  5. убирает файл ключа из списка авторов чужого набора (models/credits.js и CREDITS.md);
//  6. снимает миниатюру wpn:<оружие> (нужен сервер :8935; --no-thumb — пропустить).
// Предупреждения (не останавливают): треугольников больше 6 тыс., материалов больше 4, длина не та, что у прежней модели (±3 %), оружие в паспорте и в META не совпадает.
// Не делает: тесты, снимки полёта и подвески (preview-candidate.js), коммит, пакет Sketchfab (sketchfab-pack.js). Цвет и форму своей модели
// меняет сборщик (замечание — файлом ЗАМЕЧАНИЯ.md в папке модели): запись в prepare.js при следующей ревизии заменяется целиком.
const A = Deno.args, DRY = A.includes('--dry'), NOTHUMB = A.includes('--no-thumb'), DIRARG = A.find((a) => !a.startsWith('--'));
const fail = (m) => { console.log('✕ ' + m); Deno.exit(1); };
if (!DIRARG) fail('использование: deno run -A integrate-own.js "<папка модели с ПАСПОРТ.json>" [--dry] [--no-thumb]');
const WEB = new URL('../../', import.meta.url).pathname, OWN = WEB + 'tools/airdef-models/own/';
const rd = (p) => Deno.readTextFileSync(p), rel = (p) => p.replace(WEB, ''), exists = (p) => { try { Deno.statSync(p); return true; } catch { return false; } };
const DIR = await Deno.realPath(DIRARG).catch(() => fail(`нет папки ${DIRARG}`));
const wr = (p, s) => { if (DRY) console.log('  [dry] запись', rel(p)); else Deno.writeTextFileSync(p, s); };
const cp = (a, b) => { if (DRY) console.log('  [dry] копия', a.split('/').pop(), '→', rel(b)); else { Deno.mkdirSync(b.replace(/\/[^/]*$/, ''), { recursive: true }); Deno.copyFileSync(a, b); } };
const glbInfo = (u8) => { const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), J = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + dv.getUint32(12, true))));
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; let tris = 0;
  for (const m of J.meshes || []) for (const p of m.primitives) { const a = J.accessors[p.attributes.POSITION]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); } if (p.indices != null) tris += J.accessors[p.indices].count / 3; }
  return { len: mx[2] - mn[2], tris, mats: (J.materials || []).length }; };

// ── 0. паспорт и проверки ──
let P; try { P = JSON.parse(rd(`${DIR}/ПАСПОРТ.json`)); } catch (e) { fail('нет читаемого ПАСПОРТ.json в папке: ' + e.message); }
for (const f of ['key', 'weapon', 'name']) if (!P[f]) fail(`в паспорте нет поля ${f}`);
if (!P.files || !P.files.glb || !P.files.blend || !P.model) fail('в паспорте нет files.glb / files.blend / model');
const KEY = P.key, base = P.files.glb.replace(/\.glb$/i, '');
if (!/^[a-z0-9_]+$/.test(KEY)) fail(`ключ «${KEY}» — только латиница в нижнем регистре, цифры и «_»`);
if (!/^[a-z0-9_]+$/.test(base)) fail(`имя файла модели «${P.files.glb}» — только латиница в нижнем регистре, цифры и «_» (например kh31p.glb): кириллица и пробелы ломают путь в prepare.js`);
if (!/^[a-z0-9_]+$/.test(P.weapon)) fail(`оружие «${P.weapon}» в паспорте — только латиница, цифры и «_»`);
for (const f of [P.files.glb, P.files.blend]) if (!exists(`${DIR}/${f}`)) fail(`нет файла ${f} в папке модели`);
const newGlb = Deno.readFileSync(`${DIR}/${P.files.glb}`), nInfo = glbInfo(newGlb);
const oldGamePath = WEB + `games/airdef/models/${KEY}.glb`, oldGame = exists(oldGamePath) ? Deno.readFileSync(oldGamePath) : null, oInfo = oldGame ? glbInfo(oldGame) : null;
console.log(`${P.name} (${KEY}, оружие ${P.weapon}), ревизия ${P.rev || 1}: ${P.model.length_m} м, ${P.model.tris} тр., материалов ${Object.keys(P.model.materials || {}).length}${DRY ? '  [--dry]' : ''}`);
const warn = [];
if (nInfo.tris > 6000) warn.push(`треугольников ${nInfo.tris} (бюджет до 6 тыс.)`);
if (nInfo.mats > 4) warn.push(`материалов ${nInfo.mats} (бюджет до 4)`);
if (oInfo && Math.abs(P.model.length_m - oInfo.len) / oInfo.len > 0.03) warn.push(`длина ${P.model.length_m} м, у прежней модели в игре ${oInfo.len.toFixed(2)} м (допуск ±3 %)`);
const metaRe = new RegExp(`^  ${KEY}: \\{[^\\n]*weapon: '([^']+)'`, 'm'), mm = rd(WEB + 'games/airdef/models.js').match(metaRe);
if (!mm) warn.push(`строки ${KEY} с weapon нет в META models.js — для новой модели добавьте её вручную`); else if (mm[1] !== P.weapon) warn.push(`оружие в паспорте «${P.weapon}», в META models.js «${mm[1]}»`);
console.log('0. проверки: ' + (warn.length ? '\n   ⚠ ' + warn.join('\n   ⚠ ') : '✓ бюджет и длина в порядке'));

// ── текст новых версий файлов (ничего не пишем, пока всё не разобрано) ──
const entry = `  ${KEY}: { src: new URL('./own/${base}.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 256, pickMesh: /./, own: true }, // ${P.name}: своя модель (Blender по картинкам Mark, own/${base}.glb), ${P.model.length_m} м, ${(P.model.tris / 1000).toFixed(1)} тыс. тр., материалов ${Object.keys(P.model.materials || {}).length}`;
let pj = rd(WEB + 'tools/airdef-models/prepare.js'); const re = new RegExp(`^  ${KEY}: \\{.*$`, 'm'), pm = pj.match(re);
if (pm) {
  if ((pm[0].match(/\{/g) || []).length !== (pm[0].match(/\}/g) || []).length) fail(`запись ${KEY} в prepare.js занимает несколько строк — замените вручную на:\n${entry}`);
  pj = pj.replace(re, () => entry);
} else if (/^  w_nar_s8: .*$/m.test(pj)) pj = pj.replace(/^(  w_nar_s8: .*)$/m, (l) => l + '\n' + entry);
else fail('нет ни записи ключа, ни w_nar_s8 в prepare.js — добавьте вручную:\n' + entry);
let mj = rd(WEB + 'games/airdef/models.js'); const bm = mj.match(/const GLB_V_OWN = \{([\s\S]*?)\n\};/);
if (!bm) fail('в models.js нет блока GLB_V_OWN');
const ents = [...bm[1].matchAll(/^\s*([A-Za-z0-9_]+): '([^']+)',?\s*$/gm)].map((x) => [x[1], x[2]]);
const bump = (v) => (/[a-y]$/.test(v) ? v.slice(0, -1) + String.fromCharCode(v.charCodeAt(v.length - 1) + 1) : v + 'a');
const cur = ents.find(([k]) => k === KEY);
const mlRe = new RegExp(`^(  ${KEY}: \\{[^\\n]*?\\},)(?: *//.*)?$`, 'm');
if (mlRe.test(mj)) mj = mj.replace(mlRe, (_, a) => `${a} // ${P.name} — собственная модель (Blender по картинкам Mark, tools/airdef-models/own/${base})`);
const cpath = WEB + 'games/airdef/models/credits.js', cj = rd(cpath), ci = cj.indexOf('export const CREDITS = '); let newCredits = null, credRemoved = 0;
if (ci >= 0) {
  const head = cj.slice(0, ci + 'export const CREDITS = '.length); let list; try { list = JSON.parse(cj.slice(head.length).replace(/;\s*$/, '')); } catch (e) { fail('credits.js не разобрался: ' + e.message); }
  for (const e of list) { const n = e.files.length; e.files = e.files.filter((f) => f !== KEY); credRemoved += n - e.files.length; }
  if (credRemoved) newCredits = head + JSON.stringify(list.filter((e) => e.files.length), null, 1) + ';\n';
}
const mpath = WEB + 'games/airdef/models/CREDITS.md', tok = '`' + KEY + '.glb`', md = rd(mpath);
const newMd = md.includes(tok) ? md.split('\n').flatMap((ln) => { if (!ln.includes(tok)) return [ln]; const x = ln.replace(', ' + tok, '').replace(tok + ', ', ''); return x.includes(tok) ? [] : [x]; }).join('\n') : null;

// ── 1. файлы ──
console.log('1. файлы');
cp(`${DIR}/${P.files.glb}`, `${OWN}${base}.glb`); cp(`${DIR}/${P.files.blend}`, `${OWN}${base}.blend`);
for (const f of [...(P.files.build || []), 'ПАСПОРТ.json']) { if (exists(`${DIR}/${f}`)) cp(`${DIR}/${f}`, `${OWN}${base}-build/${f}`); else console.log('  нет файла', f, '— пропущен'); }

// ── 2. prepare.js ──
console.log('2. prepare.js: запись ключа ' + (pm ? 'заменена' : 'добавлена после w_nar_s8'));
wr(WEB + 'tools/airdef-models/prepare.js', pj);

// ── 3. файл игры ──
console.log('3. готовый файл для игры');
let gameChanged = true;
if (!DRY) {
  const r = new Deno.Command(Deno.execPath(), { args: ['run', '-A', WEB + 'tools/airdef-models/prepare.js', KEY], stdout: 'piped', stderr: 'piped' }).outputSync();
  console.log('  ' + (new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr)).trim().split('\n').slice(-2).join('\n  '));
  if (!r.success) fail('prepare.js не справился — дальше не иду (запись в prepare.js уже внесена, файлы скопированы)');
  const g = Deno.readFileSync(oldGamePath); gameChanged = !(oldGame && oldGame.length === g.length && oldGame.every((v, i) => v === g[i]));
} else {   // с --dry — пробная сборка во временную папку, чтобы знать, изменится ли файл игры
  const T = Deno.makeTempDirSync({ prefix: 'integrate-' });
  const r = new Deno.Command(Deno.execPath(), { args: ['run', '-A', WEB + 'tools/airdef-models/prepare.js', KEY], env: { PREPARE_SRC: `${DIR}/${P.files.glb}`, PREPARE_OUT: T }, stdout: 'piped', stderr: 'piped' }).outputSync();
  if (r.success && oldGame) { const g = Deno.readFileSync(`${T}/${KEY}.glb`); gameChanged = !(oldGame.length === g.length && oldGame.every((v, i) => v === g[i])); }
  Deno.removeSync(T, { recursive: true });
  console.log(`  [dry] prepare.js ${r.success ? 'справился' : 'НЕ справился'}; файл игры ${gameChanged ? 'изменится' : 'не изменится'}`);
}

// ── 4. models.js ──
const ver = cur ? (gameChanged ? bump(cur[1]) : cur[1]) : bump(ents.map((e) => e[1]).sort().pop() || '20261024a');
const ne = cur ? ents.map(([k, v]) => (k === KEY ? [k, ver] : [k, v])) : [...ents, [KEY, ver]];
mj = mj.replace(bm[0], () => 'const GLB_V_OWN = {\n' + ne.map(([k, v]) => `  ${k}: '${v}',`).join('\n') + '\n};');
console.log(`4. models.js: версия файла ${KEY}: ${cur ? cur[1] + (cur[1] === ver ? ' (файл игры не изменился — остаётся)' : ' → ' + ver) : ver + ' (новая запись)'}`);
if (!new RegExp(`^  ${KEY}: \\{`, 'm').test(mj)) console.log(`  ВНИМАНИЕ: строки ${KEY} в META models.js нет — добавьте её вручную`);
wr(WEB + 'games/airdef/models.js', mj);

// ── 5. авторы ──
console.log('5. авторы чужого набора: ' + (credRemoved ? `credits.js — убрано ${credRemoved}` : 'в credits.js ключа нет') + (newMd ? '; CREDITS.md — строка поправлена' : '; в CREDITS.md ключа нет'));
if (newCredits) wr(cpath, newCredits); if (newMd) wr(mpath, newMd);

// ── 6. миниатюра ──
console.log('6. миниатюра');
const up = async () => { try { return (await fetch('http://localhost:8935/fortuna-bot-web/games/airdef.html', { method: 'HEAD' })).ok; } catch { return false; } };
if (NOTHUMB || DRY) console.log(`  пропущена; вручную: deno run -A tools/airdef-headless/thumbs-bake.js wpn:${P.weapon}`);
else if (!(await up())) console.log(`  сервер :8935 не запущен — позже: deno run -A tools/airdef-headless/thumbs-bake.js wpn:${P.weapon}`);
else {
  const r = new Deno.Command(Deno.execPath(), { args: ['run', '-A', WEB + 'tools/airdef-headless/thumbs-bake.js', `wpn:${P.weapon}`], stdout: 'piped', stderr: 'piped' }).outputSync();
  console.log('  ' + (new TextDecoder().decode(r.stdout).trim().split('\n').pop() || '') + (r.success ? '' : '  ✕ ошибка'));
}

console.log(`
Дальше вручную:
 • снимки в игре (снимки писать НЕ в папку модели — там снимки сборщика): deno run -A tools/airdef-models/preview-candidate.js ${KEY} tools/airdef-models/own/${base}.glb --out /tmp/${KEY}-превью
 • в META models.js убрать подгонки под прежнюю модель (drop, lazy, matte — по смыслу)
 • тесты: ui-test.js, event-test.js, sim-test.js (tools/airdef-headless/) — через airdef-tester; не гонять их, пока сборщик снимает превью игры (оба грузят видеокарту)
 • замечания (ось, цвет, сопло…) — файлом ЗАМЕЧАНИЯ.md в папке модели, первая строка «к ревизии ${P.rev || 1}»
 • пакет для Sketchfab: deno run -A tools/airdef-models/sketchfab-pack.js "${DIR}"
 • git add только: tools/airdef-models/prepare.js, own/${base}.* и own/${base}-build/, games/airdef/models.js, models/${KEY}.glb, models/credits.js, models/CREDITS.md, thumbs/wpn_${P.weapon}.webp; журнал в AIRDEF_STATE.md; пуш в online-dev`);
