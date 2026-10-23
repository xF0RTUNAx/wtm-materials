// Город: сжатые текстуры (KTX2) против JPEG (?ktx=0) — снимки с трёх точек (над постройками 150 м, вид лётчика 1,5 км, дальние «коробки»).
//   deno run -A tools/airdef-perf/city-ab.js [пресет = medium] [map = city]  → city-ab/<точка>-{jpeg,ktx}.png и разница
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'medium', map = 'city'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
Deno.mkdirSync('city-ab', { recursive: true });
const VIEWS = [['near', 150, 260, 0.35], ['pilot', 1500, 1500, 0.9], ['far', 900, 6000, 1]];
for (const [tag, q] of [['jpeg', '&ktx=0'], ['ktx', '']]) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=air${q}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 5000));
  for (const [v, h, d, look] of VIEWS) {
    const url = await page.evaluate((h, d, look) => {
      window.requestAnimationFrame = () => 0; const C = window.__a, cam = C.camera, ctrl = C.ctrl; ctrl.afterRender = () => {}; ctrl.extraCam = () => null;
      const c = C.city.objects[0], gy = C.city.groundH(c.x, c.z); // первый объект — постройки вокруг, город рядом
      ctrl.camera = () => { cam.position.set(c.x - d, gy + h, c.z - d * 0.3); cam.lookAt(c.x, gy + h * (1 - look), c.z); cam.updateMatrixWorld(); };
      let t = window.__t || performance.now(); for (let i = 0; i < 90; i++) { t += 1000 / 60; C.paused = false; window.__frame(t); } window.__t = t; // догрузка ближних моделей
      return C.renderer.domElement.toDataURL('image/png');
    }, h, d, look);
    Deno.writeFileSync(`city-ab/${v}-${tag}.png`, Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)));
  }
  await page.close();
}
await browser.close();
for (const [v] of VIEWS) {
  const raw = (f) => new Deno.Command('ffmpeg', { args: ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout: 'piped' }).outputSync().stdout;
  const a = raw(`city-ab/${v}-jpeg.png`), b = raw(`city-ab/${v}-ktx.png`); let se = 0, n8 = 0;
  for (let i = 0; i < a.length; i += 3) { let m = 0; for (let c = 0; c < 3; c++) { const x = Math.abs(a[i + c] - b[i + c]); se += x * x; if (x > m) m = x; } if (m > 8) n8++; }
  const psnr = se ? 10 * Math.log10(255 * 255 / (se / a.length)) : 99;
  console.log(v, 'PSNR', psnr.toFixed(1), 'дБ, пикселей с разницей > 8:', (100 * n8 / (a.length / 3)).toFixed(2), '%');
}
