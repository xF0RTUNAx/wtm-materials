// Снимок боя в горизонтали телефона: deno run -A shot.js <go=air|multi|defense> <out.png> [ждать с=10] [Q доп. параметры]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [go = 'air', out = 'shot.png', secS = '10', extra = ''] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=844,390', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((g) => { localStorage.setItem('fortuna_airdef_perfhud', '1'); localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: g, diff: 'arcade', era: 3, side: 'east', mrole: 'atk' })); localStorage.setItem('fortuna_airdef_gfx', 'medium'); }, go);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&go=${go}&weather=day&insets=0,47,21,47${extra}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  await new Promise((r) => setTimeout(r, +secS * 1000));
  if (Deno.env.get('CHIP')) await page.evaluate((multi) => { document.body.classList.add('netOn'); document.getElementById('plBtn').innerHTML = '<svg class="ic" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#fff"/></svg>'; document.getElementById('netChip').innerHTML = '<b>3:12</b><small class="mid">164 мс · PL 0%</small>'; if (multi) { const d = document.getElementById('dtop'); d.innerHTML = 'Раунд 1/2 · ваша волна · разрушено <b>0%</b> · <b>время ×3</b>'; } window.__a.extraHud = null; }, go === 'multi');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: out });
  console.log(await page.evaluate(() => document.getElementById('perf').textContent));
  if (errs.length) console.log('ошибки:', errs.slice(0, 3));
} finally { await browser.close(); }
