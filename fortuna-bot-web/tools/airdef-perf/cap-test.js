import puppeteer from 'npm:puppeteer-core@22.15.0';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--window-size=915,412'] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', 'medium'); });
  await page.goto('http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=city&weather=day&go=air', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  const res = await page.evaluate(() => {
    const C = window.__a, R = C.renderer; window.requestAnimationFrame = () => 0; // свой ход кадров
    const run = (hz, cap) => { if (cap !== undefined) C.setFpsCap(cap); let t = performance.now() + 1000; const f0 = R.info.render.frame; const n = Math.round(hz * 2); for (let i = 0; i < n; i++) { t += 1000 / hz; C.paused = false; window.__frame(t); } return ((R.info.render.frame - f0) / 2).toFixed(1); };
    return { 'авто, 60 Гц': run(60, 'auto'), 'авто, 90 Гц': run(90), 'авто, 120 Гц': run(120), 'авто, 144 Гц': run(144), '45, 90 Гц': run(90, 45), '45, 60 Гц': run(60), '30, 120 Гц': run(120, 30), 'возврат авто': (C.setFpsCap('auto'), 'ok') };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await browser.close(); }
