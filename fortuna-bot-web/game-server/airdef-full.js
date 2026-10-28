// Автопроверка полного онлайн-боя «Воздушного превосходства» (три волны до итогов) с короткими фазами (AD_FAST=1):
//   deno run --allow-net --allow-read --allow-env --allow-run game-server/airdef-full.js
// Человек за ПВО в комнате 2×2 с ботами (у него бот-союзник, против — два бота-лётчика); ставит комплекс, жмёт «Готов».
// Ждём: три волны, итоги каждой, конец боя с победителем и сводкой игроков. PASS/FAIL.
// Сервер запущен с секретом, вход — по билетам (как на сайте): итоги боя подписываются, и можно проверить их состав: в итоге своей комнаты
// нет rt, ни в каком итоге нет поля op (id соперников), есть ope; у быстрого боя — rt и ope расшифровывается ровно в двух соперников.
import { SECRET, ticket, readResult, pidOf } from './airdef-test-util.js';
import { unseal } from '../supabase/functions/_shared/airdef-seal.ts';
const PORT = 8796;
const srv = new Deno.Command('deno', { args: ['run', '--allow-net', '--allow-read', '--allow-env', new URL('./server.js', import.meta.url).pathname],
  env: { PORT: String(PORT), HOST: '127.0.0.1', AD_FAST: '1', MP_SECRET: SECRET }, stdout: 'piped', stderr: 'piped' }).spawn();
