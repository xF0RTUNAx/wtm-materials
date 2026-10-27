// Проверка отчёта о вылете: бой → сбой вкладки (CDP Page.crash) → перезагрузка → окно «Игра закрылась с ошибкой» → «Отправить»
import puppeteer from 'npm:puppeteer-core@22.15.0';
const H = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('fortuna_airdef_lang', 'ru'); localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 2, side: 'east' })); });
  await page.goto('http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?touch=1&go=air&weather=day', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('playing'), { timeout: 180000, polling: 500 });
  await new Promise((r) => setTimeout(r, 7000));
  console.log('запись в бою:', (await page.evaluate(() => sessionStorage.getItem('fortuna_ad_alive') || '')).slice(0, 160));
  const cdp = await page.target().createCDPSession();
  try { await cdp.send('Page.crash'); } catch (_) { /* вкладка упала — так и надо */ }
  await new Promise((r) => setTimeout(r, 1500));
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForFunction(() => document.getElementById('netModal') && document.getElementById('netModal').classList.contains('on'), { timeout: 120000, polling: 500 });
  console.log('окно:', await page.evaluate(() => document.getElementById('netModal').innerText.replace(/\s+/g, ' ').slice(0, 300)));
  await page.screenshot({ path: `${H}/crash-dlg.png` });
  await page.evaluate(() => document.querySelector('#netModal [data-cr="0"]').click());
  await new Promise((r) => setTimeout(r, 2500));
  console.log('после «Отправить»:', await page.evaluate(() => ({ modal: document.getElementById('netModal').classList.contains('on'), msg: (document.getElementById('msg') || {}).textContent })));
  if (errs.length) console.log('ошибки:', errs.slice(0, 3));
} finally { await browser.close(); }
