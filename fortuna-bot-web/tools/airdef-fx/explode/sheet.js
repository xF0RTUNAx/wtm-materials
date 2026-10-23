// Раскадровка взрыва для игры: кадры рендера Blender (scene.py → render.py) → лист кадров → games/airdef/fx/ex_<тип>.ktx2 (UASTC, видеопамять
// вчетверо меньше PNG) + ex_<тип>.webp (запасной путь — устройство без сжатых текстур) + _lo (вдвое меньше: «Низкий», «Средний»).
// Описание листа (кадры, время кадров, размер в метрах, точка земли) — в games/airdef/fx/explode.json (units-render берёт оттуда).
//   deno run -A tools/airdef-fx/explode/sheet.js <тип> <папка кадров> [клетка, px = 512]
// В папке — <кадр>.png и info.json (render.py: fps, ortho — ширина кадра в метрах, anchor — где на кадре земля под зарядом, 0…1 от левого верхнего).
const [type, dir, cellArg] = Deno.args;
if (!type || !dir) { console.log('нужно: <тип> <папка кадров> [клетка]'); Deno.exit(1); }
const FX = new URL('../../../games/airdef/fx/', import.meta.url).pathname, CELL = +(cellArg || 512);
const info = JSON.parse(Deno.readTextFileSync(`${dir}/info.json`));
// пожар (info.loop = M): петля — последние M кадров сливаются с первыми (кадр i < M = смесь кадров i + N и i), стык незаметен
const LOOP = info.loop || 0, ASP = info.aspect || 1, all = info.frames, frames = LOOP ? all.slice(0, all.length - LOOP) : all;
const COLS = 8, ROWS = Math.ceil(frames.length / COLS);
const tmp = Deno.makeTempDirSync();
const run = (cmd, args) => { const r = new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'piped' }).outputSync(); if (!r.success) throw new Error(cmd + ': ' + new TextDecoder().decode(r.stderr).slice(-500)); };
const src = (f) => `${dir}/${String(f).padStart(3, '0')}.png`, N = frames.length;
frames.forEach((f, i) => {
  const out = `${tmp}/${String(i).padStart(3, '0')}.png`;
  if (i < LOOP) { const w = (i / LOOP).toFixed(4); run('ffmpeg', ['-v', 'error', '-y', '-i', src(all[i + N]), '-i', src(f), '-filter_complex', `[0]format=rgba[a];[1]format=rgba[b];[a][b]blend=all_expr='A*(1-${w})+B*${w}'`, '-pix_fmt', 'rgba', out]); }
  else Deno.copyFileSync(src(f), out);
});
const C0 = Math.min(CELL, Math.floor(4096 / ROWS / 8) * 8); // лист не больше 4096 по высоте (предел текстуры у многих телефонов)
for (const [suf, c] of [['', C0], ['_lo', C0 / 2]]) {
  const png = `${tmp}/sheet${suf}.png`;
  // края кадра — растворение на 6 % ширины: дым, дошедший до границы съёмки, не обрывается прямой линией
  const feather = `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*min(1,min(min(X,W-1-X)/(0.06*W),min(Y,H-1-Y)/(0.06*H)))'`;
  run('ffmpeg', ['-v', 'error', '-y', '-i', `${tmp}/%03d.png`, '-vf', `scale=${c * ASP}:${c}:flags=lanczos,${feather},tile=${COLS}x${ROWS}:color=0x00000000`, '-frames:v', '1', '-pix_fmt', 'rgba', png]);
  // KTX2: строки снизу вверх (-y_flip) — как у PNG, перевёрнутого при загрузке (flipY): у раскадровок одна и та же разметка клеток
  run('basisu', ['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.0', '-ktx2_zstandard_level', '18', '-mipmap', '-y_flip', png, '-output_file', `${FX}ex_${type}${suf}.ktx2`]);
  run('cwebp', ['-quiet', '-q', '88', '-alpha_q', '100', '-exact', png, '-o', `${FX}ex_${type}${suf}.webp`]);
}
// описание
const J = `${FX}explode.json`; let allJ = {}; try { allJ = JSON.parse(Deno.readTextFileSync(J)); } catch (_) { /* первый */ }
allJ[type] = { cols: COLS, rows: ROWS, frames: frames.length, times: frames.map((f) => +((f - frames[0]) / info.fps).toFixed(4)), width: info.ortho * ASP, height: info.ortho, anchor: info.anchor, ref: info.ref, ...(LOOP ? { loop: true } : {}) };
Deno.writeTextFileSync(J, JSON.stringify(allJ, null, 1) + '\n');
const sz = (f) => (Deno.statSync(`${FX}${f}`).size / 1048576).toFixed(2);
console.log(`ex_${type}: ${frames.length} кадров ${COLS}×${ROWS} по ${C0} px · ktx2 ${sz(`ex_${type}.ktx2`)} МБ, webp ${sz(`ex_${type}.webp`)} МБ, _lo ktx2 ${sz(`ex_${type}_lo.ktx2`)} МБ`);
Deno.removeSync(tmp, { recursive: true });
