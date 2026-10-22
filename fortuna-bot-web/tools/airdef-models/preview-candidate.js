// Превью модели-кандидата в настоящей игре БЕЗ записи в репозиторий — уровень 2 проверок сборщика моделей (чат на Sonnet).
//   deno run -A tools/airdef-models/preview-candidate.js <ключ модели> <файл.glb> [--out папка] [--scenes thumb,plume,hang]
//        [--views side,front,rear] [--weapon ключ] [--era N --lo N] [--tex 512 --ntex 512 — размеры текстур цвета и нормалей у моделей с текстурами] [--seed N — тот же бой для сравнения «было / стало»]
// --out по умолчанию — папка «превью-игра» рядом с glb. Игра берётся из рабочего дерева репозитория как оно сейчас: если страница не открывается,
// вероятно, интегратор в середине правки — повторить позже. Тяжёлый прогон (Chrome с GPU): не запускать одновременно с ui-test у интегратора.
// <ключ модели> — как в prepare.js и models.js (w_kh29t, w_gbu24, …); <файл.glb> — экспорт из Blender (метры, нос в −Z осей glTF).
// Что делает:
// 1. prepare.js с PREPARE_SRC / PREPARE_OUT собирает файл для игры во временной папке — games/airdef/models/ и весь репозиторий не меняются;
// 2. свой сервер файлов репозитория (порт случайный, только чтение) и Chrome без окна; запрос <ключ>.glb подменяется кандидатом;
// 3. снимки → --out (по умолчанию ./превью-игра):
//    игра_миниатюра.webp — как карточка в «Исследованиях»; игра_полёт.jpg — полёт с факелом и шлейфом (стенд weapons-plume);
//    игра_подвеска_бок / _спереди / _сзади .png — режим «Съёмка»: ракета на подвеске самолёта (нужна подвеска с этим оружием в arsenal.js;
//    нет — задать --era N --lo N по LOADOUTS[era][lo]).
// Нужны Google Chrome и deno. Миниатюра и полёт — полминуты, каждый вид подвески — около минуты. В конце — сводка: сколько раз игра взяла
// кандидата (0 — сцена показывает другую модель) и ошибки страницы.
import puppeteer from 'npm:puppeteer-core@22.15.0';
import { serveDir } from 'jsr:@std/http@1.0.9/file-server';

const A = Deno.args, [KEY, FILE] = A;
if (!KEY || !FILE || KEY.startsWith('--')) { console.log('использование: deno run -A preview-candidate.js <ключ модели, напр. w_kh29t> <файл.glb> [--out папка] [--scenes thumb,plume,hang] [--views side,front,rear] [--weapon ключ] [--era N --lo N]'); Deno.exit(1); }
const opt = (n, d) => { const i = A.indexOf('--' + n); return i >= 0 && A[i + 1] !== undefined ? A[i + 1] : d; };
const ROOT = new URL('../../../', import.meta.url).pathname, WEB = ROOT + 'fortuna-bot-web/'; // папка wtm-materials
const SCENES = opt('scenes', 'thumb,plume,hang').split(','), VIEWS = opt('views', 'side,front,rear').split(',');
let FILE_ABS; try { FILE_ABS = await Deno.realPath(FILE); } catch { console.log(`✕ нет файла ${FILE}: сначала выгрузи модель в папку модели (deliver.py / mk.export), потом снимай превью`); Deno.exit(1); }
const OUT = opt('out', FILE_ABS.replace(/\/[^/]*$/, '') + '/превью-игра');   // по умолчанию — рядом с glb, а не в текущей папке (запуск из репозитория ничего туда не положит)
Deno.mkdirSync(OUT, { recursive: true });

// ключ оружия (для миниатюры, стенда и «Съёмки») — из models.js: w_kh29t: { weapon: 'kh29t', … }
const mm = Deno.readTextFileSync(WEB + 'games/airdef/models.js').match(new RegExp(`^\\s*${KEY}: \\{[^}]*weapon: '([^']+)'`, 'm'));
const WEAPON = opt('weapon', mm ? mm[1] : KEY.replace(/^w_/, ''));
console.log(`модель ${KEY}, оружие ${WEAPON}, файл ${FILE_ABS}`);

// 1. файл для игры — во временную папку
const TMP = await Deno.makeTempDir({ prefix: 'preview-' });
const pr = await new Deno.Command(Deno.execPath(), { args: ['run', '-A', WEB + 'tools/airdef-models/prepare.js', KEY], env: { PREPARE_SRC: FILE_ABS, PREPARE_OUT: TMP, ...(opt('tex', '') ? { PREPARE_TEX: opt('tex', '') } : {}), ...(opt('ntex', '') ? { PREPARE_NTEX: opt('ntex', '') } : {}) }, stdout: 'piped', stderr: 'piped' }).output();
const prText = new TextDecoder().decode(pr.stdout) + new TextDecoder().decode(pr.stderr);
console.log(prText.trim().split('\n').slice(-3).join('\n'));
if (!pr.success) { console.log('prepare.js не справился с файлом — превью не снимаю'); Deno.exit(1); }
const GLB = await Deno.readFile(`${TMP}/${KEY}.glb`);

