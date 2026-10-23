// Раскадровка взрыва для игры: кадры рендера Blender (scene.py → render.py) → лист кадров → games/airdef/fx/ex_<тип>.ktx2 (UASTC, видеопамять
// вчетверо меньше PNG) + ex_<тип>.webp (запасной путь — устройство без сжатых текстур) + _lo (вдвое меньше: «Низкий», «Средний»).
// Описание листа (кадры, время кадров, размер в метрах, точка земли) — в games/airdef/fx/explode.json (units-render берёт оттуда).
//   deno run -A tools/airdef-fx/explode/sheet.js <тип> <папка кадров> [клетка, px = 512]
// В папке — <кадр>.png и info.json (render.py: fps, ortho — ширина кадра в метрах, anchor — где на кадре земля под зарядом, 0…1 от левого верхнего).
const [type, dir, cellArg] = Deno.args;
if (!type || !dir) { console.log('нужно: <тип> <папка кадров> [клетка]'); Deno.exit(1); }
const FX = new URL('../../../games/airdef/fx/', import.meta.url).pathname, CELL = +(cellArg || 512);
const info = JSON.parse(Deno.readTextFileSync(`${dir}/info.json`));
const frames = info.frames; // номера кадров сцены по порядку (вначале — каждый: вспышка быстрая; дальше — через один)
const COLS = 8, ROWS = Math.ceil(frames.length / COLS);
const tmp = Deno.makeTempDirSync();
frames.forEach((f, i) => Deno.copyFileSync(`${dir}/${String(f).padStart(3, '0')}.png`, `${tmp}/${String(i).padStart(3, '0')}.png`));
const run = (cmd, args) => { const r = new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'piped' }).outputSync(); if (!r.success) throw new Error(cmd + ': ' + new TextDecoder().decode(r.stderr).slice(-500)); };
for (const [suf, c] of [['', CELL], ['_lo', CELL / 2]]) {
  const png = `${tmp}/sheet${suf}.png`;
  run('ffmpeg', ['-v', 'error', '-y', '-i', `${tmp}/%03d.png`, '-vf', `scale=${c}:${c}:flags=lanczos,tile=${COLS}x${ROWS}:color=0x00000000`, '-frames:v', '1', '-pix_fmt', 'rgba', png]);
  // KTX2: строки снизу вверх (-y_flip) — как у PNG, перевёрнутого при загрузке (flipY): у раскадровок одна и та же разметка клеток
  run('basisu', ['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.0', '-ktx2_zstandard_level', '18', '-mipmap', '-y_flip', png, '-output_file', `${FX}ex_${type}${suf}.ktx2`]);
  run('cwebp', ['-quiet', '-q', '88', '-alpha_q', '100', '-exact', png, '-o', `${FX}ex_${type}${suf}.webp`]);
}
// описание
const J = `${FX}explode.json`; let all = {}; try { all = JSON.parse(Deno.readTextFileSync(J)); } catch (_) { /* первый */ }
all[type] = { cols: COLS, rows: ROWS, frames: frames.length, times: frames.map((f) => +((f - 1) / info.fps).toFixed(4)), width: info.ortho, anchor: info.anchor, ref: info.ref };
Deno.writeTextFileSync(J, JSON.stringify(all, null, 1) + '\n');
const sz = (f) => (Deno.statSync(`${FX}${f}`).size / 1048576).toFixed(2);
console.log(`ex_${type}: ${frames.length} кадров ${COLS}×${ROWS} по ${CELL} px · ktx2 ${sz(`ex_${type}.ktx2`)} МБ, webp ${sz(`ex_${type}.webp`)} МБ, _lo ktx2 ${sz(`ex_${type}_lo.ktx2`)} МБ`);
Deno.removeSync(tmp, { recursive: true });
