// Сжатые текстуры KTX2 (Basis Universal) для «Воздушного превосходства»: в памяти видеокарты в 4–8 раз меньше, чем JPEG/WebP
// (те распаковываются в RGBA). Цветные — ETC1S (файл как у JPEG), нормали и данные — UASTC (точнее). Исходники (jpg/webp)
// остаются — запасной путь, если KTX2 не загрузился. Пишет games/airdef/tex/*.ktx2 и tex/ktx.json (средние цвета земли —
// из сжатой текстуры их не прочитать; нормали травы и сухой земли — одной текстурой g_gn, как packNormals в city-render.js).
//   deno run -A tools/airdef-tex/ktx.js            (нужен basisu: brew install basis_universal)
//   deno run -A tools/airdef-tex/ktx.js a_ w_      — только текстуры с этими началами имени (без средних цветов, g_gn и деревьев города)
const T = new URL('../../games/airdef/tex/', import.meta.url).pathname;
const run = (args) => { const r = new Deno.Command('basisu', { args, stdout: 'piped', stderr: 'piped' }).outputSync(); if (!r.success) throw new Error(new TextDecoder().decode(r.stderr).slice(-400)); };
const ff = (args, input) => { const p = new Deno.Command('ffmpeg', { args: ['-v', 'error', ...args], stdin: input ? 'piped' : 'null', stdout: 'piped' }).spawn(); if (input) { const w = p.stdin.getWriter(); w.write(input).then(() => w.close()); } return p.output().then((o) => o.stdout); };
const ETC1S = (src, out) => run(['-ktx2', '-mipmap', '-q', '170', '-comp_level', '2', src, '-output_file', out]);
const UASTC = (src, out, normal) => run(['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.5', '-ktx2_zstandard_level', '18', '-mipmap', '-linear', ...(normal ? ['-normal_map'] : []), src, '-output_file', out]);

