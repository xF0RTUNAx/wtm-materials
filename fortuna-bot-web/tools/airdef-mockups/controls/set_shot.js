// Кадр экрана настроек на разделе «Управление» - образец стиля для макетов. Сервер 8935.
import puppeteer from 'npm:puppeteer-core@22.15.0';
const OUT = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-mockups/controls/', BASE = 'http://127.0.0.1:8935/fortuna-bot-web/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await p.evaluateOnNewDocument(() => localStorage.setItem('fortuna_airdef_muted', '1'));
  await p.goto(`${BASE}games/airdef.html?test=1&touch=1&insets=0,47,21,47&gfx=high&rmock=1`, { waitUntil: 'load', timeout: 120000 });
  await sleep(20000);
  await p.evaluate(() => { const b = document.querySelector('#mtabs button[data-tab="set"]'); b && b.click(); });
  await sleep(1500);
  await p.evaluate(() => { const h = [...document.querySelectorAll('#tab-set .cat-h')].find((e) => /Управление/.test(e.textContent)); h && h.scrollIntoView(); });
  await sleep(600); await p.screenshot({ path: OUT + 'settings_now.png' });
  await p.evaluate(() => { const h = [...document.querySelectorAll('#tab-set .sub')].find((e) => /Самолёт/.test(e.textContent)); h && h.scrollIntoView(); });
  await sleep(600); await p.screenshot({ path: OUT + 'settings_now2.png' });
} finally { await b.close(); }
