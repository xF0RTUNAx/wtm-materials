// Автопроверка полного онлайн-боя «Воздушного превосходства» (три волны до итогов) с короткими фазами (AD_FAST=1):
//   deno run --allow-net --allow-read --allow-env --allow-run game-server/airdef-full.js
// Человек за ПВО в комнате 2×2 с ботами (у него бот-союзник, против — два бота-лётчика); ставит комплекс, жмёт «Готов».
// Ждём: три волны, итоги каждой, конец боя с победителем и сводкой игроков. PASS/FAIL.
const PORT = 8796;
const srv = new Deno.Command('deno', { args: ['run', '--allow-net', '--allow-read', '--allow-env', new URL('./server.js', import.meta.url).pathname],
  env: { PORT: String(PORT), HOST: '127.0.0.1', AD_FAST: '1' }, stdout: 'piped', stderr: 'piped' }).spawn();
const results = []; const check = (n, ok) => { results.push([n, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 40; i++) { try { ws = new WebSocket(`ws://127.0.0.1:${PORT}/ad`); await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; }); break; } catch (_) { await sleep(250); } }
const msgs = []; let me = 0, waves = new Set(), end = null, kills = 0, downs = 0;
const send = (m) => ws.send(JSON.stringify(m));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data); msgs.push(m.t);
  if (m.t === 'welcome') { me = m.id; send({ t: 'create', mode: 'arcade', size: 2, era: 3, sideAir: 'west', team: 'pvo', fill: true }); }
  if (m.t === 'room' && m.state === 'lobby' && !m.players.find((p) => p.id === me).ready) send({ t: 'ready', on: true });
  if (m.t === 'room' && m.state === 'plan') { waves.add(m.wave); for (let i = 0; i < 12; i++) send({ t: 'buyUnit', k: 'osa', x: 400 + (i % 4) * 160, z: -500 + Math.floor(i / 4) * 160 }); send({ t: 'ready', on: true }); }
  if (m.t === 'waveEnd') console.log(`  волна ${m.wave}: ${m.why}, уничтожено ${Math.round(m.totalK * 100)}%, сбито ${m.downs}`);
  if (m.t === 's' && m.e) for (const e2 of m.e) { if (e2[0] === 'kl') { kills++; console.log('  журнал:', e2.slice(1).join(' · ')); } if (e2[0] === 'dn') downs++; }
  if (m.t === 'end') end = m;
};
send({ t: 'hello', name: 'зенитчик', pid: 'test-full' });
// быстрый поиск: ещё четверо в очереди «Реализма» (двое — авиация, двое — любая) → комната 2 на 2 без ботов
const qc = [];
for (const [i, role] of [[1, 'air'], [2, 'air'], [3, 'any'], [4, 'any']].map(([i, r]) => [i, r])) {
  const w = new WebSocket(`ws://127.0.0.1:${PORT}/ad`); await new Promise((ok) => (w.onopen = ok)); const c = { w, got: [] };
  w.onmessage = (e) => { const m = JSON.parse(e.data); c.got.push(m); if (m.t === 'welcome') w.send(JSON.stringify({ t: 'queue', mode: 'real', role })); };
  w.send(JSON.stringify({ t: 'hello', name: 'очередь' + i, pid: 'test-q' + i })); qc.push(c);
}
for (let i = 0; i < 300 && !end; i++) await sleep(500);
const qr = qc.map((c) => c.got.find((m) => m.t === 'room' && m.state !== 'lobby'));
check('быстрый поиск: 4 человека → комната', qr.every(Boolean) && new Set(qr.map((m) => m.code)).size === 1);
check('быстрый поиск: 2 на 2, роли учтены', qr[0] && qr[0].players.filter((p) => p.team === 'air' && !p.bot).length === 2 && qr[0].players.filter((p) => p.team === 'pvo' && !p.bot).length === 2);
check('быстрый поиск: было ожидание «ещё 15 с»', qc.some((c) => c.got.some((m) => m.t === 'qwait')));
check('три волны были', [1, 2, 3].every((w) => waves.has(w)) || (end && end.winner === 'air'));
check('итоги волн', msgs.filter((t) => t === 'waveEnd').length >= 1);
check('конец боя с победителем', end && (end.winner === 'air' || end.winner === 'pvo'));
check('сводка игроков в итогах', end && end.players.length === 4);
console.log(`  победила ${end ? end.winner : '?'}, уничтожено ${end ? Math.round(end.valueK * 100) : '?'}%, сбитий ${downs}, записей журнала сбитий ${kills}`);
srv.kill();
const bad = results.filter(([, ok]) => !ok); console.log(bad.length ? `ИТОГ: ошибок ${bad.length}` : 'ИТОГ: всё прошло'); Deno.exit(bad.length ? 1 : 0);
