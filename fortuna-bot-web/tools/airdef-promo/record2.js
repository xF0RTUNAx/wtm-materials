// Промо-ролик «Воздушного превосходства», выпуск 2 (Mark 2026-10-27: «красота графики, геймплей, разнообразие», максимальная графика без упрощений).
// Сцены снимает режим «Съёмка» (?shot={…, rec: 1}): объект, ракурс, погода, карта — как кадры меню (tools/airdef-shots/capture.js), но без стоп-кадра:
// игра встаёт, когда объект в кадре, стенд ждёт модели и текстуры, затем шагает время сам (60 к/с, кадр 3840×2160 — окно 1280×720 ×3),
// снимает холст после каждого шага (JPEG 0,96) → <папка>/<NN-сцена>/00000.jpg. Графика — «Кино», без запекания земли и ленивых выборок, дома и деревья — полными моделями на всю карту (?full=1).
//   deno run -A fortuna-bot-web/tools/airdef-promo/record2.js <папка кадров> [--par=N] [номер или имя сцены …]
//   python3 fortuna-bot-web/tools/airdef-promo/encode2.py <папка кадров> <куда> — сборка (растворы, финальная карточка, 1080p60 и 720p30 для сайта)
// Нужен Google Chrome; файлы игры и приём кадров — сам скрипт (порт 8944).
import puppeteer from 'npm:puppeteer-core@22.15.0';
import { serveDir } from 'jsr:@std/http@1.0.9/file-server';
import { encodeBase64 } from 'jsr:@std/encoding@1.0.5/base64';

const ROOT = new URL('../../../', import.meta.url).pathname; // wtm-materials
const PORT = 8944, W = 1280, H = 720, FPS = 60;
const OUT = Deno.args.find((a) => !a.startsWith('--') && /[/.]/.test(a)) || '/tmp/airdef-promo2';
const PAR = Math.max(1, +((Deno.args.find((a) => a.startsWith('--par=')) || '--par=1').slice(6)) || 1);

// сцена: m — карта, w — погода, setup — настройки «Съёмки», shot — объект и ракурс (rec: 1 — запись; sp — скорость 0 ×1, 1 ×½, 2 ×¼),
// dur — секунд ролика, fire — на каких секундах нажать «Пуск» (F), cap — что в кадре (для списка), q — добавка к адресу (окраска: &camo=…)
const A = (era, side, lo, palt = 'low') => ({ pside: 'air', era, side, lo, palt }), D = (era, side, psam, pvs = 'air') => ({ pside: 'def', era, side, psam, pvs }), M = (era, side, pmun) => ({ pside: 'multi', era, side, pmun });
export const SCENES = [
  { id: 's400-launch', m: 'city', w: 'evening', cap: 'Пуск С-400 над городом, замедленно', setup: D(4, 'east', 's400'), shot: { s: 'msl', a: 'side', az: 0.35, el: 0.1, k: 1.5, t: 4, max: 200, sp: 1 }, dur: 5 },
  { id: 'su34-kh59m', m: 'city', w: 'sunset', cap: 'Су-34: Х-59М на подвеске → пуск', setup: A(4, 'west', 0), shot: { s: 'ship', a: 'side', az: 0.3, el: -0.06, k: 0.7, t: 30, max: 200 }, dur: 5, fire: [2.2] }, // камера — на самолёте (на подвеске она у сопла, в пламени форсажа), пуск Х-59М виден сбоку
  { id: 'mig31-kinzhal', m: 'winter', w: 'w_clear', cap: 'МиГ-31К с «Кинжалом» над Северным рубежом', setup: M(4, 'west', 'kinzhal'), shot: { s: 'src', a: 'chase', az: 0.35, el: 0.05, k: 0.9, t: 20, max: 200 }, dur: 5 },
  { id: 'su34-hud', m: 'city', w: 'morning', cap: 'Геймплей: Су-34 с интерфейсом боя, пуск Х-59М', setup: A(4, 'west', 0), shot: { s: 'ship', a: 'lock', t: 30, max: 200, hud: 1 }, dur: 5, fire: [1.5] },
  { id: 'ka52-eve', m: 'autumn', w: 'a_eve', cap: 'Ка-52 над Туманной топью', setup: D(4, 'west', 'pac3'), shot: { s: 'heli', a: 'orbit', az: 0.3, el: -0.05, k: 0.6, t: 110, max: 400 }, dur: 5 },
  { id: 'f15e-inferno', m: 'city', w: 'sunset', cap: 'Окраска из «Витрины»: F-15E «Инферно», облёт', q: '&camo=e_f15e:inferno', setup: A(3, 'east', 8), shot: { s: 'ship', a: 'orbit', az: 0.3, el: -0.3, k: 0.55, t: 30 }, dur: 5 }, // снизу — на фоне неба
  { id: 'mig31-dragon', m: 'winter', w: 'w_clear', cap: 'Окраска из «Витрины»: МиГ-31БМ «Нефритовый дракон» сверху', q: '&camo=e_mig31:dragon', setup: A(4, 'west', 2), shot: { s: 'ship', a: 'lock', az: 0, el: 0.95, k: 0.6, t: 30 }, seed: 3, dur: 4 },
];

