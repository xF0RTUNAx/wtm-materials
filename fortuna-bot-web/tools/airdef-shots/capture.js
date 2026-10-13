// Кадры фона главного меню «Воздушного превосходства» → games/airdef/shots/*.webp и shots.js (menubg.js).
// Снимает Chrome без окна (на видеокарте Мака) режимом «Съёмка» с параметром ?shot=…: объект, ракурс, подстройка, поле
// зрения, сколько секунд боя ждать; игра сама ставит стоп-кадр и сообщает window.__shot = 'ready'.
//   deno run -A fortuna-bot-web/tools/airdef-shots/capture.js [имя кадра …]      (без имён — все)
// Файлы игры отдаёт сам скрипт (порт 8943); нужны Google Chrome и cwebp (brew install webp).
import puppeteer from 'npm:puppeteer-core@22.15.0';
import { serveDir } from 'jsr:@std/http@1.0.9/file-server';

const ROOT = new URL('../../../', import.meta.url).pathname; // папка wtm-materials
const OUT = new URL('../../games/airdef/shots/', import.meta.url).pathname;
const PORT = 8943, W = 1600, H = 900; // графика — «cinema» (предел «Ультра»: дома и деревья моделями на километры, MSAA, без динамического разрешения)
// setup — настройки «Съёмки» (как в меню), w — погода, shot — объект (s), ракурс (a), az/el/k, поле зрения f, ждать t с (max — предел)
const SHOTS = [
  { f: 'su34-kh59', t: ['air'], w: 'morning', setup: { pside: 'air', era: 4, side: 'west', lo: 0, palt: 'mid' }, shot: { s: 'kh59m', a: 'side', az: 0.25, el: 0.05, k: 1.1, t: 30 } },
  { f: 'f16-front', t: ['air'], w: 'day', setup: { pside: 'air', era: 4, side: 'east', lo: 7, palt: 'low' }, shot: { s: 'ship', a: 'side', az: 0.3, el: 0.25, k: 0.7, t: 70 } },
  { f: 'su30-top', t: ['air'], w: 'morning', setup: { pside: 'air', era: 4, side: 'west', lo: 1, palt: 'low' }, shot: { s: 'ship', a: 'top', az: 0.3, el: -0.3, k: 0.8, t: 75 } },
  { f: 'sam-chase', t: ['air', 'pvo'], w: 'day', setup: { pside: 'air', era: 3, side: 'east', lo: 4, palt: 'low' }, shot: { s: 'sam', a: 'chase', az: 0.35, el: 0.15, k: 1.3, t: 6, max: 200 } },
  { f: 's400-unit', t: ['pvo'], w: 'evening', setup: { pside: 'def', era: 4, side: 'east', psam: 's400', pvs: 'air' }, shot: { s: 'msl', a: 'side', az: 0.35, el: 0.12, k: 1.5, t: 4, max: 200 } },
  { f: 'patriot-launch', t: ['pvo'], w: 'day', setup: { pside: 'def', era: 3, side: 'west', psam: 'patriot', pvs: 'air' }, shot: { s: 'msl', a: 'side', az: 0.3, el: 0.12, k: 1.6, t: 4, max: 200 } },
  { f: 'pantsir-side', t: ['pvo'], w: 'day', setup: { pside: 'def', era: 4, side: 'east', psam: 'pantsir', pvs: 'air' }, shot: { s: 'unit', a: 'front', az: 0.2, el: 0.12, k: 1.25, t: 3 } },
  { f: 'tor-launch', t: ['pvo'], w: 'day', setup: { pside: 'def', era: 4, side: 'east', psam: 'torm2', pvs: 'multi' }, shot: { s: 'msl', a: 'side', az: 0.2, el: 0.15, k: 1.6, t: 4, max: 200 } },
  { f: 'iskander-launcher', t: ['multi'], w: 'evening', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'iskander' }, shot: { s: 'src', a: 'side', az: 0.6, el: 0.1, k: 0.75, t: 14 } },
  { f: 'iskander-flight', t: ['multi'], w: 'day', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'iskander' }, shot: { s: 'mun', a: 'chase', az: 0.3, el: 0.05, k: 1.4, t: 6, max: 120 } },
  { f: 'tu160-kh555', t: ['multi'], w: 'sunset', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'kh555' }, shot: { s: 'src', a: 'side', az: 0.45, el: 0.12, k: 1.0, t: 20, max: 160 } },
  { f: 'mig31-kinzhal', t: ['multi'], w: 'sunset', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'kinzhal' }, shot: { s: 'src', a: 'side', az: 0.35, el: 0.08, k: 1.0, t: 25, max: 200 } }, // вместо «Шахеда» (решение Mark)
];

const want = new Set(Deno.args);
const server = Deno.serve({ port: PORT, hostname: '127.0.0.1', onListen() {} }, (req) => serveDir(req, { fsRoot: ROOT, quiet: true }));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required'] });
const done = [];
for (const s of SHOTS) {
  if (want.size && !want.has(s.f)) continue;
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 }); // кадр 3200×1800 → 1920×1080 (чётче, чем сразу)
  await page.evaluateOnNewDocument((setup) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'photo', diff: 'arcade', ...setup })); localStorage.setItem('fortuna_airdef_muted', '1'); }, s.setup);
  const url = `http://127.0.0.1:${PORT}/fortuna-bot-web/games/airdef.html?go=photo&gfx=cinema&weather=${s.w}&shot=${encodeURIComponent(JSON.stringify(s.shot))}`;
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__shot === 'ready' || window.__shot === 'timeout', { timeout: 420000, polling: 500 });
    const res = await page.evaluate(() => window.__shot);
    const png = `${OUT}${s.f}.png`;
    await page.screenshot({ path: png });
    const ff = new Deno.Command('cwebp', { args: ['-quiet', '-q', '74', '-m', '6', '-resize', '1920', '1080', png, '-o', `${OUT}${s.f}.webp`] }).outputSync();
    Deno.removeSync(png);
    const kb = Math.round(Deno.statSync(`${OUT}${s.f}.webp`).size / 1024);
    console.log(`${s.f}: ${res} · ${Math.round((Date.now() - t0) / 1000)} с · ${kb} КБ${ff.success ? '' : ' · cwebp ✕'}`);
    if (res === 'ready') done.push(s); else Deno.removeSync(`${OUT}${s.f}.webp`);
  } catch (e) { console.log(`${s.f}: ошибка — ${e.message}`); }
  await page.close();
}
await browser.close(); await server.shutdown();
// список для меню: прежние кадры (если снимали не все) + новые
const prev = (() => { try { const m = Deno.readTextFileSync(`${OUT}shots.js`).match(/SHOTS = (\[[\s\S]*\]);/); return m ? JSON.parse(m[1]) : []; } catch (_) { return []; } })();
const all = [...prev.filter((p) => !done.some((d) => d.f + '.webp' === p.f)), ...done.map((d) => ({ f: d.f + '.webp', t: d.t }))].filter((p) => { try { Deno.statSync(OUT + p.f); return true; } catch (_) { return false; } });
Deno.writeTextFileSync(`${OUT}shots.js`, `// Кадры фона главного меню (menubg.js): f — файл в этой папке, t — метки режима (air, pvo, multi). Список пишет\n// tools/airdef-shots/capture.js; пустой — фон меню остаётся живым боем (director.js)\nexport const SHOTS = ${JSON.stringify(all, null, 0)};\n`);
console.log(`кадров в меню: ${all.length}`);
