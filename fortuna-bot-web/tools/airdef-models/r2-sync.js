// Модели «Воздушного превосходства» в Cloudflare R2 (Mark 2026-11-05: у GitHub Pages лимит 1 ГБ на сайт, игра берёт модели с assets.fortunawtm.com).
// Источник правды - games/airdef/models в репозитории (*.glb, ktx/*.ktx2, ktx/index.json, camo/*.glb); в хранилище те же пути: models/...
//   deno run -A tools/airdef-models/r2-sync.js          закачать новые и изменившиеся файлы (сверка с tools/airdef-models/r2-state.json), вход: npx wrangler login
//   deno run -A tools/airdef-models/r2-sync.js --check  только проверить сайт хранилища: каждый файл отдаётся, размер совпадает, CORS для игры есть
//   ... --dry - показать, что будет закачано; --jobs N - сколько закачек сразу (по умолчанию 8)
// Удалять из хранилища скрипт не умеет: старые версии никому не мешают, а у игрока с открытой игрой они ещё могут запрашиваться.
const BUCKET = 'airdef-assets', HOST = 'https://assets.fortunawtm.com/', ORIGIN = 'https://fortunawtm.com';
const ROOT = new URL('../../games/airdef/', import.meta.url), STATE = new URL('./r2-state.json', import.meta.url);
const args = Deno.args, opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const JOBS = +opt('--jobs', 8), DRY = args.includes('--dry'), CHECK = args.includes('--check');
const TYPE = { glb: 'model/gltf-binary', ktx2: 'image/ktx2', json: 'application/json' };

function list(dir = 'models', out = []) {
  for (const e of Deno.readDirSync(new URL(dir + '/', ROOT))) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) list(p, out); else if (/\.(glb|ktx2)$/.test(e.name) || p === 'models/ktx/index.json') out.push(p);
  }
  return out;
}
const hash = async (p) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', Deno.readFileSync(new URL(p, ROOT))))].map((b) => b.toString(16).padStart(2, '0')).join('');
const pool = async (items, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); };
const files = list().sort();

if (CHECK) {
  const bad = []; let done = 0;
  await pool(files, 24, async (p) => {
    const size = Deno.statSync(new URL(p, ROOT)).size;
    try {
      const r = await fetch(HOST + p, { method: 'HEAD', headers: { 'Accept-Encoding': 'identity', Origin: ORIGIN } });
      const len = +r.headers.get('content-length');
      if (!r.ok) bad.push(`${p}: код ${r.status}`); else if (len && len !== size) bad.push(`${p}: размер ${len}, нужен ${size}`);
      else if (!r.headers.get('access-control-allow-origin')) bad.push(`${p}: нет CORS`);
    } catch (e) { bad.push(`${p}: ${e.message}`); }
    if (++done % 500 === 0) console.log(`проверено ${done} из ${files.length}`);
  });
  console.log(bad.length ? `НЕ СХОДИТСЯ ${bad.length} из ${files.length}:\n${bad.slice(0, 20).join('\n')}` : `в хранилище всё на месте: ${files.length} файлов`);
  Deno.exit(bad.length ? 1 : 0);
}

let state = {}; try { state = JSON.parse(Deno.readTextFileSync(STATE)); } catch (_) { /* первый запуск */ }
const need = [];
for (const p of files) { const h = await hash(p); if (state[p] !== h) need.push([p, h]); }
const mb = need.reduce((s, [p]) => s + Deno.statSync(new URL(p, ROOT)).size, 0) / 1048576;
console.log(`файлов ${files.length}, закачать ${need.length} (${mb.toFixed(0)} МБ)`);
if (DRY) { console.log(need.slice(0, 30).map((x) => x[0]).join('\n')); Deno.exit(0); }

const save = () => Deno.writeTextFileSync(STATE, JSON.stringify(Object.fromEntries(Object.entries(state).sort()), null, 0).replace(/","/g, '",\n"') + '\n');
async function put(p) {
  const ext = p.split('.').pop();
  // index.json меняется с каждым деплоем (адрес с ?v= версии модулей); модели - с ?v= своей версии: браузеру можно хранить долго
  const cmd = new Deno.Command('npx', { args: ['--yes', 'wrangler@4', 'r2', 'object', 'put', `${BUCKET}/${p}`, `--file=${decodeURIComponent(new URL(p, ROOT).pathname)}`, '--remote', `--content-type=${TYPE[ext]}`, '--cache-control=public, max-age=31536000, immutable'], stdout: 'null', stderr: 'piped', env: { WRANGLER_SEND_METRICS: 'false', CI: '1' } });
  const o = await cmd.output(); if (o.code) throw new Error(new TextDecoder().decode(o.stderr).trim().split('\n').slice(-3).join(' ').slice(0, 300));
}
let done = 0; const fail = [];
await pool(need, JOBS, async ([p, h]) => {
  let err = null;
  for (let t = 0; t < 3; t++) { try { await put(p); err = null; break; } catch (e) { err = e; } }
  if (err) fail.push(`${p}: ${err.message}`); else state[p] = h;
  if (++done % 50 === 0) { save(); console.log(`закачано ${done} из ${need.length}`); }
});
save();
console.log(fail.length ? `НЕ ЗАКАЧАНО ${fail.length}:\n${fail.slice(0, 10).join('\n')}` : `готово: закачано ${need.length} файлов`);
Deno.exit(fail.length ? 1 : 0);
