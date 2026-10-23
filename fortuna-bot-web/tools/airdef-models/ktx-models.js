// Текстуры моделей игры → KTX2 UASTC (видеопамять в ~4 раза меньше, чем у распакованных JPEG/PNG). Достаёт картинки из glb,
// кодирует через basisu и пишет games/airdef/models/ktx/<имя>.<номер картинки>.ktx2 + index.json:
//   { "<имя>": { v: версия glb (GLB_V[имя] || '20261022b'), r: ревизия кодирования, img: [номера картинок со сжатым файлом],
//                alias: { "<номер>": "<имя>.<номер>" } — та же картинка уже закодирована в другом файле этого прогона } }
// Игра (models.js) берёт ktx, только если версия в index.json совпала с версией glb (пересобрали glb — снова JPEG, пока не перекодируют).
// Цвет — sRGB; карты нормалей (materials[].normalTexture) — линейные, -normal_map, -mip_renorm. Здания и объекты (META bld / obj)
// пропускаются: их картинку читает city-render (modelColor). Картинка, нужная и как цвет, и как нормали, — тоже (остаётся JPEG).
//   deno run -A tools/airdef-models/ktx-models.js [имя …] [--rdo=1.0] [--out=папка] [--jobs=N] [--stat] [--force]
// Без имён — все модели (index.json пишется заново, лишние файлы убираются); с именами — только они (index.json дополняется).
// --rdo=X — UASTC RDO (-uastc_rdo_l X; по умолчанию 1.0 — пилот 2026-10-23: файл на 19 % меньше, картинка на экране не отличима; --rdo=0 — без RDO); --stat — только посчитать картинки, ничего не писать; --jobs — сколько basisu сразу (по умолчанию 3).
// Нужны basisu (brew install basis_universal) и ffmpeg (basisu не читает прогрессивные JPEG — через PNG).
import { createHash } from 'node:crypto';
const WEB = new URL('../../', import.meta.url).pathname, MD = WEB + 'games/airdef/models/';
const args = Deno.args, flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = (flag('out', MD + 'ktx')).replace(/\/?$/, '/'), RDO = flag('rdo', '1.0').replace(/^0(\.0*)?$/, ''), JOBS = +flag('jobs', 3), STAT = args.includes('--stat');
const REV = 1; // ревизия настроек кодирования (меняется — поднять: у игроков кэш ktx в адресе с ?v=<версия glb>.<r>)
const names = args.filter((a) => !a.startsWith('--'));

// ── версии glb и список зданий/объектов — из models.js (текстом: модуль зависит от THREE) ──
const mj = Deno.readTextFileSync(WEB + 'games/airdef/models.js');
const a0 = mj.indexOf('const GLB_V = '), a1 = mj.indexOf('Object.assign(GLB_V, GLB_V_OWN);');
if (a0 < 0 || a1 < 0) throw new Error('в models.js не нашёл блок GLB_V');
const GLB_V = new Function(mj.slice(a0, a1 + 'Object.assign(GLB_V, GLB_V_OWN);'.length) + '\nreturn GLB_V;')();
const verOf = (n) => GLB_V[n] || '20261022b';
const skipSet = new Set([...mj.matchAll(/(\w+):\s*\{[^{}]*\b(?:bld|obj):\s*true/g)].map((m) => m[1]));
const isSkip = (n) => skipSet.has(n) || skipSet.has(n.replace(/_lo$/, ''));

const all = [...Deno.readDirSync(MD)].filter((e) => e.name.endsWith('.glb')).map((e) => e.name.slice(0, -4)).sort();
const todo = names.length ? names : all.filter((n) => !isSkip(n));
for (const n of todo) if (!all.includes(n)) throw new Error(`нет модели ${n}`);
if (names.length) for (const n of names) if (isSkip(n)) console.log(`${n}: здание / объект — пропускаю (картинку читает city-render)`);

// ── картинки glb ──
function readGlb(name) {
  const b = Deno.readFileSync(MD + name + '.glb'), dv = new DataView(b.buffer, b.byteOffset), jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jl))), bin = 28 + jl;
  const role = new Map(); // номер картинки → 'c' (цвет) | 'n' (нормали) | 'x' (оба — не сжимаем)
  const put = (ti, r) => { const s = json.textures[ti].source; role.set(s, role.has(s) && role.get(s) !== r ? 'x' : r); };
  for (const m of json.materials || []) { const p = m.pbrMetallicRoughness || {}; if (p.baseColorTexture) put(p.baseColorTexture.index, 'c'); if (m.normalTexture) put(m.normalTexture.index, 'n'); }
  const imgs = (json.images || []).map((im, i) => { const bv = json.bufferViews[im.bufferView], off = bin + (bv.byteOffset || 0); return { i, mime: im.mimeType, data: b.subarray(off, off + bv.byteLength), role: role.get(i) }; });
  return imgs.filter((im) => im.role === 'c' || im.role === 'n');
}

