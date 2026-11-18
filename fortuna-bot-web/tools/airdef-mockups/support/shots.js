// Снимки макетов поддержки: каждый кадр отдельным PNG (×3) + вся страница. Сервер 8935, один браузер.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const OUT = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-mockups/support/shots/s_', URL0 = 'http://127.0.0.1:8935/fortuna-bot-web/tools/airdef-mockups/support/index.html';
Deno.mkdirSync(OUT.replace(/room_$/, ''), { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--window-size=1400,900'] });
try {
  const p = await b.newPage(); await p.setViewport({ width: 1800, height: 900, deviceScaleFactor: 2 }); const errs = [];
  p.on('pageerror', (e) => errs.push('ERR ' + e.message)); p.on('requestfailed', (r) => errs.push('404 ' + r.url().split('/').pop()));
  p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().split('/').pop()); });
  await p.goto(URL0, { waitUntil: 'load' }); await p.waitForFunction(() => window.__ready, { timeout: 30000 });
  const ids = await p.$$eval('.ph, .tg', (a) => a.map((e) => e.id));
  for (const id of ids) { const el = await p.$('#' + id); await el.screenshot({ path: OUT + id.slice(2) + '.png' }); }
  await p.screenshot({ path: OUT + 'all.png', fullPage: true });
  console.log(ids.join(' '), '|', errs.join(' | ') || 'ошибок нет');
} finally { await b.close(); }
