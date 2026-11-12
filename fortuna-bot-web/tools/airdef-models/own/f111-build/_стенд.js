// _стенд.js - кадры F-4 в настоящей игре на ?paint=1 без записи в репозиторий: своя копия подхода preview-candidate.js (свой сервер файлов, подмена f16.glb кандидатом).
//   deno run -A _стенд.js <файл.glb> --out папка --tex 2048 --ntex 2048 [--scenes hangar,battle] [--wx day,evening] [--views side,front,rear] [--seed 7] [--paint 1]
import puppeteer from 'npm:puppeteer-core@22.15.0';
import { serveDir } from 'jsr:@std/http@1.0.9/file-server';
const A = Deno.args, FILE = A[0], KEY = 'e_f111', PREP = 'e_f15e', PREPG = 'e_f15e_gear';
const opt = (n, d) => { const i = A.indexOf('--' + n); return i >= 0 && A[i + 1] !== undefined ? A[i + 1] : d; };
const ROOT = '/Users/mark./wtm-materials/', WEB = ROOT + 'fortuna-bot-web/';
const FILE_ABS = await Deno.realPath(FILE), OUT = opt('out', FILE_ABS.replace(/\/[^/]*$/, '') + '/стенд'), PAINT = opt('paint', '1');
Deno.mkdirSync(OUT, { recursive: true });
const TMP = await Deno.makeTempDir({ prefix: 'se-stand-' });
const pr = await new Deno.Command(Deno.execPath(), { args: ['run', '-A', WEB + 'tools/airdef-models/prepare.js', PREP], env: { PREPARE_SRC: FILE_ABS, PREPARE_OUT: TMP, PREPARE_TEX: opt('tex', '2048'), PREPARE_NTEX: opt('ntex', '2048') }, stdout: 'piped', stderr: 'piped' }).output();
const prText = new TextDecoder().decode(pr.stdout) + new TextDecoder().decode(pr.stderr); console.log(prText.trim().split('\n').slice(-3).join('\n'));
if (!pr.success) Deno.exit(1);
const GLB = await Deno.readFile(`${TMP}/${PREP}.glb`);
{ const dv = new DataView(GLB.buffer, GLB.byteOffset); const n = dv.getUint32(12, true); const j = JSON.parse(new TextDecoder().decode(GLB.subarray(20, 20 + n)));
  console.log('в файле игры: материалов', j.materials.length, 'картинок', (j.images || []).length, 'карта блеска:', j.materials.filter((m) => m.pbrMetallicRoughness && m.pbrMetallicRoughness.metallicRoughnessTexture).length, 'нормали:', j.materials.filter((m) => m.normalTexture).length, j.materials.map((m) => m.name).join(', ')); }
