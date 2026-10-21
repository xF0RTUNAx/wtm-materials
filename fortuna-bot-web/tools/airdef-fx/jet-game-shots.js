// Пламя реактивных двигателей в настоящей игре → tools/airdef-fx/shots/jet-game-<сцена>.png, к/с и ошибки страницы
//   deno run -A tools/airdef-fx/jet-game-shots.js [сцена …] [--old]
// сцены: air-high, air-medium (свой самолёт: газ, потом форсаж), defense (ИИ-самолёты в обороне), photo («Съёмка»), phone (?touch=1, 844×390)
// --old — вместо units-render.js отдать прежний (до запечённого пламени, коммит 0eeadbc): сравнить к/с (shots/jet-game-*-old.png)
// Сервер :8935 уже запущен (корень — wtm-materials), Google Chrome; тяжело для Mac — на зарядке.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const ROOT = new URL('./shots/', import.meta.url).pathname, PORT = Deno.env.get('PORT') || '8935';
const OLD = Deno.args.includes('--old'), want = Deno.args.filter((a) => !a.startsWith('--'));
const photoSetup = { game: 'photo', diff: 'arcade', pside: 'air', era: 4, side: 'west', lo: 0, palt: 'low' }; // как кадры capture.js
const SCENES = {
  'air-high': { q: 'go=air&gfx=high&test=1&weather=day', w: 1600, h: 900, wait: 9, ab: true },
  'air-medium': { q: 'go=air&gfx=medium&test=1&weather=day', w: 1600, h: 900, wait: 9, ab: true },
  defense: { q: 'go=defense&gfx=high&test=1&weather=day', w: 1600, h: 900, wait: 5, wave: true, after: 30 },
  photo: { q: `go=photo&gfx=high&test=1&weather=day&shot=${encodeURIComponent(JSON.stringify({ s: 'ship', a: 'chase', az: 0.35, el: 0.12, k: 0.8, t: 30 }))}`, w: 1600, h: 900, wait: 40, setup: photoSetup, shot: true },
  phone: { q: 'go=air&gfx=medium&touch=1&test=1&weather=day', w: 844, h: 390, wait: 9, ab: true },
};
let oldSrc = null;
if (OLD) oldSrc = new TextDecoder().decode(new Deno.Command('git', { args: ['show', '0eeadbc:fortuna-bot-web/games/airdef/units-render.js'], stdout: 'piped' }).outputSync().stdout);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1700,1000', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
for (const name of want.length ? want : Object.keys(SCENES)) {
  const S = SCENES[name]; if (!S) { console.log('нет сцены', name); continue; }
  const p = await b.newPage(); await p.setViewport({ width: S.w, height: S.h });
  const errs = []; p.on('pageerror', (e) => errs.push('ERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) errs.push('CON ' + m.text()); });
  if (OLD) { await p.setRequestInterception(true); p.on('request', (r) => (/\/units-render\.js/.test(r.url()) ? r.respond({ status: 200, contentType: 'text/javascript', body: oldSrc }) : r.continue())); }
  await p.evaluateOnNewDocument((s) => { localStorage.setItem('fortuna_airdef_muted', '1'); if (s) localStorage.setItem('fortuna_airdef_setup', JSON.stringify(s)); }, S.setup || null);
  await p.goto(`http://localhost:${PORT}/fortuna-bot-web/games/airdef.html?${S.q}`, { waitUntil: 'load' });
  if (S.shot) await p.waitForFunction(() => window.__shot === 'ready' || window.__shot === 'timeout', { timeout: 300000, polling: 500 }).catch(() => {});
  await new Promise((r) => setTimeout(r, S.wait * 1000));
  if (S.wave) { await p.evaluate(() => { const C = window.__a, t = C.S.objects.find((o) => o.key === 'tpp'); for (const [k, dx] of [['osa', 500], ['m163', 300]]) { const u = C.S.addUnit(k, t.x + dx, t.z + 200, {}); u.paid = 100; } C.syncUnits(); C.ctrl.startWave(); }); await new Promise((r) => setTimeout(r, S.after * 1000)); await p.evaluate(() => { const C = window.__a; C.ctrl.enterOp(C.S.units[0]); }); await new Promise((r) => setTimeout(r, 6000)); }   // оборона: два комплекса и «В БОЙ» (как ui-test), ждём налёт и садимся оператором в комплекс (вид 3D)
  if (S.ab) { await p.keyboard.press('ShiftLeft'); await new Promise((r) => setTimeout(r, 3500)); }   // форсаж: ShiftLeft переключает верхнюю ступень газа
  const fps = await p.evaluate(() => new Promise((ok) => { let n = 0, t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 5000) ok(Math.round(n / ((performance.now() - t0) / 1000))); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  const f = `${ROOT}jet-game-${name}${OLD ? '-old' : ''}.png`; await p.screenshot({ path: f });
  console.log(`${name}${OLD ? ' (старое пламя)' : ''}: к/с ${fps} · ${errs.length ? errs.slice(0, 5).join(' | ') : 'ошибок нет'} · ${f}`);
  await p.close();
}
await b.close();
