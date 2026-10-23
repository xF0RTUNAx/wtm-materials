// Взрыв в игре: новый лист (тип по R) против прежнего (?exnew=0) — кадры серии с одной точки
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [R = '47', kind = 'bomb', preset = 'high', dist = '900'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const run = async (flag, tag) => {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=city&weather=day&go=air${flag}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 120; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 3000));
  // свой ход кадров: камера и взрыв детерминированно
  await page.evaluate((R, kind, dist) => {
    window.requestAnimationFrame = () => 0; const C = window.__a, cam = C.camera, f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
    const x = cam.position.x + f.x * dist, z = cam.position.z + f.z * dist, p = new THREE.Vector3(x, C.city.groundH(x, z), z);
    window.__t = performance.now(); C.fx.explosion(p, +R, kind); window.__ex = p;
    const cm = window.__cam = new THREE.PerspectiveCamera(50, C.renderer.domElement.width / C.renderer.domElement.height, 2, 30000); cm.layers.enableAll();
    const sd = +R * 11; cm.position.set(p.x - f.z * sd, p.y + (kind === 'air' ? 0 : 0.35 * sd), p.z + f.x * sd); cm.lookAt(p.x, p.y + (kind === 'air' ? 0 : +R * 1.3), p.z); cm.updateMatrixWorld();
  }, R, kind, +dist);
  const out = [];
  for (const tt of [0.15, 0.5, 1.0, 1.8, 2.8, 4.5]) {
    await page.evaluate((tt) => { const C = window.__a; while (window.__t < window.__t0 + tt * 1000 || !window.__t0) { if (!window.__t0) window.__t0 = window.__t; window.__t += 1000 / 60; C.paused = false; window.__frame(window.__t); }
      const R = C.renderer; R.setRenderTarget(null); R.render(C.scene, window.__cam); }, tt);
    out.push(await page.screenshot({ type: 'png' }));
  }
  await page.close(); return { out, errs };
};
const A = await run('&exnew=0', 'old'), B = await run('', 'new');
Deno.mkdirSync('ex', { recursive: true });
A.out.forEach((b, i) => Deno.writeFileSync(`ex/old-${i}.png`, b)); B.out.forEach((b, i) => Deno.writeFileSync(`ex/new-${i}.png`, b));
console.log('ошибки:', [...A.errs, ...B.errs].slice(0, 3));
await browser.close();
