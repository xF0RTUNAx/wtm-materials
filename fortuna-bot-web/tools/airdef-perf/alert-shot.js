// Плашка тревоги («Угроза баллистических ракет») против подписи комплекса слева (#opInfo) и верхних кнопок — на разных экранах
// (Mark 2026-10-27: «налезает на другой текст»). Оборона, комплекс с самой длинной подписью, вид оператора и карта; снимки — в out/.
// deno run -A tools/airdef-perf/alert-shot.js [out=/tmp/alert] [only=iphone14,ipad]   (нужен сервер :8937 — launch.json «fortuna-nocache»)
import puppeteer from 'npm:puppeteer-core@22.15.0';
const out = Deno.args[0] || '/tmp/alert', only = (Deno.args.find((a) => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);
await Deno.mkdir(out, { recursive: true });
// экраны в горизонтали: ширина × высота (CSS px), ?insets= игры (только ?test=1): верх, право, низ, лево[, Telegram сверху]
const DEV = [
  ['se', 667, 375, '0,0,0,0', 1], ['iphone14', 844, 390, '0,47,21,47', 1], ['promax', 932, 430, '0,59,21,59', 1], ['tg', 844, 390, '0,47,21,47,46', 1],
  ['android', 800, 360, '0,0,0,0', 1], ['ipad', 1180, 820, '24,0,20,0', 1], ['ipadmini', 1133, 744, '24,0,20,0', 1], ['desktop', 1440, 860, '0,0,0,0', 0], ['narrow', 1024, 600, '0,0,0,0', 0],
];
const UNITS = ['s400', 's300', 'pac3', 'buk', 'zsu234', 'igla'];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  for (const [name, w, h, ins, touch] of DEV) {
    if (only.length && !only.includes(name)) continue;
    const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: !!touch, hasTouch: !!touch, isLandscape: true });
    await page.evaluateOnNewDocument(() => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'defense', diff: 'arcade', era: 4, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', 'low'); localStorage.setItem('fortuna_airdef_auto', '1'); });
    const ab = `&insets=${ins}`;
    await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1${touch ? '&touch=1' : ''}&go=defense&weather=day${ab}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
    const keys = await page.evaluate((list) => {
      const C = window.__a, D = C.ctrls.defense, S = C.S, out = [];
      for (const k of list) { const u = S.addUnit(k, 600 + out.length * 300, 900, { skill: 1 }); if (u) { u.owner = 0; out.push(k); } }
      if (C.syncUnits) C.syncUnits(); D.startWave();
      return out;
    }, UNITS.filter((k) => true));
    for (const view of ['op', 'map']) {
      for (const k of view === 'op' ? keys : [keys[0]]) {
        await page.evaluate((k, view, alert) => {
          const C = window.__a, D = C.ctrls.defense, u = C.S.units.find((q) => q.key === k);
          if (D.st.op) D.leaveOp();
          if (view === 'op') { D.enterOp(u); if (u.S.abm) C.S.setTgt(u, ['tbm']); }
          D.st.alert = alert; D.st.alertT = 99; D.st.alertTb = true;
        }, k, view, 'Угроза баллистических ракет');
        await new Promise((r) => setTimeout(r, 900));
        const file = `${out}/${name}-${view}-${k}.png`; await page.screenshot({ path: file });
        const box = await page.evaluate(() => { const r = (id) => { const e = document.getElementById(id); if (!e || !e.offsetParent) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }; return { opInfo: r('opInfo'), dtop: r('dtop'), pause: r('pause'), netChip: r('netChip'), alert: window.__a.alertBox || null }; });
        console.log(name, view, k, JSON.stringify(box));
      }
    }
    if (errs.length) console.log(name, 'ошибки:', errs.slice(0, 3));
    await page.close();
  }
} finally { await browser.close(); }
