// Журнал онлайн-боёв: по строке JSON на событие (JSONL), файл на день — logs/ГГГГ-ММ-ДД.jsonl рядом с сервером.
// Нужен, чтобы разбирать реальные бои по фактам, а не гадать: пуски и отказы с причиной, исходы ракет, сбития,
// обрывы связи, подхват ботом, ошибки, снимок состояния раз в 5 с и то, что прислала игра (её отказы, ошибки, частота кадров).
// Хранится LOG_DAYS дней (по умолчанию 14), старые файлы удаляются сами. Читать — game-server/log-view.js.
export function createJournal({ dir, days = 14, log = () => {} }) {
  const enc = new TextEncoder();
  let day = '', file = null, broken = false;
  try { Deno.mkdirSync(dir, { recursive: true }); } catch (e) { log('журнал: нет папки ' + dir + ': ' + e); broken = true; }
  function prune() {
    const lim = Date.now() - days * 864e5;
    try { for (const f of Deno.readDirSync(dir)) if (/^\d{4}-\d\d-\d\d\.jsonl$/.test(f.name) && Date.parse(f.name.slice(0, 10)) < lim) Deno.removeSync(`${dir}/${f.name}`); } catch (_) { /* не критично */ }
  }
  function open() {
    const d = new Date().toISOString().slice(0, 10);
    if (d === day && file) return;
    try { if (file) file.close(); } catch (_) { /* уже */ }
    day = d; file = Deno.openSync(`${dir}/${d}.jsonl`, { append: true, create: true, write: true });
    prune();
  }
  function write(ev, data) {
    if (broken) return;
    try { open(); file.writeSync(enc.encode(JSON.stringify({ ts: new Date().toISOString(), ev, ...data }) + '\n')); }
    catch (e) { log('журнал выключен — не записать: ' + e); broken = true; } // например, сервер запущен без --allow-write
  }
  // для /logs: файл дня целиком или строки одной комнаты
  function read(date, room) {
    if (!/^\d{4}-\d\d-\d\d$/.test(date || '')) return null;
    let s; try { s = Deno.readTextFileSync(`${dir}/${date}.jsonl`); } catch (_) { return null; }
    if (!room) return s;
    return s.split('\n').filter((l) => l.includes(`"room":"${room}"`)).join('\n');
  }
  function list() { try { return [...Deno.readDirSync(dir)].map((f) => f.name).filter((n) => n.endsWith('.jsonl')).sort(); } catch (_) { return []; } }
  return { write, read, list };
}
