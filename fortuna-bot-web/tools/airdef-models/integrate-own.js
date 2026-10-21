// Подмена модели в игре на готовую свою — механические шаги, ничего проверять и разбирать не нужно.
//   deno run -A tools/airdef-models/integrate-own.js "<папка модели с ПАСПОРТ.json>" [--dry] [--no-thumb] [--commit [--push]]
// Папка модели — ~/Downloads/Воздушное превосходство/Модели/Свои/<название>/ (там ПАСПОРТ.json и файлы модели). Читается только ПАСПОРТ.json:
// ключ, название, ревизия, имена файлов. Скрипт:
//  1. копирует файлы модели в tools/airdef-models/own/ (скрипты сборки и паспорт — в own/<база>-build/);
//  2. меняет запись ключа в prepare.js на собственную модель (нет записи — добавляет после w_nar_s8);
//  3. собирает файл игры games/airdef/models/<ключ>.glb (prepare.js);
//  4. models.js: версия файла в блоке GLB_V_OWN (+1 к последней букве, только если файл игры изменился) и комментарий строки ключа в META;
//  5. убирает файл ключа из списка авторов чужого набора (models/credits.js и CREDITS.md);
//  6. снимает миниатюру (нужен сервер :8935; --no-thumb — пропустить).
// С --dry ничего не пишет. Всё читается и разбирается до первой записи. С --commit (только перечисленные пути) делает коммит с нейтральным сообщением, с --push — ещё и пуш в online-dev:
// так Mark может подменить модель сам в терминале, без чата.
const A = Deno.args, DRY = A.includes('--dry'), NOTHUMB = A.includes('--no-thumb'), COMMIT = A.includes('--commit') || A.includes('--push'), PUSH = A.includes('--push'), DIRARG = A.find((a) => !a.startsWith('--'));
const fail = (m) => { console.log('✕ ' + m); Deno.exit(1); };
if (!DIRARG) fail('использование: deno run -A integrate-own.js "<папка модели с ПАСПОРТ.json>" [--dry] [--no-thumb]');
const WEB = new URL('../../', import.meta.url).pathname, OWN = WEB + 'tools/airdef-models/own/';
const rd = (p) => Deno.readTextFileSync(p), rel = (p) => p.replace(WEB, ''), exists = (p) => { try { Deno.statSync(p); return true; } catch { return false; } };
const DIR = await Deno.realPath(DIRARG).catch(() => fail(`нет папки ${DIRARG}`));
const wr = (p, s) => { if (!DRY) Deno.writeTextFileSync(p, s); };
const cp = (a, b) => { if (!DRY) { Deno.mkdirSync(b.replace(/\/[^/]*$/, ''), { recursive: true }); Deno.copyFileSync(a, b); } };
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);

// ── паспорт ──
let P; try { P = JSON.parse(rd(`${DIR}/ПАСПОРТ.json`)); } catch (e) { fail('нет читаемого ПАСПОРТ.json в папке: ' + e.message); }
for (const f of ['key', 'weapon', 'name']) if (!P[f]) fail(`в паспорте нет поля ${f}`);
if (!P.files || !P.files.glb || !P.files.blend) fail('в паспорте нет files.glb / files.blend');
const KEY = P.key, base = P.files.glb.replace(/\.glb$/i, '');
for (const [what, v] of [['ключ', KEY], ['имя файла модели', base], ['оружие', P.weapon]]) if (!/^[a-z0-9_]+$/.test(v)) fail(`${what} «${v}» — только латиница в нижнем регистре, цифры и «_» (кириллица и пробелы ломают путь в prepare.js)`);
for (const f of [P.files.glb, P.files.blend]) if (!exists(`${DIR}/${f}`)) fail(`нет файла ${f} в папке модели`);
const oldGamePath = WEB + `games/airdef/models/${KEY}.glb`, oldGame = exists(oldGamePath) ? Deno.readFileSync(oldGamePath) : null;
console.log(`Подмена модели: ${P.name} (${KEY}), ревизия ${P.rev || 1}${DRY ? '  [--dry]' : ''}`);

