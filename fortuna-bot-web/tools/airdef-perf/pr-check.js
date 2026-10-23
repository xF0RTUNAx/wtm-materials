// Чёткость на телефоне: prCap по пресету и настройке «Чёткость»
import puppeteer from 'npm:puppeteer-core@22.15.0';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--window-size=915,412'] });
try {
  for (const [gfx, sharp] of [['low', 'auto'], ['medium', 'auto'], ['high', 'auto'], ['ultra', 'auto'], ['medium', 'high'], ['ultra', 'high'], ['ultra', 'native']]) {
    const page = await browser.newPage(); await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: true });
    await page.evaluateOnNewDocument((g, s) => { localStorage.setItem('fortuna_airdef_gfx', g); localStorage.setItem('fortuna_airdef_sharp', s); }, gfx, sharp);
    await page.goto('http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1', { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__a && window.__a.state === 'menu', { timeout: 180000, polling: 500 });
    console.log(gfx.padEnd(7), sharp.padEnd(7), JSON.stringify(await page.evaluate(() => ({ prCap: window.__a.P.prCap, pr: +window.__a.renderer.getPixelRatio().toFixed(3) }))));
    await page.close();
  }
} finally { await browser.close(); }