// земля, дороги, фасады — цвет (имя без расширения)
const COLOR = ['g_grass', 'g_dry', 'g_field', 'g_aerial', 'g_forest', 'g_sand', 'p_asph', 'p_grav', 'p_conc', 'p_iron', 'paving', 'concrete', 'roof', 'f_office', 'f_glass', 'f_brick'];
const AVG = { tGG: 'g_grass', tGD: 'g_dry', tGF: 'g_field', tGA: 'g_aerial', tFG: 'g_forest', tSand: 'g_sand' };
// осень и зима (Mark 2026-10-25: «сжать текстуры земли без значительной потери»): вблизи видна мелочь — UASTC (точнее ETC1S, в памяти
// всё равно ≈ 8 бит на пиксель против 32 у JPEG); снимки с высоты (…A) в шейдере идут только яркостью — ETC1S наибольшего качества
// осень и зима (Mark 2026-10-25: «сжать текстуры земли без значительной потери»; стенд tools/airdef-perf/tex-ab.js): сама текстура в ETC1S
// теряет у травы и грязи до 29–33 дБ, но в кадре игры (уменьшение, фильтрация, смешивание) разница с JPEG 52–56 дБ — не видно; файлы легче JPEG.
// Нормали — UASTC 512² (кадр те же 54–56 дБ, файл ≈ 0,3 МБ вместо 0,4–0,6 МБ JPEG 1024²)
const AW_COLOR = ['a_grass', 'a_leaves', 'a_mud', 'a_field', 'w_asph', 'w_snow', 'w_rock', 'w_ice', 'a_grassA', 'a_mudA', 'w_snowA', 'w_rockA'], AW_NRM = ['a_grass_n', 'w_rock_n', 'w_snow_n'];
const ONLY = Deno.args.filter((a) => !a.startsWith('-')), want = (n) => !ONLY.length || ONLY.some((p) => n.startsWith(p));
const ETC1S_HQ = (src, o) => run(['-ktx2', '-mipmap', '-q', '255', '-comp_level', '4', src, '-output_file', o]);
const out = { avg: {} };
const t0 = performance.now();
// basisu читает не все JPEG (прогрессивные) — через PNG
const viaPng = async (src) => { const tmp = await Deno.makeTempFile({ suffix: '.png' }); await ff(['-y', '-i', src, tmp]); return tmp; };
for (const n of COLOR) { if (!want(n)) continue; const src = [`${T}${n}.jpg`, `${T}${n}.png`].find((f) => { try { return Deno.statSync(f).isFile; } catch (_) { return false; } }); if (src) { const tmp = await viaPng(src); ETC1S(tmp, `${T}${n}.ktx2`); Deno.removeSync(tmp); } }
// средний цвет (как avgColor: квадрат яркости канала — линейный)
if (!ONLY.length) for (const [u, n] of Object.entries(AVG)) {
  const px = await ff(['-i', `${T}${n}.jpg`, '-vf', 'scale=8:8:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const s = [0, 0, 0]; for (let i = 0; i < px.length; i += 3) for (let c = 0; c < 3; c++) s[c] += (px[i + c] / 255) ** 2;
  out.avg[u] = s.map((v) => +(v / (px.length / 3)).toFixed(5));
}
// нормали травы (rg) и сухой земли (ba) — одной картинкой 512² (как packNormalsFrom)
if (!ONLY.length) {
  const a = await ff(['-i', `${T}g_grass_n.jpg`, '-vf', 'scale=512:512', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const b = await ff(['-i', `${T}g_dry_n.jpg`, '-vf', 'scale=512:512', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const d = new Uint8Array(512 * 512 * 4); for (let i = 0; i < 512 * 512; i++) { d[i * 4] = a[i * 3]; d[i * 4 + 1] = a[i * 3 + 1]; d[i * 4 + 2] = b[i * 3]; d[i * 4 + 3] = b[i * 3 + 1]; }
  const tmp = await Deno.makeTempFile({ suffix: '.png' });
  await ff(['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '512x512', '-i', '-', tmp], d);
  UASTC(tmp, `${T}g_gn.ktx2`, false); Deno.removeSync(tmp);
}
if (!ONLY.length) { const tmp = await viaPng(`${T}w_normals.jpg`); UASTC(tmp, `${T}w_normals.ktx2`, true); Deno.removeSync(tmp); }
// деревья (webp → png, затем KTX2; облака остаются WebP — см. city-render.js cloudTex): цвет деревьев — ETC1S с прозрачностью, остальное — UASTC
for (const n of ['tr_city_a', 'tr_city_n', 'tr_city_a_lo', 'tr_city_n_lo', 'tr_winter_a', 'tr_winter_n', 'tr_winter_a_lo', 'tr_winter_n_lo']) {
  if (ONLY.length) break;
  const tmp = await Deno.makeTempFile({ suffix: '.png' });
  new Deno.Command('dwebp', { args: [`${T}${n}.webp`, '-o', tmp], stdout: 'null', stderr: 'null' }).outputSync();
  if (/_a(_lo)?$/.test(n)) ETC1S(tmp, `${T}${n}.ktx2`); else UASTC(tmp, `${T}${n}.ktx2`, false);
  Deno.removeSync(tmp);
}
// осень и зима: цвет — ETC1S наибольшего качества, нормали — UASTC 512²
for (const n of [...AW_COLOR, ...AW_NRM]) {
  if (!want(n)) continue;
  const nrm = AW_NRM.includes(n), tmp = await Deno.makeTempFile({ suffix: '.png' });
  await ff(['-y', '-i', `${T}${n}.jpg`, ...(nrm ? ['-vf', 'scale=512:512:flags=lanczos'] : []), tmp]);
  if (nrm) UASTC(tmp, `${T}${n}.ktx2`, true); else ETC1S_HQ(tmp, `${T}${n}.ktx2`);
  Deno.removeSync(tmp);
}
if (!ONLY.length) Deno.writeTextFileSync(`${T}ktx.json`, JSON.stringify(out));
let kb = 0; for (const e of Deno.readDirSync(T)) if (e.name.endsWith('.ktx2')) kb += Deno.statSync(T + e.name).size / 1024;
console.log(`готово за ${Math.round((performance.now() - t0) / 1000)} с, KTX2 всего ${Math.round(kb)} КБ`);