// ── тексты новых версий файлов (ничего не пишем, пока всё не разобрано) ──
const entry = `  ${KEY}: { src: new URL('./own/${base}.glb', import.meta.url).pathname, scale: 1, nose: '-z', tex: () => 256, pickMesh: /./, own: true }, // ${P.name}: своя модель (Blender, own/${base}.glb)`;
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
if (mlRe.test(mj)) mj = mj.replace(mlRe, (_, a) => `${a} // ${P.name} — собственная модель (tools/airdef-models/own/${base})`);
const cpath = WEB + 'games/airdef/models/credits.js', cj = rd(cpath), ci = cj.indexOf('export const CREDITS = '); let newCredits = null, credRemoved = 0;
if (ci >= 0) {
  const head = cj.slice(0, ci + 'export const CREDITS = '.length); let list; try { list = JSON.parse(cj.slice(head.length).replace(/;\s*$/, '')); } catch (e) { fail('credits.js не разобрался: ' + e.message); }
  for (const e of list) { const n = e.files.length; e.files = e.files.filter((f) => f !== KEY); credRemoved += n - e.files.length; }
  if (credRemoved) newCredits = head + JSON.stringify(list.filter((e) => e.files.length), null, 1) + ';\n';
}
const mpath = WEB + 'games/airdef/models/CREDITS.md', tok = '`' + KEY + '.glb`', md = rd(mpath);
const newMd = md.includes(tok) ? md.split('\n').flatMap((ln) => { if (!ln.includes(tok)) return [ln]; const x = ln.replace(', ' + tok, '').replace(tok + ', ', ''); return x.includes(tok) ? [] : [x]; }).join('\n') : null;

// ── 1. файлы ──
cp(`${DIR}/${P.files.glb}`, `${OWN}${base}.glb`); cp(`${DIR}/${P.files.blend}`, `${OWN}${base}.blend`);
for (const f of [...(P.files.build || []), 'ПАСПОРТ.json']) if (exists(`${DIR}/${f}`)) cp(`${DIR}/${f}`, `${OWN}${base}-build/${f}`);
console.log('1. файлы модели скопированы');

// ── 2. prepare.js ──
wr(WEB + 'tools/airdef-models/prepare.js', pj);
console.log('2. запись в prepare.js ' + (pm ? 'заменена' : 'добавлена'));

// ── 3. файл игры ──
let gameChanged = true;
const runPrepare = (env) => new Deno.Command(Deno.execPath(), { args: ['run', '-A', WEB + 'tools/airdef-models/prepare.js', KEY], env, stdout: 'piped', stderr: 'piped' }).outputSync();
if (!DRY) {
  const r = runPrepare({}); if (!r.success) fail('prepare.js не справился — дальше не иду (запись в prepare.js уже внесена, файлы скопированы)');
  gameChanged = !same(oldGame, Deno.readFileSync(oldGamePath));
} else {   // пробная сборка во временную папку — чтобы знать, изменится ли файл игры
  const T = Deno.makeTempDirSync({ prefix: 'integrate-' }), r = runPrepare({ PREPARE_SRC: `${DIR}/${P.files.glb}`, PREPARE_OUT: T });
  if (r.success && oldGame) gameChanged = !same(oldGame, Deno.readFileSync(`${T}/${KEY}.glb`));
  Deno.removeSync(T, { recursive: true }); if (!r.success) fail('prepare.js не справился с файлом модели');
}
console.log('3. файл игры собран' + (oldGame ? (gameChanged ? ' (изменился)' : ' (не изменился)') : ' (новый)'));

// ── 4. models.js ──
const ver = cur ? (gameChanged ? bump(cur[1]) : cur[1]) : bump(ents.map((e) => e[1]).sort().pop() || '20261024a');
const ne = cur ? ents.map(([k, v]) => (k === KEY ? [k, ver] : [k, v])) : [...ents, [KEY, ver]];
mj = mj.replace(bm[0], () => 'const GLB_V_OWN = {\n' + ne.map(([k, v]) => `  ${k}: '${v}',`).join('\n') + '\n};');
wr(WEB + 'games/airdef/models.js', mj);
console.log(`4. models.js: версия файла ${ver}` + (new RegExp(`^  ${KEY}: \\{`, 'm').test(mj) ? '' : '  ВНИМАНИЕ: строки ключа в META нет — добавьте вручную'));

