// Снимки экрана итогов (?endmock=…) на телефоне в горизонтали: deno run -A endmock.js <префикс> [вид=solo-win,ol-win]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [pre = 'e', kinds = 'solo-win,ol-win'] = Deno.args, H = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  for (const k of kinds.split(',')) {
    const page = await browser.newPage();
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
    await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&weather=day&insets=0,47,21,47&endmock=${k}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('endOn'), { timeout: 180000, polling: 500 });
    await new Promise((r) => setTimeout(r, 5000));
    await page.screenshot({ path: `${H}/${pre}-${k}.png` }); console.log(`${H}/${pre}-${k}.png`);
    await page.close();
  }
} finally { await browser.close(); }