const PIDS = [pidOf(1), pidOf(2), pidOf(3), pidOf(4), pidOf(5)]; let leaks = 0; // PIDS[0] — основной клиент, 1–4 — очередь
const results = []; const check = (n, ok) => { results.push([n, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 40; i++) { try { ws = new WebSocket(`ws://127.0.0.1:${PORT}/ad`); await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; }); break; } catch (_) { await sleep(250); } }
const msgs = []; let me = 0, waves = new Set(), end = null, kills = 0, downs = 0, code = '', lobbyAgain = null, pong = 0;
const send = (m) => ws.send(JSON.stringify(m));
ws.onmessage = (e) => {
  if (PIDS.slice(1).some((id) => e.data.includes(id))) leaks++; // id чужих аккаунтов клиенту не уходят
  const m = JSON.parse(e.data); msgs.push(m.t);
  if (m.t === 'welcome') { me = m.id; send({ t: 'create', mode: 'arcade', size: 2, era: 3, sideAir: 'west', team: 'pvo', fill: true }); }
  if (m.t === 'room' && !code) code = m.code;
  if (m.t === 'pong') pong++;
  if (m.t === 'room' && m.state === 'lobby' && end) { lobbyAgain = m; return; } // после боя — снова лобби той же комнаты
  if (m.t === 'room' && m.state === 'lobby' && !m.players.find((p) => p.id === me).ready) send({ t: 'ready', on: true });
  if (m.t === 'room' && m.state === 'plan') { waves.add(m.wave); for (let i = 0; i < 12; i++) send({ t: 'buyUnit', k: 'osa', x: 400 + (i % 4) * 160, z: -500 + Math.floor(i / 4) * 160 }); send({ t: 'ready', on: true }); }
  if (m.t === 'waveEnd') console.log(`  волна ${m.wave}: ${m.why}, уничтожено ${Math.round(m.totalK * 100)}%, сбито ${m.downs}`);
  if (m.t === 's' && m.e) for (const e2 of m.e) { if (e2[0] === 'kl') { kills++; console.log('  журнал:', e2.slice(1).join(' · ')); } if (e2[0] === 'dn') downs++; }
  if (m.t === 'end') end = m;
};
send({ t: 'ping', i: 1 }); send({ t: 'hello', ticket: await ticket(PIDS[0], 'зенитчик') });
const pinger = setInterval(() => { try { send({ t: 'ping', i: 2 }); } catch (_) { /* закрыт */ } }, 2000); // как игра: пинг раз в 2 с (молчащее соединение сервер закрывает)
// быстрый поиск: ещё четверо в очереди «Реализма» (двое — авиация, двое — любая) → комната 2 на 2 без ботов
const qc = [];
for (const [i, role] of [[1, 'air'], [2, 'air'], [3, 'any'], [4, 'any']].map(([i, r]) => [i, r])) {
  const w = new WebSocket(`ws://127.0.0.1:${PORT}/ad`); await new Promise((ok) => (w.onopen = ok)); const c = { w, got: [] };
  w.onmessage = (e) => { if (e.data.includes(PIDS[0]) || PIDS.slice(1).some((id, j) => j + 1 !== i && e.data.includes(id))) leaks++; const m = JSON.parse(e.data); c.got.push(m); if (m.t === 'welcome') w.send(JSON.stringify({ t: 'queue', mode: 'real', role })); };
  w.send(JSON.stringify({ t: 'hello', ticket: await ticket(PIDS[i], 'очередь' + i) })); qc.push(c);
  const pi = setInterval(() => { try { w.send(JSON.stringify({ t: 'ping', i: 3 })); } catch (_) { clearInterval(pi); } }, 2000); // ждут итог: молчащее соединение сервер закрывает
}
let loadMax = null; for (let i = 0; i < 300 && !end; i++) { await sleep(500); if (i % 10 === 0) { try { const h = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json(); if (h.airdef && h.airdef.load && (!loadMax || h.airdef.load.tickMaxMs > loadMax.tickMaxMs)) loadMax = { ...h.airdef.load, memMb: h.memMb, rooms: h.airdef.rooms }; } catch (_) { /* нет */ } } }
console.log('  нагрузка сервера в бою:', JSON.stringify(loadMax));
for (let i = 0; i < 40 && !lobbyAgain; i++) await sleep(250);
if (lobbyAgain) { send({ t: 'opts', kind: 'multi', era: 3, mode: 'real' }); await sleep(600); }
// итоги быстрого боя: клиенты очереди ничего не делают — бой идёт сам; ждём их конец (до 2 минут после конца основного)
const qEnd = () => qc.map((c) => c.got.find((m) => m.t === 'end'));
for (let i = 0; i < 240 && !qEnd().every(Boolean); i++) await sleep(500);
const qr = qc.map((c) => c.got.find((m) => m.t === 'room' && m.state !== 'lobby'));
check('быстрый поиск: 4 человека → комната', qr.every(Boolean) && new Set(qr.map((m) => m.code)).size === 1);
check('быстрый поиск: 2 на 2, роли учтены', qr[0] && qr[0].players.filter((p) => p.team === 'air' && !p.bot).length === 2 && qr[0].players.filter((p) => p.team === 'pvo' && !p.bot).length === 2);
check('быстрый поиск: было ожидание «ещё 15 с»', qc.some((c) => c.got.some((m) => m.t === 'qwait')));
check('три волны были', [1, 2, 3].every((w) => waves.has(w)) || (end && end.winner === 'air'));
check('итоги волн', msgs.filter((t) => t === 'waveEnd').length >= 1);
check('конец боя с победителем', end && (end.winner === 'air' || end.winner === 'pvo'));
check('сводка игроков в итогах', end && end.players.length === 4);
check(`после итогов — снова лобби той же комнаты (${lobbyAgain ? lobbyAgain.code : '—'})`, lobbyAgain && lobbyAgain.code === code && lobbyAgain.players.some((p) => p.id === me) && !lobbyAgain.players.find((p) => p.id === me).ready);
check(`в лобби хост сменил игру на «Мульти-волну», эпоху и режим (${lobbyAgain && lobbyAgain.kind}, эп. ${lobbyAgain && lobbyAgain.era}, ${lobbyAgain && lobbyAgain.mode})`, lobbyAgain && lobbyAgain.kind === 'multi' && lobbyAgain.era === 3 && lobbyAgain.mode === 'real' && lobbyAgain.players.find((p) => p.id === me).team === 'west');
check('пинг: сервер отвечает', pong >= 1);
// ── итоги боя для наград и рейтинга ──
{ const R0 = end && end.result ? await readResult(end.result) : null;
  check('итог своей комнаты: подписан, без rt (рейтинг даёт только быстрый бой)', !!R0 && R0.p === PIDS[0] && !('rt' in R0));
  check('итог своей комнаты: нет поля op, есть запечатанное ope (против одних ботов — пустое)', !!R0 && !('op' in R0) && typeof R0.ope === 'string' && (await unseal(R0.ope, SECRET)).length === 0);
  // профиль (sql/029): u.sm — ЗРК, стоявшие в бою (основной клиент ставит «Оса»), u.fl — вылеты по самолётам (у лётчиков очереди)
  check(`итог своей комнаты: u.sm — ЗРК игрока (${R0 && JSON.stringify(R0.u)})`, !!R0 && !!R0.u && Array.isArray(R0.u.sm) && R0.u.sm.includes('osa') && !R0.u.fl);
  const ends = qEnd(); check('быстрый бой: итог пришёл всем четверым', ends.every(Boolean));
  { const R1 = ends[0] && ends[0].result ? await readResult(ends[0].result) : null, n = R1 && R1.u && R1.u.fl ? Object.values(R1.u.fl).reduce((a, v) => a + v, 0) : 0;
    check(`быстрый бой, лётчик: u.fl — вылеты по самолётам (${R1 && JSON.stringify(R1.u)})`, !!R1 && n >= 1 && Object.keys(R1.u.fl).every((k) => typeof k === 'string' && k.length < 20)); }
  for (let i = 0; i < 4; i++) {
    const R = ends[i] && ends[i].result ? await readResult(ends[i].result) : null, mine = PIDS[i + 1], opp = (i < 2 ? [PIDS[3], PIDS[4]] : [PIDS[1], PIDS[2]]).sort();
    const got = R && R.ope ? (await unseal(R.ope, SECRET)).sort() : null;
    check(`быстрый бой, игрок ${i + 1}: есть rt, нет op, ope открывается в двух соперников (не в себя и не в союзника)`, !!R && !!R.rt && typeof R.rt.r === 'number' && !('op' in R) && !!got && JSON.stringify(got) === JSON.stringify(opp) && !got.includes(mine));
    if (R) check(`быстрый бой, игрок ${i + 1}: ope без ключа сервера не читается, id соперников в итоге открытым текстом нет`, (await unseal(R.ope, 'чужой')).length === 0 && !JSON.stringify(R).includes(opp[0]) && !JSON.stringify(R).includes(opp[1]));
  } }
check(`клиентам не уходят id чужих аккаунтов (совпадений: ${leaks})`, leaks === 0);
console.log(`  победила ${end ? end.winner : '?'}, уничтожено ${end ? Math.round(end.valueK * 100) : '?'}%, сбитий ${downs}, записей журнала сбитий ${kills}`);
clearInterval(pinger); srv.kill();
const bad = results.filter(([, ok]) => !ok); console.log(bad.length ? `ИТОГ: ошибок ${bad.length}` : 'ИТОГ: всё прошло'); Deno.exit(bad.length ? 1 : 0);