// 2. сервер и Chrome
const srv = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, (req) => serveDir(req, { fsRoot: ROOT, quiet: true }));
const PORT = srv.addr.port, BASE = `http://127.0.0.1:${PORT}/fortuna-bot-web/`;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=2000,1400', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let hits = 0; const report = [], sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(w, h, setup) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h });
  p.errs = []; p.on('pageerror', (e) => p.errs.push('ERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/404|favicon|KTX2/.test(m.text())) p.errs.push('CON ' + m.text()); });
  await p.setRequestInterception(true);
  p.on('request', (r) => { let u; try { u = new URL(r.url()); } catch { return r.continue(); }
    if (u.pathname.endsWith(`/games/airdef/models/${KEY}.glb`)) { hits++; r.respond({ status: 200, contentType: 'model/gltf-binary', headers: { 'access-control-allow-origin': '*' }, body: GLB }); } else r.continue(); });
  if (setup) await p.evaluateOnNewDocument((s) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify(s)); localStorage.setItem('fortuna_airdef_muted', '1'); }, setup);
  return p;
}
const done = async (p, what, file, h0) => { report.push(`${what}: ${hits > h0 ? 'кандидат взят ' + (hits - h0) + ' р.' : 'КАНДИДАТ НЕ ЗАПРАШИВАЛСЯ'} · ${p.errs.length ? p.errs.slice(0, 3).join(' | ') : 'ошибок нет'} · ${file}`); await p.close(); };

// 3. сцены
try {
  if (SCENES.includes('thumb')) {
    const h0 = hits, p = await open(1280, 900);
    await p.goto(`${BASE}tools/airdef-models/thumbs.html?ids=wpn:${WEAPON}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__ok, { timeout: 180000, polling: 500 });
    const th = await p.evaluate(() => window.__thumbs), url = Object.values(th)[0], f = `${OUT}/игра_миниатюра.webp`;
    if (url) Deno.writeFileSync(f, Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)));
    await done(p, 'миниатюра', url ? f : 'нет миниатюры для wpn:' + WEAPON, h0);
  }
  if (SCENES.includes('plume')) {
    const h0 = hits, p = await open(1900, 1300);
    await p.goto(`${BASE}tools/airdef-fx/weapons-plume.html?only=${WEAPON}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__ready, { timeout: 120000, polling: 300 });
    await p.evaluate(() => window.renderSheet(0));
    const el = await p.$('#sheet'), bb = await el.boundingBox(), f = `${OUT}/игра_полёт.jpg`;
    await p.screenshot({ path: f, type: 'jpeg', quality: 86, clip: { x: bb.x, y: bb.y, width: bb.width, height: Math.min(bb.height, 330) } });
    const labels = await p.evaluate(() => window.__labels).catch(() => []);
    if (labels && labels.length) console.log(labels.join('\n'));   // длина, габариты, положение сопла по модели игры
    await done(p, 'полёт', f, h0);
  }
  if (SCENES.includes('hang')) {
    const { LOADOUTS } = await import('file://' + WEB + 'games/airdef/arsenal.js');
    let era = Number(opt('era', 0)), lo = opt('lo') === undefined ? -1 : Number(opt('lo'));
    if (!era || lo < 0) {   // подвеска с этим оружием: поменьше другого оружия, побольше ракет этого вида
      const c = [];
      for (const e of Object.keys(LOADOUTS)) LOADOUTS[e].forEach((L, i) => { const it = (L.items || []).find(([k]) => k === WEAPON); if (it && !L.heli) c.push({ era: +e, lo: i, n: it[1], other: L.items.length, name: L.name }); });
      c.sort((x, y) => x.other - y.other || y.n - x.n || x.era - y.era);
      if (c.length) { era = c[0].era; lo = c[0].lo; console.log(`подвеска: эпоха ${era}, номер ${lo} — ${c[0].name}`); }
    }
    if (!era || lo < 0) report.push(`подвеска: в arsenal.js нет подвески с оружием ${WEAPON} — сцена пропущена (задай --era N --lo N)`);
    else {
      const SH = { side: ['бок', { az: 0.3, el: 0.05, k: 1.2 }], front: ['спереди', { az: 1.3, el: -0.25, k: 1.0 }], rear: ['сзади', { az: 2.4, el: -0.12, k: 1.4 }] };
      for (const v of VIEWS) {
        if (!SH[v]) continue;
        const h0 = hits, setup = { game: 'photo', diff: 'arcade', pside: 'air', era, side: 'west', lo, palt: 'mid', pmap: 'city' }, shot = { s: WEAPON, a: 'side', ...SH[v][1], t: 8, max: 200 };
        const p = await open(1400, 800, setup);
        await p.goto(`${BASE}games/airdef.html?go=photo&gfx=high&test=1&weather=day&shot=${encodeURIComponent(JSON.stringify(shot))}${opt('seed', '') ? '&seed=' + opt('seed', '') : ''}`, { waitUntil: 'load', timeout: 120000 });
        await p.waitForFunction(() => window.__shot === 'ready' || window.__shot === 'timeout', { timeout: 300000, polling: 500 });
        await sleep(4000);
        const f = `${OUT}/игра_подвеска_${SH[v][0]}.png`; await p.screenshot({ path: f });
        await done(p, `подвеска (${SH[v][0]})`, f, h0);
      }
    }
  }
} finally {
  await b.close(); await srv.shutdown(); await Deno.remove(TMP, { recursive: true }).catch(() => {});
}
console.log('\n=== сводка ===\n' + report.join('\n'));
