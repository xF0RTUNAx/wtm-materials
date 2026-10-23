// Список файлов «Воздушного превосходства» для предзагрузки (Настройки → «Скачать всё заранее», games/airdef/offline.js):
//   deno run -A tools/airdef-headless/assets-manifest.js
// Пишет games/airdef/assets.json: { files: [[путь от games/airdef, байт], …], models: { имя: байт }, ktx: { 'index': байт, '<модель>.<номер>': байт } } (ktx — сжатые текстуры моделей, tools/airdef-models/ktx-models.js). Новый файл, которого нет в списке, —
// не беда: он попадёт в кэш устройства при первом использовании. Обновлять при деплое (навык deploy-airdef).
const root = new URL('../../games/airdef/', import.meta.url).pathname;
const DIRS = ['tex', 'sky', 'fx', 'sounds', 'thumbs', 'ui', 'shots', 'vendor', 'lang'], SKIP = /\.(md|py|txt)$|^\./;
const files = [];
function walk(rel) {
  for (const e of Deno.readDirSync(root + rel)) {
    if (SKIP.test(e.name)) continue;
    const p = `${rel}/${e.name}`;
    if (e.isDirectory) walk(p); else files.push([p, Deno.statSync(root + p).size]);
  }
}
for (const d of DIRS) try { walk(d); } catch (_) { /* нет папки */ }
const models = {};
for (const e of Deno.readDirSync(root + 'models')) if (e.name.endsWith('.glb')) models[e.name.slice(0, -4)] = Deno.statSync(root + 'models/' + e.name).size;
const ktx = {};
try { for (const e of Deno.readDirSync(root + 'models/ktx')) { if (e.name.endsWith('.ktx2')) ktx[e.name.slice(0, -5)] = Deno.statSync(root + 'models/ktx/' + e.name).size; else if (e.name === 'index.json') ktx.index = Deno.statSync(root + 'models/ktx/' + e.name).size; } } catch (_) { /* нет папки */ }
files.sort((a, b) => a[0].localeCompare(b[0]));
Deno.writeTextFileSync(root + 'assets.json', JSON.stringify(Object.keys(ktx).length ? { files, models, ktx } : { files, models }) + '\n');
const mb = (b) => (b / 1048576).toFixed(1);
console.log(`файлов ${files.length} (${mb(files.reduce((s, f) => s + f[1], 0))} МБ), моделей ${Object.keys(models).length} (${mb(Object.values(models).reduce((s, v) => s + v, 0))} МБ)` + (Object.keys(ktx).length ? `, сжатых текстур ${Object.keys(ktx).length - 1} (${mb(Object.values(ktx).reduce((s, v) => s + v, 0))} МБ)` : '') + ' → games/airdef/assets.json');
