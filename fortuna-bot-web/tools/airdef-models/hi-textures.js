// Версии самолётов с текстурами исходного размера (настройка «Текстуры самолётов», Mark 2026-11-04): та же сборка prepare.js и ao.js, только картинки до 4096 и JPEG 90.
// Пишет games/airdef/models/camo/<самолёт>.hi.glb и список models/hi-list.js. Версия нужна, только если картинка становится больше, чем в игре, и геометрия совпала с игровой.
//   deno run -A tools/airdef-models/hi-textures.js [имя …] [--jobs=4]
// Без имён - все самолёты, кроме SKIP: 11 самолётов andertan, пока в их текстурах чужие картинки (см. AIRDEF_STATE.md, «Лицензии»): больше копии таких картинок не выкладываем.
import { LOADOUTS } from '../../games/airdef/arsenal.js';
const ROOT = new URL('../../', import.meta.url).pathname, MODELS = ROOT + 'games/airdef/models/', TMP = await Deno.makeTempDir();
const SKIP = new Set(['e_b1b', 'e_b52', 'e_gripen', 'e_draken', 'e_f15e', 'e_f117', 'e_su27', 'su30', 'e_su33', 'e_su35', 'e_su57', 'f16', 'e_f22', 'e_f35', 'f18', 'e_f18c', 'e_mirage', 'e_etendard', 'e_viggen', 'e_f4', 'e_typhoon', 'e_hunter', 'e_mirage_f1', 'e_rafale', 'e_f100', 'e_b2', 'e_vulcan']);
const args = Deno.args.filter((a) => !a.startsWith('--')), JOBS = +(Deno.args.find((a) => a.startsWith('--jobs=')) || '--jobs=4').split('=')[1];
const planes = args.length ? args : [...new Set(Object.values(LOADOUTS).flat().filter((L) => !L.heli && L.plane).map((L) => L.plane))].filter((k) => !SKIP.has(k));
const run = async (cmd, env) => { const o = await new Deno.Command(Deno.execPath(), { args: ['run', '-A', ...cmd], env: { ...Deno.env.toObject(), ...env }, stdout: 'piped', stderr: 'piped' }).output(); return { ok: o.success, text: new TextDecoder().decode(o.stdout) + new TextDecoder().decode(o.stderr) }; };
const glbInfo = (f) => { const b = Deno.readFileSync(f), dv = new DataView(b.buffer), jl = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jl))), bin = 28 + jl; let tris = 0, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const m of j.meshes) for (const p of m.primitives) { tris += j.accessors[p.indices].count / 3; const a = j.accessors[p.attributes.POSITION]; mn = mn.map((v, i) => Math.min(v, a.min[i])); mx = mx.map((v, i) => Math.max(v, a.max[i])); } let big = 0; for (const im of j.images || []) { const v = j.bufferViews[im.bufferView], d = b.subarray(bin + (v.byteOffset || 0), bin + (v.byteOffset || 0) + v.byteLength); big = Math.max(big, imgW(d)); } return { tris, mn, mx, big, size: b.length, imgs: (j.images || []).length }; };
function imgW(d) { if (d[0] === 0xff && d[1] === 0xd8) { let k = 2; while (k < d.length - 9) { if (d[k] !== 0xff) { k++; continue; } const m = d[k + 1]; if (m === 0xc0 || m === 0xc1 || m === 0xc2) return Math.max((d[k + 5] << 8) | d[k + 6], (d[k + 7] << 8) | d[k + 8]); k += 2 + ((d[k + 2] << 8) | d[k + 3]); } return 0; } if (d[0] === 0x89) return Math.max((d[16] << 24) | (d[17] << 16) | (d[18] << 8) | d[19], (d[20] << 24) | (d[21] << 16) | (d[22] << 8) | d[23]); return 0; }
const done = [], skipped = []; let i = 0, total = 0;
async function one(n) {
  const dir = `${TMP}/${n}`; Deno.mkdirSync(dir, { recursive: true });
  const p = await run([ROOT + 'tools/airdef-models/prepare.js', n], { PREPARE_HI: '1', PREPARE_OUT: dir }); if (!p.ok) { skipped.push([n, 'сборка: ' + p.text.split('\n').find((l) => /rror/.test(l))]); return; }
  const a = glbInfo(`${MODELS}${n}.glb`), b = glbInfo(`${dir}/${n}.glb`);
  if (b.big <= a.big) { skipped.push([n, `нет выигрыша: ${a.big} → ${b.big}`]); return; }
  const same = a.tris === b.tris && a.mn.every((v, k) => Math.abs(v - b.mn[k]) < 0.02) && a.mx.every((v, k) => Math.abs(v - b.mx[k]) < 0.02);
  if (!same) { skipped.push([n, `геометрия другая: ${a.tris}/${b.tris} треуг., ${a.mx.map((v) => v.toFixed(2))} / ${b.mx.map((v) => v.toFixed(2))}`]); return; }
  const o = await run([ROOT + 'tools/airdef-models/ao.js', n], { AO_DIR: dir }); if (!o.ok) { skipped.push([n, 'затенение: ' + o.text.slice(0, 120)]); return; }
  Deno.copyFileSync(`${dir}/${n}.glb`, `${MODELS}camo/${n}.hi.glb`); const s = Deno.statSync(`${dir}/${n}.glb`).size; total += s; done.push(n); console.log(n, `${a.big} → ${b.big}`, Math.round(s / 1024), 'КБ');
}
await Promise.all(Array.from({ length: JOBS }, async () => { while (i < planes.length) await one(planes[i++]); }));
const prev = (await import(MODELS + 'hi-list.js')).HI_PLANES || [], list = [...new Set([...prev.filter((n) => !planes.includes(n)), ...done])].sort();
Deno.writeTextFileSync(MODELS + 'hi-list.js', `// Создано tools/airdef-models/hi-textures.js - не править руками\nexport const HI_PLANES = ${JSON.stringify(list)};\n`);
console.log('готово:', done.length, 'самолётов,', Math.round(total / 1048576), 'МБ'); for (const [n, w] of skipped) console.log('пропущен', n, w);
Deno.removeSync(TMP, { recursive: true });
