// Модели «Воздушного превосходства» в Cloudflare R2 (Mark 2026-11-05: у GitHub Pages лимит 1 ГБ на сайт, игра берёт модели с assets.fortunawtm.com).
// Источник правды - games/airdef/models в репозитории (*.glb, ktx/*.ktx2, ktx/index.json, camo/*.glb); в хранилище те же пути: models/...
//   deno run -A tools/airdef-models/r2-sync.js          закачать новые и изменившиеся файлы (сверка с tools/airdef-models/r2-state.json), вход: npx wrangler login
//   deno run -A tools/airdef-models/r2-sync.js --check  только проверить сайт хранилища: каждый файл отдаётся, размер совпадает, CORS для игры есть
//   ... --dry - показать, что будет закачано; --force - закачать всё заново; --jobs N - сколько закачек сразу (по умолчанию 8)
// Путь в хранилище без версии: новая закачка заменяет файл на месте, старых байтов не остаётся, поэтому после пересборки модели версию (GLB_V, CAMO_V) поднимать обязательно.
// Удалять из хранилища скрипт не умеет: файлы убранных моделей просто остаются и никому не мешают.
const BUCKET = 'airdef-assets', HOST = 'https://assets.fortunawtm.com/', ORIGIN = 'https://fortunawtm.com';
const ROOT = new URL('../../games/airdef/', import.meta.url), STATE = new URL('./r2-state.json', import.meta.url);
const args = Deno.args, opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const JOBS = Math.max(1, +opt('--jobs', 8) || 8), DRY = args.includes('--dry'), CHECK = args.includes('--check'), FORCE = args.includes('--force');
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
  const { crypto: std } = await import('jsr:@std/crypto@1'); // MD5 в обычном WebCrypto нет, а ETag в R2 при закачке одним куском - это MD5 файла
  const bad = []; let done = 0;
  await pool(files, 24, async (p) => {
    const data = Deno.readFileSync(new URL(p, ROOT));
    const md5 = [...new Uint8Array(await std.subtle.digest('MD5', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
    try {
      const r = await fetch(HOST + p, { method: 'HEAD', headers: { 'Accept-Encoding': 'identity', Origin: ORIGIN } });
      const len = r.headers.get('content-length'), etag = (r.headers.get('etag') || '').replace(/^W\//, '').replace(/"/g, '');
      if (!r.ok) bad.push(`${p}: код ${r.status}`);
      else if (len !== String(data.length)) bad.push(`${p}: размер ${len}, нужен ${data.length}`); // нет заголовка или пустой файл - тоже ошибка
      else if (etag !== md5) bad.push(`${p}: содержимое другое (ETag ${etag})`);
      else if (!r.headers.get('access-control-allow-origin')) bad.push(`${p}: нет CORS`);
    } catch (e) { bad.push(`${p}: ${e.message}`); }
    if (++done % 500 === 0) console.log(`проверено ${done} из ${files.length}`);
  });
  console.log(bad.length ? `НЕ СХОДИТСЯ ${bad.length} из ${files.length}:\n${bad.slice(0, 20).join('\n')}` : `в хранилище всё на месте: ${files.length} файлов`);
  Deno.exit(bad.length ? 1 : 0);
}

let state = {}; try { state = JSON.parse(Deno.readTextFileSync(STATE)); } catch (_) { /* первый запуск */ }
const need = [];
for (const p of files) { const h = await hash(p); if (FORCE || state[p] !== h) need.push([p, h]); }
const mb = need.reduce((s, [p]) => s + Deno.statSync(new URL(p, ROOT)).size, 0) / 1048576;
console.log(`файлов ${files.length}, закачать ${need.length} (${mb.toFixed(0)} МБ)`);
if (DRY) { console.log(need.slice(0, 30).map((x) => x[0]).join('\n')); Deno.exit(0); }

const save = () => Deno.writeTextFileSync(STATE, JSON.stringify(Object.fromEntries(Object.entries(state).sort()), null, 0).replace(/","/g, '",\n"') + '\n');
async function put(p) {
  const ext = p.split('.').pop();
  // сутки в кэше браузера, не «навсегда»: если файл пересоберут без новой версии, tidyModels выбросит запись и заново скачается свежий файл. Постоянный кэш - свой (offline.js)
  const cmd = new Deno.Command('npx', { args: ['--yes', 'wrangler@4', 'r2', 'object', 'put', `${BUCKET}/${p}`, `--file=${decodeURIComponent(new URL(p, ROOT).pathname)}`, '--remote', `--content-type=${TYPE[ext]}`, '--cache-control=public, max-age=86400'], stdout: 'null', stderr: 'piped', env: { WRANGLER_SEND_METRICS: 'false', CI: '1' } });
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
