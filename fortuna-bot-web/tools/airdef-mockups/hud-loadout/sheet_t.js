import puppeteer from 'npm:puppeteer-core@22.15.0';
const OUT = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-mockups/hud-loadout/shots/', URL0 = 'http://127.0.0.1:8937/fortuna-bot-web/tools/airdef-mockups/hud-loadout/index.html';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
try { for (const [s, name] of [['t', 'лист_табло_читаемость']]) { const p = await b.newPage(); await p.setViewport({ width: 1260, height: 500, deviceScaleFactor: 3 });
  p.on('response', (x) => { if (x.status() >= 400) console.log('HTTP', x.status(), x.url()); });
  await p.goto(URL0 + '?s=' + s, { waitUntil: 'load' }); await p.waitForFunction(() => window.__ready, { timeout: 30000 }); await p.screenshot({ path: OUT + name + '.png', fullPage: true }); await p.close(); } } finally { await b.close(); }