// ── 5. авторы ──
if (newCredits) wr(cpath, newCredits); if (newMd) wr(mpath, newMd);
console.log('5. авторы чужого набора: ' + (credRemoved || newMd ? 'строка убрана' : 'менять нечего'));

// ── 6. миниатюра ──
const up = async () => { try { return (await fetch('http://localhost:8935/fortuna-bot-web/games/airdef.html', { method: 'HEAD' })).ok; } catch { return false; } };
if (NOTHUMB || DRY) console.log('6. миниатюра пропущена');
else if (!(await up())) console.log(`6. сервер :8935 не запущен — миниатюру позже: deno run -A tools/airdef-headless/thumbs-bake.js wpn:${P.weapon}`);
else { const r = new Deno.Command(Deno.execPath(), { args: ['run', '-A', WEB + 'tools/airdef-headless/thumbs-bake.js', `wpn:${P.weapon}`], stdout: 'piped', stderr: 'piped' }).outputSync(); console.log('6. миниатюра ' + (r.success ? 'снята' : 'не снялась')); }

// ── 7. коммит (только по --commit) ──
const gitPaths = ['tools/airdef-models/prepare.js', `tools/airdef-models/own/${base}.glb`, `tools/airdef-models/own/${base}.blend`, `tools/airdef-models/own/${base}-build`, 'games/airdef/models.js',
  `games/airdef/models/${KEY}.glb`, 'games/airdef/models/credits.js', 'games/airdef/models/CREDITS.md', `games/airdef/thumbs/wpn_${P.weapon}.webp`].filter((x) => exists(WEB + x));
if (COMMIT) {
  if (DRY) console.log('7. [dry] коммит только путей: ' + gitPaths.join(', '));
  else {
    const git = (...args) => new Deno.Command('git', { args: ['-C', WEB, ...args], stdout: 'piped', stderr: 'piped' }).outputSync(), out = (r) => new TextDecoder().decode(r.stdout).trim();
    const staged = out(git('diff', '--cached', '--name-only')).split('\n').filter(Boolean);
    const foreign = staged.filter((f) => !gitPaths.some((x) => f === 'fortuna-bot-web/' + x || f.startsWith('fortuna-bot-web/' + x + '/')));
    if (foreign.length) fail('в индексе уже есть посторонние файлы (' + foreign.slice(0, 3).join(', ') + '…) — коммит не делаю, разберись с индексом');
    git('add', '--', ...gitPaths);
    if (!out(git('diff', '--cached', '--name-only'))) console.log('7. коммитить нечего: всё уже в репозитории');
    else {
      const r = git('commit', '-m', `airdef: своя модель ${P.name} вместо прежней (ревизия ${P.rev || 1})`, '-m', 'Подмена выполнена скриптом tools/airdef-models/integrate-own.js.');
      console.log('7. коммит: ' + (r.success ? out(git('log', '--oneline', '-1')) : '✕ не получился: ' + new TextDecoder().decode(r.stderr).trim().split('\n')[0]));
      if (r.success && PUSH) {
        if (out(git('rev-parse', '--abbrev-ref', 'HEAD')) !== 'online-dev') console.log('   пуш пропущен: текущая ветка не online-dev');
        else { const pr = git('push', 'origin', 'online-dev'); console.log('   пуш в online-dev: ' + (pr.success ? 'готово' : '✕ ' + new TextDecoder().decode(pr.stderr).trim().split('\n')[0])); }
      }
    }
  }
}

console.log(`
Готово. В коммит — только: tools/airdef-models/prepare.js, tools/airdef-models/own/${base}.* и own/${base}-build/, games/airdef/models.js, games/airdef/models/${KEY}.glb, games/airdef/models/credits.js, games/airdef/models/CREDITS.md, games/airdef/thumbs/wpn_${P.weapon}.webp.
Дальше — как после любой правки игры: тесты через airdef-tester, строка в журнал, коммит, пуш в online-dev.`);