// файл шасси для ангара: рядом с основным, тоже через prepare
const GEARF = FILE_ABS.replace(/f111\.glb$/, 'f111_gear.glb'); let GLB2 = null;
try { await Deno.stat(GEARF); const TMP2 = await Deno.makeTempDir({ prefix: 'se-gear-' });
  const p2 = await new Deno.Command(Deno.execPath(), { args: ['run', '-A', WEB + 'tools/airdef-models/prepare.js', PREPG], env: { PREPARE_SRC: GEARF, PREPARE_OUT: TMP2, PREPARE_TEX: opt('tex', '2048'), PREPARE_NTEX: opt('ntex', '2048') }, stdout: 'piped', stderr: 'piped' }).output();
  console.log('шасси:', (new TextDecoder().decode(p2.stdout) + new TextDecoder().decode(p2.stderr)).trim().split('\n').slice(-2).join(' | '));
  if (p2.success) GLB2 = await Deno.readFile(`${TMP2}/${PREPG}.glb`); await Deno.remove(TMP2, { recursive: true }).catch(() => {});
} catch (e) { console.log('шасси нет:', e.message); }
const PTS = JSON.parse(await Deno.readTextFile(FILE_ABS.replace(/f111\.glb$/, 'точки.json')));
const srv = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, (req) => serveDir(req, { fsRoot: ROOT, quiet: true }));
const BASE = `http://127.0.0.1:${srv.addr.port}/fortuna-bot-web/`;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=2000,1400', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let hits = 0; const report = [], sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(w, h, setup) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h });
  p.errs = []; p.on('pageerror', (e) => p.errs.push('ERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/404|favicon|KTX2/.test(m.text())) p.errs.push('CON ' + m.text()); });
  p.on('response', (x) => { if (x.status() >= 500) p.errs.push('HTTP ' + x.status() + ' ' + x.url().slice(0, 140)); });
  await p.setRequestInterception(true);
  p.on('request', (r) => { let u; try { u = new URL(r.url()); } catch { return r.continue(); }
    if (/f111/.test(u.pathname) && Deno.env.get('F111_LOG')) console.log('запрос', u.host, u.pathname);
    if (u.pathname.endsWith('/models/ktx/index.json')) { fetch(r.url()).then((x) => x.json()).then((j) => { delete j[KEY]; delete j.e_f111_gear; r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(j) }); }).catch(() => r.continue()); return; }
    if (u.pathname.endsWith('/games/airdef/models.js')) { fetch(r.url()).then((x) => x.text()).then((t) => { const T0 = t; // до подмены: у ключа e_f111 свои стёкла, шасси, точки; версия другая, чтобы таблица посадки старой модели не применялась
        t = t.replace(/  e_f111: \{ side: 'west', cls: 'strike', lazy: true, stations: mirror\(\[[^\n]*\n[^\n]*nozzles: [^\n]*\n/, () => `  e_f111: { side: 'west', cls: 'strike', lazy: true, stations: mirror([${PTS.stations.map((p) => `V(${-Math.abs(p[0])},${p[1]},${p[2]})`).join(',')}]),\n    nozzles: [${PTS.nozzles.map((p) => `V(${p.join(',')})`).join(', ')}], nr: ${PTS.nr}, pod: V(${PTS.pod.join(',')}), clearGlass: true, ...(paintOn ? { gearModel: 'e_f111_gear' } : {}) },\n`);
        t = t.replace('function seatRec(plane) {', "function seatRec(plane) { if (plane === 'e_f111') return null;");
        t = t.replace("if (paintOn) META.e_f15e_gear =", "GLB_V.e_f111 = '20261112s'; GLB_V.e_f111_gear = '20261112s'; if (paintOn) META.e_f111_gear = { lazy: true, matte: true, paint: true, stations: [] };\nif (paintOn) META.e_f15e_gear =");
        if (t === T0) console.log('models.js не изменён'); r.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: t }); }).catch(() => r.continue()); return; }
    if (GLB2 && u.pathname.endsWith('/games/airdef/models/e_f111_gear.glb')) { r.respond({ status: 200, contentType: 'model/gltf-binary', headers: { 'access-control-allow-origin': '*' }, body: GLB2 }); return; }
    if (u.pathname.endsWith(`/games/airdef/models/${KEY}.glb`) || u.pathname.endsWith(`/games/airdef/models/camo/${KEY}.hi.glb`)) { hits++; r.respond({ status: 200, contentType: 'model/gltf-binary', headers: { 'access-control-allow-origin': '*' }, body: GLB }); } else r.continue(); });
  if (setup) await p.evaluateOnNewDocument((s) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify(s)); localStorage.setItem('fortuna_airdef_muted', '1'); }, setup);
  return p;
}
const SCENES = opt('scenes', 'battle').split(','), WX = opt('wx', 'day,evening').split(','), VIEWS = opt('views', 'side,front,rear').split(',');
const { LOADOUTS } = await import('file://' + WEB + 'games/airdef/arsenal.js');
let era = 0, lo = -1; for (const e of Object.keys(LOADOUTS)) LOADOUTS[e].forEach((L, i) => { if (L.plane === KEY && !era) { era = +e; lo = i; } });
const L0 = LOADOUTS[era][lo], WEAPON = opt('weapon', L0.items[0][0]), defSide = L0.side === 'west' ? 'east' : 'west'; console.log('подвеска', era, lo, L0.name, 'объект съёмки', WEAPON);
const setup = { game: 'photo', diff: 'arcade', pside: 'air', era, side: defSide, lo, palt: 'mid', pmap: 'city' };
try {
  if (SCENES.includes('hangar')) for (const wx of WX.slice(0, 1)) {
    const h0 = hits, p = await open(1600, 900, { ...setup, game: 'air' });
    await p.goto(`${BASE}games/airdef.html?test=1&gfx=high&paint=${PAINT}&weather=${wx}`, { waitUntil: 'load', timeout: 120000 });
    await sleep(Number(opt('hwait', 25000))); await p.screenshot({ path: `${OUT}/ангар_1.png` });
    report.push(`ангар: кандидат ${hits - h0} р.; ${p.errs.slice(0, 3).join(' | ') || 'ошибок нет'}`);
    // поворот самолёта мышью
    await p.mouse.move(650, 500); await p.mouse.down(); for (let i = 1; i <= 12; i++) { await p.mouse.move(650 + i * 28, 500); await sleep(30); } await p.mouse.up(); await sleep(1500); await p.mouse.move(640, 420); for (let i = 0; i < 10; i++) { await p.mouse.wheel({ deltaY: -120 }); await sleep(60); } await sleep(2500); await p.screenshot({ path: `${OUT}/ангар_2.png` });
    await p.close();
  }
  if (SCENES.includes('battle')) {
    const SH = { side: ['бок', { a: 'side', k: 0.5, f: 30 }], front: ['спереди', { a: 'front', k: 0.5, f: 30 }], rear: ['сзади', { a: 'chase', k: 0.5, f: 30 }], top: ['сверху', { a: 'top', k: 0.5, f: 32 }], below: ['снизу', { a: 'below', k: 0.7, f: 30 }], orbit: ['три_четверти', { a: 'orbit', az: 0.75, el: 0.1, k: 0.5, f: 30 }], graze: ['косо', { a: 'chase', el: -0.08, k: 0.5, f: 30 }], nose: ['нос', { a: 'front', k: 0.32, f: 20 }], tail: ['хвост', { a: 'chase', k: 0.32, f: 20 }], tail2: ['хвост_низко', { a: 'chase', el: -0.1, az: 0.35, k: 0.3, f: 18 }] };
    for (const wx of WX) for (const v of VIEWS) {
      const h0 = hits, shot = { s: 'ship', ...SH[v][1], t: 8, max: 200 }, p = await open(1600, 900, setup);
      await p.goto(`${BASE}games/airdef.html?go=photo&gfx=high&test=1&paint=${PAINT}&weather=${wx}&seed=${opt('seed', '7')}&shot=${encodeURIComponent(JSON.stringify(shot))}`, { waitUntil: 'load', timeout: 120000 });
      await p.waitForFunction(() => window.__shot === 'ready' || window.__shot === 'timeout', { timeout: 300000, polling: 500 });
      await sleep(4000); const f = `${OUT}/бой_${wx}_${SH[v][0]}.png`; await p.screenshot({ path: f });
      report.push(`бой ${wx} ${v}: кандидат ${hits - h0} р.; ${p.errs.slice(0, 3).join(' | ') || 'ошибок нет'}`); await p.close();
    }
  }
} finally { await b.close(); await srv.shutdown(); await Deno.remove(TMP, { recursive: true }).catch(() => {}); }
console.log(report.join('\n'));