const want = new Set(Deno.args.filter((a) => !a.startsWith('--') && a !== OUT));
const LIST = SCENES.map((s, i) => ({ ...s, n: i + 1, dir: `${String(i + 1).padStart(2, '0')}-${s.id}` })).filter((s) => !want.size || want.has(String(s.n)) || want.has(s.id));

const server = Deno.serve({ port: PORT, hostname: '127.0.0.1', onListen() {} }, async (req) => {
  const u = new URL(req.url);
  if (req.method === 'POST' && u.pathname === '/__frame') { // кадр со страницы
    const d = (u.searchParams.get('d') || 'x').replace(/[^a-z0-9_-]/gi, ''), n = (u.searchParams.get('n') || '0').replace(/\D/g, '');
    await Deno.mkdir(`${OUT}/${d}`, { recursive: true });
    await Deno.writeFile(`${OUT}/${d}/${n.padStart(5, '0')}.jpg`, new Uint8Array(await req.arrayBuffer()));
    return new Response('ok');
  }
  if (u.pathname === '/__blank') return new Response('<!doctype html><title>card</title>', { headers: { 'content-type': 'text/html' } });
  return serveDir(req, { fsRoot: ROOT, quiet: true });
});
const launch = () => puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 1800000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function record(s, browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 3 }); // 3840×2160 → 1920×1080: мелкие модели вдали без «крупы» (?full=1 даёт ×3)
  const setup = { game: 'photo', diff: 'arcade', ...s.setup, pmap: s.m };
  await page.evaluateOnNewDocument((setup) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify(setup)); localStorage.setItem('fortuna_airdef_muted', '1'); }, setup);
  const shot = { ...s.shot, rec: 1 };
  const url = `http://127.0.0.1:${PORT}/fortuna-bot-web/games/airdef.html?go=photo&gfx=cinema&test=1&gb=0&cl=0&fac=0&full=1&still=0&weather=${s.w}${s.q || ''}${s.seed ? `&seed=${s.seed}` : ''}&shot=${encodeURIComponent(JSON.stringify(shot))}`;
  const t0 = Date.now(), pend = new Set();
  page.on('request', (r) => { if (!/^(blob|data):/.test(r.url())) pend.add(r); });
  for (const e of ['requestfinished', 'requestfailed']) page.on(e, (r) => pend.delete(r));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__shot === 'ready' || window.__shot === 'timeout', { timeout: 600000, polling: 500 });
    if ((await page.evaluate(() => window.__shot)) !== 'ready') throw new Error('объект не появился');
    for (let q = 0, t = Date.now(); q < 3 && Date.now() - t < 90000; await new Promise((r) => setTimeout(r, 500))) q = pend.size ? 0 : q + 1; // модели и текстуры догрузились
    await new Promise((r) => setTimeout(r, 1500));
    const frames = Math.round(s.dur * FPS), fire = (s.fire || []).map((x) => Math.round(x * FPS));
    // шаг кадра на странице: свой цикл игры — стоп, время шагает стенд; grab — холст в кадр (в том же задании, что и отрисовка: буфер ещё не очищен)
    await page.evaluate(async (o) => {
      const C = window.__a, ph = C.ctrl && C.ctrl.recGo ? C.ctrl : C.ctrls.photo, gl = document.getElementById('c');
      window.requestAnimationFrame = () => 0;
      await new Promise((r) => setTimeout(r, 100));
      let now = performance.now() + 1000;
      const oc = document.createElement('canvas'), ox = oc.getContext('2d');
      window.__recStep = (fire) => { if (fire) ph.onKey({ code: 'KeyF', preventDefault() {} }, true); window.__frame((now += 1000 / o.FPS)); };
      window.__recGrab = async (i) => {
        if (oc.width !== gl.width) { oc.width = gl.width; oc.height = gl.height; }
        ox.drawImage(gl, 0, 0);
        const b = await new Promise((r) => oc.toBlob(r, 'image/jpeg', 0.96));
        await fetch(`/__frame?d=${o.dir}&n=${i}`, { method: 'POST', body: b });
      };
      for (let i = 0; i < 90; i++) window.__recStep(false); // 1,5 с стоп-кадра: камера доехала до объекта, сглаживание кадров устоялось
      ph.recGo();
    }, { FPS, dir: s.dir });
    if (s.shot.hud) { // интерфейс боя — HTML поверх холста: снимок страницы целиком после каждого шага
      await Deno.mkdir(`${OUT}/${s.dir}`, { recursive: true });
      for (let i = 0; i < frames; i++) {
        await page.evaluate((f) => window.__recStep(f), fire.includes(i));
        await page.screenshot({ path: `${OUT}/${s.dir}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 96 });
      }
    } else await page.evaluate(async (o) => { for (let i = 0; i < o.frames; i++) { window.__recStep(o.fire.includes(i)); await window.__recGrab(i); } }, { frames, fire });
    console.log(`${s.dir}: ${frames} кадров · ${Math.round((Date.now() - t0) / 1000)} с`);
  } catch (e) { console.log(`${s.dir}: ошибка — ${e.message}`); }
  await page.close();
}

// финальная карточка (1920×1080): последний кадр последней сцены размыт и притемнён, лого (img/og-logo.jpg, чёрное — «экраном»), название, ссылка
async function card(browser) {
  const dirs = [...Deno.readDirSync(OUT)].filter((e) => e.isDirectory && /^\d\d-/.test(e.name)).map((e) => e.name).sort();
  if (!dirs.length) return;
  const last = dirs[dirs.length - 1], fr = [...Deno.readDirSync(`${OUT}/${last}`)].map((e) => e.name).filter((n) => n.endsWith('.jpg')).sort().pop();
  const bg = `data:image/jpeg;base64,${encodeBase64(Deno.readFileSync(`${OUT}/${last}/${fr}`))}`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/__blank`); // своё происхождение — шрифты и лого грузятся без CORS
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Oswald; font-weight: 400 700; src: url(http://127.0.0.1:${PORT}/fortuna-bot-web/games/airdef/fonts/oswald-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
    @font-face { font-family: Oswald; font-weight: 400 700; src: url(http://127.0.0.1:${PORT}/fortuna-bot-web/games/airdef/fonts/oswald-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F; }
    html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#000}
    .bg{position:absolute;inset:-40px;background:url(${bg}) center/cover;filter:blur(18px) brightness(.38) saturate(.85)}
    .c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f2efe6;font-family:Oswald,sans-serif;text-align:center}
    .logo{width:560px;height:557px;background:url(http://127.0.0.1:${PORT}/fortuna-bot-web/img/og-logo.jpg) center/contain no-repeat;mix-blend-mode:screen;filter:contrast(1.35) brightness(.92);-webkit-mask-image:radial-gradient(closest-side,#000 62%,transparent 100%);mask-image:radial-gradient(closest-side,#000 62%,transparent 100%);margin:-120px 0 -150px} /* чёрный фон лого (JPEG — не чистый чёрный) не виден квадратом */
    h1{font-size:104px;font-weight:700;letter-spacing:2px;margin:0;text-transform:uppercase;text-shadow:0 4px 24px rgba(0,0,0,.6)}
    p{font-size:38px;font-weight:400;margin:14px 0 0;opacity:.9;letter-spacing:1px}
    .u{margin-top:34px;font-size:44px;font-weight:500;color:#f0b44c;letter-spacing:1.5px}
  </style></head><body><div class="bg"></div><div class="c"><div class="logo"></div><h1>Air Superiority Online</h1>
    <p>Авиация · ПВО · Мульти-волна · Онлайн</p><div class="u">fortunawtm.com/airsuperiority</div></div></body></html>`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/card.png` });
  await page.close();
}

const queue = [...LIST];
await Promise.all(Array.from({ length: PAR }, async () => { const b = await launch(); for (let s; (s = queue.shift());) await record(s, b); await b.close(); }));
{ const b = await launch(); await card(b); await b.close(); }
await server.shutdown();
Deno.writeTextFileSync(`${OUT}/scenes.json`, JSON.stringify(SCENES.map((s, i) => ({ dir: `${String(i + 1).padStart(2, '0')}-${s.id}`, cap: s.cap, dur: s.dur }))));
