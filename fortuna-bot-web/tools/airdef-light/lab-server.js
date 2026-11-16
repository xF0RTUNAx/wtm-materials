// Сервер сохранения «стенда света» (games/airdef/lightlab.js, Mark 2026-11-16): принимает значения ползунков и пишет их на диск,
// чтобы главный чат прочитал, что выставил Mark. Только 127.0.0.1:8939.
//   deno run -A tools/airdef-light/lab-server.js            (порт: PORT=8939)
// POST /save {map, weather, view, values, base, ts} - запись map/weather в lab-values.json (заменяет прежнюю), строка в lab-log.jsonl
// GET  /values - весь lab-values.json; GET /ping - проверка связи для панели
const PORT = +(Deno.env.get('PORT') || 8939);
const DIR = new URL('.', import.meta.url).pathname;
const VALUES = DIR + 'lab-values.json', LOG = DIR + 'lab-log.jsonl';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const readValues = async () => { try { return JSON.parse(await Deno.readTextFile(VALUES)) || {}; } catch (_) { return {}; } };
let queue = Promise.resolve(); // записи - по очереди: автосохранение и кнопка не затирают друг друга
Deno.serve({ hostname: '127.0.0.1', port: PORT }, async (req) => {
  const u = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (u.pathname === '/ping') return json({ ok: true });
  if (u.pathname === '/values' && req.method === 'GET') return json(await readValues());
  if (u.pathname === '/save' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch (_) { return json({ ok: false, error: 'не JSON' }, 400); }
    if (!b || typeof b.map !== 'string' || typeof b.weather !== 'string' || !b.values || typeof b.values !== 'object') return json({ ok: false, error: 'нужны map, weather, values' }, 400);
    const key = `${b.map}/${b.weather}`, rec = { map: b.map, weather: b.weather, view: b.view ?? null, ts: b.ts || new Date().toISOString(), values: b.values };
    if (b.base) rec.base = b.base; // значения «как в игре» на момент загрузки: от них считать поправки
    const job = queue.then(async () => {
      const all = await readValues(); all[key] = rec;
      await Deno.writeTextFile(VALUES, JSON.stringify(all, null, 2) + '\n');
      await Deno.writeTextFile(LOG, JSON.stringify({ key, ...rec }) + '\n', { append: true });
    });
    queue = job.catch(() => {});
    try { await job; } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    return json({ ok: true, key });
  }
  return json({ ok: false, error: 'нет такого пути' }, 404);
});
console.log(`стенд света: сохранение на http://127.0.0.1:${PORT} (${VALUES})`);
