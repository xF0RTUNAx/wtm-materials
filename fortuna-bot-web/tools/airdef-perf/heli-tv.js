// Окно «ТВ» у вертолёта на телефоне (Telegram в полный экран): вид экрана и окна на всех увеличениях — не налезает ли окно на кнопки
// (подскок и др.), видна ли картинка (не белая по краям, не чёрная на большом увеличении).
//   deno run -A tools/airdef-perf/heli-tv.js [папка = .] [эпоха = 3] [подвеска = 17 (Ми-28Н)] [погода] [пресет = medium] [телефон 1 / ПК 0] [экран = 915x412] [вырез t,r,b,l,tg = 0,0,0,0,88]
//   (setup.side — сторона обороны: летим за восток; кнопка «ПОНЯЛ» показывается принудительно — видно, не закрывает ли её окно)
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [out = '.', era = '3', lo = '17', wx = '', preset = 'medium', touch = '1', size = '915x412', ins = '0,0,0,0,88'] = Deno.args;
const [VW, VH] = size.split('x').map(Number);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${VW},${VH}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 400)); }); // ошибки шейдеров WebGL — только в консоли
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 2.625, isMobile: touch === '1', hasTouch: touch === '1', isLandscape: true });
  await page.evaluateOnNewDocument((era, lo, p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: +era, side: 'west', lo: +lo })); localStorage.setItem('fortuna_airdef_gfx', p); }, era, lo, preset);
  // Telegram во весь экран: сверху его кнопки (insets t=0, tg=88 — как у тестера)
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1${touch === '1' ? '&touch=1' : ''}&go=air&hlo=${lo}&insets=${ins}${wx ? '&weather=' + wx : ''}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 6000));
  const info = await page.evaluate(() => { const C = window.__a, a = C.ctrl; if (!a.pod.show) a.podView(); return { heli: !!(a.craft && a.craft.heli), plane: a.craft && a.craft.model, night: C.NIGHT, wx: C.weatherKey }; });
  await new Promise((r) => setTimeout(r, 1000)); info.gain = await page.evaluate(() => [window.__a.ctrl.pod.gain, window.__a.ctrl.pod.lum].map((v) => +(+v).toFixed(2)));
  await page.evaluate(() => document.getElementById('rwrAck').classList.add('on')); await new Promise((r) => setTimeout(r, 500));
  const rects = await page.evaluate(() => Object.fromEntries(['podBox', 'tPop', 'tMap', 'tAuto', 'tLook', 'tHelp', 'rwrAck', 'pause'].map((id) => { const e = document.getElementById(id), r = e && e.getBoundingClientRect(); return [id, r && r.width ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null]; })));
  for (let z = 0; z < 4; z++) {
    await page.evaluate((z) => { window.__a.ctrl.pod.zi = z; }, z); await new Promise((r) => setTimeout(r, 1500));
    Deno.writeFileSync(`${out}/heli-tv-z${z}.png`, await page.screenshot({ type: 'png' }));
  }
  console.log(JSON.stringify({ info, rects, errs }));
} finally { await browser.close(); }
