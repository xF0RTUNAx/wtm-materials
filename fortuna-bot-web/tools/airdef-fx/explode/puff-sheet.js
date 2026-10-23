// Лист клубов дыма для следов подбитых самолётов: 4 варианта × 16 кадров (puff.py) → лист 8×8 → games/airdef/fx/ex_puff.ktx2 (+ .webp, _lo),
// описание — explode.json «puff» (units-render → puffs.js). Вариант v — клетки v·16 … v·16 + 15 (по строкам).
//   deno run -A tools/airdef-fx/explode/puff-sheet.js <папка с v0…v3> [клетка, px = 256]
const [dir, cellArg] = Deno.args;
if (!dir) { console.log('нужно: <папка с v0…v3> [клетка]'); Deno.exit(1); }
const FX = new URL('../../../games/airdef/fx/', import.meta.url).pathname, CELL = +(cellArg || 256), V = 4, COLS = 8;
const info = JSON.parse(Deno.readTextFileSync(`${dir}/v0/info.json`)), F = info.frames.length, ROWS = Math.ceil(V * F / COLS);
const tmp = Deno.makeTempDirSync();
const run = (cmd, args) => { const r = new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'piped' }).outputSync(); if (!r.success) throw new Error(cmd + ': ' + new TextDecoder().decode(r.stderr).slice(-500)); };
for (let v = 0; v < V; v++) info.frames.forEach((f, i) => Deno.copyFileSync(`${dir}/v${v}/${String(f).padStart(3, '0')}.png`, `${tmp}/${String(v * F + i).padStart(3, '0')}.png`));
for (const [suf, c] of [['', CELL], ['_lo', CELL / 2]]) {
  const png = `${tmp}/sheet${suf}.png`;
  // края клетки — растворение на 6 %: клуб не обрывается прямой линией и не заходит в соседнюю клетку
  const feather = `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*min(1,min(min(X,W-1-X)/(0.06*W),min(Y,H-1-Y)/(0.06*H)))'`;
  run('ffmpeg', ['-v', 'error', '-y', '-i', `${tmp}/%03d.png`, '-vf', `scale=${c}:${c}:flags=lanczos,${feather},tile=${COLS}x${ROWS}:color=0x00000000`, '-frames:v', '1', '-pix_fmt', 'rgba', png]);
  run('basisu', ['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.0', '-ktx2_zstandard_level', '18', '-mipmap', '-y_flip', png, '-output_file', `${FX}ex_puff${suf}.ktx2`]);
  run('cwebp', ['-quiet', '-q', '88', '-alpha_q', '100', '-exact', png, '-o', `${FX}ex_puff${suf}.webp`]);
}
const J = `${FX}explode.json`, allJ = JSON.parse(Deno.readTextFileSync(J));
allJ.puff = { cols: COLS, rows: ROWS, frames: F, variants: V, times: info.frames.map((f) => +((f - info.frames[0]) / info.fps).toFixed(4)) };
Deno.writeTextFileSync(J, JSON.stringify(allJ, null, 1) + '\n');
const sz = (f) => (Deno.statSync(`${FX}${f}`).size / 1048576).toFixed(2);
console.log(`ex_puff: ${V} × ${F} кадров ${COLS}×${ROWS} по ${CELL} px · ktx2 ${sz('ex_puff.ktx2')} МБ, webp ${sz('ex_puff.webp')} МБ, _lo ktx2 ${sz('ex_puff_lo.ktx2')} МБ`);
Deno.removeSync(tmp, { recursive: true });
