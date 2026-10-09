// Раскадровки эффектов (взрывы, огонь) из видеоклипов: кадры → вырезание фона → сетка 8 × N, PNG с прозрачностью.
//   deno run -A tools/airdef-fx/make.js <клип.mp4> <выход.png> [кадров=48] [ячейка=256] [bg=auto|black]
// Фон клипа — сплошной цвет (берётся из угла). Прозрачность: дым — по затемнению фона, огонь — по росту яркости над фоном;
// цвет — «снятый» с фона (P = a·F + (1 − a)·B → F). На чёрном фоне дым не отделить — только огонь (рисовать сложением).
const [src, out, nArg, cArg] = Deno.args;
const N = +(nArg || 48), CELL = +(cArg || 256), COLS = 8;

async function run(args, input) {
  const p = new Deno.Command('ffmpeg', { args: ['-v', 'error', ...args], stdin: input ? 'piped' : 'null', stdout: 'piped' }).spawn();
  if (input) { const w = p.stdin.getWriter(); await w.write(input); await w.close(); }
  const { stdout } = await p.output(); return stdout;
}
const probe = new TextDecoder().decode(new Deno.Command('ffprobe', { args: ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,nb_frames', '-of', 'csv=p=0', src], stdout: 'piped' }).outputSync().stdout).trim().split(',').map(Number);
const [W, H, NF] = probe;

// 1) низкое разрешение: фон, рамка эффекта по всем кадрам, последний «живой» кадр
const SW = 320, SH = Math.round(H * SW / W);
const low = await run(['-i', src, '-vf', `scale=${SW}:${SH}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const fsz = SW * SH * 3, nf = Math.floor(low.length / fsz);
const bg = [low[0], low[1], low[2]];
const diff = (b, i) => Math.abs(b[i] - bg[0]) + Math.abs(b[i + 1] - bg[1]) + Math.abs(b[i + 2] - bg[2]);
let x0 = SW, y0 = SH, x1 = 0, y1 = 0, last = 0, first = -1;
for (let f = 0; f < nf; f++) {
  const b = low.subarray(f * fsz, (f + 1) * fsz); let cnt = 0;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (diff(b, (y * SW + x) * 3) < 30) continue;
    cnt++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (cnt > 6) { last = f; if (first < 0) first = f; }
}
const k = W / SW, cx = (x0 + x1) / 2 * k, cy = (y0 + y1) / 2 * k, side = Math.min(Math.max(W, H), Math.round(Math.max(x1 - x0, y1 - y0) * k * 1.12));
const cx0 = Math.round(Math.max(0, Math.min(W - side, cx - side / 2))), cy0 = Math.round(Math.max(0, Math.min(H - side, cy - side / 2)));
console.log(`${src}: ${W}×${H}, кадров ${nf} (живых ${first}…${last}), фон ${bg}, рамка ${side}px @ ${cx0},${cy0}`);

// 2) кадры в ячейку, равномерно по живому отрезку
const sel = Array.from({ length: N }, (_, i) => Math.round(first + (last - first) * i / (N - 1)));
const big = await run(['-i', src, '-vf', `crop=${side}:${side}:${cx0}:${cy0},scale=${CELL}:${CELL}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const csz = CELL * CELL * 3, ROWS = Math.ceil(N / COLS), SWo = CELL * COLS, SHo = CELL * ROWS;
const sheet = new Uint8Array(SWo * SHo * 4);
const black = bg[0] + bg[1] + bg[2] < 40;
sel.forEach((f, i) => {
  const b = big.subarray(f * csz, (f + 1) * csz), ox = (i % COLS) * CELL, oy = Math.floor(i / COLS) * CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const s = (y * CELL + x) * 3, d = ((oy + y) * SWo + ox + x) * 4, P = [b[s], b[s + 1], b[s + 2]];
    let a;
    if (black) a = Math.max(P[0], P[1], P[2]) / 255; // чёрный фон: прозрачность = яркость (рисуется сложением)
    else {
      const dark = 1 - Math.min(1, P[2] / Math.max(1, bg[2])) * Math.min(1, (P[0] + P[1] + P[2]) / Math.max(1, bg[0] + bg[1] + bg[2])); // дым гасит фон
      const lit = Math.max(0, (P[0] - bg[0]) / (255 - bg[0]), (P[1] - bg[1]) / (255 - bg[1]));           // огонь ярче фона
      a = Math.min(1, Math.max(dark, lit * 1.15));
    }
    a = a < 0.03 ? 0 : a;
    for (let c = 0; c < 3; c++) {
      const F = a > 0.01 ? (P[c] - (1 - a) * (black ? 0 : bg[c])) / a : 0;
      sheet[d + c] = Math.max(0, Math.min(255, Math.round(F)));
    }
    if (!black) { const sp = sheet[d + 2] - Math.max(sheet[d], sheet[d + 1]); if (sp > 0) sheet[d + 2] -= sp; } // синий ореол долой
    sheet[d + 3] = Math.round(a * 255);
  }
});
await run(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${SWo}x${SHo}`, '-i', '-', '-frames:v', '1', '-y', out], sheet);
console.log(`→ ${out}: ${COLS}×${ROWS}, ${N} кадров по ${CELL}px, ${((last - first + 1) / 30).toFixed(1)} с`);
