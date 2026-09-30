// Разбор журнала боёв (journal.js): читаемая лента событий и сводка по каждому бою.
//   deno run --allow-read game-server/log-view.js ФАЙЛ.jsonl [КОД_КОМНАТЫ] [--state]
// Файл — с ноутбука (windows\logs.ps1 кладёт его на рабочий стол) или /logs?key=…&date=… с сервера.
// --state — показывать и снимки состояния раз в 5 с (по умолчанию только события).
const [file, ...rest] = Deno.args;
if (!file) { console.log('нужен файл журнала .jsonl'); Deno.exit(1); }
const room = rest.find((a) => /^[A-Za-z0-9]{4}$/.test(a))?.toUpperCase(), showState = rest.includes('--state');
const rows = Deno.readTextFileSync(file).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean)
  .filter((e) => !room || e.room === room);
const tm = (e) => e.ts.slice(11, 19) + (e.room ? ` ${e.room}` : '') + (e.t !== undefined ? ` ${String(Math.floor(e.t / 60))}:${String(Math.floor(e.t % 60)).padStart(2, '0')}` : '');
const WHY = { gimbal: 'цель ушла из поля ГСН', sun: 'увело на солнце', notch: 'цель в доплеровском провале', energy: 'не хватило энергии', decoy: 'ушла на ловушку',
  flare: 'увели ЛТЦ', chaff: 'увели диполи', cone: 'вне поля ГСН', aspect: 'нужен заход в хвост', range: 'далеко для ГСН', none: 'нет цели для ГСН', промах: 'промах' };
const w = (k) => WHY[k] || k;
const line = (e) => {
  switch (e.ev) {
    case 'server_start': return `СЕРВЕР ЗАПУЩЕН${e.dev ? ' (режим разработки)' : ''}`;
    case 'hello': return `вход: ${e.who}`;
    case 'join': return `в комнату: ${e.who}${e.bot ? ' (бот)' : ''}, команда ${e.team + 1}`;
    case 'leave': return `вышел: ${e.who}${e.bot ? ' (бот)' : ''}`;
    case 'room_closed': return 'комната закрыта';
    case 'start': return `СТАРТ ${e.mode} ${e.size}×${e.size}, погода ${e.weather}: ` + e.players.map((p) => `${p.n}${p.bot ? '(бот)' : ''}/к${p.team + 1}`).join(', ');
    case 'end': return `КОНЕЦ, счёт ${e.score.join(':')}: ` + e.players.map((p) => `${p.name} ${p.k}/${p.d}`).join(', ');
    case 'launch': return `пуск ${e.key} #${e.id}: ${e.who}${e.ai ? ' (ИИ)' : ''} → ${e.target || 'без цели'}${e.km !== null ? `, ${e.km} км` : ''}`;
    case 'missile_end': return `  ракета #${e.id} ${e.key} (${e.who} → ${e.target || '—'}): ${e.hit ? 'ПОПАЛА' : w(e.why)}, пролетела ${e.flown} км за ${e.sec} с`;
    case 'deny': return `ОТКАЗ в пуске ${e.key}: ${e.who} → ${e.target || '—'}: ${w(e.why)}`;
    case 'dmg': return `  урон ${e.victim}: ${e.amount} (${e.by}${e.killer ? ', ' + e.killer : ''}), осталось ${e.hp}`;
    case 'kill': return `СБИТ ${e.victim} — ${e.killer ? e.killer + ', ' : ''}${e.by}${e.dist !== null ? `, ${e.dist} км` : ''}; счёт ${e.score.join(':')}`;
    case 'to_ai': return `самолёт ${e.who} ведёт ИИ: ${e.why}${e.silent !== null ? ` (молчал ${e.silent} с)` : ''}`;
    case 'to_human': return `самолёт снова у ${e.who}`;
    case 'disconnect': return `обрыв связи: ${e.who}`;
    case 'resume': return `вернулся: ${e.who}`;
    case 'error': return `ОШИБКА СЕРВЕРА в «${e.in}» (${e.who}): ${e.err.split('\n')[0]}`;
    case 'client': return `игра ${e.who} [${e.k}]: ${e.d}`;
    case 'state': return 'снимок: ' + e.P.map((p) => `${p.n}${p.bot ? '(бот)' : ''} ${p.alive ? 'hp' + p.hp : 'сбит'}${p.ai && !p.bot ? ' ИИ' : ''}${p.net === 0 ? ' БЕЗ СВЯЗИ' : ''}${p.silent > 1 ? ` молчит ${p.silent}с` : ''} v${p.v ?? '-'}${p.gun ? ' пушка:' + p.gun : ''}${p.gunRej ? ' отклонено:' + JSON.stringify(p.gunRej) : ''}`).join(' | ');
    default: return `${e.ev} ${JSON.stringify(e)}`;
  }
};
for (const e of rows) if (e.ev !== 'state' || showState) console.log(tm(e) + '  ' + line(e));
// сводка по комнатам: пуски/попадания по ракетам, отказы и промахи по причинам, подхваты ИИ, жалобы игры
const by = {};
for (const e of rows) {
  if (!e.room) continue;
  const s = by[e.room] ||= { launch: {}, hit: {}, deny: {}, miss: {}, ai: 0, fail: {}, err: 0 };
  if (e.ev === 'launch' && !e.ai) s.launch[e.key] = (s.launch[e.key] || 0) + 1;
  if (e.ev === 'missile_end' && e.hit) s.hit[e.key] = (s.hit[e.key] || 0) + 1;
  if (e.ev === 'missile_end' && !e.hit) s.miss[w(e.why)] = (s.miss[w(e.why)] || 0) + 1;
  if (e.ev === 'deny') s.deny[w(e.why)] = (s.deny[w(e.why)] || 0) + 1;
  if (e.ev === 'to_ai') s.ai++;
  if (e.ev === 'error') s.err++;
  if (e.ev === 'client' && e.k === 'launch_fail') { try { const d = JSON.parse(e.d); s.fail[d.msg] = (s.fail[d.msg] || 0) + 1; } catch (_) { /* нет */ } }
}
for (const [code, s] of Object.entries(by)) {
  console.log(`\n=== ${code}: пуски людей ${JSON.stringify(s.launch)}, попадания ${JSON.stringify(s.hit)}`);
  console.log(`    промахи: ${JSON.stringify(s.miss)}; отказы сервера: ${JSON.stringify(s.deny)}; отказы в игре: ${JSON.stringify(s.fail)}; подхватов ИИ: ${s.ai}; ошибок сервера: ${s.err}`);
}