// размер картинки по заголовку (PNG / JPEG) — для сводки «МБ и секунд на мегапиксель»
function dims(d) {
  if (d[0] === 0x89) { const v = new DataView(d.buffer, d.byteOffset); return v.getUint32(16) * v.getUint32(20); }
  for (let i = 2; i < d.length;) { if (d[i] !== 0xFF) { i++; continue; } const m = d[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return ((d[i + 5] << 8) | d[i + 6]) * ((d[i + 7] << 8) | d[i + 8]); i += 2 + ((d[i + 2] << 8) | d[i + 3]); }
  return 0;
}
const sh = async (cmd, a, stdin) => { const p = new Deno.Command(cmd, { args: a, stdin: stdin ? 'piped' : 'null', stdout: 'piped', stderr: 'piped' }).spawn(); if (stdin) { const w = p.stdin.getWriter(); await w.write(stdin); await w.close(); } const o = await p.output(); if (!o.success) throw new Error(`${cmd}: ${new TextDecoder().decode(o.stderr).slice(-300)}`); return o.stdout; };
// исходник → PNG для basisu (с альфой — только если она есть и не вся непрозрачная)
async function toPng(im, tmp) {
  const src = `${tmp}.src`; Deno.writeFileSync(src, im.data);
  let alpha = false;
  if (im.mime === 'image/png') { const ct = im.data[25]; if (ct === 4 || ct === 6 || ct === 3) { const px = await sh('ffmpeg', ['-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']); for (let k = 3; k < px.length; k += 4) if (px[k] < 255) { alpha = true; break; } } }
  await sh('ffmpeg', ['-v', 'error', '-y', '-i', src, '-pix_fmt', alpha ? 'rgba' : 'rgb24', `${tmp}.png`]);
  Deno.removeSync(src); return alpha;
}
async function encode(im, out) {
  const tmp = await Deno.makeTempFile({ prefix: 'ktx' }); const png = `${tmp}.png`;
  try {
    const alpha = await toPng(im, tmp);
    const a = ['-ktx2', '-uastc', '-uastc_level', '2', ...(RDO ? ['-uastc_rdo_l', RDO] : []), '-ktx2_zstandard_level', '18', '-mipmap', '-max_threads', '4',
      ...(im.role === 'n' ? ['-linear', '-normal_map', '-mip_renorm'] : []), png, '-output_file', out, '-no_status_output'];
    const t0 = performance.now(); await sh('basisu', a);
    return { ms: performance.now() - t0, alpha };
  } finally { for (const f of [tmp, png, `${tmp}.src`]) try { Deno.removeSync(f); } catch (_) { /* нет */ } }
}

// ── план: уникальные (по содержимому и роли) картинки ──
const plan = [], owner = new Map(), index = {};
for (const name of todo) {
  const e = index[name] = { v: verOf(name), r: REV, img: [], alias: {} };
  for (const im of readGlb(name)) {
    const key = createHash('sha1').update(im.data).digest('hex') + im.role, stem = `${name}.${im.i}`;
    e.img.push(im.i);
    if (owner.has(key)) e.alias[im.i] = owner.get(key); else { owner.set(key, stem); plan.push({ name, im, stem }); }
  }
  if (!Object.keys(e.alias).length) delete e.alias;
}
const srcB = plan.reduce((s, p) => s + p.im.data.length, 0);
console.log(`моделей ${todo.length}, картинок ${Object.values(index).reduce((s, e) => s + e.img.length, 0)}, к кодированию ${plan.length} (${(srcB / 1048576).toFixed(1)} МБ в glb), RDO: ${RDO || 'нет'}`);
if (STAT) Deno.exit(0);

Deno.mkdirSync(OUT, { recursive: true });
const t0 = performance.now(), rows = []; let next = 0, outB = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (next < plan.length) {
    const p = plan[next++], f = `${OUT}${p.stem}.ktx2`;
    try {
      const r = await encode(p.im, f), sz = Deno.statSync(f).size; outB += sz;
      rows.push({ stem: p.stem, role: p.im.role, px: dims(p.im.data), src: p.im.data.length, mime: p.im.mime, out: sz, ms: r.ms, alpha: r.alpha });
    } catch (e) { console.error(`${p.stem}: ${e.message}`); rows.push({ stem: p.stem, fail: true }); delete index[p.name].alias; index[p.name].img = index[p.name].img.filter((i) => i !== p.im.i); }
  }
}));
// index.json: с именами — дополняем, без — заново (и убираем лишние файлы)
const idxFile = OUT + 'index.json'; let old = {}; try { old = JSON.parse(Deno.readTextFileSync(idxFile)); } catch (_) { /* нет */ }
const fin = names.length ? { ...old, ...index } : index;
if (names.length) for (const n of names) for (const e of Deno.readDirSync(OUT)) if (e.name.startsWith(n + '.') && /^\d+\.ktx2$/.test(e.name.slice(n.length + 1)) && !plan.some((p) => p.stem + '.ktx2' === e.name)) Deno.removeSync(OUT + e.name);
if (!names.length) for (const e of Deno.readDirSync(OUT)) if (e.name.endsWith('.ktx2') && !plan.some((p) => p.stem + '.ktx2' === e.name)) Deno.removeSync(OUT + e.name);
Deno.writeTextFileSync(idxFile, JSON.stringify(Object.fromEntries(Object.entries(fin).sort(([a], [b]) => a.localeCompare(b)))) + '\n');
const ok = rows.filter((r) => !r.fail), ms = ok.reduce((s, r) => s + r.ms, 0);
console.log(`готово за ${Math.round((performance.now() - t0) / 1000)} с (кодирование ${(ms / 1000).toFixed(0)} с суммарно, ${(ms / Math.max(1, ok.length)).toFixed(0)} мс на картинку), файлов ${ok.length}, сбоев ${rows.length - ok.length}`);
const mpx = ok.reduce((s, r) => s + r.px, 0) / 1e6;
console.log(`${mpx.toFixed(1)} Мпикс: ${(outB / 1048576 / mpx).toFixed(2)} МБ ktx2 и ${(ms / 1000 / mpx).toFixed(1)} с кодирования (суммарно по процессам) на мегапиксель`);
console.log(`в glb ${(ok.reduce((s, r) => s + r.src, 0) / 1048576).toFixed(2)} МБ → ktx2 ${(outB / 1048576).toFixed(2)} МБ`);
if (Deno.env.get('KTX_ROWS')) Deno.writeTextFileSync(Deno.env.get('KTX_ROWS'), JSON.stringify(rows));
