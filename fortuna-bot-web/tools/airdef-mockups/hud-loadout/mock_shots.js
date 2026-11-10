// Снимки макетов: каждый кадр телефона отдельным PNG (×3) + вся страница. Сервер 8937.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const OUT = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-mockups/hud-loadout/shots/', URL0 = 'http://127.0.0.1:8937/fortuna-bot-web/tools/airdef-mockups/hud-loadout/index.html';
Deno.mkdirSync(OUT, { recursive: true });
const only = Deno.args.filter((a) => !a.startsWith('--'));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--window-size=1400,900'] });
try {
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 900, deviceScaleFactor: 3 }); const errs = [];
  p.on('pageerror', (e) => errs.push('ERR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('CON ' + m.text().slice(0, 200)); });
  await p.goto(URL0, { waitUntil: 'load' }); await p.waitForFunction(() => window.__ready, { timeout: 30000 });
  const ids = await p.$$eval('.ph', (a) => a.map((e) => e.id));
  for (const id of ids) { if (only.length && !only.some((o) => id === 'f_' + o || id === 'f_' + o + '2')) continue; const el = await p.$('#' + id); await el.screenshot({ path: OUT + id.slice(2) + '.png' }); }
  console.log(ids.join(' '), '|', errs.join(' | ') || 'ошибок нет');
} finally { await b.close(); }
